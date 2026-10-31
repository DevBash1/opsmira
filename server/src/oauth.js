// OAuth 2.1 for MCP clients that sign in instead of sending a token header: claude.ai on the web, Claude Desktop and
// mobile, and Claude Code when it is not given a header. This console is the authorization server for its own MCP
// endpoint (docs/mcp.md):
//   discovery       /.well-known/oauth-protected-resource[/mcp] (RFC 9728), /.well-known/oauth-authorization-server (RFC 8414)
//   clients         a Client ID Metadata Document (the client_id is an https URL to it), or Dynamic Client Registration (RFC 7591)
//   approval        /oauth/authorize: the owner signs in to the console and chooses the access, PKCE S256 required
//   tokens          /oauth/token: an hour-long access token and a refresh token that rotates on every use
// A grant shows in the console's list of MCP connections and is revoked there like a token.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { lookup } from "dns/promises";
import { readFileSync, renameSync, writeFileSync } from "fs";
import { isIP } from "net";
import { join } from "path";
import express from "express";
import { checkLogin, clearLoginFailures, issueSessionCookie, loginBlockedFor, noteLoginFailure, sessionIdFromRequest } from "./auth.js";
import { env } from "./env.js";
import { MCP_PATH, issueOAuthGrant, refreshOAuthGrant } from "./mcp.js";

const CODE_TTL_MS = 10 * 60_000;
const REQUEST_TTL_MS = 30 * 60_000;
const MAX_CLIENTS = 500;
const REGISTRATIONS_PER_IP_HOUR = 20;
const CIMD_CACHE_MS = 60 * 60_000;
const CIMD_MAX_BYTES = 64 * 1024;
// Tests serve client metadata from 127.0.0.1 over http; nothing else should ever set this.
const CIMD_ALLOW_LOCAL = process.env.OPSMIRA_OAUTH_TEST_LOCAL_CIMD === "1";

const base = (req) => `${req.protocol}://${req.get("host")}`;
const resourceOf = (req) => `${base(req)}${MCP_PATH}`;
const b64sha = (value) => createHash("sha256").update(value).digest("base64url");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* ---------------- clients ---------------- */
const FILE = join(env.dataDir, "oauth-clients.json");
let clients = (() => {
  try {
    const saved = JSON.parse(readFileSync(FILE, "utf8"));
    return Array.isArray(saved.clients) ? saved.clients : [];
  } catch {
    return [];
  }
})();
function save() {
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify({ clients }, null, 2), { mode: 0o600 });
  renameSync(tmp, FILE);
}

const loopback = (u) => u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
/** A redirect URI a client may register: https anywhere, or http on this computer (native apps such as Claude Code). */
function acceptableRedirect(uri) {
  try {
    const u = new URL(uri);
    return !u.hash && (u.protocol === "https:" || loopback(u));
  } catch {
    return false;
  }
}
/** Exact match, except a loopback redirect matches on any port (RFC 8252 7.3; Claude Code picks a port per session). */
function redirectMatches(registered, uri) {
  if (registered.includes(uri)) return true;
  let u;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (!loopback(u)) return false;
  return registered.some((r) => {
    try {
      const x = new URL(r);
      return loopback(x) && x.hostname === u.hostname && x.pathname === u.pathname && x.search === u.search;
    } catch {
      return false;
    }
  });
}

const registeredBy = new Map(); // ip -> times
function register(req, res) {
  cors(res);
  const ip = req.ip;
  const hour = Date.now() - 60 * 60_000;
  const times = (registeredBy.get(ip) ?? []).filter((t) => t > hour);
  if (times.length >= REGISTRATIONS_PER_IP_HOUR) return res.status(429).json({ error: "slow_down", error_description: "Too many registrations from this address." });
  const body = req.body ?? {};
  const redirects = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u) => typeof u === "string").slice(0, 10) : [];
  if (!redirects.length || !redirects.every(acceptableRedirect)) {
    return res.status(400).json({ error: "invalid_redirect_uri", error_description: "redirect_uris must be https URLs, or http on localhost or 127.0.0.1." });
  }
  times.push(Date.now());
  registeredBy.set(ip, times);
  const client = {
    client_id: `opsmira_client_${randomBytes(16).toString("base64url")}`,
    client_name: typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim().slice(0, 60) : "MCP client",
    redirect_uris: redirects,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  clients.push(client);
  // Registration is open by design (that is what lets claude.ai connect), so keep the list bounded: the oldest
  // clients that never finished a sign-in go first.
  if (clients.length > MAX_CLIENTS) {
    const unused = clients.findIndex((c) => !c.lastUsedAt);
    clients.splice(unused >= 0 ? unused : 0, 1);
  }
  save();
  // Public client: no secret, PKCE protects the code (whatever auth method was asked for, this is what it gets).
  res.status(201).json({
    client_id: client.client_id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  });
}

/* Client ID Metadata Documents: the client_id is the https URL of a JSON document naming the client and its
   redirect URIs. Fetching a URL a stranger hands in is a request-forgery risk, so: https on the default port only,
   never an address inside a private network, no redirects, a size and time limit, and a cache. */
const cimdCache = new Map();
function privateAddress(addr) {
  if (isIP(addr) === 4) {
    const [a, b] = addr.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = addr.toLowerCase();
  if (v6.startsWith("::ffff:")) return privateAddress(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}
async function metadataClient(clientId) {
  const hit = cimdCache.get(clientId);
  if (hit && Date.now() - hit.at < CIMD_CACHE_MS) return hit.client;
  const u = new URL(clientId);
  if (!CIMD_ALLOW_LOCAL) {
    if (u.protocol !== "https:" || (u.port && u.port !== "443") || u.username || u.password) throw new Error("the client_id URL must be plain https");
    const addrs = await lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => privateAddress(a.address))) throw new Error("the client_id URL points into a private network");
  }
  const res = await fetch(u, { redirect: "error", signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`the client_id URL answered ${res.status}`);
  const text = await res.text();
  if (text.length > CIMD_MAX_BYTES) throw new Error("the client metadata document is too large");
  const doc = JSON.parse(text);
  if (doc.client_id !== clientId) throw new Error("the client metadata document names a different client_id");
  const redirects = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.filter((r) => typeof r === "string" && acceptableRedirect(r)) : [];
  if (!redirects.length) throw new Error("the client metadata document lists no usable redirect_uris");
  const client = { client_id: clientId, client_name: typeof doc.client_name === "string" ? doc.client_name.slice(0, 60) : u.hostname, redirect_uris: redirects, metadataHost: u.hostname };
  cimdCache.set(clientId, { client, at: Date.now() });
  return client;
}

async function findClient(clientId) {
  if (typeof clientId !== "string" || !clientId) return null;
  if (/^https?:\/\//.test(clientId)) return metadataClient(clientId);
  return clients.find((c) => c.client_id === clientId) ?? null;
}

/* ---------------- metadata ---------------- */
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, MCP-Protocol-Version");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function resourceMetadata(req, res) {
  cors(res);
  res.json({ resource: resourceOf(req), authorization_servers: [base(req)], scopes_supported: ["opsmira"], bearer_methods_supported: ["header"], resource_name: "Opsmira" });
}

function serverMetadata(req, res) {
  cors(res);
  const b = base(req);
  res.json({
    issuer: b,
    authorization_endpoint: `${b}/oauth/authorize`,
    token_endpoint: `${b}/oauth/token`,
    registration_endpoint: `${b}/oauth/register`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    scopes_supported: ["opsmira", "offline_access"],
    authorization_response_iss_parameter_supported: true,
  });
}

/* ---------------- approval ---------------- */
const requests = new Map(); // request id -> { client, redirectUri, state, challenge, resource, createdAt }
const codes = new Map(); // code -> { clientId, redirectUri, challenge, resource, access, clientName, redirectHost, expires }

function prune() {
  const now = Date.now();
  for (const [k, v] of requests) if (now - v.createdAt > REQUEST_TTL_MS) requests.delete(k);
  for (const [k, v] of codes) if (v.expires < now) codes.delete(k);
}

const csrfFor = (sessionId, requestId) => createHmac("sha256", env.sessionSecret).update(`oauth:${sessionId}:${requestId}`).digest("base64url");

function sameResource(asked, req) {
  if (!asked) return true;
  try {
    const a = new URL(asked);
    const r = new URL(resourceOf(req));
    return a.protocol === r.protocol && a.host.toLowerCase() === r.host.toLowerCase() && a.pathname.replace(/\/$/, "") === r.pathname;
  } catch {
    return false;
  }
}

function page(res, status, title, body) {
  res.status(status);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
  // Nothing to other sites (the return address is one); "no-referrer" would make the browser send Origin: null on
  // this page's own form, which the cross-site check then refuses.
  res.setHeader("Referrer-Policy", "same-origin");
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · Opsmira</title><style>
:root{--bg:#f4f6f5;--card:#fff;--ink:#16201c;--muted:#5d6b65;--line:#dfe5e2;--accent:#2f8f63;--warn:#9a6a12;--warnbg:#fbf4e4}
@media (prefers-color-scheme:dark){:root{--bg:#0f1412;--card:#161d1a;--ink:#e8eeeb;--muted:#93a29b;--line:#26302c;--accent:#5fbf8c;--warn:#e0b25a;--warnbg:#2a2416}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}
.card{width:100%;max-width:460px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px}
h1{font-size:22px;line-height:1.25;margin:0 0 10px}p{margin:0 0 12px;color:var(--muted)}b{color:var(--ink)}
.mark{display:flex;align-items:center;gap:8px;font-weight:600;margin-bottom:18px;color:var(--accent)}
.dest{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:14px 0;font-size:14px}.dest code{font-size:15px;color:var(--ink)}
.warn{background:var(--warnbg);color:var(--warn);border-radius:10px;padding:10px 12px;font-size:13.5px;margin:0 0 14px}
label.opt{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:8px 0;cursor:pointer}
label.opt span{display:block;font-size:13px;color:var(--muted)}input[type=radio]{margin-top:4px}
.field{display:block;margin:10px 0}.field input{display:block;width:100%;margin-top:4px;padding:9px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font:inherit}
.row{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}button{font:inherit;border-radius:10px;padding:9px 16px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}.err{color:#c0392b;font-size:14px}
</style></head><body><main class="card"><div class="mark">◉ Opsmira</div>${body}</main></body></html>`);
}

function errorPage(res, message) {
  page(res, 400, "Can't connect", `<h1>This connection can't continue</h1><p>${esc(message)}</p><p>Start it again from the app you were connecting.</p>`);
}

function consentBody(id, r, sessionId) {
  const dest = new URL(r.redirectUri);
  const local = loopback(dest);
  const who = r.client.metadataHost ? ` <span style="font-size:13px">(identified by ${esc(r.client.metadataHost)})</span>` : "";
  return `<h1>Connect ${esc(r.client.client_name)} to Opsmira?</h1>
<p><b>${esc(r.client.client_name)}</b>${who} wants to use this console's tools for you: list and read your servers, run commands on them, and ask Opsmira's agent, within the access you choose. You can revoke it any time under Surfaces in the console.</p>
<div class="dest">After you answer, you go back to<br><code>${esc(local ? `${dest.hostname} (this computer, port ${dest.port || "80"})` : dest.host)}</code></div>
${local ? `<div class="warn">This hands the sign-in to a program on your own computer. Allow it only if you just started connecting from one, such as Claude Code.</div>` : ""}
<form method="post" action="/oauth/authorize">
<input type="hidden" name="request_id" value="${esc(id)}"><input type="hidden" name="csrf" value="${esc(csrfFor(sessionId, id))}">
<label class="opt"><input type="radio" name="access" value="ask" checked><div><b>Ask first</b><span>Reads and read-only commands. Changes Opsmira's agent proposes wait for your approval in the console.</span></div></label>
<label class="opt"><input type="radio" name="access" value="full"><div><b>Full access</b><span>Any command on servers that allow commands, and Opsmira's agent acts without asking. Every command is in Activity.</span></div></label>
<div class="row"><button type="submit" name="action" value="deny">Deny</button><button class="primary" type="submit" name="action" value="allow">Allow</button></div>
</form>`;
}

function loginBody(id, r, error) {
  return `<h1>Sign in to connect ${esc(r.client.client_name)}</h1>
<p>Sign in to this Opsmira console to decide what ${esc(r.client.client_name)} may do.</p>
${error ? `<p class="err">${esc(error)}</p>` : ""}
<form method="post" action="/oauth/authorize">
<input type="hidden" name="request_id" value="${esc(id)}">
<label class="field">Username<input name="username" autocomplete="username" required></label>
<label class="field">Password<input name="password" type="password" autocomplete="current-password" required></label>
<div class="row"><button class="primary" type="submit" name="action" value="login">Sign in</button></div>
</form>`;
}

/** Back to the client with the result: code or error, the state it sent, and who answered (RFC 9207). */
function backTo(res, req, redirectUri, params) {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries({ ...params, iss: base(req) })) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v);
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, u.toString());
}

async function authorize(req, res) {
  prune();
  const q = req.query;
  let client;
  try {
    client = await findClient(q.client_id);
  } catch (err) {
    return errorPage(res, `The app could not be identified: ${err.message}.`);
  }
  if (!client) return errorPage(res, "This app is not registered with this console.");
  const redirectUri = typeof q.redirect_uri === "string" && q.redirect_uri ? q.redirect_uri : client.redirect_uris.length === 1 ? client.redirect_uris[0] : "";
  // Until the redirect URI is known to be the client's, nothing is sent anywhere.
  if (!redirectUri || !redirectMatches(client.redirect_uris, redirectUri)) return errorPage(res, "The return address this app asked for is not one it registered.");
  const state = typeof q.state === "string" ? q.state : undefined;
  if (q.response_type !== "code") return backTo(res, req, redirectUri, { error: "unsupported_response_type", state });
  if (typeof q.code_challenge !== "string" || q.code_challenge.length < 43 || q.code_challenge_method !== "S256") {
    return backTo(res, req, redirectUri, { error: "invalid_request", error_description: "PKCE with S256 is required", state });
  }
  if (!sameResource(q.resource, req)) return backTo(res, req, redirectUri, { error: "invalid_target", error_description: "This console only issues tokens for its own MCP endpoint", state });
  const id = randomBytes(18).toString("base64url");
  requests.set(id, { client, redirectUri, state, challenge: q.code_challenge, resource: resourceOf(req), createdAt: Date.now() });
  const sessionId = sessionIdFromRequest(req);
  if (!sessionId) return page(res, 200, "Sign in", loginBody(id, requests.get(id)));
  return page(res, 200, "Connect an app", consentBody(id, requests.get(id), sessionId));
}

function decide(req, res) {
  prune();
  // A form on this page posts here; anything else sending the owner's cookie is refused.
  const origin = req.get("origin");
  let originHost = null;
  try {
    originHost = origin ? new URL(origin).host : req.get("host");
  } catch {
    // "null" or garbage: not this page
  }
  if (originHost !== req.get("host")) return errorPage(res, "That request came from another site.");
  const id = String(req.body?.request_id ?? "");
  const r = requests.get(id);
  if (!r) return errorPage(res, "This sign-in has expired.");
  const action = req.body?.action;
  if (action === "login") {
    const wait = loginBlockedFor(req.ip);
    if (wait) return page(res, 429, "Sign in", loginBody(id, r, `Too many attempts. Try again in ${Math.ceil(wait / 60)} minutes.`));
    if (!checkLogin(req.body?.username, req.body?.password)) {
      noteLoginFailure(req.ip);
      return page(res, 401, "Sign in", loginBody(id, r, "Wrong username or password."));
    }
    clearLoginFailures(req.ip);
    const sessionId = issueSessionCookie(req, res);
    return page(res, 200, "Connect an app", consentBody(id, r, sessionId));
  }
  const sessionId = sessionIdFromRequest(req);
  const csrf = Buffer.from(String(req.body?.csrf ?? ""));
  const expected = sessionId ? Buffer.from(csrfFor(sessionId, id)) : null;
  if (!expected || csrf.length !== expected.length || !timingSafeEqual(csrf, expected)) return page(res, 403, "Sign in", loginBody(id, r, "Sign in again to continue."));
  requests.delete(id);
  if (action !== "allow") return backTo(res, req, r.redirectUri, { error: "access_denied", error_description: "The owner declined", state: r.state });
  const code = randomBytes(32).toString("base64url");
  codes.set(code, {
    clientId: r.client.client_id,
    clientName: r.client.client_name,
    redirectUri: r.redirectUri,
    redirectHost: new URL(r.redirectUri).host,
    challenge: r.challenge,
    resource: r.resource,
    access: req.body?.access === "full" ? "full" : "ask",
    expires: Date.now() + CODE_TTL_MS,
  });
  const known = clients.find((c) => c.client_id === r.client.client_id);
  if (known) {
    known.lastUsedAt = new Date().toISOString();
    save();
  }
  return backTo(res, req, r.redirectUri, { code, state: r.state });
}

async function token(req, res) {
  cors(res);
  res.setHeader("Cache-Control", "no-store");
  prune();
  const b = req.body ?? {};
  const fail = (error, description, status = 400) => res.status(status).json({ error, ...(description ? { error_description: description } : {}) });
  if (b.grant_type === "authorization_code") {
    const c = codes.get(String(b.code ?? ""));
    codes.delete(String(b.code ?? "")); // one use, even a failed one
    if (!c || c.expires < Date.now()) return fail("invalid_grant", "The code is unknown, used or expired.");
    if (b.client_id !== c.clientId) return fail("invalid_grant", "The code was issued to another client.");
    if (b.redirect_uri !== undefined && b.redirect_uri !== c.redirectUri) return fail("invalid_grant", "redirect_uri does not match.");
    if (typeof b.code_verifier !== "string" || b64sha(b.code_verifier) !== c.challenge) return fail("invalid_grant", "PKCE verification failed.");
    if (b.resource !== undefined && !sameResource(b.resource, req)) return fail("invalid_target");
    return res.json(issueOAuthGrant({ clientId: c.clientId, clientName: c.clientName, access: c.access, resource: c.resource, redirectHost: c.redirectHost }));
  }
  if (b.grant_type === "refresh_token") {
    if (typeof b.refresh_token !== "string" || typeof b.client_id !== "string") return fail("invalid_request", "refresh_token and client_id are required.");
    const pair = refreshOAuthGrant(b.refresh_token, b.client_id);
    return pair ? res.json(pair) : fail("invalid_grant", "The refresh token is unknown, used, revoked or expired.");
  }
  return fail("unsupported_grant_type");
}

export function mountOAuth(app) {
  const form = express.urlencoded({ extended: false, limit: "64kb" });
  app.get(["/.well-known/oauth-protected-resource", `/.well-known/oauth-protected-resource${MCP_PATH}`], resourceMetadata);
  app.get(["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"], serverMetadata);
  app.options(["/.well-known/oauth-protected-resource", `/.well-known/oauth-protected-resource${MCP_PATH}`, "/.well-known/oauth-authorization-server", "/oauth/register", "/oauth/token"], (req, res) => {
    cors(res);
    res.status(204).end();
  });
  app.post("/oauth/register", register);
  app.get("/oauth/authorize", (req, res) => authorize(req, res).catch((err) => errorPage(res, err.message)));
  app.post("/oauth/authorize", form, decide);
  app.post("/oauth/token", form, (req, res) => token(req, res).catch(() => res.status(500).json({ error: "server_error" })));
}

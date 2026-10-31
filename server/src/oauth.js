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
import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";
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
    ...httpsUrls({ logo_uri: body.logo_uri, client_uri: body.client_uri }),
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
/** Only https URLs survive (a client's logo and home page are shown to the owner, so nothing else is fetched). */
function httpsUrls(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    try {
      if (typeof v === "string" && new URL(v).protocol === "https:") out[k] = v.slice(0, 500);
    } catch {
      // not a URL
    }
  }
  return out;
}

/** The same guard as for metadata documents: public https hosts only. Throws otherwise. */
async function publicHttps(url) {
  const u = new URL(url);
  if (CIMD_ALLOW_LOCAL) return u;
  if (u.protocol !== "https:" || (u.port && u.port !== "443") || u.username || u.password) throw new Error("not a plain https URL");
  const addrs = await lookup(u.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => privateAddress(a.address))) throw new Error("points into a private network");
  return u;
}

/* The connecting app's icon for the approval page: its logo_uri, else the icon its own site serves. Fetched here
   and inlined (the page loads nothing from elsewhere), small images only, cached for a day. */
const iconCache = new Map();
const ICON_MAX_BYTES = 200 * 1024;
async function clientIcon(client) {
  const candidates = [];
  if (client.logo_uri) candidates.push(client.logo_uri);
  const site = client.client_uri ?? (client.metadataHost ? `https://${client.metadataHost}` : null);
  if (site) for (const path of ["/apple-touch-icon.png", "/favicon.svg", "/favicon.ico"]) candidates.push(new URL(path, site).toString());
  const key = candidates.join(" ");
  if (!key) return null;
  const hit = iconCache.get(key);
  if (hit && Date.now() - hit.at < 24 * CIMD_CACHE_MS) return hit.icon;
  let icon = null;
  for (const url of candidates) {
    try {
      const u = await publicHttps(url);
      const res = await fetch(u, { redirect: "error", signal: AbortSignal.timeout(4000) });
      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!res.ok || !/^image\/(png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(type)) continue;
      const bytes = Buffer.from(await res.arrayBuffer());
      if (!bytes.length || bytes.length > ICON_MAX_BYTES) continue;
      icon = `data:${type};base64,${bytes.toString("base64")}`;
      break;
    } catch {
      // try the next one
    }
  }
  iconCache.set(key, { icon, at: Date.now() });
  return icon;
}

/** Opsmira's own mark, drawn inline. */
const OPSMIRA_MARK = (() => {
  for (const file of [join(env.webDir, "favicon.svg"), join(env.agentDir, "..", "public", "favicon.svg")]) {
    try {
      // drop the fixed size from the outer <svg> only, so it fills its box (the shapes inside keep theirs)
      if (existsSync(file)) return readFileSync(file, "utf8").replace(/<\?xml[^>]*>/, "").replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\s(width|height)="\d+"/g, ""));
    } catch {
      // next
    }
  }
  return "";
})();

async function metadataClient(clientId) {
  const hit = cimdCache.get(clientId);
  if (hit && Date.now() - hit.at < CIMD_CACHE_MS) return hit.client;
  let u;
  try {
    u = await publicHttps(clientId);
  } catch (err) {
    throw new Error(`the client_id URL ${err.message}`);
  }
  const res = await fetch(u, { redirect: "error", signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`the client_id URL answered ${res.status}`);
  const text = await res.text();
  if (text.length > CIMD_MAX_BYTES) throw new Error("the client metadata document is too large");
  const doc = JSON.parse(text);
  if (doc.client_id !== clientId) throw new Error("the client metadata document names a different client_id");
  const redirects = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.filter((r) => typeof r === "string" && acceptableRedirect(r)) : [];
  if (!redirects.length) throw new Error("the client metadata document lists no usable redirect_uris");
  const client = { client_id: clientId, client_name: typeof doc.client_name === "string" ? doc.client_name.slice(0, 60) : u.hostname, redirect_uris: redirects, metadataHost: u.hostname, ...httpsUrls({ logo_uri: doc.logo_uri, client_uri: doc.client_uri }) };
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

const ICONS = {
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  terminal: '<path d="m5 7 5 5-5 5"/><path d="M12 19h7"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  back: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3z"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
};
const icon = (name) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

function page(res, status, title, body) {
  const nonce = randomBytes(16).toString("base64");
  res.status(status);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Frame-Options", "DENY");
  // Inline only: the page's own styles, its one script (by nonce), and images it carries as data: URIs.
  res.setHeader("Content-Security-Policy", `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src data:; frame-ancestors 'none'; base-uri 'none'`);
  // Nothing to other sites (the return address is one); "no-referrer" would make the browser send Origin: null on
  // this page's own form, which the cross-site check then refuses.
  res.setHeader("Referrer-Policy", "same-origin");
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${esc(title)} · Opsmira</title><style>
:root{--bg:#f3f6f4;--card:#ffffff;--ink:#15201b;--muted:#5b6a63;--soft:#eef3f0;--line:#dde5e1;--accent:#2f8f63;--accent-ink:#ffffff;--ring:rgba(47,143,99,.18);--warn:#8a5d0b;--warnbg:#fbf3e1;--danger:#b8402f;--shadow:0 1px 2px rgba(16,32,24,.06),0 12px 32px rgba(16,32,24,.08)}
@media (prefers-color-scheme:dark){:root{--bg:#0d1210;--card:#141b18;--ink:#e7eeea;--muted:#92a39b;--soft:#1a2320;--line:#25302b;--accent:#5fbf8c;--accent-ink:#0b1310;--ring:rgba(95,191,140,.2);--warn:#e2b45c;--warnbg:#2a2316;--danger:#ef8a7a;--shadow:0 1px 2px rgba(0,0,0,.4),0 16px 40px rgba(0,0,0,.35)}}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;display:grid;place-items:center;background:radial-gradient(1200px 600px at 50% -10%,var(--ring),transparent 60%),var(--bg);color:var(--ink);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px 16px;-webkit-font-smoothing:antialiased}
.card{width:100%;max-width:440px;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px 26px 22px;box-shadow:var(--shadow);animation:rise .35s cubic-bezier(.2,.8,.2,1) both}
@keyframes rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.card{animation:none}}
.pair{display:flex;align-items:center;justify-content:center;gap:14px;margin:2px 0 18px}
.logo{width:52px;height:52px;border-radius:14px;overflow:hidden;display:grid;place-items:center;flex:none;box-shadow:0 0 0 1px var(--line)}
.logo svg,.logo img{width:100%;height:100%;display:block;object-fit:cover}
.logo.mono{background:var(--soft);font-weight:700;font-size:22px;color:var(--ink)}
.link{display:flex;gap:5px}.link i{width:5px;height:5px;border-radius:50%;background:var(--line)}.link i:nth-child(2){background:var(--accent)}
h1{font-size:20px;line-height:1.3;margin:0 0 4px;text-align:center;letter-spacing:-.01em}
.sub{margin:0 0 18px;text-align:center;color:var(--muted);font-size:13.5px}.sub b{color:var(--ink);font-weight:600}
.facts{list-style:none;margin:0 0 16px;padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:var(--soft);display:grid;gap:8px}
.facts li{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;color:var(--muted)}.facts b{color:var(--ink);font-weight:600}
.ic{width:17px;height:17px;flex:none;margin-top:1px;color:var(--accent)}
.warn{display:flex;gap:10px;background:var(--warnbg);color:var(--warn);border-radius:12px;padding:10px 12px;font-size:13px;margin:0 0 14px}.warn .ic{color:var(--warn)}
.label{font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin:2px 0 8px}
.opt{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:0 0 8px;cursor:pointer;transition:border-color .15s,box-shadow .15s,background .15s}
.opt:hover{border-color:color-mix(in oklab,var(--accent) 45%,var(--line))}
.opt:has(input:checked){border-color:var(--accent);box-shadow:0 0 0 3px var(--ring);background:color-mix(in oklab,var(--accent) 5%,var(--card))}
.opt input{margin:3px 0 0;accent-color:var(--accent);width:16px;height:16px;flex:none}
.opt b{display:block;font-weight:600}.opt span{display:block;font-size:13px;color:var(--muted);margin-top:1px}
.field{display:block;margin:0 0 12px;font-size:13px;font-weight:600}
.field input{display:block;width:100%;margin-top:6px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);font:inherit;font-weight:400;outline:none;transition:border-color .15s,box-shadow .15s}
.field input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--ring)}
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}.row.one{grid-template-columns:1fr}
button{font:inherit;font-weight:600;border-radius:12px;padding:11px 16px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;transition:transform .12s,background .15s,opacity .15s}
button:hover{background:var(--soft)}button:active{transform:scale(.98)}
button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}button.primary:hover{background:color-mix(in oklab,var(--accent) 88%,#000)}
button:focus-visible{outline:none;box-shadow:0 0 0 3px var(--ring)}
button[disabled]{cursor:default;opacity:.6}button.busy{opacity:1}
.spin{width:16px;height:16px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.err{display:flex;gap:8px;color:var(--danger);font-size:13.5px;margin:0 0 12px}.err .ic{color:var(--danger)}
.foot{margin:16px 0 0;text-align:center;font-size:12px;color:var(--muted)}
</style></head><body><main class="card">${body}</main>
<script nonce="${nonce}">
// One answer per page: the pressed button shows it is working, and nothing can be sent twice. The pressed button's
// value travels in a hidden field, because a disabled button is left out of the form.
document.querySelectorAll("form").forEach(function (form) {
  form.addEventListener("submit", function (event) {
    if (form.dataset.sent) { event.preventDefault(); return; }
    form.dataset.sent = "1";
    var pressed = event.submitter;
    if (pressed && pressed.name) {
      var keep = document.createElement("input");
      keep.type = "hidden"; keep.name = pressed.name; keep.value = pressed.value;
      form.appendChild(keep);
    }
    form.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
    if (pressed) {
      pressed.classList.add("busy");
      pressed.innerHTML = '<span class="spin" aria-hidden="true"></span>' + (pressed.dataset.busy || "Working…");
      pressed.setAttribute("aria-busy", "true");
    }
  });
});
</script></body></html>`);
}

function pair(r) {
  const name = r?.client?.client_name ?? "";
  const theirs = r?.icon ? `<div class="logo"><img src="${esc(r.icon)}" alt="${esc(name)}"></div>` : `<div class="logo mono" aria-hidden="true">${esc(name.slice(0, 1).toUpperCase() || "?")}</div>`;
  return `<div class="pair"><div class="logo" title="Opsmira">${OPSMIRA_MARK}</div><div class="link" aria-hidden="true"><i></i><i></i><i></i></div>${r ? theirs : ""}</div>`;
}

function errorPage(res, message) {
  page(res, 400, "Can't connect", `${pair(null)}<h1>This connection can't continue</h1><p class="sub">${esc(message)}</p><p class="foot">Start it again from the app you were connecting.</p>`);
}

function consentBody(id, r, sessionId, host) {
  const dest = new URL(r.redirectUri);
  const local = loopback(dest);
  const name = esc(r.client.client_name);
  const where = local ? `an app on this computer (port ${esc(dest.port || "80")})` : esc(dest.host);
  return `${pair(r)}
<h1>${name} wants to connect to Opsmira</h1>
<p class="sub">on <b>${esc(host)}</b>${r.client.metadataHost ? ` · identified by <b>${esc(r.client.metadataHost)}</b>` : ""}</p>
<ul class="facts">
<li>${icon("eye")}<span><b>See your servers</b> and their live data</span></li>
<li>${icon("terminal")}<span><b>Run commands</b> on servers that allow them</span></li>
<li>${icon("spark")}<span><b>Ask Opsmira's agent</b> to look into things and act</span></li>
<li>${icon("back")}<span>Then you go back to <b>${where}</b></span></li>
</ul>
${local ? `<div class="warn">${icon("alert")}<span>This hands the sign-in to a program on your own computer. Allow it only if you just started connecting from one, such as Claude Code.</span></div>` : ""}
<form method="post" action="/oauth/authorize">
<input type="hidden" name="request_id" value="${esc(id)}"><input type="hidden" name="csrf" value="${esc(csrfFor(sessionId, id))}">
<div class="label">Access</div>
<label class="opt"><input type="radio" name="access" value="ask" checked><div><b>Ask first</b><span>Reads and read-only commands. Changes Opsmira's agent proposes wait for your approval in the console.</span></div></label>
<label class="opt"><input type="radio" name="access" value="full"><div><b>Full access</b><span>Any command on servers that allow commands, and Opsmira's agent acts without asking. Every command is in Activity.</span></div></label>
<div class="row"><button type="submit" name="action" value="deny" data-busy="Declining…">Deny</button><button class="primary" type="submit" name="action" value="allow" data-busy="Connecting…">Allow</button></div>
</form>
<p class="foot">${icon("shield").replace('class="ic"', 'class="ic" style="width:13px;height:13px;vertical-align:-2px;margin-right:4px"')}Revoke it any time under Surfaces → AI agents in the console.</p>`;
}

function loginBody(id, r, error, host) {
  return `${pair(r)}
<h1>Sign in to connect ${esc(r.client.client_name)}</h1>
<p class="sub">Sign in to the Opsmira console on <b>${esc(host)}</b> to choose what ${esc(r.client.client_name)} may do.</p>
${error ? `<p class="err">${icon("alert")}<span>${esc(error)}</span></p>` : ""}
<form method="post" action="/oauth/authorize">
<input type="hidden" name="request_id" value="${esc(id)}">
<label class="field">Username<input name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required autofocus></label>
<label class="field">Password<input name="password" type="password" autocomplete="current-password" required></label>
<div class="row one"><button class="primary" type="submit" name="action" value="login" data-busy="Signing in…">Sign in</button></div>
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
  const icon = await clientIcon(client).catch(() => null);
  requests.set(id, { client, icon, redirectUri, state, challenge: q.code_challenge, resource: resourceOf(req), createdAt: Date.now() });
  const sessionId = sessionIdFromRequest(req);
  if (!sessionId) return page(res, 200, "Sign in", loginBody(id, requests.get(id), null, req.get("host")));
  return page(res, 200, "Connect an app", consentBody(id, requests.get(id), sessionId, req.get("host")));
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
    if (wait) return page(res, 429, "Sign in", loginBody(id, r, `Too many attempts. Try again in ${Math.ceil(wait / 60)} minutes.`, req.get("host")));
    if (!checkLogin(req.body?.username, req.body?.password)) {
      noteLoginFailure(req.ip);
      return page(res, 401, "Sign in", loginBody(id, r, "Wrong username or password.", req.get("host")));
    }
    clearLoginFailures(req.ip);
    const sessionId = issueSessionCookie(req, res);
    return page(res, 200, "Connect an app", consentBody(id, r, sessionId, req.get("host")));
  }
  const sessionId = sessionIdFromRequest(req);
  const csrf = Buffer.from(String(req.body?.csrf ?? ""));
  const expected = sessionId ? Buffer.from(csrfFor(sessionId, id)) : null;
  if (!expected || csrf.length !== expected.length || !timingSafeEqual(csrf, expected)) return page(res, 403, "Sign in", loginBody(id, r, "Sign in again to continue.", req.get("host")));
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

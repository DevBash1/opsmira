// The OAuth sign-in claude.ai (web, Desktop, mobile) and Claude Code use for MCP, against the real server process:
// discovery from a 401, Dynamic Client Registration and Client ID Metadata Documents, the owner's sign-in and
// approval (with its CSRF and origin checks), PKCE, tokens on /mcp, refresh rotation, and revoking in the console.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";

const REPO = new URL("../..", import.meta.url).pathname;
const port = await new Promise((r) => {
  const s = createServer().listen(0, "127.0.0.1", () => {
    const p = s.address().port;
    s.close(() => r(p));
  });
});
const BASE = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server/src/index.js"], {
  cwd: REPO,
  stdio: "ignore",
  env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", OPSMIRA_DATA_DIR: mkdtempSync(join(tmpdir(), "opsmira-oauth-")), OPSMIRA_PASSWORD: "pw", OPENROUTER_API_KEY: "test", OPSMIRA_UPDATE_CHECK: "off", OPSMIRA_OAUTH_TEST_LOCAL_CIMD: "1", OPSMIRA_ENV_FILE: join(tmpdir(), "opsmira-no-env") },
});
for (let i = 0; i < 100; i++) {
  try {
    await fetch(`${BASE}/api/me`);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

// A client metadata document, as Claude Code publishes one.
const cimd = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ client_id: `http://127.0.0.1:${cimd.address().port}/client.json`, client_name: "Claude Code", redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"] }));
});
await new Promise((r) => cimd.listen(0, "127.0.0.1", r));

after(() => {
  server.kill();
  cimd.close();
});

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};
const field = (html, name) => new RegExp(`name="${name}" value="([^"]+)"`).exec(html)?.[1];
const form = (data) => new URLSearchParams(data).toString();
const post = (path, data, headers = {}) => fetch(`${BASE}${path}`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers }, body: form(data) });
const rpc = (token, method, params = {}) =>
  fetch(`${BASE}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });

/** The owner's side: open the approval page, sign in, choose the access, answer. Returns the redirect it ends on. */
async function approve(authorizeUrl, { access = "ask", answer = "allow" } = {}) {
  const page = await fetch(authorizeUrl, { redirect: "manual" });
  assert.equal(page.status, 200);
  const id = field(await page.text(), "request_id");
  const login = await post("/oauth/authorize", { request_id: id, action: "login", username: "admin", password: "pw" });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const consent = await login.text();
  const done = await post("/oauth/authorize", { request_id: id, csrf: field(consent, "csrf"), access, action: answer }, { Cookie: cookie });
  assert.equal(done.status, 302);
  return { location: new URL(done.headers.get("location")), consent, cookie };
}

test("a client finds the sign-in from a 401, registers, the owner approves, and the token works on /mcp", async () => {
  const unauth = await rpc(null, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "x", version: "1" } });
  assert.equal(unauth.status, 401);
  const metaUrl = /resource_metadata="([^"]+)"/.exec(unauth.headers.get("www-authenticate"))[1];
  assert.equal(metaUrl, `${BASE}/.well-known/oauth-protected-resource/mcp`);
  const resource = await (await fetch(metaUrl)).json();
  assert.equal(resource.resource, `${BASE}/mcp`);
  assert.deepEqual(resource.authorization_servers, [BASE]);
  const as = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json();
  assert.deepEqual(as.code_challenge_methods_supported, ["S256"]);
  assert.equal(as.client_id_metadata_document_supported, true);
  assert.ok(as.token_endpoint_auth_methods_supported.includes("none"));

  const reg = await fetch(as.registration_endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }) });
  assert.equal(reg.status, 201);
  const client = await reg.json();

  const { verifier, challenge } = pkce();
  const authorize = `${as.authorization_endpoint}?${form({ response_type: "code", client_id: client.client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", code_challenge: challenge, code_challenge_method: "S256", state: "st4te", scope: "opsmira offline_access", resource: resource.resource })}`;
  const { location, consent } = await approve(authorize);
  assert.match(consent, /Claude wants to connect to Opsmira/);
  assert.match(consent, /claude\.ai/);
  assert.equal(location.origin + location.pathname, "https://claude.ai/api/mcp/auth_callback");
  assert.equal(location.searchParams.get("state"), "st4te");
  assert.equal(location.searchParams.get("iss"), BASE);
  const code = location.searchParams.get("code");

  // A wrong verifier spends the code.
  const stolen = await post("/oauth/token", { grant_type: "authorization_code", code, code_verifier: pkce().verifier, client_id: client.client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback" });
  assert.equal((await stolen.json()).error, "invalid_grant");

  // Again, properly.
  const again = await approve(authorize.replace(challenge, pkce().challenge));
  const { verifier: v2, challenge: c2 } = pkce();
  const third = await approve(authorize.replace(challenge, c2));
  const tok = await post("/oauth/token", { grant_type: "authorization_code", code: third.location.searchParams.get("code"), code_verifier: v2, client_id: client.client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", resource: resource.resource });
  assert.equal(tok.status, 200);
  const tokens = await tok.json();
  assert.equal(tokens.token_type, "Bearer");
  assert.equal(tokens.expires_in, 3600);
  assert.ok(tokens.refresh_token);
  assert.equal(again.location.searchParams.has("code"), true);

  const init = await rpc(tokens.access_token, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "Claude", version: "1" } });
  assert.equal(init.status, 200);
  assert.equal((await init.json()).result.serverInfo.name, "opsmira");

  // Refresh rotates: the new pair works, the old refresh token does not.
  const refreshed = await (await post("/oauth/token", { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: client.client_id })).json();
  assert.ok(refreshed.access_token && refreshed.refresh_token !== tokens.refresh_token);
  assert.equal((await rpc(refreshed.access_token, "ping")).status, 200);
  assert.equal((await (await post("/oauth/token", { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: client.client_id })).json()).error, "invalid_grant");

  // The connection shows in the console's list, and revoking it there ends it.
  const list = await (await fetch(`${BASE}/api/mcp/tokens`, { headers: { Cookie: third.cookie } })).json();
  const grant = list.tokens.find((t) => t.kind === "oauth" && t.name === "Claude");
  assert.equal(grant.redirectHost, "claude.ai");
  assert.equal(grant.access, "ask");
  await fetch(`${BASE}/api/mcp/tokens/${grant.id}`, { method: "DELETE", headers: { Cookie: third.cookie } });
  assert.equal((await rpc(refreshed.access_token, "ping")).status, 401);
  assert.equal((await (await post("/oauth/token", { grant_type: "refresh_token", refresh_token: refreshed.refresh_token, client_id: client.client_id })).json()).error, "invalid_grant");
});

test("Claude Code style: a client ID metadata document and a loopback redirect on any port", async () => {
  const clientId = `http://127.0.0.1:${cimd.address().port}/client.json`;
  const { verifier, challenge } = pkce();
  const redirect = "http://localhost:43123/callback";
  const { location, consent } = await approve(`${BASE}/oauth/authorize?${form({ response_type: "code", client_id: clientId, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: "S256", state: "s" })}`, { access: "full" });
  assert.match(consent, /Claude Code/);
  assert.match(consent, /program on your own computer/);
  assert.equal(location.origin, "http://localhost:43123");
  const tokens = await (await post("/oauth/token", { grant_type: "authorization_code", code: location.searchParams.get("code"), code_verifier: verifier, client_id: clientId, redirect_uri: redirect })).json();
  const list = await rpc(tokens.access_token, "tools/list");
  assert.equal(list.status, 200);
});

test("refusals: unknown return address, no PKCE, a forged or cross-site approval, and Deny", async () => {
  const reg = await (await fetch(`${BASE}/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "Shady", redirect_uris: ["https://good.example/cb"] }) })).json();
  const { challenge } = pkce();
  const base = { response_type: "code", client_id: reg.client_id, code_challenge: challenge, code_challenge_method: "S256", state: "z" };

  // A return address the client never registered: an error page, no redirect anywhere.
  const bad = await fetch(`${BASE}/oauth/authorize?${form({ ...base, redirect_uri: "https://evil.example/cb" })}`, { redirect: "manual" });
  assert.equal(bad.status, 400);
  assert.equal(bad.headers.get("location"), null);

  // No PKCE: sent back with an error.
  const nopkce = await fetch(`${BASE}/oauth/authorize?${form({ response_type: "code", client_id: reg.client_id, redirect_uri: "https://good.example/cb", state: "z" })}`, { redirect: "manual" });
  assert.equal(nopkce.status, 302);
  assert.equal(new URL(nopkce.headers.get("location")).searchParams.get("error"), "invalid_request");

  // Approving without the page's CSRF value, or from another site, does nothing.
  const page = await fetch(`${BASE}/oauth/authorize?${form({ ...base, redirect_uri: "https://good.example/cb" })}`);
  const id = field(await page.text(), "request_id");
  const login = await post("/oauth/authorize", { request_id: id, action: "login", username: "admin", password: "pw" });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const csrf = field(await login.text(), "csrf");
  assert.equal((await post("/oauth/authorize", { request_id: id, action: "allow" }, { Cookie: cookie })).status, 403);
  assert.equal((await post("/oauth/authorize", { request_id: id, csrf, action: "allow" }, { Cookie: cookie, Origin: "https://evil.example" })).status, 400);
  assert.equal((await post("/oauth/authorize", { request_id: id, csrf, action: "allow" })).status, 403, "no session cookie");

  // Deny: back with access_denied.
  const denied = await post("/oauth/authorize", { request_id: id, csrf, action: "deny" }, { Cookie: cookie });
  assert.equal(new URL(denied.headers.get("location")).searchParams.get("error"), "access_denied");

  // A wrong password on the approval page counts like any failed sign-in.
  const page2 = await fetch(`${BASE}/oauth/authorize?${form({ ...base, redirect_uri: "https://good.example/cb" })}`);
  const wrong = await post("/oauth/authorize", { request_id: field(await page2.text(), "request_id"), action: "login", username: "admin", password: "nope" });
  assert.equal(wrong.status, 401);
});

test("the official SDK's OAuth client (what Claude Code builds on) discovers, registers and signs in by itself", async () => {
  let saved = {};
  let authUrl = null;
  const provider = {
    get redirectUrl() {
      return "http://localhost:51234/callback";
    },
    get clientMetadata() {
      return { client_name: "SDK client", redirect_uris: ["http://localhost:51234/callback"], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" };
    },
    state: () => "sdk-state",
    clientInformation: () => saved.client,
    saveClientInformation: (info) => (saved.client = info),
    tokens: () => saved.tokens,
    saveTokens: (t) => (saved.tokens = t),
    redirectToAuthorization: (url) => (authUrl = url),
    saveCodeVerifier: (v) => (saved.verifier = v),
    codeVerifier: () => saved.verifier,
  };
  const url = new URL(`${BASE}/mcp`);
  const first = new StreamableHTTPClientTransport(url, { authProvider: provider });
  await assert.rejects(new Client({ name: "sdk", version: "1" }).connect(first), UnauthorizedError);
  assert.ok(authUrl, "it was sent to the approval page");
  assert.equal(authUrl.searchParams.get("resource"), `${BASE}/mcp`);
  const { location } = await approve(authUrl.toString());
  await first.finishAuth(location.searchParams.get("code"));
  assert.ok(saved.tokens.access_token);

  const client = new Client({ name: "sdk", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(url, { authProvider: provider }));
  const { tools } = await client.listTools();
  assert.ok(tools.some((t) => t.name === "opsmira_ask"));
  await client.close();
});

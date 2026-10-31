// Opsmira as an MCP server (docs/mcp.md). Other AI agents (Claude Code, Claude Desktop, Cursor, an agent of your
// own) connect with a token made in the console, then either ask Opsmira's own agent to do something and get its
// answer, or go straight to a server: list them, read a live surface, run a command there.
//
// Transport: Streamable HTTP, stateless, JSON answers only. Each POST /mcp carries one JSON-RPC message and the
// answer is the response body; there is no session and no server-sent stream. A turn that takes longer than one
// request should wait (about a minute) comes back as "working", and opsmira_get_reply picks it up.
import { createHash, randomBytes, randomUUID } from "crypto";
import { readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import { defaultFor, pickServer, runTurn, targetServer } from "./ai.js";
import { AGENT_PREFIX, agentAccess, listAgents } from "./agents.js";
import { loginBlockedFor, noteLoginFailure } from "./auth.js";
import { contentText } from "./content.js";
import { env } from "./env.js";
import { classifyInspect, COMMAND_TIMEOUTS, commandTimeout, runCommand } from "./exec.js";
import { getSession, persistSession } from "./state.js";
import { appendAudit, loadConversation } from "./store.js";
import { collectSurface, SURFACES } from "./surfaces.js";
import { retitle } from "./titles.js";
import { buildInfo } from "./update.js";

export const MCP_PATH = "/mcp";
const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const TURN_TIMEOUT_MS = 60 * 60_000; // a turn can include a long change (commands may run up to an hour)
const DEFAULT_WAIT_S = 50; // under the 100 s a proxy such as Cloudflare allows a request
const MAX_WAIT_S = 90;
const CONVERSATION_ID = /^[A-Za-z0-9-]{8,64}$/;
const sha = (value) => createHash("sha256").update(String(value)).digest("hex");

/* ---------------- tokens ---------------- */
// A token is what an MCP client presents (Authorization: Bearer opsmira_mcp_...). Only its hash is kept. Its access
// decides what it may do: "ask" reads freely and runs read-only commands, and Opsmira's agent works in Ask first
// mode for it (changes wait for the owner's approval in the console); "full" may run any command and Opsmira's agent
// works in Full access mode.
const FILE = join(env.dataDir, "mcp-tokens.json");
let tokens = (() => {
  try {
    const saved = JSON.parse(readFileSync(FILE, "utf8"));
    return Array.isArray(saved.tokens) ? saved.tokens : [];
  } catch {
    return [];
  }
})();

function save() {
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify({ tokens }, null, 2), { mode: 0o600 });
  renameSync(tmp, FILE);
}

/* OAuth (oauth.js): a client that signed in through the console gets a short-lived access token and a refresh
   token that rotates on every use. The grant is one entry in this list, so the console shows and revokes it like
   any other token. */
const ACCESS_TTL_S = 60 * 60;
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function mintPair(record) {
  const access = `opsmira_mcp_${randomBytes(32).toString("base64url")}`;
  const refresh = `opsmira_refresh_${randomBytes(32).toString("base64url")}`;
  record.accessHash = sha(access);
  record.accessExpiresAt = Date.now() + ACCESS_TTL_S * 1000;
  record.refreshHash = sha(refresh);
  record.refreshExpiresAt = Date.now() + REFRESH_TTL_MS;
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: "opsmira" };
}

export function issueOAuthGrant({ clientId, clientName, access, resource, redirectHost }) {
  const record = {
    id: randomUUID(),
    kind: "oauth",
    name: String(clientName || "MCP client").slice(0, 40),
    access: access === "full" ? "full" : "ask",
    clientId,
    redirectHost,
    resource,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  const pair = mintPair(record);
  tokens.push(record);
  save();
  return pair;
}

/** A refresh: the old refresh token stops working and a new pair comes back. Null when it is unknown or expired. */
export function refreshOAuthGrant(refreshToken, clientId) {
  const hash = sha(refreshToken);
  const record = tokens.find((t) => t.kind === "oauth" && t.refreshHash === hash && t.clientId === clientId);
  if (!record || record.refreshExpiresAt < Date.now()) return null;
  const pair = mintPair(record);
  save();
  return pair;
}

export function createMcpToken({ name, access }) {
  const token = `opsmira_mcp_${randomBytes(32).toString("base64url")}`;
  const record = {
    id: randomUUID(),
    name: String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 40) || "MCP client",
    access: access === "full" ? "full" : "ask",
    hash: sha(token),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  tokens.push(record);
  save();
  return { token, id: record.id, name: record.name, access: record.access };
}

export const listMcpTokens = () =>
  tokens.map((t) => ({ id: t.id, name: t.name, access: t.access, kind: t.kind ?? "token", redirectHost: t.redirectHost ?? null, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt }));

export function revokeMcpToken(id) {
  const before = tokens.length;
  tokens = tokens.filter((t) => t.id !== id);
  if (tokens.length === before) return false;
  save();
  return true;
}

function findToken(raw) {
  const hash = sha(raw);
  return tokens.find((t) => t.hash === hash || (t.kind === "oauth" && t.accessHash === hash && t.accessExpiresAt > Date.now())) ?? null;
}

/* ---------------- results ---------------- */
class ToolError extends Error {}
const clip = (text, n) => {
  const s = typeof text === "string" ? text : String(text ?? "");
  return s.length > n ? `${s.slice(0, n)}\n…[truncated ${s.length - n} characters]` : s;
};
/** A tool result: readable text for the model, the same data as structured content for programs. */
const result = (text, data) => ({ content: [{ type: "text", text }], ...(data ? { structuredContent: data } : {}) });

/* ---------------- Opsmira's agent: turns started over MCP ---------------- */
/** conversation id -> { promise, events, done, error, startedAt, endedAt } for turns started here (kept an hour) */
const turns = new Map();
const KEEP_TURN_MS = 60 * 60_000;

/**
 * A client reaches only the conversations it started (with this token): not the owner's console chats, not tasks,
 * not another client's. Checked without loading anything that does not belong to it.
 */
function owns(conversationId, token) {
  const via = `mcp:${token.id}`;
  if (turns.get(conversationId)?.via === via) return true;
  return loadConversation(conversationId)?.via === via;
}
const notGivenOut = () => new ToolError("conversation_id is not one this console gave out to this client. Leave it out to start a new conversation.");

function startTurn(conversationId, message, token, server) {
  for (const [id, t] of turns) if (t.done && Date.now() - t.endedAt > KEEP_TURN_MS) turns.delete(id);
  const session = getSession(null, conversationId);
  if (!session.via) session.via = `mcp:${token.id}`;
  if (session.run) throw new ToolError(`Opsmira is still working in conversation ${conversationId}. Call opsmira_get_reply with it, or opsmira_stop.`);
  const fresh = !session.conversation.some((m) => m.role === "user");
  const abort = new AbortController();
  session.run = { abort, steers: [], vision: false };
  // The chat shows up in the console's History under the client's name, so the owner sees where it came from.
  if (fresh) {
    session.title = `${token.name} · ${message.replace(/\s+/g, " ").slice(0, 50)}`;
    session.titledAt = 1e9;
  }
  // Tell the agent who it is talking to: another AI, which reads the reply but cannot tap suggestions or approve.
  session.conversation.push({
    role: "user",
    ask: true,
    content: `[From ${token.name}, an AI agent connected over MCP, not the owner. Answer it fully in your reply: it cannot tap suggestions, and only the owner can approve changes, in the console.]\n\n${message}`,
  });
  const t = { events: [], done: false, error: null, startedAt: Date.now(), endedAt: 0, via: session.via };
  const timer = setTimeout(() => abort.abort(), TURN_TIMEOUT_MS);
  t.promise = (async () => {
    try {
      await runTurn(session.conversation, (e) => t.events.push(e), session.lastModel, session.pendingApprovals, {
        signal: abort.signal,
        steers: session.run.steers,
        vision: false,
        fullAccess: token.access === "full",
        server: server || undefined,
      });
    } catch (err) {
      t.error = abort.signal.aborted ? "stopped" : String(err?.message ?? err).slice(0, 500);
    } finally {
      clearTimeout(timer);
      session.run = null;
      persistSession(session);
      if (!fresh) retitle(session);
      t.done = true;
      t.endedAt = Date.now();
    }
  })();
  turns.set(conversationId, t);
  return t;
}

const wait = (t, seconds) => Promise.race([t.promise, new Promise((r) => setTimeout(r, Math.min(Math.max(Number(seconds) || DEFAULT_WAIT_S, 1), MAX_WAIT_S) * 1000))]);

/** What a turn came to: its reply, the commands it ran, and the changes waiting for the owner. */
function turnReport(conversationId, t, consoleUrl) {
  const session = getSession(null, conversationId);
  const approvals = [...session.pendingApprovals.values()]
    .filter((p) => p.status === "pending")
    .map((p) => ({ id: p.id, title: p.title, server: p.server ?? "local", risk: p.riskLevel, ...(p.kind === "detach" ? { kind: "detach", goal: p.detach?.goal } : { command: p.command }) }));
  let reply = "";
  let commands = [];
  let errors = [];
  if (t) {
    reply = t.events.filter((e) => e.type === "message" && e.text).map((e) => e.text).join("\n\n");
    commands = t.events
      .filter((e) => e.type === "tool_result" && typeof e.command === "string")
      .map((e) => ({ server: e.server || "local", command: e.command, exit_code: e.exitCode ?? null, output: clip(e.output, 2000), ...(e.stopped ? { stopped: true } : {}) }));
    errors = t.events.filter((e) => e.type === "error").map((e) => e.text);
    if (t.error) errors.push(t.error);
  } else {
    // Started before this process (or from the console): the conversation is all there is.
    const last = [...session.conversation].reverse().find((m) => m.role === "assistant" && contentText(m.content).trim());
    reply = last ? contentText(last.content) : "";
  }
  const status = t && !t.done ? "working" : approvals.length ? "waiting_for_approval" : errors.length && !reply ? "error" : "done";
  const data = { conversation_id: conversationId, status, reply, commands, approvals_waiting: approvals, errors, console_url: consoleUrl };
  const lines = [];
  lines.push(`Conversation ${conversationId} · ${status.replace(/_/g, " ")}`);
  if (status === "working") lines.push("Opsmira is still working. Call opsmira_get_reply with this conversation_id to wait for the answer.");
  if (reply) lines.push("", reply);
  if (commands.length) lines.push("", `Commands it ran (${commands.length}):`, ...commands.map((c) => `- ${c.server}: ${c.command} → exit ${c.exit_code ?? "?"}`));
  if (approvals.length) {
    lines.push("", "Waiting for the owner's approval in the console (an MCP client cannot approve):", ...approvals.map((a) => `- ${a.title} (${a.server}, risk ${a.risk})`), `Console: ${consoleUrl}`);
  }
  if (errors.length) lines.push("", `Errors: ${errors.join("; ")}`);
  return result(lines.join("\n"), data);
}

/* ---------------- tools ---------------- */
const SERVER_DESC = 'A server: "local" for the machine Opsmira runs on, or agent:<name> for a connected server (see opsmira_list_servers). Leave it out for the default server.';
const TOOLS = [
  {
    name: "opsmira_list_servers",
    title: "List servers",
    description: "List the servers this Opsmira console manages: the machine it runs on and every server connected with opsmira-agent, with whether each is online and whether commands may run there. Use the ids it returns as `server` in the other tools.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: () => {
      const servers = [
        { id: "local", name: "this console's machine", online: true, commands: true, access: "operate" },
        ...listAgents().map((a) => ({
          id: a.host,
          name: a.name,
          online: a.online,
          commands: a.online && agentAccess(a.name) === "operate",
          access: a.access ?? null,
          hostname: a.hostname,
          platform: a.platform,
          agent_version: a.version ?? null,
          last_seen: a.lastSeen,
        })),
      ];
      const dflt = env.defaultServer || "local";
      const text = [`Default server: ${dflt}`, "", ...servers.map((s) => `- ${s.id}${s.name && s.id !== `agent:${s.name}` ? ` (${s.name})` : ""}: ${s.online ? "online" : "offline"}, ${s.commands ? "commands allowed" : "read-only surfaces only"}${s.platform ? `, ${s.platform}` : ""}`)].join("\n");
      return result(text, { default_server: dflt, servers });
    },
  },
  {
    name: "opsmira_read_surface",
    title: "Read a live surface",
    description: `Read live data from a server, the same panels the console shows: ${SURFACES.map((s) => `${s.id} (${s.description.toLowerCase()})`).join("; ")}. Works on read-only servers too. Returns the data as JSON.`,
    inputSchema: {
      type: "object",
      properties: {
        surface: { type: "string", enum: SURFACES.map((s) => s.id), description: "Which surface to read." },
        server: { type: "string", description: SERVER_DESC },
        target: { type: "string", description: "For surfaces about one thing: the container, service, directory or host to look at (e.g. nginx, /var/log)." },
      },
      required: ["surface"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async ({ surface, server, target }) => {
      if (!SURFACES.some((s) => s.id === surface)) throw new ToolError(`Unknown surface "${surface}". One of: ${SURFACES.map((s) => s.id).join(", ")}.`);
      const host = pickServer(typeof server === "string" ? server : "", env.defaultServer) || undefined;
      if (host && host.startsWith(AGENT_PREFIX) && !listAgents().some((a) => a.host === host)) throw new ToolError(`Unknown server "${host}". Call opsmira_list_servers for the ids.`);
      const read = await collectSurface(surface, { target: typeof target === "string" ? target.slice(0, 300) : undefined, host });
      const json = JSON.stringify(read.data ?? read, null, 1);
      return result(`${surface} on ${host ?? "local"}:\n${clip(json, 30000)}`, { surface, server: host ?? "local", data: read.data ?? read });
    },
  },
  {
    name: "opsmira_run_command",
    title: "Run a command on a server",
    description:
      `Run one shell command on a server and return its exit code and output (up to 64 KB). It may run ${Math.round(COMMAND_TIMEOUTS.inspect / 1000)} s when read-only and ${Math.round(COMMAND_TIMEOUTS.act / 1000)} s otherwise, or what timeout_seconds asks, up to ${Math.round(COMMAND_TIMEOUTS.max / 1000)} s. ` +
      "It goes straight to the server, without Opsmira's agent. With an \"ask\" token only read-only commands run (ls, cat, df, systemctl status, journalctl...); a \"full\" token may run anything. Every command lands in the console's audit log under this client's name. The server must allow commands (opsmira_list_servers says which do).",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command, run with /bin/sh -c (PowerShell on Windows servers)." },
        server: { type: "string", description: SERVER_DESC },
        timeout_seconds: { type: "number", description: "Optional. How long it may run before it is killed. Ask for more for upgrades, builds or image pulls." },
      },
      required: ["command"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    run: async ({ command, server, timeout_seconds }, token) => {
      const cmd = typeof command === "string" ? command.trim() : "";
      if (!cmd) throw new ToolError("command is required.");
      const target = targetServer(typeof server === "string" ? server : undefined, env.defaultServer);
      if (target.error) throw new ToolError(target.error);
      const readOnly = classifyInspect(cmd);
      if (token.access !== "full" && !readOnly.ok) {
        throw new ToolError(`This token only runs read-only commands, and this one is not (${readOnly.reason}). Ask Opsmira with opsmira_ask instead: it proposes the change for the owner to approve in the console.`);
      }
      const run = await runCommand(cmd, { server: target.server, timeoutMs: commandTimeout(readOnly.ok ? "inspect" : "act", timeout_seconds) });
      appendAudit({ id: randomUUID(), kind: readOnly.ok ? "inspect" : "act", by: "mcp", client: token.name, title: readOnly.ok ? undefined : `${token.name} (MCP)`, command: cmd, ...(target.server ? { server: target.server } : {}), ...run });
      const where = target.server ?? "local";
      const data = { server: where, command: cmd, exit_code: run.exitCode ?? null, output: run.output ?? "", duration_ms: run.durationMs ?? 0, timed_out: !!run.timedOut };
      return result(`${where} $ ${cmd}\nexit ${data.exit_code ?? "?"}${data.timed_out ? " (timed out)" : ""} · ${data.duration_ms} ms\n${clip(data.output, 64000) || "(no output)"}`, data);
    },
  },
  {
    name: "opsmira_ask",
    title: "Ask Opsmira",
    description:
      "Send a message to Opsmira's own agent, as the owner would in the console: a question about a server, or something to do there. It investigates with read-only commands and answers. With an \"ask\" token, changes it proposes wait for the owner's approval in the console (they are listed in the result); with a \"full\" token it carries them out. Waits up to wait_seconds for the answer; if it is still working the result says so, and opsmira_get_reply waits for the rest. Pass conversation_id to continue a conversation.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "What to ask or ask for, in plain words. Name the server if it matters." },
        conversation_id: { type: "string", description: "Continue this conversation (from an earlier result). Leave it out to start a new one." },
        server: { type: "string", description: `${SERVER_DESC} Opsmira's agent can still reach the others by name.` },
        wait_seconds: { type: "number", description: `How long to wait for the answer, 1 to ${MAX_WAIT_S} (default ${DEFAULT_WAIT_S}).` },
      },
      required: ["message"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    run: async ({ message, conversation_id, server, wait_seconds }, token, ctx) => {
      const text = typeof message === "string" ? message.trim() : "";
      if (!text) throw new ToolError("message is required.");
      if (conversation_id !== undefined && (!CONVERSATION_ID.test(String(conversation_id)) || !owns(String(conversation_id), token))) throw notGivenOut();
      if (server !== undefined && typeof server === "string" && server.trim() && server.trim() !== "local" && !listAgents().some((a) => a.host === server.trim())) {
        throw new ToolError(`Unknown server "${server}". Call opsmira_list_servers for the ids.`);
      }
      const id = conversation_id ? String(conversation_id) : randomUUID();
      const t = startTurn(id, text.slice(0, 20000), token, typeof server === "string" ? defaultFor(server.trim()) || "local" : undefined);
      await wait(t, wait_seconds);
      return turnReport(id, t, ctx.consoleUrl);
    },
  },
  {
    name: "opsmira_get_reply",
    title: "Get Opsmira's reply",
    description: "Wait for and return the answer to an opsmira_ask that came back \"working\", or read the latest state of a conversation (its reply and the changes waiting for approval).",
    inputSchema: {
      type: "object",
      properties: {
        conversation_id: { type: "string", description: "From opsmira_ask." },
        wait_seconds: { type: "number", description: `How long to wait if it is still working, 1 to ${MAX_WAIT_S} (default ${DEFAULT_WAIT_S}).` },
      },
      required: ["conversation_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async ({ conversation_id, wait_seconds }, token, ctx) => {
      const id = String(conversation_id ?? "");
      if (!CONVERSATION_ID.test(id) || !owns(id, token)) throw notGivenOut();
      const t = turns.get(id);
      if (t && !t.done) await wait(t, wait_seconds);
      return turnReport(id, t, ctx.consoleUrl);
    },
  },
  {
    name: "opsmira_stop",
    title: "Stop Opsmira",
    description: "Stop Opsmira's agent in a conversation, like the owner's Stop button: nothing after the current step runs.",
    inputSchema: { type: "object", properties: { conversation_id: { type: "string" } }, required: ["conversation_id"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: ({ conversation_id }, token) => {
      const id = String(conversation_id ?? "");
      if (!CONVERSATION_ID.test(id) || !owns(id, token)) throw notGivenOut();
      const session = getSession(null, id);
      if (!session.run) return result(`Nothing is running in ${id}.`, { conversation_id: id, stopped: false });
      session.run.abort.abort();
      return result(`Stopping Opsmira in ${id}.`, { conversation_id: id, stopped: true });
    },
  },
];

/* ---------------- protocol ---------------- */
const INSTRUCTIONS =
  "Opsmira manages Linux servers through plain conversation. Use opsmira_list_servers first to see the servers and which allow commands. " +
  "For a question or a job, opsmira_ask hands it to Opsmira's own agent (it knows these servers, their memory and history) and returns its answer; " +
  "for a quick fact, opsmira_read_surface or opsmira_run_command go straight to a server. Changes made through Opsmira's agent may wait for the owner's approval in the console.";

async function dispatch(method, params, token, ctx) {
  switch (method) {
    case "initialize": {
      const asked = params?.protocolVersion;
      return {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "opsmira",
          title: "Opsmira",
          version: buildInfo().version,
          websiteUrl: ctx.consoleUrl,
          icons: [
            { src: `${ctx.consoleUrl}favicon.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
            { src: `${ctx.consoleUrl}icon-192.png`, mimeType: "image/png", sizes: ["192x192"] },
            { src: `${ctx.consoleUrl}icon-512.png`, mimeType: "image/png", sizes: ["512x512"] },
          ],
        },
        instructions: INSTRUCTIONS,
      };
    }
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS.map(({ run, ...t }) => t) };
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) throw Object.assign(new Error(`Unknown tool: ${params?.name}`), { code: -32602 });
      try {
        return await tool.run(params.arguments ?? {}, token, ctx);
      } catch (err) {
        // A tool failing is an answer for the model to read, not a protocol error.
        return { content: [{ type: "text", text: err instanceof ToolError ? err.message : `Opsmira error: ${err.message}` }], isError: true };
      }
    }
    default:
      throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
  }
}

const rpcError = (res, status, id, code, message) => res.status(status).json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** Express handler for POST/GET/DELETE /mcp. Needs express.json() before it. */
export async function handleMcp(req, res) {
  // A browser page on another site must not be able to talk to it (DNS rebinding and the like).
  const origin = req.get("origin");
  if (origin) {
    let host = "";
    try {
      host = new URL(origin).host;
    } catch {
      // unparseable: refuse
    }
    if (host !== req.get("host")) return rpcError(res, 403, null, -32000, "Origin not allowed");
  }
  const wait = loginBlockedFor(req.ip);
  if (wait) {
    res.setHeader("Retry-After", String(wait));
    return rpcError(res, 429, null, -32000, "Too many failed attempts; try again later.");
  }
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") ?? "")?.[1];
  const token = bearer ? findToken(bearer) : null;
  if (!token) {
    // An expired access token is normal (the client refreshes); a token that never existed counts as a failure.
    if (bearer && !tokens.some((t) => t.kind === "oauth" && t.accessHash === sha(bearer))) noteLoginFailure(req.ip);
    // Where to sign in: clients that cannot send a header (claude.ai) follow this to the console's OAuth.
    const base = `${req.protocol}://${req.get("host")}`;
    res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource${MCP_PATH}"${bearer ? ', error="invalid_token"' : ""}`);
    return rpcError(res, 401, null, -32000, "Missing, unknown or expired token. Sign in (MCP clients do it for you), or make a token in the Opsmira console (Surfaces, Connect an AI agent) and send it as Authorization: Bearer <token>.");
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return rpcError(res, 405, null, -32000, "This server answers POST only (no stream, no sessions).");
  }
  if (!token.lastUsedAt || Date.now() - Date.parse(token.lastUsedAt) > 60_000) {
    token.lastUsedAt = new Date().toISOString();
    save();
  }
  const msg = req.body;
  if (Array.isArray(msg)) return rpcError(res, 400, null, -32600, "Batches are not supported; send one message per request.");
  if (!msg || msg.jsonrpc !== "2.0") return rpcError(res, 400, null, -32600, "Not a JSON-RPC 2.0 message.");
  // Notifications and responses from the client need no answer.
  if (msg.id === undefined || msg.method === undefined) return res.status(202).end();
  const ctx = { consoleUrl: `${req.protocol}://${req.get("host")}/` };
  const answer = async () => {
    try {
      return { jsonrpc: "2.0", id: msg.id, result: await dispatch(msg.method, msg.params ?? {}, token, ctx) };
    } catch (err) {
      return { jsonrpc: "2.0", id: msg.id, error: { code: Number.isInteger(err.code) ? err.code : -32603, message: err.message } };
    }
  };
  // A tool call can take minutes (a long command, Opsmira thinking). Proxies such as Cloudflare drop a request that
  // sends nothing for 100 s, so a client that takes a stream gets one: a keep-alive comment every 15 s, then the
  // answer as one event. Everything else is a plain JSON answer.
  if (msg.method === "tools/call" && /text\/event-stream/.test(req.get("accept") ?? "")) {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 15_000);
    try {
      res.write(`event: message\ndata: ${JSON.stringify(await answer())}\n\n`);
    } finally {
      clearInterval(keepAlive);
      res.end();
    }
    return;
  }
  res.json(await answer());
}

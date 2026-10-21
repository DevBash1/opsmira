// Servers that connect to this console themselves (opsmira-agent), instead of being reached over SSH.
// The agent dials out over a WebSocket, so the server needs no open port and no key from you. A
// one-time token pairs it once; after that it reconnects with a long-lived credential. Only a hash of the
// credential is stored here.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import { WebSocketServer } from "ws";
import { env } from "./env.js";

const FILE = join(env.dataDir, "agents.json");
const TOKEN_TTL_MS = 60 * 60 * 1000;
const HELLO_TIMEOUT_MS = 10_000;
const PING_MS = 20_000;
export const AGENT_PATH = "/api/agent/connect";
export const AGENT_PREFIX = "agent:";

const sha = (value) => createHash("sha256").update(String(value)).digest("hex");
const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,39}$/;

/* ---------------- stored state ---------------- */
function load() {
  try {
    const saved = JSON.parse(readFileSync(FILE, "utf8"));
    return { agents: Array.isArray(saved.agents) ? saved.agents : [], tokens: Array.isArray(saved.tokens) ? saved.tokens : [] };
  } catch {
    return { agents: [], tokens: [] };
  }
}
let state = existsSync(FILE) ? load() : { agents: [], tokens: [] };

function save() {
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  renameSync(tmp, FILE);
}

/* ---------------- live connections ---------------- */
/** agent id -> { ws, pending: Map<requestId, {resolve, timer}>, info, connectedAt } */
const live = new Map();

/** Whether a name can be used for a new agent. Names are what people type: agent:<name>. */
export function cleanName(raw) {
  const name = String(raw ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/^[^a-z0-9]+/, "");
  return NAME_RE.test(name) ? name : null;
}

function uniqueName(wanted) {
  let name = wanted;
  for (let n = 2; state.agents.some((a) => a.name === name); n++) name = `${wanted.slice(0, 36)}-${n}`;
  return name;
}

/* ---------------- pairing ---------------- */
export function createPairingToken() {
  const now = Date.now();
  state.tokens = state.tokens.filter((t) => t.expiresAt > now);
  const token = `ops_connect_${randomBytes(24).toString("base64url")}`;
  const expiresAt = now + TOKEN_TTL_MS;
  state.tokens.push({ hash: sha(token), expiresAt });
  save();
  return { token, expiresAt };
}

/** Uses a token once. True when it was valid. */
function consumeToken(token) {
  const hash = sha(token);
  const index = state.tokens.findIndex((t) => t.hash === hash && t.expiresAt > Date.now());
  if (index < 0) return false;
  state.tokens.splice(index, 1);
  save();
  return true;
}

function findByCredential(credential) {
  const hash = Buffer.from(sha(credential));
  return state.agents.find((a) => {
    const stored = Buffer.from(a.credentialHash);
    return stored.length === hash.length && timingSafeEqual(stored, hash);
  });
}

/* ---------------- public API ---------------- */
export function listAgents() {
  return state.agents.map((a) => ({
    id: a.id,
    name: a.name,
    host: `${AGENT_PREFIX}${a.name}`,
    online: live.has(a.id),
    access: live.get(a.id)?.info?.access ?? a.info?.access ?? null,
    hostname: a.info?.hostname ?? null,
    platform: a.info?.platform ?? null,
    createdAt: a.createdAt,
    lastSeen: a.lastSeen ?? null,
  }));
}

export const agentByName = (name) => state.agents.find((a) => a.name === name) ?? null;

export function revokeAgent(id) {
  const index = state.agents.findIndex((a) => a.id === id);
  if (index < 0) return false;
  state.agents.splice(index, 1);
  save();
  live.get(id)?.ws.close(4001, "revoked");
  return true;
}

/** Ask a connected agent to do something. Resolves with its answer, or { ok:false } if it can't. */
export function callAgent(id, op, params = {}, timeoutMs = 15_000) {
  const conn = live.get(id);
  if (!conn || conn.ws.readyState !== 1) return Promise.resolve({ ok: false, code: null, stdout: "", stderr: "agent offline" });
  return new Promise((resolve) => {
    const requestId = randomUUID();
    const timer = setTimeout(() => {
      conn.pending.delete(requestId);
      resolve({ ok: false, code: null, stdout: "", stderr: "agent did not answer in time" });
    }, timeoutMs);
    conn.pending.set(requestId, { resolve, timer });
    conn.ws.send(JSON.stringify({ type: "req", id: requestId, op, ...params }));
  });
}

export const isOnline = (id) => live.has(id);

/* ---------------- WebSocket endpoint ---------------- */
export function attachAgentGateway(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });

  server.on("upgrade", (req, socket, head) => {
    if (new URL(req.url, "http://x").pathname !== AGENT_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => handle(ws));
  });

  function handle(ws) {
    let agent = null;
    const refuse = (error, fatal = true) => {
      try {
        ws.send(JSON.stringify({ type: "error", error, fatal }));
      } catch {
        // already gone
      }
      ws.close(4003, error.slice(0, 100));
    };
    const helloTimer = setTimeout(() => refuse("no hello"), HELLO_TIMEOUT_MS);

    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }

      if (!agent) {
        if (msg?.type !== "hello") return refuse("expected hello");
        clearTimeout(helloTimer);
        const info = {
          hostname: String(msg.info?.hostname ?? "").slice(0, 80),
          platform: String(msg.info?.platform ?? "").slice(0, 80),
          agent: String(msg.info?.agent ?? "").slice(0, 20),
          access: msg.info?.access === "full" ? "full" : "read-only",
        };
        let credential = null;
        if (typeof msg.credential === "string" && msg.credential) {
          agent = findByCredential(msg.credential);
          if (!agent) return refuse("unknown or revoked credential");
        } else if (typeof msg.token === "string" && msg.token) {
          if (!consumeToken(msg.token)) return refuse("invalid or expired token");
          const wanted = cleanName(msg.name) ?? cleanName(info.hostname) ?? "server";
          credential = `ops_agent_${randomBytes(32).toString("base64url")}`;
          agent = { id: randomUUID(), name: uniqueName(wanted), credentialHash: sha(credential), createdAt: new Date().toISOString() };
          state.agents.push(agent);
        } else {
          return refuse("missing token or credential");
        }

        // One connection per agent: a newer one replaces the old.
        live.get(agent.id)?.ws.close(4000, "replaced");
        agent.info = info;
        agent.lastSeen = new Date().toISOString();
        save();
        const conn = { ws, pending: new Map(), info, alive: true };
        live.set(agent.id, conn);
        ws.send(JSON.stringify({ type: "ready", id: agent.id, name: agent.name, ...(credential ? { credential } : {}) }));
        return;
      }

      if (msg?.type === "res" && typeof msg.id === "string") {
        const conn = live.get(agent.id);
        const waiting = conn?.pending.get(msg.id);
        if (!waiting) return;
        conn.pending.delete(msg.id);
        clearTimeout(waiting.timer);
        waiting.resolve({
          ok: !!msg.ok,
          code: Number.isInteger(msg.code) ? msg.code : null,
          stdout: typeof msg.stdout === "string" ? msg.stdout : "",
          stderr: typeof msg.stderr === "string" ? msg.stderr : "",
        });
      }
    });

    ws.on("pong", () => {
      const conn = agent && live.get(agent.id);
      if (conn) conn.alive = true;
    });

    ws.on("close", () => {
      clearTimeout(helloTimer);
      if (!agent) return;
      const conn = live.get(agent.id);
      if (conn?.ws !== ws) return; // a newer connection replaced this one
      for (const { resolve, timer } of conn.pending.values()) {
        clearTimeout(timer);
        resolve({ ok: false, code: null, stdout: "", stderr: "agent disconnected" });
      }
      live.delete(agent.id);
      const stored = state.agents.find((a) => a.id === agent.id);
      if (stored) {
        stored.lastSeen = new Date().toISOString();
        save();
      }
    });

    ws.on("error", () => {});
  }

  // Drop connections that stopped answering pings (a cable pulled, a laptop closed).
  const beat = setInterval(() => {
    for (const conn of live.values()) {
      if (!conn.alive) {
        conn.ws.terminate();
        continue;
      }
      conn.alive = false;
      try {
        conn.ws.ping();
      } catch {
        // closing anyway
      }
    }
  }, PING_MS);
  beat.unref();
}

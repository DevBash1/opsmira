// Servers that connect to this console themselves (opsmira-agent), instead of being reached over SSH.
// The agent dials out over a WebSocket, so the server needs no open port and no key from you. A
// one-time token pairs it once; after that it reconnects with a long-lived credential. Only a hash of the
// credential is stored here. A server that connects without a usable token becomes a request the owner
// accepts or declines; it waits for the answer for as long as it takes.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { WebSocketServer } from "ws";
import { env } from "./env.js";

const FILE = join(env.dataDir, "agents.json");
const KEEP_TOKENS = 100;
// Anyone who can reach the console can ask to join, so asking is bounded: requests never expire, but there are
// only so many waiting at once, and only so many new ones from one address an hour.
const MAX_REQUESTS = 50;
const REQUESTS_PER_IP_HOUR = 5;
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
    const list = (v) => (Array.isArray(v) ? v : []);
    return { agents: list(saved.agents), tokens: list(saved.tokens), requests: list(saved.requests) };
  } catch {
    return { agents: [], tokens: [], requests: [] };
  }
}
let state = existsSync(FILE) ? load() : { agents: [], tokens: [], requests: [] };

function save() {
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  renameSync(tmp, FILE);
}

/* ---------------- live connections ---------------- */
/** agent id -> { ws, pending: Map<requestId, {resolve, timer}>, info, connectedAt } */
const live = new Map();
/** join request id -> { ws, alive }: servers waiting, connected, for the owner's answer */
const waiting = new Map();
/** ip -> times of the requests it made in the last hour */
const asked = new Map();

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
/** A token pairs one server. It does not expire; the newest KEEP_TOKENS unused ones are kept. */
export function createPairingToken() {
  const token = `ops_connect_${randomBytes(24).toString("base64url")}`;
  state.tokens.push({ hash: sha(token), createdAt: new Date().toISOString() });
  state.tokens = state.tokens.slice(-KEEP_TOKENS);
  save();
  return { token };
}

/**
 * Makes an agent up front and returns its credential, which is shown once. For hosts that cannot keep a state
 * file (hosting platforms reset the disk on every deploy): the credential goes into an environment variable, so
 * every deploy and restart reconnects as this same agent instead of pairing again.
 */
export function createAgentCredential(wantedName) {
  const credential = `ops_agent_${randomBytes(32).toString("base64url")}`;
  const agent = { id: randomUUID(), name: uniqueName(cleanName(wantedName) ?? "app"), credentialHash: sha(credential), createdAt: new Date().toISOString() };
  state.agents.push(agent);
  save();
  return { credential, name: agent.name, host: `${AGENT_PREFIX}${agent.name}` };
}

/** Uses a token once. True when it was valid. */
function consumeToken(token) {
  const hash = sha(token);
  const index = state.tokens.findIndex((t) => t.hash === hash);
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

/* ---------------- join requests ---------------- */
function newAgent(wanted, info) {
  const credential = `ops_agent_${randomBytes(32).toString("base64url")}`;
  const agent = { id: randomUUID(), name: uniqueName(wanted), credentialHash: sha(credential), createdAt: new Date().toISOString(), info };
  state.agents.push(agent);
  return { agent, credential };
}

const findRequest = (secret) => {
  const hash = sha(secret);
  return state.requests.find((r) => r.secretHash === hash) ?? null;
};

/** Whether this address may open another request now (and counts it if so). */
function mayAsk(ip) {
  const hour = Date.now() - 60 * 60 * 1000;
  const times = (asked.get(ip) ?? []).filter((t) => t > hour);
  if (times.length >= REQUESTS_PER_IP_HOUR) return false;
  times.push(Date.now());
  asked.set(ip, times);
  return true;
}

export function listRequests() {
  return state.requests
    .filter((r) => r.status === "pending")
    .map((r) => ({
      id: r.id,
      name: r.name,
      hostname: r.info?.hostname ?? null,
      platform: r.info?.platform ?? null,
      os: r.info?.os === "win32" ? "windows" : r.info?.os ? "unix" : null,
      access: r.info?.access ?? "read-only",
      ip: r.ip ?? null,
      oldToken: !!r.oldToken,
      online: waiting.has(r.id),
      createdAt: r.createdAt,
      lastSeen: r.lastSeen ?? null,
    }));
}

/**
 * The owner's answer. The waiting server is told and disconnected; it reconnects at once and is admitted (accept)
 * or uninstalls itself (decline). A server that is offline gets the answer the next time it connects.
 */
function answer(id, status) {
  const r = state.requests.find((x) => x.id === id && x.status === "pending");
  if (!r) return false;
  r.status = status;
  r.answeredAt = new Date().toISOString();
  // keep declined ones (so a returning server is told) but not forever
  const declined = state.requests.filter((x) => x.status === "declined");
  if (declined.length > 200) state.requests = state.requests.filter((x) => x !== declined[0]);
  save();
  const w = waiting.get(id);
  if (w && w.ws.readyState === 1) {
    w.ws.send(JSON.stringify({ type: status, id }));
    w.ws.close(4002, status);
  }
  return true;
}
export const acceptRequest = (id) => answer(id, "accepted");
export const declineRequest = (id) => answer(id, "declined");

/* ---------------- updating agents ---------------- */
let bundled = { mtime: 0, sha256: null, version: null };
/** The agent this console ships (agent/opsmira-agent.mjs): what connected agents are updated to. */
export function bundledAgent() {
  try {
    const file = join(env.agentDir, "opsmira-agent.mjs");
    const mtime = statSync(file).mtimeMs;
    if (mtime !== bundled.mtime) {
      const text = readFileSync(file);
      bundled = { mtime, sha256: createHash("sha256").update(text).digest("hex"), version: /export const VERSION = "([^"]+)"/.exec(String(text))?.[1] ?? null };
    }
  } catch {
    bundled = { mtime: 0, sha256: null, version: null };
  }
  return bundled;
}

/** An agent that can update itself and runs other code than this console ships is sent the new version. */
function offerUpdate(ws, info) {
  if (/^(0|off|false|no)$/i.test(process.env.OPSMIRA_AGENT_UPDATES ?? "")) return;
  const b = bundledAgent();
  if (!b.sha256 || !info.caps?.includes("update") || info.autoUpdate === false) return;
  if (!info.sha256 || info.sha256 === b.sha256 || info.updateFailed === b.sha256) return;
  ws.send(JSON.stringify({ type: "update", sha256: b.sha256, version: b.version }));
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
    os: a.info?.os === "win32" ? "windows" : a.info?.os ? "unix" : null,
    appLog: a.info?.appLog ?? null,
    version: a.info?.agent || null,
    current: a.info?.sha256 ? a.info.sha256 === bundledAgent().sha256 : null,
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
export function callAgent(id, op, params = {}, timeoutMs = 15_000, { signal } = {}) {
  const conn = live.get(id);
  if (!conn || conn.ws.readyState !== 1) return Promise.resolve({ ok: false, code: null, stdout: "", stderr: "agent offline" });
  return new Promise((resolve) => {
    const requestId = randomUUID();
    const finish = (result) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      conn.pending.delete(requestId);
      resolve(result);
    };
    const timer = setTimeout(() => {
      // Stop what it was doing, then give up waiting.
      if (conn.ws.readyState === 1) conn.ws.send(JSON.stringify({ type: "cancel", id: requestId }));
      finish({ ok: false, code: null, stdout: "", stderr: "agent did not answer in time" });
    }, timeoutMs);
    // The owner pressed Stop: tell the agent to kill it and answer right away.
    const onAbort = () => {
      if (conn.ws.readyState === 1) conn.ws.send(JSON.stringify({ type: "cancel", id: requestId }));
      finish({ ok: false, code: null, stdout: "", stderr: "stopped", stopped: true });
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
    conn.pending.set(requestId, { resolve: finish, timer });
    conn.ws.send(JSON.stringify({ type: "req", id: requestId, op, ...params }));
  });
}

/** Run a shell command line on a connected server. Same result shape as exec.js's runCommand. */
export async function runOnAgent(name, command, { signal } = {}) {
  const agent = agentByName(name);
  const started = Date.now();
  const fail = (output) => ({ exitCode: null, output, durationMs: Date.now() - started });
  if (!agent) return fail(`exec error: no connected server named ${name}`);
  if (!live.has(agent.id)) return fail(`exec error: ${name} is not connected right now`);
  const r = await callAgent(agent.id, "shell", { command, timeout: 30_000 }, 40_000, { signal });
  if (r.stopped) return { exitCode: null, output: "", durationMs: Date.now() - started, stopped: true };
  // Refused or never ran (no exit code): say why, rather than returning an empty result.
  if (r.output === undefined || (r.code === null && !r.output && r.stderr)) return fail(`exec error: ${r.stderr || "no answer"}`);
  return { exitCode: r.code, signal: r.signal ?? null, output: r.output, durationMs: r.durationMs ?? Date.now() - started, timedOut: !!r.timedOut };
}

/** What a connected agent says it can do (e.g. "update", "detach"). */
export function agentCaps(name) {
  const agent = agentByName(name);
  return (agent && live.get(agent.id)?.info?.caps) || [];
}

/** Messages an agent sends on its own (a detached run's log and report): one handler, set by detach.js. */
let eventHandler = null;
export function onAgentEvent(fn) {
  eventHandler = fn;
}

/** "windows" for a connected Windows agent (its commands are PowerShell), else "unix". */
export function agentOs(name) {
  const agent = agentByName(name);
  return agent && live.has(agent.id) && live.get(agent.id).info?.os === "win32" ? "windows" : "unix";
}

/** "read-only" or "operate" for an agent that is connected now, else null. */
export function agentAccess(name) {
  const agent = agentByName(name);
  return agent && live.has(agent.id) ? live.get(agent.id).info?.access ?? "read-only" : null;
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
    wss.handleUpgrade(req, socket, head, (ws) => handle(ws, req));
  });

  function handle(ws, req) {
    let agent = null;
    let request = null; // the join request this connection is waiting on
    const ip = (env.trustProxy ? String(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || "").split(",")[0].trim() : "") || req.socket.remoteAddress || "";
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
        if (request) return; // a server waiting for the owner can only wait
        if (msg?.type !== "hello") return refuse("expected hello");
        clearTimeout(helloTimer);
        const info = {
          hostname: String(msg.info?.hostname ?? "").slice(0, 80),
          platform: String(msg.info?.platform ?? "").slice(0, 80),
          agent: String(msg.info?.agent ?? "").slice(0, 20),
          access: msg.info?.access === "operate" ? "operate" : "read-only",
          os: typeof msg.info?.os === "string" ? msg.info.os.slice(0, 20) : undefined,
          appLog: typeof msg.info?.appLog === "string" ? msg.info.appLog.slice(0, 200) : undefined,
          caps: Array.isArray(msg.info?.caps) ? msg.info.caps.filter((c) => typeof c === "string").slice(0, 10).map((c) => c.slice(0, 20)) : [],
          sha256: typeof msg.info?.sha256 === "string" ? msg.info.sha256.slice(0, 64) : undefined,
          autoUpdate: msg.info?.autoUpdate !== false,
          updateFailed: typeof msg.info?.updateFailed === "string" ? msg.info.updateFailed.slice(0, 64) : undefined,
        };
        const wanted = cleanName(msg.name) ?? cleanName(info.hostname) ?? "server";
        let credential = null;
        const known = typeof msg.request === "string" && msg.request ? findRequest(msg.request) : null;
        if (typeof msg.credential === "string" && msg.credential) {
          agent = findByCredential(msg.credential);
          if (!agent) return refuse("unknown or revoked credential");
        } else if (typeof msg.token === "string" && msg.token && consumeToken(msg.token)) {
          ({ agent, credential } = newAgent(wanted, info));
        } else if (known?.status === "accepted") {
          ({ agent, credential } = newAgent(known.name, info));
          state.requests = state.requests.filter((r) => r !== known);
        } else if (known?.status === "declined") {
          state.requests = state.requests.filter((r) => r !== known);
          save();
          ws.send(JSON.stringify({ type: "declined", id: known.id }));
          ws.close(4002, "declined");
          return;
        } else {
          // No usable token: ask the owner. A server that asked before keeps its place in the queue.
          let r = known;
          let secret = null;
          if (!r) {
            if (state.requests.filter((x) => x.status === "pending").length >= MAX_REQUESTS) return refuse("too many servers are waiting to join; ask the console owner", false);
            if (!mayAsk(ip)) return refuse("too many join requests from this address; try again later", false);
            secret = `ops_request_${randomBytes(24).toString("base64url")}`;
            r = { id: randomUUID(), secretHash: sha(secret), name: wanted, status: "pending", createdAt: new Date().toISOString(), oldToken: typeof msg.token === "string" && !!msg.token };
            state.requests.push(r);
          }
          r.info = info;
          r.ip = ip.slice(0, 64);
          r.lastSeen = new Date().toISOString();
          save();
          request = r;
          waiting.get(r.id)?.ws.close(4000, "replaced");
          waiting.set(r.id, { ws, alive: true });
          ws.send(JSON.stringify({ type: "pending", id: r.id, name: r.name, ...(secret ? { secret } : {}) }));
          return;
        }

        // One connection per agent: a newer one replaces the old.
        live.get(agent.id)?.ws.close(4000, "replaced");
        agent.info = info;
        agent.lastSeen = new Date().toISOString();
        save();
        const conn = { ws, pending: new Map(), info, alive: true };
        live.set(agent.id, conn);
        ws.send(JSON.stringify({ type: "ready", id: agent.id, name: agent.name, ...(credential ? { credential } : {}) }));
        offerUpdate(ws, info);
        return;
      }

      if (typeof msg?.type === "string" && msg.type.startsWith("detach-")) {
        try {
          eventHandler?.(`${AGENT_PREFIX}${agent.name}`, msg, (reply) => ws.readyState === 1 && ws.send(JSON.stringify(reply)));
        } catch {
          // a bad message from one agent must not take the gateway down
        }
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
          ...(typeof msg.output === "string" ? { output: msg.output, signal: msg.signal ?? null, durationMs: Number(msg.durationMs) || 0, timedOut: !!msg.timedOut } : {}),
        });
      }
    });

    ws.on("pong", () => {
      const conn = agent ? live.get(agent.id) : request ? waiting.get(request.id) : null;
      if (conn) conn.alive = true;
    });

    ws.on("close", () => {
      clearTimeout(helloTimer);
      if (request && waiting.get(request.id)?.ws === ws) waiting.delete(request.id);
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
    for (const conn of [...live.values(), ...waiting.values()]) {
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

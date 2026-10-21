// The machine a surface reads: this server, or another one over SSH. Collectors only talk to this
// interface, so each one works on either without a second copy.
import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import os from "os";
import { join } from "path";
import { env } from "./env.js";
import { AGENT_PREFIX, agentByName, callAgent, isOnline, listAgents } from "./agents.js";

const DATA = env.dataDir;
const HOSTS_FILE = join(DATA, "hosts.json");

/** [user@]name[:port]. No leading dash, so a host can never be read as an ssh option. */
const HOST_RE = /^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9][A-Za-z0-9._-]*(?::\d{1,5})?$/;
export const parseHost = (host) => (typeof host === "string" && host.length <= 120 && HOST_RE.test(host.trim()) ? host.trim() : null);

/** What `home()` asks a remote machine. The agent's read-only policy allows exactly this script. */
export const HOME_SCRIPT = 'printf %s "$HOME"';

/** Quote one word for the remote shell. */
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** Run a program (no shell) and never throw: { ok, code, stdout, stderr }. */
function spawnRun(file, args, { timeout = 8000, input, env } = {}) {
  return new Promise((resolveRun) => {
    let child;
    try {
      child = spawn(file, args, { env: { ...process.env, LC_ALL: "C", ...env }, timeout });
    } catch (err) {
      resolveRun({ ok: false, code: null, stdout: "", stderr: String(err.message) });
      return;
    }
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      if (stdout.length < 400_000) stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      if (stderr.length < 20_000) stderr += c.toString("utf8");
    });
    child.on("error", (err) => resolveRun({ ok: false, code: null, stdout, stderr: err.code === "ENOENT" ? "not installed" : String(err.message) }));
    child.on("close", (code) => resolveRun({ ok: code === 0, code, stdout, stderr }));
    child.stdin.on("error", () => {});
    child.stdin.end(input ?? undefined);
  });
}

/* ---------------- this server ---------------- */
const local = {
  host: null,
  label: "this server",
  run: (file, args = [], opts) => spawnRun(file, args, opts),
  async readFile(path) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  },
  async listDir(path) {
    try {
      return readdirSync(path).filter((f) => !f.startsWith("."));
    } catch {
      return null;
    }
  },
  async isDir(path) {
    const r = await spawnRun("test", ["-d", path]);
    return r.ok;
  },
  async home() {
    return os.homedir();
  },
  async name() {
    return os.hostname();
  },
  async check() {
    return null;
  },
};
export const localMachine = () => local;

/* ---------------- another server over SSH ---------------- */
const SOCKETS = join(os.tmpdir(), `opsmira-ssh-${process.getuid?.() ?? "u"}`);

function sshArgs(host) {
  let target = host;
  const args = [];
  const port = /:(\d{1,5})$/.exec(host);
  if (port) {
    target = host.slice(0, -port[0].length);
    args.push("-p", port[1]);
  }
  if (process.env.OPSMIRA_SSH_CONFIG) args.push("-F", process.env.OPSMIRA_SSH_CONFIG);
  if (!existsSync(SOCKETS)) mkdirSync(SOCKETS, { recursive: true, mode: 0o700 });
  // BatchMode: never wait on a password or a host-key question. An unknown host key fails, which is the
  // point: only servers you have already connected to from a terminal can be reached.
  args.push(
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=6",
    "-o", "ServerAliveInterval=5",
    "-o", "ServerAliveCountMax=2",
    "-o", "LogLevel=ERROR",
    "-o", "ControlMaster=auto",
    "-o", `ControlPath=${join(SOCKETS, "%C")}`,
    "-o", "ControlPersist=90s",
    "-T",
    target,
    "--",
  );
  return args;
}

/** A short, plain reason for an ssh failure. */
export function sshReason(stderr, host) {
  const e = String(stderr || "");
  if (/not installed/.test(e)) return "The ssh client isn't installed on the Opsmira server.";
  if (/Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(e)) {
    return { reason: `${host} isn't a trusted host yet, or its key changed.`, hint: `From a terminal on the Opsmira server, run ssh ${host} once and accept its key.` };
  }
  if (/Permission denied/i.test(e)) return { reason: `${host} refused the Opsmira server's SSH key.`, hint: "Add the server user's public key to the authorized_keys of the account on that machine." };
  if (/Could not resolve|Name or service not known|nodename nor servname/i.test(e)) return { reason: `Couldn't find a server named ${host}.`, hint: "Check the name, or add it to ~/.ssh/config on the Opsmira server." };
  if (/Connection refused/i.test(e)) return { reason: `${host} refused the connection. SSH may not be running there.` };
  if (/timed out|No route to host|Network is unreachable/i.test(e)) return { reason: `${host} didn't answer in time.` };
  return { reason: `Couldn't connect to ${host}.`, hint: e.trim().split("\n")[0] };
}

const sshMachines = new Map();
export function sshMachine(host) {
  const known = sshMachines.get(host);
  if (known) return known;
  const run = (file, args = [], { timeout = 12000, input } = {}) => {
    const command = `LC_ALL=C ${[file, ...args].map(q).join(" ")}`;
    return spawnRun("ssh", [...sshArgs(host), command], { timeout, input }).then((r) => {
      // The remote shell says 127 when the program is missing.
      if (r.code === 127) return { ...r, stderr: "not installed" };
      return r;
    });
  };
  let hostname = null;
  const machine = {
    host,
    label: host,
    run,
    async readFile(path) {
      const r = await run("cat", [path]);
      return r.ok ? r.stdout : null;
    },
    async listDir(path) {
      const r = await run("ls", ["-1A", path]);
      return r.ok ? r.stdout.split("\n").filter((f) => f && !f.startsWith(".")) : null;
    },
    async isDir(path) {
      return (await run("test", ["-d", path])).ok;
    },
    async home() {
      const r = await run("sh", ["-c", HOME_SCRIPT]);
      return r.ok && r.stdout ? r.stdout.trim() : "/";
    },
    async name() {
      if (hostname) return hostname;
      const r = await run("hostname");
      hostname = r.ok && r.stdout.trim() ? r.stdout.trim() : host;
      return hostname;
    },
    /** Null when the server answers, else why not (an object for collectSurface). */
    async check() {
      const r = await run("true", [], { timeout: 9000 });
      if (r.ok) {
        rememberHost(host);
        return null;
      }
      return sshReason(r.code === null && !r.stderr ? "timed out" : r.stderr, host);
    },
  };
  sshMachines.set(host, machine);
  return machine;
}

/* ---------------- a server that connected itself (opsmira-agent) ---------------- */
const agentMachines = new Map();
export function agentMachine(name) {
  const known = agentMachines.get(name);
  if (known) return known;
  const host = `${AGENT_PREFIX}${name}`;
  // Looked up on every call: the agent may be re-created or revoked while this object is cached.
  const run = async (file, args = [], { timeout = 12000, input } = {}) => {
    const agent = agentByName(name);
    if (!agent) return { ok: false, code: null, stdout: "", stderr: "agent not found" };
    const r = await callAgent(agent.id, "run", { file, args, timeout, input }, timeout + 4000);
    if (r.code === 127 || /not installed/.test(r.stderr)) return { ...r, stderr: "not installed" };
    return r;
  };
  let hostname = null;
  const machine = {
    host,
    label: host,
    run,
    async readFile(path) {
      const r = await run("cat", [path]);
      return r.ok ? r.stdout : null;
    },
    async listDir(path) {
      const r = await run("ls", ["-1A", path]);
      return r.ok ? r.stdout.split("\n").filter((f) => f && !f.startsWith(".")) : null;
    },
    async isDir(path) {
      return (await run("test", ["-d", path])).ok;
    },
    async home() {
      const r = await run("sh", ["-c", HOME_SCRIPT]);
      return r.ok && r.stdout ? r.stdout.trim() : "/";
    },
    async name() {
      if (hostname) return hostname;
      const info = agentByName(name)?.info?.hostname;
      if (info) return (hostname = info);
      const r = await run("hostname");
      return r.ok && r.stdout.trim() ? (hostname = r.stdout.trim()) : name;
    },
    async check() {
      const agent = agentByName(name);
      if (!agent) return { reason: `No connected server is named ${name}.`, hint: "Open Surfaces, then Connect a server, to add one." };
      if (!isOnline(agent.id)) {
        return { reason: `${name} is not connected right now.`, hint: "Check that opsmira-agent is running on that server. It reconnects by itself when it can reach this console." };
      }
      const r = await run("true", [], { timeout: 6000 });
      return r.ok ? null : { reason: `${name} did not answer.`, hint: r.stderr || undefined };
    },
  };
  agentMachines.set(name, machine);
  return machine;
}

/** The machine for a request: this server when no host is given. Null when the host text isn't valid. */
export function machineFor(host) {
  if (!host) return local;
  if (typeof host === "string" && host.startsWith(AGENT_PREFIX)) {
    const name = host.slice(AGENT_PREFIX.length).trim();
    return /^[a-z0-9][a-z0-9._-]{0,39}$/.test(name) ? agentMachine(name) : null;
  }
  const valid = parseHost(host);
  return valid ? sshMachine(valid) : null;
}

/* ---------------- known hosts for the picker ---------------- */
function savedHosts() {
  try {
    const list = JSON.parse(readFileSync(HOSTS_FILE, "utf8"));
    return Array.isArray(list) ? list.filter((h) => parseHost(h)) : [];
  } catch {
    return [];
  }
}

function rememberHost(host) {
  try {
    const list = savedHosts();
    if (list.includes(host)) return;
    if (!existsSync(DATA)) mkdirSync(DATA, { recursive: true });
    writeFileSync(HOSTS_FILE, JSON.stringify([host, ...list].slice(0, 20)));
  } catch {
    // the picker just won't remember it
  }
}

/** Host entries from the ssh config (no wildcards) and servers that have answered before. */
export function knownHosts() {
  const found = new Set();
  const config = process.env.OPSMIRA_SSH_CONFIG || join(os.homedir(), ".ssh", "config");
  try {
    for (const line of readFileSync(config, "utf8").split("\n")) {
      const m = /^\s*Host\s+(.+)$/i.exec(line);
      if (!m) continue;
      for (const h of m[1].trim().split(/\s+/)) if (!/[*?!]/.test(h) && parseHost(h)) found.add(h);
    }
  } catch {
    // no ssh config
  }
  for (const h of savedHosts()) found.add(h);
  for (const a of listAgents()) found.add(a.host);
  return [...found];
}

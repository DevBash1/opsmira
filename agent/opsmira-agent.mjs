#!/usr/bin/env node
// opsmira-agent: connects this server to an Opsmira console without SSH and without any open port.
// It dials out, proves who it is, then runs the programs the console asks for (no shell) and sends back
// the output. One file, no dependencies, Node 22+ (uses the built-in WebSocket).
//
//   node opsmira-agent.mjs --server wss://opsmira.example.com/api/agent/connect --token ops_connect_...
//
// First run: pairs with the one-time token and saves a credential next to the state file (mode 0600).
// Later runs: reconnect with the credential, forever, with backoff.
//
// --access read-only  (default) only the read-only programs the console's surfaces use
// --access operate    also lets the console run shell commands (the console asks its owner before any
//                     change; this is the setting that makes the agent able to act). "full" means the same.
import { spawn } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const VERSION = "0.1.0";

/* ---------------- policy: what read-only allows ---------------- */

// Shell scripts the console legitimately sends for its surfaces. Kept in step with server/src/metrics.js
// and server/src/surfaces.js by a test (server/test/agent-policy.test.js).
export const KNOWN_SHELL_SCRIPTS = [
  "cat /proc/stat; echo; echo --opsmira--; cat /proc/meminfo; echo --opsmira--; cat /proc/net/dev; echo --opsmira--; cat /proc/loadavg /proc/uptime; echo --opsmira--; grep -c ^processor /proc/cpuinfo; grep -m1 'model name' /proc/cpuinfo",
  'printf %s "$HOME"',
];
const PORT_PROBE = /^for p in [0-9 ]{1,200}; do if timeout 1 bash -c "exec 3<>\/dev\/tcp\/127\.0\.0\.1\/\$p" 2>\/dev\/null; then echo "\$p up"; else echo "\$p down"; fi; done$/;

const SYSTEMCTL_READ = new Set(["list-units", "list-timers", "list-unit-files", "is-active", "is-enabled", "status", "show", "cat"]);
const DOCKER_READ = new Set(["ps", "inspect", "logs", "info", "version", "images", "stats"]);
const PLAIN_READ = new Set(["cat", "ls", "tail", "du", "df", "ps", "hostname", "true", "test", "ss", "top", "uname", "uptime", "free", "id", "date"]);

/** Whether `file args` may run at the given access level. Returns null when fine, else the reason. */
export function denied(access, file, args = []) {
  if (access === "operate") return null;
  const name = String(file);
  const first = args.find((a) => !String(a).startsWith("-"));
  if (PLAIN_READ.has(name)) return null;
  if (name === "systemctl") return SYSTEMCTL_READ.has(first) ? null : "systemctl is limited to read-only commands";
  if (name === "docker") {
    if (DOCKER_READ.has(args[0])) return null;
    if (args[0] === "system" && args[1] === "df") return null;
    return "docker is limited to read-only commands";
  }
  if (name === "journalctl") return args.some((a) => /^--(vacuum|rotate|flush|sync|relinquish|setup-keys|update-catalog)/.test(a)) ? "journalctl maintenance flags are not allowed" : null;
  if (name === "crontab") return args.length === 1 && args[0] === "-l" ? null : "crontab is limited to listing";
  if (name === "ufw") return args.length === 1 && args[0] === "status" ? null : "ufw is limited to status";
  if (name === "openssl") return ["x509", "s_client", "version"].includes(args[0]) ? null : "openssl is limited to reading certificates";
  if (name === "sh") {
    const script = args[0] === "-c" ? args[1] : null;
    if (typeof script === "string" && args.length === 2 && (KNOWN_SHELL_SCRIPTS.includes(script) || PORT_PROBE.test(script))) return null;
    return "shell scripts are not allowed in read-only mode";
  }
  return `${name} is not allowed in read-only mode`;
}

/* ---------------- running a program ---------------- */

const MAX_OUTPUT = 2 * 1024 * 1024;

export function runProgram(file, args = [], { timeout = 8000, input } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(file, args, { env: { ...process.env, LC_ALL: "C" }, timeout: Math.min(Math.max(Number(timeout) || 8000, 500), 60000) });
    } catch (err) {
      resolve({ ok: false, code: null, stdout: "", stderr: String(err.message) });
      return;
    }
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      if (stdout.length < MAX_OUTPUT) stdout += c;
    });
    child.stderr.on("data", (c) => {
      if (stderr.length < MAX_OUTPUT) stderr += c;
    });
    child.on("error", (err) => resolve({ ok: false, code: null, stdout, stderr: err.code === "ENOENT" ? "not installed" : String(err.message) }));
    child.on("close", (code) => resolve({ ok: code === 0, code, stdout, stderr }));
    child.stdin.on("error", () => {});
    child.stdin.end(typeof input === "string" ? input : undefined);
  });
}

/* ---------------- shell commands (operate only) ---------------- */

const SHELL_OUTPUT_CAP = 64 * 1024;

/** Run a command line the way the console's own shell runs would, and keep it killable. */
export function runShell(command, { timeout = 30000, onChild } = {}) {
  return new Promise((resolve) => {
    const limit = Math.min(Math.max(Number(timeout) || 30000, 1000), 120000);
    const started = Date.now();
    let child;
    try {
      child = spawn("/bin/sh", ["-c", String(command)], { cwd: os.homedir(), timeout: limit });
    } catch (err) {
      resolve({ ok: false, code: null, output: `exec error: ${err.message}`, durationMs: 0 });
      return;
    }
    onChild?.(child);
    let output = "";
    let truncated = false;
    const onData = (chunk) => {
      if (truncated) return;
      output += chunk.toString("utf8");
      if (output.length > SHELL_OUTPUT_CAP) {
        output = `${output.slice(0, SHELL_OUTPUT_CAP)}\n...[truncated]`;
        truncated = true;
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (err) => resolve({ ok: false, code: null, output: `exec error: ${err.message}`, durationMs: Date.now() - started }));
    child.on("close", (code, signal) =>
      resolve({ ok: code === 0, code, signal, output: output.trim(), durationMs: Date.now() - started, timedOut: signal === "SIGTERM" && Date.now() - started >= limit }),
    );
  });
}

/* ---------------- connection ---------------- */

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const log = (...a) => console.log(new Date().toISOString(), ...a);

function readState(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeState(file, state) {
  writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // best effort
  }
}

function connect(opts, state, onClose) {
  const ws = new WebSocket(opts.server);
  let ready = false;
  const running = new Map(); // request id -> child process, so the console can cancel (Stop)

  ws.addEventListener("open", () => {
    const hello = {
      type: "hello",
      name: opts.name,
      info: { hostname: os.hostname(), platform: `${os.platform()} ${os.release()}`, node: process.version, agent: VERSION, access: opts.access },
    };
    if (state.credential) hello.credential = state.credential;
    else hello.token = opts.token;
    ws.send(JSON.stringify(hello));
  });

  ws.addEventListener("message", async (event) => {
    let msg;
    try {
      msg = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (msg.type === "ready") {
      ready = true;
      if (msg.credential) {
        state.credential = msg.credential;
        state.id = msg.id;
        state.name = msg.name;
        writeState(opts.state, state);
        log(`paired as "${msg.name}"; credential saved to ${opts.state}`);
      } else {
        log(`connected as "${msg.name}" (access: ${opts.access})`);
      }
      return;
    }
    if (msg.type === "error") {
      log(`refused: ${msg.error}`);
      if (msg.fatal) {
        // A revoked credential or a used token will never work again: stop instead of hammering the console.
        if (state.credential && /revoked|unknown/i.test(msg.error)) {
          delete state.credential;
          writeState(opts.state, state);
        }
        process.exitCode = 1;
        opts.stop = true;
      }
      return;
    }
    if (msg.type === "cancel") {
      running.get(msg.id)?.kill("SIGTERM");
      return;
    }
    if (msg.type === "req" && ready) {
      let res;
      if (msg.op === "shell") {
        if (opts.access !== "operate") {
          res = { ok: false, code: null, output: "", stderr: "blocked by the agent (read-only): it was not started with --access operate" };
        } else {
          res = await runShell(msg.command, { timeout: msg.timeout, onChild: (child) => running.set(msg.id, child) });
          running.delete(msg.id);
        }
      } else if (msg.op === "run") {
        const why = denied(opts.access, msg.file, msg.args);
        res = why ? { ok: false, code: null, stdout: "", stderr: `blocked by the agent (${opts.access}): ${why}` } : await runProgram(msg.file, msg.args, { timeout: msg.timeout, input: msg.input });
      } else {
        res = { ok: false, code: null, stdout: "", stderr: `unknown request: ${String(msg.op).slice(0, 40)}` };
      }
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: "res", id: msg.id, ...res }));
    }
  });

  ws.addEventListener("close", () => onClose(ready));
  ws.addEventListener("error", () => {});
  return ws;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log("opsmira-agent --server wss://HOST/api/agent/connect --token ops_connect_... [--name web-1] [--access read-only|operate] [--state FILE]");
    return;
  }
  const opts = {
    server: typeof args.server === "string" ? args.server : process.env.OPSMIRA_SERVER,
    token: typeof args.token === "string" ? args.token : process.env.OPSMIRA_TOKEN,
    name: typeof args.name === "string" ? args.name : os.hostname().toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 40),
    access: args.access === "operate" || args.access === "full" ? "operate" : "read-only",
    state: typeof args.state === "string" ? args.state : join(process.env.HOME || os.homedir(), ".opsmira-agent.json"),
    stop: false,
  };
  if (!opts.server) {
    console.error("Missing --server (the console's agent address, e.g. wss://opsmira.example.com/api/agent/connect).");
    process.exit(2);
  }
  const state = existsSync(opts.state) ? readState(opts.state) : {};
  if (!state.credential && !opts.token) {
    console.error("Missing --token: copy the connect command from the console (Surfaces, Connect a server).");
    process.exit(2);
  }
  if (typeof WebSocket === "undefined") {
    console.error("This needs Node 22 or newer (built-in WebSocket).");
    process.exit(2);
  }
  if (/^ws:\/\//i.test(opts.server) && !/^ws:\/\/(localhost|127\.|\[::1\])/i.test(opts.server)) {
    log("warning: this connection is not encrypted (ws://). Put the console behind HTTPS and use wss:// so the credential is not sent in the clear.");
  }
  if (opts.access === "operate") log("access: OPERATE. The console can run commands as this user (it asks its owner before changes).");

  let delay = 1000;
  const loop = () => {
    if (opts.stop) return;
    connect(opts, state, (wasReady) => {
      if (opts.stop) return;
      delay = wasReady ? 1000 : Math.min(delay * 2, 30000);
      log(`disconnected; retrying in ${Math.round(delay / 1000)}s`);
      setTimeout(loop, delay);
    });
  };
  loop();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

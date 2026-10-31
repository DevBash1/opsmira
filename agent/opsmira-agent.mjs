#!/usr/bin/env node
// opsmira-agent: connects this server to an Opsmira console without SSH and without any open port.
// It dials out, proves who it is, then runs the programs the console asks for (no shell) and sends back
// the output. One file, no dependencies, Node 22+ (uses the built-in WebSocket).
//
//   node opsmira-agent.mjs --server wss://opsmira.example.com/api/agent/connect --token ops_connect_...
//
// First run: pairs with the one-time token and saves a credential next to the state file (mode 0600).
// Without a token (or with one that was used already) it asks to join instead: the console owner sees a request
// and accepts it (it pairs) or declines it (it removes itself). It waits for the answer as long as it takes.
// Later runs: reconnect with the credential, forever, with backoff.
//
// It keeps itself current: when the console ships a different agent, this one downloads it from the console,
// checks its sha256, test-runs it, and restarts into it. If the new one cannot connect three times running it
// goes back to the installed file. --no-auto-update turns that off.
//
// On a hosting platform (no systemd, no root, a disk that resets on every deploy) run your app *under* the
// agent, with a credential made in the console (Connect a server > Hosted app), so each deploy reconnects as
// the same server and the app's output stays readable:
//
//   OPSMIRA_CREDENTIAL=ops_agent_... node opsmira-agent.mjs --server wss://... --name my-app --exec "npm start"
//
// The app runs as a child with its output passed straight through (platform logs keep working) and copied to
// a log file the console can tail. The agent exits with the app's exit code, and a lost connection never stops the app.
//
// --access read-only  (default) only the read-only programs the console's surfaces use
// --access operate    also lets the console run shell commands (the console asks its owner before any
//                     change; this is the setting that makes the agent able to act). "full" means the same.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const VERSION = "0.2.0";
/** What this file is: the console compares it with the agent it ships to know when to send an update. */
const SELF = fileURLToPath(import.meta.url);
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const SELF_SHA = (() => {
  try {
    return sha256(readFileSync(SELF));
  } catch {
    return undefined;
  }
})();
/** Exit code that means "declined: uninstall me" to the systemd unit the installer writes. */
export const DECLINED_EXIT = 78;
/**
 * Staying connected, for as long as the agent runs: only the owner (Decline) or an update ends it. A connection that
 * does not answer within CONNECT_TIMEOUT is dropped and tried again; once connected, the agent pings the console
 * every HEARTBEAT and reconnects when it has heard nothing for three of them (a network that died without closing
 * anything). Between tries it waits 1, 2, 4... up to 30 seconds, forever.
 */
const ms = (name, fallback) => Number(process.env[name]) || fallback;
const CONNECT_TIMEOUT = ms("OPSMIRA_AGENT_CONNECT_TIMEOUT_MS", 30_000);
const HEARTBEAT = ms("OPSMIRA_AGENT_HEARTBEAT_MS", 25_000);
const MAX_RETRY_DELAY = 30_000;

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
const IS_WINDOWS = process.platform === "win32";
// What may run read-only on Windows: plain status programs, none of which change anything.
const WINDOWS_READ = new Set(["hostname", "whoami", "tasklist", "ipconfig", "systeminfo", "netstat", "ver"]);
const PLAIN_READ = new Set(["cat", "ls", "tail", "du", "df", "ps", "hostname", "true", "test", "ss", "top", "uname", "uptime", "free", "id", "date"]);

/** Whether `file args` may run at the given access level. Returns null when fine, else the reason. */
export function denied(access, file, args = []) {
  if (access === "operate") return null;
  const name = String(file);
  if (IS_WINDOWS) return WINDOWS_READ.has(name.toLowerCase().replace(/\.exe$/, "")) ? null : `${name} is not allowed in read-only mode on Windows`;
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
/** Where console commands start: the home directory, or the app's own directory when the agent runs it. */
let shellCwd = os.homedir();

/** Run a command line the way the console's own shell runs would, and keep it killable. */
export function runShell(command, { timeout = 30000, onChild } = {}) {
  return new Promise((resolve) => {
    // The console decides how long a command may run (minutes for upgrades and builds); this only bounds it.
    const limit = Math.min(Math.max(Number(timeout) || 30000, 1000), 6 * 60 * 60_000);
    const started = Date.now();
    let child;
    try {
      // Windows has no /bin/sh: commands there are PowerShell.
      child = IS_WINDOWS
        ? spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", String(command)], { cwd: shellCwd, timeout: limit, windowsHide: true })
        : spawn("/bin/sh", ["-c", String(command)], { cwd: shellCwd, timeout: limit });
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
  if (!file) return; // a credential given by the environment is never written to disk
  try {
    writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
    chmodSync(file, 0o600);
  } catch (err) {
    log(`could not save ${file}: ${err.message}`); // read-only disks are common on hosting platforms
  }
}

function connect(opts, state, onClose) {
  let ws;
  try {
    ws = new WebSocket(opts.server);
  } catch (err) {
    log(`cannot connect to ${opts.server}: ${err.message}`);
    setTimeout(() => onClose(false), 0);
    return null;
  }
  let ready = false;
  let answered = false; // the console replied to the hello (ready, pending or an error)
  let heartbeat = false; // the console answers pings (consoles from before this do not)
  let lastHeard = Date.now();
  const running = new Map(); // request id -> child process, so the console can cancel (Stop)
  const drop = (why) => {
    log(why);
    end();
    try {
      ws.close();
    } catch {
      // dropping anyway
    }
  };
  // Nothing answers (packets dropped, a proxy that holds the request): give up on this try and start another.
  const opening = setTimeout(() => !answered && drop("no answer from the console; trying again"), CONNECT_TIMEOUT);
  const beat = setInterval(() => {
    if (!heartbeat || ws.readyState !== 1) return;
    if (Date.now() - lastHeard > HEARTBEAT * 3) return drop("the console stopped answering; reconnecting");
    ws.send(JSON.stringify({ type: "ping" }));
  }, HEARTBEAT);

  ws.addEventListener("open", () => {
    const hello = {
      type: "hello",
      name: opts.name,
      info: {
        hostname: os.hostname(),
        platform: `${os.platform()} ${os.release()}`,
        node: process.version,
        agent: VERSION,
        os: process.platform,
        access: opts.access,
        caps: ["pending", "update", ...(canDetach(opts) ? ["detach"] : [])],
        sha256: SELF_SHA,
        autoUpdate: canUpdate(opts),
        ...(state.update?.failed ? { updateFailed: state.update.sha256 } : {}),
        ...(opts.appLog ? { appLog: opts.appLog } : {}),
      },
    };
    if (state.credential) hello.credential = state.credential;
    else {
      if (opts.token) hello.token = opts.token;
      if (state.request) hello.request = state.request;
    }
    ws.send(JSON.stringify(hello));
  });

  ws.addEventListener("message", async (event) => {
    let msg;
    try {
      msg = JSON.parse(String(event.data));
    } catch {
      return;
    }
    lastHeard = Date.now();
    if (msg.type === "pong") return;
    if (msg.type === "pending") {
      answered = true;
      heartbeat = !!msg.heartbeat;
      if (msg.secret) {
        state.request = msg.secret;
        writeState(opts.state, state);
      }
      log(`waiting for the console owner to accept this server as "${msg.name}" (it shows under Connect a server)`);
      return;
    }
    if (msg.type === "accepted") {
      log("accepted by the console owner; connecting");
      opts.reconnectNow = true;
      return;
    }
    if (msg.type === "declined") {
      log("the console owner declined this server; removing the agent");
      opts.stop = true;
      forget(opts, state);
      process.exitCode = DECLINED_EXIT;
      setTimeout(() => process.exit(DECLINED_EXIT), 200).unref();
      return;
    }
    if (msg.type === "update") {
      selfUpdate(opts, state, msg).catch((err) => log(`update failed: ${err.message}`));
      return;
    }
    if (msg.type === "detach-ack") {
      detachAcked(opts, msg.id);
      return;
    }
    if (msg.type === "ready") {
      ready = true;
      answered = true;
      heartbeat = !!msg.heartbeat;
      opts.ready = true;
      // Running an update that connected: from now on it is the version to start.
      if (state.update?.sha256 === SELF_SHA && !state.update.ok) {
        state.update.ok = true;
        state.update.tries = 0;
        writeState(opts.state, state);
      }
      if (msg.credential) {
        state.credential = msg.credential;
        delete state.request;
        state.id = msg.id;
        state.name = msg.name;
        writeState(opts.state, state);
        log(`paired as "${msg.name}"${opts.state ? `; credential saved to ${opts.state}` : ""}`);
      } else {
        log(`connected as "${msg.name}" (access: ${opts.access})`);
      }
      return;
    }
    if (msg.type === "error") {
      answered = true;
      log(`refused: ${msg.error}`);
      // Never a reason to stop: the console closes the connection and the agent tries again. A credential the console
      // no longer knows (removed there, or its data was lost) is dropped, so the next try asks to join instead.
      if (msg.fatal && state.credential && /revoked|unknown/i.test(msg.error)) {
        delete state.credential;
        writeState(opts.state, state);
        log("the console no longer knows this server; it will ask to join again");
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
      } else if (msg.op === "detach") {
        res = canDetach(opts) ? startDetachedRun(opts, msg) : { ok: false, code: null, stdout: "", stderr: `blocked by the agent: detached runs need --access operate${IS_WINDOWS ? " on Linux or macOS" : ""}` };
      } else if (msg.op === "detach-tell") {
        res = tellDetachedRun(opts, msg);
      } else if (msg.op === "run") {
        const why = denied(opts.access, msg.file, msg.args);
        res = why ? { ok: false, code: null, stdout: "", stderr: `blocked by the agent (${opts.access}): ${why}` } : await runProgram(msg.file, msg.args, { timeout: msg.timeout, input: msg.input });
      } else {
        res = { ok: false, code: null, stdout: "", stderr: `unknown request: ${String(msg.op).slice(0, 40)}` };
      }
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: "res", id: msg.id, ...res }));
    }
  });

  opts.socket = ws;
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    clearTimeout(opening);
    clearInterval(beat);
    opts.ready = false;
    onClose(ready);
  };
  ws.addEventListener("close", end);
  // Node 22's WebSocket reports a refused upgrade (a proxy's 502 while the console restarts) as an error and never
  // closes: without this the agent would be left with nothing to wait on and exit instead of trying again.
  ws.addEventListener("error", () => {
    if (ended) return; // closing a socket that never opened fires "error" again
    end();
    try {
      ws.close();
    } catch {
      // ending anyway
    }
  });
  return ws;
}

/* ---------------- declined: leave no trace ---------------- */

/** Forget the console: the state file (and any downloaded update) goes. The installer's unit removes the rest. */
function forget(opts, state) {
  for (const file of [opts.state, state.update?.file]) {
    try {
      if (file) unlinkSync(file);
    } catch {
      // already gone
    }
  }
  // The Windows installer runs the agent as SYSTEM from a scheduled task: remove the task and the folder.
  if (IS_WINDOWS && process.env.OPSMIRA_SUPERVISED === "windows-task") {
    const dir = dirname(SELF).replace(/'/g, "''");
    const script = `Start-Sleep 3; Unregister-ScheduledTask -TaskName opsmira-agent -Confirm:$false -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force '${dir}' -ErrorAction SilentlyContinue`;
    spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  }
}

/* ---------------- detached runs (docs/detach.md) ---------------- */

/** A job the console hands over to run here on its own: operate access, a state directory, a POSIX shell. */
const canDetach = (opts) => opts.access === "operate" && !IS_WINDOWS && !!opts.state && !opts.exec;
/** Where runs live: next to the state file (or ~/.opsmira-agent for the default state file in the home directory). */
const detachedBase = (opts) => (dirname(opts.state) === os.homedir() ? join(os.homedir(), ".opsmira-agent") : dirname(opts.state));
const runsDir = (opts) => join(detachedBase(opts), "detached");
const RUN_ID = /^[0-9a-f-]{36}$/;
const KEEP_FINISHED_MS = 24 * 60 * 60 * 1000;

/** Run ids whose report the console has not acknowledged yet. */
function openRuns(opts) {
  try {
    return readdirSync(runsDir(opts)).filter((id) => RUN_ID.test(id) && !existsSync(join(runsDir(opts), id, ".acked")));
  } catch {
    return [];
  }
}

/** The owner's `opsmira` command: a wrapper around a readable copy of the runner (run dirs are private). */
function installCli(opts, text) {
  const base = detachedBase(opts);
  const copy = join(base, "opsmira-detached.mjs");
  writeFileSync(copy, text, { mode: 0o644 });
  const q = (v) => `'${String(v).replace(/'/g, "'\\''")}'`;
  const wrapper = `#!/bin/sh\n# opsmira: follow and talk to a detached Opsmira run on this server. Removed when the console has its report.\nOPSMIRA_AGENT_STATE_DIR=${q(base)} exec ${q(process.execPath)} ${q(copy)} "$@"\n`;
  const tryWrite = (file) => {
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, wrapper, { mode: 0o755 });
      chmodSync(file, 0o755);
      return file;
    } catch {
      return null;
    }
  };
  if (process.env.OPSMIRA_CLI_PATH) return tryWrite(process.env.OPSMIRA_CLI_PATH); // tests, or an owner's choice
  let where = tryWrite("/usr/local/bin/opsmira");
  if (!where) {
    // An account allowed passwordless sudo can still put it on everyone's PATH.
    const tmp = join(base, "opsmira.cli");
    writeFileSync(tmp, wrapper, { mode: 0o755 });
    const r = spawnSyncSafe("sudo", ["-n", "install", "-m", "0755", tmp, "/usr/local/bin/opsmira"]);
    if (r === 0) where = "/usr/local/bin/opsmira";
  }
  return where || tryWrite(join(os.homedir(), ".local", "bin", "opsmira"));
}

function spawnSyncSafe(cmd, args) {
  try {
    return spawnSync(cmd, args, { stdio: "ignore", timeout: 10000 }).status;
  } catch {
    return null;
  }
}

/** Write the run directory (spec, key, the verified runner) and start the runner in its own session. */
function startDetachedRun(opts, msg) {
  const { spec, key, runner } = msg;
  const fail = (why) => ({ ok: false, code: null, stdout: "", stderr: why });
  if (!spec || !RUN_ID.test(String(spec.id)) || typeof key !== "string" || typeof runner?.text !== "string") return fail("incomplete detach request");
  if (sha256(runner.text) !== runner.sha256) return fail("the runner does not match its sha256");
  const dir = join(runsDir(opts), spec.id);
  if (existsSync(dir)) return fail("that run exists already");
  try {
    mkdirSync(join(dir, "inbox"), { recursive: true, mode: 0o700 });
    chmodSync(runsDir(opts), 0o700);
    chmodSync(dir, 0o700);
    writeFileSync(join(dir, "spec.json"), JSON.stringify(spec, null, 2), { mode: 0o600 });
    writeFileSync(join(dir, "key"), key, { mode: 0o600 });
    writeFileSync(join(dir, "runner.mjs"), runner.text, { mode: 0o700 });
    const cli = installCli(opts, runner.text);
    if (cli) writeFileSync(join(dir, "cli"), cli, { mode: 0o600 });
    const out = openSync(join(dir, "runner.out"), "a", 0o600);
    // Its own session: it outlives this connection, and (with KillMode=process) a restart of the agent.
    const child = spawn(process.execPath, [join(dir, "runner.mjs"), "run", dir], { detached: true, stdio: ["ignore", out, out], cwd: os.homedir() });
    child.unref();
    log(`detached run ${spec.id} started (pid ${child.pid})${cli ? `; follow it with: ${cli} watch` : ""}`);
    return { ok: true, code: 0, stdout: "", stderr: "", output: cli ? `Follow it on the server with: ${cli === "/usr/local/bin/opsmira" ? "opsmira" : cli} watch` : `Its log is ${join(dir, "log.jsonl")}` };
  } catch (err) {
    return fail(`could not start: ${err.message}`);
  }
}

/** A message from the owner (read by the runner before its next step), or a stop request. */
function tellDetachedRun(opts, msg) {
  const fail = (why) => ({ ok: false, code: null, stdout: "", stderr: why });
  if (!RUN_ID.test(String(msg.run))) return fail("no such run");
  const dir = join(runsDir(opts), msg.run);
  if (!existsSync(dir)) return fail("no such run");
  if (existsSync(join(dir, "report.json"))) return fail("that run has ended");
  if (msg.stop) writeFileSync(join(dir, "stop"), new Date().toISOString(), { mode: 0o600 });
  else writeFileSync(join(dir, "inbox", `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`), JSON.stringify({ text: String(msg.text ?? "").slice(0, 4000), at: new Date().toISOString() }), { mode: 0o600 });
  return { ok: true, code: 0, stdout: "", stderr: "", output: "" };
}

/** Send what the runners wrote since last time, and each report until the console acknowledges it. */
function relayDetached(opts) {
  const tick = () => {
    const ws = opts.socket;
    if (!opts.ready || !ws || ws.readyState !== 1 || !opts.state) return;
    let ids;
    try {
      ids = readdirSync(runsDir(opts)).filter((id) => RUN_ID.test(id));
    } catch {
      return;
    }
    for (const id of ids) {
      const dir = join(runsDir(opts), id);
      try {
        if (existsSync(join(dir, ".acked"))) {
          if (Date.now() - statSync(join(dir, ".acked")).mtimeMs > KEEP_FINISHED_MS) rmSync(dir, { recursive: true, force: true });
          continue;
        }
        const logFile = join(dir, "log.jsonl");
        const size = existsSync(logFile) ? statSync(logFile).size : 0;
        let offset = existsSync(join(dir, ".relayed")) ? Number(readFileSync(join(dir, ".relayed"), "utf8")) || 0 : 0;
        if (size > offset) {
          const chunk = readFileSync(logFile).subarray(offset);
          const end = chunk.lastIndexOf(10) + 1; // whole lines only
          const entries = String(chunk.subarray(0, end))
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              try {
                return JSON.parse(line);
              } catch {
                return null;
              }
            })
            .filter(Boolean);
          for (let i = 0; i < entries.length; i += 200) ws.send(JSON.stringify({ type: "detach-log", id, entries: entries.slice(i, i + 200) }));
          offset += end;
          writeFileSync(join(dir, ".relayed"), String(offset));
        }
        const report = join(dir, "report.json");
        const sent = join(dir, ".reported");
        if (existsSync(report) && offset >= size && (!existsSync(sent) || Date.now() - statSync(sent).mtimeMs > 30000)) {
          ws.send(JSON.stringify({ type: "detach-report", id, report: JSON.parse(readFileSync(report, "utf8")) }));
          writeFileSync(sent, new Date().toISOString());
        }
      } catch (err) {
        log(`detached run ${id}: ${err.message}`);
      }
    }
  };
  setInterval(tick, 1000).unref();
}

/** The console has the report: the run is done here. Its directory stays a day (for the owner); the command goes. */
function detachAcked(opts, id) {
  if (!RUN_ID.test(String(id))) return;
  const dir = join(runsDir(opts), id);
  if (!existsSync(dir)) return;
  writeFileSync(join(dir, ".acked"), new Date().toISOString());
  log(`detached run ${id}: report delivered`);
  if (openRuns(opts).length) return;
  for (const file of [readFileSafe(join(dir, "cli")), join(detachedBase(opts), "opsmira-detached.mjs"), join(detachedBase(opts), "opsmira.cli")]) {
    if (!file) continue;
    try {
      // only our own wrapper: never a file someone else put at that path
      if (file.endsWith("/opsmira") && !readFileSync(file, "utf8").includes(detachedBase(opts))) continue;
      unlinkSync(file);
    } catch {
      if (file === "/usr/local/bin/opsmira") spawnSyncSafe("sudo", ["-n", "rm", "-f", file]);
    }
  }
}

function readFileSafe(file) {
  try {
    return readFileSync(file, "utf8").trim();
  } catch {
    return null;
  }
}

/* ---------------- updating itself ---------------- */

/** An agent updates itself only when it keeps state on disk and is not supervising a hosted app (redeploy those). */
const canUpdate = (opts) => !opts.noUpdate && !!opts.state && !opts.exec;
const updateFile = (opts) => join(dirname(opts.state), "opsmira-agent.update.mjs");

/** The console ships a different agent: fetch it from the console, check it, test-run it, then restart into it. */
async function selfUpdate(opts, state, msg) {
  if (!canUpdate(opts) || typeof msg.sha256 !== "string" || msg.sha256 === SELF_SHA) return;
  // A restart could cut a detached run short (installs without KillMode=process), and its report must get out first.
  if (openRuns(opts).length) {
    log("an update is waiting until the detached run has reported back");
    return;
  }
  if (state.update?.sha256 === msg.sha256 && state.update.failed) return;
  const origin = opts.server.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:").replace(/\/api\/agent\/connect\/?$/, "");
  const res = await fetch(`${origin}/agent/opsmira-agent.mjs`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`download: HTTP ${res.status}`);
  const code = Buffer.from(await res.arrayBuffer());
  if (sha256(code) !== msg.sha256) throw new Error("the download does not match the sha256 the console sent; keeping this version");
  const target = updateFile(opts);
  const next = target.replace(/\.update\.mjs$/, ".next.mjs"); // .mjs, or Node would not load it as a module
  writeFileSync(next, code, { mode: 0o600 });
  // It must at least load and know its version before it is allowed to replace this one.
  const ok = await new Promise((resolve) => {
    const child = spawn(process.execPath, [next, "--version"], { timeout: 15000 });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.on("error", () => resolve(false));
    child.on("close", (c) => resolve(c === 0 && /\d+\.\d+/.test(out)));
  });
  if (!ok) {
    unlinkSync(next);
    throw new Error("the new agent did not start; keeping this version");
  }
  renameSync(next, target);
  state.update = { file: target, sha256: msg.sha256, version: msg.version ?? null, tries: 0, at: new Date().toISOString() };
  writeState(opts.state, state);
  log(`updated to ${msg.version ?? "a new version"}; restarting into it`);
  opts.stop = true;
  try {
    opts.socket?.close();
  } catch {
    // restarting anyway
  }
  // Under the installer's service (OPSMIRA_SUPERVISED) the service restarts it; otherwise start the next one before leaving.
  if (!process.env.OPSMIRA_SUPERVISED) spawn(process.execPath, process.argv.slice(1), { stdio: "inherit", detached: true }).unref();
  setTimeout(() => process.exit(0), 300).unref();
}

/** At start: run the downloaded update instead of this file, unless it has failed to connect three times. */
async function startUpdate(opts, state) {
  const u = state.update;
  if (process.env.OPSMIRA_AGENT_UPDATED || !canUpdate(opts) || !u?.file || u.failed || u.sha256 === SELF_SHA) return false;
  try {
    if (sha256(readFileSync(u.file)) !== u.sha256) return false;
  } catch {
    return false; // removed (a reinstall clears it): run the installed file
  }
  if (!u.ok && (u.tries ?? 0) >= 3) {
    u.failed = true;
    writeState(opts.state, state);
    log(`update ${u.version ?? ""} never connected; running the installed version`);
    return false;
  }
  if (!u.ok) u.tries = (u.tries ?? 0) + 1;
  writeState(opts.state, state);
  process.env.OPSMIRA_AGENT_UPDATED = "1";
  try {
    const mod = await import(pathToFileURL(u.file).href);
    await mod.main();
    return true;
  } catch (err) {
    // An update that does not even load: forget it and carry on with the installed version.
    u.failed = true;
    writeState(opts.state, state);
    log(`update ${u.version ?? ""} would not start (${err.message}); running the installed version`);
    delete process.env.OPSMIRA_AGENT_UPDATED;
    return false;
  }
}

/* ---------------- running an app under the agent ---------------- */

const APP_LOG_KEEP = 512 * 1024;

/** The app's output file: appended to, and cut back to its last 512 KB (on a line) when it passes twice that. */
function appLogWriter(file) {
  let fd = null;
  let size = 0;
  try {
    fd = openSync(file, "a", 0o600);
    size = statSync(file).size;
  } catch {
    return () => {}; // no writable disk: the output still reaches the platform's own logs
  }
  return (chunk) => {
    try {
      writeSync(fd, chunk);
      size += chunk.length;
      if (size > APP_LOG_KEEP * 2) {
        const kept = readFileSync(file).subarray(-APP_LOG_KEEP);
        const nl = kept.indexOf(10);
        writeFileSync(file, nl >= 0 ? kept.subarray(nl + 1) : kept, { mode: 0o600 });
        size = statSync(file).size;
      }
    } catch {
      // keep the app running whatever happens to the copy
    }
  };
}

/** Runs the app as a child: output passed through and copied, signals forwarded, our exit code is theirs. */
function startApp(opts) {
  const copy = appLogWriter(opts.appLog);
  const child = spawn(opts.exec, { shell: true, stdio: ["inherit", "pipe", "pipe"], env: process.env });
  child.stdout.on("data", (c) => {
    process.stdout.write(c);
    copy(c);
  });
  child.stderr.on("data", (c) => {
    process.stderr.write(c);
    copy(c);
  });
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(sig, () => child.kill(sig));
  child.on("error", (err) => {
    log(`could not start the app: ${err.message}`);
    process.exit(127);
  });
  // Leave when the app's output has been read ("close"), so what it wrote as it died is kept. A grandchild that
  // outlives the app keeps the pipes open, so also leave a moment after "exit" rather than waiting on it.
  let left = false;
  const leave = (code, signal) => {
    if (left) return;
    left = true;
    opts.stop = true;
    try {
      opts.socket?.close();
    } catch {
      // leaving anyway
    }
    log(`the app exited (${signal ?? code}); the agent is stopping with it`);
    process.exit(code ?? 128 + (os.constants.signals[signal] ?? 1));
  };
  child.on("close", leave);
  child.on("exit", (code, signal) => setTimeout(() => leave(code, signal), 500).unref());
}

export async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.version) {
    console.log(`opsmira-agent ${VERSION}`);
    return;
  }
  if (args.help || args.h) {
    console.log("opsmira-agent --server wss://HOST/api/agent/connect [--token ops_connect_...] [--name web-1] [--access read-only|operate] [--state FILE] [--no-auto-update]");
    console.log("opsmira-agent --server wss://HOST/api/agent/connect --credential ops_agent_... --exec \"npm start\"   (run an app under the agent)");
    return;
  }
  const opts = {
    server: typeof args.server === "string" ? args.server : process.env.OPSMIRA_SERVER,
    token: typeof args.token === "string" ? args.token : process.env.OPSMIRA_TOKEN,
    credential: typeof args.credential === "string" ? args.credential : process.env.OPSMIRA_CREDENTIAL,
    exec: typeof args.exec === "string" ? args.exec : process.env.OPSMIRA_EXEC,
    appLog: typeof args["app-log"] === "string" ? args["app-log"] : process.env.OPSMIRA_APP_LOG,
    name: typeof args.name === "string" ? args.name : os.hostname().toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 40),
    access: args.access === "operate" || args.access === "full" ? "operate" : "read-only",
    state: typeof args.state === "string" ? args.state : join(process.env.HOME || os.homedir(), ".opsmira-agent.json"),
    noUpdate: !!args["no-auto-update"] || /^(1|true|yes)$/i.test(process.env.OPSMIRA_NO_AUTO_UPDATE ?? ""),
    stop: false,
  };
  // With --exec the app comes first: a problem with the agent is reported and the app starts without it.
  const refuse = (message) => {
    console.error(message);
    if (opts.exec) {
      console.error("Starting the app without the agent.");
      opts.appLog ||= join(os.tmpdir(), "opsmira-app.log");
      startApp(opts);
    } else process.exit(2);
  };
  if (!opts.server) return refuse("Missing --server (the console's agent address, e.g. wss://opsmira.example.com/api/agent/connect).");
  // A credential from the environment is the whole identity: nothing is read from or written to disk.
  if (opts.credential) opts.state = null;
  if (opts.exec) {
    opts.appLog ||= join(os.tmpdir(), "opsmira-app.log");
    shellCwd = process.cwd();
  } else {
    opts.appLog = undefined;
  }
  if (typeof args.supervised === "string") process.env.OPSMIRA_SUPERVISED = args.supervised;
  // A bug in one request must not take the connection down for good: log it and keep going.
  if (!process.env.OPSMIRA_AGENT_UPDATED) {
    process.on("uncaughtException", (err) => log(`unexpected error (still running): ${err?.stack || err}`));
    process.on("unhandledRejection", (err) => log(`unexpected error (still running): ${err?.stack || err}`));
  }
  const state = opts.credential ? { credential: opts.credential } : existsSync(opts.state) ? readState(opts.state) : {};
  if (await startUpdate(opts, state)) return;
  if (!state.credential && !opts.token && !state.request) log("no token: this server will ask to join, and the console owner accepts or declines it (Connect a server).");
  if (typeof WebSocket === "undefined") return refuse("This needs Node 22 or newer (built-in WebSocket).");
  if (/^ws:\/\//i.test(opts.server) && !/^ws:\/\/(localhost|127\.|\[::1\])/i.test(opts.server)) {
    log("warning: this connection is not encrypted (ws://). Put the console behind HTTPS and use wss:// so the credential is not sent in the clear.");
  }
  if (opts.access === "operate") log("access: OPERATE. The console can run commands as this user (it asks its owner before changes).");

  if (opts.exec) startApp(opts);

  if (canDetach(opts)) relayDetached(opts);

  let delay = 1000;
  let timer = null;
  let failures = 0;
  let quietSince = 0;
  const loop = () => {
    timer = null;
    if (opts.stop) return;
    opts.lastAttempt = Date.now();
    connect(opts, state, (wasReady) => {
      if (opts.stop) return;
      delay = opts.reconnectNow ? 0 : wasReady ? 1000 : Math.min(delay * 2, MAX_RETRY_DELAY);
      opts.reconnectNow = false;
      failures = wasReady ? 1 : failures + 1;
      // Every try is logged at first; after that, one line every 10 minutes, so years offline stay readable.
      if (failures <= 10 || Date.now() - quietSince > 10 * 60_000) {
        log(failures > 10 ? `still trying to reach the console (${failures} tries so far); next in ${Math.round(delay / 1000)}s` : `disconnected; retrying in ${Math.round(delay / 1000)}s`);
        if (failures > 10) quietSince = Date.now();
      }
      timer = setTimeout(loop, delay);
    });
  };
  loop();
  // Whatever goes wrong, never end up neither connected nor about to try again. This timer also keeps the process
  // alive: the agent only leaves when it means to (declined, updating, or its app exited).
  setInterval(() => {
    if (opts.stop || timer) return;
    if (opts.socket && opts.socket.readyState <= 1) return; // connecting or connected
    if (Date.now() - (opts.lastAttempt ?? 0) < 2 * MAX_RETRY_DELAY) return;
    log("not connected and no try scheduled; trying again");
    loop();
  }, MAX_RETRY_DELAY);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

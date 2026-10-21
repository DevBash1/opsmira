import { spawn } from "child_process";
import { homedir } from "os";

// Commands whose first word may run unattended under `inspect`. Read-only by
// convention — anything that mutates state belongs behind propose_action.
const INSPECT_ALLOW = new Set([
  "ls", "cat", "df", "du", "free", "ps", "uptime", "ss", "netstat",
  "systemctl", "journalctl", "docker", "top", "whoami", "uname", "hostname",
  "date", "pwd", "head", "tail", "grep", "find", "wc", "stat", "who", "w",
  "vmstat", "iostat", "lscpu", "lsblk", "lsof", "ip", "env", "id", "nproc",
  "file", "sort", "uniq", "awk", "cut", "last", "lastb", "echo",
]);

// Only genuine shell-syntax dangers belong here. Command *names* (rm, sudo,
// curl, …) don't: the allow-list below already rejects them as soon as they'd
// run as a segment's first word, so banning the bare word too just breaks
// legitimate uses as an argument (`grep sudo /var/log/auth.log`, reading
// `/etc/passwd`, …) for no added safety.
const BLOCKED_PATTERNS = ["<", "`", "$("];

// `>`/`>>` are only dangerous when they write somewhere real. Diagnostic
// one-liners constantly use `2>/dev/null` and `2>&1` to quiet stderr — those
// are no-ops, not a file write, so don't reject on the bare substring.
const REDIRECT_RE_SOURCE = "(\\d*>{1,2}|&>)\\s*(\\S+)";

// awk/grep/sed scripts routinely contain `|`, `>`, `;` inside quotes as part of
// a regex, not as shell operators (e.g. `awk '/nologin|false/'`). Replace the
// *contents* of quoted strings with a neutral filler before any pattern check,
// so quoted text can never be mistaken for a shell metacharacter — while the
// string's length and the quotes themselves stay put, so later code can still
// slice the original command at the same offsets.
function maskQuotes(cmd) {
  let out = "";
  let quote = null;
  for (const c of cmd) {
    if (quote) {
      out += c === quote ? c : "Q";
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') {
      quote = c;
      out += c;
    } else {
      out += c;
    }
  }
  return out;
}

function checkRedirects(masked) {
  const re = new RegExp(REDIRECT_RE_SOURCE, "g");
  let match;
  while ((match = re.exec(masked))) {
    const target = match[2];
    if (target === "/dev/null" || /^&\d$/.test(target)) continue;
    return { ok: false, target };
  }
  return { ok: true };
}

/** Does this look like a read-only diagnostic command we can run unattended? */
export function classifyInspect(command) {
  const cmd = (command || "").trim();
  if (!cmd) return { ok: false, reason: "empty command" };
  const masked = maskQuotes(cmd);
  const lower = masked.toLowerCase();
  for (const bad of BLOCKED_PATTERNS) {
    if (lower.includes(bad)) return { ok: false, reason: `contains "${bad.trim()}"` };
  }

  const redirectCheck = checkRedirects(masked);
  if (!redirectCheck.ok) return { ok: false, reason: `redirects output to "${redirectCheck.target}"` };

  // Chaining check runs with safe redirects (2>&1, 2>/dev/null, …) stripped
  // first, so their `&` isn't mistaken for `&&`/background chaining.
  const withoutRedirects = masked.replace(new RegExp(REDIRECT_RE_SOURCE, "g"), " ");
  if (/[;&]/.test(withoutRedirects)) return { ok: false, reason: "command chaining is not allowed" };

  // Split on pipes found in the masked string (so a `|` inside quotes is never
  // mistaken for a shell pipe), then read each real segment from the original.
  const pipeRe = /\|\|?/g;
  const bounds = [0];
  let m;
  while ((m = pipeRe.exec(masked))) bounds.push(m.index, m.index + m[0].length);
  bounds.push(cmd.length);

  for (let i = 0; i < bounds.length; i += 2) {
    const segment = cmd.slice(bounds[i], bounds[i + 1]).trim();
    if (!segment) continue;
    const firstWord = segment.split(/\s+/)[0];
    if (!INSPECT_ALLOW.has(firstWord)) {
      return { ok: false, reason: `"${firstWord}" is not on the read-only allow-list` };
    }
  }
  return { ok: true };
}

const OUTPUT_CAP = 64 * 1024;
const TIMEOUT_MS = 30_000;

/**
 * Run a shell command with a hard timeout, output cap, and a stripped env.
 * An optional AbortSignal (the owner pressing Stop) kills it; the result is then marked `stopped`.
 */
export function runCommand(command, { signal } = {}) {
  return new Promise((resolve) => {
    const safeEnv = { ...process.env };
    for (const key of Object.keys(safeEnv)) {
      if (key.startsWith("OPENROUTER_") || key === "OPSMIRA_PASSWORD") delete safeEnv[key];
    }

    const child = spawn("/bin/sh", ["-c", command], {
      cwd: homedir(),
      env: safeEnv,
      timeout: TIMEOUT_MS,
      signal,
    });

    let output = "";
    let truncated = false;
    const onData = (chunk) => {
      if (truncated) return;
      output += chunk.toString("utf8");
      if (output.length > OUTPUT_CAP) {
        output = output.slice(0, OUTPUT_CAP) + "\n…[truncated]";
        truncated = true;
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    const started = Date.now();
    child.on("close", (code, killSignal) => {
      resolve({
        exitCode: code,
        signal: killSignal,
        output: output.trim(),
        durationMs: Date.now() - started,
        timedOut: killSignal === "SIGTERM" && Date.now() - started >= TIMEOUT_MS,
        ...(signal?.aborted ? { stopped: true } : {}),
      });
    });
    child.on("error", (err) => {
      // An abort surfaces as an 'error' before 'close'; it isn't a crash of the command.
      if (signal?.aborted) {
        resolve({ exitCode: null, output: output.trim(), durationMs: Date.now() - started, stopped: true });
        return;
      }
      resolve({ exitCode: null, output: `exec error: ${err.message}`, durationMs: Date.now() - started });
    });
  });
}

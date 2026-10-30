#!/usr/bin/env node
// opsmira-detached: works through one approved goal on this server, on its own, for the changes that would cut
// the console's connection halfway (upgrading the proxy the console is reached through, restarting the machine,
// updating Opsmira itself). The agent starts it in its own session; it calls the model directly, runs commands,
// and writes every step to a log the owner can follow on the server. The contract is docs/detach.md.
//
//   node opsmira-detached.mjs run <run dir>        # what the agent starts
//   opsmira status | watch | say "<text>" | stop    # the owner's command (a symlink to this file)
//
// One file, no dependencies, Node 22+ (built-in fetch).
import { spawn } from "node:child_process";
import {
  appendFileSync,
  chownSync,
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { pathToFileURL } from "node:url";

const DEFAULT_MAX_STEPS = 40;
const DEFAULT_MINUTES = 30;
const RUN_TIMEOUT_DEFAULT = 120; // seconds
const RUN_TIMEOUT_MAX = 600;
const MODEL_OUTPUT_CAP = 64 * 1024;
const LOG_OUTPUT_CAP = 16 * 1024;
const NOTE_CAP = 4000;
const MODEL_TIMEOUT_MS = 180_000;
const SUMMARY_TIMEOUT_MS = 60_000;
const MODEL_RETRIES = 3;
// First wait between model retries (then twice as long each time). Tests shorten it.
const RETRY_MS = Number(process.env.OPSMIRA_DETACHED_RETRY_MS) || 2000;
// Past this many characters of transcript, older command outputs are cut so a long run fits the model's context.
const TRANSCRIPT_SOFT_LIMIT = 200_000;
const KEEP_RECENT_RESULTS = 6;

/* ---------------- small helpers ---------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const oneLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const isDenied = (err) => err?.code === "EACCES" || err?.code === "EPERM";

/** Text cut to about `max` characters, keeping the start and the end (errors are usually at the end). */
export function clip(text, max) {
  const s = String(text ?? "");
  if (s.length <= max) return s;
  const half = Math.max(1, Math.floor((max - 40) / 2));
  return `${s.slice(0, half)}\n...[${s.length - 2 * half} characters cut]...\n${s.slice(-half)}`;
}

/** A time from the spec or the log: an ISO string or epoch milliseconds. NaN when it is neither. */
function toTime(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !value.trim()) return NaN;
  return /^\d+$/.test(value.trim()) ? Number(value) : Date.parse(value);
}

function duration(ms) {
  const n = Math.max(0, Number(ms) || 0);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}s`;
  const s = Math.round(n / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function clock(t) {
  const d = new Date(toTime(t));
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
}

/** The file's text, or null when it does not exist. Other errors (permission) are thrown. */
function readText(file) {
  try {
    return readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT" || err.code === "ENOTDIR") return null;
    throw err;
  }
}

function readJson(file) {
  const text = readText(file);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseLine(line) {
  if (!line.trim()) return null;
  try {
    const entry = JSON.parse(line);
    return entry && typeof entry === "object" ? entry : null;
  } catch {
    return null; // a line cut by a crash mid-write
  }
}

/** Every entry of a run's log.jsonl, in order. */
export function readLog(dir) {
  const text = readText(join(dir, "log.jsonl"));
  return text === null ? [] : text.split("\n").map(parseLine).filter(Boolean);
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM"; // alive, owned by another account
  }
}

function killGroup(pid, signal) {
  if (!pid) return;
  try {
    process.kill(-pid, signal); // the command's whole process group: sh and everything it started
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // already gone
    }
  }
}

/* ---------------- budgets and the system prompt ---------------- */

/** maxSteps and the deadline (epoch ms) a spec allows, with the defaults from docs/detach.md. */
export function budgets(spec, startedAt = Date.now()) {
  const steps = Math.floor(Number(spec?.maxSteps));
  const deadline = toTime(spec?.deadline);
  return {
    maxSteps: steps > 0 ? steps : DEFAULT_MAX_STEPS,
    deadline: Number.isFinite(deadline) ? deadline : startedAt + DEFAULT_MINUTES * 60_000,
  };
}

function planText(plan) {
  if (Array.isArray(plan)) return plan.map((p) => `- ${String(p).trim()}`).join("\n");
  return String(plan ?? "").trim() || "(no plan was given: work out the safest one yourself)";
}

/** What the model is told before it starts. It runs unattended on a production server, so this is the safety net. */
export function buildSystemPrompt(spec, { deadline, maxSteps, user = "?", home = "~", pid = process.pid, now = Date.now() } = {}) {
  const server = String(spec?.server || os.hostname());
  const minutes = Math.max(0, Math.round((deadline - now) / 60000));
  const sudo =
    user === "root"
      ? "You are root: be as careful as that deserves."
      : "`sudo -n` may or may not work for this account: try it once when you need it and adapt. Nothing can type a password.";
  const lines = [
    `You are Opsmira's agent, running detached on the server "${server}".`,
    "",
    "The owner approved this job in the Opsmira console. It runs here, on the server itself, because doing it from the console would cut the console's own connection halfway through. While you work nobody is watching the console and nobody can answer a question: you decide each step yourself, and the owner reads your log and your final summary afterwards. The console may be unreachable while you work (for example while the web server or proxy in front of it restarts); that is expected.",
    "",
    `Goal: ${String(spec?.goal ?? "").trim()}`,
    "",
    "Plan the owner approved:",
    planText(spec?.plan),
    "",
    `Why it runs detached: ${String(spec?.why ?? "").trim() || "(not given)"}`,
  ];
  if (typeof spec?.console === "string" && spec.console.trim()) lines.push(`The Opsmira console: ${spec.console.trim()}`);
  lines.push(
    "",
    "How you work",
    `- \`run\` runs one shell command with /bin/sh -c on this server, as the account "${user}", in ${home}, with no input (stdin is closed). One command at a time: read its output before you decide the next one. Each command has a timeout (default ${RUN_TIMEOUT_DEFAULT} s; set \`timeout\` in seconds, up to ${RUN_TIMEOUT_MAX}, for long jobs such as upgrades) and is killed when it passes it. Do not put work in the background: its output is lost and you cannot verify it.`,
    `- ${sudo} Use the non-interactive form of everything (apt-get -y, DEBIAN_FRONTEND=noninteractive, systemctl --no-pager, no editors or pagers).`,
    "- `say` tells the owner something. It goes to the run's log, which they can follow on the server with `opsmira watch` and read in the console later.",
    "- `done` ends the run. Call it once, at the end.",
    `- Budget: ${maxSteps} steps (one per reply you write) and until ${new Date(deadline).toISOString()} (about ${minutes} minutes from now). When either runs out the run ends whether you are finished or not, so leave the server working after every step and call \`done\` before you get there. Each command result tells you what is left.`,
    "- The owner may send messages with `opsmira say`; they arrive as user messages before your next step. They come from the owner and take priority over the plan.",
    `- This runner is process ${pid}. Do not stop it. If the goal needs a reboot, put everything the owner needs in \`say\` messages before you trigger it: the reboot ends this run.`,
    "",
    "Rules for changing a production server",
    "1. Check the state before you change anything: record what the goal touches (versions, service status, the config in use, listening ports, a request to the site or a health check) so you can compare at the end.",
    "2. Back up every file before you edit it (for example cp -a FILE FILE.opsmira-bak-$(date +%Y%m%d%H%M%S)) and say where the backup is.",
    "3. Make the smallest change that reaches the goal, following the plan. If the plan turns out to be wrong, take the most conservative way forward and say why.",
    "4. Check after every change: test a config before you reload it (nginx -t, apachectl configtest, sshd -t, ...), then check the service status, its recent logs, and that it answers.",
    "5. If the result is worse than the starting state and you cannot fix it quickly, roll back to the starting state, check that the rollback worked, and finish with status \"failed\".",
    "6. Do not touch anything outside the goal: no unrelated upgrades, restarts, clean-ups or improvements. Mention what you noticed in the summary instead.",
    "7. Never print secrets (keys, passwords, tokens) to the output: everything is logged.",
    "8. Use `say` at each milestone, in one or two plain sentences: the starting state, each change, each check (passed or failed), a rollback.",
    "",
    'Finish with `done`: status "done" when the goal is reached and verified, "failed" otherwise (also after a rollback). The summary is the report the owner reads first, in plain sentences: what changed, what you verified and how, where the backups are, and anything the owner must do now.',
  );
  return lines.join("\n");
}

const fn = (name, description, properties, required) => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required } },
});

const TOOLS = [
  fn(
    "run",
    "Run one shell command on this server (/bin/sh -c, in the home directory, no input) and get its exit code and output.",
    {
      command: { type: "string", description: "The command line." },
      why: { type: "string", description: "One short sentence: what this command is for. The owner reads it in the log." },
      timeout: { type: "integer", description: `Seconds before the command is killed (default ${RUN_TIMEOUT_DEFAULT}, at most ${RUN_TIMEOUT_MAX}).` },
    },
    ["command", "why"],
  ),
  fn("say", "Tell the owner what is happening: a milestone, a finding, a change of plan. It goes to the run's log.", { text: { type: "string" } }, ["text"]),
  fn(
    "done",
    "End the run. The summary is the report the owner reads first.",
    {
      status: { type: "string", enum: ["done", "failed"], description: '"done" when the goal is reached and verified, "failed" otherwise.' },
      summary: { type: "string", description: "What changed, what was verified and how, where the backups are, and anything the owner must do." },
    },
    ["status", "summary"],
  ),
];

/** A plain account of a run from its log, for when the model cannot write one. */
export function fallbackSummary(entries, headline) {
  const results = new Map(entries.filter((e) => e.type === "result").map((e) => [e.n, e]));
  const runs = entries.filter((e) => e.type === "run");
  const lines = [headline];
  if (!runs.length) lines.push("No commands were run.");
  else {
    const shown = runs.slice(-30);
    lines.push(`Commands run (${runs.length})${runs.length > shown.length ? `, the last ${shown.length}` : ""}:`);
    for (const r of shown) {
      const res = results.get(r.n);
      const outcome = !res ? "no result (interrupted)" : res.timedOut ? "timed out" : `exit ${res.exitCode ?? "?"}`;
      lines.push(`#${r.n} ${clip(oneLine(r.command), 200)} -> ${outcome}`);
    }
  }
  const lastNote = entries.findLast((e) => e.type === "note");
  if (lastNote) lines.push(`Last note: ${clip(oneLine(lastNote.text), 500)}`);
  return lines.join("\n");
}

/* ---------------- running a command ---------------- */

/** Output kept up to `cap` characters: the start and the most recent end. */
function outputCollector(cap) {
  const half = Math.floor(cap / 2);
  let head = "";
  let tail = "";
  let cut = 0;
  return {
    add(text) {
      let s = text;
      if (head.length < half) {
        const room = half - head.length;
        head += s.slice(0, room);
        s = s.slice(room);
      }
      if (!s) return;
      tail += s;
      if (tail.length > half) {
        cut += tail.length - half;
        tail = tail.slice(-half);
      }
    },
    text: () => (cut ? `${head}\n...[${cut} characters cut]...\n${tail}` : head + tail),
  };
}

/** Run one command line the way a person at a shell would, killable as a whole, with its output capped. */
export function runCommand(command, timeoutSec = RUN_TIMEOUT_DEFAULT, onChild) {
  return new Promise((done) => {
    const started = Date.now();
    const home = os.homedir();
    let child;
    try {
      // detached: the command gets its own process group, so a timeout kills everything it started.
      child = spawn("/bin/sh", ["-c", String(command)], { cwd: existsSync(home) ? home : "/", detached: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      done({ exitCode: null, output: `could not start the command: ${err.message}`, durationMs: 0, timedOut: false });
      return;
    }
    onChild?.(child);
    const out = outputCollector(MODEL_OUTPUT_CAP);
    for (const stream of [child.stdout, child.stderr]) {
      const decoder = new StringDecoder("utf8");
      stream.on("data", (chunk) => out.add(decoder.write(chunk)));
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child.pid, "SIGTERM");
      setTimeout(() => killGroup(child.pid, "SIGKILL"), 5000).unref();
    }, timeoutSec * 1000);
    let settled = false;
    const settle = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.destroy();
      child.stderr.destroy();
      done({ exitCode: code ?? null, signal: signal || undefined, output: out.text().trim(), durationMs: Date.now() - started, timedOut });
    };
    child.on("error", (err) => {
      out.add(`\nexec error: ${err.message}`);
      settle(null, null);
    });
    child.on("close", settle);
    // A program the command left running can hold the pipes open long after the shell exited: answer shortly
    // after the exit instead of waiting for it (and then killing it at the timeout).
    child.on("exit", (code, signal) => setTimeout(() => settle(code, signal), 1000));
  });
}

/* ---------------- the runner ---------------- */

function logEntry(ctx, type, fields = {}) {
  // `step` (model calls so far) is extra to the contract: it lets `opsmira status` show the steps of a live run.
  const entry = { t: new Date().toISOString(), type, step: ctx.steps, ...fields };
  ctx.entries.push(entry);
  try {
    appendFileSync(join(ctx.dir, "log.jsonl"), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  } catch {
    // a full or read-only disk: keep going, the report still matters
  }
  return entry;
}

const redact = (ctx, text) => (ctx.key ? String(text).split(ctx.key).join("[key]") : String(text));
const errorText = (err) => [err?.message ?? String(err), err?.cause?.message].filter(Boolean).join(": ");

function budgetLeft(ctx) {
  const steps = Math.max(0, ctx.maxSteps - ctx.steps);
  return `${steps} step${steps === 1 ? "" : "s"} and ${duration(ctx.deadline - Date.now())} left`;
}

/**
 * The end of every run, whatever ended it: the key goes first, then the report (written whole), then the
 * `end` entry. Synchronous, so a signal or a crash handler can call it, and it only ever runs once.
 */
function end(ctx, status, summary) {
  if (ctx.ended) return;
  ctx.ended = true;
  const quietly = (f) => {
    try {
      f();
    } catch {
      // finish the rest anyway
    }
  };
  quietly(() => unlinkSync(join(ctx.dir, "key")));
  if (ctx.child) killGroup(ctx.child.pid, "SIGTERM"); // never leave a command running with nobody reading it
  const report = { status, summary: String(summary ?? "").trim() || "(no summary)", at: new Date().toISOString(), steps: ctx.steps, commands: ctx.commands };
  quietly(() => {
    const tmp = join(ctx.dir, `.report.json.${process.pid}.tmp`);
    writeFileSync(tmp, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, join(ctx.dir, "report.json"));
  });
  logEntry(ctx, "end", { status, summary: report.summary });
  quietly(() => unlinkSync(join(ctx.dir, "pid")));
  process.exit(0);
}

async function chat(ctx, body, timeoutMs) {
  const res = await fetch(`${String(ctx.spec.baseUrl).replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.key}` },
    body: JSON.stringify({ model: ctx.spec.model, ...body }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${oneLine(text).slice(0, 500)}`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`the reply was not JSON: ${oneLine(text).slice(0, 200)}`);
  }
  if (data?.error) throw new Error(oneLine(data.error.message || JSON.stringify(data.error)).slice(0, 500));
  const message = data?.choices?.[0]?.message;
  if (!message || typeof message !== "object") throw new Error("the reply had no message");
  return message;
}

/** Older command outputs cut short once the transcript is long, so a 40-step run still fits the context. */
function compact(messages) {
  const total = messages.reduce((n, m) => n + (typeof m.content === "string" ? m.content.length : 0), 0);
  if (total <= TRANSCRIPT_SOFT_LIMIT) return messages;
  let recent = 0;
  return messages
    .slice()
    .reverse()
    .map((m) => (m.role !== "tool" || ++recent <= KEEP_RECENT_RESULTS ? m : { ...m, content: clip(m.content, 2000) }))
    .reverse();
}

/** The model's next reply, retried with backoff. null when it failed every time or the time ran out. */
async function nextReply(ctx) {
  const body = { messages: compact(ctx.messages), tools: TOOLS };
  for (let attempt = 0; ; attempt++) {
    const left = ctx.deadline - Date.now();
    try {
      return await chat(ctx, body, Math.max(5000, Math.min(MODEL_TIMEOUT_MS, left)));
    } catch (err) {
      const why = redact(ctx, errorText(err));
      if (attempt >= MODEL_RETRIES) {
        logEntry(ctx, "error", { text: `The model call failed ${attempt + 1} times; giving up. Last error: ${why}` });
        return null;
      }
      const wait = RETRY_MS * 2 ** attempt;
      logEntry(ctx, "error", { text: `The model call failed (${why}); retrying in ${duration(wait)}.` });
      await sleep(wait);
      if (Date.now() >= ctx.deadline) return null;
    }
  }
}

function reasoningText(message) {
  for (const key of ["reasoning", "reasoning_content"]) if (typeof message[key] === "string" && message[key].trim()) return message[key].trim();
  if (Array.isArray(message.reasoning_details)) {
    return message.reasoning_details
      .map((p) => (typeof p?.text === "string" ? p.text : typeof p?.summary === "string" ? p.summary : ""))
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }
  return "";
}

function validJson(text) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

const stopRequested = (ctx) => existsSync(join(ctx.dir, "stop"));

/** Messages the owner sent with `opsmira say`, handed to the model and removed. */
function readInbox(ctx) {
  const inbox = join(ctx.dir, "inbox");
  let names;
  try {
    names = readdirSync(inbox)
      .filter((f) => !f.startsWith(".") && !f.endsWith(".tmp")) // a message still being written
      .sort();
  } catch {
    return;
  }
  for (const name of names) {
    const file = join(inbox, name);
    let text = "";
    let at = "";
    try {
      const raw = readFileSync(file, "utf8");
      try {
        const msg = JSON.parse(raw);
        text = String(msg?.text ?? "");
        at = String(msg?.at ?? "");
      } catch {
        text = raw;
      }
    } catch (err) {
      logEntry(ctx, "error", { text: `Could not read the owner's message ${name}: ${err.message}` });
    }
    try {
      unlinkSync(file);
    } catch {
      // read once is enough
    }
    text = text.trim();
    if (!text) continue;
    logEntry(ctx, "user", { text: clip(text, NOTE_CAP) });
    ctx.messages.push({ role: "user", content: `Message from the owner, sent with \`opsmira say\`${at ? ` at ${at}` : ""}:\n${clip(text, 8000)}` });
  }
}

async function runTool(ctx, args) {
  const command = typeof args.command === "string" ? args.command : "";
  if (!command.trim()) return { error: "`command` is empty; nothing was run." };
  const asked = Number(args.timeout);
  const timeout = Number.isFinite(asked) && asked > 0 ? Math.min(Math.max(asked, 1), RUN_TIMEOUT_MAX) : RUN_TIMEOUT_DEFAULT;
  const n = ++ctx.commands;
  logEntry(ctx, "run", { n, command, why: String(args.why ?? "").trim() });
  ctx.current = { n, command };
  const res = await runCommand(command, timeout, (child) => (ctx.child = child));
  ctx.current = null;
  ctx.child = null;
  logEntry(ctx, "result", { n, exitCode: res.exitCode, output: clip(res.output, LOG_OUTPUT_CAP), durationMs: res.durationMs, timedOut: res.timedOut });
  return {
    exitCode: res.exitCode,
    ...(res.signal ? { signal: res.signal } : {}),
    timedOut: res.timedOut,
    durationMs: res.durationMs,
    output: res.output,
    budget: budgetLeft(ctx),
  };
}

/**
 * Carries out one reply: logs what it says, runs its tool calls in order, and answers every call (an
 * unanswered call makes the next request invalid). Returns { status, summary } when the model called done.
 */
async function handleReply(ctx, message) {
  const raw = Array.isArray(message.tool_calls) ? message.tool_calls.filter((c) => c?.function?.name) : [];
  const argText = (c) => (typeof c.function.arguments === "string" ? c.function.arguments : JSON.stringify(c.function.arguments ?? {}));
  const calls = raw.map((c, i) => ({
    id: typeof c.id === "string" && c.id ? c.id : `call_${ctx.steps}_${i}`,
    type: "function",
    // Some providers reject the whole request for a call with broken JSON in the history.
    function: { name: String(c.function.name), arguments: validJson(argText(c)) ? argText(c) : "{}" },
  }));
  const assistant = { role: "assistant", content: typeof message.content === "string" ? message.content : null };
  if (calls.length) assistant.tool_calls = calls;
  for (const k of ["reasoning", "reasoning_details"]) if (message[k] != null) assistant[k] = message[k]; // some models need their reasoning back
  ctx.messages.push(assistant);

  const said = (assistant.content || "").trim() || reasoningText(message);
  if (said) logEntry(ctx, "note", { text: clip(said, NOTE_CAP) });
  if (!calls.length) {
    // Text alone moves nothing forward, and nobody will answer it.
    ctx.messages.push({
      role: "user",
      content: "Nobody is watching the console, so nobody will answer. Continue with the tools: `run` the next command, or call `done` with your summary if the goal is reached (or cannot be).",
    });
    return null;
  }

  let finish = null;
  let ending = false;
  for (const [i, call] of calls.entries()) {
    const reply = (content) => ctx.messages.push({ role: "tool", tool_call_id: call.id, content: typeof content === "string" ? content : JSON.stringify(content) });
    if (ending) {
      reply("Not done: the run is ending.");
      continue;
    }
    let args;
    try {
      args = JSON.parse(argText(raw[i]) || "{}");
    } catch {
      reply({ error: "The arguments were not valid JSON; nothing was done." });
      continue;
    }
    const name = call.function.name;
    if (name === "say") {
      const text = String(args?.text ?? "").trim();
      if (text) logEntry(ctx, "note", { text: clip(text, NOTE_CAP) });
      reply("Logged for the owner.");
    } else if (name === "done") {
      finish = { status: args?.status === "failed" ? "failed" : "done", summary: String(args?.summary ?? "").trim() };
      ending = true;
      reply("Ending the run.");
    } else if (name === "run") {
      if (stopRequested(ctx) || Date.now() >= ctx.deadline) {
        // The checks at the top of the loop end the run with the right status.
        ending = true;
        reply(stopRequested(ctx) ? "Not run: the owner asked the run to stop." : "Not run: the run is out of time.");
        continue;
      }
      reply(await runTool(ctx, args ?? {}));
      if (stopRequested(ctx)) ending = true;
    } else {
      reply({ error: `Unknown tool "${name}". Use run, say or done.` });
    }
  }
  return finish;
}

/** Ends a run that ran out of time or steps, with one last call for the model's own summary. */
async function endOutOfBudget(ctx, status) {
  ctx.ending = status;
  try {
    unlinkSync(join(ctx.dir, "key")); // the run is over: the key goes now (the summary call uses the copy in memory)
  } catch {
    // already gone
  }
  const headline =
    status === "timeout"
      ? "The run ran out of time before the work was finished."
      : `The run used all its ${ctx.maxSteps} steps before the work was finished.`;
  let summary = "";
  try {
    const message = await chat(
      ctx,
      {
        messages: [
          ...compact(ctx.messages),
          {
            role: "user",
            content: `${headline} You cannot run anything more. Write the summary for the owner now, in plain sentences: what you did, what changed, the state the server is in as far as you checked, and what the owner must do or check.`,
          },
        ],
        // The transcript holds tool calls, which some providers refuse without the tools defined: keep them, but
        // allow none.
        tools: TOOLS,
        tool_choice: "none",
      },
      SUMMARY_TIMEOUT_MS,
    );
    summary = typeof message.content === "string" ? message.content.trim() : "";
  } catch (err) {
    logEntry(ctx, "error", { text: `The summary call failed: ${redact(ctx, errorText(err))}` });
  }
  end(ctx, status, summary ? `${headline}\n${summary}` : fallbackSummary(ctx.entries, headline));
}

async function work(ctx) {
  for (;;) {
    if (stopRequested(ctx)) return end(ctx, "stopped", fallbackSummary(ctx.entries, "The owner stopped the run (opsmira stop)."));
    if (Date.now() >= ctx.deadline) return endOutOfBudget(ctx, "timeout");
    if (ctx.steps >= ctx.maxSteps) return endOutOfBudget(ctx, "budget");
    readInbox(ctx);
    const message = await nextReply(ctx);
    if (!message) {
      if (Date.now() >= ctx.deadline) return endOutOfBudget(ctx, "timeout");
      return end(ctx, "failed", fallbackSummary(ctx.entries, `The run failed: the model could not be reached (${MODEL_RETRIES + 1} attempts; the errors are in the log).`));
    }
    ctx.steps++;
    const finish = await handleReply(ctx, message);
    if (finish) {
      const fallback = fallbackSummary(ctx.entries, finish.status === "done" ? "The model finished without a summary." : "The model gave up without a summary.");
      return end(ctx, finish.status, finish.summary || fallback);
    }
  }
}

async function runner(dirArg) {
  if (!dirArg) {
    console.error("usage: opsmira-detached.mjs run <run dir>");
    process.exit(2);
  }
  const dir = resolve(dirArg);
  if (!existsSync(join(dir, "spec.json"))) {
    console.error(`${dir} is not a run directory (no spec.json).`);
    process.exit(2);
  }
  // Never run a directory twice: a second runner would find no key and overwrite the real report.
  if (existsSync(join(dir, "report.json"))) {
    console.error(`${dir} has already ended (report.json exists).`);
    process.exit(2);
  }
  const other = Number(readText(join(dir, "pid")));
  if (other > 0 && other !== process.pid && processAlive(other)) {
    console.error(`${dir} is already being run by process ${other}.`);
    process.exit(2);
  }

  const startedAt = Date.now();
  const ctx = {
    dir,
    spec: {},
    key: "",
    steps: 0,
    commands: 0,
    entries: [],
    messages: [],
    ...budgets({}, startedAt),
    child: null,
    current: null,
    ended: false,
    ending: null,
  };
  writeFileSync(join(dir, "pid"), `${process.pid}\n`, { mode: 0o600 });

  const onSignal = (signal) => {
    if (ctx.ended) return;
    const running = ctx.current;
    const headline = `The runner was terminated (${signal})${running ? ` while command #${running.n} was running (${clip(oneLine(running.command), 200)}); that command was stopped` : ""}.`;
    end(ctx, ctx.ending ?? "stopped", fallbackSummary(ctx.entries, headline));
  };
  process.on("SIGTERM", () => onSignal("SIGTERM"));
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGHUP", () => {}); // a detached run must outlive the terminal or session that started it
  const crash = (err) => {
    if (ctx.ended) return;
    const why = redact(ctx, errorText(err));
    logEntry(ctx, "error", { text: `The runner failed: ${why}` });
    end(ctx, ctx.ending ?? "failed", fallbackSummary(ctx.entries, `The run failed: the runner hit an error (${why}).`));
  };
  process.on("uncaughtException", crash);
  process.on("unhandledRejection", crash);

  try {
    ctx.spec = JSON.parse(readFileSync(join(dir, "spec.json"), "utf8")) ?? {};
  } catch (err) {
    return crash(new Error(`could not read spec.json: ${err.message}`));
  }
  Object.assign(ctx, budgets(ctx.spec, startedAt));
  logEntry(ctx, "start", { goal: String(ctx.spec.goal ?? ""), model: ctx.spec.model, maxSteps: ctx.maxSteps, deadline: new Date(ctx.deadline).toISOString() });
  try {
    ctx.key = readFileSync(join(dir, "key"), "utf8").trim();
  } catch (err) {
    return crash(new Error(`could not read the model key: ${err.code === "ENOENT" ? "the key file is missing" : err.message}`));
  }
  if (!ctx.key) return crash(new Error("the key file is empty"));
  if (!ctx.spec.baseUrl || !ctx.spec.model) return crash(new Error("spec.json has no baseUrl or model"));

  let user = "?";
  try {
    user = os.userInfo().username;
  } catch {
    user = process.env.USER || "?";
  }
  ctx.messages = [
    { role: "system", content: buildSystemPrompt(ctx.spec, { deadline: ctx.deadline, maxSteps: ctx.maxSteps, user, home: os.homedir(), now: startedAt }) },
    { role: "user", content: "Start now. Check the current state first, then work through the goal." },
  ];
  try {
    await work(ctx);
  } catch (err) {
    crash(err);
  }
}

/* ---------------- the `opsmira` command ---------------- */

const HELP = `opsmira: follow and steer a detached Opsmira run on this server.

  opsmira status            goal, state, steps, time left and the last entries
  opsmira watch             follow the log as it grows (Ctrl-C leaves; the run keeps going)
  opsmira say "<text>"      a message the model reads before its next step
  opsmira stop              ask the run to stop after the current command

  --run <dir>               a specific run directory (default: the newest run)

Runs live in <agent state dir>/detached/<id>/ (OPSMIRA_AGENT_STATE_DIR, /var/lib/opsmira-agent or
~/.opsmira-agent). They belong to the agent's account: if you get "permission denied", use sudo.`;

/** Where to look for runs, in order. */
export function stateDirs(env = process.env) {
  if (env.OPSMIRA_AGENT_STATE_DIR) return [env.OPSMIRA_AGENT_STATE_DIR];
  return ["/var/lib/opsmira-agent", join(os.homedir(), ".opsmira-agent")];
}

/** A run directory's spec and when it was created, or null when it is not one. Permission errors are thrown. */
function readRun(dir) {
  const file = join(dir, "spec.json");
  const text = readText(file);
  if (text === null) return null;
  let spec = {};
  try {
    spec = JSON.parse(text) ?? {};
  } catch {
    // still a run: show what there is
  }
  let created = toTime(spec.createdAt);
  if (!Number.isFinite(created)) created = statSync(file).mtimeMs;
  return { dir, spec, created };
}

/** Every run under the state directories (`<dir>/detached/*`), plus the places that could not be read. */
export function findRuns(dirs = stateDirs()) {
  const runs = [];
  const denied = [];
  for (const base of dirs) {
    const root = join(base, "detached");
    let names;
    try {
      names = readdirSync(root);
    } catch (err) {
      if (isDenied(err)) denied.push(root);
      continue;
    }
    for (const name of names) {
      try {
        const run = readRun(join(root, name));
        if (run) runs.push(run);
      } catch (err) {
        if (isDenied(err)) denied.push(join(root, name));
      }
    }
  }
  return { runs, denied };
}

/** The most recently created run (by spec.createdAt). */
export function newestRun(runs) {
  return runs.reduce((best, r) => (!best || r.created > best.created ? r : best), null);
}

class CliError extends Error {}

const sudoHint = (path, command) =>
  `Permission denied reading ${path}. Detached runs belong to the agent's account: run it with sudo (sudo opsmira ${command}).`;

function pickRun(runOption, command) {
  if (runOption) {
    const dir = resolve(runOption);
    let run;
    try {
      run = readRun(dir);
    } catch (err) {
      if (isDenied(err)) throw new CliError(sudoHint(dir, command));
      throw err;
    }
    if (!run) throw new CliError(`${dir} is not a run directory (no spec.json).`);
    return run;
  }
  const dirs = stateDirs();
  const { runs, denied } = findRuns(dirs);
  // Started as <run dir>/runner.mjs through the symlink: that run counts too, wherever the state directory is.
  try {
    const own = readRun(dirname(realpathSync(process.argv[1])));
    if (own && !runs.some((r) => resolve(r.dir) === resolve(own.dir))) runs.push(own);
  } catch {
    // not inside a run directory
  }
  const run = newestRun(runs);
  if (!run) {
    if (denied.length) throw new CliError(sudoHint(denied[0], command));
    throw new CliError(`No detached run found (looked in ${dirs.map((d) => join(d, "detached")).join(", ")}).`);
  }
  if (denied.length) console.error(`(could not read ${denied.join(", ")}: permission denied; use sudo to include it)`);
  return run;
}

/** Whether the run's process is alive, and its report if it has one. */
function runState(dir) {
  const report = readJson(join(dir, "report.json"));
  const pid = Number(readText(join(dir, "pid"))) || 0;
  const pidAlive = pid > 0 && processAlive(pid);
  return { report, pid, pidAlive, running: pidAlive && !report };
}

function indent(text, pad) {
  return String(text ?? "").replace(/\n/g, `\n${" ".repeat(pad)}`);
}

/** One log entry for people: time, what, and (for results) the last lines of output. */
export function formatEntry(entry, { outputLines = 3 } = {}) {
  const e = entry ?? {};
  const line = (label, text) => `${clock(e.t)}  ${label.padEnd(10)} ${indent(text, 21)}`;
  switch (e.type) {
    case "start":
      return line("start", `${e.goal ?? ""} (model ${e.model ?? "?"}, ${e.maxSteps ?? "?"} steps, until ${clock(e.deadline)})`);
    case "note":
      return line("note", e.text ?? "");
    case "user":
      return line("you said", e.text ?? "");
    case "error":
      return line("error", e.text ?? "");
    case "run":
      return line(`run #${e.n}`, `$ ${e.command ?? ""}${e.why ? `\n# ${e.why}` : ""}`);
    case "result": {
      const how = e.timedOut ? "timed out" : `exit ${e.exitCode ?? "?"}`;
      let text = line(`result #${e.n}`, `${how} after ${duration(e.durationMs)}`);
      const lines = String(e.output ?? "").split("\n").filter((l) => l.trim());
      if (outputLines > 0 && lines.length) {
        const shown = lines.slice(-outputLines);
        if (lines.length > shown.length) text += `\n${" ".repeat(21)}| ... (${lines.length - shown.length} more line${lines.length - shown.length === 1 ? "" : "s"})`;
        for (const l of shown) text += `\n${" ".repeat(21)}| ${l}`;
      }
      return text;
    }
    case "end":
      return line("end", `${e.status ?? "?"}: ${e.summary ?? ""}`);
    default:
      return line(String(e.type ?? "?"), JSON.stringify(e));
  }
}

function statusText(run) {
  const { dir, spec } = run;
  const entries = readLog(dir);
  const { report, pid, pidAlive, running } = runState(dir);
  const start = entries.find((e) => e.type === "start");
  const endEntry = entries.findLast((e) => e.type === "end");
  const maxSteps = start?.maxSteps ?? budgets(spec).maxSteps;
  const steps = report?.steps ?? entries.reduce((n, e) => Math.max(n, Number(e.step) || 0), 0);
  const commands = report?.commands ?? entries.filter((e) => e.type === "run").length;
  const state = running
    ? `running (pid ${pid})`
    : report?.status ?? endEntry?.status ?? (pid && !pidAlive ? "not running (the runner exited without a report)" : "not started yet");
  const rows = [
    ["Goal", spec.goal ?? "?"],
    ["Server", spec.server ?? os.hostname()],
    ["State", state],
    ["Steps", `${steps} of ${maxSteps}`],
    ["Commands", String(commands)],
  ];
  if (running) {
    const left = toTime(start?.deadline ?? spec.deadline) - Date.now();
    rows.push(["Time left", Number.isNaN(left) ? "?" : left > 0 ? duration(left) : "none (it ends after the current step)"]);
  } else if (report?.at) {
    rows.push(["Ended", `${new Date(report.at).toLocaleString()}`]);
  }
  rows.push(["Run", dir]);
  const out = rows.map(([k, v]) => `${`${k}:`.padEnd(11)}${indent(v, 11)}`);
  const summary = report?.summary ?? endEntry?.summary;
  if (summary) out.push("", "Summary:", `  ${indent(summary, 2)}`);
  const last = entries.slice(-5);
  out.push("", last.length ? "Last entries:" : "The log is empty.");
  for (const e of last) out.push(formatEntry(e, { outputLines: 3 }));
  return out.join("\n");
}

/** Bytes of a file from `offset` on (empty when it does not exist yet). */
function readFrom(file, offset) {
  let fd;
  try {
    fd = openSync(file, "r");
  } catch (err) {
    if (err.code === "ENOENT") return Buffer.alloc(0);
    throw err;
  }
  try {
    const size = fstatSync(fd).size;
    if (size <= offset) return Buffer.alloc(0);
    const buf = Buffer.alloc(Math.min(size - offset, 1024 * 1024));
    const n = readSync(fd, buf, 0, buf.length, offset);
    return buf.subarray(0, n);
  } finally {
    closeSync(fd);
  }
}

async function watch(run) {
  const file = join(run.dir, "log.jsonl");
  const decoder = new StringDecoder("utf8");
  let offset = 0;
  let pending = "";
  let lastCheck = 0;
  let final = false;
  process.on("SIGINT", () => {
    console.log("\nLeft watch; the run keeps going.");
    process.exit(0);
  });
  console.log(`Watching "${run.spec.goal ?? run.dir}" (Ctrl-C leaves; the run keeps going)\n`);
  for (;;) {
    const chunk = readFrom(file, offset);
    if (chunk.length) {
      offset += chunk.length;
      pending += decoder.write(chunk);
      const lines = pending.split("\n");
      pending = lines.pop();
      for (const l of lines) {
        const e = parseLine(l);
        if (!e) continue;
        console.log(formatEntry(e, { outputLines: 20 }));
        if (e.type === "end") return 0;
      }
      continue;
    }
    if (final) {
      console.log("\nThe runner is no longer running and its log has no end entry.");
      return 1;
    }
    // A runner killed outright (SIGKILL, power loss) never writes `end`: notice instead of waiting forever.
    if (Date.now() - lastCheck > 2000) {
      lastCheck = Date.now();
      const { report, pid, pidAlive } = runState(run.dir);
      if (!pidAlive && (pid || report)) {
        final = true; // one more read: the end entry may have landed just now
        continue;
      }
    }
    await sleep(500);
  }
}

/** Gives a file root created (sudo opsmira ...) to the run's account, so the runner can read it. */
function giveToRunOwner(path, dir) {
  if (process.getuid?.() !== 0) return;
  try {
    const st = statSync(dir);
    if (st.uid !== 0) chownSync(path, st.uid, st.gid);
  } catch {
    // the runner reports a message it cannot read
  }
}

function ensureLive(run) {
  const { report, pid, pidAlive } = runState(run.dir);
  if (report) throw new CliError(`This run has already ended (${report.status}). See: opsmira status`);
  if (pid && !pidAlive) throw new CliError("This run's runner is no longer running (it exited without a report).");
}

function say(run, text) {
  ensureLive(run);
  const inbox = join(run.dir, "inbox");
  if (!existsSync(inbox)) {
    mkdirSync(inbox, { mode: 0o700 });
    giveToRunOwner(inbox, run.dir);
  }
  const name = `${Date.now()}-${process.pid}.json`;
  const tmp = join(inbox, `.${name}.tmp`);
  // Written aside and renamed, so the runner never reads half a message.
  writeFileSync(tmp, `${JSON.stringify({ text, at: new Date().toISOString() })}\n`, { mode: 0o600 });
  giveToRunOwner(tmp, run.dir);
  renameSync(tmp, join(inbox, name));
  console.log("Sent. The model reads it before its next step (after the current command, if one is running).");
}

function stop(run) {
  ensureLive(run);
  const file = join(run.dir, "stop");
  writeFileSync(file, `${new Date().toISOString()}\n`, { mode: 0o600 });
  giveToRunOwner(file, run.dir);
  console.log("Asked the run to stop. It finishes the current command first; `opsmira watch` shows when it ends.");
}

function parseCli(argv) {
  const out = { command: null, rest: [], run: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--run") out.run = argv[++i] ?? null;
    else if (a.startsWith("--run=")) out.run = a.slice(6);
    else if (a === "--help" || a === "-h" || (!out.command && a === "help")) out.help = true;
    else if (!out.command) out.command = a;
    else out.rest.push(a);
  }
  return out;
}

async function cli(argv) {
  const args = parseCli(argv);
  if (args.help || !args.command) {
    console.log(HELP);
    return 0;
  }
  if (!["status", "watch", "say", "stop"].includes(args.command)) {
    console.error(`Unknown command "${args.command}".\n\n${HELP}`);
    return 2;
  }
  const text = args.rest.join(" ").trim();
  if (args.command === "say" && !text) {
    console.error('Usage: opsmira say "<text>"');
    return 2;
  }
  try {
    const run = pickRun(args.run, args.command);
    if (args.command === "status") console.log(statusText(run));
    else if (args.command === "watch") return await watch(run);
    else if (args.command === "say") say(run, text);
    else stop(run);
    return 0;
  } catch (err) {
    if (err instanceof CliError) console.error(err.message);
    else if (isDenied(err)) console.error(sudoHint(err.path ?? "the run directory", args.command));
    else console.error(`opsmira ${args.command}: ${err.message}`);
    return 1;
  }
}

async function main() {
  if (process.argv[2] === "run") return runner(process.argv[3]);
  process.exitCode = await cli(process.argv.slice(2));
}

// Through the `opsmira` symlink argv[1] is the link, while import.meta.url is always the real file.
const invokedDirectly = (() => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();
if (invokedDirectly) main();

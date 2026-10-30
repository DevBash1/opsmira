// The detached runner as a real process, against a stand-in for the model (OpenAI-compatible, not streamed),
// and the `opsmira` command the owner uses on the server.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RUNNER = new URL("../../agent/opsmira-detached.mjs", import.meta.url).pathname;
const { buildSystemPrompt, budgets, fallbackSummary, findRuns, formatEntry, newestRun, readLog } = await import(RUNNER);

const KEY = "sk-test-secret-123";
const temps = [];
const children = [];
const servers = [];

after(() => {
  for (const c of children) if (c.exitCode === null && c.signalCode === null) c.kill("SIGKILL");
  for (const s of servers) s.close();
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(check, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await sleep(25);
  }
  assert.fail("timed out waiting");
}

/**
 * A model that answers each request with the next scripted reply: { content, calls: [[name, args], ...] } or
 * { status } for an error. `script` is a list, or a function (body, n) => reply.
 */
async function fakeModel(script) {
  const requests = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const parsed = JSON.parse(body);
      requests.push({ body: parsed, auth: req.headers.authorization, path: req.url });
      const next = typeof script === "function" ? await script(parsed, requests.length) : script.shift();
      if (next?.status) {
        res.writeHead(next.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: `Incorrect API key provided: ${KEY}` } }));
        return;
      }
      const message = { role: "assistant", content: next?.content ?? null };
      if (next?.calls) {
        message.tool_calls = next.calls.map(([name, args], i) => ({ id: `call_${requests.length}_${i}`, type: "function", function: { name, arguments: JSON.stringify(args) } }));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message, finish_reason: message.tool_calls ? "tool_calls" : "stop" }] }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return { url: `http://127.0.0.1:${server.address().port}/v1`, requests };
}

/** A run directory the way the agent writes one: <state>/detached/<id>/ with spec.json and key. */
function makeRun(baseUrl, spec = {}) {
  const state = mkdtempSync(join(tmpdir(), "opsmira-detached-"));
  temps.push(state);
  const id = `run-${Math.random().toString(36).slice(2, 10)}`;
  const dir = join(state, "detached", id);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(dir, "spec.json"),
    JSON.stringify({
      id,
      goal: "Say hello on the test box",
      plan: "Run echo hello and check it printed.",
      why: "A test.",
      server: "test-box",
      model: "test-model",
      baseUrl,
      maxSteps: 10,
      deadline: new Date(Date.now() + 60_000).toISOString(),
      createdAt: new Date().toISOString(),
      console: "http://127.0.0.1:1",
      ...spec,
    }),
  );
  writeFileSync(join(dir, "key"), `${KEY}\n`, { mode: 0o600 });
  return { state, dir };
}

function startRunner(run, env = {}) {
  const child = spawn(process.execPath, [RUNNER, "run", run.dir], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, HOME: run.state, ...env } });
  children.push(child);
  let output = "";
  child.stdout.on("data", (c) => (output += c));
  child.stderr.on("data", (c) => (output += c));
  const exited = new Promise((r) => child.on("exit", (code) => r(code)));
  return { child, exited, output: () => output };
}

async function finished(runner) {
  let timer;
  const late = new Promise((r) => (timer = setTimeout(() => r("still running"), 8000)));
  const code = await Promise.race([runner.exited, late]);
  clearTimeout(timer);
  assert.equal(code, 0, `the runner should exit 0 (output: ${runner.output()})`);
}

function cli(args, env = {}, script = RUNNER) {
  return new Promise((done) =>
    execFile(process.execPath, [script, ...args], { env: { ...process.env, ...env }, timeout: 8000 }, (err, stdout, stderr) =>
      done({ code: err ? (err.code ?? 1) : 0, stdout, stderr }),
    ),
  );
}

const report = (run) => JSON.parse(readFileSync(join(run.dir, "report.json"), "utf8"));
const types = (run) => readLog(run.dir).map((e) => e.type);

test("works through say + run, then done: the log, the report, and the key and pid gone", async () => {
  const model = await fakeModel([
    { content: "Checking the box first.", calls: [["say", { text: "Starting: saying hello." }], ["run", { command: "echo hello", why: "the goal" }]] },
    { calls: [["done", { status: "done", summary: "Printed hello. Nothing else changed." }]] },
  ]);
  const run = makeRun(model.url);
  await finished(startRunner(run));

  assert.deepEqual(types(run), ["start", "note", "note", "run", "result", "end"]);
  const log = readLog(run.dir);
  assert.equal(log[0].goal, "Say hello on the test box");
  assert.equal(log[0].maxSteps, 10);
  assert.equal(log[1].text, "Checking the box first.");
  assert.equal(log[2].text, "Starting: saying hello.");
  assert.deepEqual([log[3].n, log[3].command, log[3].why], [1, "echo hello", "the goal"]);
  assert.equal(log[4].n, 1);
  assert.equal(log[4].exitCode, 0);
  assert.equal(log[4].timedOut, false);
  assert.match(log[4].output, /hello/);
  assert.deepEqual([log[5].status, log[5].summary], ["done", "Printed hello. Nothing else changed."]);
  for (const e of log) assert.ok(!Number.isNaN(Date.parse(e.t)));

  const r = report(run);
  assert.deepEqual([r.status, r.summary, r.steps, r.commands], ["done", "Printed hello. Nothing else changed.", 2, 1]);
  assert.ok(!Number.isNaN(Date.parse(r.at)));
  assert.equal(existsSync(join(run.dir, "key")), false, "the key is deleted");
  assert.equal(existsSync(join(run.dir, "pid")), false, "the pid file is removed");
  assert.ok(!readFileSync(join(run.dir, "log.jsonl"), "utf8").includes(KEY), "the key never reaches the log");

  // What the model was sent.
  const [first, second] = model.requests;
  assert.equal(first.path, "/v1/chat/completions");
  assert.equal(first.auth, `Bearer ${KEY}`);
  assert.equal(first.body.model, "test-model");
  assert.equal(first.body.stream, undefined);
  assert.deepEqual(first.body.tools.map((t) => t.function.name), ["run", "say", "done"]);
  assert.equal(first.body.messages[0].role, "system");
  assert.match(first.body.messages[0].content, /Say hello on the test box/);
  assert.match(first.body.messages[0].content, /nobody is watching the console/);
  const tools = second.body.messages.filter((m) => m.role === "tool");
  assert.deepEqual(tools.map((m) => m.tool_call_id), ["call_1_0", "call_1_1"], "every call is answered, in order");
  assert.equal(JSON.parse(tools[1].content).output, "hello");
  assert.equal(JSON.parse(tools[1].content).exitCode, 0);
});

test("a stop file present after a command ends the run as stopped, before another model call", async () => {
  let run;
  // The command itself plays the owner running `opsmira stop` while it works.
  const model = await fakeModel(() => ({ calls: [["run", { command: `touch '${join(run.dir, "stop")}'; echo one`, why: "work, then the owner stops it" }]] }));
  run = makeRun(model.url);
  await finished(startRunner(run));

  assert.equal(model.requests.length, 1, "no model call after the stop");
  assert.deepEqual(types(run), ["start", "run", "result", "end"]);
  const r = report(run);
  assert.equal(r.status, "stopped");
  assert.match(r.summary, /stopped the run/);
  assert.match(r.summary, /#1 .*echo one -> exit 0/);
  assert.equal(r.commands, 1);
  assert.equal(existsSync(join(run.dir, "key")), false);
  assert.equal(existsSync(join(run.dir, "pid")), false);
});

test("maxSteps 1 ends with budget, and the model writes the summary in one call without tools", async () => {
  const model = await fakeModel([{ calls: [["run", { command: "echo hello", why: "step one" }]] }, { content: "Ran echo hello; the goal is not finished." }]);
  const run = makeRun(model.url, { maxSteps: 1 });
  await finished(startRunner(run));

  assert.equal(model.requests.length, 2);
  assert.equal(model.requests[1].body.tool_choice, "none");
  assert.match(model.requests[1].body.messages.at(-1).content, /used all its 1 steps/);
  const r = report(run);
  assert.equal(r.status, "budget");
  assert.match(r.summary, /Ran echo hello; the goal is not finished\./);
  assert.deepEqual([r.steps, r.commands], [1, 1]);
  assert.equal(existsSync(join(run.dir, "key")), false);
  assert.equal(readLog(run.dir).at(-1).type, "end");
});

test("past the deadline it ends with timeout; when the summary call fails the summary comes from the log", async () => {
  const model = await fakeModel([{ calls: [["run", { command: "sleep 2.5; echo slow", why: "a slow step" }]] }, { status: 500 }]);
  const run = makeRun(model.url, { deadline: new Date(Date.now() + 2000).toISOString() });
  await finished(startRunner(run));

  const r = report(run);
  assert.equal(r.status, "timeout");
  assert.match(r.summary, /ran out of time/);
  assert.match(r.summary, /#1 sleep 2\.5; echo slow -> exit 0/, "the command was not cut short by the deadline");
  assert.deepEqual(types(run), ["start", "run", "result", "error", "end"]);
  assert.equal(existsSync(join(run.dir, "key")), false);
  assert.ok(!readFileSync(join(run.dir, "log.jsonl"), "utf8").includes(KEY), "the key is redacted from errors");
});

test("a model that keeps failing is retried 3 times, then the run fails", async () => {
  const model = await fakeModel(() => ({ status: 500 }));
  const run = makeRun(model.url);
  await finished(startRunner(run, { OPSMIRA_DETACHED_RETRY_MS: "10" }));

  assert.equal(model.requests.length, 4);
  assert.deepEqual(types(run), ["start", "error", "error", "error", "error", "end"]);
  assert.match(readLog(run.dir)[1].text, /retrying/);
  assert.match(readLog(run.dir)[4].text, /giving up/);
  const r = report(run);
  assert.equal(r.status, "failed");
  assert.equal(r.steps, 0);
  assert.equal(existsSync(join(run.dir, "key")), false);
  assert.ok(!readFileSync(join(run.dir, "log.jsonl"), "utf8").includes(KEY));
});

test("opsmira say (found through the state directory) reaches the model before its next step", async () => {
  let run;
  const model = await fakeModel(async (body, n) => {
    if (n === 1) {
      const sent = await cli(["say", "use", "port 8443 instead"], { OPSMIRA_AGENT_STATE_DIR: run.state });
      assert.equal(sent.code, 0, sent.stderr);
      assert.match(sent.stdout, /Sent/);
      return { calls: [["run", { command: "echo working", why: "step one" }]] };
    }
    return { calls: [["done", { status: "done", summary: "Used port 8443." }]] };
  });
  run = makeRun(model.url);
  await finished(startRunner(run));

  const seen = model.requests[1].body.messages.at(-1);
  assert.equal(seen.role, "user");
  assert.match(seen.content, /use port 8443 instead/);
  assert.deepEqual(types(run), ["start", "run", "result", "user", "end"]);
  assert.equal(readLog(run.dir)[3].text, "use port 8443 instead");
  assert.deepEqual(readdirSync(join(run.dir, "inbox")), [], "the message is removed once read");
  assert.equal(report(run).summary, "Used port 8443.");

  // The run has ended: say and stop refuse.
  const late = await cli(["say", "too late", "--run", run.dir]);
  assert.equal(late.code, 1);
  assert.match(late.stderr, /already ended \(done\)/);
});

test("SIGTERM during a command stops the command and ends the run as stopped", async () => {
  const model = await fakeModel([{ calls: [["run", { command: "echo $$ > cmd.pid; exec sleep 30", why: "a long step" }]] }]);
  const run = makeRun(model.url);
  const runner = startRunner(run);
  await until(() => existsSync(join(run.state, "cmd.pid")) && readFileSync(join(run.state, "cmd.pid"), "utf8").trim());
  const cmdPid = Number(readFileSync(join(run.state, "cmd.pid"), "utf8"));
  runner.child.kill("SIGTERM");
  await finished(runner);

  const r = report(run);
  assert.equal(r.status, "stopped");
  assert.match(r.summary, /terminated \(SIGTERM\) while command #1 was running/);
  assert.match(r.summary, /no result \(interrupted\)/);
  assert.equal(existsSync(join(run.dir, "key")), false);
  assert.equal(existsSync(join(run.dir, "pid")), false);
  // Gone, or a zombie waiting to be reaped (where PID 1 does not reap, kill(pid, 0) would still succeed).
  await until(() => {
    try {
      return /^\d+ \(.*\) Z/.test(readFileSync(`/proc/${cmdPid}/stat`, "utf8"));
    } catch {
      return true;
    }
  }, 3000);
});

test("opsmira status on a finished run, also through a symlink named opsmira", async () => {
  const model = await fakeModel([
    { calls: [["run", { command: "echo hello", why: "the goal" }]] },
    { calls: [["done", { status: "done", summary: "Printed hello." }]] },
  ]);
  const run = makeRun(model.url);
  await finished(startRunner(run));

  const shown = await cli(["status", "--run", run.dir]);
  assert.equal(shown.code, 0, shown.stderr);
  assert.match(shown.stdout, /Goal: +Say hello on the test box/);
  assert.match(shown.stdout, /Server: +test-box/);
  assert.match(shown.stdout, /State: +done/);
  assert.match(shown.stdout, /Steps: +2 of 10/);
  assert.match(shown.stdout, /Commands: +1/);
  assert.match(shown.stdout, /Printed hello\./);
  assert.match(shown.stdout, /run #1 +\$ echo hello/);
  assert.match(shown.stdout, /result #1 +exit 0/);
  assert.match(shown.stdout, /\| hello/);

  const link = join(run.state, "opsmira");
  symlinkSync(RUNNER, link);
  const viaLink = await cli(["status"], { OPSMIRA_AGENT_STATE_DIR: run.state }, link);
  assert.equal(viaLink.code, 0, viaLink.stderr);
  assert.match(viaLink.stdout, /State: +done/);

  const watched = await cli(["watch", "--run", run.dir]);
  assert.equal(watched.code, 0, "watch leaves at the end entry");
  assert.match(watched.stdout, /end +done: Printed hello\./);

  const stopped = await cli(["stop", "--run", run.dir]);
  assert.equal(stopped.code, 1);
  assert.equal(existsSync(join(run.dir, "stop")), false);
});

test("helpers: budgets, system prompt, entry format, newest run, fallback summary", () => {
  const started = Date.parse("2026-01-01T00:00:00Z");
  assert.deepEqual(budgets({}, started), { maxSteps: 40, deadline: started + 30 * 60_000 });
  assert.deepEqual(budgets({ maxSteps: 5, deadline: "2026-01-01T00:10:00Z" }, started), { maxSteps: 5, deadline: started + 600_000 });

  const prompt = buildSystemPrompt(
    { goal: "Upgrade nginx", plan: ["back up the config", "apt-get install nginx"], why: "nginx fronts the console", server: "web-1" },
    { deadline: started + 600_000, maxSteps: 12, user: "opsmira", home: "/home/opsmira", now: started },
  );
  for (const text of ["web-1", "Upgrade nginx", "- back up the config", "nginx fronts the console", "nobody is watching", "Back up every file", "roll back", "smallest change", "outside the goal", "`say`", "`done`", "sudo -n", "12 steps", "about 10 minutes"]) {
    assert.ok(prompt.includes(text), `the prompt mentions ${text}`);
  }

  const result = formatEntry({ t: "2026-01-01T00:00:00Z", type: "result", n: 2, exitCode: 1, durationMs: 1500, timedOut: false, output: "a\nb\nc\nd" }, { outputLines: 2 });
  assert.match(result, /result #2 +exit 1 after 1\.5s/);
  assert.match(result, /\| \.\.\. \(2 more lines\)\n +\| c\n +\| d$/);
  assert.match(formatEntry({ t: "x", type: "run", n: 1, command: "ls", why: "look" }), /--:--:-- +run #1 +\$ ls\n +# look/);
  assert.match(formatEntry({ type: "user", text: "hi" }), /you said +hi/);

  const a = mkdtempSync(join(tmpdir(), "opsmira-runs-"));
  const b = mkdtempSync(join(tmpdir(), "opsmira-runs-"));
  temps.push(a, b);
  for (const [base, id, at] of [[a, "old", "2026-01-01T00:00:00Z"], [b, "new", "2026-02-01T00:00:00Z"], [a, "mid", "2026-01-15T00:00:00Z"]]) {
    mkdirSync(join(base, "detached", id), { recursive: true });
    writeFileSync(join(base, "detached", id, "spec.json"), JSON.stringify({ id, createdAt: at }));
  }
  const { runs, denied } = findRuns([a, b, join(a, "missing")]);
  assert.equal(runs.length, 3);
  assert.deepEqual(denied, []);
  assert.equal(newestRun(runs).spec.id, "new");

  const summary = fallbackSummary(
    [
      { type: "run", n: 1, command: "nginx -t" },
      { type: "result", n: 1, exitCode: 0 },
      { type: "run", n: 2, command: "systemctl reload nginx" },
      { type: "result", n: 2, exitCode: null, timedOut: true },
      { type: "note", text: "Reloading." },
    ],
    "Out of time.",
  );
  assert.equal(summary, "Out of time.\nCommands run (2):\n#1 nginx -t -> exit 0\n#2 systemctl reload nginx -> timed out\nLast note: Reloading.");
});

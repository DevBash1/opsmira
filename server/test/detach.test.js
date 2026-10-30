// Detach mode end to end: the console starts a run on an operate agent, the runner works with a (fake) model,
// the agent relays its log and report, the console audits each command and writes the report into the
// conversation, and once acknowledged the server removes the opsmira command.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./setup.js";

// A model that says what it does, runs one command, and finishes.
let calls = 0;
const model = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    calls++;
    const reply =
      calls === 1
        ? { role: "assistant", content: null, tool_calls: [
            { id: "c1", type: "function", function: { name: "say", arguments: JSON.stringify({ text: "Checking the version first." }) } },
            { id: "c2", type: "function", function: { name: "run", arguments: JSON.stringify({ command: "echo detached-ok", why: "check it can run" }) } },
          ] }
        : { role: "assistant", content: null, tool_calls: [{ id: "c3", type: "function", function: { name: "done", arguments: JSON.stringify({ status: "done", summary: "Ran the check; nothing else to do." }) } }] };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: reply, finish_reason: "tool_calls" }] }));
  });
});
await new Promise((r) => model.listen(0, "127.0.0.1", r));
process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${model.address().port}/v1`;

const agents = await import("../src/agents.js");
const detach = await import("../src/detach.js");
const { getSession, persistSession } = await import("../src/state.js");
const { readAudit } = await import("../src/store.js");

const server = createServer();
agents.attachAgentGateway(server);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `ws://127.0.0.1:${server.address().port}${agents.AGENT_PATH}`;
const AGENT = new URL("../../agent/opsmira-agent.mjs", import.meta.url).pathname;
const home = mkdtempSync(join(tmpdir(), "opsmira-detach-"));
const cli = join(home, "bin", "opsmira");
const child = spawn(process.execPath, [AGENT, "--server", url, "--state", join(home, "state", "state.json"), "--token", agents.createPairingToken().token, "--name", "box", "--access", "operate"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, OPSMIRA_CLI_PATH: cli, OPSMIRA_DETACHED_RETRY_MS: "50" },
});
let output = "";
child.stdout.on("data", (c) => (output += c));
child.stderr.on("data", (c) => (output += c));

async function until(check, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`timed out waiting\n${output}`);
}

after(() => {
  child.kill();
  server.close();
  server.closeAllConnections?.();
  model.close();
});

test("only operate agents with the detach capability can take a run", async () => {
  await until(() => agents.listAgents().find((a) => a.name === "box" && a.online));
  assert.equal(detach.detachProblem("agent:box"), null);
  assert.match(detach.detachProblem("agent:nope"), /no connected server/);
  assert.match(detach.detachProblem(""), /needs a server connected with opsmira-agent/);
});

test("a detached run reports back: audit, conversation, and the opsmira command goes away", async () => {
  const conversationId = "c0ffee00-0000-4000-8000-000000000001";
  const session = getSession(null, conversationId);
  session.conversation.push({ role: "user", content: "Upgrade the proxy", ask: true });
  persistSession(session);

  const proposal = { kind: "detach", server: "agent:box", detach: { goal: "Show it works", plan: "1. echo", why: "the proxy restarts", minutes: 5, maxSteps: 5, model: "test/model" } };
  const started = await detach.startDetached(proposal, conversationId);
  assert.equal(started.exitCode, 0, started.output);
  assert.match(started.output, /watch/);
  assert.ok(existsSync(cli), "the opsmira command is installed while the run is open");

  const run = await until(() => detach.listDetached().find((r) => r.id === started.detachedRun && r.report));
  assert.equal(run.report.status, "done");
  assert.match(run.report.summary, /nothing else to do/);

  const audited = readAudit().filter((e) => e.by === "detached" && e.detachedRun === run.id);
  assert.equal(audited.length, 1);
  assert.equal(audited[0].command, "echo detached-ok");
  assert.equal(audited[0].output.trim(), "detached-ok");
  assert.equal(audited[0].server, "agent:box");

  const convo = getSession(null, conversationId).conversation;
  assert.match(convo.at(-1).content, /detached run on box finished/);
  assert.match(convo.at(-2).content, /^\[System\]/);

  // The agent got the ack: the run is marked done there, the key is gone, and so is the command.
  const runDir = join(home, "state", "detached", run.id);
  await until(() => existsSync(join(runDir, ".acked")));
  assert.equal(existsSync(join(runDir, "key")), false);
  await until(() => !existsSync(cli));
  assert.deepEqual(readdirSync(join(home, "state", "detached")), [run.id]);
  assert.doesNotMatch(readFileSync(join(runDir, "log.jsonl"), "utf8"), /test-key/);
});

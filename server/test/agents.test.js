// A real agent process pairing with the gateway, answering requests, and being refused when it should be.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./setup.js";
const agents = await import("../src/agents.js");

const AGENT = new URL("../../agent/opsmira-agent.mjs", import.meta.url).pathname;
const server = createServer();
agents.attachAgentGateway(server);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `ws://127.0.0.1:${server.address().port}${agents.AGENT_PATH}`;
const children = [];

function startAgent(extra) {
  const state = join(mkdtempSync(join(tmpdir(), "opsmira-agent-")), "state.json");
  const child = spawn(process.execPath, [AGENT, "--server", url, "--state", state, ...extra], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (c) => (output += c));
  child.stderr.on("data", (c) => (output += c));
  children.push(child);
  return { child, state, output: () => output };
}

async function until(check, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail("timed out waiting");
}

after(() => {
  for (const c of children) c.kill();
  server.close();
  server.closeAllConnections?.();
});

test("pairs with a one-time token, then answers read-only requests and refuses the rest", async () => {
  const { token } = agents.createPairingToken();
  const a = startAgent(["--token", token, "--name", "Test Box"]);
  const agent = await until(() => agents.listAgents().find((x) => x.online));
  assert.equal(agent.name, "test-box");
  assert.equal(agent.host, "agent:test-box");
  assert.equal(agent.access, "read-only");

  const ok = await agents.callAgent(agent.id, "run", { file: "hostname", args: [], timeout: 5000 });
  assert.equal(ok.ok, true);
  assert.ok(ok.stdout.trim().length > 0);

  const blocked = await agents.callAgent(agent.id, "run", { file: "rm", args: ["-rf", "/tmp/never"], timeout: 5000 });
  assert.equal(blocked.ok, false);
  assert.match(blocked.stderr, /blocked by the agent/);

  const missing = await agents.callAgent(agent.id, "run", { file: "ufw", args: ["status"], timeout: 5000 });
  assert.equal(missing.ok, false); // allowed by policy, but ufw is not installed or not permitted here

  // The same token cannot pair a second agent.
  const again = startAgent(["--token", token, "--name", "second"]);
  await until(() => /refused: invalid or expired token/.test(again.output()));
  assert.equal(agents.listAgents().length, 1);

  // Reconnect with the saved credential, no token.
  a.child.kill();
  await until(() => !agents.listAgents()[0].online);
  const back = startAgent(["--state", a.state]);
  await until(() => agents.listAgents()[0].online);
  assert.ok(/connected as "test-box"/.test(await until(() => (back.output().includes("connected as") ? back.output() : null))));

  // Revoking drops it for good.
  assert.equal(agents.revokeAgent(agent.id), true);
  await until(() => !agents.listAgents().length);
  const gone = await agents.callAgent(agent.id, "run", { file: "hostname", args: [], timeout: 2000 });
  assert.equal(gone.ok, false);
  await until(() => /refused: unknown or revoked credential/.test(back.output()), 12000);
});

test("a wrong credential is refused", async () => {
  const state = join(mkdtempSync(join(tmpdir(), "opsmira-agent-")), "bad.json");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(state, JSON.stringify({ credential: "ops_agent_nope" }));
  const bad = startAgent(["--state", state]);
  await until(() => /refused: unknown or revoked credential/.test(bad.output()));
});

test("a read-only agent refuses shell commands; an operate agent runs them and can be stopped", async () => {
  const { runCommand } = await import("../src/exec.js");
  const readOnly = startAgent(["--token", agents.createPairingToken().token, "--name", "ro"]);
  const operate = startAgent(["--token", agents.createPairingToken().token, "--name", "op", "--access", "operate"]);
  await until(() => agents.listAgents().filter((a) => a.online).length === 2);
  assert.equal(agents.agentAccess("ro"), "read-only");
  assert.equal(agents.agentAccess("op"), "operate");

  const refused = await runCommand("echo hi", { server: "agent:ro" });
  assert.equal(refused.exitCode, null);
  assert.match(refused.output, /read-only/);

  const ran = await runCommand("echo hi; echo oops 1>&2; exit 3", { server: "agent:op" });
  assert.equal(ran.exitCode, 3);
  assert.match(ran.output, /hi/);
  assert.match(ran.output, /oops/);

  // Stop: aborting kills the remote command and answers at once.
  const controller = new AbortController();
  const started = Date.now();
  const pending = runCommand("sleep 20; echo late", { server: "agent:op", signal: controller.signal });
  setTimeout(() => controller.abort(), 300);
  const stopped = await pending;
  assert.equal(stopped.stopped, true);
  assert.ok(Date.now() - started < 5000);

  // The agent is still usable afterwards.
  assert.equal((await runCommand("echo again", { server: "agent:op" })).output, "again");

  const gone = await runCommand("echo x", { server: "agent:nope" });
  assert.match(gone.output, /no connected server/);
  readOnly.child.kill();
  operate.child.kill();
});

function startHosted(credential, exec, extra = []) {
  const child = spawn(process.execPath, [AGENT, "--server", url, "--name", "ignored", "--exec", exec, ...extra], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, OPSMIRA_CREDENTIAL: credential, OPSMIRA_APP_LOG: join(mkdtempSync(join(tmpdir(), "opsmira-app-")), "app.log"), HOME: mkdtempSync(join(tmpdir(), "opsmira-home-")) },
  });
  let output = "";
  child.stdout.on("data", (c) => (output += c));
  child.stderr.on("data", (c) => (output += c));
  children.push(child);
  return { child, output: () => output };
}

test("a hosted app: a pre-made credential connects as the same agent on every start, and no state file is written", async () => {
  const { credential, name } = agents.createAgentCredential("My API");
  assert.equal(name, "my-api");
  assert.match(credential, /^ops_agent_/);

  const first = startHosted(credential, "echo hello-from-app; sleep 30");
  const online = await until(() => agents.listAgents().find((x) => x.name === name && x.online));
  assert.equal(online.access, "read-only");
  assert.ok(online.appLog, "the app log path is reported");
  await until(() => first.output().includes("hello-from-app"));
  first.child.kill("SIGTERM");
  await until(() => !agents.listAgents().find((x) => x.name === name)?.online);

  // A fresh start (a new deploy, an empty disk) is the same agent, not a new one.
  const second = startHosted(credential, "sleep 30");
  const again = await until(() => agents.listAgents().find((x) => x.name === name && x.online));
  assert.equal(again.id, online.id);
  assert.equal(agents.listAgents().filter((x) => x.name === name).length, 1);
  second.child.kill("SIGTERM");
});

test("a hosted app's agent exits with the app's exit code, and the app starts even when the agent cannot", async () => {
  const { credential } = agents.createAgentCredential("crashy");
  const crash = startHosted(credential, "exit 7");
  const code = await new Promise((r) => crash.child.on("exit", r));
  assert.equal(code, 7);

  const noServer = spawn(process.execPath, [AGENT, "--exec", "echo app-still-ran; exit 4"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, OPSMIRA_SERVER: "" } });
  let out = "";
  noServer.stdout.on("data", (c) => (out += c));
  const code2 = await new Promise((r) => noServer.on("exit", r));
  assert.equal(code2, 4);
  assert.match(out, /app-still-ran/);
});

test("a revoked credential is refused like any other", async () => {
  const { credential, name } = agents.createAgentCredential("gone");
  const id = agents.listAgents().find((x) => x.name === name).id;
  agents.revokeAgent(id);
  const h = startHosted(credential, "sleep 5");
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(agents.listAgents().find((x) => x.name === name), undefined);
  h.child.kill("SIGTERM");
});

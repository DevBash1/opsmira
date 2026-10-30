// Servers that connect without a usable token ask to join; the owner accepts or declines. And agents update themselves.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./setup.js";
const agents = await import("../src/agents.js");

const AGENT = new URL("../../agent/opsmira-agent.mjs", import.meta.url).pathname;
// The console serves its agent at /agent/opsmira-agent.mjs: that is where an agent fetches an update from.
const server = createServer((req, res) => {
  if (req.url === "/agent/opsmira-agent.mjs") {
    res.writeHead(200, { "Content-Type": "text/javascript" });
    res.end(readFileSync(AGENT));
  } else {
    res.writeHead(404);
    res.end();
  }
});
agents.attachAgentGateway(server);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `ws://127.0.0.1:${server.address().port}${agents.AGENT_PATH}`;
const children = [];

function startAgent(extra, { file = AGENT, state, env = {} } = {}) {
  state ??= join(mkdtempSync(join(tmpdir(), "opsmira-agent-")), "state.json");
  const child = spawn(process.execPath, [file, "--server", url, "--state", state, ...extra], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });
  let output = "";
  child.stdout.on("data", (c) => (output += c));
  child.stderr.on("data", (c) => (output += c));
  const exited = new Promise((r) => child.on("exit", (code) => r(code)));
  children.push(child);
  return { child, state, exited, output: () => output };
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

test("a server without a token waits as a request; accepting it pairs it, and a restart does not ask again", async () => {
  const a = startAgent(["--name", "asker"]);
  const req = await until(() => agents.listRequests().find((r) => r.name === "asker" && r.online));
  assert.equal(req.access, "read-only");
  assert.equal(req.oldToken, false);
  assert.ok(req.ip);
  assert.equal(agents.listAgents().length, 0);

  // Restarting while it waits keeps its place: the same request, not a second one.
  a.child.kill();
  await until(() => !agents.listRequests().find((r) => r.id === req.id)?.online);
  const b = startAgent(["--name", "asker"], { state: a.state });
  await until(() => agents.listRequests().find((r) => r.id === req.id)?.online);
  assert.equal(agents.listRequests().filter((r) => r.name === "asker").length, 1);

  assert.equal(agents.acceptRequest(req.id), true);
  const agent = await until(() => agents.listAgents().find((x) => x.name === "asker" && x.online));
  assert.equal(agents.listRequests().length, 0);
  const saved = JSON.parse(readFileSync(a.state, "utf8"));
  assert.match(saved.credential, /^ops_agent_/);
  assert.equal(saved.request, undefined);

  b.child.kill();
  await until(() => !agents.listAgents().find((x) => x.id === agent.id)?.online);
  startAgent([], { state: a.state });
  await until(() => agents.listAgents().find((x) => x.id === agent.id)?.online);
  assert.equal(agents.listRequests().length, 0);
});

test("declining tells the waiting server, which forgets the console and exits with the uninstall code", async () => {
  const a = startAgent(["--name", "unwanted"]);
  const req = await until(() => agents.listRequests().find((r) => r.name === "unwanted" && r.online));
  assert.ok(existsSync(a.state));
  assert.equal(agents.declineRequest(req.id), true);
  assert.equal(await a.exited, 78);
  assert.equal(existsSync(a.state), false);
  assert.equal(agents.listRequests().find((r) => r.id === req.id), undefined);
  assert.equal(agents.listAgents().find((x) => x.name === "unwanted"), undefined);
});

test("an answer given while the server is offline reaches it when it comes back", async () => {
  const a = startAgent(["--name", "sleepy"]);
  const req = await until(() => agents.listRequests().find((r) => r.name === "sleepy" && r.online));
  a.child.kill();
  await until(() => !agents.listRequests().find((r) => r.id === req.id)?.online);
  assert.equal(agents.acceptRequest(req.id), true);
  assert.equal(agents.listRequests().find((r) => r.id === req.id), undefined, "answered requests leave the list");
  startAgent([], { state: a.state });
  await until(() => agents.listAgents().find((x) => x.name === "sleepy" && x.online));
});

test("an agent running other code than the console ships updates itself, and keeps running the update", async () => {
  // An "old" agent: the same program with one changed line, so its sha256 differs from what the console ships.
  const dir = mkdtempSync(join(tmpdir(), "opsmira-old-agent-"));
  const old = join(dir, "opsmira-agent.mjs");
  copyFileSync(AGENT, old);
  writeFileSync(old, readFileSync(old, "utf8") + "\n// an older build\n");
  const { token } = agents.createPairingToken();
  // OPSMIRA_SUPERVISED: behave as under the installer's systemd service, which restarts the service after the agent exits to update.
  const first = startAgent(["--token", token, "--name", "updater"], { file: old, env: { OPSMIRA_SUPERVISED: "test" } });
  const before = await until(() => agents.listAgents().find((x) => x.name === "updater" && x.online));
  assert.equal(before.current, false);
  assert.equal(await first.exited, 0);
  assert.match(first.output(), /updated to .*restarting/);
  const saved = JSON.parse(readFileSync(first.state, "utf8"));
  assert.equal(saved.update.sha256, agents.bundledAgent().sha256);
  assert.ok(existsSync(saved.update.file));

  // "systemd" starts the installed (old) file again: it runs the update instead.
  startAgent([], { file: old, state: first.state, env: { OPSMIRA_SUPERVISED: "test" } });
  const after = await until(() => agents.listAgents().find((x) => x.id === before.id && x.online && x.current));
  assert.equal(after.version, JSON.parse(readFileSync(first.state, "utf8")).update.version);
  assert.equal(JSON.parse(readFileSync(first.state, "utf8")).update.ok, true);
});

test("an agent started with --no-auto-update is left alone", async () => {
  const dir = mkdtempSync(join(tmpdir(), "opsmira-old-agent-"));
  const old = join(dir, "opsmira-agent.mjs");
  writeFileSync(old, readFileSync(AGENT, "utf8") + "\n// pinned\n");
  const a = startAgent(["--token", agents.createPairingToken().token, "--name", "pinned", "--no-auto-update"], { file: old });
  const agent = await until(() => agents.listAgents().find((x) => x.name === "pinned" && x.online));
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(agents.listAgents().find((x) => x.id === agent.id)?.online, true);
  assert.doesNotMatch(a.output(), /updated to/);
});

// The agent never stops trying to reach its console: not when nothing listens, not when the console never answers,
// not when a live connection goes silent, not when the console forgets it. Only Decline (or an update) ends it.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import "./setup.js";
const agents = await import("../src/agents.js");

const AGENT = new URL("../../agent/opsmira-agent.mjs", import.meta.url).pathname;
const children = [];
const servers = [];

function startAgent(url, extra = [], env = {}) {
  const state = join(mkdtempSync(join(tmpdir(), "opsmira-agent-")), "state.json");
  const child = spawn(process.execPath, [AGENT, "--server", url, "--state", state, ...extra], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });
  let output = "";
  child.stdout.on("data", (c) => (output += c));
  child.stderr.on("data", (c) => (output += c));
  let exited = null;
  child.on("exit", (code) => (exited = code ?? "signal"));
  children.push(child);
  return { child, state, output: () => output, exited: () => exited };
}

async function until(check, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail("timed out waiting");
}
const count = (text, re) => (text.match(re) ?? []).length;

after(() => {
  for (const c of children) c.kill();
  for (const s of servers) {
    s.close();
    s.closeAllConnections?.();
  }
});

test("nothing listening: it keeps trying, and connects as soon as the console is there", async () => {
  const probe = createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const { token } = agents.createPairingToken();
  const a = startAgent(`ws://127.0.0.1:${port}${agents.AGENT_PATH}`, ["--token", token, "--name", "patient"]);
  await until(() => count(a.output(), /retrying/g) >= 2);
  assert.equal(a.exited(), null);

  const server = createServer();
  servers.push(server);
  agents.attachAgentGateway(server);
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  await until(() => agents.listAgents().find((x) => x.name === "patient" && x.online), 20000);
});

test("a console that accepts the connection but never answers is dropped and tried again", async () => {
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  servers.push(wss);
  await new Promise((r) => wss.on("listening", r));
  let connections = 0;
  wss.on("connection", () => connections++); // and never says anything
  const a = startAgent(`ws://127.0.0.1:${wss.address().port}/`, [], { OPSMIRA_AGENT_CONNECT_TIMEOUT_MS: "500" });
  await until(() => connections >= 3);
  assert.ok(count(a.output(), /no answer from the console/g) >= 2);
  assert.equal(a.exited(), null);
});

test("a connection that goes silent after it was up is noticed by the heartbeat and replaced", async () => {
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  servers.push(wss);
  await new Promise((r) => wss.on("listening", r));
  let connections = 0;
  wss.on("connection", (ws) => {
    connections++;
    // Says ready (with heartbeat), then never answers a ping: a network path that died without closing.
    ws.once("message", () => ws.send(JSON.stringify({ type: "ready", id: "x", name: "quiet", heartbeat: true })));
  });
  const a = startAgent(`ws://127.0.0.1:${wss.address().port}/`, ["--token", "ops_connect_whatever"], { OPSMIRA_AGENT_HEARTBEAT_MS: "200" });
  await until(() => connections >= 2);
  assert.match(a.output(), /the console stopped answering; reconnecting/);
  assert.equal(a.exited(), null);
});

test("a console that answers pings keeps the connection: no reconnects while it is quiet", async () => {
  const server = createServer();
  servers.push(server);
  agents.attachAgentGateway(server);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const a = startAgent(`ws://127.0.0.1:${server.address().port}${agents.AGENT_PATH}`, ["--token", agents.createPairingToken().token, "--name", "steady"], { OPSMIRA_AGENT_HEARTBEAT_MS: "200" });
  await until(() => agents.listAgents().find((x) => x.name === "steady" && x.online));
  await new Promise((r) => setTimeout(r, 1500));
  assert.doesNotMatch(a.output(), /stopped answering|retrying/);
});

test("removed from the console, it does not stop: it asks to join again", async () => {
  const server = createServer();
  servers.push(server);
  agents.attachAgentGateway(server);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const a = startAgent(`ws://127.0.0.1:${server.address().port}${agents.AGENT_PATH}`, ["--token", agents.createPairingToken().token, "--name", "dropped"]);
  const agent = await until(() => agents.listAgents().find((x) => x.name === "dropped" && x.online));
  agents.revokeAgent(agent.id);
  await until(() => agents.listRequests().find((r) => r.name === "dropped" && r.online));
  assert.match(a.output(), /will ask to join again/);
  assert.equal(a.exited(), null);
});

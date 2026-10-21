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

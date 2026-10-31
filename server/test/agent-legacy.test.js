// Agents from before join requests (0.1.0) only know hello → ready. They must still be able to join: accepted on
// the connection they wait on, one request per server however often they reconnect, and a decline that sticks.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import "./setup.js";
const agents = await import("../src/agents.js");

const server = createServer();
agents.attachAgentGateway(server);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `ws://127.0.0.1:${server.address().port}${agents.AGENT_PATH}`;
const sockets = [];

/** What a 0.1.0 agent does: hello with its (used) token, then wait; it ignores messages it does not know. */
function oldAgent(name, token) {
  const ws = new WebSocket(url);
  sockets.push(ws);
  const got = [];
  ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "hello", name, token, info: { hostname: name, platform: "linux", agent: "0.1.0", access: "operate" } })));
  ws.addEventListener("message", (e) => got.push(JSON.parse(String(e.data))));
  let closed = false;
  ws.addEventListener("close", () => (closed = true));
  return { ws, got, closed: () => closed };
}

async function until(check, ms = 20000) { // generous: agent processes start slowly while other test files run
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.fail("timed out waiting");
}

after(() => {
  for (const s of sockets) s.close();
  server.close();
  server.closeAllConnections?.();
});

test("an old agent with a used token is let in on the connection it waits on, and its copies go", async () => {
  // It reconnects a few times before the owner answers: still one request.
  for (let i = 0; i < 3; i++) {
    const a = oldAgent("jamb", "ops_connect_used_long_ago");
    await until(() => a.got.find((m) => m.type === "pending"));
    if (i < 2) {
      a.ws.close();
      await until(() => a.closed());
    }
  }
  const waitingNow = sockets.at(-1);
  const reqs = agents.listRequests().filter((r) => r.name === "jamb");
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].oldToken, true);

  const last = { got: [] };
  waitingNow.addEventListener("message", (e) => last.got.push(JSON.parse(String(e.data))));
  assert.equal(agents.acceptRequest(reqs[0].id), true);
  const ready = await until(() => last.got.find((m) => m.type === "ready"));
  assert.match(ready.credential, /^ops_agent_/);
  assert.equal(waitingNow.readyState, 1, "the same connection stays open");
  await until(() => agents.listAgents().find((x) => x.name === "jamb" && x.online));
  assert.equal(agents.listRequests().length, 0);

  // And it is a working agent on that connection: the console can ask it things.
  const reply = agents.callAgent(agents.listAgents().find((x) => x.name === "jamb").id, "run", { file: "hostname", args: [] }, 2000);
  const req = await until(() => last.got.find((m) => m.type === "req"));
  waitingNow.send(JSON.stringify({ type: "res", id: req.id, ok: true, code: 0, stdout: "jamb\n", stderr: "" }));
  assert.equal((await reply).stdout, "jamb\n");
});

test("declining an old agent sticks: it is turned away each time, without new requests", async () => {
  const a = oldAgent("unwanted-old", "ops_connect_another_used_one");
  const pending = await until(() => a.got.find((m) => m.type === "pending"));
  assert.equal(agents.declineRequest(pending.id), true);
  await until(() => a.closed());
  for (let i = 0; i < 2; i++) {
    const again = oldAgent("unwanted-old", "ops_connect_another_used_one");
    await until(() => again.got.find((m) => m.type === "declined"));
    await until(() => again.closed());
  }
  assert.equal(agents.listRequests().filter((r) => r.name === "unwanted-old").length, 0);
});

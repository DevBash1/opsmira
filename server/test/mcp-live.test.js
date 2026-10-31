// The owner watching an MCP client's turn in the console, against the real server process: the client's ask
// is listed while it runs, the console can follow it from the start (snapshot, then each event, then done),
// and the conversation shows the client's words under its name, never the note written for the model.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// The model: inspects first, then takes a while to write its answer, so there is a turn in flight to watch.
const model = createServer((req, res) => {
  if (req.method === "GET" && req.url.endsWith("/models")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: [{ id: "test/model", name: "test/model", supported_parameters: ["tools"], architecture: { input_modalities: ["text"] } }] }));
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    const parsed = JSON.parse(body);
    const answered = parsed.messages.at(-1)?.role === "tool";
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunk = (delta, finish = null) => `data: ${JSON.stringify({ choices: [{ delta, finish_reason: finish }] })}\n\n`;
    if (!answered) {
      res.write(chunk({ tool_calls: [{ index: 0, id: `c${Date.now()}`, function: { name: "inspect", arguments: JSON.stringify({ command: "uname -s" }) } }] }));
      res.write(chunk({}, "tool_calls"));
      res.end("data: [DONE]\n\n");
      return;
    }
    await new Promise((r) => setTimeout(r, 4000));
    res.write(chunk({ content: "It runs Linux." }));
    res.write(chunk({}, "stop"));
    res.end("data: [DONE]\n\n");
  });
});
await new Promise((r) => model.listen(0, "127.0.0.1", r));

const REPO = new URL("../..", import.meta.url).pathname;
const port = await new Promise((r) => {
  const s = createServer().listen(0, "127.0.0.1", () => {
    const p = s.address().port;
    s.close(() => r(p));
  });
});
const BASE = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server/src/index.js"], {
  cwd: REPO,
  stdio: "ignore",
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    OPSMIRA_DATA_DIR: mkdtempSync(join(tmpdir(), "opsmira-live-")),
    OPSMIRA_PASSWORD: "pw",
    OPENROUTER_API_KEY: "test",
    OPENROUTER_BASE_URL: `http://127.0.0.1:${model.address().port}/v1`,
    OPENROUTER_MODEL: "test/model",
    OPSMIRA_UPDATE_CHECK: "off",
    OPSMIRA_ENV_FILE: join(tmpdir(), "opsmira-no-env"),
  },
});
for (let i = 0; i < 100; i++) {
  try {
    await fetch(`${BASE}/api/me`);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

const clients = [];
after(async () => {
  for (const c of clients) await c.close().catch(() => {});
  server.kill();
  model.close();
});

const login = await fetch(`${BASE}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "pw" }) });
const owner = { Cookie: login.headers.get("set-cookie").split(";")[0] };
const ownerJson = (path, headers = {}) => fetch(`${BASE}${path}`, { headers: { ...owner, ...headers } }).then((r) => r.json());

/** Every event of an SSE response, until it ends. */
async function readEvents(res) {
  const events = [];
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (line) events.push(JSON.parse(line.slice(6)));
    }
  }
  return events;
}

test("the owner sees an MCP client's ask while it runs, and follows it live to the end", async () => {
  assert.equal(login.status, 200);
  const made = await fetch(`${BASE}/api/mcp/tokens`, { method: "POST", headers: { ...owner, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Claude", access: "ask" }) }).then((r) => r.json());
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${made.token}` } } }));
  clients.push(client);

  const asked = await client.callTool({ name: "opsmira_ask", arguments: { message: "what does uname say here?", server: "local", wait_seconds: 1 } });
  assert.equal(asked.structuredContent.status, "working", asked.content[0].text);
  const id = asked.structuredContent.conversation_id;

  // Listed as live, and already in History under the client's name.
  const { turns } = await ownerJson("/api/live");
  assert.deepEqual(
    turns.map((t) => [t.conversationId, t.client, t.ask, t.model]),
    [[id, "Claude", "what does uname say here?", "test/model"]],
  );
  const { conversations } = await ownerJson("/api/conversations");
  const row = conversations.find((c) => c.id === id);
  assert.equal(row.client, "Claude");
  assert.equal(row.live, true);
  assert.equal(row.via, undefined, "the token id stays on the server");

  // Following it: everything so far, then the answer as it is written, then done.
  const res = await fetch(`${BASE}/api/conversations/${id}/live`, { headers: owner });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/event-stream/);
  const events = await readEvents(res);
  const [snapshot, ...rest] = events;
  assert.equal(snapshot.type, "snapshot");
  assert.equal(snapshot.ask, "what does uname say here?");
  assert.equal(snapshot.client, "Claude");
  assert.ok(snapshot.events.some((e) => e.type === "tool_result" && e.command === "uname -s"), "the command it already ran");
  assert.ok(!snapshot.events.some((e) => e.type === "message"), "the answer was not written yet");
  assert.ok(rest.some((e) => e.type === "message" && e.text === "It runs Linux."), "the answer, live");
  assert.equal(rest.at(-1).type, "done");

  // Done: no longer live, nothing to follow, and the console shows the client's own words, labelled.
  assert.deepEqual((await ownerJson("/api/live")).turns, []);
  assert.equal((await fetch(`${BASE}/api/conversations/${id}/live`, { headers: owner })).status, 404);
  const { turn } = await ownerJson("/api/history", { "X-Opsmira-Conversation": id });
  assert.equal(turn.ask, "what does uname say here?");
  assert.equal(turn.from, "Claude");
  assert.deepEqual(turn.replies, ["It runs Linux."]);
  const reply = await client.callTool({ name: "opsmira_get_reply", arguments: { conversation_id: id } });
  assert.equal(reply.structuredContent.reply, "It runs Linux.");
});

test("watching needs the owner's session, and closing it leaves the client's turn running", async () => {
  assert.equal((await fetch(`${BASE}/api/live`)).status, 401);
  assert.equal((await fetch(`${BASE}/api/conversations/aaaaaaaa-bbbb/live`)).status, 401);

  const made = await fetch(`${BASE}/api/mcp/tokens`, { method: "POST", headers: { ...owner, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Bot", access: "ask" }) }).then((r) => r.json());
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${made.token}` } } }));
  clients.push(client);
  const asked = await client.callTool({ name: "opsmira_ask", arguments: { message: "uname?", server: "local", wait_seconds: 1 } });
  const id = asked.structuredContent.conversation_id;

  const controller = new AbortController();
  const res = await fetch(`${BASE}/api/conversations/${id}/live`, { headers: owner, signal: controller.signal });
  assert.equal(res.status, 200);
  controller.abort();
  const reply = await client.callTool({ name: "opsmira_get_reply", arguments: { conversation_id: id, wait_seconds: 10 } });
  assert.equal(reply.structuredContent.status, "done");
  assert.equal(reply.structuredContent.reply, "It runs Linux.");
});

test("the owner stopping a client's turn in the console: the client is told it was stopped", async () => {
  const made = await fetch(`${BASE}/api/mcp/tokens`, { method: "POST", headers: { ...owner, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Stopper", access: "ask" }) }).then((r) => r.json());
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${made.token}` } } }));
  clients.push(client);
  const asked = await client.callTool({ name: "opsmira_ask", arguments: { message: "uname?", server: "local", wait_seconds: 1 } });
  const id = asked.structuredContent.conversation_id;
  const stop = await fetch(`${BASE}/api/stop`, { method: "POST", headers: { ...owner, "Content-Type": "application/json", "X-Opsmira-Conversation": id }, body: "{}" }).then((r) => r.json());
  assert.equal(stop.stopped, true);
  const reply = await client.callTool({ name: "opsmira_get_reply", arguments: { conversation_id: id, wait_seconds: 10 } });
  assert.equal(reply.structuredContent.status, "stopped", reply.content[0].text);
  assert.deepEqual(reply.structuredContent.errors, []);
  assert.match(reply.content[0].text, /stopped before it finished/);
});

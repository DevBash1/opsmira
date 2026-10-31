// Opsmira's MCP server, driven by the official MCP SDK client (what Claude Code and other clients use): auth, the
// tool list, servers, surfaces, direct commands on a connected agent, and asking Opsmira's agent (against a
// stand-in for the model).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import "./setup.js";

// The model: answers by what it is asked. "uname" → inspects first; "slow" → takes its time; "fix" → proposes.
const model = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    const parsed = JSON.parse(body);
    const asked = [...parsed.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const text = typeof asked === "string" ? asked : JSON.stringify(asked);
    const answered = parsed.messages.at(-1)?.role === "tool";
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunk = (delta, finish = null) => `data: ${JSON.stringify({ choices: [{ delta, finish_reason: finish }] })}\n\n`;
    const say = (content) => {
      res.write(chunk({ content }));
      res.write(chunk({}, "stop"));
      res.end("data: [DONE]\n\n");
    };
    const call = (name, args) => {
      res.write(chunk({ tool_calls: [{ index: 0, id: `c${Date.now()}`, function: { name, arguments: JSON.stringify(args) } }] }));
      res.write(chunk({}, "tool_calls"));
      res.end("data: [DONE]\n\n");
    };
    if (/slow/.test(text)) {
      await new Promise((r) => setTimeout(r, 2500));
      return say("Done, slowly.");
    }
    if (/uname/.test(text) && !answered) return call("inspect", { command: "uname -s" });
    if (/fix/.test(text) && !answered) return call("propose_action", { command: "touch /tmp/opsmira-mcp-fix", title: "Create the marker file", context: "Because you asked.", riskLevel: "Low", riskDetail: "Creates one empty file." });
    if (/fix/.test(text)) return say("It is waiting for your approval in the console.");
    return say(answered ? "It runs Linux." : "Hello from Opsmira.");
  });
});
await new Promise((r) => model.listen(0, "127.0.0.1", r));
process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${model.address().port}/v1`;

const agents = await import("../src/agents.js");
const mcp = await import("../src/mcp.js");
const { readAudit } = await import("../src/store.js");
const { getSession } = await import("../src/state.js");

const app = express();
app.use(express.json());
app.all(mcp.MCP_PATH, mcp.handleMcp);
const server = createServer(app);
agents.attachAgentGateway(server);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

// A connected server that allows commands.
const AGENT = new URL("../../agent/opsmira-agent.mjs", import.meta.url).pathname;
const agentProc = spawn(process.execPath, [AGENT, "--server", `ws://127.0.0.1:${server.address().port}${agents.AGENT_PATH}`, "--state", join(mkdtempSync(join(tmpdir(), "opsmira-mcp-")), "s.json"), "--token", agents.createPairingToken().token, "--name", "box", "--access", "operate"], { stdio: "ignore" });

async function until(check, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail("timed out waiting");
}

const clients = [];
async function connect(token) {
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  clients.push(client);
  return client;
}
const call = (client, name, args = {}) => client.callTool({ name, arguments: args });

after(async () => {
  for (const c of clients) await c.close().catch(() => {});
  agentProc.kill();
  server.close();
  server.closeAllConnections?.();
  model.close();
});

const ask = mcp.createMcpToken({ name: "Claude Code", access: "ask" });
const full = mcp.createMcpToken({ name: "Ops bot", access: "full" });

test("no token, a wrong token, or a foreign page's origin: refused", async () => {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  const none = await fetch(`${base}/mcp`, { method: "POST", headers, body });
  assert.equal(none.status, 401);
  assert.match(none.headers.get("www-authenticate"), /Bearer/);
  assert.equal((await fetch(`${base}/mcp`, { method: "POST", headers: { ...headers, Authorization: "Bearer opsmira_mcp_nope" }, body })).status, 401);
  const foreign = await fetch(`${base}/mcp`, { method: "POST", headers: { ...headers, Authorization: `Bearer ${ask.token}`, Origin: "https://evil.example" }, body });
  assert.equal(foreign.status, 403);
  await assert.rejects(connect("opsmira_mcp_nope"));
});

test("the SDK client connects and sees the tools, with their annotations", async () => {
  const client = await connect(ask.token);
  assert.equal(client.getServerVersion().name, "opsmira");
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["opsmira_ask", "opsmira_get_reply", "opsmira_list_servers", "opsmira_read_surface", "opsmira_run_command", "opsmira_stop"]);
  assert.equal(tools.find((t) => t.name === "opsmira_list_servers").annotations.readOnlyHint, true);
  assert.equal(tools.find((t) => t.name === "opsmira_run_command").annotations.destructiveHint, true);
  assert.ok(client.getInstructions().includes("opsmira_ask"));
});

test("list servers, read a surface, and run read-only commands straight on a connected server", async () => {
  await until(() => agents.listAgents().find((a) => a.name === "box" && a.online));
  const client = await connect(ask.token);
  const servers = await call(client, "opsmira_list_servers");
  const box = servers.structuredContent.servers.find((s) => s.id === "agent:box");
  assert.equal(box.online, true);
  assert.equal(box.commands, true);

  const surface = await call(client, "opsmira_read_surface", { surface: "memory" });
  assert.equal(surface.isError, undefined);
  assert.equal(surface.structuredContent.server, "local");

  const ran = await call(client, "opsmira_run_command", { command: "uname -s", server: "agent:box" });
  assert.equal(ran.isError, undefined, ran.content[0].text);
  assert.equal(ran.structuredContent.exit_code, 0);
  assert.equal(ran.structuredContent.server, "agent:box");
  assert.ok(ran.structuredContent.output.length > 0);
  const audited = readAudit().find((e) => e.by === "mcp" && e.command === "uname -s");
  assert.equal(audited.client, "Claude Code");
  assert.equal(audited.server, "agent:box");
});

test("an ask token cannot change anything directly; a full token can, and both are audited", async () => {
  const askClient = await connect(ask.token);
  const refused = await call(askClient, "opsmira_run_command", { command: "touch /tmp/opsmira-mcp-test", server: "agent:box" });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /read-only/);

  const fullClient = await connect(full.token);
  const done = await call(fullClient, "opsmira_run_command", { command: "echo changed > /dev/null && echo ok", server: "agent:box" });
  assert.equal(done.structuredContent.output.trim(), "ok");
  assert.equal(readAudit().find((e) => e.by === "mcp" && e.client === "Ops bot")?.kind, "act");

  const unknown = await call(fullClient, "opsmira_run_command", { command: "uname", server: "agent:nope" });
  assert.equal(unknown.isError, true);
  assert.match(unknown.content[0].text, /unknown server/);
});

test("ask Opsmira: it inspects, answers, and the chat shows in the console under the client's name", async () => {
  const client = await connect(ask.token);
  const r = await call(client, "opsmira_ask", { message: "what does uname say here?", server: "local" });
  const out = r.structuredContent;
  assert.equal(out.status, "done", r.content[0].text);
  assert.equal(out.reply, "It runs Linux.");
  assert.equal(out.commands[0].command, "uname -s");
  assert.equal(out.commands[0].exit_code, 0);
  assert.match(getSession(null, out.conversation_id).title, /^Claude Code · what does uname/);

  // Continuing the same conversation.
  const again = await call(client, "opsmira_ask", { message: "hello", conversation_id: out.conversation_id });
  assert.equal(again.structuredContent.reply, "Hello from Opsmira.");
  assert.equal(again.structuredContent.conversation_id, out.conversation_id);
});

test("a client reaches only its own conversations: not the console's chats, not another client's", async () => {
  const { persistSession } = await import("../src/state.js");
  const owners = getSession(null, "0wner-chat-0000-4000-8000-000000000001");
  owners.conversation.push({ role: "user", ask: true, content: "my own chat" }, { role: "assistant", content: "secret output" });
  persistSession(owners);
  const client = await connect(ask.token);
  for (const [name, args] of [
    ["opsmira_ask", { message: "hi", conversation_id: owners.id }],
    ["opsmira_get_reply", { conversation_id: owners.id }],
    ["opsmira_stop", { conversation_id: owners.id }],
  ]) {
    const r = await call(client, name, args);
    assert.equal(r.isError, true, name);
    assert.match(r.content[0].text, /not one this console gave out/);
  }
  const mine = (await call(client, "opsmira_ask", { message: "hello" })).structuredContent.conversation_id;
  const other = await connect(full.token);
  assert.equal((await call(other, "opsmira_get_reply", { conversation_id: mine })).isError, true);
  assert.equal((await call(client, "opsmira_get_reply", { conversation_id: mine })).structuredContent.reply, "Hello from Opsmira.");
});

test("a long answer comes back as working, and get_reply waits for the rest", async () => {
  const client = await connect(ask.token);
  const r = await call(client, "opsmira_ask", { message: "take it slow", wait_seconds: 1 });
  assert.equal(r.structuredContent.status, "working");
  const busy = await call(client, "opsmira_ask", { message: "another", conversation_id: r.structuredContent.conversation_id });
  assert.equal(busy.isError, true);
  assert.match(busy.content[0].text, /still working/);
  const later = await call(client, "opsmira_get_reply", { conversation_id: r.structuredContent.conversation_id, wait_seconds: 10 });
  assert.equal(later.structuredContent.status, "done");
  assert.equal(later.structuredContent.reply, "Done, slowly.");
});

test("a change Opsmira proposes for an ask token waits for the owner, and is listed", async () => {
  const client = await connect(ask.token);
  const r = await call(client, "opsmira_ask", { message: "please fix it", server: "local" });
  const out = r.structuredContent;
  assert.equal(out.status, "waiting_for_approval", r.content[0].text);
  assert.equal(out.approvals_waiting[0].title, "Create the marker file");
  assert.equal(out.approvals_waiting[0].command, "touch /tmp/opsmira-mcp-fix");
  assert.match(r.content[0].text, /owner's approval/);
});

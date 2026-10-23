// Waking the agent for a task, against a stand-in for the model (an OpenAI-compatible stream).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import "./setup.js";

const scripted = []; // each model call takes the next reply: { content } or { tool: [name, args] }
const seen = [];
const fake = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    seen.push(JSON.parse(body));
    const next = scripted.shift() ?? { content: "Done." };
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const chunk = (delta, finish = null) => `data: ${JSON.stringify({ choices: [{ delta, finish_reason: finish }] })}\n\n`;
    if (next.tool) {
      const [name, args] = next.tool;
      res.write(chunk({ tool_calls: [{ index: 0, id: "call_1", function: { name, arguments: JSON.stringify(args) } }] }));
      res.write(chunk({}, "tool_calls"));
    } else {
      res.write(chunk({ content: next.content }));
      res.write(chunk({}, "stop"));
    }
    res.end("data: [DONE]\n\n");
  });
});
await new Promise((r) => fake.listen(0, "127.0.0.1", r));
process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${fake.address().port}/v1`;
after(() => fake.close());

const T = await import("../src/tasks.js");
const { fireTask, waitingFor } = await import("../src/taskrun.js");
const { getSession } = await import("../src/state.js");
const { loadConversation } = await import("../src/store.js");

test("a task wakes the agent in its own chat, named after the task, and records the result", async () => {
  const { task } = T.createTask({ name: "Disk check", prompt: "Look at disk usage and report.", cron: "0 7 * * *" });
  scripted.push({ content: "Disks are fine, 40% used." });
  await fireTask(task, "it is scheduled (cron 0 7 * * *)");

  const session = getSession(null, T.conversationIdOf(task));
  const opener = session.conversation[0];
  assert.equal(opener.ask, true);
  assert.match(opener.content, /^\[Task\] "Disk check" woke you at .* because it is scheduled/);
  assert.match(opener.content, /Look at disk usage and report\./);
  assert.match(opener.content, /Nobody is watching/);
  assert.equal(task.state.runs, 1);
  assert.match(task.state.lastResult, /Disks are fine/);
  assert.equal(task.state.lastError, undefined);

  const saved = loadConversation(T.conversationIdOf(task));
  assert.equal(saved.title, "Disk check", "named by the task, so it shows in History under that name");
  assert.ok(seen.at(-1).messages[0].content.includes("There is 1 task set up"), "the prompt knows tasks exist");
  T.removeTask(task.id);
});

test("a change it wants to make waits for approval; nothing runs unattended in Ask mode", async () => {
  const { task } = T.createTask({ name: "Restarter", prompt: "If nginx is down restart it.", every: "1h" });
  scripted.push({ tool: ["propose_action", { command: "systemctl restart nginx", title: "Restart nginx", context: "It is down.", riskLevel: "Medium" }] });
  await fireTask(task, "the check failed");
  assert.equal(waitingFor(task), 1, "one proposal waiting in the task's chat");
  const session = getSession(null, T.conversationIdOf(task));
  const [proposal] = [...session.pendingApprovals.values()];
  assert.equal(proposal.status, "pending");
  assert.equal(proposal.command, "systemctl restart nginx");
  T.removeTask(task.id);
});

test("a task run cannot create or change tasks", async () => {
  const { task } = T.createTask({ name: "Sneaky", prompt: "x", every: "1h" });
  scripted.push({ tool: ["manage_tasks", { action: "create", name: "Spawned", prompt: "x", every: "1h" }] }, { content: "Could not." });
  await fireTask(task, "test");
  assert.equal(T.getTask("Spawned"), undefined);
  const session = getSession(null, T.conversationIdOf(task));
  const result = session.conversation.find((m) => m.role === "tool");
  assert.match(JSON.parse(result.content).error, /cannot change tasks/);
  T.removeTask(task.id);
});

test("two tasks never run their turns at the same time", async () => {
  const a = T.createTask({ name: "A", prompt: "x", every: "1h" }).task;
  const b = T.createTask({ name: "B", prompt: "x", every: "1h" }).task;
  scripted.push({ content: "a done" }, { content: "b done" });
  const order = [];
  await Promise.all([fireTask(a, "t").then(() => order.push("a")), fireTask(b, "t").then(() => order.push("b"))]);
  assert.deepEqual(order, ["a", "b"]);
  T.removeTask(a.id);
  T.removeTask(b.id);
});

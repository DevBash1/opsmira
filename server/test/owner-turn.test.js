// "!command" through a whole turn, against a stand-in for the model (an OpenAI-compatible stream).
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

const { ownerCommand, runOwnerCommand, runTurn } = await import("../src/ai.js");
const { buildLastTurn } = await import("../src/history.js");

test("the agent answers a ! command with the command and its output in front of it, and the chat shows it", async () => {
  const conversation = [{ role: "user", content: "!echo disk-ok", ask: true }];
  const events = [];
  const send = (e) => events.push(e);
  scripted.push({ content: "That printed disk-ok." });

  await runOwnerCommand(ownerCommand("!echo disk-ok"), conversation, send, { server: "local" });
  await runTurn(conversation, send, undefined, new Map(), { server: "local" });

  const roles = seen.at(-1).messages.map((m) => m.role);
  assert.deepEqual(roles.slice(1), ["user", "assistant", "tool"], "the model gets the message, the call, then the output");
  assert.equal(JSON.parse(seen.at(-1).messages[3].content).output, "disk-ok");
  assert.match(seen.at(-1).messages[0].content, /starts with ! is the owner running that command/);

  const turn = buildLastTurn(conversation, new Map());
  assert.equal(turn.tools[0].command, "echo disk-ok");
  assert.equal(turn.tools[0].output, "disk-ok");
  assert.match(turn.replies.join(" "), /printed disk-ok/);
});

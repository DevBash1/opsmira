import { test } from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import { ownerCommand, runOwnerCommand } from "../src/ai.js";

test("only a leading ! makes a message a command", () => {
  assert.equal(ownerCommand("!df -h"), "df -h");
  assert.equal(ownerCommand("  ! uptime  "), "uptime");
  assert.equal(ownerCommand("!"), "");
  assert.equal(ownerCommand("what does ! do"), null);
  assert.equal(ownerCommand(undefined), null);
});

test("the owner's command runs and lands in the conversation as an inspect call with its result", async () => {
  const conversation = [{ role: "user", content: "!echo hello && exit 3", ask: true }];
  const events = [];
  await runOwnerCommand("echo hello && exit 3", conversation, (e) => events.push(e), { server: "local" });

  assert.deepEqual(events.map((e) => e.type), ["tool_call", "tool_result"]);
  assert.equal(events[1].output, "hello");
  assert.equal(events[1].exitCode, 3);

  const [, call, result] = conversation;
  assert.equal(call.tool_calls[0].function.name, "inspect");
  assert.equal(JSON.parse(call.tool_calls[0].function.arguments).command, "echo hello && exit 3");
  assert.equal(result.tool_call_id, call.tool_calls[0].id);
  assert.equal(JSON.parse(result.content).output, "hello");
});

test("a server that does not allow commands refuses it and says why, without running anything", async () => {
  const conversation = [];
  const events = [];
  await runOwnerCommand("touch /tmp/never", conversation, (e) => events.push(e), { server: "agent:nope" });
  assert.equal(events.length, 1);
  assert.match(events[0].rejected, /unknown server|not connected/);
  assert.match(JSON.parse(conversation[1].content).error, /^rejected:/);
});

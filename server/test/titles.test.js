import { test } from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
const { retitle, titlePlan, cleanTitle, RETITLE_EVERY } = await import("../src/titles.js");
const { getSession, persistSession } = await import("../src/state.js");
const { loadConversation } = await import("../src/store.js");

let n = 0;
const fresh = () => getSession("sess", `titles-test-${++n}-aaaaaaaa`);
function say(session, asks, { from = 0 } = {}) {
  for (let i = from; i < from + asks; i++) {
    session.conversation.push({ role: "user", content: `question ${i}`, ask: true });
    session.conversation.push({ role: "assistant", content: `answer ${i}` });
  }
}

test("a chat with no reply yet is not named; after the first exchange it is", async () => {
  const s = fresh();
  s.conversation.push({ role: "user", content: "hi", ask: true });
  assert.equal(titlePlan(s), null);
  s.conversation.push({ role: "assistant", content: "Hello! What can I do?" });
  assert.equal(titlePlan(s), "first");
  let prompt = "";
  assert.equal(await retitle(s, { complete: async (_m, _sys, user) => ((prompt = user), 'Title: "Checking server health."') }), true);
  assert.match(prompt, /Owner: hi/);
  assert.equal(s.title, "Checking server health");
  assert.equal(loadConversation(s.id).title, "Checking server health", "saved with the chat");
});

test("it renames only after another 50 owner messages, from the last 10 messages", async () => {
  const s = fresh();
  say(s, 1);
  await retitle(s, { complete: async () => "First name" });
  s.titleTriedAt = 0;
  say(s, RETITLE_EVERY - 1, { from: 1 });
  assert.equal(titlePlan(s), null, "49 messages since the title: not yet");
  say(s, 1, { from: 99 });
  assert.equal(titlePlan(s), "update", "50 messages since the title: due");
  let prompt = "";
  await retitle(s, { complete: async (_m, _sys, user) => ((prompt = user), "Second name") });
  assert.equal(s.title, "Second name");
  assert.match(prompt, /Current title: First name/);
  assert.equal((prompt.match(/^(Owner|Assistant):/gm) ?? []).length, 10, "the last 10 messages");
  assert.match(prompt, /question 99/);
  assert.doesNotMatch(prompt, /question 1\b/);
  assert.equal(titlePlan(s), null, "not again until 50 more");
});

test("a model failure leaves the old title and waits before trying again", async () => {
  const s = fresh();
  say(s, 1);
  assert.equal(await retitle(s, { complete: async () => { throw new Error("402 no credits"); } }), false);
  assert.equal(s.title, null);
  assert.equal(titlePlan(s), null, "not retried in a tight loop");
  s.titleTriedAt = Date.now() - 120_000;
  assert.equal(titlePlan(s), "first");
});

test("model output is cleaned into one short plain line", () => {
  assert.equal(cleanTitle('"Fixing nginx 502 errors."'), "Fixing nginx 502 errors");
  assert.equal(cleanTitle("**Disk space cleanup**\nExtra line"), "Disk space cleanup");
  assert.equal(cleanTitle("Title: Memory — leak hunt"), "Memory, leak hunt");
  assert.equal(cleanTitle("   "), "");
  assert.ok(cleanTitle("word ".repeat(40)).length <= 60);
});

test("persisting keeps the model title and falls back to the first message without one", () => {
  const s = fresh();
  say(s, 1);
  persistSession(s);
  assert.equal(loadConversation(s.id).title, "question 0");
});

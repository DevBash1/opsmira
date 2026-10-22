import { test } from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
const { reasoningText, toModelMessages } = await import("../src/content.js");

test("reasoning is read from the forms providers use", () => {
  assert.equal(reasoningText({ reasoning: "  Look at disk.  " }), "Look at disk.");
  assert.equal(reasoningText({ reasoning_content: "Because." }), "Because.");
  assert.equal(reasoningText({ reasoning_details: [{ type: "reasoning.text", text: "One" }, { type: "reasoning.encrypted", data: "x" }, { type: "reasoning.summary", summary: "Two" }] }), "One\n\nTwo");
  assert.equal(reasoningText({ content: "hi" }), "");
  assert.equal(reasoningText(null), "");
  assert.ok(reasoningText({ reasoning: "a".repeat(20000) }).length <= 8001);
});

test("a stored thought is for the console only", () => {
  const out = toModelMessages([{ role: "assistant", content: "Done.", thought: "secret plan" }], false);
  assert.deepEqual(out, [{ role: "assistant", content: "Done." }]);
});

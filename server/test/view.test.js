// show_view: the agent's blocks are checked and cleaned before anything is drawn.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
const { normalizeView } = await import("../src/view.js");

test("a valid view keeps its blocks", () => {
  const result = normalizeView({
    title: "Top processes",
    source: "ps aux on this server",
    summary: "Two processes use most memory.",
    blocks: [
      { type: "stats", items: [{ label: "Total", value: "2" }] },
      { type: "table", columns: ["Name", "Memory"], rows: [["node", "1.2 GB"]] },
    ],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.view.blocks.map((b) => b.type), ["stats", "table"]);
});

test("nothing to draw is rejected with a reason the model can read", () => {
  const result = normalizeView({ title: "Empty", blocks: [] });
  assert.equal(result.ok, false);
  assert.ok(result.problems.length > 0);
});

test("unknown block types are dropped, not drawn", () => {
  const result = normalizeView({
    title: "Mixed",
    source: "ps aux on this server",
    summary: "One real block.",
    blocks: [{ type: "banner-ad", text: "x" }, { type: "notice", tone: "info", title: "Heads up", text: "Fine." }],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.view.blocks.map((b) => b.type), ["notice"]);
});

test("a view must say where its data came from", () => {
  const result = normalizeView({ title: "No source", summary: "x", blocks: [{ type: "notice", title: "a", text: "b" }] });
  assert.equal(result.ok, false);
  assert.match(result.problems[0], /source is required/);
});

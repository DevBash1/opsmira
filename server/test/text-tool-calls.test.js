// Tool calls that a model writes into its reply as markup are recovered, and the markup never shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
const { recoverTextToolCalls } = await import("../src/content.js");

const cmd = `ssh -o BatchMode=yes root@host 'docker ps -a --filter name=portainer --format "{{.Names}}"; echo ---; ss -tlnp | grep -E ":8000|:9000"'`;
const markup = `<｜DSML｜tool_calls><｜DSML｜invoke name="inspect"><｜DSML｜parameter name="command" string="true">${cmd}</｜DSML｜parameter></｜DSML｜invoke></｜DSML｜tool_calls>`;

test("a markup tool call becomes a real one", () => {
  const { calls, text } = recoverTextToolCalls(markup);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].function.name, "inspect");
  assert.equal(JSON.parse(calls[0].function.arguments).command, cmd);
  assert.equal(text, "");
});

test("it tolerates spaces around the bars, other parameters, and keeps the prose", () => {
  const spaced = `Checking.\n< | DSML | tool_calls>< | DSML | invoke name="propose_action">< | DSML | parameter name="command" string="true">apt-get clean</ | DSML | parameter>< | DSML | parameter name="n" string="false">3</ | DSML | parameter></ | DSML | invoke></ | DSML | tool_calls>`;
  const { calls, text } = recoverTextToolCalls(spaced);
  assert.deepEqual(JSON.parse(calls[0].function.arguments), { command: "apt-get clean", n: 3 });
  assert.equal(text, "Checking.");
});

test("two calls, and plain replies are left alone", () => {
  assert.equal(recoverTextToolCalls(markup + markup).calls.length, 2);
  assert.deepEqual(recoverTextToolCalls("Memory is fine."), { calls: [], text: "Memory is fine." });
  assert.deepEqual(recoverTextToolCalls(null), { calls: [], text: "" });
});

test("a cut-off markup block is dropped instead of shown", () => {
  const { calls, text } = recoverTextToolCalls('Looking.<｜DSML｜tool_calls><｜DSML｜invoke name="inspect"><｜DSML｜parameter name="command" string="true">df');
  assert.equal(calls.length, 1); // the call itself has no parameters we could trust
  assert.equal(text, "Looking.");
});

// How long a command may run: a few minutes for read-only looks, much longer for changes, more when asked, within
// the maximum; and the limit is what kills it, here and on a connected server.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
const { COMMAND_TIMEOUTS, commandTimeout, runCommand } = await import("../src/exec.js");

test("defaults: 2 minutes to look, 15 to change, an hour at most; asking for more stays within it", () => {
  assert.equal(COMMAND_TIMEOUTS.inspect, 120_000);
  assert.equal(COMMAND_TIMEOUTS.act, 900_000);
  assert.equal(COMMAND_TIMEOUTS.max, 3_600_000);
  assert.equal(commandTimeout("inspect"), 120_000);
  assert.equal(commandTimeout("act"), 900_000);
  assert.equal(commandTimeout("act", 1800), 1_800_000);
  assert.equal(commandTimeout("act", 99999), 3_600_000);
  assert.equal(commandTimeout("inspect", 0.2), 1000);
});

test("the limit given is the one that kills it, and a command under it is not cut short", async () => {
  const cut = await runCommand("sleep 3; echo late", { timeoutMs: 1000 });
  assert.equal(cut.timedOut, true);
  assert.doesNotMatch(cut.output, /late/);
  const fine = await runCommand("sleep 1.5; echo done", { timeoutMs: 5000 });
  assert.equal(fine.exitCode, 0);
  assert.equal(fine.output, "done");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import { pickServer } from "../src/ai.js";

test("the default server fills in when none is named, and 'local' opts out", () => {
  assert.equal(pickServer(undefined, "agent:vps"), "agent:vps");
  assert.equal(pickServer("", "agent:vps"), "agent:vps");
  assert.equal(pickServer("agent:other", "agent:vps"), "agent:other");
  assert.equal(pickServer("local", "agent:vps"), "");
  assert.equal(pickServer(undefined, ""), "");
  assert.equal(pickServer(42, "agent:vps"), "agent:vps");
});

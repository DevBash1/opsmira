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

test("the owner's pick wins, 'local' means this machine, junk falls back to the configured default", async () => {
  const { defaultFor } = await import("../src/ai.js");
  assert.equal(defaultFor("agent:web-1", ""), "agent:web-1");
  assert.equal(defaultFor("agent:web-1", "agent:vps"), "agent:web-1");
  assert.equal(defaultFor("local", "agent:vps"), "");
  assert.equal(defaultFor(undefined, "agent:vps"), "agent:vps");
  assert.equal(defaultFor("root@evil", "agent:vps"), "agent:vps");
  assert.equal(defaultFor("agent:" + "x".repeat(200), ""), "");
});

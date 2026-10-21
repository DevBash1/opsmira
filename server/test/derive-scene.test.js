// Which command output becomes a built-in card. Only a plain command is read by keyword.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.OPENROUTER_API_KEY ||= "test";
process.env.OPSMIRA_DATA_DIR ||= (await import("node:os")).tmpdir() + "/opsmira-test-data";
const { deriveScene } = await import("../src/views.js");

const listing = "-rwxr-xr-x 1 root root 30000000 Oct 21 05:31 tool\ndrwxr-xr-x 2 root root 4096 Oct 21 20:04 lib";
const scene = (command, output = listing) => deriveScene(command, { exitCode: 0, output })?.scene ?? null;

test("a plain ls becomes a file listing", () => {
  assert.equal(scene("ls -l /usr/local/bin"), "files");
  assert.equal(scene("sudo ls -la /srv | head -20"), "files");
});

test("chains and wrappers are left alone", () => {
  assert.equal(scene("systemctl status x; ls -l /tmp"), null);
  assert.equal(scene("ssh root@host 'systemctl status x | head; ls -l /tmp'"), null);
  assert.equal(scene("ls -l /tmp && echo done"), null);
  assert.equal(scene("ls -l /tmp | awk '{print $9}'"), null);
});

test("failed or empty commands show nothing", () => {
  assert.equal(deriveScene("ls -l /nope", { exitCode: 2, output: "ls: cannot access" }), null);
  assert.equal(deriveScene("ls -l /empty", { exitCode: 0, output: "" }), null);
});

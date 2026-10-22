// Where the web app is served: a self-hosted server is the console at "/", and OPSMIRA_SITE=1 puts the
// marketing pages there instead. Runs the real server against a stand-in web build.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./setup.js";

const webDir = mkdtempSync(join(tmpdir(), "opsmira-web-"));
writeFileSync(join(webDir, "index.html"), "<!doctype html><html><head><title>x</title></head><body>app</body></html>");

const children = [];
async function start(extra) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ["src/index.js"], {
    env: { ...process.env, PORT: String(port), OPSMIRA_WEB_DIR: webDir, OPSMIRA_DATA_DIR: mkdtempSync(join(tmpdir(), "opsmira-layout-")), ...extra },
    stdio: "ignore",
  });
  children.push(child);
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/api/me`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return `http://127.0.0.1:${port}`;
}
after(() => children.forEach((c) => c.kill()));

const get = (url) => fetch(url, { redirect: "manual" });

test("a self-hosted server is the console at /, and /app goes there", async () => {
  const base = await start({});
  const root = await get(`${base}/`);
  assert.equal(root.status, 200);
  assert.match(await root.text(), /__OPSMIRA_CONSOLE_AT_ROOT__=true/);
  for (const path of ["/app", "/app/", "/pricing"]) {
    const res = await get(`${base}${path}`);
    assert.equal(res.status, 302, path);
    assert.equal(res.headers.get("location"), "/", path);
  }
});

test("with OPSMIRA_SITE=1 the marketing pages stay at / and the console at /app", async () => {
  const base = await start({ OPSMIRA_SITE: "1" });
  for (const path of ["/", "/app"]) {
    const res = await get(`${base}${path}`);
    assert.equal(res.status, 200, path);
    assert.doesNotMatch(await res.text(), /__OPSMIRA_CONSOLE_AT_ROOT__/, path);
  }
});

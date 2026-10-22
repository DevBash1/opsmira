// End to end: a model that writes its tool call into the reply as markup still gets it run, including when
// the reply is cut off by the token cap and finished in a second request. Runs the real server against a fake model.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./setup.js";

const MARKUP = '<｜DSML｜tool_calls>\n<｜DSML｜invoke name="inspect">\n<｜DSML｜parameter name="command" string="true">hostname</｜DSML｜parameter>\n</｜DSML｜invoke>\n</｜DSML｜tool_calls>';
let mode = "stop";
const fake = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const j = JSON.parse(body || "{}");
    const answered = (j.messages ?? []).some((m) => m.role === "tool");
    const last = String(j.messages?.at(-1)?.content ?? "");
    let message = { role: "assistant", content: "The hostname is shown above." };
    let finish = "stop";
    if (!answered) {
      if (mode === "late" && last.startsWith("Continue")) message.content = MARKUP;
      else if (mode === "late") [message.content, finish] = ["Checking.", "length"];
      else message.content = MARKUP;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: "x", object: "chat.completion", created: 1, model: "fake", choices: [{ index: 0, message, finish_reason: finish }] }));
  });
});
await new Promise((r) => fake.listen(0, "127.0.0.1", r));

const port = 20000 + Math.floor(Math.random() * 20000);
const server = spawn(process.execPath, ["src/index.js"], {
  env: { ...process.env, PORT: String(port), OPENROUTER_BASE_URL: `http://127.0.0.1:${fake.address().port}/v1`, OPSMIRA_DATA_DIR: mkdtempSync(join(tmpdir(), "opsmira-flow-")), OPSMIRA_USERNAME: "u", OPSMIRA_PASSWORD: "p" },
  stdio: "ignore",
});
after(() => {
  server.kill();
  fake.close();
});
for (let i = 0; i < 50; i++) {
  try {
    await fetch(`http://127.0.0.1:${port}/api/me`);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}
const login = await fetch(`http://127.0.0.1:${port}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "u", password: "p" }) });
const cookie = login.headers.get("set-cookie").split(";")[0];

async function ask(id) {
  const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, "x-opsmira-conversation": id },
    body: JSON.stringify({ message: "what is the hostname", model: "fake" }),
  });
  const events = [];
  for (const chunk of (await res.text()).split("\n\n")) if (chunk.startsWith("data: ")) events.push(JSON.parse(chunk.slice(6)));
  return events;
}

for (const m of ["stop", "late"]) {
  test(`markup tool call (${m}) is run and never shown`, async () => {
    mode = m;
    const events = await ask(`flow-${m}`);
    assert.ok(events.some((e) => e.type === "tool_result" && e.command === "hostname"), "the command ran");
    const text = events.filter((e) => e.type === "message").map((e) => e.text).join(" ");
    assert.equal(text, "The hostname is shown above.");
    assert.ok(!JSON.stringify(events).includes("DSML"), "no markup reached the console");
  });
}

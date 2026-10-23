import { test } from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
const T = await import("../src/tasks.js");
const { trimToRecentTurns } = await import("../src/taskrun.js");

const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi, 0, 0);
const MIN = 60_000;

test("cron: fields, lists, ranges, steps and the next run", () => {
  const c = T.parseCron("*/15 9-17 * * 1-5");
  assert.ok(T.cronMatches(c, at(2026, 10, 21, 9, 30)), "a Wednesday 09:30");
  assert.ok(!T.cronMatches(c, at(2026, 10, 21, 9, 31)));
  assert.ok(!T.cronMatches(c, at(2026, 10, 24, 9, 30)), "Saturday");
  assert.deepEqual(T.nextCron(c, at(2026, 10, 21, 17, 50)), at(2026, 10, 22, 9, 0));
  assert.deepEqual(T.nextCron(T.parseCron("0 7 * * *"), at(2026, 10, 21, 7, 0)), at(2026, 10, 22, 7, 0), "strictly after");
  assert.deepEqual(T.nextCron(T.parseCron("30 2 29 2 *"), at(2027, 3, 1, 0, 0)), at(2028, 2, 29, 2, 30), "leap day");
  for (const bad of ["", "* * * *", "60 * * * *", "*/0 * * * *", "a b c d e", "1-0 * * * *"]) assert.equal(T.parseCron(bad), null, bad);
  assert.equal(T.parseDuration("90s"), 90_000);
  assert.equal(T.parseDuration("2h"), 7_200_000);
  assert.equal(T.parseDuration("soon"), null);
});

test("creating: schedules and triggers are checked, and the limits hold", () => {
  const ok = T.createTask({ name: "Morning disk", prompt: "check disks", cron: "0 7 * * *" });
  assert.equal(ok.task.kind, "schedule");
  assert.ok(T.createTask({ name: "morning DISK", prompt: "x", every: "1h" }).error.includes("already"), "names are unique");
  assert.match(T.createTask({ name: "Fast", prompt: "x", cron: "* * * * *" }).error, /5 minutes/);
  assert.match(T.createTask({ name: "Fast2", prompt: "x", every: "1m" }).error, /5 minutes/);
  assert.match(T.createTask({ name: "Both", prompt: "x", every: "1h", check: "free", fires: "changed" }).error, /not both/);
  assert.match(T.createTask({ name: "None", prompt: "x" }).error, /either a schedule/);
  assert.match(T.createTask({ name: "Mutating", prompt: "x", check: "rm -rf /tmp/x", fires: "zero" }).error, /read-only/);
  assert.match(T.createTask({ name: "Redirect", prompt: "x", check: "cat /etc/passwd > /tmp/x", fires: "changed" }).error, /read-only/);
  assert.match(T.createTask({ name: "BadFires", prompt: "x", check: "free", fires: "sometimes" }).error, /fires must/);
  assert.match(T.createTask({ name: "Quick", prompt: "x", check: "free", fires: "changed", interval: "5s" }).error, /30s/);
  const trig = T.createTask({ name: "RAM", prompt: "look", check: "free | awk '/Mem/{printf \"%d\", $3/$2*100}'", fires: "above:90" }, { fullAccess: true, server: "agent:web" });
  assert.equal(trig.task.kind, "trigger");
  assert.equal(trig.task.fullAccess, true);
  assert.equal(trig.task.server, "agent:web");
  for (const t of [...T.listTasks()]) T.removeTask(t.id);
  for (let i = 0; i < T.MAX_TASKS; i++) assert.ok(T.createTask({ name: `t${i}`, prompt: "x", every: "1h" }).task);
  assert.match(T.createTask({ name: "one too many", prompt: "x", every: "1h" }).error, /Remove one first/);
  for (const t of [...T.listTasks()]) T.removeTask(t.id);
});

const trigger = (fires, extra = {}) => ({ check: "x", fires, cooldown: "10m", state: {}, ...extra });
const r = (output, exitCode = 0) => ({ exitCode, output });

test("a trigger fires on the way in, not while the condition holds, and rearms when it clears", () => {
  const t = trigger("above:90");
  let v = T.evaluate(t, r("85"), 0);
  assert.equal(v.fire, false);
  Object.assign(t.state, v.patch);
  v = T.evaluate(t, r("92"), 1 * MIN);
  assert.equal(v.fire, true);
  assert.match(v.reason, /92, above 90/);
  Object.assign(t.state, v.patch, { lastFiredAt: 1 * MIN });
  assert.equal(T.evaluate(t, r("95"), 2 * MIN).fire, false, "still high: no second wake-up");
  Object.assign(t.state, T.evaluate(t, r("80"), 3 * MIN).patch);
  assert.equal(t.state.active, false, "cleared");
  assert.equal(T.evaluate(t, r("93"), 4 * MIN).fire, false, "back above, but inside the cooldown");
  Object.assign(t.state, T.evaluate(t, r("93"), 4 * MIN).patch);
  assert.equal(T.evaluate(t, r("93"), 12 * MIN).fire, true, "fires once the cooldown has passed, if still true");
});

test("changed records a baseline first, then fires on each change after the cooldown", () => {
  const t = trigger("changed");
  let v = T.evaluate(t, r("111"), 0);
  assert.equal(v.fire, false);
  Object.assign(t.state, v.patch);
  assert.equal(T.evaluate(t, r("111"), MIN).fire, false);
  v = T.evaluate(t, r("222"), 2 * MIN);
  assert.equal(v.fire, true);
  assert.match(v.reason, /from "111" to "222"/);
  Object.assign(t.state, v.patch, { lastFiredAt: 2 * MIN });
  assert.equal(T.evaluate(t, r("333"), 3 * MIN).fire, false, "cooling down; the change is kept for later");
  assert.equal(T.evaluate(t, r("333"), 13 * MIN).fire, true);
});

test("exit codes, text, below, and checks that did not run", () => {
  assert.equal(T.evaluate(trigger("nonzero"), r("", 1), 0).fire, true);
  assert.equal(T.evaluate(trigger("nonzero"), r("", 0), 0).fire, false);
  assert.equal(T.evaluate(trigger("zero"), r("", 0), 0).fire, true);
  assert.equal(T.evaluate(trigger("contains:ERROR"), r("all fine, error found"), 0).fire, true);
  assert.equal(T.evaluate(trigger("below:10"), r("free: 4"), 0).fire, true);
  const broken = T.evaluate(trigger("nonzero"), { exitCode: null, output: "exec error: agent offline" }, 0);
  assert.equal(broken.fire, false);
  assert.match(broken.error, /offline/);
  assert.match(T.evaluate(trigger("above:1"), r("no digits"), 0).error, /no number/);
});

test("the scheduler: due schedules fire once, missed ones are not replayed, disabled ones never fire", async () => {
  for (const t of [...T.listTasks()]) T.removeTask(t.id);
  let clock = at(2026, 10, 21, 6, 59).getTime();
  const fired = [];
  const { tick } = T.startScheduler({ fire: async (task, why) => void fired.push(task.name), check: async () => r("0"), now: () => clock });
  T.createTask({ name: "Seven", prompt: "x", cron: "0 7 * * *" }, { now: clock });
  const off = T.createTask({ name: "Off", prompt: "x", cron: "0 7 * * *" }, { now: clock }).task;
  T.updateTask(off.id, { enabled: false });

  await tick(); // first sight: only sets the clock
  assert.deepEqual(fired, []);
  clock = at(2026, 10, 21, 7, 0).getTime() + 3_000;
  await tick();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(fired, ["Seven"]);
  await tick();
  assert.deepEqual(fired, ["Seven"], "not again in the same minute");

  // The server was down all of tomorrow morning: the 07:00 run is not replayed.
  clock = at(2026, 10, 22, 12, 0).getTime();
  await tick();
  assert.deepEqual(fired, ["Seven"]);
  for (const t of [...T.listTasks()]) T.removeTask(t.id);
  T.stopScheduler();
});

test("the scheduler runs triggers on their interval, never overlaps one task, and records check errors", async () => {
  let clock = 1_000_000;
  const checks = [];
  let value = "50";
  let release;
  const fired = [];
  const { tick } = T.startScheduler({
    fire: (task) => new Promise((res) => ((release = res), fired.push(task.name))),
    check: async (task) => (checks.push(clock), value === "ERR" ? { exitCode: null, output: "agent offline" } : r(value)),
    now: () => clock,
  });
  const { task } = T.createTask({ name: "Watch", prompt: "x", check: "free", fires: "above:90", interval: "30s", cooldown: "1m" });
  await tick();
  clock += 10_000;
  await tick();
  assert.equal(checks.length, 1, "not before its interval");
  clock += 30_000;
  value = "95";
  await tick();
  assert.equal(checks.length, 2);
  assert.deepEqual(fired, ["Watch"]);
  clock += 40_000;
  value = "ERR";
  await tick();
  assert.equal(checks.length, 2, "the task is still firing: no overlap");
  release();
  await new Promise((r) => setImmediate(r));
  clock += 40_000;
  await tick();
  assert.equal(task.state.lastError, "agent offline");
  assert.equal(fired.length, 1);
  T.removeTask(task.id);
  T.stopScheduler();
});

test("a task's chat keeps only its last three turns before each wake-up", () => {
  const conv = [];
  for (let i = 0; i < 6; i++) {
    conv.push({ role: "user", content: `[Task] fire ${i}`, ask: true });
    conv.push({ role: "assistant", content: null, tool_calls: [{ id: `c${i}`, type: "function", function: { name: "inspect", arguments: "{}" } }] });
    conv.push({ role: "tool", tool_call_id: `c${i}`, content: "{}" });
    conv.push({ role: "assistant", content: `report ${i}` });
  }
  trimToRecentTurns(conv);
  assert.equal(conv.filter((m) => m.ask).length, 3);
  assert.equal(conv[0].content, "[Task] fire 3", "starts at a turn boundary, so no tool result is orphaned");
  assert.equal(trimToRecentTurns(conv), 0, "already short");
});

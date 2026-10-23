// Tasks: things the agent does on its own. A schedule runs it at set times (cron or "every 30m"); a trigger runs a
// read-only check on a timer and wakes it when the check's result crosses a line (a file changed, RAM above 90%,
// a process gone). This module holds the tasks and decides *when* to wake the agent; what happens then is
// injected (`fire`), so nothing here knows about the model.
import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { env } from "./env.js";
import { classifyInspect } from "./exec.js";

const FILE = join(env.dataDir, "tasks.json");
export const MAX_TASKS = 20;
const MIN_EVERY_MS = 5 * 60_000; // each wake-up is a paid model turn
const MIN_CHECK_MS = 30_000;
const MAX_CHECK_MS = 24 * 3600_000;
const MIN_COOLDOWN_MS = 60_000;
const DEFAULT_COOLDOWN_MS = 10 * 60_000;
const DEFAULT_CHECK_MS = 60_000;
const TICK_MS = 10_000;

/* ---------------- durations and cron ---------------- */

const UNITS = { s: 1000, m: 60_000, h: 3600_000, d: 86_400_000 };

/** "30s", "5m", "2h", "1d" to milliseconds, or null. */
export function parseDuration(text) {
  const m = /^(\d{1,6})\s*([smhd])$/i.exec(String(text ?? "").trim());
  return m ? Number(m[1]) * UNITS[m[2].toLowerCase()] : null;
}

function parseField(src, min, max) {
  const out = new Set();
  for (const part of src.split(",")) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) return null;
    const step = m[2] ? Number(m[2]) : 1;
    if (step < 1) return null;
    let lo, hi;
    if (m[1] === "*") [lo, hi] = [min, max];
    else if (m[1].includes("-")) [lo, hi] = m[1].split("-").map(Number);
    else {
      lo = Number(m[1]);
      hi = m[2] ? max : lo;
    }
    if (!(lo >= min && hi <= max && lo <= hi)) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out.size ? out : null;
}

/** A five-field cron expression (minute hour day-of-month month day-of-week), or null when it is not one. */
export function parseCron(expr) {
  const f = String(expr ?? "").trim().split(/\s+/);
  if (f.length !== 5) return null;
  const minute = parseField(f[0], 0, 59);
  const hour = parseField(f[1], 0, 23);
  const dom = parseField(f[2], 1, 31);
  const month = parseField(f[3], 1, 12);
  const dowRaw = parseField(f[4], 0, 7);
  if (!minute || !hour || !dom || !month || !dowRaw) return null;
  const dow = new Set([...dowRaw].map((d) => d % 7));
  return { minute, hour, dom, month, dow, domAny: f[2] === "*", dowAny: f[4] === "*" };
}

function dayMatches(c, d) {
  const inDom = c.dom.has(d.getDate());
  const inDow = c.dow.has(d.getDay());
  // Classic cron: when both day fields are restricted, either one matches.
  if (!c.domAny && !c.dowAny) return inDom || inDow;
  return inDom && inDow;
}

export function cronMatches(c, date) {
  return c.minute.has(date.getMinutes()) && c.hour.has(date.getHours()) && c.month.has(date.getMonth() + 1) && dayMatches(c, date);
}

/** The first matching minute strictly after `after` (server local time), as a Date, or null within a year. */
export function nextCron(c, after) {
  const t = new Date(after.getTime());
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);
  const limit = after.getTime() + 366 * 86_400_000;
  while (t.getTime() <= limit) {
    if (!c.month.has(t.getMonth() + 1) || !dayMatches(c, t)) {
      t.setDate(t.getDate() + 1);
      t.setHours(0, 0, 0, 0);
    } else if (!c.hour.has(t.getHours())) {
      t.setHours(t.getHours() + 1, 0, 0, 0);
    } else if (!c.minute.has(t.getMinutes())) {
      t.setMinutes(t.getMinutes() + 1);
    } else return new Date(t.getTime());
  }
  return null;
}

/* ---------------- the store ---------------- */

let tasks = [];
try {
  if (existsSync(FILE)) {
    const saved = JSON.parse(readFileSync(FILE, "utf8"));
    if (Array.isArray(saved)) tasks = saved.filter((t) => t && typeof t.id === "string");
  }
} catch {
  // an unreadable file only means there are no tasks yet
}

let saveTimer = null;
function writeNow() {
  saveTimer = null;
  try {
    const tmp = `${FILE}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(tasks, null, 1), { mode: 0o600 });
    renameSync(tmp, FILE);
  } catch {
    // kept in memory for this run
  }
}
/** Saves soon: a tick that changes a counter does not need its own write. */
function save({ now = false } = {}) {
  if (now) return writeNow();
  if (!saveTimer) saveTimer = setTimeout(writeNow, 1500).unref();
}

export const listTasks = () => tasks;
export const getTask = (idOrName) => {
  const q = String(idOrName ?? "").trim();
  return tasks.find((t) => t.id === q) ?? tasks.find((t) => t.name.toLowerCase() === q.toLowerCase());
};
export const conversationIdOf = (task) => `task-${task.id}`;

const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const FIRES = /^(nonzero|zero|changed|above:-?\d+(\.\d+)?|below:-?\d+(\.\d+)?|contains:.{1,100})$/;

/**
 * Validate and store a new task. `server` is already resolved by the caller ("" or agent:name).
 * Returns { task } or { error }.
 */
export function createTask(spec, { fullAccess = false, model, server = "", now = Date.now() } = {}) {
  if (tasks.length >= MAX_TASKS) return { error: `there are already ${MAX_TASKS} tasks. Remove one first.` };
  const name = clean(spec.name, 60);
  const prompt = String(spec.prompt ?? "").trim().slice(0, 1500);
  if (!name) return { error: "a short name is required." };
  if (!prompt) return { error: "prompt is required: what the agent should do when the task wakes it." };
  if (getTask(name)) return { error: `a task named "${name}" already exists.` };

  const hasSchedule = spec.cron || spec.every;
  const hasCheck = spec.check;
  if (!!hasSchedule === !!hasCheck) return { error: "give either a schedule (cron or every) or a check with fires, not both and not neither." };

  const task = {
    id: randomUUID(),
    name,
    prompt,
    server,
    model: model || undefined,
    fullAccess: !!fullAccess,
    enabled: true,
    createdAt: new Date(now).toISOString(),
    state: { runs: 0 },
  };

  if (hasSchedule) {
    if (spec.cron && spec.every) return { error: "use cron or every, not both." };
    task.kind = "schedule";
    if (spec.cron) {
      const c = parseCron(spec.cron);
      if (!c) return { error: `"${clean(spec.cron, 60)}" is not a five-field cron expression (minute hour day-of-month month day-of-week).` };
      // Every gap in the next few runs must be at least the minimum, so "* * * * *" cannot burn a turn a minute.
      let at = new Date(now);
      for (let i = 0; i < 6; i++) {
        const nxt = nextCron(c, at);
        if (!nxt) return { error: "that cron expression never runs." };
        if (i > 0 && nxt - at < MIN_EVERY_MS) return { error: "that runs more than once every 5 minutes. Each run is a paid model turn, so the minimum is 5 minutes." };
        at = nxt;
      }
      task.cron = clean(spec.cron, 60);
    } else {
      const ms = parseDuration(spec.every);
      if (!ms || ms < MIN_EVERY_MS) return { error: 'every must be like "30m", "2h" or "1d", at least 5 minutes.' };
      task.every = clean(spec.every, 10).toLowerCase();
    }
  } else {
    task.kind = "trigger";
    const check = String(spec.check).trim().slice(0, 500);
    const verdict = classifyInspect(check);
    if (!verdict.ok) return { error: `the check must be a read-only command (it runs unattended): ${verdict.reason}.` };
    const fires = String(spec.fires ?? "").trim();
    if (!FIRES.test(fires)) return { error: 'fires must be one of: nonzero, zero, changed, above:N, below:N, contains:TEXT.' };
    const interval = spec.interval === undefined ? DEFAULT_CHECK_MS : parseDuration(spec.interval);
    if (!interval || interval < MIN_CHECK_MS || interval > MAX_CHECK_MS) return { error: "interval must be between 30s and 24h, like 30s, 5m or 1h." };
    const cooldown = spec.cooldown === undefined ? DEFAULT_COOLDOWN_MS : parseDuration(spec.cooldown);
    if (!cooldown || cooldown < MIN_COOLDOWN_MS) return { error: "cooldown must be at least 1m, like 10m or 1h." };
    Object.assign(task, { check, fires, interval: clean(spec.interval ?? "1m", 10).toLowerCase(), cooldown: clean(spec.cooldown ?? "10m", 10).toLowerCase() });
  }
  tasks.push(task);
  save({ now: true });
  return { task };
}

export function updateTask(id, patch) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return null;
  if (typeof patch.enabled === "boolean") {
    task.enabled = patch.enabled;
    // Starting again means "from now": no catching up on what was missed, and a trigger re-reads its baseline.
    if (patch.enabled) task.state = { ...task.state, nextRunAt: undefined, nextCheckAt: undefined, lastValue: undefined, active: false };
  }
  if (typeof patch.fullAccess === "boolean") task.fullAccess = patch.fullAccess;
  save({ now: true });
  return task;
}

export function removeTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return null;
  tasks = tasks.filter((t) => t !== task);
  save({ now: true });
  return task;
}

/** A short plain description of when the task runs, for the prompt and the panel. */
export function describeTask(t) {
  if (t.kind === "schedule") return t.cron ? `cron ${t.cron}` : `every ${t.every}`;
  const when = { nonzero: "fails", zero: "succeeds", changed: "output changes" }[t.fires] ?? t.fires.replace(":", " ");
  return `when "${t.check}" ${when} (checked every ${t.interval})`;
}

/* ---------------- deciding when to wake the agent ---------------- */

const num = (output) => {
  const m = /-?\d+(?:\.\d+)?/.exec(String(output ?? ""));
  return m ? Number(m[0]) : null;
};
const brief = (s, n = 160) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/**
 * Judge one check result against the task's line. Triggers fire on the way *into* the condition (not on every
 * check while it holds), then rearm when it clears. Returns { fire, reason?, patch, error? }; `patch` is state to keep.
 */
export function evaluate(task, result, now = Date.now()) {
  const s = task.state ?? {};
  const [kind, arg = ""] = [task.fires.split(":")[0], task.fires.slice(task.fires.indexOf(":") + 1)];
  if (result.exitCode === null || result.exitCode === undefined) {
    return { fire: false, patch: {}, error: brief(result.output || "the check did not run", 200) };
  }
  const cooled = !s.lastFiredAt || now - s.lastFiredAt >= parseDuration(task.cooldown);
  const out = String(result.output ?? "").trim().slice(0, 2000);

  if (kind === "changed") {
    if (s.lastValue === undefined) return { fire: false, patch: { lastValue: out } }; // the baseline
    const differs = out !== s.lastValue;
    if (differs && cooled) return { fire: true, reason: `the output of "${task.check}" changed from "${brief(s.lastValue)}" to "${brief(out)}"`, patch: { lastValue: out } };
    return { fire: false, patch: {} };
  }

  let cond;
  let seen = out;
  if (kind === "nonzero") (cond = result.exitCode !== 0), (seen = `exit code ${result.exitCode}`);
  else if (kind === "zero") (cond = result.exitCode === 0), (seen = "exit code 0");
  else if (kind === "contains") cond = out.toLowerCase().includes(arg.toLowerCase());
  else {
    const v = num(out);
    if (v === null) return { fire: false, patch: {}, error: "the check printed no number" };
    cond = kind === "above" ? v > Number(arg) : v < Number(arg);
    seen = String(v);
  }
  if (!cond) return { fire: false, patch: { active: false, lastValue: seen } };
  if (s.active) return { fire: false, patch: { lastValue: seen } };
  // Newly true but still cooling down: stay unarmed so it fires as soon as the cooldown ends, if it still holds.
  if (!cooled) return { fire: false, patch: { lastValue: seen } };
  const line = { nonzero: "failed", zero: "succeeded", contains: `contains "${arg}"`, above: `is ${seen}, above ${arg}`, below: `is ${seen}, below ${arg}` }[kind];
  return { fire: true, reason: `the check "${task.check}" ${line}${["nonzero", "zero"].includes(kind) ? ` (${seen})` : ""}${out && !["above", "below"].includes(kind) ? `. Output: ${brief(out, 300)}` : ""}`, patch: { active: true, lastValue: seen } };
}

/* ---------------- the scheduler ---------------- */

let timer = null;
const firing = new Set();

/**
 * Starts the clock. `fire(task, why)` runs the agent (one at a time is the caller's job to enforce through
 * its own queue); `check(task)` runs the trigger's command and resolves { exitCode, output }.
 */
export function startScheduler({ fire, check, now = () => Date.now() }) {
  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      await tickOnce();
    } finally {
      ticking = false;
    }
  };
  const tickOnce = async () => {
    const t = now();
    for (const task of tasks) {
      if (!task.enabled || firing.has(task.id)) continue;
      try {
        if (task.kind === "schedule") {
          const due = task.state.nextRunAt;
          if (due === undefined || t >= due) {
            const after = new Date(t);
            const next = task.cron ? nextCron(parseCron(task.cron), after) : new Date(t + parseDuration(task.every));
            task.state.nextRunAt = next ? next.getTime() : undefined;
            save();
            // The first sight of a task only sets the clock; a run that is due fires once, missed ones are not replayed.
            if (due !== undefined && t - due < 2 * TICK_MS + 60_000) run(task, `it is scheduled (${describeTask(task)})`);
          }
        } else {
          if (task.state.nextCheckAt !== undefined && t < task.state.nextCheckAt) continue;
          task.state.nextCheckAt = t + parseDuration(task.interval);
          task.state.lastCheckedAt = t;
          const result = await check(task);
          const v = evaluate(task, result, t);
          Object.assign(task.state, v.patch);
          task.state.lastError = v.error;
          save();
          if (v.fire) run(task, v.reason);
        }
      } catch (err) {
        task.state.lastError = String(err?.message ?? err).slice(0, 200);
      }
    }
  };
  const run = (task, why) => {
    firing.add(task.id);
    Promise.resolve(fire(task, why))
      .catch((err) => {
        task.state.lastError = String(err?.message ?? err).slice(0, 200);
      })
      .finally(() => {
        firing.delete(task.id);
        save();
      });
  };
  if (timer) clearInterval(timer);
  timer = setInterval(() => tick().catch(() => {}), TICK_MS);
  timer.unref?.();
  return { tick, run };
}

export const stopScheduler = () => {
  if (timer) clearInterval(timer);
  timer = null;
};
export const isFiring = (id) => firing.has(id);
export const noteRun = (task, patch) => {
  Object.assign(task.state, patch);
  save();
};
export const saveTasksNow = () => save({ now: true });

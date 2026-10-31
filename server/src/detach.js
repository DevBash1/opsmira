// Detached runs (docs/detach.md): a job handed to a connected server, which runs it on its own and reports back.
// The console starts it through the agent, follows its log while it can, puts every command it ran in the audit
// log, and writes the report into the conversation that started it.
import { createHash, randomUUID } from "crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import { AGENT_PREFIX, agentAccess, agentByName, agentCaps, callAgent, onAgentEvent } from "./agents.js";
import { env } from "./env.js";
import { preferredModel } from "./models.js";
import { getSession, persistSession } from "./state.js";
import { appendAudit } from "./store.js";

const FILE = join(env.dataDir, "detached.json");
const KEEP_RUNS = 50;
const KEEP_ENTRIES = 300;
export const MAX_MINUTES = 120;
export const MAX_STEPS = 100;

let runs = (() => {
  try {
    const saved = JSON.parse(readFileSync(FILE, "utf8"));
    return Array.isArray(saved.runs) ? saved.runs : [];
  } catch {
    return [];
  }
})();

function save() {
  runs = runs.slice(-KEEP_RUNS);
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify({ runs }, null, 2), { mode: 0o600 });
  renameSync(tmp, FILE);
}

/** The runner the agent starts, with its sha256 (the agent checks it before writing it). */
function runner() {
  const text = readFileSync(join(env.agentDir, "opsmira-detached.mjs"), "utf8");
  return { text, sha256: createHash("sha256").update(text).digest("hex") };
}

/** Null when this server can take a detached run, else why not (said to the model). */
export function detachProblem(server) {
  if (typeof server !== "string" || !server.startsWith(AGENT_PREFIX)) return "detach needs a server connected with opsmira-agent (agent:<name>); it cannot run on this console's own machine or over SSH";
  const name = server.slice(AGENT_PREFIX.length);
  if (!agentByName(name)) return `no connected server named ${name}`;
  const access = agentAccess(name);
  if (!access) return `${name} is not connected right now`;
  if (access !== "operate") return `${name} is read-only; a detached run needs operate access (reinstall its agent with --access operate)`;
  if (!agentCaps(name).includes("detach")) return `${name} runs an older agent without detach mode; it updates itself shortly after the console ships a new one, or reinstall it`;
  if (!existsSync(join(env.agentDir, "opsmira-detached.mjs"))) return "this console does not ship the detached runner";
  return null;
}

/** Start an approved detached run. Same result shape as a command, so the approval flow can report it. */
export async function startDetached(proposal, conversationId, { console: consoleUrl } = {}) {
  const started = Date.now();
  const problem = detachProblem(proposal.server);
  if (problem) return { exitCode: null, output: `not started: ${problem}`, durationMs: 0 };
  const d = proposal.detach;
  const name = proposal.server.slice(AGENT_PREFIX.length);
  const id = randomUUID();
  const minutes = Math.min(Math.max(Number(d.minutes) || 30, 5), MAX_MINUTES);
  const spec = {
    id,
    goal: d.goal,
    plan: d.plan,
    why: d.why,
    server: name,
    model: d.model || preferredModel(),
    baseUrl: env.openrouterBaseUrl,
    maxSteps: Math.min(Math.max(Number(d.maxSteps) || 40, 5), MAX_STEPS),
    deadline: new Date(Date.now() + minutes * 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    // so the run can check the console answers again after a change that restarts it
    ...(consoleUrl ? { console: consoleUrl } : {}),
  };
  const r = await callAgent(agentByName(name).id, "detach", { spec, key: env.openrouterApiKey, runner: runner() }, 30_000);
  if (!r.ok) return { exitCode: null, output: `not started: ${r.stderr || r.output || "the agent did not answer"}`, durationMs: Date.now() - started };
  runs.push({ id, conversationId: conversationId ?? null, server: proposal.server, goal: d.goal, status: "running", startedAt: spec.createdAt, deadline: spec.deadline, entries: [], audited: [], report: null });
  save();
  return {
    exitCode: 0,
    output: `Detached run ${id} started on ${name}: up to ${spec.maxSteps} steps, until ${spec.deadline}. ${r.output || ""} Its commands land in Activity as it reports; the report comes back into this conversation.`.trim(),
    durationMs: Date.now() - started,
    detachedRun: id,
  };
}

export function listDetached() {
  return runs
    .slice()
    .reverse()
    .map(({ audited, entries, ...r }) => ({ ...r, last: entries.slice(-12) }));
}

const clip = (text, n) => (typeof text === "string" ? (text.length > n ? `${text.slice(0, n)}\n…[truncated]` : text) : "");

/** New log entries from the agent: keep the tail, and audit every command the moment its result arrives. */
function onLog(server, id, entries) {
  const run = runs.find((r) => r.id === id && r.server === server);
  if (!run || !Array.isArray(entries)) return;
  for (const e of entries.slice(0, 500)) {
    if (!e || typeof e !== "object" || typeof e.type !== "string") continue;
    run.entries.push(e);
    run.lastAt = e.t ?? new Date().toISOString();
    if (e.type === "result" && Number.isInteger(e.n) && !run.audited.includes(e.n)) {
      const started = [...run.entries].reverse().find((x) => x.type === "run" && x.n === e.n);
      run.audited.push(e.n);
      appendAudit({
        id: randomUUID(),
        kind: "act",
        auto: true,
        by: "detached",
        detachedRun: id,
        title: clip(`Detached: ${started?.why || run.goal}`, 160),
        command: clip(started?.command ?? "(unknown)", 4000),
        server,
        exitCode: Number.isInteger(e.exitCode) ? e.exitCode : null,
        output: clip(e.output, 16_000),
        durationMs: Number(e.durationMs) || 0,
        timedOut: !!e.timedOut,
      });
    }
  }
  run.entries = run.entries.slice(-KEEP_ENTRIES);
  save();
}

/** The run ended: record it, tell the conversation that started it (owner and model both), and ack. */
function onReport(server, id, report) {
  const run = runs.find((r) => r.id === id && r.server === server);
  if (!run) return true; // unknown here (data reset): ack anyway so the server cleans up
  if (run.report) return true;
  const status = typeof report?.status === "string" ? report.status : "failed";
  const summary = clip(typeof report?.summary === "string" ? report.summary : "(no summary)", 8000);
  run.report = { status, summary, steps: Number(report?.steps) || 0, commands: Number(report?.commands) || 0, at: report?.at ?? new Date().toISOString() };
  run.status = status;
  save();
  if (run.conversationId) deliver(run);
  return true;
}

/** Into the conversation. A turn in flight owns the conversation array, so wait for it to end. */
function deliver(run, tries = 0) {
  const session = getSession(null, run.conversationId);
  if (session.run && tries < 120) {
    setTimeout(() => deliver(run, tries + 1), 5000).unref();
    return;
  }
  const r = run.report;
  const name = run.server.slice(AGENT_PREFIX.length);
  const label = { done: "finished", failed: "failed", stopped: "was stopped", timeout: "ran out of time", budget: "ran out of steps" }[r.status] ?? `ended (${r.status})`;
  session.conversation.push({
    role: "user",
    content: `[System] The detached run on ${name} (${run.id}) ${label} after ${r.steps} steps and ${r.commands} commands. Its report:\n${r.summary}`,
  });
  session.conversation.push({ role: "assistant", content: `**The detached run on ${name} ${label}.**\n\n${r.summary}` });
  persistSession(session);
}

onAgentEvent((server, msg, reply) => {
  if (typeof msg.id !== "string") return;
  if (msg.type === "detach-log") onLog(server, msg.id, msg.entries);
  else if (msg.type === "detach-report" && onReport(server, msg.id, msg.report)) reply({ type: "detach-ack", id: msg.id });
});

/** The owner, from the console: a message for the run, or a stop request (the runner reads both between steps). */
export async function tellDetached(id, { text, stop } = {}) {
  const run = runs.find((r) => r.id === id);
  if (!run) return { ok: false, error: "No such detached run" };
  const agent = agentByName(run.server.slice(AGENT_PREFIX.length));
  if (!agent) return { ok: false, error: "That server is no longer connected to this console" };
  const r = await callAgent(agent.id, "detach-tell", { run: id, ...(stop ? { stop: true } : { text: String(text ?? "").slice(0, 4000) }) }, 10_000);
  return r.ok ? { ok: true } : { ok: false, error: r.stderr || "The server did not answer" };
}

// What happens when a task wakes the agent: its own conversation gets a message saying why, one model turn
// runs, and anything that needs approval waits there (the owner opens the task's chat to decide).
import { classifyInspect, runCommand } from "./exec.js";
import { conversationIdOf, noteRun } from "./tasks.js";
import { getSession, persistSession } from "./state.js";
import { runTurn } from "./ai.js";
import { contentText } from "./content.js";

const TURN_TIMEOUT_MS = 5 * 60_000;
const KEEP_TURNS = 3;

/** Run a trigger's check command. It was read-only when it was made; it is checked again here, every time. */
export async function runCheck(task) {
  const verdict = classifyInspect(task.check);
  if (!verdict.ok) return { exitCode: null, output: `the check is no longer allowed: ${verdict.reason}` };
  const r = await runCommand(task.check, { server: task.server || undefined });
  return { exitCode: r.exitCode ?? null, output: r.output };
}

/** Old turns are dropped before each wake-up, so a task that fires every hour never grows its own context. */
export function trimToRecentTurns(conversation, keep = KEEP_TURNS) {
  const asks = conversation.flatMap((m, i) => (m.role === "user" && m.ask ? [i] : []));
  if (asks.length <= keep) return 0;
  const cut = asks[asks.length - keep];
  conversation.splice(0, cut);
  return cut;
}

// One agent turn at a time across all tasks: they share the model's rate limits and the owner's attention.
let queue = Promise.resolve();

/** Wake the agent for `task` because of `why`. Resolves when the turn is over. */
export function fireTask(task, why) {
  const turn = queue.then(() => wake(task, why));
  queue = turn.catch(() => {});
  return turn;
}

async function wake(task, why) {
  const session = getSession(null, conversationIdOf(task));
  const started = new Date();
  if (session.run) {
    noteRun(task, { lastError: "skipped: its chat is busy right now", lastSkippedAt: started.toISOString() });
    return;
  }
  const abort = new AbortController();
  session.run = { abort, steers: [], vision: false };
  const timeout = setTimeout(() => abort.abort(), TURN_TIMEOUT_MS);
  session.title = task.name;
  session.titledAt = 1e9; // named by the task, so the title model leaves it alone
  if (task.model) session.lastModel = task.model;
  trimToRecentTurns(session.conversation);

  const where = task.server ? `on ${task.server}` : "on the server Opsmira runs on";
  session.conversation.push({
    role: "user",
    ask: true,
    content:
      `[Task] "${task.name}" woke you at ${started.toISOString()} because ${why}. It runs ${where}.\n\n${task.prompt}\n\n` +
      "Nobody is watching this run. Look into it, do what the task says, and finish with a short report of what you found and did. " +
      (task.fullAccess ? "" : "Anything that changes the server needs the owner's approval: propose it, and say it is waiting."),
  });
  let error;
  try {
    await runTurn(session.conversation, () => {}, task.model, session.pendingApprovals, {
      signal: abort.signal,
      steers: session.run.steers,
      vision: false,
      fullAccess: task.fullAccess,
      unattended: true,
      server: task.server || "local",
    });
  } catch (err) {
    error = abort.signal.aborted ? "stopped: it ran longer than 5 minutes" : String(err?.message ?? err).slice(0, 200);
  } finally {
    clearTimeout(timeout);
    session.run = null;
    persistSession(session);
  }
  const reply = [...session.conversation].reverse().find((m) => m.role === "assistant" && contentText(m.content).trim());
  noteRun(task, {
    runs: (task.state.runs ?? 0) + 1,
    lastFiredAt: started.getTime(),
    lastRunAt: started.toISOString(),
    lastWhy: why.slice(0, 300),
    lastResult: reply ? contentText(reply.content).replace(/\s+/g, " ").trim().slice(0, 400) : undefined,
    lastError: error,
  });
}

/** Proposals from a task's runs that are still waiting for the owner. */
export function waitingFor(task) {
  const session = getSession(null, conversationIdOf(task));
  return [...session.pendingApprovals.values()].filter((p) => p.status === "pending").length;
}

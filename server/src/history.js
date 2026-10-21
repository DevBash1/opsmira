// Rebuilds what the console shows for a conversation's latest turn (tool pills, surface, replies,
// approvals, follow-up chips, memory notes) from the stored model messages, and rewinds a conversation.
import { contentImages, contentText } from "./content.js";
import { deriveScene } from "./views.js";
import { cleanSuggestions, safeParse } from "./text.js";

const SYSTEM_NOTE = /^\[System\] /;
// Tools that only decorate the console: a reply written alongside them is the turn's reply.
export const QUIET_TOOLS = new Set(["show_surface", "show_view", "suggest_next", "remember", "forget", "save_artifact", "delete_artifact"]);

const isSystemNote = (m) => m.role === "user" && typeof m.content === "string" && SYSTEM_NOTE.test(m.content);

/** Index of the owner message that opened the latest turn, or -1. */
export function lastAskIndex(conversation) {
  for (let i = conversation.length - 1; i >= 0; i--) if (conversation[i].ask) return i;
  // Conversations saved before turns were marked: the last message the owner typed.
  for (let i = conversation.length - 1; i >= 0; i--) {
    if (conversation[i].role === "user" && !isSystemNote(conversation[i])) return i;
  }
  return -1;
}

export function buildLastTurn(conversation, proposals) {
  const start = lastAskIndex(conversation);
  if (start < 0) return null;
  const first = conversation[start];
  const turn = {
    ask: contentText(first.content),
    images: contentImages(first.content),
    steers: [],
    tools: [],
    scene: undefined,
    replies: [],
    proposals: [],
    suggestions: [],
    memories: [],
    artifacts: [],
    stopped: false,
  };
  const calls = new Map();

  for (const m of conversation.slice(start + 1)) {
    if (m.role === "user") {
      if (isSystemNote(m)) {
        if (/stopped this turn/.test(m.content)) turn.stopped = true;
      } else {
        turn.steers.push({ text: contentText(m.content), images: contentImages(m.content) });
      }
    } else if (m.role === "assistant") {
      const list = Array.isArray(m.tool_calls) ? m.tool_calls : [];
      for (const call of list) calls.set(call.id, { name: call.function?.name, args: safeParse(call.function?.arguments) ?? {} });
      const text = typeof m.content === "string" ? m.content.trim() : "";
      const quietOnly = list.length > 0 && list.every((c) => QUIET_TOOLS.has(c.function?.name));
      if (text && (list.length === 0 || quietOnly)) turn.replies.push(text);
    } else if (m.role === "tool") {
      const call = calls.get(m.tool_call_id);
      if (!call) continue;
      const result = safeParse(m.content) ?? {};
      const { name, args } = call;
      if (name === "inspect") {
        const command = String(args.command ?? "");
        if (typeof result.error === "string") {
          if (result.error.startsWith("rejected:")) {
            const reason = result.error.replace(/^rejected:\s*/, "").replace(/\.\s*Use propose_action.*$/, "");
            turn.tools.push({ kind: "inspect", command, server: args.server || undefined, rejected: reason });
          }
          continue;
        }
        turn.tools.push({ kind: "inspect", command, server: args.server || undefined, output: result.output, exitCode: result.exitCode ?? null });
        const shown = m.view ?? (args.server ? null : deriveScene(command, result));
        if (shown) turn.scene = { scene: shown.scene, data: shown.data };
      } else if (name === "show_surface" || name === "show_view") {
        // Only what the console really showed (kept with the message). Chats saved before surfaces
        // were live have no stored view, and sample data is never rebuilt.
        if (m.view) turn.scene = { scene: m.view.scene, data: m.view.data };
      } else if (name === "propose_action") {
        if (result.status === "awaiting_approval") {
          const proposal = proposals.get(result.id);
          if (proposal) turn.proposals.push(proposal);
        } else if (result.status === "executed") {
          turn.tools.push({ kind: "act", command: String(args.command ?? ""), server: args.server || undefined, title: args.title, output: result.output, exitCode: result.exitCode ?? null });
        }
      } else if (name === "suggest_next") {
        if (result.status === "shown") turn.suggestions = cleanSuggestions(args.suggestions);
      } else if (name === "save_artifact" || name === "load_artifact" || name === "delete_artifact") {
        const action = { saved: "saved", loaded: "loaded", deleted: "deleted" }[result.status];
        if (action) turn.artifacts.push({ action, id: String(result.id ?? ""), title: String(result.title ?? "") });
      } else if (name === "remember" || name === "forget") {
        if (result.status === "saved" || result.status === "forgot") {
          turn.memories.push({ action: result.status, text: String(result.text ?? "") });
        }
      }
    }
  }
  return turn;
}

/**
 * Remove the owner's latest message and everything after it. Returns what to put back in the
 * composer, how many changes had already run (they can't be undone), and the proposals that were dropped.
 */
export function rewindLast(conversation) {
  const start = lastAskIndex(conversation);
  if (start < 0) return null;
  const removed = conversation.splice(start);
  const first = removed[0];
  let ran = 0;
  const droppedProposals = [];
  for (const m of removed) {
    if (m.role === "user" && typeof m.content === "string" && /^\[System\] The owner approved action/.test(m.content)) ran++;
    if (m.role === "tool") {
      const result = safeParse(m.content);
      if (result?.status === "executed") ran++;
      if (result?.status === "awaiting_approval" && result.id) droppedProposals.push(result.id);
    }
  }
  return { ask: { text: contentText(first.content), images: contentImages(first.content) }, ran, droppedProposals };
}

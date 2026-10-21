// Conversation state. A conversation is identified by the tab's conversation id (kept in the
// client's sessionStorage, and re-pointed when the owner reopens an old chat). It is held in memory
// while in use and saved to disk after every turn, so it survives restarts and shows up in History.
// Conversations belong to the owner, not to a login: the auth session id is a fresh UUID per login.
import { IMAGE_OMITTED, contentImages, contentText } from "./content.js";
import { deleteConversation, loadConversation, saveConversation } from "./store.js";

const MAX_CONVERSATIONS = 50;
const conversations = new Map();

function key(sessionId, conversationId) {
  return conversationId ?? sessionId;
}

const TITLE_CHARS = 64;

function titleOf(conversation) {
  const first = conversation.find((m) => m.role === "user" && m.ask) ?? conversation.find((m) => m.role === "user");
  const text = first ? contentText(first.content).replace(/\s+/g, " ").trim() : "";
  return text.length > TITLE_CHARS ? `${text.slice(0, TITLE_CHARS - 1).trimEnd()}…` : text || "Image";
}

/** Pasted images are far too big to rewrite on every turn: the saved copy keeps a note instead. */
function withoutImages(message) {
  if (message.role !== "user" || !contentImages(message.content).length) return message;
  const count = contentImages(message.content).length;
  const note = Array(count).fill(IMAGE_OMITTED).join(" ");
  return { ...message, content: `${contentText(message.content)}\n${note}`.trim() };
}

function blank(id) {
  // `run` is the turn in flight ({ abort, steers, vision }); one at a time per conversation.
  return { id, conversation: [], pendingApprovals: new Map(), run: null, lastModel: undefined, createdAt: new Date().toISOString() };
}

function revive(id, saved) {
  const session = blank(id);
  session.conversation = Array.isArray(saved.conversation) ? saved.conversation : [];
  session.pendingApprovals = new Map((saved.proposals ?? []).map((p) => [p.id, p]));
  session.lastModel = saved.lastModel;
  session.createdAt = saved.createdAt ?? session.createdAt;
  return session;
}

export function getSession(sessionId, conversationId) {
  const k = key(sessionId, conversationId);
  let session = conversations.get(k);
  if (session) {
    // Refresh recency: eviction takes the least recently used conversation that is not mid-turn.
    conversations.delete(k);
    conversations.set(k, session);
    return session;
  }
  if (conversations.size >= MAX_CONVERSATIONS) {
    const idle = [...conversations.entries()].find(([, s]) => !s.run);
    if (idle) conversations.delete(idle[0]);
  }
  const saved = conversationId ? loadConversation(conversationId) : null;
  session = saved ? revive(conversationId, saved) : blank(conversationId);
  conversations.set(k, session);
  return session;
}

/** Save to disk. Empty conversations are not kept (and an emptied one is removed). */
export function persistSession(session) {
  if (!session.id) return;
  if (!session.conversation.some((m) => m.role === "user")) {
    deleteConversation(session.id);
    return;
  }
  const updatedAt = new Date().toISOString();
  saveConversation(session.id, {
    id: session.id,
    title: titleOf(session.conversation),
    createdAt: session.createdAt,
    updatedAt,
    messages: session.conversation.filter((m) => m.role === "user" && m.ask).length,
    lastModel: session.lastModel,
    conversation: session.conversation.map(withoutImages),
    proposals: [...session.pendingApprovals.values()],
  });
}

/** Forget a conversation everywhere (memory and disk). Refuses while a turn is running. */
export function removeConversation(sessionId, conversationId) {
  const k = key(sessionId, conversationId);
  const live = conversations.get(k);
  if (live?.run) return false;
  conversations.delete(k);
  deleteConversation(conversationId);
  return true;
}

/** Logging out drops the cookie-only fallback conversation; saved chats stay in History. */
export function deleteSession(sessionId) {
  conversations.delete(sessionId);
}

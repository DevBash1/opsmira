// Chat titles written by the model: one after the first exchange, then a fresh one from the last 10 messages
// each time another 50 of the owner's messages have gone by. Runs after a turn, never inside it.
import OpenAI from "openai";
import { env } from "./env.js";
import { contentText } from "./content.js";
import { persistSession } from "./state.js";
import { noDashes } from "./text.js";

const client = new OpenAI({ apiKey: env.openrouterApiKey, baseURL: env.openrouterBaseUrl });

export const RETITLE_EVERY = 50;
const RECENT_MESSAGES = 10;
const FIRST_EXCHANGE = 6;
const MAX_TITLE = 60;
const SNIPPET = 400;
const RETRY_AFTER_MS = 60_000;
const working = new Set();

const askCount = (conversation) => conversation.filter((m) => m.role === "user" && m.ask).length;

/** What the owner and the assistant actually said, without tool traffic or system notes. */
function saidMessages(conversation) {
  const said = [];
  for (const m of conversation) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const text = contentText(m.content).replace(/\s+/g, " ").trim();
    if (!text || (m.role === "user" && !m.ask)) continue;
    said.push({ role: m.role === "user" ? "Owner" : "Assistant", text: text.slice(0, SNIPPET) });
  }
  return said;
}

/** "first" before the chat has a model-written title, "update" once 50 more owner messages have passed, else null. */
export function titlePlan(session, now = Date.now()) {
  const asks = askCount(session.conversation);
  if (!asks || session.titleTriedAt > now - RETRY_AFTER_MS) return null;
  // A first title needs at least one reply to be about something.
  if (!session.titledAt) return session.conversation.some((m) => m.role === "assistant" && contentText(m.content).trim()) ? "first" : null;
  return asks - session.titledAt >= RETITLE_EVERY ? "update" : null;
}

/** One short line from whatever the model returned. Empty when it is unusable. */
export function cleanTitle(raw) {
  const line = noDashes(String(raw ?? ""))
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean) ?? "";
  const text = line
    .replace(/^(title|chat title)\s*[:\-]\s*/i, "")
    .replace(/^["'`*#\s]+|["'`*\s.!?:;,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > MAX_TITLE ? `${text.slice(0, MAX_TITLE - 1).trimEnd()}…` : text;
}

async function askModel(model, system, user) {
  const r = await client.chat.completions.create({
    model,
    max_tokens: 400, // a reasoning model spends some of this thinking
    temperature: 0.3,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return r.choices?.[0]?.message?.content ?? "";
}

const SYSTEM =
  "You name conversations between a server owner and their ops assistant. Reply with the title only: 3 to 6 words, " +
  "plain words, no quotes, no trailing punctuation, no dashes. Name the subject or the job, not the greeting.";

/**
 * Name (or rename) this conversation if it is due. Fire and forget: it never throws and never blocks a turn.
 * `complete` is the model call, replaceable in tests.
 */
export async function retitle(session, { complete = askModel } = {}) {
  const plan = titlePlan(session);
  if (!plan || !session.id || working.has(session.id)) return false;
  working.add(session.id);
  try {
    const said = saidMessages(session.conversation);
    const slice = plan === "update" || said.length > FIRST_EXCHANGE * 2 ? said.slice(-RECENT_MESSAGES) : said.slice(0, FIRST_EXCHANGE);
    const transcript = slice.map((m) => `${m.role}: ${m.text}`).join("\n");
    const current = session.title ? `Current title: ${session.title}\nKeep it if it still fits; otherwise write one for what the chat is about now.\n\n` : "";
    const asks = askCount(session.conversation);
    const title = cleanTitle(await complete(session.lastModel || env.model, SYSTEM, `${current}${transcript}`));
    session.titleTriedAt = Date.now();
    if (!title) return false;
    session.title = title;
    session.titledAt = asks;
    persistSession(session);
    return true;
  } catch {
    session.titleTriedAt = Date.now(); // out of credits or offline: try again on a later turn, not in a loop
    return false;
  } finally {
    working.delete(session.id);
  }
}

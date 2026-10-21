// Small text helpers shared by the agent loop and the history rebuild.

/** The agent never writes em dashes (or spaced en dashes): swap them for a comma so one can't leak through. */
export function noDashes(text) {
  if (typeof text !== "string") return text;
  return text
    .replace(/^\s*—\s*/, "")
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s+–\s+/g, ", ")
    .replace(/,\s*([.!?:;,])/g, "$1");
}

const MAX_SUGGESTIONS = 4;
const MAX_SUGGESTION_CHARS = 48;

/** Follow-up chips: 1 to 4 short, distinct, dash-free lines. */
export function cleanSuggestions(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const items = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const text = noDashes(entry).replace(/\s+/g, " ").trim().slice(0, MAX_SUGGESTION_CHARS).trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    items.push(text);
    if (items.length === MAX_SUGGESTIONS) break;
  }
  return items;
}

export function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

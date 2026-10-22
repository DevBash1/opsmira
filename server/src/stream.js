// One model call, read as a stream so a reasoning model's thinking can be shown while it happens.
// Returns the same shape as a plain completion ({ choices: [{ message, finish_reason }] }), so the agent
// loop does not care how the reply arrived.
import { randomUUID } from "crypto";

const FLUSH_MS = 60;

/** OpenRouter sends reasoning_details in pieces: join those that belong to the same block. */
function mergeDetails(parts) {
  const merged = new Map();
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const key = `${part.type ?? ""}:${part.index ?? 0}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...part });
      continue;
    }
    for (const [field, value] of Object.entries(part)) {
      current[field] = (field === "text" || field === "summary") && typeof value === "string" ? `${current[field] ?? ""}${value}` : value;
    }
  }
  return [...merged.values()];
}

/**
 * @param client an OpenAI-compatible client
 * @param params the usual chat.completions parameters (stream is set here)
 * @param opts.onThinking called with new reasoning text, a few times a second at most
 */
export async function completeStreaming(client, params, { signal, onThinking } = {}) {
  const stream = await client.chat.completions.create({ ...params, stream: true }, { signal });

  let content = "";
  let reasoning = "";
  let finish = null;
  const calls = [];
  const details = [];
  let waiting = "";
  let timer = null;
  let streamedThought = false;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!waiting) return;
    const text = waiting;
    waiting = "";
    streamedThought = true;
    onThinking?.(text);
  };

  try {
    for await (const chunk of stream) {
      if (chunk.error) {
        // The provider failed after it started answering.
        throw Object.assign(new Error(chunk.error.message || "The provider stopped the reply."), { status: chunk.error.code, error: chunk.error });
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta ?? {};
      if (typeof delta.content === "string") content += delta.content;
      const thought = typeof delta.reasoning === "string" ? delta.reasoning : typeof delta.reasoning_content === "string" ? delta.reasoning_content : "";
      if (thought) {
        reasoning += thought;
        waiting += thought;
        if (!timer) timer = setTimeout(flush, FLUSH_MS);
      }
      if (Array.isArray(delta.reasoning_details)) details.push(...delta.reasoning_details);
      for (const piece of delta.tool_calls ?? []) {
        const call = (calls[piece.index ?? 0] ??= { id: "", type: "function", function: { name: "", arguments: "" } });
        if (piece.id) call.id = piece.id;
        if (piece.function?.name) call.function.name += piece.function.name;
        if (piece.function?.arguments) call.function.arguments += piece.function.arguments;
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    }
  } finally {
    flush();
  }

  const message = { role: "assistant", content: content || null };
  if (reasoning) message.reasoning = reasoning;
  const merged = mergeDetails(details);
  if (merged.length) message.reasoning_details = merged;
  const toolCalls = calls.filter(Boolean).map((call) => ({ ...call, id: call.id || `call_${randomUUID().replace(/-/g, "").slice(0, 24)}` }));
  if (toolCalls.length) message.tool_calls = toolCalls;
  return { choices: [{ message, finish_reason: finish }], streamedThought };
}

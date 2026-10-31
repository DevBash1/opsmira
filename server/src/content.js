import { randomUUID } from "crypto";
// User message content: plain text, or text plus pasted images in the OpenAI multi-part format.
// Images are kept in the conversation as data URLs; models without vision get a text stand-in instead.

const MAX_IMAGES = 4;
const MAX_IMAGE_CHARS = 7_000_000; // ~5 MB decoded
const DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export const IMAGE_OMITTED = "[Image omitted: the current model can't view images.]";

/** Validate pasted images. Returns { images } or { error }. */
export function parseImages(raw) {
  if (raw === undefined || raw === null) return { images: [] };
  if (!Array.isArray(raw)) return { error: "images must be an array" };
  if (raw.length > MAX_IMAGES) return { error: `At most ${MAX_IMAGES} images per message` };
  for (const url of raw) {
    if (typeof url !== "string" || url.length > MAX_IMAGE_CHARS || !DATA_URL.test(url)) {
      return { error: "Images must be PNG, JPEG, WebP or GIF data URLs under 5 MB" };
    }
  }
  return { images: raw };
}

/** Validate a chat or steering body: { message: string, images?: string[] }. */
export function parseUserInput(body) {
  const message = body?.message ?? "";
  if (typeof message !== "string") return { error: "message must be a string" };
  const { images, error } = parseImages(body?.images);
  if (error) return { error };
  const text = message.trim();
  if (!text && !images.length) return { error: "message is required" };
  return { text, images };
}

export function userContent(text, images) {
  if (!images.length) return text;
  return [{ type: "text", text }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))];
}

export function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function contentImages(content) {
  if (!Array.isArray(content)) return [];
  return content.filter((part) => part?.type === "image_url").map((part) => part.image_url?.url).filter(Boolean);
}

/** The content a given model should see: images stay for vision models, become a note otherwise. */
export function modelContent(content, vision) {
  if (!Array.isArray(content) || vision) return content;
  const text = contentText(content);
  const omitted = contentImages(content).map(() => IMAGE_OMITTED);
  return [text, ...omitted].filter(Boolean).join("\n");
}

function validJson(text) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Copy of the conversation for one model call. Never mutates stored messages. */
export function toModelMessages(conversation, vision) {
  return conversation.map((m) => {
    if (m.role === "tool" && "view" in m) {
      // `view` is what the console rendered for this call: for the stored chat only, never sent to a model.
      const { view, ...rest } = m;
      void view;
      return rest;
    }
    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.some((c) => !validJson(c.function?.arguments))) {
      // A call the model wrote with broken JSON stays in the history (its error result explains it). Some
      // providers reject the whole request for it, so they see an empty argument object instead.
      return {
        ...m,
        tool_calls: m.tool_calls.map((c) =>
          validJson(c.function?.arguments) ? c : { ...c, function: { ...c.function, arguments: "{}" } },
        ),
      };
    }
    if (m.role === "assistant" && "thought" in m) {
      // `thought` is kept for the console to show: models never see it.
      const { thought, ...rest } = m;
      void thought;
      return rest;
    }
    if (m.role !== "user") return m;
    // `ask` only marks where an owner message starts a turn (for rewind and history); `from` and `shown` label a
    // message an MCP client sent, for the console. Models never see them.
    const { ask, from, shown, ...rest } = m;
    void ask;
    void from;
    void shown;
    return Array.isArray(rest.content) ? { ...rest, content: modelContent(rest.content, vision) } : rest;
  });
}

/* Some models (DeepSeek, mostly) sometimes write their tool calls into the reply as markup instead of
   calling the tool: <｜DSML｜tool_calls><｜DSML｜invoke name="inspect"><｜DSML｜parameter name="command"
   string="true">...</｜DSML｜parameter>... Left alone it shows up as text and the turn stops. */
const BAR = String.raw`\s*[|｜]\s*`;
const DSML_BLOCK = new RegExp(String.raw`<${BAR}DSML${BAR}tool_calls\s*>[\s\S]*?(?:<\/${BAR}DSML${BAR}tool_calls\s*>|$)`, "g");
const DSML_INVOKE = new RegExp(String.raw`<${BAR}DSML${BAR}invoke\s+name="([^"]+)"\s*>([\s\S]*?)(?:<\/${BAR}DSML${BAR}invoke\s*>|$)`, "g");
const DSML_PARAM = new RegExp(String.raw`<${BAR}DSML${BAR}parameter\s+name="([^"]+)"([^>]*)>([\s\S]*?)<\/${BAR}DSML${BAR}parameter\s*>`, "g");
const DSML_LEFTOVER = new RegExp(String.raw`<\/?${BAR}DSML${BAR}[a-z_]*[^>]*>`, "gi");

/** Tool calls written as markup in a reply, in the API's shape, plus the reply without the markup. */
export function recoverTextToolCalls(content) {
  const text = typeof content === "string" ? content : "";
  if (!/DSML/.test(text)) return { calls: [], text };
  const calls = [];
  for (const block of text.matchAll(DSML_BLOCK)) {
    for (const invoke of block[0].matchAll(DSML_INVOKE)) {
      const args = {};
      for (const param of invoke[2].matchAll(DSML_PARAM)) {
        const raw = param[3].trim();
        if (/string\s*=\s*"false"/.test(param[2])) {
          try {
            args[param[1]] = JSON.parse(raw);
            continue;
          } catch {
            // not JSON after all: keep it as text
          }
        }
        args[param[1]] = raw;
      }
      calls.push({ id: `call_${randomUUID().replace(/-/g, "").slice(0, 24)}`, type: "function", function: { name: invoke[1], arguments: JSON.stringify(args) } });
    }
  }
  const stripped = text.replace(DSML_BLOCK, "").replace(DSML_LEFTOVER, "").trim();
  return { calls, text: stripped };
}

const MAX_THOUGHT_CHARS = 8000;

/** What a reasoning model thought before answering, as plain text ("" when it sent none). */
export function reasoningText(message) {
  if (!message || typeof message !== "object") return "";
  let text = "";
  for (const key of ["reasoning", "reasoning_content", "thought"]) {
    if (typeof message[key] === "string" && message[key].trim()) {
      text = message[key];
      break;
    }
  }
  if (!text && Array.isArray(message.reasoning_details)) {
    // OpenRouter's structured form: readable parts only (encrypted blocks carry no text).
    text = message.reasoning_details
      .map((part) => (typeof part?.text === "string" ? part.text : typeof part?.summary === "string" ? part.summary : ""))
      .filter(Boolean)
      .join("\n\n");
  }
  text = text.replace(/\*\*/g, "").trim();
  return text.length > MAX_THOUGHT_CHARS ? `${text.slice(0, MAX_THOUGHT_CHARS).trimEnd()}…` : text;
}

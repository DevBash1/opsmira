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
    if (m.role !== "user") return m;
    // `ask` only marks where an owner message starts a turn (for rewind and history): models never see it.
    const { ask, ...rest } = m;
    void ask;
    return Array.isArray(rest.content) ? { ...rest, content: modelContent(rest.content, vision) } : rest;
  });
}

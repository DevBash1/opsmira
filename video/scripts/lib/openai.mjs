// Tiny OpenAI client for the voice-over: raw fetch, no SDK. The key is read from the environment only
// (process.env.OPENAI_API_KEY) and is sent nowhere except https://api.openai.com. It is never printed,
// logged or written to disk by anything in this project.
import { createHash } from "node:crypto";

const API = "https://api.openai.com";

export function requireKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error(
      "OPENAI_API_KEY is not set. It is only needed to generate voice clips that are not cached yet.\n" +
        "Export it for this one command, e.g.  OPENAI_API_KEY=... npm run voice  (it is never stored in the repo).",
    );
    process.exit(1);
  }
  return key;
}

async function fail(res, what) {
  // Only status + error code: never echo a body that could contain a (masked) key.
  let code = "";
  try {
    code = (await res.json())?.error?.code ?? "";
  } catch {}
  throw new Error(`${what} failed: HTTP ${res.status}${code ? ` (${code})` : ""}`);
}

/** Text to speech. Returns a Buffer of the audio in `format` (wav keeps the take lossless). */
export async function speak({ model, voice, text, instructions, format = "wav" }) {
  const res = await fetch(`${API}/v1/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${requireKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, voice, input: text, instructions, response_format: format }),
  });
  if (!res.ok) await fail(res, "speech");
  return Buffer.from(await res.arrayBuffer());
}

/** Word timestamps for a clip (whisper-1 is the model that returns them). */
export async function transcribeWords({ model = "whisper-1", file, bytes, language = "en", prompt }) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "audio/wav" }), file);
  form.append("model", model);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("language", language);
  if (prompt) form.append("prompt", prompt);
  const res = await fetch(`${API}/v1/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${requireKey()}` },
    body: form,
  });
  if (!res.ok) await fail(res, "transcription");
  return res.json();
}

export const hash = (...parts) => createHash("sha256").update(parts.join("\u0001")).digest("hex");

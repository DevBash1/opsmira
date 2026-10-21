import { env } from "./env.js";

const TTL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

let cache = { fetchedAt: 0, list: null };
let inflight = null;

function isFree(m) {
  return m.id.endsWith(":free") || (m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0);
}

/** Whether the model reads images (pasted screenshots). */
function acceptsImages(m) {
  const inputs = m.architecture?.input_modalities;
  if (Array.isArray(inputs)) return inputs.includes("image");
  const modality = typeof m.architecture?.modality === "string" ? m.architecture.modality : "";
  return /\bimage\b/.test(modality.split("->")[0]);
}

async function loadCatalog() {
  const fresh = cache.list && Date.now() - cache.fetchedAt < TTL_MS;
  if (fresh) return cache.list;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(`${env.openrouterBaseUrl}/models`, {
        headers: { Authorization: `Bearer ${env.openrouterApiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();

      const list = (data.data || [])
        // Chat completions with this app rely on function calling (inspect / propose_action).
        .filter((m) => Array.isArray(m.supported_parameters) && m.supported_parameters.includes("tools"))
        .map((m) => ({ id: m.id, name: m.name, free: isFree(m), vision: acceptsImages(m), contextLength: m.context_length ?? null }))
        .sort((a, b) => (a.free !== b.free ? (a.free ? -1 : 1) : a.id.localeCompare(b.id)));

      if (!list.length) throw new Error("empty model catalog");
      cache = { fetchedAt: Date.now(), list };
      return list;
    } catch (err) {
      console.warn("[Models] could not load catalog:", err.message);
      return cache.list || [];
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function getModels() {
  return loadCatalog();
}

/** Catalog entry for a model id, or undefined if it isn't listed (treated as text-only). */
export async function getModelInfo(id) {
  return (await loadCatalog()).find((m) => m.id === id);
}

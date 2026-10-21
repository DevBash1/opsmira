// Agent-composed views. The agent describes what it wants to show with a small closed set of blocks; this
// module turns that description into data the console can render and nothing else. Unknown block types and
// fields are dropped, sizes are capped, numbers are coerced and every string loses its em dashes.
import { noDashes } from "./text.js";
import { levelOf } from "./views.js";

const MAX_BLOCKS = 16;
const MAX_ROWS = 60;
const MAX_COLS = 8;
const MAX_BARS = 80;
const MAX_LINES = 80;
const TONES = { good: "success", success: "success", ok: "success", warn: "warn", warning: "warn", bad: "danger", danger: "danger", error: "danger", neutral: "neutral", muted: "muted", info: "accent", accent: "accent" };
const ICONS = new Set(["activity", "box", "cloud", "cpu", "server", "terminal", "droplet", "scroll-text", "circle-check", "triangle-alert", "refresh-cw", "eye", "info", "key-round", "history"]);

const str = (v, max = 200) => (v === null || v === undefined ? "" : noDashes(String(v)).slice(0, max));
const tone = (v) => TONES[String(v ?? "").toLowerCase()];
const num = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[, %]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

function cell(v) {
  if (v && typeof v === "object") return { text: str(v.text ?? v.value, 120), ...(tone(v.tone) ? { tone: tone(v.tone) } : {}) };
  return { text: str(v, 120) };
}

const BLOCKS = {
  stats(b, problems) {
    const items = arr(b.items, 6)
      .map((i) => ({ label: str(i?.label, 28).toUpperCase(), value: str(i?.value, 30), note: str(i?.note, 70), tone: tone(i?.tone) }))
      .filter((i) => i.label && i.value);
    if (!items.length) problems.push("stats needs items with a label and a value");
    return items.length ? { type: "stats", items } : null;
  },

  table(b, problems) {
    const columns = arr(b.columns, MAX_COLS).map((c) => str(typeof c === "object" ? c?.label : c, 30));
    const rows = arr(b.rows, MAX_ROWS).map((r) => arr(Array.isArray(r) ? r : Object.values(obj(r)), MAX_COLS).map(cell));
    if (!columns.length || !rows.length) {
      problems.push("table needs columns (a list of names) and rows (a list of lists, one value per column)");
      return null;
    }
    // A row shorter than the header is padded, so a column never shifts left.
    for (const r of rows) while (r.length < columns.length) r.push({ text: "" });
    return { type: "table", title: str(b.title, 60), detail: str(b.detail, 100), columns, rows: rows.map((r) => r.slice(0, columns.length)), total: Math.max(rows.length, num(b.total) ?? 0) };
  },

  bars(b, problems) {
    const values = arr(b.values, MAX_BARS).map(num).filter((n) => n !== null);
    if (values.length < 2) {
      problems.push("bars needs a list of at least two numbers in values");
      return null;
    }
    const labels = arr(b.labels, 5).map((l) => str(l, 12));
    return { type: "bars", title: str(b.title, 90), values, ...(labels.length ? { labels } : {}), ...(num(b.latest) !== null ? { latest: Math.max(0, Math.min(values.length - 1, Math.round(num(b.latest)))) } : {}) };
  },

  ring(b, problems) {
    const percent = num(b.percent);
    if (percent === null) {
      problems.push("ring needs a numeric percent");
      return null;
    }
    return { type: "ring", percent: Math.max(0, Math.min(100, percent)), label: str(b.label, 40), sub: str(b.sub, 80) };
  },

  stacked(b, problems) {
    const raw = arr(b.segments, 8).map((s) => ({ label: str(s?.label, 24), value: str(s?.value, 24), pct: num(s?.pct), tone: String(s?.color ?? "") }));
    const segments = raw.filter((s) => s.label && s.pct !== null && s.pct >= 0);
    if (segments.length < 2) {
      problems.push("stacked needs two or more segments with a label and a pct");
      return null;
    }
    const palette = ["accent", "accent2", "ink", "muted", "line"];
    return {
      type: "stacked",
      title: str(b.title, 90),
      segments: segments.map((s, i) => ({ label: s.label, value: s.value || `${Math.round(s.pct * 10) / 10}%`, pct: Math.min(100, s.pct), tone: palette.includes(s.tone) ? s.tone : palette[i % palette.length] })),
    };
  },

  logs(b, problems) {
    const lines = arr(b.lines, MAX_LINES)
      .map((l) => {
        const o = typeof l === "string" ? { text: l } : obj(l);
        const text = str(o.text ?? o.message, 400);
        const level = String(o.level ?? "").toUpperCase().replace("WARNING", "WARN");
        return { time: str(o.time, 16), level: ["ERROR", "WARN", "INFO", "DEBUG"].includes(level) ? level : levelOf(text), source: str(o.source, 30), text };
      })
      .filter((l) => l.text);
    if (!lines.length) problems.push("logs needs lines (strings or objects with text)");
    return lines.length ? { type: "logs", title: str(b.title, 80), lines } : null;
  },

  keyvalues(b, problems) {
    const items = arr(b.items, 20)
      .map((i) => ({ label: str(i?.label, 40), value: str(i?.value, 120), tone: tone(i?.tone) }))
      .filter((i) => i.label);
    if (!items.length) problems.push("keyvalues needs items with a label and a value");
    return items.length ? { type: "keyvalues", title: str(b.title, 60), items } : null;
  },

  notice(b, problems) {
    const text = str(b.text, 400);
    if (!text && !b.title) {
      problems.push("notice needs text");
      return null;
    }
    const t = tone(b.tone);
    return { type: "notice", tone: t === "danger" || t === "warn" || t === "success" ? t : "neutral", title: str(b.title, 80), text };
  },

  code(b, problems) {
    const text = noDashes(String(b.text ?? "")).slice(0, 6000);
    if (!text.trim()) {
      problems.push("code needs text");
      return null;
    }
    return { type: "code", title: str(b.title, 80), lines: text.split("\n").slice(0, 80) };
  },

  steps(b, problems) {
    const items = arr(b.items, 12)
      .map((i) => ({ label: str(i?.label, 80), detail: str(i?.detail, 140), status: ["pending", "running", "done", "failed"].includes(i?.status) ? i.status : "pending" }))
      .filter((i) => i.label);
    if (!items.length) problems.push("steps needs items with a label and a status");
    return items.length ? { type: "steps", title: str(b.title, 60), items } : null;
  },
};

/**
 * Turn the agent's description into a safe view.
 * Returns { ok:true, view, problems } or { ok:false, problems } when nothing could be shown.
 */
export function normalizeView(args) {
  const a = obj(args);
  const problems = [];
  const blocks = [];
  for (const [i, raw] of arr(a.blocks, MAX_BLOCKS + 8).entries()) {
    const b = obj(raw);
    const make = BLOCKS[b.type];
    if (!make) {
      problems.push(`block ${i + 1}: unknown type "${str(b.type, 20)}". Use one of: ${Object.keys(BLOCKS).join(", ")}`);
      continue;
    }
    const before = problems.length;
    const out = make(b, problems);
    if (out) blocks.push(out);
    else if (problems.length > before) problems[problems.length - 1] = `block ${i + 1} (${b.type}): ${problems[problems.length - 1]}`;
    if (blocks.length >= MAX_BLOCKS) break;
  }
  const actions = arr(a.actions, 3)
    .map((x) => ({ label: str(x?.label, 40), ask: str(x?.ask ?? x?.prompt, 200) }))
    .filter((x) => x.label && x.ask);
  const title = str(a.title, 90);
  const source = str(a.source, 200);
  if (!blocks.length) return { ok: false, problems: problems.length ? problems : ["blocks is empty"] };
  if (!title) return { ok: false, problems: ["title is required", ...problems] };
  if (!source) return { ok: false, problems: ["source is required: say where the data came from, for example the command and server", ...problems] };
  return {
    ok: true,
    problems,
    view: {
      live: true,
      at: new Date().toISOString(),
      source,
      title,
      summary: str(a.summary, 280),
      eyebrow: str(a.eyebrow, 80),
      icon: ICONS.has(a.icon) ? a.icon : "activity",
      blocks,
      actions,
    },
  };
}

#!/usr/bin/env node
/* Writes out/opsmira-launch.srt from the voice-over's own timings (src/timeline.generated.json).
 * One cue per spoken line, wrapped to at most two lines of about 42 characters. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tl = JSON.parse(readFileSync(join(root, "src", "timeline.generated.json"), "utf8"));

const stamp = (sec) => {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, "0")}`;
};

/** Break at the space nearest the middle (preferring just after a comma or colon), so both lines stay balanced. */
const wrap = (text, max = 42) => {
  if (text.length <= max) return text;
  const mid = text.length / 2;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 1; i < text.length - 1; i++) {
    if (text[i] !== " ") continue;
    const clause = /[,:.?]/.test(text[i - 1]) ? 6 : 0;
    const score = Math.abs(i - mid) - clause;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return `${text.slice(0, best)}\n${text.slice(best + 1)}`;
};

const lines = tl.voiceOrder.map((id) => tl.voice[id]);
const cues = lines.map((l, i) => {
  const next = lines[i + 1];
  const start = Math.max(0, l.start - 0.05);
  let end = l.end + 0.25;
  if (next) end = Math.min(end, next.start - 0.06);
  return { start, end: Math.max(end, start + 0.8), text: wrap(l.text) };
});

const out = cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join("\n");
mkdirSync(join(root, "out"), { recursive: true });
writeFileSync(join(root, "out", "opsmira-launch.srt"), out);
console.log(`out/opsmira-launch.srt  ${cues.length} cues, last ends ${stamp(cues[cues.length - 1].end)}`);

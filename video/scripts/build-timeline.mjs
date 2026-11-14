#!/usr/bin/env node
/**
 * One source of truth for timing.
 *
 *   public/voice/manifest.json   (real clip durations + word times, from scripts/voice.mjs)
 * + scripts/beats.mjs            (hand-authored: gaps between lines, scene cuts, named events, typing, sound cues)
 * = src/timeline.generated.json  (read by the Remotion code and by the audio mixer)
 *
 * Change the script or a gap and the whole film re-times itself: run `npm run timeline`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as beats from "./beats.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "public/voice/manifest.json"), "utf8"));
const FPS = beats.FPS ?? 30;
const frame = (t) => Math.round(t * FPS);
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9']/g, "");

/* ---- voice ---- */
const voice = {};
const voiceOrder = [];
let cursor = 0;
beats.voice.forEach(([id, gap], i) => {
  const clip = manifest.lines[id];
  if (!clip) throw new Error(`voice line "${id}" is not in the manifest (run npm run voice)`);
  const start = i === 0 ? gap : cursor + gap;
  const end = start + clip.duration;
  voice[id] = {
    id,
    text: clip.text,
    file: clip.file,
    start: +start.toFixed(3),
    end: +end.toFixed(3),
    from: frame(start),
    to: frame(end),
    duration: clip.duration,
    words: clip.words.map((w) => ({ word: w.word, start: +(start + w.start).toFixed(3), end: +(start + w.end).toFixed(3), from: frame(start + w.start), to: frame(start + w.end) })),
  };
  voiceOrder.push(id);
  cursor = end;
});

/* ---- anchors ---- */
const events = {};
for (const id of voiceOrder) {
  events[`v_${id}`] = { t: voice[id].start, f: voice[id].from };
  events[`v_${id}_end`] = { t: voice[id].end, f: voice[id].to };
}
function resolve(a, label = "anchor") {
  if (typeof a === "number") return a;
  if (a.t !== undefined) return a.t + (a.offset ?? 0);
  if (a.ev) {
    const e = events[a.ev];
    if (!e) throw new Error(`${label}: unknown event "${a.ev}" (events must be listed after the ones they use)`);
    return e.t + (a.offset ?? 0);
  }
  if (a.line) {
    const l = voice[a.line];
    if (!l) throw new Error(`${label}: unknown voice line "${a.line}"`);
    const at = a.at ?? "start";
    if (a.word !== undefined) {
      let idx = a.word;
      if (typeof a.word === "string") {
        const hits = l.words.map((w, i) => (norm(w.word) === norm(a.word) ? i : -1)).filter((i) => i >= 0);
        idx = hits[a.nth ?? 0];
        if (idx === undefined) throw new Error(`${label}: word "${a.word}" not found in line ${a.line} ("${l.text}")`);
      }
      const w = l.words[idx];
      if (!w) throw new Error(`${label}: word index ${idx} out of range in ${a.line}`);
      return (at === "end" ? w.end : w.start) + (a.offset ?? 0);
    }
    return (at === "end" ? l.end : l.start) + (a.offset ?? 0);
  }
  throw new Error(`${label}: cannot resolve ${JSON.stringify(a)}`);
}

let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const typing = {};
function addTyping(ty) {
  const chars = [...ty.text];
  let times;
  if (ty.fromLine) {
    // Typed as it is spoken: the characters of each word are spread across that spoken word.
    const l = voice[ty.fromLine];
    if (!l) throw new Error(`typing ${ty.id}: unknown line ${ty.fromLine}`);
    const words = ty.text.split(" ");
    const first = ty.firstWord ?? 0;
    times = [];
    let run = -Infinity;
    words.forEach((w, wi) => {
      const sw = l.words[first + wi];
      if (!sw) throw new Error(`typing ${ty.id}: line ${ty.fromLine} has no word ${first + wi}`);
      const t0 = sw.start + (ty.lead ?? 0);
      const t1 = Math.max(t0 + 0.14, sw.end - 0.03);
      const n = w.length + (wi < words.length - 1 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const t = Math.max(run, t0 + (k / n) * (t1 - t0) + (rand() - 0.5) * 0.02);
        run = t;
        times.push(t);
      }
    });
  } else {
    const t0 = resolve(ty.start, `typing ${ty.id}`);
    const dur = ty.dur;
    // Weight each gap: spaces are a little slower, with a little human jitter; `rhythm(i, ch)` can speed up or slow down.
    const w = chars.map((c, i) => (i === 0 ? 0 : (c === " " ? 1.5 : 1) * (0.72 + rand() * 0.6) * (ty.rhythm ? ty.rhythm(i, c) : 1)));
    const sum = w.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    times = w.map((x) => ((acc += x), t0 + (acc / sum) * dur));
  }
  typing[ty.id] = { id: ty.id, text: ty.text, start: +times[0].toFixed(3), end: +times[times.length - 1].toFixed(3), times: times.map((t) => +t.toFixed(3)), frames: times.map(frame) };
  events[`${ty.id}_start`] = { t: +times[0].toFixed(3), f: frame(times[0]) };
  events[`${ty.id}_end`] = { t: typing[ty.id].end, f: frame(times[times.length - 1]) };
}


for (const entry of beats.events) {
  if (Array.isArray(entry)) {
    const [name, anchor] = entry;
    if (events[name]) throw new Error(`duplicate event ${name}`);
    const t = resolve(anchor, `event ${name}`);
    events[name] = { t: +t.toFixed(3), f: frame(t) };
  } else {
    addTyping(entry);
  }
}

/* ---- scenes: cuts are the centre of a transition; scenes overlap by its length ---- */
const sceneList = beats.scenes;
const endT = resolve(beats.end, "end");
const totalFrames = frame(endT);
const cuts = sceneList.map((s, i) => (i === 0 ? 0 : resolve(s.cut, `scene ${s.id}`)));
const scenes = {};
const sceneOrder = [];
sceneList.forEach((s, i) => {
  const tIn = i === 0 ? 0 : sceneList[i].trans;
  const next = sceneList[i + 1];
  const tOut = next ? next.trans : 0;
  const startF = frame(cuts[i]) - Math.round(tIn / 2);
  const endF = next ? frame(cuts[i + 1]) + Math.round(tOut / 2) : totalFrames;
  scenes[s.id] = { id: s.id, from: Math.max(0, startF), duration: endF - Math.max(0, startF), transIn: tIn, transOut: tOut, cut: +cuts[i].toFixed(3) };
  sceneOrder.push(s.id);
});

/* ---- sound cues ---- */
const sfx = [];
for (const c of beats.sfx ?? []) {
  if (c.typing) {
    const ty = typing[c.typing];
    if (!ty) throw new Error(`sfx: unknown typing "${c.typing}"`);
    let last = -1;
    ty.times.forEach((t, i) => {
      if (ty.text[i] === " " && c.skipSpaces) return;
      if (c.every && i % c.every !== 0) return; // fast runs: a tick for every Nth key keeps it a texture, not a buzz
      const space = ty.text[i] === " ";
      let k = Math.floor(rand() * c.pool.length);
      if (k === last) k = (k + 1) % c.pool.length; // never the same key sample twice in a row
      last = k;
      sfx.push({ file: space && c.space ? c.space : c.pool[k], t, gain: (c.gain ?? -22) + (rand() - 0.5) * 5, pan: c.pan ?? 0, name: `${c.typing}[${i}]` });
    });
    continue;
  }
  const t = resolve(c.at, `sfx ${c.file}`);
  sfx.push({ file: c.file, t: +t.toFixed(3), gain: c.gain ?? -12, pan: c.pan ?? 0, rate: c.rate, name: c.name ?? c.file });
}
sfx.sort((a, b) => a.t - b.t);

const out = {
  fps: FPS,
  width: 1920,
  height: 1080,
  durationInFrames: totalFrames,
  durationSeconds: +(totalFrames / FPS).toFixed(3),
  voice,
  voiceOrder,
  scenes,
  sceneOrder,
  events,
  typing,
  sfx,
  music: beats.music ?? null,
};
fs.writeFileSync(path.join(ROOT, "src/timeline.generated.json"), `${JSON.stringify(out)}\n`);
console.log(`timeline: ${totalFrames} frames (${out.durationSeconds}s), ${voiceOrder.length} voice lines, ${Object.keys(events).length} events, ${sfx.length} sound cues`);
for (const id of sceneOrder) {
  const s = scenes[id];
  console.log(`  ${id.padEnd(10)} from ${String(s.from).padStart(5)}  dur ${String(s.duration).padStart(5)}  (${(s.from / FPS).toFixed(2)}s - ${((s.from + s.duration) / FPS).toFixed(2)}s)`);
}

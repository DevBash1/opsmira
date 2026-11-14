#!/usr/bin/env node
/**
 * Voice-over generator (OpenAI text to speech, one clip per line of scripts/voice-script.json).
 *
 *   node scripts/voice.mjs                       generate every line that is not cached yet
 *   node scripts/voice.mjs --only=h1,p1 --force  re-roll single lines
 *   node scripts/voice.mjs --audition=cedar,marin,ash --lines=h1,h2
 *                                                compare voices on real lines (clips land in out/audition)
 *   node scripts/voice.mjs --check               show what is cached / stale (no network, no key needed)
 *
 * The key is read from process.env.OPENAI_API_KEY only. It is never printed, logged or written anywhere.
 * Each finished line is cached as public/voice/<id>.mp3 plus an entry in public/voice/manifest.json
 * (text, hash, duration, word timings). A line is regenerated only when its text, voice, model or
 * instructions change.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hash, requireKey, speak, transcribeWords } from "./lib/openai.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/voice-script.json"), "utf8"));
const VOICE_DIR = path.join(ROOT, "public/voice");
const RAW_DIR = path.join(ROOT, "out/cache/voice-raw");
const AUDITION_DIR = path.join(ROOT, "out/audition");
const MANIFEST = path.join(VOICE_DIR, "manifest.json");
const SR = 24000;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);
const list = (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : null);

fs.mkdirSync(VOICE_DIR, { recursive: true });
fs.mkdirSync(RAW_DIR, { recursive: true });

const readManifest = () => (fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : { lines: {} });
const writeManifest = (m) => fs.writeFileSync(MANIFEST, `${JSON.stringify(m, null, 2)}\n`);

const instructionsFor = (line) => [SCRIPT.base, line.style].filter(Boolean).join(" ");
const hashFor = (line, voice) => hash(SCRIPT.model, voice, instructionsFor(line), line.text, "wav-v1").slice(0, 16);

function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { maxBuffer: 1 << 28, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${String(r.stderr ?? "").split("\n").slice(-4).join(" ")}`);
  return r.stdout;
}

/** Decode to mono float32 at 24 kHz and find where the speech starts and stops. */
function measure(file) {
  const buf = run("ffmpeg", ["-v", "error", "-i", file, "-f", "f32le", "-ac", "1", "-ar", String(SR), "-"]);
  const x = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const hop = SR / 100;
  const n = Math.floor(x.length / hop);
  const db = new Float32Array(n);
  let max = -120;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < hop; k++) s += x[i * hop + k] ** 2;
    db[i] = 10 * Math.log10(s / hop + 1e-12);
    if (db[i] > max) max = db[i];
  }
  const thr = Math.max(-52, max - 38);
  let first = -1;
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (db[i] > thr) {
      if (first < 0) first = i;
      last = i;
    }
  }
  return { duration: x.length / SR, start: first * 0.01, end: (last + 1) * 0.01 };
}

const ffprobeDuration = (file) =>
  Number(
    String(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file])).trim(),
  );

/** Cut to the speech with a short lead-in and ~120 ms of natural tail; returns the measured raw numbers. */
function trim(rawWav, outWav) {
  const m = measure(rawWav);
  const t0 = Math.max(0, m.start - 0.02);
  const t1 = Math.min(m.duration, m.end + 0.12);
  const len = t1 - t0;
  run("ffmpeg", [
    "-v", "error", "-y", "-ss", t0.toFixed(3), "-t", len.toFixed(3), "-i", rawWav,
    "-af", `afade=t=in:st=0:d=0.006,afade=t=out:st=${Math.max(0, len - 0.07).toFixed(3)}:d=0.07`,
    "-ar", String(SR), "-ac", "1", "-c:a", "pcm_s16le", outWav,
  ]);
  return { rawDuration: m.duration, lead: m.start, trail: m.duration - m.end, kept: len };
}

const toMp3 = (wav, mp3) =>
  run("ffmpeg", ["-v", "error", "-y", "-i", wav, "-ar", "48000", "-ac", "1", "-c:a", "libmp3lame", "-q:a", "0", mp3]);

/* ---------- word timings ---------- */

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9']/g, "");
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Script words are canonical; the transcript only supplies timing. Aligns the two and fills any gaps. */
function alignWords(text, asr, duration) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const A = asr.map((w) => ({ w: w.word, s: w.start, e: w.end }));
  const n = tokens.length;
  const m = A.length;
  const GAP = 0.85;
  const cost = (i, j) => {
    const a = norm(tokens[i]);
    const b = norm(A[j].w);
    if (!a.length || !b.length) return 1;
    return Math.min(1, lev(a, b) / Math.max(a.length, b.length));
  };
  const D = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) D[i][0] = i * GAP;
  for (let j = 1; j <= m; j++) D[0][j] = j * GAP;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      D[i][j] = Math.min(D[i - 1][j] + GAP, D[i][j - 1] + GAP, D[i - 1][j - 1] + cost(i - 1, j - 1));
  const map = Array(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (Math.abs(D[i][j] - (D[i - 1][j - 1] + cost(i - 1, j - 1))) < 1e-9) {
      map[i - 1] = j - 1;
      i--;
      j--;
    } else if (Math.abs(D[i][j] - (D[i - 1][j] + GAP)) < 1e-9) i--;
    else j--;
  }
  const out = tokens.map((w, k) => (map[k] >= 0 ? { word: w, start: A[map[k]].s, end: A[map[k]].e, matched: true } : { word: w, matched: false }));
  // Fill unmatched words between their matched neighbours in proportion to their length.
  for (let k = 0; k < n; k++) {
    if (out[k].matched) continue;
    let a = k;
    while (a < n && !out[a].matched) a++;
    const prevEnd = k > 0 ? out[k - 1].end : 0;
    const nextStart = a < n ? out[a].start : duration;
    const span = out.slice(k, a);
    const chars = span.reduce((acc, t) => acc + t.word.length, 0);
    let t = prevEnd;
    for (const tok of span) {
      const share = ((nextStart - prevEnd) * tok.word.length) / chars;
      tok.start = t;
      tok.end = t + share;
      t += share;
    }
    k = a - 1;
  }
  return out.map(({ word, start, end }) => ({ word, start: +start.toFixed(3), end: +end.toFixed(3) }));
}

function wer(reference, hypothesis) {
  const r = reference.split(/\s+/).map(norm).filter(Boolean);
  const h = hypothesis.split(/\s+/).map(norm).filter(Boolean);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let a = 1; a <= r.length; a++)
    for (let b = 1; b <= h.length; b++)
      d[a][b] = Math.min(d[a - 1][b] + 1, d[a][b - 1] + 1, d[a - 1][b - 1] + (r[a - 1] === h[b - 1] ? 0 : 1));
  return +(d[r.length][h.length] / Math.max(1, r.length)).toFixed(3);
}

async function withRetry(fn, label) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retriable = /HTTP (429|5\d\d)|fetch failed|ECONN|ETIMEDOUT/.test(String(err.message));
      if (!retriable || attempt >= 4) throw err;
      console.error(`  ${label}: ${err.message}; retrying (${attempt}/3)`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

async function words(wavFile, text) {
  const res = await withRetry(
    () =>
      transcribeWords({
        model: SCRIPT.transcribeModel,
        file: path.basename(wavFile),
        bytes: fs.readFileSync(wavFile),
        prompt: SCRIPT.asrHints,
      }),
    "whisper",
  );
  const dur = ffprobeDuration(wavFile);
  return { asr: String(res.text ?? "").trim(), words: alignWords(text, res.words ?? [], dur), rawWords: res.words ?? [] };
}

function pyMetrics(wav) {
  const r = spawnSync("python3", [path.join(ROOT, "scripts/audio/analyze_voice.py"), wav], { encoding: "utf8" });
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { error: "metrics failed" };
  }
}

/* ---------- commands ---------- */

async function audition() {
  const voices = list(args.audition) ?? ["cedar", "marin"];
  const ids = list(args.lines) ?? SCRIPT.lines.slice(0, 2).map((l) => l.id);
  fs.mkdirSync(AUDITION_DIR, { recursive: true });
  requireKey();
  const report = [];
  for (const voice of voices) {
    for (const id of ids) {
      const line = SCRIPT.lines.find((l) => l.id === id);
      const raw = path.join(AUDITION_DIR, `${voice}-${id}.raw.wav`);
      const trimmed = path.join(AUDITION_DIR, `${voice}-${id}.wav`);
      const buf = await withRetry(
        () => speak({ model: SCRIPT.model, voice, text: line.text, instructions: instructionsFor(line), format: "wav" }),
        `${voice}/${id}`,
      );
      fs.writeFileSync(raw, buf);
      const cut = trim(raw, trimmed);
      const w = await words(trimmed, line.text);
      const nWords = line.text.split(/\s+/).length;
      const entry = {
        voice,
        id,
        ...cut,
        wordsPerSec: +(nWords / cut.kept).toFixed(2),
        wer: wer(line.text, w.asr),
        asr: w.asr,
        ...pyMetrics(trimmed),
      };
      report.push(entry);
      console.log(JSON.stringify(entry));
    }
  }
  fs.writeFileSync(path.join(AUDITION_DIR, "report.json"), JSON.stringify(report, null, 2));
}

async function generate() {
  const voice = typeof args.voice === "string" ? args.voice : SCRIPT.voice;
  const only = list(args.only);
  const manifest = readManifest();
  manifest.model = SCRIPT.model;
  manifest.voice = voice;
  manifest.lines ??= {};
  let made = 0;
  let cached = 0;
  for (const line of SCRIPT.lines) {
    if (only && !only.includes(line.id)) continue;
    const h = hashFor(line, voice);
    const prev = manifest.lines[line.id];
    const mp3 = path.join(VOICE_DIR, `${line.id}.mp3`);
    const fresh = prev && prev.hash === h && fs.existsSync(mp3);
    if (args.check) {
      console.log(`${fresh ? "cached " : "STALE  "} ${line.id.padEnd(4)} ${line.text}`);
      continue;
    }
    if (fresh && !args.force) {
      cached++;
      continue;
    }
    requireKey();
    const raw = path.join(RAW_DIR, `${line.id}.${h}.raw.wav`);
    if (!fs.existsSync(raw)) {
      const buf = await withRetry(
        () => speak({ model: SCRIPT.model, voice, text: line.text, instructions: instructionsFor(line), format: "wav" }),
        line.id,
      );
      fs.writeFileSync(raw, buf);
    }
    const tmpWav = path.join(RAW_DIR, `${line.id}.${h}.trim.wav`);
    const cut = trim(raw, tmpWav);
    toMp3(tmpWav, mp3);
    const w = await words(tmpWav, line.text);
    const duration = +ffprobeDuration(mp3).toFixed(3);
    manifest.lines[line.id] = {
      id: line.id,
      text: line.text,
      hash: h,
      file: `voice/${line.id}.mp3`,
      duration,
      words: w.words,
      asr: w.asr,
      wer: wer(line.text, w.asr),
      raw: { duration: +cut.rawDuration.toFixed(3), lead: +cut.lead.toFixed(3), trail: +cut.trail.toFixed(3) },
      metrics: pyMetrics(tmpWav),
    };
    writeManifest(manifest);
    made++;
    console.log(`made ${line.id.padEnd(4)} ${duration.toFixed(2)}s  wer ${manifest.lines[line.id].wer}  ${line.text}`);
  }
  if (!args.check) {
    // Keep the manifest in script order and drop entries for lines that no longer exist.
    const ordered = {};
    for (const line of SCRIPT.lines) if (manifest.lines[line.id]) ordered[line.id] = manifest.lines[line.id];
    manifest.lines = ordered;
    writeManifest(manifest);
    const total = Object.values(ordered).reduce((acc, l) => acc + l.duration, 0);
    console.log(`done: ${made} generated, ${cached} cached, voice ${voice}, total speech ${total.toFixed(1)}s`);
  }
}

try {
  if (args.audition) await audition();
  else await generate();
} catch (err) {
  console.error(String(err.message ?? err));
  process.exit(1);
}

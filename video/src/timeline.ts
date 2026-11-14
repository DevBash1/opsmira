import raw from "./timeline.generated.json";

/* Typed access to src/timeline.generated.json (built by scripts/build-timeline.mjs from the voice clips
 * and scripts/beats.mjs). Every scene reads its timing from here, never from a literal. */

export type Word = { word: string; start: number; end: number; from: number; to: number };
export type VoiceLine = { id: string; text: string; file: string; start: number; end: number; from: number; to: number; duration: number; words: Word[] };
export type Typing = { id: string; text: string; start: number; end: number; times: number[]; frames: number[] };
export type SceneTiming = { id: string; from: number; duration: number; transIn: number; transOut: number; cut: number };
export type SfxCue = { file: string; t: number; gain: number; pan: number; rate?: number; name?: string };

export type Timeline = {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  durationSeconds: number;
  voice: Record<string, VoiceLine>;
  voiceOrder: string[];
  scenes: Record<string, SceneTiming>;
  sceneOrder: string[];
  events: Record<string, { t: number; f: number }>;
  typing: Record<string, Typing>;
  sfx: SfxCue[];
  music: unknown;
};

export const TL = raw as unknown as Timeline;
export const FPS = TL.fps;
export const TOTAL = TL.durationInFrames;

/** Frame of a named event from scripts/beats.mjs. */
export function ev(name: string, offsetFrames = 0): number {
  const e = TL.events[name];
  if (!e) throw new Error(`timeline: unknown event "${name}"`);
  return e.f + offsetFrames;
}

/** Frame at which spoken word `idx` of `line` starts / ends. */
export const wordFrom = (line: string, idx: number) => TL.voice[line].words[idx].from;
export const wordTo = (line: string, idx: number) => TL.voice[line].words[idx].to;
export const lineFrom = (line: string) => TL.voice[line].from;
export const lineTo = (line: string) => TL.voice[line].to;

/** How much of a typing run is on screen at frame f. */
export function typed(id: string, f: number): { text: string; count: number; last: number; done: boolean } {
  const ty = TL.typing[id];
  if (!ty) throw new Error(`timeline: unknown typing "${id}"`);
  let count = 0;
  while (count < ty.frames.length && ty.frames[count] <= f) count++;
  return { text: ty.text.slice(0, count), count, last: count > 0 ? ty.frames[count - 1] : -1000, done: count >= ty.frames.length };
}

export const typingEnd = (id: string) => TL.typing[id].frames[TL.typing[id].frames.length - 1];
export const typingStart = (id: string) => TL.typing[id].frames[0];

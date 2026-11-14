import type { CSSProperties } from "react";
import { Easing, interpolate, random } from "remotion";

export type EaseFn = (t: number) => number;

/** The product's own curves (src/index.css). */
export const E = {
  enter: Easing.bezier(0.22, 1, 0.36, 1),
  move: Easing.bezier(0.25, 1, 0.5, 1),
  exit: Easing.bezier(0.4, 0, 1, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  soft: Easing.bezier(0.32, 0.72, 0, 1),
  cssInOut: Easing.bezier(0.42, 0, 0.58, 1),
  linear: (t: number) => t,
};

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/** 0..1 progress through [start, start + dur] frames. */
export const ramp = (f: number, start: number, dur: number, ease: EaseFn = E.enter) =>
  interpolate(f, [start, start + Math.max(1, dur)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

/** Piecewise keyframes [frame, value, easeIntoThisKey?]. Holds the first/last value outside the range. */
export function kf(f: number, keys: Array<[number, number, EaseFn?]>): number {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [f1, v1, ease] = keys[i];
    const [f0, v0] = keys[i - 1];
    if (f <= f1) {
      const t = f1 === f0 ? 1 : (f - f0) / (f1 - f0);
      return v0 + (v1 - v0) * (ease ?? E.move)(t);
    }
  }
  return keys[keys.length - 1][1];
}

/** Fade + rise + slight blur, the product's "blur-rise". Leaves no filter or transform once settled. */
export function blurRise(
  f: number,
  start: number,
  o: { dur?: number; rise?: number; blur?: number; ease?: EaseFn; scale?: number } = {},
): CSSProperties {
  const { dur = 18, rise = 12, blur = 8, ease = E.enter, scale = 1 } = o;
  const p = ramp(f, start, dur, ease);
  if (p >= 1) return {};
  return {
    opacity: p,
    transform: `translateY(${(1 - p) * rise}px)${scale !== 1 ? ` scale(${scale + (1 - scale) * p})` : ""}`,
    filter: blur > 0 && p < 1 ? `blur(${(1 - p) * blur}px)` : undefined,
  };
}

/** Fade out with a little blur and lift. */
export function blurOut(f: number, start: number, o: { dur?: number; rise?: number; blur?: number; ease?: EaseFn } = {}): CSSProperties {
  const { dur = 12, rise = -8, blur = 6, ease = E.exit } = o;
  const p = ramp(f, start, dur, ease);
  if (p <= 0) return {};
  return { opacity: 1 - p, transform: `translateY(${p * rise}px)`, filter: `blur(${p * blur}px)` };
}

/** Steady pulse 0..1..0 with a period in frames. */
export const pulse = (f: number, period: number, phase = 0) => 0.5 - 0.5 * Math.cos(((f + phase) / period) * Math.PI * 2);

/** Deterministic noise in -1..1. */
export const rnd = (seed: string | number) => random(seed) * 2 - 1;

/** Number of typed characters at time `now` (seconds), given the time each character appears. */
export function typedCount(times: number[], now: number) {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= now) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

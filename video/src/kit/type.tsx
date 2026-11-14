import type { CSSProperties, ReactNode } from "react";
import { FONT_DISPLAY } from "./fonts";
import { E, blurRise, ramp } from "./motion";
import { useT } from "./time";

/** A line of display type rising out of its own clipping mask (the product's "mask-up"). */
export function MaskLine({ children, start, dur = 24, style, pad = "0.12em", inner }: { children: ReactNode; start: number; dur?: number; style?: CSSProperties; pad?: string; inner?: CSSProperties }) {
  const f = useT();
  const p = ramp(f, start, dur, E.enter);
  return (
    <div style={{ overflow: "hidden", paddingBottom: pad, marginBottom: `-${pad}`, ...style }}>
      <div style={{ transform: `translateY(${(1 - p) * 112}%)`, opacity: p > 0 ? 1 : 0, ...inner }}>{children}</div>
    </div>
  );
}

/** Words that arrive on their own frames (kinetic type synced to the voice). */
export function RiseWords({
  words,
  style,
  wordStyle,
  dur = 16,
  rise = 16,
  blur = 8,
}: {
  words: { text: ReactNode; at: number; style?: CSSProperties }[];
  style?: CSSProperties;
  wordStyle?: CSSProperties;
  dur?: number;
  rise?: number;
  blur?: number;
}) {
  const f = useT();
  return (
    <span style={style}>
      {words.map((w, i) => (
        <span key={i} style={{ display: "inline-block", whiteSpace: "pre", ...wordStyle, ...w.style, ...blurRise(f, w.at, { dur, rise, blur }) }}>
          {w.text}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

/** The headline gradient: green to teal, as in the product's hero ("in plain words."). */
export function GradientText({ children, style, from = "var(--accent)", to = "var(--accent-2)", angle = 100 }: { children: ReactNode; style?: CSSProperties; from?: string; to?: string; angle?: number }) {
  return (
    <span
      style={{
        backgroundImage: `linear-gradient(${angle}deg, ${from}, ${to})`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        WebkitTextFillColor: "transparent",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export const display = (size: number, weight = 700, tracking = -0.03): CSSProperties => ({
  fontFamily: FONT_DISPLAY,
  fontSize: size,
  fontWeight: weight,
  lineHeight: 1.04,
  letterSpacing: `${tracking}em`,
});

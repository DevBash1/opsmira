import type { CSSProperties } from "react";
import { FONT_DISPLAY } from "./fonts";
import { Icon } from "./Icon";
import { E, blurRise, pulse, ramp } from "./motion";
import { useT } from "./time";

/**
 * The console's empty state (ConsoleIdle.tsx): the breathing orb and the headline
 * "Your server. / A little more intuitive." `out` 0..1 lifts everything away.
 */
export function Hero({ start, out = 0, style, orbOnly = false }: { start: number; out?: number; style?: CSSProperties; orbOnly?: boolean }) {
  const f = useT();
  const size = 200;
  const breathe = (period: number, phase = 0) => 1 + 0.035 * Math.sin(((f + phase) / period) * Math.PI * 2);
  const orbIn = blurRise(f, start, { dur: 24, rise: 14, blur: 10 });
  const l1 = ramp(f, start + 6, 26, E.enter);
  const l2 = ramp(f, start + 12, 26, E.enter);
  const lift = out;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        opacity: 1 - lift,
        transform: `translateY(${-lift * 24}px) scale(${1 + 0.03 * lift})`,
        filter: lift > 0.01 ? `blur(${lift * 14}px)` : undefined,
        ...style,
      }}
    >
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", ...orbIn }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 999, background: "radial-gradient(circle, var(--glow), transparent 70%)", opacity: 0.7 + 0.3 * pulse(f, 150), transform: `scale(${0.96 + 0.08 * pulse(f, 150)})` }} />
        <div style={{ position: "absolute", width: "85%", height: "85%", borderRadius: 999, border: "1.5px solid var(--line)", transform: `scale(${breathe(220)})` }} />
        <div style={{ position: "absolute", width: "62%", height: "62%", borderRadius: 999, border: "1.5px solid var(--line)", transform: `scale(${breathe(260, 90)})` }} />
        <div style={{ position: "absolute", width: "38%", height: "38%", borderRadius: 999, background: "var(--hairline)" }} />
        <div style={{ position: "relative", display: "flex", width: 56, height: 56, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 999, background: "linear-gradient(-135deg, var(--accent), var(--accent-2))", boxShadow: "0px 12px 32px var(--glow)" }}>
          <Icon name="orbit" size={24} style={{ color: "var(--canvas)", transform: `rotate(${f * 0.75}deg)` }} />
        </div>
        <div style={{ position: "absolute", top: "14%", right: "18%", width: 9, height: 9, borderRadius: 999, background: "var(--accent)", transform: `translateY(${Math.sin(f / 22) * 5}px)` }} />
        <div style={{ position: "absolute", bottom: "18%", left: "16%", width: 7, height: 7, borderRadius: 999, background: "var(--accent-2)", transform: `translateY(${Math.sin(f / 26 + 2) * 5}px)` }} />
      </div>
      {!orbOnly && (
        <h1 style={{ fontFamily: FONT_DISPLAY, margin: 0, display: "flex", width: "100%", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 56, lineHeight: 1.05, fontWeight: 600, letterSpacing: -1, textAlign: "center" }}>
          <span style={{ display: "block", overflow: "hidden", paddingBottom: "0.08em" }}>
            <span style={{ display: "block", color: "var(--ink)", transform: `translateY(${(1 - l1) * 110}%)` }}>Your server.</span>
          </span>
          <span style={{ display: "block", overflow: "hidden", paddingBottom: "0.08em" }}>
            <span
              style={{
                display: "block",
                backgroundImage: "linear-gradient(90deg, var(--accent), var(--accent-2))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                transform: `translateY(${(1 - l2) * 110}%)`,
              }}
            >
              A little more intuitive.
            </span>
          </span>
        </h1>
      )}
    </div>
  );
}

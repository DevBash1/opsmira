import type { CSSProperties, ReactNode } from "react";
import { FONT_BODY, FONT_CODE } from "./fonts";
import { Icon, type IconName } from "./Icon";
import { useT } from "./time";

export type Tone = "success" | "accent" | "warn" | "danger" | "muted" | "neutral";

const TONE_DOT: Record<Tone, string> = {
  success: "var(--accent-strong)",
  accent: "var(--accent)",
  warn: "var(--accent-2)",
  danger: "var(--ink)",
  muted: "var(--muted)",
  neutral: "var(--line)",
};

/** The agent's spinner: a faint track and a short round-capped arc, turning once a second. */
export function Spinner({ size = 14, color = "var(--accent-2)", frame }: { size?: number; color?: string; frame?: number }) {
  const t = useT();
  const f = frame ?? t;
  return (
    <svg viewBox="0 0 14 14" width={size} height={size} style={{ flexShrink: 0, color, transform: `rotate(${(f * 12) % 360}deg)` }} aria-hidden="true">
      <circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.6" />
      <circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="9 24" />
    </svg>
  );
}

/** Where a command runs: the server's name, as a small pill. */
export function WhereChip({ server, remote = true, style }: { server: string; remote?: boolean; style?: CSSProperties }) {
  return (
    <span
      style={{
        fontFamily: FONT_CODE,
        display: "inline-flex",
        flexShrink: 0,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        borderRadius: 999,
        padding: "1px 7px",
        fontSize: 10,
        ...(remote
          ? { background: "var(--soft)", color: "var(--accent-strong)" }
          : { color: "var(--muted)", outline: "1px solid var(--hairline)", outlineOffset: -1 }),
        ...style,
      }}
    >
      <Icon name="server" size={9} />
      {server}
    </span>
  );
}

export function Status({ children, tone = "success", style }: { children: ReactNode; tone?: Tone; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-flex",
        width: "fit-content",
        flexShrink: 0,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        background: "var(--soft)",
        padding: "3px 9px",
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: "nowrap",
        color: "var(--ink)",
        ...style,
      }}
    >
      <span style={{ width: 6, height: 6, flexShrink: 0, borderRadius: 999, background: TONE_DOT[tone] }} />
      {children}
    </span>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const styles: CSSProperties =
    tone === "success" || tone === "accent"
      ? { background: "var(--soft)", color: "var(--accent-strong)" }
      : tone === "warn"
        ? { background: "var(--soft)", color: "var(--ink)" }
        : tone === "danger"
          ? { background: "var(--ink)", color: "var(--canvas)" }
          : { outline: "1px solid var(--line)", outlineOffset: -0.5, color: "var(--muted)" };
  return (
    <span
      style={{
        display: "inline-flex",
        width: "fit-content",
        flexShrink: 0,
        alignItems: "center",
        gap: 6,
        borderRadius: 7,
        padding: "4px 9px",
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: "nowrap",
        ...styles,
      }}
    >
      {children}
    </span>
  );
}

const chipBase: CSSProperties = {
  display: "flex",
  height: 26,
  flexShrink: 0,
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  borderRadius: 999,
  padding: "0 10px 0 9px",
  fontSize: 11,
  background: "var(--soft)",
  color: "var(--ink)",
};

/** Composer chip: "Ask first" (default) or "Full access" (warm, opt-in). */
export function ModeChip({ mode = "ask", style }: { mode?: "ask" | "full"; style?: CSSProperties }) {
  const full = mode === "full";
  return (
    <div
      style={{
        ...chipBase,
        ...(full ? { background: "color-mix(in oklab, var(--danger) 14%, transparent)", color: "var(--danger)" } : {}),
        ...style,
      }}
    >
      <Icon name={full ? "triangle-alert" : "key-round"} size={11} />
      <span style={{ fontFamily: FONT_CODE, whiteSpace: "nowrap" }}>{full ? "Full access" : "Ask first"}</span>
      <Icon name="arrow-up" size={9} style={{ opacity: 0.7, transform: "rotate(180deg)" }} />
    </div>
  );
}

/** Composer chip: which server the agent works on. */
export function ServerChip({ label, open = false, style }: { label: string; open?: boolean; style?: CSSProperties }) {
  return (
    <div style={{ ...chipBase, ...style }}>
      <Icon name="server" size={11} style={{ color: "var(--accent)" }} />
      <span style={{ fontFamily: FONT_CODE, maxWidth: 120, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <Icon name="arrow-up" size={9} style={{ opacity: 0.7, transform: open ? "rotate(0deg)" : "rotate(180deg)" }} />
    </div>
  );
}

/** Composer chip: the model. */
export function ModelChip({ label, style }: { label: string; style?: CSSProperties }) {
  return (
    <div style={{ ...chipBase, ...style }}>
      <Icon name="sparkles" size={11} style={{ color: "var(--accent-2)" }} />
      <span style={{ fontFamily: FONT_CODE, whiteSpace: "nowrap" }}>{label}</span>
      <Icon name="eye" size={11} style={{ opacity: 0.7 }} />
      <Icon name="arrow-up" size={9} style={{ opacity: 0.7, transform: "rotate(180deg)" }} />
    </div>
  );
}

/** Soft pill used for "Task set up", "Remembered" and friends. */
export function SoftPill({ icon, label, name, arrow = true, iconColor = "var(--accent-2)", style }: { icon: IconName; label: string; name: string; arrow?: boolean; iconColor?: string; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "flex",
        maxWidth: "100%",
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        borderRadius: 999,
        background: "var(--soft)",
        padding: "4px 11px 4px 8px",
        fontSize: 11.5,
        color: "var(--muted)",
        ...style,
      }}
    >
      <Icon name={icon} size={11} style={{ color: iconColor }} />
      <span style={{ flexShrink: 0 }}>{label}</span>
      <span style={{ minWidth: 0, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      {arrow && <Icon name="arrow-up-right" size={10} style={{ color: "var(--muted)" }} />}
    </div>
  );
}

/** The agent's presence while it works: a morphing orb and a shimmering label. */
export function Presence({ label = "Thinking", style }: { label?: string; style?: CSSProperties }) {
  const f = useT();
  const shimmer = ((f * 1.5) % 100) / 100; // 0..1 sweeps
  const bgPos = 100 - shimmer * 200;
  const r = (k: number) => `${40 + 20 * Math.sin((f + k) / 14)}% ${60 - 20 * Math.sin((f + k) / 11)}% ${55 + 15 * Math.cos((f + k) / 13)}% ${45 - 15 * Math.cos((f + k) / 12)}% / ${45 + 10 * Math.sin((f + k) / 10)}% ${50 - 10 * Math.cos((f + k) / 15)}% ${50 + 10 * Math.sin((f + k) / 9)}% ${55 - 10 * Math.cos((f + k) / 8)}%`;
  return (
    <div
      style={{
        display: "flex",
        width: "fit-content",
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        borderRadius: 999,
        background: "var(--glass)",
        padding: "7px 16px 7px 8px",
        boxShadow: "0px 10px 30px var(--shadow)",
        outline: "1px solid var(--hairline)",
        outlineOffset: -0.5,
        ...style,
      }}
    >
      <span style={{ position: "relative", display: "flex", width: 22, height: 22, flexShrink: 0, alignItems: "center", justifyContent: "center" }}>
        <span style={{ position: "absolute", inset: -4, borderRadius: 999, background: "radial-gradient(circle, var(--glow), transparent 70%)", opacity: 0.65 + 0.35 * Math.sin(f / 8) }} />
        <span style={{ position: "absolute", inset: 0, borderRadius: r(0), background: "conic-gradient(from 0deg, var(--accent), var(--accent-2), var(--accent-strong), var(--accent))", transform: `rotate(${f * 3.4}deg)` }} />
        <span style={{ position: "absolute", inset: 6, borderRadius: r(40), background: "var(--surface)", opacity: 0.5 }} />
      </span>
      <span
        style={{
          fontFamily: FONT_BODY,
          fontSize: 13,
          lineHeight: "18px",
          fontWeight: 500,
          whiteSpace: "nowrap",
          backgroundImage: "linear-gradient(90deg, var(--ink) 0%, var(--ink) 38%, var(--accent-2) 50%, var(--ink) 62%, var(--ink) 100%)",
          backgroundSize: "220% 100%",
          backgroundPosition: `${bgPos}% 0`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          width: 92,
        }}
      >
        {label}
      </span>
    </div>
  );
}

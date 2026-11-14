import type { CSSProperties, ReactNode } from "react";
import { FONT_CODE, FONT_DISPLAY } from "./fonts";
import { Panel } from "./glass";
import { Icon, type IconName } from "./Icon";
import { E, blurRise, ramp } from "./motion";
import { useT } from "./time";
import { Status } from "./chips";

/* Recreations of src/components/console/SceneKit.tsx, driven by frames instead of CSS animations. */

export function SceneIntro({
  eyebrow,
  title,
  summary,
  icon = "check",
  start,
  titleSize = 38,
  maxWidth = 820,
}: {
  eyebrow: ReactNode;
  title: string;
  summary?: string;
  icon?: IconName;
  start: number;
  titleSize?: number;
  maxWidth?: number;
}) {
  const f = useT();
  const rise = 1 - ramp(f, start + 3, 24, E.enter);
  return (
    <div style={{ display: "flex", width: "100%", flexShrink: 0, flexDirection: "column", alignItems: "flex-start", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, ...blurRise(f, start, { dur: 16 }) }}>
        <Icon name={icon} size={13} style={{ color: "var(--accent)" }} />
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{eyebrow}</span>
      </div>
      <h2
        style={{
          fontFamily: FONT_DISPLAY,
          margin: 0,
          maxWidth,
          overflow: "hidden",
          paddingBottom: "0.08em",
          fontSize: titleSize,
          lineHeight: 1.06,
          fontWeight: 600,
          letterSpacing: titleSize >= 38 ? -1.5 : -1.1,
          color: "var(--ink)",
        }}
      >
        <span style={{ display: "block", transform: `translateY(${rise * 110}%)` }}>{title}</span>
      </h2>
      {summary && <p style={{ margin: 0, maxWidth: 760, fontSize: 15, lineHeight: 1.6, color: "var(--muted)", ...blurRise(f, start + 10, { dur: 18 }) }}>{summary}</p>}
    </div>
  );
}

export function Ring({
  percent,
  progress = 1,
  size = 84,
  label,
  sub,
}: {
  percent: number;
  /** 0..1 draw/count progress. */
  progress?: number;
  size?: number;
  label?: string;
  sub?: string;
}) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(100, percent)) * progress;
  return (
    <div style={{ display: "flex", flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 18 }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - shown / 100)}
            opacity={progress > 0.002 ? 1 : 0}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 19, lineHeight: 1, fontWeight: 600, letterSpacing: -0.5, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
            {Math.round(shown)}%
          </span>
        </div>
      </div>
      {(label || sub) && (
        <div style={{ display: "flex", minWidth: 0, flexDirection: "column", gap: 3 }}>
          {label && <span style={{ fontFamily: FONT_DISPLAY, fontSize: 27, lineHeight: 1, fontWeight: 600, letterSpacing: -0.8, color: "var(--ink)" }}>{label}</span>}
          {sub && <span style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</span>}
        </div>
      )}
    </div>
  );
}

export function Bars({
  values,
  latest,
  height = 132,
  labels,
  start,
  highlightColor = "var(--accent)",
}: {
  values: number[];
  latest?: number;
  height?: number;
  labels?: string[];
  start: number;
  highlightColor?: string;
}) {
  const f = useT();
  const max = Math.max(...values, 1);
  const waveEnd = Math.min(values.length * 14, 420) / 33.3;
  return (
    <div style={{ display: "flex", width: "100%", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", width: "100%", flexDirection: "row", alignItems: "flex-end", gap: 4, height }}>
        {values.map((v, i) => {
          const hl = latest === i;
          const h = Math.max(3, Math.round((v / max) * 100));
          const delay = hl ? waveEnd + 2 : Math.min(i * 0.42, 12.6);
          const p = ramp(f, start + delay, 21, E.enter);
          return (
            <div
              key={i}
              style={{
                minWidth: 0,
                flex: 1,
                height: `${h}%`,
                borderRadius: "3px 3px 0 0",
                transformOrigin: "bottom",
                transform: `scaleY(${p})`,
                background: hl ? highlightColor : "var(--line)",
                boxShadow: hl ? "0px 0px 16px var(--glow)" : undefined,
              }}
            />
          );
        })}
      </div>
      {labels && (
        <div style={{ display: "flex", width: "100%", flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          {labels.map((l, i) => (
            <span key={i} style={{ fontFamily: FONT_CODE, fontSize: 10, whiteSpace: "nowrap", color: "var(--muted)" }}>
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Table({
  title,
  detail,
  columns,
  rows,
  start,
  stagger = 4,
  footer,
  colWidths,
  highlightRow,
  highlightAmt = 0,
  style,
}: {
  title?: ReactNode;
  detail?: ReactNode;
  columns: string[];
  rows: ReactNode[][];
  start: number;
  stagger?: number;
  footer?: ReactNode;
  colWidths?: (number | string)[];
  highlightRow?: number;
  highlightAmt?: number;
  style?: CSSProperties;
}) {
  const f = useT();
  return (
    <Panel style={{ display: "flex", width: "100%", flexDirection: "column", overflow: "hidden", ...style }}>
      {(title || detail) && (
        <div style={{ display: "flex", width: "100%", flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16, padding: "16px 20px" }}>
          <div style={{ display: "flex", minWidth: 0, flexDirection: "column", gap: 2 }}>
            {title && <span style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600, letterSpacing: -0.2, color: "var(--ink)" }}>{title}</span>}
            {detail && <span style={{ fontSize: 12, color: "var(--muted)" }}>{detail}</span>}
          </div>
        </div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", tableLayout: colWidths ? "fixed" : "auto" }}>
        {colWidths && (
          <colgroup>
            {colWidths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
            {columns.map((c, i) => (
              <th key={i} style={{ padding: "9px 16px", fontFamily: FONT_CODE, fontSize: 10, fontWeight: 500, letterSpacing: 1, whiteSpace: "nowrap", color: "var(--muted)" }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => {
            const p = ramp(f, start + r * stagger, 14, E.enter);
            const hl = highlightRow === r ? highlightAmt : 0;
            return (
              <tr
                key={r}
                style={{
                  opacity: p,
                  borderBottom: r === rows.length - 1 ? "none" : "1px solid var(--hairline)",
                  background: hl > 0 ? `color-mix(in oklab, var(--soft) ${Math.round(hl * 55)}%, transparent)` : undefined,
                }}
              >
                {row.map((cell, c) => (
                  <td key={c} style={{ padding: "12px 16px", verticalAlign: "middle", fontSize: 12.5, color: "var(--ink)" }}>
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {footer && <div style={{ width: "100%", borderTop: "1px solid var(--hairline)", padding: "10px 20px", fontSize: 11, color: "var(--muted)" }}>{footer}</div>}
    </Panel>
  );
}

export const mono: CSSProperties = { fontFamily: FONT_CODE, fontSize: 11.5 };

export function StatRow({
  items,
  start,
  stagger = 5,
}: {
  items: { label: string; value: ReactNode; note?: ReactNode; badge?: ReactNode }[];
  start: number;
  stagger?: number;
}) {
  const f = useT();
  return (
    <Panel style={{ display: "flex", width: "100%", flexDirection: "row", overflow: "hidden" }}>
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            minWidth: 0,
            flex: 1,
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 6,
            borderLeft: i === 0 ? "none" : "1px solid var(--line)",
            padding: "18px 24px",
            ...blurRise(f, start + i * stagger, { dur: 16, blur: 4 }),
          }}
        >
          <span style={{ fontFamily: FONT_CODE, fontSize: 10, fontWeight: 500, letterSpacing: 1.1, color: "var(--muted)" }}>{item.label}</span>
          <div style={{ display: "flex", maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 9 }}>
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 24, lineHeight: 1.1, fontWeight: 600, letterSpacing: -0.6, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{item.value}</span>
            {item.badge}
          </div>
          {item.note && <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{item.note}</span>}
        </div>
      ))}
    </Panel>
  );
}

export function SceneFooter({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", width: "fit-content", flexDirection: "row", alignItems: "center", gap: 7, fontSize: 11, color: "var(--muted)", ...style }}>
      <span style={{ width: 5, height: 5, flexShrink: 0, borderRadius: 999, background: "var(--accent)" }} />
      {children}
    </div>
  );
}

export function LiveMeta({ children }: { children: ReactNode }) {
  const f = useT();
  return (
    <span style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6, fontSize: 11, whiteSpace: "nowrap", color: "var(--muted)" }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--accent)", opacity: 0.65 + 0.35 * Math.sin(f / 9) }} />
      {children}
    </span>
  );
}

/** A ghost/primary action button as the scenes draw it. `hover` and `press` are 0..1. */
export function Action({
  children,
  variant = "ghost",
  hover = 0,
  press = 0,
  style,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  hover?: number;
  press?: number;
  style?: CSSProperties;
}) {
  const base: CSSProperties = {
    position: "relative",
    display: "flex",
    width: "fit-content",
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 10,
    padding: "8px 13px",
    fontSize: 12.5,
    fontWeight: 500,
    whiteSpace: "nowrap",
    transform: `scale(${1 - 0.03 * press})`,
  };
  const look: CSSProperties =
    variant === "primary"
      ? { background: "var(--accent)", color: "var(--canvas)" }
      : variant === "secondary"
        ? { background: hover > 0.5 ? "var(--soft)" : "var(--surface)", color: "var(--ink)", outline: "1px solid var(--line)", outlineOffset: -0.5 }
        : { color: `color-mix(in oklab, var(--ink) ${Math.round(hover * 100)}%, var(--muted))`, background: hover > 0 ? `color-mix(in oklab, var(--soft) ${Math.round(hover * 70)}%, transparent)` : undefined };
  return <span style={{ ...base, ...look, ...style }}>{children}</span>;
}

export function Notice({ title, children, icon = "info", tone = "neutral", style }: { title?: ReactNode; children?: ReactNode; icon?: IconName; tone?: "neutral" | "success"; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        borderRadius: 12,
        padding: "13px 15px",
        background: tone === "success" ? "var(--soft)" : "var(--surface)",
        outline: tone === "success" ? "1px solid var(--hairline)" : "1px solid var(--line)",
        outlineOffset: -0.5,
        ...style,
      }}
    >
      <Icon name={icon} size={14} style={{ marginTop: 1, color: "var(--accent)" }} />
      <div style={{ display: "flex", minWidth: 0, flex: 1, flexDirection: "column", gap: 3 }}>
        {title && <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink)" }}>{title}</span>}
        {children && <span style={{ fontSize: 12, lineHeight: 1.55, color: "var(--muted)" }}>{children}</span>}
      </div>
    </div>
  );
}

export { Status };

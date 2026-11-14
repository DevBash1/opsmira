import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FONT_CODE } from "./fonts";
import { Icon } from "./Icon";
import { E, blurRise, ramp } from "./motion";
import { Spinner, WhereChip } from "./chips";
import { Highlighted } from "./Highlight";
import { themeVars } from "./tokens";
import { useT } from "./time";

/** What the owner sent: a small muted mono line with a corner arrow (AskLine). */
export function AskLine({ text, start, dim = 0 }: { text: string; start: number; dim?: number }) {
  const f = useT();
  return (
    <div style={{ display: "flex", width: "100%", flexDirection: "column", alignItems: "flex-start", gap: 8, opacity: 1 - dim * 0.35, ...blurRise(f, start, { dur: 18 }) }}>
      <div style={{ fontFamily: FONT_CODE, display: "flex", width: "100%", flexDirection: "row", alignItems: "flex-start", gap: 8, fontSize: 12, color: "var(--muted)" }}>
        <Icon name="corner-down-right" size={11} style={{ marginTop: 2 }} />
        <span style={{ minWidth: 0, flex: 1 }}>{text}</span>
      </div>
    </div>
  );
}

/**
 * The command pill: server tag, the command, a chevron that opens the output.
 * Pending (spinner + sheen) until `done`, then the terminal icon with a ripple.
 */
export function CommandPill({
  command,
  server,
  start,
  done,
  open = 0,
  output,
  outputStart,
  auto = false,
  hover = 0,
  style,
}: {
  command: string;
  server: string;
  start: number;
  done: number;
  /** 0..1: how far the output panel is open. */
  open?: number;
  output?: string;
  /** Frame at which the output starts printing line by line (defaults to when it opens). */
  outputStart?: number;
  auto?: boolean;
  hover?: number;
  style?: CSSProperties;
}) {
  const f = useT();
  const pending = f < done;
  const since = f - done;
  const pop = ramp(f, done, 10, E.enter);
  const rip = ramp(f, done, 21, E.enter);
  const hasOutput = !!output && !pending;
  const sheenX = ((f - start) % 54) / 54;
  return (
    <div style={{ display: "flex", width: "100%", minWidth: 0, flexShrink: 0, flexDirection: "column", alignItems: "flex-start", ...blurRise(f, start, { dur: 18 }), ...style }}>
      <div
        style={{
          position: "relative",
          display: "flex",
          maxWidth: "100%",
          minWidth: 0,
          flexShrink: 0,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderRadius: 999,
          overflow: "hidden",
          background: hover > 0 ? `color-mix(in oklab, var(--soft) ${Math.round(hover * 100)}%, var(--surface))` : "var(--surface)",
          padding: "5px 11px 5px 7px",
          outline: "1px solid var(--hairline)",
          outlineOffset: -0.5,
        }}
      >
        {pending && (
          <span
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: "38%",
              pointerEvents: "none",
              background: "linear-gradient(90deg, transparent, color-mix(in oklab, var(--accent-2) 16%, transparent), transparent)",
              transform: `translateX(${-120 + sheenX * 440}%) skewX(-14deg)`,
            }}
          />
        )}
        <span style={{ position: "relative", display: "flex", width: 14, height: 14, flexShrink: 0, alignItems: "center", justifyContent: "center" }}>
          {pending ? (
            <Spinner color="var(--accent-2)" />
          ) : (
            <span style={{ transform: `scale(${0.4 + 0.6 * pop})`, opacity: pop, display: "flex" }}>
              <Icon name="terminal" size={12} style={{ color: "var(--accent-2)" }} />
            </span>
          )}
          {since >= 0 && since < 21 && (
            <span
              style={{
                position: "absolute",
                inset: -3,
                borderRadius: 999,
                outline: "1.5px solid var(--accent-2)",
                outlineOffset: 0,
                opacity: 0.55 * (1 - rip),
                transform: `scale(${0.6 + 1.8 * rip})`,
              }}
            />
          )}
        </span>
        <WhereChip server={server} />
        <span style={{ fontFamily: FONT_CODE, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 12, color: "var(--ink)" }}>{command}</span>
        {auto && (
          <span style={{ fontFamily: FONT_CODE, flexShrink: 0, borderRadius: 999, background: "color-mix(in oklab, var(--danger) 14%, transparent)", padding: "1px 6px", fontSize: 9, letterSpacing: 0.5, color: "var(--danger)" }}>
            AUTO
          </span>
        )}
        {hasOutput && <Icon name="arrow-up" size={10} style={{ color: "var(--muted)", transform: `rotate(${180 * (1 - open)}deg)` }} />}
      </div>
      {output && open > 0.001 && (
        <div style={{ width: "100%", display: "grid", gridTemplateRows: `${open}fr`, opacity: open }}>
          <div style={{ minHeight: 0, overflow: "hidden" }}>
            <pre
              style={{
                ...themeVars("dark"),
                fontFamily: FONT_CODE,
                margin: "6px 0 0",
                width: "100%",
                borderRadius: 10,
                background: "var(--surface)",
                padding: "12px 14px",
                fontSize: 11,
                lineHeight: "18px",
                whiteSpace: "pre-wrap",
                color: "var(--ink)",
                outline: "1px solid var(--hairline)",
                outlineOffset: -0.5,
              }}
            >
              {output.split("\n").map((line, i) => (
                <div key={i} style={{ minHeight: 18, opacity: outputStart === undefined ? 1 : ramp(f, outputStart + i * 3, 8, E.enter), transform: outputStart === undefined ? undefined : `translateY(${(1 - ramp(f, outputStart + i * 3, 8, E.enter)) * 4}px)` }}>
                  {line}
                </div>
              ))}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

/** Grows in (height, fade, small rise) so everything above it glides up. Removes its clipping once settled. */
export function Reveal({ start, dur = 22, children, style, blur = 6, from = 0 }: { start: number; dur?: number; children: ReactNode; style?: CSSProperties; blur?: number; from?: number }) {
  const f = useT();
  const p = ramp(f, start, dur, E.enter);
  if (p <= 0) return null;
  const settled = p >= 1;
  return (
    <div style={{ display: "grid", width: "100%", gridTemplateRows: `${from + (1 - from) * p}fr`, ...style }}>
      <div style={{ minHeight: 0, overflow: settled ? "visible" : "hidden" }}>
        <div style={settled ? undefined : { opacity: p, transform: `translateY(${(1 - p) * 14}px)`, filter: blur ? `blur(${(1 - p) * blur}px)` : undefined }}>{children}</div>
      </div>
    </div>
  );
}

/** The agent's written answer (16px/26px). */
export function Reply({ children, start, style }: { children: ReactNode; start: number; style?: CSSProperties }) {
  const f = useT();
  return <p style={{ margin: 0, maxWidth: 720, fontSize: 16, lineHeight: "26px", color: "var(--ink)", ...blurRise(f, start, { dur: 20 }), ...style }}>{children}</p>;
}

/** A follow-up suggestion chip ("Find reclaimable space ↗"). */
export function SuggestionChip({ children, start, hover = 0, press = 0 }: { children: ReactNode; start: number; hover?: number; press?: number }) {
  const f = useT();
  return (
    <div
      style={{
        display: "flex",
        width: "fit-content",
        flexShrink: 0,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        borderRadius: 999,
        background: hover > 0 ? `color-mix(in oklab, var(--surface) ${Math.round(hover * 100)}%, transparent)` : "var(--glass)",
        padding: "7px 13px 7px 12px",
        fontSize: 12.5,
        fontWeight: 500,
        color: "var(--ink)",
        outline: "1px solid var(--hairline)",
        outlineOffset: -0.5,
        boxShadow: hover > 0 ? `0px 8px 22px var(--shadow)` : undefined,
        transform: `translateY(${-1 * hover}px) scale(${1 - 0.03 * press})`,
        ...blurRise(f, start, { dur: 18 }),
      }}
    >
      <span>{children}</span>
      <Icon name="arrow-up-right" size={12} style={{ color: "var(--accent)", transform: `translate(${hover}px, ${-hover}px)` }} />
    </div>
  );
}

/** A mono command with the product's shell colours. */
export function Cmd({ children, size = 12, style }: { children: string; size?: number; style?: CSSProperties }) {
  return (
    <span style={{ fontFamily: FONT_CODE, fontSize: size, color: "var(--ink)", ...style }}>
      <Highlighted text={children} />
    </span>
  );
}

/**
 * The chat area: content flows top-down and the newest block stays in view, like the console. Measured in a
 * layout effect and applied straight to the DOM so growth (Reveal) and scrolling stay locked together.
 */
export function ChatStage({ children, top, bottom, width = 920, style }: { children: ReactNode; top: number; bottom: number; width?: number; style?: CSSProperties }) {
  const inner = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!inner.current || !view.current) return;
    const scroll = Math.max(0, inner.current.offsetHeight - view.current.offsetHeight + 8);
    inner.current.style.transform = `translateY(${-scroll}px)`;
  });
  return (
    <div
      ref={view}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        bottom,
        overflow: "hidden",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 14px, #000 calc(100% - 30px), transparent 100%)",
        maskImage: "linear-gradient(to bottom, transparent 0, #000 14px, #000 calc(100% - 30px), transparent 100%)",
        ...style,
      }}
    >
      <div ref={inner} style={{ position: "absolute", top: 0, left: "50%", width, marginLeft: -width / 2, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16, padding: "20px 0" }}>
        {children}
      </div>
    </div>
  );
}

/** Height-collapsing wrapper that is visible between `show` and `hide` (frames). */
export function Collapse({ show, hide, dur = 16, children }: { show: number; hide?: number; dur?: number; children: ReactNode }) {
  const f = useT();
  const pin = ramp(f, show, dur, E.enter);
  const pout = hide === undefined ? 0 : ramp(f, hide, dur, E.move);
  const p = pin * (1 - pout);
  if (p <= 0.001) return null;
  return (
    <div style={{ display: "grid", width: "100%", gridTemplateRows: `${p}fr`, opacity: pin * (1 - pout) }}>
      <div style={{ minHeight: 0, overflow: p < 1 ? "hidden" : "visible" }}>{children}</div>
    </div>
  );
}

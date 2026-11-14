import type { CSSProperties, ReactNode } from "react";
import { FONT_BODY, FONT_CODE } from "./fonts";
import { EdgeLight } from "./glass";
import { Icon } from "./Icon";
import { E, blurRise, lerp, ramp } from "./motion";
import { ModeChip, ModelChip, ServerChip, Spinner } from "./chips";
import { CMD_BLUE } from "./tokens";
import { useT } from "./time";

export const COMPOSER_W = 800;
export const COMPOSER_H = 102;

/**
 * The composer (Console.tsx): glass, radius 22, the input, mode / server / model chips and the send button.
 * Everything that moves is a prop, so a scene can drive it from its own timeline.
 */
export function Composer({
  text = "",
  placeholder = "What would you like to know or do?",
  lastKey = -1000,
  focus = 0,
  command = 0,
  commandSince,
  server,
  serverOpen = false,
  model,
  mode = "ask",
  running = 0,
  send = 0,
  sendPress = 0,
  chipHover,
  menu,
  style,
}: {
  text?: string;
  placeholder?: string;
  /** Frame of the last keystroke (keeps the caret solid while typing). */
  lastKey?: number;
  /** 0..1 focus ring. */
  focus?: number;
  /** 0..1: command mode (blue). */
  command?: number;
  commandSince?: number;
  server?: string;
  serverOpen?: boolean;
  model?: string;
  mode?: "ask" | "full";
  /** 0..1 while the agent works: edge light + stop button. */
  running?: number;
  /** 0..1 how "ready" the send button is (text typed). */
  send?: number;
  sendPress?: number;
  chipHover?: "mode" | "server" | "model";
  menu?: ReactNode;
  style?: CSSProperties;
}) {
  const f = useT();
  const typing = f - lastKey < 14;
  const caretOn = typing || f % 32 < 18;
  const showCaret = focus > 0.3 && caretOn && running < 0.5;
  const isCmd = command > 0.001;
  const cmdColor = CMD_BLUE;
  const outline = isCmd
    ? `1px solid color-mix(in oklab, ${cmdColor} ${Math.round(lerp(0, 55, command) + focus * lerp(0, 45, command))}%, var(--hairline))`
    : `1px solid color-mix(in oklab, var(--accent) ${Math.round(focus * 100)}%, var(--hairline))`;
  const ring = isCmd ? `0px 0px 0px ${4 * focus}px color-mix(in oklab, ${cmdColor} 18%, transparent)` : `0px 0px 0px ${4 * focus}px var(--glow)`;
  const sendScale = lerp(0.9, 1, Math.max(send, running));
  const sendOpacity = lerp(0.45, 1, Math.max(send, running));
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: COMPOSER_W,
        flexShrink: 0,
        flexDirection: "column",
        alignItems: "stretch",
        gap: 14,
        borderRadius: 22,
        background: "var(--glass)",
        padding: "18px 12px 12px 20px",
        boxShadow: `0px 14px 40px var(--shadow), ${ring}`,
        outline,
        outlineOffset: -0.5,
        ...style,
      }}
    >
      {running > 0.01 && (
        <div style={{ opacity: running }}>
          <EdgeLight radius={22} period={150} glow />
        </div>
      )}
      <div style={{ position: "relative", display: "flex", height: 24, width: "100%", alignItems: "center", paddingRight: 8, fontSize: isCmd && text ? 14 : 16, fontFamily: isCmd && text ? FONT_CODE : FONT_BODY }}>
        {!text && showCaret && <span style={{ position: "absolute", left: 0, width: 1.5, height: 20, borderRadius: 1, background: "var(--ink)" }} />}
        {text ? <span style={{ whiteSpace: "pre", color: "var(--ink)" }}>{text}</span> : <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{placeholder}</span>}
        {text && showCaret && <span style={{ width: 1.5, height: 20, marginLeft: 1, borderRadius: 1, background: "var(--ink)" }} />}
      </div>
      <div style={{ display: "flex", width: "100%", minWidth: 0, flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <div style={{ position: "relative" }}>
          <ModeChip mode={mode} style={chipHover === "mode" ? { background: "var(--line)" } : undefined} />
        </div>
        {server && (
          <div style={{ position: "relative" }}>
            <ServerChip label={server} open={serverOpen} style={chipHover === "server" || serverOpen ? { background: "var(--line)" } : undefined} />
          </div>
        )}
        {model && <ModelChip label={model} style={chipHover === "model" ? { background: "var(--line)" } : undefined} />}
        {isCmd && commandSince !== undefined && (
          <span style={{ fontFamily: FONT_CODE, display: "flex", flexShrink: 0, alignItems: "center", gap: 6, fontSize: 11, color: CMD_BLUE, ...blurRise(f, commandSince, { dur: 14 }) }}>
            <Icon name="terminal" size={11} />
            Command
          </span>
        )}
        <div
          style={{
            position: "relative",
            marginLeft: "auto",
            display: "flex",
            width: 34,
            height: 34,
            flexShrink: 0,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            borderRadius: 999,
            background: "linear-gradient(-45deg, var(--accent), var(--accent-2))",
            boxShadow: "0px 6px 18px var(--glow)",
            transform: `scale(${sendScale * (1 - 0.1 * sendPress)})`,
            opacity: sendOpacity,
            filter: sendPress > 0 ? `brightness(${1 + 0.15 * sendPress})` : undefined,
          }}
        >
          {running > 0.5 ? (
            <>
              <svg viewBox="0 0 28 28" style={{ position: "absolute", width: 28, height: 28, color: "var(--canvas)", transform: `rotate(${(f * 3.3) % 360}deg)` }} aria-hidden="true">
                <circle cx="14" cy="14" r="11.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
                <circle cx="14" cy="14" r="11.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="20 52.3" />
              </svg>
              <Icon name="square" size={11} style={{ color: "var(--canvas)" }} />
            </>
          ) : (
            <Icon name="arrow-up" size={16} style={{ color: "var(--canvas)" }} />
          )}
        </div>
      </div>
      {menu}
    </div>
  );
}

export type MenuServer = { id: string; label: string; detail: string; online?: boolean; glow?: number };

/** The menu that rises out of the composer to pick a server (ComposerMenu + ServerChip). `open` is 0..1. */
export function ServerMenu({ servers, selected, open, hoverIdx, appear = {} }: { servers: MenuServer[]; selected: string; open: number; hoverIdx?: number; appear?: Record<string, number> }) {
  const f = useT();
  if (open <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute",
        bottom: "calc(100% + 10px)",
        left: 140,
        zIndex: 30,
        display: "flex",
        width: 300,
        flexDirection: "column",
        gap: 2,
        padding: 6,
        borderRadius: 18,
        background: "var(--surface)",
        boxShadow: "0px 28px 70px -12px var(--shadow), 0px 4px 16px var(--shadow)",
        outline: "1px solid var(--line)",
        outlineOffset: -0.5,
        transformOrigin: "bottom left",
        opacity: open,
        transform: `translateY(${(1 - open) * 8}px) scale(${0.96 + 0.04 * open})`,
        filter: open < 1 ? `blur(${(1 - open) * 6}px)` : undefined,
      }}
    >
      {servers.map((s, i) => {
        const isSel = s.id === selected;
        const ap = appear[s.id] === undefined ? 1 : ramp(f, appear[s.id], 18, E.enter);
        if (ap <= 0) return null;
        const g = s.glow ?? 0;
        return (
          <div
            key={s.id}
            style={{
              display: "flex",
              width: "100%",
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 10,
              borderRadius: 13,
              padding: "10px 11px",
              background: hoverIdx === i ? "var(--soft)" : isSel ? "color-mix(in oklab, var(--soft) 70%, transparent)" : g > 0 ? `color-mix(in oklab, var(--soft) ${Math.round(g * 70)}%, transparent)` : undefined,
              opacity: ap,
              transform: `translateY(${(1 - ap) * 6}px)`,
            }}
          >
            <span style={{ marginTop: 1, display: "flex", width: 24, height: 24, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 999, background: "var(--soft)", color: "var(--accent)" }}>
              <Icon name="server" size={12} />
            </span>
            <span style={{ display: "flex", minWidth: 0, flex: 1, flexDirection: "column", gap: 2 }}>
              <span style={{ fontFamily: FONT_CODE, fontSize: 12.5, fontWeight: 500, color: "var(--ink)" }}>{s.label}</span>
              <span style={{ fontSize: 11.5, lineHeight: 1.45, color: "var(--muted)" }}>{s.detail}</span>
            </span>
            <span style={{ display: "flex", width: 16, height: 16, flexShrink: 0, alignItems: "center", justifyContent: "center", alignSelf: "center", borderRadius: 999, ...(isSel ? { background: "var(--accent)" } : { outline: "1.5px solid var(--line)", outlineOffset: -1.5 }) }}>
              {isSel && <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--surface)" }} />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export { Spinner };

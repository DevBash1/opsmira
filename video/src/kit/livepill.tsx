import type { CSSProperties, ReactNode } from "react";
import { FONT_BODY, FONT_CODE } from "./fonts";
import { Icon } from "./Icon";
import { Spinner } from "./chips";
import { useT } from "./time";

/* The glass pill the console shows above the message box (Console.tsx). Three things live in it:
 *   - a detached run: what it is doing now, the console restarting under it, then the new build to reload onto
 *   - an MCP client asking Opsmira something in another conversation ("<client> is asking … WATCH")
 * The console draws it at 12 px; `s` scales the whole pill for the film's glass cards (which are read at 1080p). */

function GlassPill({ children, s = 1, style }: { children: ReactNode; s?: number; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "inline-flex",
        maxWidth: "100%",
        minWidth: 0,
        flexDirection: "row",
        alignItems: "center",
        gap: 8 * s,
        borderRadius: 999,
        background: "var(--glass)",
        padding: `${6 * s}px ${12 * s}px ${6 * s}px ${10 * s}px`,
        fontFamily: FONT_BODY,
        fontSize: 12 * s,
        outline: "1px solid var(--hairline)",
        outlineOffset: -0.5,
        boxShadow: `0px ${8 * s}px ${24 * s}px var(--shadow)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** The accent dot that pulses while something is live (motion-safe animate-dot-pulse). */
function LiveDot({ s = 1 }: { s?: number }) {
  const f = useT();
  const pulse = 0.55 + 0.45 * Math.sin(f / 4.2);
  return <span style={{ width: 6 * s, height: 6 * s, flexShrink: 0, borderRadius: 999, background: "var(--accent)", opacity: pulse, boxShadow: `0px 0px ${6 * s}px var(--glow)` }} />;
}

const label = (s: number): CSSProperties => ({ flexShrink: 0, fontWeight: 500, color: "var(--ink)", fontSize: 12 * s });
const detail = (s: number): CSSProperties => ({ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--muted)", fontSize: 12 * s });
const action = (s: number): CSSProperties => ({ display: "flex", flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 4 * s, fontFamily: FONT_CODE, letterSpacing: 0.5 * s, color: "var(--accent-strong)", fontSize: 9.5 * s });

/** "Claude is asking <ask> [eye] WATCH" — an MCP client working in another conversation. */
export function AskingPill({ client, ask, s = 1, style }: { client: string; ask: string; s?: number; style?: CSSProperties }) {
  return (
    <GlassPill s={s} style={style}>
      <LiveDot s={s} />
      <span style={label(s)}>{client} is asking</span>
      <span style={detail(s)}>{ask}</span>
      <span style={action(s)}>
        <Icon name="eye" size={11 * s} />
        WATCH
      </span>
    </GlassPill>
  );
}

/** "Detached on <server> <step> [arrow] OPEN" — a run working on the server while the console may go down. */
export function DetachedPill({ server, step, s = 1, style }: { server: string; step: string; s?: number; style?: CSSProperties }) {
  return (
    <GlassPill s={s} style={style}>
      <LiveDot s={s} />
      <span style={label(s)}>Detached on {server}</span>
      <span style={detail(s)}>{step}</span>
      <span style={action(s)}>
        <Icon name="arrow-up-right" size={11 * s} />
        OPEN
      </span>
    </GlassPill>
  );
}

/** "Opsmira is restarting — This page catches up when it's back." */
export function RestartingPill({ s = 1, style }: { s?: number; style?: CSSProperties }) {
  return (
    <GlassPill s={s} style={style}>
      <Spinner size={11 * s} color="var(--muted)" />
      <span style={label(s)}>Opsmira is restarting</span>
      <span style={detail(s)}>This page catches up when it&rsquo;s back</span>
    </GlassPill>
  );
}

/** "Opsmira was updated [refresh] RELOAD" — the new build is answering. */
export function UpdatedPill({ s = 1, style }: { s?: number; style?: CSSProperties }) {
  return (
    <GlassPill s={s} style={style}>
      <Icon name="refresh-cw" size={11 * s} style={{ flexShrink: 0, color: "var(--accent)" }} />
      <span style={label(s)}>Opsmira was updated</span>
      <span style={action(s)}>RELOAD</span>
    </GlassPill>
  );
}

import type { CSSProperties, ReactNode } from "react";
import { FONT_CODE } from "./fonts";
import { Icon, type IconName } from "./Icon";
import { E, lerp, ramp } from "./motion";
import { WhereChip } from "./chips";
import { blurRise } from "./motion";
import { useT } from "./time";

export const TOPBAR_ICONS: { id: string; icon: IconName; label: string }[] = [
  { id: "theme", icon: "sun", label: "Light mode" },
  { id: "history", icon: "history", label: "History" },
  { id: "tasks", icon: "refresh-cw", label: "Tasks" },
  { id: "artifacts", icon: "file-text", label: "Artifacts" },
  { id: "memory", icon: "bookmark", label: "Memory" },
  { id: "scenes", icon: "box", label: "Surfaces" },
  { id: "audit", icon: "scroll-text", label: "Activity" },
  { id: "logout", icon: "log-out", label: "Sign out" },
];

/** A top-bar control: icon first, label slides out on hover. */
export function IconButton({ icon, label, active = 0, dot = 0, hover = 0, ping = 0, style }: { icon: IconName; label: string; active?: number; dot?: number; hover?: number; ping?: number; style?: CSSProperties }) {
  const glass = Math.max(active, hover * 0.9);
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        height: 32,
        flexShrink: 0,
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 999,
        padding: "0 9px",
        color: `color-mix(in oklab, var(--ink) ${Math.round(Math.max(active, hover) * 100)}%, var(--muted))`,
        opacity: lerp(0.7, 1, Math.max(active, hover)),
        background: glass > 0 ? `color-mix(in oklab, var(--glass) ${Math.round(glass * 100)}%, transparent)` : undefined,
        ...style,
      }}
    >
      <Icon name={icon} size={14} />
      <span style={{ display: "grid", gridTemplateColumns: `${hover}fr` }}>
        <span style={{ overflow: "hidden", whiteSpace: "nowrap" }}>
          <span style={{ paddingLeft: 7, fontSize: 12, opacity: hover }}>{label}</span>
        </span>
      </span>
      {dot > 0 && (
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 6,
            height: 6,
            borderRadius: 999,
            background: "var(--accent)",
            boxShadow: "0px 0px 6px var(--glow)",
            transform: `translateY(${(1 - dot) * 70}%)`,
            opacity: dot,
          }}
        />
      )}
      {ping > 0 && ping < 1 && (
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 6,
            height: 6,
            borderRadius: 999,
            border: "1.5px solid var(--accent)",
            transform: `scale(${1 + ping * 5})`,
            opacity: (1 - ping) * 0.9,
          }}
        />
      )}
    </div>
  );
}

export const TOPBAR_H = 44;

/** The console's top bar. `state` maps an icon id to { active, dot, hover }. */
export function TopBar({
  state = {},
  theme = "dark",
  opacity = 1,
}: {
  state?: Record<string, { active?: number; dot?: number; hover?: number; ping?: number }>;
  theme?: "dark" | "light";
  opacity?: number;
}) {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, display: "flex", flexDirection: "row", alignItems: "center", gap: 2, padding: "12px 28px 0 28px", opacity }}>
      <IconButton icon="plus" label="New chat" {...(state.new ?? {})} />
      <div style={{ marginLeft: "auto", display: "flex", flexDirection: "row", alignItems: "center", gap: 2 }}>
        {TOPBAR_ICONS.map((b) => (
          <IconButton key={b.id} icon={b.id === "theme" ? (theme === "dark" ? "sun" : "moon") : b.icon} label={b.id === "theme" ? (theme === "dark" ? "Light mode" : "Dark mode") : b.label} {...(state[b.id] ?? {})} />
        ))}
      </div>
    </div>
  );
}

/** A floating glass sheet that grows out of the top-right corner (Popover.tsx). `open` is 0..1. */
export function Popover({ open, width, right = 28, children, style }: { open: number; width: number; right?: number; children: ReactNode; style?: CSSProperties }) {
  if (open <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: 44 + 8 + 12,
        right,
        zIndex: 30,
        width,
        transformOrigin: "top right",
        overflow: "hidden",
        borderRadius: 18,
        background: "var(--glass)",
        backdropFilter: "blur(18px)",
        boxShadow: "0px 24px 60px var(--shadow)",
        outline: "1px solid var(--hairline)",
        outlineOffset: -0.5,
        opacity: open,
        transform: `translateY(${(1 - open) * -6}px) scale(${0.96 + 0.04 * open})`,
        filter: open < 1 ? `blur(${(1 - open) * 6}px)` : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export type AuditRow = { title: string; kind: "act" | "inspect"; exit: number; at: string; appear?: number };

/** The Activity popover content: one row per command the agent ran, newest first. */
export function ActivityList({ rows }: { rows: AuditRow[] }) {
  const f = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", padding: 8 }}>
      <div style={{ padding: "4px 10px 6px", fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>Activity</div>
      {rows.map((row, i) => {
        const p = row.appear === undefined ? 1 : ramp(f, row.appear, 20, E.enter);
        if (p <= 0) return null;
        return (
          <div key={i} style={{ display: "grid", gridTemplateRows: `${p}fr`, opacity: p }}>
            <div style={{ minHeight: 0, overflow: p < 1 ? "hidden" : "visible" }}>
              <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, padding: "7px 10px" }}>
                <span style={{ width: 6, height: 6, flexShrink: 0, borderRadius: 999, background: row.kind === "act" ? "var(--accent)" : "var(--line)", boxShadow: row.kind === "act" ? "0px 0px 6px var(--glow)" : undefined }} />
                <span style={{ fontFamily: FONT_CODE, minWidth: 0, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 11, color: "var(--ink)" }}>{row.title}</span>
                <span style={{ fontFamily: FONT_CODE, flexShrink: 0, fontSize: 10, color: "var(--muted)", opacity: 0.7 }}>
                  exit {row.exit} · {row.at}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type TaskRow = {
  name: string;
  server: string;
  when: string;
  state: "on" | "running" | "paused";
  last?: string;
  ran: string;
  next?: string;
  waiting?: number;
  appear?: number;
  /** 0..1 highlight (hover / just woke). */
  glow?: number;
  asks?: string;
};

const small: CSSProperties = { borderRadius: 7, padding: "2px 7px", fontSize: 10.5, color: "var(--muted)" };

/** The Tasks popover content (TasksPanel.tsx). */
export function TasksList({ tasks, hoverButton }: { tasks: TaskRow[]; hoverButton?: { row: number; label: string } }) {
  const f = useT();
  const firstAt = Math.min(...tasks.map((t) => t.appear ?? -1e9));
  const emptyP = 1 - ramp(f, firstAt - 6, 10, E.exit);
  return (
    <div style={{ display: "flex", flexDirection: "column", padding: 8 }}>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "4px 10px 6px" }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>Tasks</span>
        <span style={{ fontSize: 10.5, color: "var(--muted)" }}>The agent wakes on its own</span>
      </div>
      {emptyP > 0.001 && (
        <div style={{ display: "grid", gridTemplateRows: `${emptyP}fr`, opacity: emptyP }}>
          <div style={{ minHeight: 0, overflow: "hidden" }}>
            <div style={{ padding: 10, fontSize: 12, lineHeight: "18px", color: "var(--muted)" }}>
              Nothing yet. Ask for one in chat, like “check disk space every morning” or “tell me if nginx stops”.
            </div>
          </div>
        </div>
      )}
      {tasks.map((t, i) => {
        const p = t.appear === undefined ? 1 : ramp(f, t.appear, 20, E.enter);
        if (p <= 0) return null;
        const g = t.glow ?? 0;
        return (
          <div key={i} style={{ ...blurRise(f, t.appear ?? -1000, { dur: 20, blur: 4 }), display: "flex", flexDirection: "column", gap: 4, borderRadius: 10, padding: "8px 8px 8px 10px", background: g > 0 ? `color-mix(in oklab, var(--soft) ${Math.round(g * 100)}%, transparent)` : undefined }}>
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 7 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  flexShrink: 0,
                  borderRadius: 999,
                  background: t.state === "running" ? "var(--accent-2)" : t.state === "on" ? "var(--accent)" : "var(--line)",
                  opacity: t.state === "running" ? 0.5 + 0.5 * Math.sin(f / 5) ** 2 : 1,
                  boxShadow: t.state === "running" ? "0 0 8px var(--glow-2)" : undefined,
                }}
              />
              <span style={{ minWidth: 0, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "left", fontSize: 12.5, fontWeight: 500, color: "var(--ink)" }}>{t.name}</span>
              <WhereChip server={t.server} />
              {!!t.waiting && (
                <span style={{ flexShrink: 0, borderRadius: 999, background: "var(--accent)", padding: "1px 7px", fontSize: 10, fontWeight: 500, color: "var(--surface)" }}>{t.waiting} waiting</span>
              )}
            </div>
            <div style={{ fontFamily: FONT_CODE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 10.5, color: "var(--muted)" }}>{t.when}</div>
            {t.last && <div style={{ fontSize: 11.5, lineHeight: "16px", color: "var(--muted)" }}>{t.last}</div>}
            <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 2, fontSize: 10.5, color: "var(--muted)" }}>
              <span style={{ padding: "0 7px" }}>
                {t.ran}
                {t.next ? ` · next ${t.next}` : ""}
              </span>
              {["Run now", t.state === "paused" ? "Resume" : "Pause", "Asks first"].map((b) => (
                <span key={b} style={{ ...small, opacity: b === "Run now" && t.state === "running" ? 0.5 : 1, background: hoverButton && hoverButton.row === i && hoverButton.label === b ? "var(--soft)" : undefined, color: hoverButton && hoverButton.row === i && hoverButton.label === b ? "var(--ink)" : "var(--muted)" }}>
                  {b}
                </span>
              ))}
              <span style={{ ...small, marginLeft: "auto" }}>Remove</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

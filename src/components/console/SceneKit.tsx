import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icon, type IconName } from "../Icons";
import { AutoHeight, Collapse } from "./Collapse";
import { AnimatedValue, CountUp } from "./CountUp";

/* Motion: blocks of a scene are staggered by the `.scene-stagger` wrapper (index.css); inside them,
 * rows fade in one after another, rings draw, bars grow and numbers count up. Every entrance uses a
 * `backwards` fill, so nothing keeps a transform or filter once it has settled. */
const rowFade = (i: number, step = 30, cap = 12): CSSProperties => ({ animationDelay: `${Math.min(i, cap) * step}ms` });
const ROW_FADE = "motion-safe:animate-[row-fade_0.5s_ease-out_backwards]";

/* ------------------------------------------------------------------ *
 * Primitives for the 30 dynamic workspace surfaces. Visual language  *
 * is lifted from Opsmira · Live UI components (JDyGB) in the .pen    *
 * file: 20px glass panels, Space Grotesk headings, IBM Plex Mono     *
 * for data, 1px hairlines, restrained green/teal accents.            *
 * ------------------------------------------------------------------ */

const TONE_DOT: Record<string, string> = {
  success: "bg-[var(--accent-strong)]",
  accent: "bg-[var(--accent)]",
  warn: "bg-[var(--accent-2)]",
  danger: "bg-[var(--ink)]",
  muted: "bg-[var(--muted)]",
  neutral: "bg-[var(--line)]",
};

const TONE_TEXT: Record<string, string> = {
  success: "text-[var(--accent-strong)]",
  accent: "text-[var(--accent)]",
  warn: "text-[var(--ink)]",
  danger: "text-[var(--ink)]",
  muted: "text-[var(--muted)]",
  neutral: "text-[var(--muted)]",
};

export type Tone = "success" | "accent" | "warn" | "danger" | "muted" | "neutral";

export function Panel({
  children,
  className = "",
  live = false,
  inset = false,
}: {
  children: ReactNode;
  className?: string;
  live?: boolean;
  inset?: boolean;
}) {
  const base = inset
    ? "rounded-[14px] bg-[var(--canvas)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]"
    : // No backdrop blur: the aurora behind is already soft, and blurring it again every frame is costly.
      "rounded-[20px] bg-[var(--glass)] [box-shadow:0px_16px_40px_var(--shadow)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]";
  return (
    <div className={`${base} ${live ? "[outline:1px_solid_var(--accent)]" : ""} ${className}`}>{children}</div>
  );
}

export function SceneIntro({
  eyebrow,
  title,
  summary,
  icon = "check",
  action,
}: {
  eyebrow: ReactNode;
  title: string;
  summary: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <div className="flex w-full shrink-0 flex-col items-start gap-[14px]">
      <div className="flex w-full flex-row items-center justify-between gap-[12px]">
        <div className="flex flex-row items-center gap-[8px]">
          <Icon name={icon} className="h-[13px] w-[13px] shrink-0 text-[var(--accent)]" />
          <span className="text-[12px] text-[var(--muted)]">{eyebrow}</span>
        </div>
        {action}
      </div>
      <h2 className="font-display max-w-[820px] overflow-hidden pb-[0.08em] text-[30px] leading-[1.06] font-semibold tracking-[-1.1px] text-[var(--ink)] sm:text-[38px] sm:tracking-[-1.5px]">
        <span style={{ animationDelay: "80ms" }} className="block motion-safe:animate-mask-up">
          {title}
        </span>
      </h2>
      <p className="max-w-[760px] text-[14px] leading-[1.6] text-[var(--muted)] sm:text-[15px]">{summary}</p>
    </div>
  );
}

export function StatRow({
  items,
  className = "",
}: {
  items: { label: string; value: ReactNode; note?: ReactNode; badge?: ReactNode }[];
  className?: string;
}) {
  // Items wrap onto further rows when they don't fit (long values, narrow panels). Hairlines are
  // borders pulled outside the clipped box by -1px, so the first item of every row has no stray edge.
  return (
    <Panel className={`group/stats w-full overflow-hidden ${className}`}>
      <div className="-mt-px -ml-px flex flex-row flex-wrap">
        {items.map((item, i) => {
          const long = typeof item.value === "string" && item.value.length > 11;
          return (
            <div
              key={i}
              className="flex min-w-0 grow basis-full flex-col items-start gap-[6px] border-t border-l border-[var(--line)] px-[24px] py-[16px] sm:basis-[190px] sm:py-[18px]"
            >
              <span className="font-code text-[10px] font-medium tracking-[1.1px] text-[var(--muted)]">{item.label}</span>
              <div className="flex max-w-full flex-row flex-wrap items-center gap-x-[9px] gap-y-[6px]">
                <span
                  className={`font-display leading-[1.1] font-semibold tracking-[-0.6px] break-words text-[var(--ink)] ${long ? "text-[19px]" : "text-[24px]"}`}
                >
                  <AnimatedValue value={item.value} />
                </span>
                {item.badge}
              </div>
              {/* Secondary detail waits for a hover on mouse devices; touch screens always show it. */}
              {item.note && (
                <span className="text-[11.5px] text-[var(--muted)] transition-opacity duration-300 ease-enter pointer-fine:opacity-0 pointer-fine:group-hover/stats:opacity-100">
                  {item.note}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const styles =
    tone === "success"
      ? "bg-[var(--soft)] text-[var(--accent-strong)]"
      : tone === "accent"
        ? "bg-[var(--soft)] text-[var(--accent-strong)]"
        : tone === "warn"
          ? "bg-[var(--soft)] text-[var(--ink)]"
          : tone === "danger"
            ? "bg-[var(--ink)] text-[var(--canvas)]"
            : "[outline:1px_solid_var(--line)] [outline-offset:-0.5px] text-[var(--muted)]";
  return (
    <span className={`inline-flex w-fit shrink-0 flex-row items-center gap-[6px] rounded-[7px] px-[9px] py-[4px] text-[11px] font-medium whitespace-nowrap ${styles}`}>
      {children}
    </span>
  );
}

export function Status({ children, tone = "success" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className="inline-flex w-fit shrink-0 flex-row items-center gap-[6px] rounded-full bg-[var(--soft)] px-[9px] py-[3px] text-[11px] font-medium whitespace-nowrap text-[var(--ink)]">
      <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${TONE_DOT[tone]}`} />
      {children}
    </span>
  );
}

export function Dot({ tone = "accent", pulse = false }: { tone?: Tone; pulse?: boolean }) {
  return (
    <span className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full bg-[var(--glow)]">
      <span className={`h-[6px] w-[6px] rounded-full ${TONE_DOT[tone]} ${pulse ? "motion-safe:animate-[dot-pulse_1.6s_ease-in-out_infinite]" : ""}`} />
    </span>
  );
}

export function Ring({ percent, size = 84, label, sub }: { percent: number; size?: number; label?: string; sub?: string }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex shrink-0 flex-row items-center gap-[18px]">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
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
            strokeDashoffset={c * (1 - clamped / 100)}
            style={{ "--ring-c": `${c}` } as CSSProperties}
            className="motion-safe:animate-[ring-draw_1.2s_cubic-bezier(0.22,1,0.36,1)_120ms_backwards] motion-safe:transition-[stroke-dashoffset] motion-safe:duration-[900ms] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[19px] leading-none font-semibold tracking-[-0.5px] text-[var(--ink)]">
            <CountUp value={Math.round(percent)} duration={1.2} />%
          </span>
        </div>
      </div>
      {(label || sub) && (
        <div className="flex min-w-0 flex-col gap-[3px]">
          {label && <span className="font-display text-[27px] leading-none font-semibold tracking-[-0.8px] text-[var(--ink)]">{label}</span>}
          {sub && <span className="text-[12px] text-[var(--muted)]">{sub}</span>}
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
  className = "",
  tone = "line",
}: {
  values: number[];
  latest?: number;
  height?: number;
  labels?: string[];
  className?: string;
  tone?: "line" | "accent";
}) {
  const max = Math.max(...values, 1);
  // Bars rise left to right like a wave; the highlighted one lands last.
  const waveEnd = Math.min(values.length * 14, 420);
  return (
    <div className={`flex w-full flex-col gap-[10px] ${className}`}>
      <div className="flex w-full flex-row items-end gap-[4px]" style={{ height }}>
        {values.map((v, i) => {
          const highlighted = latest === i;
          const h = Math.max(3, Math.round((v / max) * 100));
          return (
            <div
              key={i}
              className={`min-w-0 flex-1 rounded-t-[3px] [transform-origin:bottom] motion-safe:animate-[bar-grow_0.7s_cubic-bezier(0.22,1,0.36,1)_backwards] motion-safe:transition-[height,background-color,box-shadow,opacity] motion-safe:duration-[800ms] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] ${
                highlighted
                  ? "bg-[var(--accent)] [box-shadow:0px_0px_16px_var(--glow)]"
                  : tone === "accent"
                    ? "bg-[var(--accent)] opacity-30"
                    : "bg-[var(--line)]"
              }`}
              style={{ height: `${h}%`, animationDelay: `${highlighted ? waveEnd + 60 : Math.min(i * 14, 420)}ms` }}
            />
          );
        })}
      </div>
      {labels && (
        <div className="flex w-full flex-row justify-between gap-[8px]">
          {labels.map((l, i) => (
            <span key={i} className="font-code text-[10px] whitespace-nowrap text-[var(--muted)]">
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function StackedBar({
  segments,
  total,
  title,
}: {
  segments: { label: string; value: string; pct: number; tone?: "accent" | "accent2" | "ink" | "muted" | "line" }[];
  total?: ReactNode;
  title?: ReactNode;
}) {
  const fills: Record<string, string> = {
    accent: "bg-[var(--accent)]",
    accent2: "bg-[var(--accent-2)]",
    ink: "bg-[var(--ink)]",
    muted: "bg-[var(--muted)]",
    line: "bg-[var(--line)]",
  };
  return (
    <div className="flex w-full flex-col gap-[14px]">
      {(title || total) && (
        <div className="flex w-full flex-row items-end justify-between gap-[12px]">
          <span className="text-[12px] text-[var(--muted)]">{title}</span>
          {total && <span className="font-display text-[19px] font-semibold tracking-[-0.4px] text-[var(--ink)]">{total}</span>}
        </div>
      )}
      <div className="flex h-[14px] w-full flex-row gap-[3px] overflow-hidden rounded-full">
        {segments.map((s, i) => (
          <div
            key={i}
            className={`h-full rounded-full motion-safe:transition-[width] motion-safe:duration-[800ms] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] ${fills[s.tone ?? "accent"]}`}
            style={{ width: `${Math.max(2, s.pct)}%` }}
          />
        ))}
      </div>
      <div className="flex w-full flex-row flex-wrap gap-x-[18px] gap-y-[8px]">
        {segments.map((s, i) => (
          <span key={i} className="flex flex-row items-center gap-[7px] text-[11.5px] whitespace-nowrap text-[var(--muted)]">
            <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${fills[s.tone ?? "accent"]}`} />
            <span className="text-[var(--ink)]">{s.label}</span>
            <span className="font-code text-[10.5px]">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Table({
  title,
  detail,
  right,
  columns,
  rows,
  footer,
  minWidth = "min-w-[620px]",
  className = "",
}: {
  title?: ReactNode;
  detail?: ReactNode;
  right?: ReactNode;
  columns: { label: string; className?: string }[];
  rows: ReactNode[][];
  footer?: ReactNode;
  minWidth?: string;
  className?: string;
}) {
  // Long tables show their first rows; the rest are a tap away and glide in.
  const [expanded, setExpanded] = useState(false);
  const extra = rows.length - TABLE_ROWS;
  const collapsible = extra > 1;
  const shown = collapsible && !expanded ? rows.slice(0, TABLE_ROWS) : rows;

  return (
    <Panel className={`flex w-full flex-col overflow-hidden ${className}`}>
      {(title || detail || right) && (
        <div className="flex w-full flex-row items-start justify-between gap-[16px] p-[16px_20px]">
          <div className="flex min-w-0 flex-col gap-[2px]">
            {title && <span className="font-display text-[16px] font-semibold tracking-[-0.2px] text-[var(--ink)]">{title}</span>}
            {detail && <span className="text-[12px] text-[var(--muted)]">{detail}</span>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </div>
      )}
      <AutoHeight>
        <div className="w-full overflow-x-auto">
          <table className={`w-full border-collapse text-left ${minWidth}`}>
            <thead>
              <tr className="border-y border-[var(--line)]">
                {columns.map((c, i) => (
                  <th
                    key={i}
                    className={`px-[16px] py-[9px] font-code text-[10px] font-medium tracking-[1px] whitespace-nowrap text-[var(--muted)] ${c.className ?? ""}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, r) => (
                <tr
                  key={r}
                  style={rowFade(r >= TABLE_ROWS ? r - TABLE_ROWS : r)}
                  className={`border-b border-[var(--hairline)] transition-colors duration-150 ease-enter last:border-0 hover:bg-[var(--soft)]/50 ${ROW_FADE}`}
                >
                  {row.map((cell, c) => (
                    <td key={c} className={`px-[16px] py-[12px] align-middle text-[12.5px] text-[var(--ink)] ${columns[c]?.className ?? ""}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AutoHeight>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex w-full cursor-pointer flex-row items-center justify-center gap-[6px] border-t border-[var(--hairline)] px-[20px] py-[9px] text-[11.5px] text-[var(--muted)] transition-colors duration-200 ease-enter hover:bg-[var(--soft)]/50 hover:text-[var(--ink)]"
        >
          {expanded ? "Show less" : `Show ${extra} more`}
          <Icon name="arrow-up" className={`h-[9px] w-[9px] transition-transform duration-300 ease-move ${expanded ? "rotate-0" : "rotate-180"}`} />
        </button>
      )}
      {footer && <div className="w-full border-t border-[var(--hairline)] px-[20px] py-[10px] text-[11px] text-[var(--muted)]">{footer}</div>}
    </Panel>
  );
}

const TABLE_ROWS = 6;

export function LogPanel({
  title,
  meta,
  tabs,
  command,
  lines,
  footer,
  maxHeight,
  className = "",
}: {
  title?: ReactNode;
  meta?: ReactNode;
  tabs?: { label: string; count?: string; active?: boolean; onClick?: () => void }[];
  command?: string;
  lines: { time: string; level: string; source: string; text: string }[];
  footer?: ReactNode;
  /** Caps the visible lines (px). The list scrolls inside and follows the newest line while you're at the bottom. */
  maxHeight?: number;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [lines, activeTabKey(tabs)]);
  // The active-tab pill slides between tabs. Measured from offsets inside the tab row, so scrolling
  // the chat while it moves can't knock it off course.
  const tabRow = useRef<HTMLDivElement>(null);
  const activeTab = tabs?.findIndex((t) => t.active) ?? -1;
  const [pill, setPill] = useState<{ x: number; w: number; ready: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = tabRow.current?.querySelectorAll<HTMLElement>("[data-tab]")[activeTab];
    if (!el) return setPill(null);
    setPill((prev) => ({ x: el.offsetLeft, w: el.offsetWidth, ready: prev !== null }));
  }, [activeTab, tabs?.length]);

  return (
    <Panel className={`flex w-full flex-col overflow-hidden ${className}`}>
      {(title || meta) && (
        <div className="flex w-full flex-row items-center justify-between gap-[12px] border-b border-[var(--hairline)] p-[13px_18px]">
          <div className="flex min-w-0 flex-row items-center gap-[8px]">
            <Icon name="terminal" className="h-[13px] w-[13px] shrink-0 text-[var(--muted)]" />
            <span className="font-code truncate text-[11.5px] text-[var(--ink)]">{title}</span>
          </div>
          {meta && <div className="shrink-0">{meta}</div>}
        </div>
      )}
      {tabs && (
        <div ref={tabRow} className="relative flex w-full flex-row items-center gap-[4px] border-b border-[var(--hairline)] px-[12px] py-[8px]">
          {pill && (
            <span
              aria-hidden="true"
              className={`absolute top-[8px] bottom-[8px] left-0 rounded-full bg-[var(--soft)] ${pill.ready ? "transition-[translate,width] duration-300 ease-move" : ""}`}
              style={{ translate: `${pill.x}px 0`, width: pill.w }}
            />
          )}
          {tabs.map((t, i) => {
            const className = `relative flex flex-row items-center gap-[5px] rounded-full px-[10px] py-[4px] text-[11px] transition-colors duration-200 ease-enter ${
              t.active ? "text-[var(--ink)]" : "text-[var(--muted)]"
            }`;
            const content = (
              <>
                {t.label}
                {t.count && <span className="font-code text-[10px] text-[var(--muted)]">{t.count}</span>}
              </>
            );
            return t.onClick ? (
              <button
                key={i}
                data-tab
                type="button"
                onClick={t.onClick}
                aria-pressed={!!t.active}
                className={`${className} cursor-pointer hover:text-[var(--ink)]`}
              >
                {content}
              </button>
            ) : (
              <span key={i} data-tab className={className}>
                {content}
              </span>
            );
          })}
        </div>
      )}
      {command && <div className="w-full border-b border-[var(--hairline)] bg-[var(--canvas)] px-[18px] py-[8px] font-code text-[10.5px] text-[var(--muted)]">$ {command}</div>}
      {maxHeight ? (
        <div
          ref={scroller}
          style={{ maxHeight }}
          onScroll={(e) => {
            const el = e.currentTarget;
            following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
          className="w-full overflow-y-auto overscroll-contain [scrollbar-width:thin]"
        >
          <div key={activeTab} className="flex w-full flex-col gap-[2px] p-[8px]">
            {lines.map((l, i) => (
              <LogLine key={i} line={l} index={i} />
            ))}
          </div>
        </div>
      ) : (
        <AutoHeight>
          {/* Keyed by tab, so switching filters replays the lines in. */}
          <div key={activeTab} className="flex w-full flex-col gap-[2px] p-[8px]">
            {lines.map((l, i) => (
              <LogLine key={i} line={l} index={i} />
            ))}
          </div>
        </AutoHeight>
      )}
      {footer && <div className="w-full border-t border-[var(--hairline)] px-[18px] py-[9px] text-[11px] text-[var(--muted)]">{footer}</div>}
    </Panel>
  );
}

const activeTabKey = (tabs?: { active?: boolean }[]) => tabs?.findIndex((t) => t.active) ?? -1;

const LEVEL_STYLE: Record<string, string> = {
  ERROR: "text-[var(--danger)] bg-[color-mix(in_oklab,var(--danger)_13%,transparent)]",
  WARN: "text-[var(--accent-2)] bg-[color-mix(in_oklab,var(--accent-2)_14%,transparent)]",
};

/**
 * One log line with room to breathe: a quiet header (time · level · source) over the message.
 * Long messages show two lines until opened. Errors are marked by a thin stripe, not a fill,
 * so a run of errors stays readable instead of turning into one solid block.
 */
function LogLine({ line, index }: { line: { time: string; level: string; source: string; text: string }; index: number }) {
  const [open, setOpen] = useState(false);
  const long = line.text.length > 160 || line.text.split("\n").length > 2;
  return (
    <div
      style={rowFade(index, 25)}
      className={`relative flex w-full flex-col gap-[6px] rounded-[12px] py-[11px] pr-[14px] pl-[16px] transition-colors duration-200 ease-enter hover:bg-[color-mix(in_oklab,var(--soft)_55%,transparent)] ${ROW_FADE}`}
    >
      {line.level === "ERROR" && (
        <span aria-hidden="true" className="absolute top-[12px] bottom-[12px] left-[4px] w-[2px] rounded-full bg-[var(--danger)] opacity-70" />
      )}
      <div className="flex min-w-0 flex-row flex-wrap items-center gap-x-[10px] gap-y-[4px]">
        <span className="font-code text-[10.5px] text-[var(--muted)] tabular-nums">{line.time}</span>
        <span
          className={`font-code rounded-full px-[7px] py-[1px] text-[9.5px] font-medium tracking-[0.5px] ${
            LEVEL_STYLE[line.level] ?? "bg-[var(--soft)] text-[var(--muted)]"
          }`}
        >
          {line.level}
        </span>
        {line.source && <span className="font-code min-w-0 truncate text-[10.5px] text-[var(--muted)]">{line.source}</span>}
      </div>
      <p className={`font-code text-[11.5px] leading-[1.7] break-words whitespace-pre-wrap text-[var(--ink)] ${open || !long ? "" : "line-clamp-2"}`}>
        {line.text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-fit cursor-pointer text-[10.5px] text-[var(--muted)] transition-colors duration-200 ease-enter hover:text-[var(--ink)]"
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

export function CodePanel({
  title,
  meta,
  status,
  lines,
  footer,
}: {
  title: ReactNode;
  meta?: ReactNode;
  status?: { text: string; tone: Tone };
  lines: { n: number; text: string; tone?: "error" | "muted"; active?: boolean }[];
  footer?: ReactNode;
}) {
  return (
    <Panel className="flex w-full flex-col overflow-hidden">
      <div className="flex w-full flex-row items-center justify-between gap-[12px] border-b border-[var(--hairline)] px-[16px] py-[10px]">
        <div className="flex min-w-0 flex-row items-center gap-[8px]">
          <span className="font-code truncate text-[11.5px] text-[var(--muted)]">{title}</span>
          {meta && <span className="font-code text-[10px] text-[var(--muted)]">· {meta}</span>}
        </div>
        {status && <Tag tone={status.tone}>{status.text}</Tag>}
      </div>
      <div className="flex w-full flex-col py-[6px]">
        {lines.map((l, i) => (
          <div
            key={i}
            style={rowFade(i, 35)}
            className={`flex w-full flex-row gap-[16px] px-[16px] py-[3px] ${ROW_FADE} ${l.active ? "bg-[var(--soft)]" : ""}`}
          >
            <span className="font-code w-[30px] shrink-0 text-right text-[10.5px] leading-[1.7] text-[var(--muted)]">{l.n}</span>
            <span
              className={`font-code min-w-0 flex-1 text-[11.5px] leading-[1.7] break-words ${
                l.tone === "error" ? "text-[var(--accent-strong)]" : l.tone === "muted" ? "text-[var(--muted)]" : "text-[var(--ink)]"
              }`}
            >
              {l.text}
            </span>
          </div>
        ))}
      </div>
      {footer && <div className="w-full border-t border-[var(--hairline)] px-[16px] py-[9px] text-[11px] text-[var(--muted)]">{footer}</div>}
    </Panel>
  );
}

export function Steps({
  title,
  detail,
  progress,
  items,
  className = "",
}: {
  title?: ReactNode;
  detail?: ReactNode;
  progress?: ReactNode;
  items: { label: string; detail?: string; meta?: string; status: "pending" | "running" | "done" | "failed" }[];
  className?: string;
}) {
  // While work is still under way, finished steps fold into one line so the live step stands out.
  // When everything is done, the full list is the content and stays open.
  const [showDone, setShowDone] = useState(false);
  const firstOpen = items.findIndex((item) => item.status !== "done");
  const leadDone = firstOpen < 0 ? 0 : firstOpen;
  const foldDone = leadDone >= 2;

  const marker = (s: string) =>
    s === "done" ? (
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--accent)]">
        <Icon name="check" className="h-[10px] w-[10px] text-[var(--canvas)]" />
      </span>
    ) : s === "running" ? (
      <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--soft)]">
        <svg viewBox="0 0 18 18" className="absolute inset-0 motion-safe:animate-[spin-slow_1.1s_linear_infinite]" aria-hidden="true">
          <circle cx="9" cy="9" r="8" fill="none" stroke="var(--line)" strokeWidth="1.5" />
          <circle cx="9" cy="9" r="8" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="14 50.3" />
        </svg>
        <span className="h-[6px] w-[6px] rounded-full bg-[var(--accent)] motion-safe:animate-[dot-pulse_1.4s_ease-in-out_infinite]" />
      </span>
    ) : s === "failed" ? (
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--ink)]">
        <Icon name="minus" className="h-[9px] w-[9px] text-[var(--canvas)]" />
      </span>
    ) : (
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full [outline:1px_solid_var(--line)] [outline-offset:-1px]">
        <span className="h-[4px] w-[4px] rounded-full bg-[var(--muted)]" />
      </span>
    );
  return (
    <Panel className={`flex w-full flex-col gap-0 p-[6px] ${className}`}>
      {(title || progress) && (
        <div className="flex w-full flex-row items-center justify-between gap-[12px] px-[12px] py-[9px]">
          <div className="flex min-w-0 flex-col">
            {title && <span className="font-display text-[15px] font-semibold text-[var(--ink)]">{title}</span>}
            {detail && <span className="text-[11px] text-[var(--muted)]">{detail}</span>}
          </div>
          {progress && <span className="font-code shrink-0 text-[10.5px] text-[var(--muted)]">{progress}</span>}
        </div>
      )}
      <div className="flex w-full flex-col gap-[2px]">
        {foldDone && (
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="flex w-full cursor-pointer flex-row items-center gap-[12px] rounded-[12px] px-[12px] py-[9px] text-left transition-colors duration-200 ease-enter hover:bg-[var(--soft)]/60"
          >
            {marker("done")}
            <span className="text-[12.5px] text-[var(--ink)]">
              {leadDone} steps done
            </span>
            <Icon
              name="arrow-up"
              className={`ml-auto h-[9px] w-[9px] shrink-0 text-[var(--muted)] transition-transform duration-300 ease-move ${showDone ? "rotate-0" : "rotate-180"}`}
            />
          </button>
        )}
        {[
          foldDone ? items.slice(0, leadDone) : [],
          foldDone ? items.slice(leadDone) : items,
        ].map((group, g) => {
          const rows = group.map((item, i) => (
            <div
              key={i}
              style={rowFade(i, 45)}
              className={`flex w-full flex-row items-start gap-[12px] rounded-[12px] px-[12px] py-[9px] ${ROW_FADE} ${
                item.status === "running" ? "sheen bg-[var(--surface)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]" : ""
              }`}
            >
              {marker(item.status)}
              <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
                <div className="flex w-full flex-row items-center gap-[8px]">
                  <span className={`min-w-0 truncate text-[12.5px] ${item.status === "pending" ? "text-[var(--muted)]" : "text-[var(--ink)]"}`}>{item.label}</span>
                  {item.meta && <span className="font-code ml-auto shrink-0 text-[10px] text-[var(--muted)]">{item.meta}</span>}
                </div>
                {item.detail && <span className="text-[11px] text-[var(--muted)]">{item.detail}</span>}
              </div>
            </div>
          ));
          return g === 0 ? (
            group.length > 0 && (
              <Collapse key={g} open={showDone}>
                <div className="flex w-full flex-col gap-[2px]">{rows}</div>
              </Collapse>
            )
          ) : (
            <div key={g} className="flex w-full flex-col gap-[2px]">
              {rows}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function ListPanel({
  title,
  detail,
  items,
  footer,
  className = "",
}: {
  title?: ReactNode;
  detail?: ReactNode;
  items: { icon?: "box" | "terminal" | "server" | "cloud" | "key-round" | "scroll-text" | "circle-check" | "activity"; title: ReactNode; meta?: ReactNode; value?: ReactNode; tone?: Tone }[];
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Panel className={`flex w-full flex-col overflow-hidden ${className}`}>
      {(title || detail) && (
        <div className="flex w-full flex-col gap-[2px] border-b border-[var(--hairline)] px-[18px] py-[13px]">
          {title && <span className="font-display text-[15px] font-semibold text-[var(--ink)]">{title}</span>}
          {detail && <span className="text-[11.5px] text-[var(--muted)]">{detail}</span>}
        </div>
      )}
      <div className="flex w-full flex-col">
        {items.map((item, i) => (
          <div
            key={i}
            style={rowFade(i, 45)}
            className={`flex w-full flex-row items-center gap-[12px] border-b border-[var(--hairline)] px-[16px] py-[11px] last:border-0 ${ROW_FADE}`}
          >
            {item.icon && (
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--soft)]">
                <Icon name={item.icon} className="h-[13px] w-[13px] text-[var(--accent-strong)]" />
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
              <span className="truncate text-[12.5px] text-[var(--ink)]">{item.title}</span>
              {item.meta && <span className="font-code truncate text-[10.5px] text-[var(--muted)]">{item.meta}</span>}
            </div>
            {item.value && <span className={`font-code shrink-0 text-[11.5px] ${TONE_TEXT[item.tone ?? "muted"]}`}>{item.value}</span>}
          </div>
        ))}
      </div>
      {footer && <div className="w-full border-t border-[var(--hairline)] px-[18px] py-[9px] text-[11px] text-[var(--muted)]">{footer}</div>}
    </Panel>
  );
}

export function Timeline({
  events,
  className = "",
}: {
  events: { time: string; title: string; detail?: string; tone?: Tone; icon?: "info" | "triangle-alert" | "check" | "activity" }[];
  className?: string;
}) {
  return (
    <div className={`flex w-full flex-col ${className}`}>
      {/* The rail draws down from node to node; each node pops in as the line reaches it. */}
      {events.map((e, i) => (
        <div key={i} style={rowFade(i, 80)} className={`relative flex w-full flex-row gap-[16px] pb-[18px] pl-[30px] last:pb-0 ${ROW_FADE}`}>
          {i < events.length - 1 && (
            <span
              style={{ animationDelay: `${Math.min(i, 12) * 80 + 120}ms` }}
              className="absolute top-[24px] bottom-0 left-[11px] w-px origin-top bg-[var(--line)] motion-safe:animate-[rail-draw_0.5s_cubic-bezier(0.22,1,0.36,1)_backwards]"
              aria-hidden="true"
            />
          )}
          <span
            style={{ animationDelay: `${Math.min(i, 12) * 80}ms` }}
            className="absolute top-0 left-0 flex h-[23px] w-[23px] items-center justify-center rounded-full bg-[var(--surface)] motion-safe:animate-[pop-in_0.45s_cubic-bezier(0.22,1,0.36,1)_backwards] [outline:1px_solid_var(--line)] [outline-offset:-1px]"
          >
            <Icon
              name={e.icon ?? (e.tone === "danger" ? "triangle-alert" : e.tone === "success" ? "check" : "activity")}
              className={`h-[11px] w-[11px] ${TONE_TEXT[e.tone ?? "muted"]}`}
            />
          </span>
          <div className="flex min-w-0 flex-col gap-[2px]">
            <div className="flex flex-row items-baseline gap-[10px]">
              <span className="font-code text-[10.5px] text-[var(--muted)]">{e.time}</span>
              <span className="text-[12.5px] font-medium text-[var(--ink)]">{e.title}</span>
            </div>
            {e.detail && <span className="text-[11.5px] leading-[1.5] text-[var(--muted)]">{e.detail}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Notice({
  tone = "neutral",
  title,
  children,
  action,
  icon,
  footer,
  className = "",
}: {
  tone?: "neutral" | "success" | "warn" | "danger";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: "info" | "triangle-alert" | "check" | "eye" | "key-round";
  footer?: ReactNode;
  className?: string;
}) {
  const iconName = icon ?? (tone === "success" ? "check" : tone === "warn" || tone === "danger" ? "triangle-alert" : "info");
  return (
    <div
      className={`flex w-full flex-row items-start gap-[12px] rounded-[12px] p-[13px_15px] ${
        tone === "success" ? "bg-[var(--soft)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]" : "bg-[var(--surface)] [outline:1px_solid_var(--line)] [outline-offset:-0.5px]"
      } ${className}`}
    >
      <Icon
        name={iconName}
        className={`mt-[1px] h-[14px] w-[14px] shrink-0 ${tone === "danger" ? "text-[var(--ink)]" : "text-[var(--accent)]"}`}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        {title && <span className="text-[12.5px] font-medium text-[var(--ink)]">{title}</span>}
        {children && <span className="text-[12px] leading-[1.55] text-[var(--muted)]">{children}</span>}
        {footer && <span className="text-[11px] text-[var(--muted)]">{footer}</span>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Action({
  children,
  variant = "secondary",
  onClick,
  disabled = false,
  className = "",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "ink";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const styles =
    variant === "primary"
      ? "bg-[var(--accent)] text-[var(--canvas)] hover:bg-[var(--accent-strong)]"
      : variant === "ink"
        ? "bg-[var(--ink)] text-[var(--canvas)] hover:opacity-90"
        : variant === "ghost"
          ? "text-[var(--muted)] hover:text-[var(--ink)]"
          : "bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--soft)] [outline:1px_solid_var(--line)] [outline-offset:-0.5px]";
  const base = `flex w-fit shrink-0 flex-row items-center justify-center gap-[7px] rounded-[10px] px-[13px] py-[8px] text-[12.5px] font-medium whitespace-nowrap ${styles} ${className}`;
  // Every press sends a ring of light out of the button.
  const [pulse, setPulse] = useState(0);

  // A surface only renders a real button when it has a handler. Design-preview
  // scenes keep the visual language but are inert, visibly disabled labels.
  if (!onClick) {
    return (
      <span aria-disabled="true" title="Illustrative only · sample data" className={`${base} pointer-events-none opacity-60`}>
        {children}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setPulse((n) => n + 1);
        onClick();
      }}
      disabled={disabled}
      className={`relative ${base} cursor-pointer transition-[background-color,transform,translate,scale,opacity,box-shadow] duration-200 ease-enter active:scale-[0.97] active:duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {pulse > 0 && (
        <span
          key={pulse}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] motion-safe:animate-[pulse-ring_0.7s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:hidden"
        />
      )}
      {children}
    </button>
  );
}

/** Reassurance line under every surface; quiet until you look at the surface. */
export function SceneFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full flex-row items-center gap-[7px] text-[11px] text-[var(--muted)] opacity-60 transition-opacity duration-300 ease-enter group-hover/scene:opacity-100 group-focus-within/scene:opacity-100">
      <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--accent)]" />
      {children}
    </div>
  );
}

export function LiveMeta({ children }: { children: ReactNode }) {
  return (
    <span className="flex flex-row items-center gap-[6px] text-[11px] whitespace-nowrap text-[var(--muted)]">
      <span className="h-[6px] w-[6px] rounded-full bg-[var(--accent)] motion-safe:animate-[dot-pulse_2s_ease-in-out_infinite]" />
      {children}
    </span>
  );
}

export function KeyValue({ label, value, tone }: { label: string; value: ReactNode; tone?: Tone }) {
  return (
    <div className="flex flex-row items-baseline justify-between gap-[16px] py-[5px]">
      <span className="text-[11.5px] text-[var(--muted)]">{label}</span>
      <span className={`font-code text-[11.5px] ${TONE_TEXT[tone ?? "muted"]}`}>{value}</span>
    </div>
  );
}

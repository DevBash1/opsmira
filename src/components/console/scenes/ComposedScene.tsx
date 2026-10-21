import { Action, Bars, CodePanel, KeyValue, LogPanel, Notice, Panel, Ring, SceneFooter, SceneIntro, StackedBar, StatRow, Status, Steps, Table, type Tone } from "../SceneKit";
import { clock } from "./format";
import type { SceneProps } from "./DiagnosticScenes";

/* A view the agent composed from data it fetched. The server has already reduced it to this closed set of
 * blocks (server/src/view.js), so this only draws them. Unknown block types are skipped. */

const BADGE: Record<string, string> = { success: "Good", warn: "Check", danger: "Problem" };
const mono = "font-code text-[11.5px]";

function Block({ block }: { block: Record<string, any> }) {
  switch (block.type) {
    case "stats":
      return (
        <StatRow
          items={block.items.map((i: any) => ({
            label: i.label,
            value: i.value,
            note: i.note || undefined,
            badge: i.tone && BADGE[i.tone] ? <Status tone={i.tone as Tone}>{BADGE[i.tone]}</Status> : undefined,
          }))}
        />
      );
    case "table":
      return (
        <Table
          title={block.title || undefined}
          detail={block.detail || undefined}
          minWidth={block.columns.length > 4 ? "min-w-[640px]" : "min-w-[420px]"}
          columns={block.columns.map((label: string) => ({ label: label.toUpperCase() }))}
          rows={block.rows.map((row: any[]) =>
            row.map((c) =>
              c.tone ? (
                <Status tone={c.tone as Tone}>{c.text}</Status>
              ) : (
                <span className={`${mono} block max-w-[280px] truncate text-[var(--ink)]`} title={c.text}>
                  {c.text}
                </span>
              ),
            ),
          )}
          footer={block.total > block.rows.length ? `Showing ${block.rows.length} of ${block.total}.` : undefined}
        />
      );
    case "bars":
      return (
        <Panel className="flex flex-col gap-[14px] p-[22px_24px_18px_24px]">
          {block.title && <span className="text-[12px] text-[var(--muted)]">{block.title}</span>}
          <Bars values={block.values} latest={block.latest ?? block.values.length - 1} height={120} labels={block.labels} />
        </Panel>
      );
    case "ring":
      return <Ring percent={block.percent} label={block.label || undefined} sub={block.sub || undefined} />;
    case "stacked":
      return (
        <Panel className="p-[20px_24px]">
          <StackedBar title={block.title || undefined} segments={block.segments} />
        </Panel>
      );
    case "logs":
      return <LogPanel title={block.title || undefined} lines={block.lines} maxHeight={340} footer={`${block.lines.length} lines, newest at the bottom.`} />;
    case "keyvalues":
      return (
        <Panel className="flex flex-col gap-[6px] p-[16px_20px]">
          {block.title && <span className="font-code text-[10px] tracking-[1.1px] text-[var(--muted)]">{String(block.title).toUpperCase()}</span>}
          <div className="divide-y divide-[var(--line)]">
            {block.items.map((i: any, n: number) => (
              <KeyValue key={n} label={i.label} value={i.value} tone={i.tone as Tone | undefined} />
            ))}
          </div>
        </Panel>
      );
    case "notice":
      return (
        <Notice tone={block.tone} title={block.title || undefined} icon={block.tone === "danger" || block.tone === "warn" ? "triangle-alert" : "info"}>
          {block.text}
        </Notice>
      );
    case "code":
      return <CodePanel title={block.title || "Output"} lines={block.lines.map((text: string, i: number) => ({ n: i + 1, text }))} />;
    case "steps":
      return <Steps title={block.title || undefined} items={block.items} />;
    default:
      return null;
  }
}

export function ComposedScene({ data, onAsk }: SceneProps) {
  const d = data ?? {};
  const blocks: Record<string, any>[] = Array.isArray(d.blocks) ? d.blocks : [];
  const actions: { label: string; ask: string }[] = Array.isArray(d.actions) ? d.actions : [];
  return (
    <div className="flex w-full flex-col gap-[22px]">
      <SceneIntro eyebrow={d.eyebrow || "Read from the server"} title={d.title ?? ""} summary={d.summary ?? ""} icon={d.icon ?? "activity"} />
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
      <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[12px]">
        <SceneFooter>
          {d.source ? `From ${d.source}` : "From the server"}
          {d.at ? ` · ${clock(d.at)}` : ""} · a snapshot, ask for an update to refresh it
        </SceneFooter>
        {onAsk && (
          <div className="flex flex-row flex-wrap items-center gap-[8px]">
            {actions.map((a, i) => (
              <Action key={i} variant="ghost" onClick={() => onAsk(a.ask)}>
                {a.label}
              </Action>
            ))}
            <Action variant="ghost" onClick={() => onAsk(`Update the "${d.title}" view with fresh data.`)}>
              Update
            </Action>
          </div>
        )}
      </div>
    </div>
  );
}

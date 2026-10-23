import { useCallback, useEffect, useState } from "react";
import { api, type TaskInfo } from "../../lib/console-api";
import { WhereChip } from "./WhereChip";

function ago(iso?: string) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

const until = (ms?: number) => {
  if (!ms) return "";
  const m = Math.max(1, Math.round((ms - Date.now()) / 60_000));
  return m < 60 ? `in ${m}m` : m < 1440 ? `in ${Math.round(m / 60)}h` : `in ${Math.round(m / 1440)}d`;
};

const small = "cursor-pointer rounded-[7px] px-[7px] py-[2px] text-[10.5px] text-[var(--muted)] transition-colors duration-150 hover:bg-[var(--soft)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-50";

/** Tasks the agent runs on its own: a schedule or a trigger. Each one keeps its work in a chat of its own. */
export function TasksPanel({ onOpenChat, onChange }: { onOpenChat: (conversationId: string) => void; onChange?: (tasks: TaskInfo[]) => void }) {
  const [tasks, setTasks] = useState<TaskInfo[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .tasks()
      .then((r) => {
        setTasks(r.tasks);
        onChange?.(r.tasks);
      })
      .catch(() => setTasks((t) => t ?? []));
  }, [onChange]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 5000);
    return () => window.clearInterval(t);
  }, [load]);

  const act = (run: Promise<unknown>) => run.catch(() => {}).finally(load);

  return (
    <div className="flex max-h-[min(70vh,520px)] flex-col overflow-y-auto p-[8px]">
      <div className="flex flex-row items-baseline justify-between gap-[10px] px-[10px] pt-[4px] pb-[6px]">
        <span className="text-[12px] font-medium text-[var(--ink)]">Tasks</span>
        <span className="text-[10.5px] text-[var(--muted)]">The agent wakes on its own</span>
      </div>
      {tasks === null && <div className="p-[10px] text-[12px] text-[var(--muted)]">Loading…</div>}
      {tasks?.length === 0 && (
        <div className="p-[10px] text-[12px]/[18px] text-[var(--muted)]">
          Nothing yet. Ask for one in chat, like “check disk space every morning” or “tell me if nginx stops”.
        </div>
      )}
      {tasks?.map((t) => (
        <div key={t.id} className="flex flex-col gap-[4px] rounded-[10px] p-[8px_8px_8px_10px] transition-colors duration-150 ease-enter hover:bg-[var(--soft)]">
          <div className="flex flex-row items-center gap-[7px]">
            <span
              title={t.running ? "Running now" : t.enabled ? "On" : "Paused"}
              className={`h-[6px] w-[6px] shrink-0 rounded-full ${t.running ? "bg-[var(--accent-2)] motion-safe:animate-pulse" : t.enabled ? "bg-[var(--accent)]" : "bg-[var(--line)]"}`}
            />
            <button type="button" onClick={() => onOpenChat(t.conversationId)} title="Open its chat" className="min-w-0 flex-1 cursor-pointer truncate text-left text-[12.5px] font-medium text-[var(--ink)]">
              {t.name}
            </button>
            <WhereChip server={t.server} />
            {t.waiting > 0 && (
              <button type="button" onClick={() => onOpenChat(t.conversationId)} className="shrink-0 cursor-pointer rounded-full bg-[var(--accent)] px-[7px] py-[1px] text-[10px] font-medium text-[var(--surface)]">
                {t.waiting} waiting
              </button>
            )}
          </div>
          <div className="font-code truncate text-[10.5px] text-[var(--muted)]" title={t.when}>
            {t.when}
          </div>
          {(t.lastError || t.lastResult) && (
            <div className={`text-[11.5px]/[16px] ${t.lastError ? "text-[var(--danger)]" : "text-[var(--muted)]"} line-clamp-2`}>{t.lastError ? t.lastError : t.lastResult}</div>
          )}
          <div className="flex flex-row flex-wrap items-center gap-[2px] text-[10.5px] text-[var(--muted)]">
            <span className="px-[7px]">
              {t.runs ? `ran ${ago(t.lastRunAt)}` : "not run yet"}
              {t.nextRunAt && t.enabled ? ` · next ${until(t.nextRunAt)}` : ""}
            </span>
            <button
              type="button"
              disabled={t.running}
              onClick={() => act(api.runTask(t.id))}
              className={small}
            >
              Run now
            </button>
            <button type="button" onClick={() => act(api.updateTask(t.id, { enabled: !t.enabled }))} className={small}>
              {t.enabled ? "Pause" : "Resume"}
            </button>
            <button
              type="button"
              onClick={() => act(api.updateTask(t.id, { fullAccess: !t.fullAccess }))}
              title={t.fullAccess ? "It runs commands without asking. Click to make it ask first." : "It asks before any change. Click to let it run commands without asking."}
              className={`${small} ${t.fullAccess ? "text-[var(--danger)]" : ""}`}
            >
              {t.fullAccess ? "Acts without asking" : "Asks first"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm !== t.id) {
                  setConfirm(t.id);
                  window.setTimeout(() => setConfirm((c) => (c === t.id ? null : c)), 4000);
                  return;
                }
                setConfirm(null);
                act(api.removeTask(t.id));
              }}
              className={`${small} ml-auto ${confirm === t.id ? "text-[var(--danger)]" : ""}`}
            >
              {confirm === t.id ? "Remove?" : "Remove"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

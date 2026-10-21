import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../Icons";
import { api, type AgentInfo } from "../../lib/console-api";

/**
 * Servers that connect themselves: a one-time command to run on the server, and the list of servers that
 * have connected. Shown in the Surfaces menu next to the SSH server field.
 */
export function ConnectServer({ onPick }: { onPick: (host: string) => void }) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [made, setMade] = useState<{ command: string; manual: string; expiresAt: number } | null>(null);
  const [once, setOnce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const baseline = useRef<Set<string> | null>(null);
  const [joined, setJoined] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .agents()
      .then((r) => {
        setAgents(r.agents);
        // A server that shows up while its command is on screen has just connected.
        const fresh = baseline.current && r.agents.find((a) => a.online && !baseline.current!.has(a.id));
        if (fresh) setJoined(fresh.name);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 3000);
    return () => window.clearInterval(t);
  }, [load]);

  const create = async () => {
    setBusy(true);
    setError(null);
    setJoined(null);
    setOnce(false);
    baseline.current = new Set(agents.map((a) => a.id));
    try {
      setMade(await api.agentToken());
    } catch {
      setError("Couldn't create a command. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (!made) return;
    navigator.clipboard?.writeText(once ? made.manual : made.command).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const remove = async (id: string) => {
    if (confirm !== id) {
      setConfirm(id);
      window.setTimeout(() => setConfirm((c) => (c === id ? null : c)), 4000);
      return;
    }
    setConfirm(null);
    await api.removeAgent(id).catch(() => {});
    load();
  };

  return (
    <div className="flex flex-col gap-[8px] px-[8px] pb-[6px]">
      {agents.length > 0 && (
        <div className="flex flex-col gap-[2px]">
          <span className="text-[10.5px] text-[var(--muted)]">Connected servers</span>
          {agents.map((a) => (
            <div key={a.id} className="group/agent flex flex-row items-center gap-[9px] rounded-[9px] px-[8px] py-[5px] hover:bg-[var(--soft)]">
              <span
                title={a.online ? "Connected" : "Not connected"}
                className={`h-[6px] w-[6px] shrink-0 rounded-full ${a.online ? "bg-[var(--accent)] [box-shadow:0px_0px_6px_var(--glow)]" : "bg-[var(--line)]"}`}
              />
              <button
                type="button"
                onClick={() => onPick(a.host)}
                title={`Read ${a.name} in the surfaces`}
                className="font-code min-w-0 flex-1 cursor-pointer truncate text-left text-[11.5px] text-[var(--ink)]"
              >
                {a.name}
                <span className="font-sans text-[10.5px] text-[var(--muted)]">
                  {a.hostname && a.hostname !== a.name ? ` · ${a.hostname}` : ""}
                  {a.access === "full" ? " · full access" : ""}
                  {a.online ? "" : " · offline"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => remove(a.id)}
                className={`shrink-0 cursor-pointer rounded-[6px] px-[6px] py-[1px] text-[10.5px] transition-colors duration-150 ${confirm === a.id ? "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)]" : "text-[var(--muted)] opacity-0 group-hover/agent:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"}`}
              >
                {confirm === a.id ? "Remove?" : "Remove"}
              </button>
            </div>
          ))}
        </div>
      )}

      {!made ? (
        <div className="flex flex-row items-center gap-[10px]">
          <button
            type="button"
            onClick={create}
            disabled={busy}
            className="flex cursor-pointer flex-row items-center gap-[6px] rounded-[9px] bg-[var(--soft)] px-[10px] py-[5px] text-[11.5px] text-[var(--ink)] transition-[background-color,transform,scale] duration-200 ease-enter hover:bg-[color-mix(in_oklab,var(--accent)_16%,var(--soft))] active:scale-[0.97] disabled:opacity-60"
          >
            <Icon name="plus" className="h-[11px] w-[11px]" />
            Connect a server
          </button>
          <span className="text-[10.5px] text-[var(--muted)]">No SSH needed. The server connects out to this console.</span>
        </div>
      ) : (
        <div className="flex flex-col gap-[7px] rounded-[12px] bg-[var(--canvas)] p-[10px] [outline:1px_solid_var(--line)]">
          {joined ? (
            <div className="flex flex-row items-center gap-[7px] text-[11.5px] text-[var(--accent-strong)]">
              <Icon name="circle-check" className="h-[13px] w-[13px]" />
              {joined} connected. Pick it above to read it.
            </div>
          ) : (
            <>
              <span className="text-[11px] text-[var(--muted)]">
                {once ? "Run this on the server (needs Node 22+). It stays connected while it runs." : "Run this on the server as root (needs Node 22+). It installs a service that stays connected."} It works once and expires in an hour.
              </span>
              <div className="flex flex-row items-start gap-[8px]">
                <code className="font-code max-h-[84px] min-w-0 flex-1 overflow-auto rounded-[8px] bg-[var(--surface)] p-[8px] text-[10.5px] leading-[1.55] break-all text-[var(--ink)]">
                  {once ? made.manual : made.command}
                </code>
                <button
                  type="button"
                  onClick={copy}
                  className="flex shrink-0 cursor-pointer flex-row items-center gap-[5px] rounded-[8px] bg-[var(--soft)] px-[9px] py-[6px] text-[11px] text-[var(--ink)] transition-transform duration-150 active:scale-[0.96]"
                >
                  <Icon name={copied ? "check" : "copy"} className="h-[11px] w-[11px]" />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <span className="text-[10.5px] text-[var(--muted)]">
                Read-only by default: surfaces work, nothing is changed on that server. Add <span className="font-code">--access operate</span> so the agent can run commands you approve. Waiting for it to connect...
              </span>
              <button type="button" onClick={() => setOnce((v) => !v)} className="w-fit cursor-pointer text-[10.5px] text-[var(--muted)] underline-offset-2 hover:underline">
                {once ? "Install it as a service instead" : "Just run it once, without installing"}
              </button>
            </>
          )}
          <button type="button" onClick={() => {
              setMade(null);
              baseline.current = null;
            }} className="w-fit cursor-pointer text-[10.5px] text-[var(--muted)] underline-offset-2 hover:underline">
            Done
          </button>
        </div>
      )}
      {error && <span className="text-[10.5px] text-[var(--danger)]">{error}</span>}
    </div>
  );
}

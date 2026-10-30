import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../Icons";
import { api, type AgentInfo, type JoinRequest } from "../../lib/console-api";

/**
 * Servers that connect themselves: a one-time command to run on the server, the servers asking to join (they
 * connected without a usable token), and the list of servers that have connected. Shown in the Surfaces menu
 * next to the SSH server field.
 */
type Target = "linux" | "windows" | "hosted";

const TARGETS: { id: Target; label: string }[] = [
  { id: "linux", label: "Linux / Mac" },
  { id: "windows", label: "Windows" },
  { id: "hosted", label: "Hosted app" },
];

function Joined({ name }: { name: string }) {
  return (
    <div className="flex flex-row items-center gap-[7px] text-[11.5px] text-[var(--accent-strong)]">
      <Icon name="circle-check" className="h-[13px] w-[13px]" />
      {name} connected.
    </div>
  );
}

function CodeLine({ text, copied, onCopy }: { text: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex flex-row items-start gap-[8px]">
      <code className="font-code max-h-[84px] min-w-0 flex-1 overflow-auto rounded-[8px] bg-[var(--surface)] p-[8px] text-[10.5px] leading-[1.55] break-all text-[var(--ink)]">{text}</code>
      <button
        type="button"
        onClick={onCopy}
        className="flex shrink-0 cursor-pointer flex-row items-center gap-[5px] rounded-[8px] bg-[var(--soft)] px-[9px] py-[6px] text-[11px] text-[var(--ink)] transition-transform duration-150 active:scale-[0.96]"
      >
        <Icon name={copied ? "check" : "copy"} className="h-[11px] w-[11px]" />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" className="flex flex-row gap-[4px] rounded-[10px] bg-[var(--soft)] p-[3px]">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 cursor-pointer rounded-[8px] px-[8px] py-[4px] text-[11px] transition-colors duration-150 ${
            value === o.id ? "bg-[var(--surface)] font-medium text-[var(--ink)] [box-shadow:0px_1px_3px_var(--shadow)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ConnectServer({ onPick }: { onPick: (host: string) => void }) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [answering, setAnswering] = useState<string | null>(null);
  const [made, setMade] = useState<{ command: string; manual: string } | null>(null);
  const [once, setOnce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const baseline = useRef<Set<string> | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  // Before a command is shown: what kind of machine, and what the console may do on it.
  const [configuring, setConfiguring] = useState(false);
  const [target, setTarget] = useState<Target>("linux");
  const [access, setAccess] = useState<"read-only" | "operate">("read-only");
  const [appName, setAppName] = useState("");
  const [hosted, setHosted] = useState<{ name: string; command: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState("");

  const load = useCallback(() => {
    api
      .agents()
      .then((r) => {
        setAgents(r.agents);
        setRequests(r.requests ?? []);
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
      if (target === "hosted") setHosted(await api.agentCredential({ name: appName.trim(), access }));
      else setMade(await api.agentToken({ os: target, access }));
      setConfiguring(false);
    } catch {
      setError("Couldn't create a command. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (!made) return;
    copyText(once ? made.manual : made.command, "main");
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedKey(key);
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
      setCopiedKey("");
    }, 1600);
  };

  const finish = () => {
    setMade(null);
    setHosted(null);
    setConfiguring(false);
    baseline.current = null;
  };

  // Declining removes the agent from that server, so it asks twice, like Remove.
  const answerJoin = async (id: string, answer: "accept" | "decline") => {
    if (answer === "decline" && confirm !== `decline:${id}`) {
      setConfirm(`decline:${id}`);
      window.setTimeout(() => setConfirm((c) => (c === `decline:${id}` ? null : c)), 4000);
      return;
    }
    setConfirm(null);
    setAnswering(id);
    await api.answerJoin(id, answer).catch(() => setError("Couldn't answer that request. Try again."));
    setAnswering(null);
    load();
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
      {requests.length > 0 && (
        <div className="flex flex-col gap-[4px] rounded-[12px] bg-[color-mix(in_oklab,var(--accent)_7%,var(--canvas))] p-[8px] [outline:1px_solid_color-mix(in_oklab,var(--accent)_30%,var(--line))]">
          <span className="text-[10.5px] text-[var(--muted)]">Asking to join · accept to connect it, decline and it uninstalls itself</span>
          {requests.map((r) => (
            <div key={r.id} className="flex flex-row flex-wrap items-center gap-x-[9px] gap-y-[4px] rounded-[9px] px-[6px] py-[4px]">
              <span
                title={r.online ? "Connected and waiting" : "Not connected now; it gets the answer when it comes back"}
                className={`h-[6px] w-[6px] shrink-0 rounded-full ${r.online ? "bg-[var(--accent)] motion-safe:animate-pulse" : "bg-[var(--line)]"}`}
              />
              <span className="min-w-0 flex-1">
                <span className="font-code block truncate text-[11.5px] text-[var(--ink)]">{r.name}</span>
                <span className="block truncate text-[10.5px] text-[var(--muted)]" title={r.platform ?? undefined}>
                  {[
                    r.hostname && r.hostname !== r.name ? r.hostname : null,
                    r.ip,
                    r.access === "operate" ? "wants to run commands" : "read-only",
                    r.oldToken ? "came with a used token" : "no token",
                    `asked ${new Date(r.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="flex shrink-0 flex-row items-center gap-[6px]">
                <button
                  type="button"
                  disabled={answering === r.id}
                  onClick={() => answerJoin(r.id, "accept")}
                  className="cursor-pointer rounded-[8px] bg-[var(--accent)] px-[9px] py-[3px] text-[11px] font-medium text-[var(--surface)] transition-transform duration-150 active:scale-[0.96] disabled:opacity-60"
                >
                  Accept
                </button>
                <button
                  type="button"
                  disabled={answering === r.id}
                  onClick={() => answerJoin(r.id, "decline")}
                  className={`cursor-pointer rounded-[8px] px-[9px] py-[3px] text-[11px] transition-colors duration-150 disabled:opacity-60 ${confirm === `decline:${r.id}` ? "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)]" : "bg-[var(--soft)] text-[var(--ink)]"}`}
                >
                  {confirm === `decline:${r.id}` ? "Decline and uninstall?" : "Decline"}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
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
                  {a.access === "operate" || a.access === "full" ? " · can run commands" : " · read-only"}
                  {a.online ? "" : " · offline"}
                  {a.online && a.current === false ? " · updating" : ""}
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

      {!made && !hosted && !configuring ? (
        <button
          type="button"
          onClick={() => setConfiguring(true)}
          className="flex w-fit cursor-pointer flex-row items-center gap-[6px] rounded-[9px] bg-[var(--soft)] px-[10px] py-[5px] text-[11.5px] text-[var(--ink)] transition-[background-color,transform,scale] duration-200 ease-enter hover:bg-[color-mix(in_oklab,var(--accent)_16%,var(--soft))] active:scale-[0.97]"
        >
          <Icon name="plus" className="h-[11px] w-[11px]" />
          Connect a server
        </button>
      ) : configuring ? (
        <div className="flex flex-col gap-[8px] rounded-[12px] bg-[var(--canvas)] p-[10px] [outline:1px_solid_var(--line)]">
          <Choice value={target} options={TARGETS} onChange={setTarget} />
          {target === "hosted" && (
            <input
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              maxLength={40}
              placeholder="App name, e.g. my-api"
              aria-label="Name of the app"
              className="font-code rounded-[8px] bg-[var(--surface)] px-[8px] py-[5px] text-[11px] text-[var(--ink)] outline-none placeholder:text-[var(--muted)] [outline:1px_solid_var(--line)] focus:[outline-color:var(--accent)]"
            />
          )}
          <Choice
            value={access}
            options={[
              { id: "read-only", label: "Read only" },
              { id: "operate", label: "Run commands" },
            ]}
            onChange={setAccess}
          />
          <span className="text-[10.5px] text-[var(--muted)]">{access === "operate" ? "You approve each change." : "Surfaces only. Nothing is changed."}</span>
          <div className="flex flex-row items-center gap-[12px]">
            <button
              type="button"
              onClick={create}
              disabled={busy}
              className="cursor-pointer rounded-[9px] bg-[var(--accent)] px-[12px] py-[5px] text-[11.5px] font-medium text-[var(--surface)] transition-transform duration-150 active:scale-[0.97] disabled:opacity-60"
            >
              Show command
            </button>
            <button type="button" onClick={finish} className="cursor-pointer text-[10.5px] text-[var(--muted)] underline-offset-2 hover:underline">
              Cancel
            </button>
          </div>
        </div>
      ) : hosted ? (
        <div className="flex flex-col gap-[8px] rounded-[12px] bg-[var(--canvas)] p-[10px] [outline:1px_solid_var(--line)]">
          {joined ? (
            <Joined name={joined} />
          ) : (
            <>
              <span className="text-[10.5px] text-[var(--muted)]">
                Use this as the app's start command, with yours in the quotes (e.g. <span className="font-code">npm start</span>). It reconnects as {hosted.name} on every deploy.
              </span>
              <CodeLine text={hosted.command} copied={copied && copiedKey === "app"} onCopy={() => copyText(hosted.command, "app")} />
              <span className="text-[10.5px] text-[var(--muted)]">Waiting to connect…</span>
            </>
          )}
          <button type="button" onClick={finish} className="w-fit cursor-pointer text-[10.5px] text-[var(--muted)] underline-offset-2 hover:underline">
            Done
          </button>
        </div>
      ) : made ? (
        <div className="flex flex-col gap-[7px] rounded-[12px] bg-[var(--canvas)] p-[10px] [outline:1px_solid_var(--line)]">
          {joined ? (
            <Joined name={joined} />
          ) : (
            <>
              <span className="text-[10.5px] text-[var(--muted)]">
                {once ? "Run on the machine (Node 22+)." : target === "windows" ? "Run in an administrator PowerShell." : "Run on the server as root."} Works once and does not expire. Run again, it asks to join here instead.
              </span>
              <CodeLine text={once ? made.manual : made.command} copied={copied && copiedKey === "main"} onCopy={copy} />
              <div className="flex flex-row items-center gap-[12px] text-[10.5px] text-[var(--muted)]">
                <span>Waiting to connect…</span>
                <button type="button" onClick={() => setOnce((v) => !v)} className="cursor-pointer underline-offset-2 hover:underline">
                  {once ? "Install as a service" : "Run once instead"}
                </button>
              </div>
            </>
          )}
          <button type="button" onClick={finish} className="w-fit cursor-pointer text-[10.5px] text-[var(--muted)] underline-offset-2 hover:underline">
            Done
          </button>
        </div>
      ) : null}
      {error && <span className="text-[10.5px] text-[var(--danger)]">{error}</span>}
    </div>
  );
}

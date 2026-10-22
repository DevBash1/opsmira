import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../Icons";
import { api, type AgentInfo } from "../../lib/console-api";

/**
 * Servers that connect themselves: a one-time command to run on the server, and the list of servers that
 * have connected. Shown in the Surfaces menu next to the SSH server field.
 */
type Target = "linux" | "windows" | "hosted";

const TARGETS: { id: Target; label: string; note: string }[] = [
  { id: "linux", label: "Linux or Mac", note: "A server or computer you can run a command on." },
  { id: "windows", label: "Windows", note: "Runs PowerShell commands. Linux-style surfaces are not read there." },
  { id: "hosted", label: "Hosted app", note: "A project on a hosting platform (no systemd): the app runs under the agent so you can read its logs." },
];

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
  const [made, setMade] = useState<{ command: string; manual: string; expiresAt: number } | null>(null);
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
  const [hosted, setHosted] = useState<{ name: string; env: string; build: string; start: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState("");

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
                  {a.access === "operate" || a.access === "full" ? " · can run commands" : " · read-only"}
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

      {!made && !hosted && !configuring ? (
        <div className="flex flex-row items-center gap-[10px]">
          <button
            type="button"
            onClick={() => setConfiguring(true)}
            className="flex cursor-pointer flex-row items-center gap-[6px] rounded-[9px] bg-[var(--soft)] px-[10px] py-[5px] text-[11.5px] text-[var(--ink)] transition-[background-color,transform,scale] duration-200 ease-enter hover:bg-[color-mix(in_oklab,var(--accent)_16%,var(--soft))] active:scale-[0.97]"
          >
            <Icon name="plus" className="h-[11px] w-[11px]" />
            Connect a server
          </button>
          <span className="text-[10.5px] text-[var(--muted)]">No SSH needed. The server connects out to this console.</span>
        </div>
      ) : configuring ? (
        <div className="flex flex-col gap-[9px] rounded-[12px] bg-[var(--canvas)] p-[10px] [outline:1px_solid_var(--line)]">
          <span className="text-[10.5px] text-[var(--muted)]">What are you connecting?</span>
          <Choice value={target} options={TARGETS} onChange={setTarget} />
          <span className="text-[10.5px] leading-[1.5] text-[var(--muted)]">{TARGETS.find((t) => t.id === target)?.note}</span>
          {target === "hosted" && (
            <input
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              maxLength={40}
              placeholder="Name it, e.g. my-api"
              aria-label="Name of the app"
              className="font-code rounded-[8px] bg-[var(--surface)] px-[8px] py-[5px] text-[11px] text-[var(--ink)] outline-none placeholder:text-[var(--muted)] [outline:1px_solid_var(--line)] focus:[outline-color:var(--accent)]"
            />
          )}
          <span className="text-[10.5px] text-[var(--muted)]">What may the console do there?</span>
          <Choice
            value={access}
            options={[
              { id: "read-only", label: "Read only" },
              { id: "operate", label: "Run commands" },
            ]}
            onChange={setAccess}
          />
          <span className="text-[10.5px] leading-[1.5] text-[var(--muted)]">
            {access === "operate"
              ? "The agent can run commands as its own user, and you can approve changes from the console. You can switch later by running the command again."
              : "Surfaces only: nothing is changed there. Good for looking around."}
            {target === "windows" && access === "read-only" ? " On Windows, read only is very limited." : ""}
          </span>
          <div className="flex flex-row items-center gap-[12px]">
            <button
              type="button"
              onClick={create}
              disabled={busy}
              className="cursor-pointer rounded-[9px] bg-[var(--accent)] px-[12px] py-[5px] text-[11.5px] font-medium text-[var(--surface)] transition-transform duration-150 active:scale-[0.97] disabled:opacity-60"
            >
              Show the command
            </button>
            <button type="button" onClick={finish} className="cursor-pointer text-[10.5px] text-[var(--muted)] underline-offset-2 hover:underline">
              Cancel
            </button>
          </div>
        </div>
      ) : hosted ? (
        <div className="flex flex-col gap-[8px] rounded-[12px] bg-[var(--canvas)] p-[10px] [outline:1px_solid_var(--line)]">
          {joined ? (
            <div className="flex flex-row items-center gap-[7px] text-[11.5px] text-[var(--accent-strong)]">
              <Icon name="circle-check" className="h-[13px] w-[13px]" />
              {joined} connected. Pick it in the composer to work on it.
            </div>
          ) : (
            <>
              <span className="text-[11px] leading-[1.5] text-[var(--muted)]">
                In your hosting platform, add this environment variable, shown once. It stays the same across deploys, so the app reconnects as <span className="font-code">{hosted.name}</span> every time.
              </span>
              {[
                { key: "env", label: "Environment variable", text: hosted.env },
                { key: "build", label: "Add to your build step", text: hosted.build },
                { key: "start", label: "Replace your start command with", text: hosted.start },
              ].map((row) => (
                <div key={row.key} className="flex flex-col gap-[3px]">
                  <span className="text-[10.5px] text-[var(--muted)]">{row.label}</span>
                  <div className="flex flex-row items-start gap-[8px]">
                    <code className="font-code max-h-[84px] min-w-0 flex-1 overflow-auto rounded-[8px] bg-[var(--surface)] p-[8px] text-[10.5px] leading-[1.55] break-all text-[var(--ink)]">{row.text}</code>
                    <button
                      type="button"
                      onClick={() => copyText(row.text, row.key)}
                      className="flex shrink-0 cursor-pointer flex-row items-center gap-[5px] rounded-[8px] bg-[var(--soft)] px-[9px] py-[6px] text-[11px] text-[var(--ink)] transition-transform duration-150 active:scale-[0.96]"
                    >
                      <Icon name={copied && copiedKey === row.key ? "check" : "copy"} className="h-[11px] w-[11px]" />
                      {copied && copiedKey === row.key ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              ))}
              <span className="text-[10.5px] leading-[1.5] text-[var(--muted)]">
                Replace <span className="font-code">&lt;your start command&gt;</span> with what you run now (for example <span className="font-code">npm start</span>). Your app runs under the agent: its output reaches the platform's logs as before, and the console can read it. If the agent cannot connect, the app still starts. Waiting for it to connect...
              </span>
            </>
          )}
          <button type="button" onClick={finish} className="w-fit cursor-pointer text-[10.5px] text-[var(--muted)] underline-offset-2 hover:underline">
            Done
          </button>
        </div>
      ) : made ? (
        <div className="flex flex-col gap-[7px] rounded-[12px] bg-[var(--canvas)] p-[10px] [outline:1px_solid_var(--line)]">
          {joined ? (
            <div className="flex flex-row items-center gap-[7px] text-[11.5px] text-[var(--accent-strong)]">
              <Icon name="circle-check" className="h-[13px] w-[13px]" />
              {joined} connected. Pick it above to read it.
            </div>
          ) : (
            <>
              <span className="text-[11px] text-[var(--muted)]">
                {once
                  ? "Run this on the machine (needs Node 22+). It stays connected while it runs."
                  : target === "windows"
                    ? "Run this in a PowerShell opened as administrator. It adds a scheduled task that stays connected, and downloads Node 22 for the agent only if the machine has none."
                    : "Run this on the server as root. It installs a service that stays connected, and downloads Node 22 for the agent only if the server has none."}{" "}
                It works once and expires in an hour.
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
                {access === "operate" ? "Commands allowed: the console runs them as the agent's user, and asks you before any change." : "Read only: nothing is changed on that machine. Run this again with commands allowed to change that."} Waiting for it to connect...
              </span>
              <button type="button" onClick={() => setOnce((v) => !v)} className="w-fit cursor-pointer text-[10.5px] text-[var(--muted)] underline-offset-2 hover:underline">
                {once ? "Install it as a service instead" : "Just run it once, without installing"}
              </button>
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

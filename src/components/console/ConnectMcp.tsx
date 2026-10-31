import { useCallback, useEffect, useState } from "react";
import { Icon } from "../Icons";
import { api, type McpToken } from "../../lib/console-api";
import { Choice, CodeLine } from "./ConnectServer";

/**
 * Other AI agents (Claude Code, Cursor, an agent of your own) connecting to this console over MCP: the tokens they
 * use, and making one with ready-made settings for the common clients. Shown in the Surfaces menu.
 */
type Made = McpToken & { token: string; url: string; clients: { claudeCode: string; json: string } };

const ACCESS: { id: "ask" | "full"; label: string }[] = [
  { id: "ask", label: "Ask first" },
  { id: "full", label: "Full access" },
];

export function ConnectMcp() {
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [configuring, setConfiguring] = useState(false);
  const [name, setName] = useState("");
  const [access, setAccess] = useState<"ask" | "full">("ask");
  const [made, setMade] = useState<Made | null>(null);
  const [client, setClient] = useState<"claudeCode" | "json">("claudeCode");
  const [copied, setCopied] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Claude on the web, Desktop and mobile take only a URL and sign in here (OAuth); no token to paste.
  const mcpUrl = `${window.location.origin}/mcp`;

  const load = useCallback(() => {
    api
      .mcpTokens()
      .then((r) => setTokens(r.tokens))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  const create = async () => {
    setError(null);
    try {
      setMade(await api.createMcpToken({ name: name.trim() || "MCP client", access }));
      setConfiguring(false);
      load();
    } catch {
      setError("Couldn't make a token. Try again.");
    }
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1600);
  };

  const revoke = async (id: string) => {
    if (confirm !== id) {
      setConfirm(id);
      window.setTimeout(() => setConfirm((c) => (c === id ? null : c)), 4000);
      return;
    }
    setConfirm(null);
    await api.revokeMcpToken(id).catch(() => {});
    load();
  };

  const finish = () => {
    setMade(null);
    setConfiguring(false);
    setName("");
  };

  return (
    <div className="flex flex-col gap-[8px] px-[8px] pb-[6px]">
      {tokens.length > 0 && (
        <div className="flex flex-col gap-[2px]">
          <span className="text-[10.5px] text-[var(--muted)]">AI agents (MCP)</span>
          {tokens.map((t) => (
            <div key={t.id} className="group/mcp flex flex-row items-center gap-[9px] rounded-[9px] px-[8px] py-[5px] hover:bg-[var(--soft)]">
              <Icon name="sparkles" className="h-[11px] w-[11px] shrink-0 text-[var(--muted)]" />
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--ink)]">
                {t.name}
                <span className="text-[10.5px] text-[var(--muted)]">
                  {t.kind === "oauth" ? ` · signed in from ${t.redirectHost?.startsWith("localhost") || t.redirectHost?.startsWith("127.0.0.1") ? "this computer's app" : t.redirectHost}` : ""}
                  {t.access === "full" ? " · full access" : " · ask first"}
                  {t.lastUsedAt ? ` · used ${new Date(t.lastUsedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : " · not used yet"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => revoke(t.id)}
                className={`shrink-0 cursor-pointer rounded-[6px] px-[6px] py-[1px] text-[10.5px] transition-colors duration-150 ${confirm === t.id ? "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)]" : "text-[var(--muted)] opacity-0 group-hover/mcp:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"}`}
              >
                {confirm === t.id ? "Revoke?" : "Revoke"}
              </button>
            </div>
          ))}
        </div>
      )}

      {!made && !configuring && (
        <div className="flex flex-col gap-[4px] rounded-[10px] px-[8px] py-[4px]">
          <span className="text-[10.5px] leading-[1.5] text-[var(--muted)]">
            Claude on the web, Desktop or mobile: add a custom connector with this URL. Claude signs in here and you choose its access.
          </span>
          <CodeLine text={mcpUrl} copied={copied === "url"} onCopy={() => copy(mcpUrl, "url")} />
        </div>
      )}
      {!made && !configuring ? (
        <button
          type="button"
          onClick={() => setConfiguring(true)}
          className="flex w-fit cursor-pointer flex-row items-center gap-[6px] rounded-[9px] bg-[var(--soft)] px-[10px] py-[5px] text-[11.5px] text-[var(--ink)] transition-[background-color,transform,scale] duration-200 ease-enter hover:bg-[color-mix(in_oklab,var(--accent)_16%,var(--soft))] active:scale-[0.97]"
        >
          <Icon name="plus" className="h-[11px] w-[11px]" />
          Connect an AI agent (MCP)
        </button>
      ) : configuring ? (
        <div className="flex flex-col gap-[8px] rounded-[12px] bg-[var(--canvas)] p-[10px] [outline:1px_solid_var(--line)]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Who is it for, e.g. Claude Code"
            aria-label="Name of the AI agent"
            className="rounded-[8px] bg-[var(--surface)] px-[8px] py-[5px] text-[11.5px] text-[var(--ink)] outline-none placeholder:text-[var(--muted)] [outline:1px_solid_var(--line)] focus:[outline-color:var(--accent)]"
          />
          <Choice value={access} options={ACCESS} onChange={setAccess} />
          <span className="text-[10.5px] leading-[1.5] text-[var(--muted)]">
            {access === "full"
              ? "It can run any command on your servers, and Opsmira acts without asking for it. Every command is in Activity."
              : "It can read, run read-only commands, and ask Opsmira. Changes wait for your approval here."}
          </span>
          <div className="flex flex-row items-center gap-[12px]">
            <button
              type="button"
              onClick={create}
              className="cursor-pointer rounded-[9px] bg-[var(--accent)] px-[12px] py-[5px] text-[11.5px] font-medium text-[var(--surface)] transition-transform duration-150 active:scale-[0.97]"
            >
              Make a token
            </button>
            <button type="button" onClick={finish} className="cursor-pointer text-[10.5px] text-[var(--muted)] underline-offset-2 hover:underline">
              Cancel
            </button>
          </div>
        </div>
      ) : made ? (
        <div className="flex flex-col gap-[8px] rounded-[12px] bg-[var(--canvas)] p-[10px] [outline:1px_solid_var(--line)]">
          <Choice
            value={client}
            options={[
              { id: "claudeCode", label: "Claude Code" },
              { id: "json", label: "Claude Desktop, Cursor, others" },
            ]}
            onChange={setClient}
          />
          <span className="text-[10.5px] text-[var(--muted)]">
            {client === "claudeCode" ? "Run this in a terminal." : "Add this to the client's MCP settings."} The token is shown only now, so copy it before you close this.
          </span>
          <CodeLine text={client === "claudeCode" ? made.clients.claudeCode : made.clients.json} copied={copied === client} onCopy={() => copy(client === "claudeCode" ? made.clients.claudeCode : made.clients.json, client)} />
          <span className="text-[10.5px] text-[var(--muted)]">
            Server <span className="font-code">{made.url}</span> · header <span className="font-code">Authorization: Bearer …</span>
          </span>
          <button type="button" onClick={finish} className="w-fit cursor-pointer text-[10.5px] text-[var(--muted)] underline-offset-2 hover:underline">
            Done
          </button>
        </div>
      ) : null}
      {error && <span className="text-[10.5px] text-[var(--danger)]">{error}</span>}
    </div>
  );
}

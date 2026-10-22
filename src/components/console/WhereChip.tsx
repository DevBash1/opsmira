import { Icon } from "../Icons";

/** What "no server" means in this console: the machine Opsmira runs on, or just its container when a default server is set. */
let localLabel = "this server";
export function setLocalLabel(label: string) {
  localLabel = label;
}

/**
 * Where a command runs: the connected server's name, or the machine (or container) Opsmira itself is on.
 * Shown on every command so it is never a guess.
 */
export function WhereChip({ server, className = "" }: { server?: string; className?: string }) {
  const remote = !!server && server !== "local";
  const label = remote ? server.replace(/^agent:/, "") : localLabel;
  return (
    <span
      title={remote ? `Runs on ${label}, a connected server` : `Runs on ${label}, the machine Opsmira is running on`}
      className={`font-code inline-flex shrink-0 flex-row items-center gap-[4px] rounded-full px-[7px] py-[1px] text-[10px] ${
        remote ? "bg-[var(--soft)] text-[var(--accent-strong)]" : "text-[var(--muted)] [outline:1px_solid_var(--hairline)] [outline-offset:-1px]"
      } ${className}`}
    >
      <Icon name="server" className="h-[9px] w-[9px] shrink-0" />
      {label}
    </span>
  );
}

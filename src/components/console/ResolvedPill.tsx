import { Icon } from "../Icons";
import type { Proposal } from "../../lib/console-api";

export function resultText(proposal: Proposal) {
  if (proposal.status === "approved") {
    return proposal.result
      ? `Done · exit ${proposal.result.exitCode} · ${(proposal.result.durationMs / 1000).toFixed(1)}s`
      : "Done";
  }
  return "Not run";
}

/**
 * What every approval becomes once decided: one small pill with the outcome. Shared by the approval
 * card and the permission / irreversible-action surfaces, so every decision settles the same way.
 */
export function ResolvedPill({
  proposal,
  expanded,
  onToggle,
}: {
  proposal: Proposal;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const approved = proposal.status === "approved";
  return (
    <div
      className={`glass relative flex w-[300px] max-w-full min-w-0 shrink-0 flex-row items-center gap-[10px] rounded-[22px] p-[7px_8px_7px_8px] motion-safe:animate-blur-rise [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px] ${
        approved ? "" : "opacity-75"
      }`}
    >
      <div className="flex w-fit shrink-0 flex-row items-center gap-[6px] rounded-full bg-[var(--soft)] p-[4px_10px_4px_8px]">
        <Icon name={approved ? "check" : "triangle-alert"} className="h-[12px] w-[12px] shrink-0 text-[var(--accent-strong)]" />
        <div className="text-[12px] font-medium whitespace-nowrap text-[var(--accent-strong)]">{approved ? "Approved" : "Declined"}</div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[12px] leading-[15px] font-medium text-[var(--ink)]">{proposal.title}</span>
        <span className="font-code truncate text-[10.5px] leading-[14px] text-[var(--muted)]">{resultText(proposal)}</span>
      </div>
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!!expanded}
          aria-label={expanded ? "Hide details" : "Show details"}
          title={expanded ? "Hide details" : "Show details"}
          className="flex h-[24px] w-[24px] shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--muted)] transition-colors duration-200 ease-enter hover:bg-[var(--soft)] hover:text-[var(--ink)]"
        >
          <Icon
            name="arrow-up"
            className={`h-[10px] w-[10px] transition-transform duration-300 ease-move ${expanded ? "rotate-0" : "rotate-180"}`}
          />
        </button>
      )}
    </div>
  );
}

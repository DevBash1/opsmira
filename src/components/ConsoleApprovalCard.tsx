import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "./Icons";
import { Collapse } from "./console/Collapse";
import { Spinner } from "./console/Spinner";
import { resultText } from "./console/ResolvedPill";
import type { Proposal } from "../lib/console-api";
import { EdgeLight } from "./EdgeLight";

const RISK_STEPS: Record<Proposal["riskLevel"], number> = { Low: 1, Medium: 2, High: 3 };

function TypedConfirmCard({
  proposal,
  busy,
  onApprove,
  onDecline,
}: {
  proposal: Proposal;
  busy: boolean;
  onApprove: (confirmText?: string) => void;
  onDecline: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const pending = proposal.status === "pending";
  const approved = proposal.status === "approved";
  const matches = confirmText === proposal.confirmPhrase;

  return (
    <div
      className={`flex h-fit w-full max-w-[420px] shrink-0 flex-col items-start gap-[16px] rounded-[16px] bg-[var(--surface)] p-[20px] transition-[outline-color] duration-300 ease-enter [outline-offset:-0.5px] ${
        pending ? "[outline:1.5px_solid_var(--ink)]" : "[outline:1px_solid_var(--line)]"
      }`}
    >
      <div className="flex w-full shrink-0 flex-row items-center gap-[8px]">
        <Icon name="triangle-alert" className="h-[14px] w-[14px] shrink-0 text-[var(--ink)]" />
        <div className="text-[12px] font-semibold tracking-[0.3px] whitespace-nowrap text-[var(--ink)] uppercase">
          {pending ? "This can't be undone" : approved ? "Confirmed" : "Cancelled"}
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-col items-start gap-[6px]">
        <div className="font-display w-full text-[17px] font-semibold tracking-[-0.3px] text-[var(--ink)]">{proposal.title}</div>
        <div className="w-full text-[13px]/[20px] text-[var(--muted)]">{proposal.context}</div>
      </div>

      <div className="flex w-full shrink-0 flex-row items-start gap-[8px] rounded-[10px] bg-[var(--canvas)] p-[10px_12px] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]">
        <div className="font-code text-[12px] whitespace-nowrap text-[var(--muted)]">$</div>
        <div className="font-code min-w-0 flex-1 overflow-x-auto text-[12px] whitespace-nowrap text-[var(--ink)] hide-scrollbar">
          {proposal.command}
        </div>
      </div>

      {pending ? (
        <>
          <div className="flex w-full shrink-0 flex-col items-start gap-[8px]">
            <label className="text-[12px] text-[var(--muted)]">
              Type <span className="font-code font-semibold text-[var(--ink)]">{proposal.confirmPhrase}</span> to confirm
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={proposal.confirmPhrase}
              autoComplete="off"
              className="font-code w-full rounded-[8px] bg-[var(--canvas)] p-[8px_10px] text-[13px] text-[var(--ink)] outline-none [outline:1px_solid_var(--line)] [outline-offset:-0.5px] focus:[outline:1.5px_solid_var(--ink)]"
            />
          </div>
          <div className="flex w-full shrink-0 flex-row items-center justify-end gap-[8px]">
            <button
              type="button"
              disabled={busy}
              onClick={onDecline}
              className="flex w-fit shrink-0 cursor-pointer flex-row items-center justify-center rounded-[8px] p-[9px_14px] text-[13px] font-medium whitespace-nowrap text-[var(--muted)] transition-colors duration-200 ease-enter hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !matches}
              onClick={() => onApprove(confirmText)}
              className="flex w-fit shrink-0 cursor-pointer flex-row items-center justify-center rounded-[10px] bg-[var(--ink)] p-[9px_14px] text-[13px] font-medium whitespace-nowrap text-[var(--canvas)] transition-[transform,translate,scale,background-color] duration-200 ease-enter active:scale-[0.97] active:duration-[120ms] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {proposal.title}
            </button>
          </div>
        </>
      ) : (
        <div className="flex w-full shrink-0 flex-row items-center gap-[8px] p-[6px_0px] motion-safe:animate-rise-in">
          <div
            className={`flex h-[18px] w-[18px] shrink-0 flex-row items-center justify-center rounded-full ${approved ? "bg-[var(--ink)]" : "bg-[var(--line)]"}`}
          >
            <Icon name="check" className="h-[10px] w-[10px] shrink-0 text-[var(--canvas)]" />
          </div>
          <div className="font-code flex-1 text-[12px] text-[var(--muted)]">
            {approved && proposal.result
              ? `Done · exit ${proposal.result.exitCode} · ${(proposal.result.durationMs / 1000).toFixed(1)}s`
              : "Cancelled — not run"}
          </div>
        </div>
      )}
    </div>
  );
}

/** High-risk proposals ask in one tight line: what, the exact command, and the two choices. */
function DestructiveBarBody({
  proposal,
  busy,
  locked,
  choice,
  onApprove,
  onDecline,
}: {
  proposal: Proposal;
  busy: boolean;
  locked: boolean;
  choice: "approve" | "decline" | null;
  onApprove: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex w-full shrink-0 flex-col items-start gap-[12px] sm:flex-row sm:items-center">
      <Icon name="triangle-alert" className="h-[16px] w-[16px] shrink-0 text-[var(--ink)]" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-[2px]">
        <div className="text-[13px] font-semibold text-[var(--ink)]">{proposal.title}</div>
        <div className="font-code w-full truncate text-[11px] text-[var(--muted)]">{proposal.command}</div>
      </div>
      <div className="flex w-full shrink-0 flex-row items-center gap-[8px] sm:w-fit">
        <button
          type="button"
          disabled={busy || locked}
          onClick={onDecline}
          className="flex flex-1 cursor-pointer flex-row items-center justify-center gap-[7px] rounded-[8px] p-[8px_12px] text-[13px] font-medium whitespace-nowrap text-[var(--muted)] transition-colors duration-200 ease-enter hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
        >
          {busy && choice === "decline" && <Spinner />}
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || locked}
          onClick={onApprove}
          className="relative flex flex-1 cursor-pointer flex-row items-center justify-center gap-[7px] rounded-[8px] bg-[var(--ink)] p-[8px_14px] text-[13px] font-medium whitespace-nowrap text-[var(--canvas)] transition-[transform,translate,scale] duration-200 ease-enter active:scale-[0.97] active:duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
        >
          {busy && choice === "approve" && <Spinner />}
          {proposal.title}
        </button>
      </div>
    </div>
  );
}

export function ConsoleApprovalCard({
  proposal,
  busy,
  locked = false,
  onApprove,
  onDecline,
}: {
  proposal: Proposal;
  busy: boolean;
  /** The agent is still working: the decision waits until it has finished. */
  locked?: boolean;
  onApprove: (confirmText?: string) => void;
  onDecline: () => void;
}) {
  const [choice, setChoice] = useState<"approve" | "decline" | null>(null);
  // Each approval sends a ring of light out of the card before it folds away.
  const [pulse, setPulse] = useState(0);
  const pending = proposal.status === "pending";
  const approved = proposal.status === "approved";
  const high = proposal.riskLevel === "High";

  if (proposal.confirmPhrase) {
    return <TypedConfirmCard proposal={proposal} busy={busy} onApprove={onApprove} onDecline={onDecline} />;
  }

  const approve = () => {
    setChoice("approve");
    setPulse((n) => n + 1);
    onApprove();
  };
  const decline = () => {
    setChoice("decline");
    onDecline();
  };

  // One shell for every state: the standard card, the high-risk bar, and the pill they both settle into.
  // Width, padding, radius and outline all glide between them.
  const shell = pending
    ? high
      ? "w-full rounded-[14px] p-[12px_12px_12px_16px] [outline:1.5px_solid_var(--ink)]"
      : "w-[380px] rounded-[20px] p-[20px] [outline:1px_solid_color-mix(in_oklab,var(--accent)_45%,transparent)]"
    : `w-[300px] rounded-[22px] p-[7px_14px_7px_8px] [outline:1px_solid_var(--hairline)] ${approved ? "" : "opacity-75"}`;

  return (
    <div
      className={`glass relative flex h-fit max-w-full shrink-0 flex-col items-start transition-[width,padding,border-radius,outline-color,box-shadow,opacity] duration-[600ms] ease-move [outline-offset:-0.5px] ${shell}`}
    >
      <AnimatePresence>
        {pending && (
          <motion.span
            key="edge"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={{ duration: 0.6 }}
          >
            <EdgeLight slow />
          </motion.span>
        )}
      </AnimatePresence>
      {pulse > 0 && (
        <span
          key={pulse}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] motion-safe:animate-[pulse-ring_0.8s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:hidden"
        />
      )}

      {high && (
        <Collapse open={pending}>
          <DestructiveBarBody proposal={proposal} busy={busy} locked={locked} choice={choice} onApprove={approve} onDecline={decline} />
        </Collapse>
      )}

      <Collapse open={!(pending && high)}>
        <div className="flex w-full min-w-0 shrink-0 flex-row items-center gap-0">
          <div className="flex w-fit shrink-0 flex-row items-center gap-[6px] rounded-full bg-[var(--soft)] p-[4px_10px_4px_8px]">
            {pending ? (
              <div className="h-[6px] w-[6px] shrink-0 rounded-full bg-[var(--accent)] [box-shadow:0px_0px_6px_var(--glow)] motion-safe:animate-[dot-pulse_2.2s_ease-in-out_infinite]" />
            ) : (
              <Icon
                name={approved ? "check" : "triangle-alert"}
                className="h-[12px] w-[12px] shrink-0 text-[var(--accent-strong)] motion-safe:animate-[pop-in_0.45s_cubic-bezier(0.22,1,0.36,1)_backwards]"
              />
            )}
            <div className="text-[12px] font-medium whitespace-nowrap text-[var(--accent-strong)]">
              {pending ? "Awaiting approval" : approved ? "Approved" : "Declined"}
            </div>
          </div>

          <div
            className={`grid min-w-0 transition-[grid-template-columns,opacity,margin] duration-[600ms] ease-move ${
              pending ? "ml-0 grid-cols-[0fr] opacity-0" : "ml-[10px] grid-cols-[1fr] opacity-100"
            }`}
          >
            <div className="flex min-w-0 flex-col overflow-hidden">
              <span className="truncate text-[12px] leading-[15px] font-medium text-[var(--ink)]">{proposal.title}</span>
              <span className="font-code truncate text-[10.5px] leading-[14px] text-[var(--muted)]">{resultText(proposal)}</span>
            </div>
          </div>
        </div>
      </Collapse>

      {!high && (
        <Collapse open={pending}>
          <div className="flex flex-col items-start gap-[16px] pt-[16px]">
            <div className="flex w-full shrink-0 flex-col items-start gap-[6px]">
              <div className="font-display w-full text-[17px] font-semibold tracking-[-0.3px] text-[var(--ink)]">{proposal.title}</div>
              <div className="w-full text-[13px]/[20px] text-[var(--muted)]">{proposal.context}</div>
            </div>

            <div className="glass-well flex w-full shrink-0 flex-row items-start gap-[8px] rounded-[12px] p-[10px_12px] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]">
              <div className="font-code text-[12px] whitespace-nowrap text-[var(--muted)]">$</div>
              <div className="font-code min-w-0 flex-1 overflow-x-auto text-[12px] whitespace-nowrap text-[var(--ink)] hide-scrollbar">
                {proposal.command}
              </div>
            </div>

            <div className="flex w-full shrink-0 flex-row flex-wrap items-center gap-x-[10px] gap-y-[4px]">
              <div className="font-code text-[10px] tracking-[1px] whitespace-nowrap text-[var(--muted)]">RISK</div>
              <div className="flex w-fit shrink-0 flex-row items-center gap-[3px]">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className={`h-[4px] w-[10px] shrink-0 rounded-[2px] ${
                      n <= RISK_STEPS[proposal.riskLevel] ? "bg-[var(--ink)]" : "bg-[var(--line)]"
                    }`}
                  />
                ))}
              </div>
              <div className="text-[12px] font-medium whitespace-nowrap text-[var(--ink)]">{proposal.riskLevel}</div>
              <div className="w-full min-w-0 text-[12px]/[18px] break-words text-[var(--muted)]">{proposal.riskDetail}</div>
            </div>

            <div className="h-[1px] w-full shrink-0 bg-[var(--hairline)]" />

            <div className="flex min-h-[38px] w-full shrink-0 flex-row items-center justify-end gap-[8px]">
              <button
                type="button"
                disabled={busy || locked}
                onClick={decline}
                className="flex w-fit shrink-0 cursor-pointer flex-row items-center justify-center gap-[8px] rounded-[12px] bg-[color-mix(in_oklab,var(--surface)_55%,transparent)] p-[9px_14px] transition-[background-color,transform,translate,scale,rotate] duration-200 ease-enter hover:bg-[var(--surface)] active:scale-[0.97] active:duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50 [outline:1px_solid_var(--line)] [outline-offset:-0.5px]"
              >
                {busy && choice === "decline" && <Spinner className="text-[var(--muted)]" />}
                <span className="text-[13px] font-medium whitespace-nowrap text-[var(--ink)]">Deny</span>
              </button>
              <button
                type="button"
                disabled={busy || locked}
                onClick={approve}
                className="flex w-fit shrink-0 cursor-pointer flex-row items-center justify-center gap-[8px] rounded-[12px] bg-[linear-gradient(-45deg,var(--accent),var(--accent-2))] p-[9px_15px] transition-[transform,translate,scale,rotate,box-shadow,filter] duration-200 ease-enter [box-shadow:inset_0px_1px_0px_color-mix(in_oklab,var(--canvas)_35%,transparent),0px_8px_20px_var(--glow)] hover:brightness-110 active:scale-[0.97] active:duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy && choice === "approve" ? (
                  <Spinner className="text-[var(--canvas)]" />
                ) : (
                  <Icon name="check" className="h-[15px] w-[15px] shrink-0 text-[var(--canvas)]" />
                )}
                <span className="text-[13px] font-medium whitespace-nowrap text-[var(--canvas)]">Approve</span>
              </button>
            </div>
          </div>
        </Collapse>
      )}
    </div>
  );
}

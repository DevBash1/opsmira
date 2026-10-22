import { useState } from "react";
import { Icon } from "../../Icons";
import type { Proposal } from "../../../lib/console-api";
import { Collapse } from "../Collapse";
import { ResolvedPill } from "../ResolvedPill";
import { WhereChip } from "../WhereChip";
import {
  Action,
  KeyValue,
  Notice,
  Panel,
  SceneFooter,
  Status,
  Tag,
} from "../SceneKit";
import type { SceneProps } from "./DiagnosticScenes";

/* 03 · Open canvas ---------------------------------------------------- */
export function OpenCanvasScene({ onAsk }: SceneProps) {
  return (
    <div className="flex w-full flex-col items-start gap-[22px] py-[10px]">
      <span className="flex flex-row items-center gap-[7px] rounded-full bg-[var(--surface)] px-[11px] py-[5px] text-[11.5px] text-[var(--muted)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]">
        <span className="h-[6px] w-[6px] rounded-full bg-[var(--accent)] motion-safe:animate-[dot-pulse_2s_ease-in-out_infinite]" />
        Connected to production
      </span>
      <div className="flex flex-col gap-[12px]">
        <h2 className="font-display text-[38px] leading-[1.02] font-semibold tracking-[-1.5px] text-[var(--ink)] sm:text-[52px] sm:tracking-[-2px]">
          Your server.
          <br />
          A little more intuitive.
        </h2>
        <p className="max-w-[560px] text-[14px] leading-[1.6] text-[var(--muted)]">
          Ask a question or set something in motion. Your workspace takes shape from there.
        </p>
      </div>
      <div className="flex w-full flex-row flex-wrap gap-[8px]">
        {["Check memory usage", "Diagnose a container", "Deploy an app", "Review security"].map((label) =>
          onAsk ? (
            <button
              key={label}
              type="button"
              onClick={() => onAsk(label)}
              className="cursor-pointer rounded-full bg-[var(--surface)] px-[13px] py-[7px] text-[12px] text-[var(--ink)] transition-colors duration-150 hover:bg-[var(--soft)] [outline:1px_solid_var(--line)] [outline-offset:-0.5px]"
            >
              {label}
            </button>
          ) : (
            <span key={label} title="Illustrative only · sample data" className="rounded-full bg-[var(--surface)] px-[13px] py-[7px] text-[12px] text-[var(--ink)] opacity-60 [outline:1px_solid_var(--line)] [outline-offset:-0.5px]">
              {label}
            </span>
          ),
        )}
      </div>
      <SceneFooter>The idle canvas — the agent meets you here</SceneFooter>
    </div>
  );
}

type LiveApproval = {
  proposal?: Proposal;
  busy?: boolean;
  /** The agent is still working: the decision waits until it has finished. */
  locked?: boolean;
  onApprove?: (confirmText?: string) => void;
  onDecline?: () => void;
};

function LivePermission({
  proposal,
  busy = false,
  locked = false,
  onApprove,
  onDecline,
}: {
  proposal: Proposal;
  busy?: boolean;
  locked?: boolean;
  onApprove?: () => void;
  onDecline?: () => void;
}) {
  const [details, setDetails] = useState(false);
  const pending = proposal.status === "pending";
  const approved = proposal.status === "approved";
  const commands = proposal.command
    .split(/\s*&&\s*/)
    .map((cmd) => cmd.trim())
    .filter(Boolean);
  const elevated = /^\s*sudo\b/.test(proposal.command);

  // Once decided, the whole request folds into the same result pill every approval settles into;
  // the full record stays one tap away.
  return (
    <div className="flex w-full flex-col items-start">
      {!pending && <ResolvedPill proposal={proposal} expanded={details} onToggle={() => setDetails((v) => !v)} />}
      <Collapse open={pending || details}>
        <div className={`flex w-full flex-col gap-[18px] ${pending ? "" : "pt-[18px]"}`}>
          <div className="flex flex-row flex-wrap items-center justify-between gap-[10px]">
            <span className="font-code text-[10.5px] tracking-[0.6px] text-[var(--muted)]">
              Prepared a fix · needs elevated access
            </span>
            <Tag tone={pending ? "warn" : approved ? "success" : "neutral"}>
              {pending ? "AWAITING YOUR APPROVAL" : approved ? "APPROVED · RAN" : "DECLINED"}
            </Tag>
          </div>
          <h2 className="font-display max-w-[760px] text-[30px] leading-[1.08] font-semibold tracking-[-1.1px] text-[var(--ink)] sm:text-[36px]">
            {proposal.title}
          </h2>
          {proposal.server && (
            <span className="font-code text-[11.5px] text-[var(--muted)]">Runs on {proposal.server.replace(/^agent:/, "")}, not on this server</span>
          )}
          <p className="max-w-[720px] text-[13.5px] leading-[1.6] text-[var(--muted)]">{proposal.context}</p>
          <Panel className="flex w-full flex-col gap-[10px] p-[16px_18px]">
            <div className="flex w-full flex-row flex-wrap items-baseline justify-between gap-[8px]">
              <span className="text-[13px] font-medium text-[var(--ink)]">
                Run {commands.length} command{commands.length === 1 ? "" : "s"} on production
              </span>
              <span className="font-code text-[10px] text-[var(--muted)]">
                {elevated ? "as root · " : ""}risk · {proposal.riskLevel}
              </span>
            </div>
            {commands.map((cmd, i) => (
              <div
                key={`${i}-${cmd}`}
                className="font-code flex w-full flex-row items-start gap-[10px] rounded-[8px] bg-[var(--canvas)] px-[11px] py-[8px] text-[11.5px] text-[var(--ink)] [outline:1px_solid_var(--hairline)]"
              >
                <span className="text-[10px] text-[var(--muted)]">{i + 1}</span>
                <span className="text-[var(--muted)]">#</span>
                <span className="min-w-0 flex-1 break-words">{cmd}</span>
              </div>
            ))}
            <span className="text-[11px] leading-[1.5] text-[var(--muted)]">{proposal.riskDetail}</span>
          </Panel>
          {pending ? (
            <div className="flex w-full flex-row flex-wrap items-center justify-end gap-[12px]">
              <div className="flex flex-row flex-wrap gap-[8px]">
                <Action onClick={onDecline} disabled={busy || locked}>
                  Deny
                </Action>
                <Action variant="primary" onClick={onApprove} disabled={busy || locked}>
                  {busy ? "Running…" : "Approve & run"}
                </Action>
              </div>
            </div>
          ) : (
            <div className="flex w-full flex-row flex-wrap items-center gap-[10px]">
              <Status tone={approved ? "success" : "neutral"}>{approved ? "Approved" : "Declined"}</Status>
              <span className="font-code text-[11px] text-[var(--muted)]">
                {approved && proposal.result
                  ? `Done · exit ${proposal.result.exitCode} · ${(proposal.result.durationMs / 1000).toFixed(1)}s`
                  : "Nothing ran · logged to audit trail"}
              </span>
            </div>
          )}
          <SceneFooter>
            {pending
              ? "Waiting for your decision · nothing has run yet"
              : approved
                ? "Approved by you · logged to audit trail"
                : "Denied by you · no changes made"}
          </SceneFooter>
        </div>
      </Collapse>
    </div>
  );
}

/** How much of the confirm phrase has been typed correctly, from the start. */
function matchedLength(typed: string, phrase: string) {
  let n = 0;
  while (n < typed.length && n < phrase.length && typed[n] === phrase[n]) n++;
  return n;
}

function LiveDestructive({
  proposal,
  busy = false,
  locked = false,
  onApprove,
  onDecline,
}: {
  proposal: Proposal;
  busy?: boolean;
  locked?: boolean;
  onApprove?: (confirmText?: string) => void;
  onDecline?: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [shake, setShake] = useState(false);
  const [details, setDetails] = useState(false);
  const pending = proposal.status === "pending";
  const approved = proposal.status === "approved";
  const phrase = proposal.confirmPhrase ?? "";
  const matches = typed === phrase;
  const matched = matchedLength(typed, phrase);
  const progress = phrase.length ? matched / phrase.length : 0;

  const onType = (next: string) => {
    // A gentle shake the moment a keystroke stops matching the phrase.
    const wasBroken = typed.length > matched;
    const isBroken = next.length > matchedLength(next, phrase);
    if (isBroken && !wasBroken) setShake(true);
    setTyped(next);
  };

  return (
    <div className="flex w-full flex-col items-start">
      {!pending && <ResolvedPill proposal={proposal} expanded={details} onToggle={() => setDetails((v) => !v)} />}
      <Collapse open={pending || details}>
        <div className={`flex w-full flex-col gap-[18px] ${pending ? "" : "pt-[18px]"}`}>
          <div className="flex flex-row flex-wrap items-center justify-between gap-[10px]">
            <span className="font-code text-[10.5px] tracking-[0.6px] text-[var(--muted)]">
              Prepared an irreversible change · typed confirmation required
            </span>
            <Tag tone={pending ? "danger" : approved ? "success" : "neutral"}>
              {pending ? "IRREVERSIBLE ACTION" : approved ? "APPROVED · RAN" : "DECLINED"}
            </Tag>
          </div>
          <h2 className="font-display max-w-[780px] text-[30px] leading-[1.08] font-semibold tracking-[-1.1px] text-[var(--ink)] sm:text-[36px]">
            {proposal.title}
          </h2>
          {proposal.server && (
            <span className="font-code text-[11.5px] text-[var(--muted)]">Runs on {proposal.server.replace(/^agent:/, "")}, not on this server</span>
          )}
          <p className="max-w-[720px] text-[13.5px] leading-[1.6] text-[var(--muted)]">{proposal.context}</p>
          <Panel className="flex w-full flex-col gap-[10px] p-[16px_18px]">
            <div className="flex w-full flex-row flex-wrap items-baseline justify-between gap-[8px]">
              <span className="font-code text-[9.5px] tracking-[1px] text-[var(--muted)]">THIS CANNOT BE UNDONE</span>
              <span className="font-code text-[10px] text-[var(--muted)]">risk · {proposal.riskLevel}</span>
            </div>
            <div className="font-code w-full overflow-x-auto rounded-[8px] bg-[var(--canvas)] px-[11px] py-[9px] text-[11.5px] whitespace-pre-wrap text-[var(--ink)] [outline:1px_solid_var(--hairline)]">
              <WhereChip server={proposal.server} className="mr-[8px]" />
              <span className="mr-[8px] text-[var(--muted)]">$</span>
              {proposal.command}
            </div>
            <span className="text-[11px] leading-[1.5] text-[var(--muted)]">{proposal.riskDetail}</span>
          </Panel>
          {pending ? (
            <Panel className="flex w-full flex-col gap-[10px] p-[16px_18px]">
              <label className="text-[11.5px] text-[var(--muted)]" htmlFor={`confirm-${proposal.id}`}>
                Type{" "}
                <span className="font-code">
                  <span className="text-[var(--accent)]">{phrase.slice(0, matched)}</span>
                  <span className="text-[var(--ink)]">{phrase.slice(matched)}</span>
                </span>{" "}
                to confirm
              </label>
              <div
                onAnimationEnd={(e) => e.animationName === "shake" && setShake(false)}
                className={`relative w-full ${shake ? "motion-safe:animate-[shake_0.36s_ease-out]" : ""}`}
              >
                <input
                  id={`confirm-${proposal.id}`}
                  type="text"
                  value={typed}
                  onChange={(e) => onType(e.target.value)}
                  placeholder={phrase}
                  autoComplete="off"
                  disabled={busy || locked}
                  className="font-code w-full rounded-[9px] bg-[var(--canvas)] px-[11px] py-[8px] text-[12px] text-[var(--ink)] transition-[outline-color,box-shadow] duration-200 ease-enter [outline:1px_solid_var(--line)] [outline-offset:-0.5px] placeholder:text-[var(--muted)] focus:[box-shadow:0px_0px_0px_4px_var(--glow)] focus:[outline-color:var(--accent)] disabled:opacity-60"
                />
                {/* Fills as the phrase is typed correctly; falls back the moment it isn't. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-[10px] bottom-[2px] left-[10px] h-[2px] origin-left rounded-full bg-[var(--accent)] transition-[scale] duration-200 ease-enter"
                  style={{ scale: `${progress} 1` }}
                />
              </div>
              <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[10px]">
                <span className="text-[10.5px] text-[var(--muted)]">This cannot be undone.</span>
                <div className="flex flex-row gap-[8px]">
                  <Action onClick={onDecline} disabled={busy || locked}>
                    Cancel — keep everything
                  </Action>
                  <Action
                    variant="ink"
                    onClick={() => onApprove?.(typed)}
                    disabled={busy || locked || !matches}
                    className={matches ? "motion-safe:animate-[pop_0.42s_cubic-bezier(0.22,1,0.36,1)] [box-shadow:0px_0px_0px_4px_var(--glow)]" : ""}
                  >
                    {busy ? "Running…" : "Approve & run"}
                  </Action>
                </div>
              </div>
            </Panel>
          ) : (
            <div className="flex w-full flex-row flex-wrap items-center gap-[10px]">
              <Status tone={approved ? "success" : "neutral"}>{approved ? "Approved" : "Declined"}</Status>
              <span className="font-code text-[11px] text-[var(--muted)]">
                {approved && proposal.result
                  ? `Done · exit ${proposal.result.exitCode} · ${(proposal.result.durationMs / 1000).toFixed(1)}s`
                  : "Nothing ran · logged to audit trail"}
              </span>
            </div>
          )}
          <SceneFooter>
            {pending ? "Nothing has run · typed confirmation required" : approved ? "Approved by you · logged to audit trail" : "Cancelled · nothing was deleted"}
          </SceneFooter>
        </div>
      </Collapse>
    </div>
  );
}

/* 26 · Elevated permission -------------------------------------------- */
export function PermissionScene({ proposal, busy, locked, onApprove, onDecline }: SceneProps & LiveApproval) {
  if (proposal) {
    return <LivePermission proposal={proposal} busy={busy} locked={locked} onApprove={onApprove} onDecline={onDecline} />;
  }
  return (
    <div className="flex w-full flex-col gap-[18px]">
      <div className="flex flex-row flex-wrap items-center justify-between gap-[10px]">
        <span className="font-code text-[10.5px] tracking-[0.6px] text-[var(--muted)]">Prepared a fix · needs elevated access</span>
        <Tag tone="warn">AWAITING YOUR APPROVAL</Tag>
      </div>
      <h2 className="font-display max-w-[720px] text-[30px] leading-[1.08] font-semibold tracking-[-1.1px] text-[var(--ink)] sm:text-[36px]">
        Opsmira needs sudo to restart nginx.
      </h2>
      <p className="max-w-[700px] text-[13.5px] leading-[1.6] text-[var(--muted)]">
        The new TLS certificate is in place, but nginx has to reload to pick it up. Nothing runs until you say so.
      </p>
      <Panel className="flex w-full flex-col gap-[10px] p-[16px_18px]">
        <div className="flex w-full flex-row flex-wrap items-baseline justify-between gap-[8px]">
          <span className="text-[13px] font-medium text-[var(--ink)]">Run 2 commands on production</span>
          <span className="font-code text-[10px] text-[var(--muted)]">as root · web-01.prod · est. 2s of reload</span>
        </div>
        {[
          ["1", "sudo nginx -t"],
          ["2", "sudo systemctl reload nginx"],
        ].map(([n, cmd]) => (
          <div key={n} className="font-code flex w-full flex-row items-center gap-[12px] rounded-[8px] bg-[var(--canvas)] px-[11px] py-[8px] text-[11.5px] text-[var(--ink)] [outline:1px_solid_var(--hairline)]">
            <span className="text-[10px] text-[var(--muted)]">{n}</span>
            <span className="text-[var(--muted)]">#</span>
            {cmd}
            <span className="ml-auto flex flex-row items-center gap-[5px] text-[10px] text-[var(--accent-strong)]">
              <Icon name="check" className="h-[10px] w-[10px]" /> zero dropped connections expected
            </span>
          </div>
        ))}
      </Panel>
      <Panel className="flex w-full flex-col gap-[2px] p-[14px_18px]">
        <span className="font-code mb-[4px] text-[9.5px] tracking-[1px] text-[var(--muted)]">WHAT THIS WILL TOUCH</span>
        {[
          ["Read nginx.conf", "Read", "Read"],
          ["Validate syntax only", "Read", "Read"],
          ["Reload nginx", "Graceful, no restart", "Low"],
          ["Use root once", "Revoked after run", "Elevated"],
        ].map(([what, how, access]) => (
          <div key={what} className="flex w-full flex-row flex-wrap items-center justify-between gap-[10px] border-b border-[var(--hairline)] py-[7px] last:border-0">
            <span className="text-[12px] text-[var(--ink)]">{what}</span>
            <span className="font-code text-[10.5px] text-[var(--muted)]">{how}</span>
            <Tag tone={access === "Elevated" ? "warn" : "neutral"}>{access}</Tag>
          </div>
        ))}
      </Panel>
      <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[12px]">
        <span className="text-[10.5px] text-[var(--muted)]">Request expires in 9:41 · logged to audit trail</span>
        <div className="flex flex-row flex-wrap gap-[8px]">
          <Action>Deny</Action>
          <Action>Always for nginx</Action>
          <Action variant="primary">Approve &amp; run</Action>
        </div>
      </div>
      <SceneFooter>Waiting for your decision · nothing has run yet</SceneFooter>
    </div>
  );
}

/* 27 · Destructive confirmation --------------------------------------- */
export function DestructiveScene({ proposal, busy, locked, onApprove, onDecline }: SceneProps & LiveApproval) {
  if (proposal) {
    return <LiveDestructive proposal={proposal} busy={busy} locked={locked} onApprove={onApprove} onDecline={onDecline} />;
  }
  return <DestructivePreview />;
}

function DestructivePreview() {
  const snapshots = [
    ["snap-0a91f", "db-primary", "2025-12-02", "128 GB"],
    ["snap-7c3e2", "db-primary", "2026-01-14", "96 GB"],
    ["snap-b210d", "media-store", "2026-02-27", "84 GB"],
  ];
  return (
    <div className="flex w-full flex-col gap-[18px]">
      <div className="flex flex-row flex-wrap items-center justify-between gap-[10px]">
        <span className="font-code text-[10.5px] tracking-[0.6px] text-[var(--muted)]">Scanned 3 volumes · 41 snapshots</span>
        <Tag tone="danger">IRREVERSIBLE ACTION</Tag>
      </div>
      <h2 className="font-display max-w-[760px] text-[30px] leading-[1.08] font-semibold tracking-[-1.1px] text-[var(--ink)] sm:text-[36px]">
        Delete 38 stale snapshots and free 412 GB?
      </h2>
      <p className="max-w-[720px] text-[13.5px] leading-[1.6] text-[var(--muted)]">
        These snapshots are older than 90 days and aren't referenced by any backup policy. Once deleted, they can't be recovered.
      </p>
      <Panel className="flex w-full flex-row flex-wrap items-end justify-between gap-[14px] p-[16px_18px]">
        <div className="flex flex-col gap-[2px]">
          <span className="font-code text-[9.5px] tracking-[1px] text-[var(--muted)]">SPACE YOU'LL RECLAIM</span>
          <span className="font-display text-[38px] leading-none font-semibold tracking-[-1.3px] text-[var(--ink)]">412 GB</span>
        </div>
        <div className="flex flex-row gap-[8px]">
          <Tag tone="danger">Delete · 38</Tag>
          <Tag>Keep · 3</Tag>
        </div>
      </Panel>
      <Panel className="flex w-full flex-col overflow-hidden">
        {snapshots.map(([id, volume, date, size]) => (
          <div key={id} className="flex w-full flex-row flex-wrap items-center gap-x-[16px] gap-y-[4px] border-b border-[var(--hairline)] px-[16px] py-[10px]">
            <span className="font-code text-[11px] text-[var(--ink)]">{id}</span>
            <span className="font-code text-[10.5px] text-[var(--muted)]">{volume}</span>
            <span className="font-code ml-auto text-[10.5px] text-[var(--muted)]">{date}</span>
            <span className="font-code w-[58px] text-right text-[11px] text-[var(--ink)]">{size}</span>
          </div>
        ))}
        <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[8px] px-[16px] py-[10px]">
          <span className="font-code text-[10.5px] text-[var(--muted)]">+ 35 more</span>
          <span className="font-code text-[10.5px] text-[var(--muted)]">3 volumes · before Jul 20 · 104 GB</span>
        </div>
      </Panel>
      <Notice tone="success" icon="check" title="Latest snapshot per volume is always kept." footer="snap-f88a0 · db-primary · 2026-10-16 · kept">
        Four snapshots remain untouched.
      </Notice>
      <Panel className="flex w-full flex-col gap-[10px] p-[16px_18px]">
        <label className="text-[11.5px] text-[var(--muted)]" htmlFor="scene-confirm">
          Type the volume group to confirm — <span className="font-code text-[var(--ink)]">prod-snapshots</span>
        </label>
        <input
          id="scene-confirm"
          type="text"
          placeholder="prod-snapshots"
          disabled
          aria-disabled="true"
          className="font-code w-full rounded-[9px] bg-[var(--canvas)] px-[11px] py-[8px] text-[12px] text-[var(--ink)] [outline:1px_solid_var(--line)] [outline-offset:-0.5px] placeholder:text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[10px]">
          <span className="text-[10.5px] text-[var(--muted)]">This cannot be undone.</span>
          <div className="flex flex-row gap-[8px]">
            <Action>Cancel — keep everything</Action>
            <Action variant="ink">Delete 38 snapshots</Action>
          </div>
        </div>
      </Panel>
      <SceneFooter>Nothing has been deleted · typed confirmation required</SceneFooter>
    </div>
  );
}

/* 30 · Reconnecting --------------------------------------------------- */
export function OfflineScene({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex w-full flex-col gap-[18px]">
      <div className="flex flex-row flex-wrap items-center justify-between gap-[10px]">
        <span className="font-code text-[10.5px] tracking-[0.6px] text-[var(--muted)]">Lost SSH session to web-01 at 14:32:07</span>
        <Tag tone="warn">RECONNECTING · ATTEMPT 3 OF 5</Tag>
      </div>
      <h2 className="font-display max-w-[760px] text-[30px] leading-[1.08] font-semibold tracking-[-1.1px] text-[var(--ink)] sm:text-[36px]">
        Production dropped off. Your work is safe.
      </h2>
      <p className="max-w-[720px] text-[13.5px] leading-[1.6] text-[var(--muted)]">
        Nothing was mid-flight when it happened. I've paused your queue and I'm retrying with backoff — you can keep reading while I reconnect.
      </p>
      <Panel className="flex w-full flex-col gap-[10px] p-[16px_18px]">
        <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[8px]">
          <span className="font-display text-[15px] font-semibold text-[var(--ink)]">Route health</span>
          <span className="font-code text-[10px] text-[var(--muted)]">last ok 14:32:06</span>
        </div>
        {[
          ["You", "online · 18 ms", "success"],
          ["Opsmira relay", "eu-west · timeout", "warn"],
          ["web-01", "unreachable", "danger"],
        ].map(([name, state, tone]) => (
          <div key={name} className="flex w-full flex-row items-center justify-between gap-[10px] border-b border-[var(--hairline)] py-[6px] last:border-0">
            <span className="text-[12px] text-[var(--ink)]">{name}</span>
            <span className="flex flex-row items-center gap-[7px] text-[11px] text-[var(--muted)]">
              <span className={`h-[6px] w-[6px] rounded-full ${tone === "success" ? "bg-[var(--accent)]" : tone === "warn" ? "bg-[var(--accent-2)]" : "bg-[var(--ink)]"}`} />
              {state}
            </span>
          </div>
        ))}
        <div className="grid w-full grid-cols-2 gap-x-[20px] sm:grid-cols-4">
          <KeyValue label="DNS" value="resolved" />
          <KeyValue label="TLS" value="valid" />
          <KeyValue label="PING" value="42 ms" />
          <KeyValue label="SSH :22" value="timed out" />
        </div>
      </Panel>
      <div className="flex w-full flex-row flex-wrap items-center justify-between gap-[10px]">
        <span className="font-code text-[10.5px] text-[var(--muted)]">8s · next retry</span>
        <div className="flex flex-row flex-wrap gap-[8px]">
          <Action variant="primary" onClick={onRetry}>
            Retry now
          </Action>
          <Action>Switch to web-02 instead</Action>
        </div>
      </div>
      <div className="flex w-full flex-row flex-wrap items-center gap-[10px] rounded-[10px] bg-[var(--canvas)] px-[12px] py-[9px] [outline:1px_solid_var(--hairline)]">
        <span className="font-code text-[10px] tracking-[0.6px] text-[var(--muted)]">2 ACTIONS PAUSED</span>
        <span className="text-[11px] text-[var(--ink)]">· rotate logs · /var/log/app</span>
        <span className="text-[11px] text-[var(--ink)]">· restart worker · billing</span>
      </div>
      <SceneFooter>Your conversation is preserved · no changes made</SceneFooter>
    </div>
  );
}

import { Icon } from "./Icons";

export interface ApprovalCardProps {
  tone?: "light" | "dark";
  state?: "pending" | "approved";
  status: string;
  timestamp: string;
  title: string;
  context: string;
  command: string;
  riskFilled: number;
  riskLevel: string;
  riskDetail: string;
  className?: string;
}

export function ApprovalCard({
  tone = "light",
  state = "pending",
  status,
  timestamp,
  title,
  context,
  command,
  riskFilled,
  riskLevel,
  riskDetail,
  className = "",
}: ApprovalCardProps) {
  const dark = tone === "dark";
  const approved = state === "approved";

  const shell = dark
    ? "bg-[var(--surface)] [outline:1px_solid_var(--line)] [outline-offset:-0.5px]"
    : "bg-[var(--surface)] [outline:1px_solid_var(--accent)] [outline-offset:-0.5px]";

  return (
    <div
      className={`flex h-fit w-full shrink-0 flex-col items-start gap-[16px] rounded-[16px] p-[16px] sm:p-[20px] ${shell} ${className}`}
    >
      <div className="flex w-full shrink-0 flex-row items-center justify-between gap-0">
        {approved ? (
          <div className="flex w-fit shrink-0 flex-row items-center gap-[6px] rounded-full bg-[var(--soft)] p-[4px_10px_4px_8px]">
            <Icon name="check" className="h-[12px] w-[12px] shrink-0 text-[var(--accent-strong)]" />
            <div className="text-[12px] font-medium whitespace-nowrap text-[var(--accent-strong)]">{status}</div>
          </div>
        ) : (
          <div className="flex w-fit shrink-0 flex-row items-center gap-[6px] rounded-full bg-[var(--soft)] p-[4px_10px_4px_8px]">
            <div className="h-[6px] w-[6px] shrink-0 rounded-full bg-[var(--accent)] [box-shadow:0px_0px_6px_var(--glow)] motion-safe:animate-[dot-pulse_2.2s_ease-in-out_infinite]" />
            <div className="text-[12px] font-medium whitespace-nowrap text-[var(--accent-strong)]">{status}</div>
          </div>
        )}
        <div className="font-code text-[11px] whitespace-nowrap text-[var(--muted)]">{timestamp}</div>
      </div>

      <div className="flex w-full shrink-0 flex-col items-start gap-[6px]">
        <div className="font-display w-full text-[17px] font-semibold tracking-[-0.3px] text-[var(--ink)]">{title}</div>
        <div className="w-full text-[13px]/[20px] text-[var(--muted)]">{context}</div>
      </div>

      <div className="flex w-full shrink-0 flex-row items-start gap-[8px] rounded-[10px] bg-[var(--canvas)] p-[10px_12px] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]">
        <div className="font-code text-[12px] whitespace-nowrap text-[var(--muted)]">$</div>
        <div className="font-code min-w-0 flex-1 overflow-x-auto text-[12px] whitespace-nowrap text-[var(--ink)] hide-scrollbar">{command}</div>
      </div>

      <div className="flex w-full shrink-0 flex-row flex-wrap items-center gap-x-[10px] gap-y-[4px]">
        <div className="font-code text-[10px] tracking-[1px] whitespace-nowrap text-[var(--muted)]">RISK</div>
        <div className="flex w-fit shrink-0 flex-row items-center gap-[3px]">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`h-[4px] w-[10px] shrink-0 rounded-[2px] ${
                n <= riskFilled ? "bg-[var(--ink)]" : "bg-[var(--line)]"
              }`}
            />
          ))}
        </div>
        <div className="text-[12px] font-medium whitespace-nowrap text-[var(--ink)]">{riskLevel}</div>
        <div className="min-w-[120px] flex-1 text-right text-[12px] whitespace-nowrap text-[var(--muted)]">{riskDetail}</div>
      </div>

      <div className="h-[1px] w-full shrink-0 bg-[var(--hairline)]" />

      {approved ? (
        <div className="flex w-full shrink-0 flex-row items-center gap-[8px] p-[6px_0px]">
          <Icon name="circle-check" className="h-[14px] w-[14px] shrink-0 text-[var(--accent)]" />
          <div className="font-code flex-1 text-[12px] text-[var(--muted)]">{`Approved by you · exit 0 · 1.2s`}</div>
        </div>
      ) : (
        <div className="flex w-full shrink-0 flex-row items-start justify-end gap-[8px]">
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="flex w-fit shrink-0 flex-row items-center justify-center gap-[8px] rounded-[10px] bg-[var(--surface)] p-[9px_14px] transition-[background-color,transform,translate,scale,rotate] duration-200 ease-enter hover:bg-[var(--soft)] active:scale-[0.97] active:duration-[120ms] [outline:1px_solid_var(--line)] [outline-offset:-0.5px]"
          >
            <span className="text-[13px] font-medium whitespace-nowrap text-[var(--ink)]">Deny</span>
          </a>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="flex w-fit shrink-0 flex-row items-center justify-center gap-[8px] rounded-[10px] bg-[var(--accent)] p-[9px_14px] transition-[transform,translate,scale,rotate,background-color] duration-200 ease-enter hover:bg-[var(--accent-strong)] active:scale-[0.97] active:duration-[120ms]"
          >
            <Icon name="check" className="h-[15px] w-[15px] shrink-0 text-white" />
            <span className="text-[13px] font-medium whitespace-nowrap text-white">Approve</span>
          </a>
        </div>
      )}
    </div>
  );
}

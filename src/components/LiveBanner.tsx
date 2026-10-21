export function LiveBanner({
  label,
  detail,
  time,
}: {
  label: string;
  detail: string;
  time: string;
}) {
  return (
    <div className="flex w-fit max-w-full shrink-0 flex-row items-center gap-[12px] rounded-full bg-[var(--glass)] p-[8px_16px_8px_10px] [backdrop-filter:blur(6px)] [box-shadow:0px_4px_20px_var(--glow)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]">
      <div className="flex h-[18px] w-[18px] shrink-0 flex-row items-center justify-center gap-0 rounded-full bg-[var(--glow)]">
        <div className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--accent)] [box-shadow:0px_0px_6px_var(--accent)] motion-safe:animate-[dot-pulse_2s_ease-in-out_infinite]" />
      </div>
      <div className="shrink-0 text-[13px] font-medium whitespace-nowrap text-[var(--ink)]">{label}</div>
      <div className="h-[14px] w-[1px] shrink-0 bg-[var(--line)]" />
      <div className="min-w-0 truncate text-[13px] whitespace-nowrap text-[var(--muted)]">{detail}</div>
      <div className="font-code shrink-0 text-[11px] whitespace-nowrap text-[var(--muted)]">{time}</div>
    </div>
  );
}

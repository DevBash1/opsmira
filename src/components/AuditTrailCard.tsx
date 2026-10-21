import { Icon } from "./Icons";

interface AuditLog {
  time: string;
  icon: "info" | "triangle-alert";
  level: string;
  levelDim?: boolean;
  message: string;
}

const LOGS: AuditLog[] = [
  { time: "14:15:02", icon: "info", level: "INFO", levelDim: true, message: "Proposed: restart nginx on web-02" },
  { time: "14:15:20", icon: "triangle-alert", level: "ROOT", message: "Approved by sam — root scoped for 1 command" },
  { time: "14:15:23", icon: "info", level: "INFO", levelDim: true, message: "Done in 2.1s · access revoked · restore point saved" },
];

export function AuditTrailCard() {
  return (
    <div className="flex h-fit w-full shrink-0 flex-col items-start gap-[6px] rounded-[20px] bg-[var(--glass)] p-[16px] sm:p-[20px] [backdrop-filter:blur(10px)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]">
      <div className="flex w-full shrink-0 flex-row flex-wrap items-center justify-between gap-x-[12px] gap-y-[4px] p-[0px_0px_8px_0px]">
        <div className="font-display text-[15px] font-semibold whitespace-nowrap text-[var(--ink)]">Audit trail</div>
        <div className="group flex w-fit shrink-0 flex-row items-center gap-[6px]">
          <Icon name="refresh-cw" className="h-[12px] w-[12px] shrink-0 text-[var(--muted)] transition-transform duration-500 ease-enter group-hover:rotate-[180deg]" />
          <div className="font-code text-[11px] whitespace-nowrap text-[var(--muted)]">Updated 2s ago · every 2s</div>
        </div>
      </div>
      {LOGS.map((log) => (
        <div
          key={log.time}
          className="flex w-full shrink-0 flex-col items-start gap-[4px] rounded-[8px] p-[8px_6px] sm:flex-row sm:gap-[16px] sm:p-[8px_14px]"
        >
          <div className="flex shrink-0 flex-row items-start gap-[16px]">
          <div className="font-code text-[12px]/[18px] whitespace-nowrap text-[var(--muted)]">{log.time}</div>
          <div className="flex h-[18px] w-[64px] shrink-0 flex-row items-center gap-[6px]">
            <Icon
              name={log.icon}
              className={`h-[12px] w-[12px] shrink-0 ${log.levelDim ? "text-[var(--muted)]" : "text-[var(--accent-2)]"}`}
            />
            <div
              className={`font-code text-[11px] font-medium tracking-[0.6px] whitespace-nowrap ${
                log.levelDim ? "text-[var(--muted)]" : "text-[var(--accent-2)]"
              }`}
            >
              {log.level}
            </div>
          </div>
          </div>
          <div className="font-code min-w-0 flex-1 text-[12px]/[18px] text-[var(--ink)]">{log.message}</div>
        </div>
      ))}
    </div>
  );
}

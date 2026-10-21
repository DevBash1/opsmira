import { Icon } from "./Icons";
import { LiveBanner } from "./LiveBanner";
import { useInView } from "./Reveal";
import { Typewriter } from "./Typewriter";

const PLAN_STEPS = [
  { label: "Snapshot database", time: "2.4s", detail: "opsmira_prod · 2.1 GB", state: "done" },
  { label: "Pull image", time: "5.1s", detail: "api:2026.10.18", state: "done" },
  { label: "Apply migrations", time: "0:08", detail: "3 of 7 files", state: "running" },
  { label: "Verify health checks", time: "—", detail: "Waiting", state: "pending" },
] as const;

const BAR_HEIGHTS = [
  "h-[52px]",
  "h-[64px]",
  "h-[48px]",
  "h-[70px]",
  "h-[88px]",
  "h-[76px]",
  "h-[60px]",
  "h-[82px]",
  "h-[96px]",
  "h-[72px]",
  "h-[104px]",
  "h-[118px]",
];
const AXIS = ["-60s", "-45s", "-30s", "-15s", "now"];

function PlanRow({ label, time, detail, state }: (typeof PLAN_STEPS)[number]) {
  return (
    <div
      className={`flex w-full shrink-0 flex-row items-start gap-[12px] rounded-[12px] p-[10px_12px] ${
        state === "running" ? "bg-[var(--surface)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]" : ""
      }`}
    >
      {state === "done" && (
        <div className="flex h-[18px] w-[18px] shrink-0 flex-row items-center justify-center gap-0 rounded-full bg-[var(--accent)]">
          <Icon name="check" className="h-[11px] w-[11px] shrink-0 text-white" />
        </div>
      )}
      {state === "running" && (
        <div className="flex h-[18px] w-[18px] shrink-0 flex-row items-center justify-center gap-0 rounded-full bg-[var(--soft)] [box-shadow:0px_0px_10px_var(--glow)] [outline:1.5px_solid_var(--accent)] [outline-offset:-0.75px]">
          <Icon name="loader" className="h-[11px] w-[11px] shrink-0 text-[var(--accent)] motion-safe:animate-spin motion-safe:[animation-duration:1.4s]" />
        </div>
      )}
      {state === "pending" && (
        <div className="flex h-[18px] w-[18px] shrink-0 flex-row items-center justify-center gap-0 rounded-full [outline:1.5px_solid_var(--line)] [outline-offset:-0.75px]" />
      )}
      <div className="flex h-fit flex-1 flex-col items-start justify-start gap-[2px]">
        <div className="flex w-full shrink-0 flex-row items-center gap-[8px]">
          <div
            className={`flex-1 text-left text-[13px] ${
              state === "pending" ? "font-medium text-[var(--muted)]" : "font-medium text-[var(--ink)]"
            }`}
          >
            {label}
          </div>
          <div
            className={`font-code text-[11px] whitespace-nowrap ${
              state === "running" ? "text-[var(--accent)]" : "text-[var(--muted)]"
            }`}
          >
            {time}
          </div>
        </div>
        <div className="w-full text-[12px] text-[var(--muted)]">{detail}</div>
      </div>
    </div>
  );
}

function StatTile({ label, value, unit, delta, detail }: { label: string; value: string; unit: string; delta: string; detail: string }) {
  return (
    <div className="flex h-fit w-full flex-col items-start justify-start gap-[14px] rounded-[16px] bg-[var(--surface)] p-[20px] transition-transform duration-200 ease-enter hover:-translate-y-[2px] sm:flex-1 [outline:1px_solid_var(--line)] [outline-offset:-0.5px]">
      <div className="flex w-full shrink-0 flex-row items-center justify-between gap-0">
        <div className="text-[13px] whitespace-nowrap text-[var(--muted)]">{label}</div>
        <Icon name="activity" className="h-[14px] w-[14px] shrink-0 text-[var(--muted)]" />
      </div>
      <div className="flex w-fit shrink-0 flex-row items-end justify-start gap-[6px]">
        <div className="font-display text-[40px]/[40px] font-medium tracking-[-1.5px] whitespace-nowrap text-[var(--ink)]">
          {value}
        </div>
        <div className="flex w-fit shrink-0 flex-row items-start justify-start gap-0 p-[0px_0px_4px_0px]">
          <div className="font-code text-[13px] whitespace-nowrap text-[var(--muted)]">{unit}</div>
        </div>
      </div>
      <div className="flex w-full shrink-0 flex-row items-center justify-start gap-[8px]">
        <div className="flex w-fit shrink-0 flex-row items-center gap-[4px] rounded-full bg-[var(--soft)] p-[3px_8px_3px_6px]">
          <Icon name="arrow-up-right" className="h-[12px] w-[12px] shrink-0 text-[var(--accent-strong)]" />
          <div className="font-code text-[12px] font-medium whitespace-nowrap text-[var(--accent-strong)]">{delta}</div>
        </div>
        <div className="text-[12px] whitespace-nowrap text-[var(--muted)]">{detail}</div>
      </div>
    </div>
  );
}

export function ProductWindow() {
  const [ref, inView] = useInView<HTMLDivElement>({ once: true, threshold: 0.15 });

  return (
    <div
      ref={ref}
      className="relative isolate z-[3] flex h-fit w-full max-w-[1120px] shrink-0 flex-col items-start justify-start gap-0 overflow-hidden rounded-[28px] bg-[var(--glass)] [backdrop-filter:blur(15px)] [box-shadow:0px_40px_90px_var(--shadow),0px_0px_60px_var(--glow)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]"
    >
      <div className="flex h-[61.5px] w-full shrink-0 flex-row items-center justify-between gap-[10px] p-[12px_14px] md:gap-0 md:p-[14px_20px] [border-width:0px_0px_1px_0px] [border-style:solid] [border-color:var(--hairline)]">
        <div className="flex h-fit flex-1 shrink-0 flex-row items-start justify-start gap-[7px]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[10px] w-[10px] shrink-0 rounded-full bg-[var(--line)]" />
          ))}
        </div>
        <div className="flex w-fit shrink-0 flex-row items-center justify-start gap-[8px] rounded-full bg-[var(--soft)] p-[6px_14px]">
          <Icon name="server" className="h-[12px] w-[12px] shrink-0 text-[var(--accent)]" />
          <div className="font-code text-[12px] whitespace-nowrap text-[var(--accent-strong)]">opsmira · production</div>
        </div>
        <div className="hidden h-fit flex-1 shrink-0 flex-row items-start justify-end gap-0 md:flex">
          <LiveBanner label="Investigating" detail="checkout-api" time="00:12" />
        </div>
      </div>

      <div className="flex h-fit w-full shrink-0 flex-col items-start justify-start gap-[24px] p-[16px] md:p-[24px] xl:flex-row xl:gap-[28px] xl:p-[32px]">
        <div className="flex h-fit w-full min-w-0 flex-col items-start justify-start gap-[24px] xl:flex-1">
          <div className="flex w-fit max-w-full shrink-0 flex-row items-center gap-[10px] rounded-full bg-[var(--surface)] p-[10px_16px_10px_10px] [box-shadow:0px_4px_14px_var(--shadow)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]">
            <div className="flex h-[26px] w-[26px] shrink-0 flex-row items-center justify-center gap-0 rounded-full bg-[var(--ink)]">
              <div className="text-[11px] font-bold whitespace-nowrap text-[var(--canvas)]">S</div>
            </div>
            <div className="text-[14px] font-medium whitespace-nowrap text-[var(--ink)]">
              <Typewriter text="Why is checkout slow right now?" startOnView delay={350} speed={45} />
            </div>
          </div>

          <div className="flex h-fit w-full shrink-0 flex-col items-start justify-start gap-[12px]">
            <div className="flex w-fit shrink-0 flex-row items-center gap-[8px]">
              <Icon
                name="loader-circle"
                className="h-[14px] w-[14px] shrink-0 text-[var(--accent)] motion-safe:animate-spin motion-safe:[animation-duration:1.6s]"
              />
              <div className="text-[12px] whitespace-nowrap text-[var(--accent)]">Reading checkout-api traces…</div>
            </div>
            <div className="w-fit max-w-full shrink-0">
              <div className="font-display text-[24px]/[28px] font-semibold tracking-[-0.9px] text-[var(--ink)] md:text-[34px]/[37px] md:tracking-[-1.1px] md:whitespace-nowrap">
                <Typewriter text="Checkout is waiting on Redis" startOnView delay={900} speed={36} />
                <span className="ml-[4px] inline-block h-[0.85em] w-[3px] rounded-[2px] bg-[var(--accent)] align-[-0.1em] [box-shadow:0px_0px_8px_var(--glow)] motion-safe:animate-[caret-blink_1.15s_infinite]" />
              </div>
            </div>
            <div className="flex h-fit w-full shrink-0 flex-col items-start justify-start gap-[8px] p-[6px_0px_0px_0px]">
              <div className="skeleton h-[10px] w-full shrink-0 rounded-[5px]" />
              <div className="skeleton skeleton-2 h-[10px] w-[65%] shrink-0 rounded-[5px]" />
            </div>
          </div>

          <div className="flex h-fit w-full shrink-0 flex-col items-start justify-start gap-[4px] rounded-[16px] bg-[var(--surface)] p-[8px] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]">
            <div className="flex h-fit w-full shrink-0 flex-row items-center justify-between gap-0 p-[8px_12px_6px_12px]">
              <div className="font-display text-[15px] font-semibold whitespace-nowrap text-[var(--ink)]">Plan</div>
              <div className="font-code text-[11px] whitespace-nowrap text-[var(--muted)]">2 / 4</div>
            </div>
            <div className="flex h-fit w-full shrink-0 flex-col items-start justify-start gap-[2px]">
              {PLAN_STEPS.map((step) => (
                <PlanRow key={step.label} {...step} />
              ))}
            </div>
          </div>
        </div>

        <div className="flex h-fit w-full shrink-0 flex-col items-start justify-start gap-[20px] xl:w-[500px]">
          <div className="flex h-fit w-full shrink-0 flex-col items-start justify-start gap-[20px] rounded-[16px] bg-[var(--surface)] p-[18px] md:p-[24px] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]">
            <div className="flex h-fit w-full shrink-0 flex-row items-end justify-between gap-[16px]">
              <div className="flex h-fit flex-1 flex-col items-start justify-start gap-[4px]">
                <div className="w-full text-[13px] text-left text-[var(--muted)]">checkout p95 latency</div>
                <div className="font-display text-[30px] font-semibold tracking-[-0.5px] whitespace-nowrap text-[var(--ink)]">
                  2.4s
                </div>
              </div>
              <div className="flex w-fit shrink-0 flex-row items-center gap-[6px]">
                <div className="h-[6px] w-[6px] shrink-0 rounded-full bg-[var(--accent)] motion-safe:animate-[dot-pulse_2.2s_ease-in-out_infinite]" />
                <div className="font-code text-[11px] whitespace-nowrap text-[var(--muted)]">latest · 5s ago</div>
              </div>
            </div>
            <div className="-mb-[0.5px] flex h-[139.5px] w-full shrink-0 flex-row items-end justify-start gap-[6px] [border-width:0px_0px_1px_0px] [border-style:solid] [border-color:var(--line)]">
              {BAR_HEIGHTS.map((h, i) => (
                <div
                  key={i}
                  className={`${inView ? "bar-grow" : "opacity-0"} flex-1 ${h} rounded-[4px_4px_1px_1px] ${
                    i === BAR_HEIGHTS.length - 1
                      ? "bg-[var(--accent)] [box-shadow:0px_0px_16px_var(--glow)]"
                      : "bg-[var(--line)]"
                  }`}
                />
              ))}
            </div>
            <div className="flex h-fit w-full shrink-0 flex-row items-start justify-between gap-0">
              {AXIS.map((label) => (
                <div key={label} className="font-code text-[10px] whitespace-nowrap text-[var(--muted)]">
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className="flex h-fit w-full shrink-0 flex-col items-stretch justify-start gap-[16px] sm:flex-row sm:items-start">
            <StatTile label="Error rate" value="4.2" unit="%" delta="+12.4%" detail="vs. last hour" />
            <StatTile label="Redis pool" value="4" unit="/ 32" delta="+12.4%" detail="vs. last hour" />
          </div>
        </div>
      </div>
    </div>
  );
}

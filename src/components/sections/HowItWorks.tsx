import { Icon } from "../Icons";
import { LiveBanner } from "../LiveBanner";
import { ApprovalCard } from "../ApprovalCard";
import { Reveal, useInView } from "../Reveal";
import { Typewriter } from "../Typewriter";

const STEPS = [
  { number: "01", title: "Ask in plain words" },
  { number: "02", title: "Watch it work, live" },
  { number: "03", title: "Approve every change" },
] as const;

const DISK_SEGMENTS = ["w-[48%] bg-[var(--accent)]", "w-[27%] bg-[var(--accent-2)]", "w-[15%] bg-[var(--accent-strong)]", "flex-1 bg-[var(--line)]"];

/** The usage bar fills segment by segment from the left once it scrolls into view. */
function DiskBar() {
  const [ref, shown] = useInView<HTMLDivElement>({ once: true, threshold: 0.6 });
  return (
    <div
      ref={ref}
      className="flex h-[10px] w-full shrink-0 flex-row items-start justify-start gap-[2px] overflow-hidden rounded-[5px] bg-[var(--soft)]"
    >
      {DISK_SEGMENTS.map((seg, i) => (
        <div
          key={i}
          style={{ transitionDelay: `${300 + i * 90}ms` }}
          className={`h-[10px] shrink-0 origin-left transition-transform duration-[800ms] ease-enter motion-reduce:transition-none ${
            shown ? "scale-x-100" : "scale-x-0"
          } ${seg}`}
        />
      ))}
    </div>
  );
}

function Stage({ step }: { step: (typeof STEPS)[number]["number"] }) {
  if (step === "01") {
    return (
      <div className="flex min-h-[300px] md:min-h-[370px] w-full shrink-0 flex-col items-start justify-center gap-0 overflow-hidden rounded-[24px] bg-[var(--soft)] p-[20px] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px] md:p-[28px] xl:h-[370px]">
        <div className="flex w-full shrink-0 flex-col items-start justify-start gap-[16px] rounded-[18px] border-[1.5px] border-transparent p-[18px_20px] [background:linear-gradient(var(--surface),var(--surface))_padding-box,linear-gradient(90deg,var(--accent)_0%,var(--accent-2)_50%,var(--line)_100%)_border-box] [box-shadow:0px_14px_34px_var(--shadow),0px_0px_24px_var(--glow)]">
          <div className="flex w-fit shrink-0 flex-row items-center justify-start gap-[2px]">
            <div className="text-[16px] font-medium whitespace-nowrap text-[var(--ink)]">
              <Typewriter text="Why is my disk full" startOnView delay={500} speed={55} />
            </div>
            <div className="h-[18px] w-[2px] shrink-0 bg-[var(--accent)] motion-safe:animate-[caret-blink_1.15s_infinite]" />
          </div>
          <div className="flex w-full shrink-0 flex-row items-center justify-between gap-0">
            <div className="font-code text-[11px] whitespace-nowrap text-[var(--muted)]">web-01 · production</div>
            <div className="flex h-[30px] w-[30px] shrink-0 cursor-pointer flex-row items-center justify-center gap-0 rounded-[10px] transition-[transform,translate,scale,rotate] duration-200 ease-enter hover:scale-105 active:scale-[0.92] active:duration-[120ms] [background-image:linear-gradient(45deg,var(--accent)_14.645%,var(--accent-2)_85.355%)]">
              <Icon name="arrow-up" className="h-[14px] w-[14px] shrink-0 text-white" />
            </div>
          </div>
        </div>
        <div className="flex w-fit max-w-full shrink-0 flex-row flex-wrap items-start justify-start gap-[8px] p-[18px_0px_0px_0px]">
          {["Show slow queries", "Check certs"].map((label) => (
            <div
              key={label}
              className="flex w-fit shrink-0 cursor-pointer flex-row items-center justify-start gap-[6px] rounded-full bg-[var(--surface)] p-[7px_12px_7px_10px] transition-[transform,translate,scale,rotate,outline-color] duration-200 ease-enter hover:-translate-y-[2px] hover:[outline-color:var(--accent)] [outline:1px_solid_var(--line)] [outline-offset:-0.5px]"
            >
              <Icon name="sparkles" className="h-[13px] w-[13px] shrink-0 text-[var(--accent)]" />
              <div className="text-[13px] whitespace-nowrap text-[var(--ink)]">{label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (step === "02") {
    const LEGEND = [
      { label: "Compute", value: "48%", swatch: "bg-[var(--accent)]" },
      { label: "Database", value: "27%", swatch: "bg-[var(--accent-2)]" },
      { label: "Logs", value: "15%", swatch: "bg-[var(--accent-strong)]" },
      { label: "Free", value: "10%", swatch: "bg-[var(--line)]" },
    ];
    return (
      <div className="flex min-h-[300px] md:min-h-[370px] w-full shrink-0 flex-col items-start justify-center gap-[14px] overflow-hidden rounded-[24px] bg-[var(--soft)] p-[20px] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px] md:p-[28px] xl:h-[370px]">
        <LiveBanner label="Scanning /var" detail="412 GB found" time="00:07" />
        <div className="flex w-full shrink-0 flex-col items-start justify-start gap-[16px] rounded-[16px] bg-[var(--surface)] p-[18px] sm:p-[24px] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]">
          <div className="flex w-full shrink-0 flex-row flex-wrap items-end justify-between gap-x-[12px] gap-y-[2px]">
            <div className="text-[13px] text-[var(--muted)]">Disk usage by volume</div>
            <div className="font-code text-[12px] whitespace-nowrap text-[var(--ink)]">412 / 500 GB</div>
          </div>
          <DiskBar />
          <div className="flex w-full shrink-0 flex-row flex-wrap items-start justify-start gap-x-[20px] gap-y-[8px]">
            {LEGEND.map((item) => (
              <div key={item.label} className="flex w-fit shrink-0 flex-row items-center justify-start gap-[8px]">
                <div className={`h-[8px] w-[8px] shrink-0 rounded-full ${item.swatch}`} />
                <div className="text-[12px] whitespace-nowrap text-[var(--muted)]">{item.label}</div>
                <div className="font-code text-[12px] whitespace-nowrap text-[var(--ink)]">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[300px] md:min-h-[370px] w-full shrink-0 flex-col items-start justify-center gap-0 overflow-hidden rounded-[24px] bg-[var(--soft)] p-[20px] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px] md:p-[28px] xl:h-[370px]">
      <ApprovalCard
        status="Awaiting approval"
        timestamp="just now"
        title="Delete 38 old snapshots"
        context="Frees 412 GB. Latest per volume is kept."
        command="opsmira snapshots prune --older 90d"
        riskFilled={2}
        riskLevel="Medium"
        riskDetail="~3s downtime"
        className="[box-shadow:0px_0px_24px_var(--glow)]"
      />
    </div>
  );
}

const BODIES: Record<string, string> = {
  "01": "“Why is my disk full?” or “restart the worker safely.” No commands to remember.",
  "02": "Every check Opsmira runs shows up as it happens: steps, logs and charts that refresh in place.",
  "03": "Nothing touches production until you say yes. Each request shows the exact command and its risk.",
};

export function HowItWorks() {
  return (
    <section id="how-it-works" className="flex w-full shrink-0 flex-col items-start justify-start gap-[44px] p-[72px_20px] md:gap-[56px] md:p-[96px_40px] lg:p-[120px_60px] xl:gap-[72px] xl:p-[140px_120px]">
      <Reveal className="flex w-full shrink-0 flex-col items-start justify-start gap-[20px] lg:flex-row lg:items-end lg:justify-between lg:gap-0">
        <div className="flex w-fit shrink-0 flex-col items-start justify-start gap-[16px]">
          <div className="font-code text-[12px] tracking-[1.6px] whitespace-nowrap text-[var(--accent)]">HOW IT WORKS</div>
          <div className="font-display text-[38px]/[40px] font-semibold tracking-[-1.5px] text-[var(--ink)] md:text-[48px]/[48px] md:tracking-[-2px] xl:text-[60px]/[60px] xl:tracking-[-2.4px]">
            Ask. Watch. Approve.
          </div>
        </div>
        <div className="w-full max-w-[420px] shrink-0 text-[16px]/[25px] text-[var(--muted)] lg:w-[420px] lg:text-[17px]/[26px]">
          No dashboards to configure. Opsmira builds the right view for each question, then keeps it updated while it
          works.
        </div>
      </Reveal>

      <div className="flex w-full shrink-0 flex-col items-start justify-start gap-[40px] xl:flex-row xl:gap-[24px]">
        {STEPS.map((step, i) => (
          <Reveal
            key={step.number}
            delay={60 * (i + 1)}
            pop
            className="flex h-fit w-full min-w-0 flex-col items-start justify-start gap-[28px] xl:flex-1"
          >
            <Stage step={step.number} />
            <div className="flex w-full shrink-0 flex-col items-start justify-start gap-[10px] p-[0px_8px]">
              <div className="flex w-fit shrink-0 flex-row items-center justify-start gap-[12px]">
                <div className="font-code text-[13px] whitespace-nowrap text-[var(--accent)]">{step.number}</div>
                <div className="font-display text-[24px] font-semibold tracking-[-0.6px] whitespace-nowrap text-[var(--ink)]">
                  {step.title}
                </div>
              </div>
              <div className="w-full text-[14px]/[23px] text-[var(--muted)] md:text-[15px]/[24px]">{BODIES[step.number]}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

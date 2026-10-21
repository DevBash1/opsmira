import { Icon } from "../Icons";
import { Reveal, useInView } from "../Reveal";

interface Row {
  chips: string[];
  highlight?: number;
  anim: string;
}

const ROWS: Row[] = [
  {
    chips: [
      "Why is my disk full?",
      "Show slow queries",
      "Is my TLS cert expiring?",
      "Restart the worker safely",
      "What changed since Friday?",
      "Who is using port 8080?",
    ],
    anim: "motion-safe:animate-[marquee-left_85s_linear_infinite]",
  },
  {
    chips: [
      "Roll back the last deploy",
      "Clean up old Docker images",
      "Why did the build fail?",
      "Show live nginx logs",
      "Back up the database now",
      "How much am I spending?",
    ],
    highlight: 2,
    anim: "motion-safe:animate-[marquee-right_100s_linear_infinite] motion-safe:[animation-delay:-30s]",
  },
  {
    chips: [
      "Which jobs run tonight?",
      "Open port 443",
      "Find the memory leak",
      "Show running containers",
      "Rotate API secrets",
      "Did the backup finish?",
    ],
    anim: "motion-safe:animate-[marquee-left_92s_linear_infinite] motion-safe:[animation-delay:-15s]",
  },
];

function Chip({ label, highlight = false }: { label: string; highlight?: boolean }) {
  return (
    <div
      className={`flex w-fit shrink-0 cursor-pointer flex-row items-center justify-start gap-[10px] rounded-full bg-[var(--surface)] p-[14px_22px] transition-[transform,translate,scale,rotate,box-shadow,outline-color] duration-200 ease-enter hover:-translate-y-[2px] ${
        highlight
          ? "[box-shadow:0px_10px_30px_var(--glow)] [outline:1px_solid_var(--accent)] [outline-offset:-0.5px]"
          : "hover:[outline-color:var(--accent)] [outline:1px_solid_var(--line)] [outline-offset:-0.5px]"
      }`}
    >
      <Icon
        name={highlight ? "sparkles" : "corner-down-right"}
        className={`h-[15px] w-[15px] shrink-0 ${highlight ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}
      />
      <div
        className={`text-[16px] whitespace-nowrap ${
          highlight ? "font-semibold text-[var(--ink)]" : "text-[var(--muted)]"
        }`}
      >
        {label}
      </div>
    </div>
  );
}

export function AskAnything() {
  const [ref, inView] = useInView<HTMLElement>({ once: false, rootMargin: "200px 0px 200px 0px", threshold: 0 });

  return (
    <section
      ref={ref}
      data-marquee-paused={inView ? "false" : "true"}
      className="relative flex w-full shrink-0 flex-col items-center justify-start gap-[36px] overflow-hidden p-[72px_0px_60px_0px] md:gap-[44px] md:p-[100px_0px_84px_0px] xl:gap-[56px] xl:p-[150px_0px_140px_0px]"
    >
      <Reveal className="relative z-0 flex w-fit max-w-full shrink-0 flex-col items-center justify-start gap-[16px] px-5">
        <div className="font-code text-[12px] tracking-[1.6px] whitespace-nowrap text-[var(--accent)]">
          ONE INPUT, EVERY ANSWER
        </div>
        <div className="font-display text-center text-[32px]/[36px] font-semibold tracking-[-1.3px] text-[var(--ink)] md:text-[44px]/[46px] md:tracking-[-1.8px] md:whitespace-nowrap xl:text-[60px]/[60px] xl:tracking-[-2.4px]">
          If you can ask it, Opsmira can show it.
        </div>
      </Reveal>

      {ROWS.map((row, rowIndex) => (
        <Reveal
          key={rowIndex}
          delay={rowIndex * 90}
          className={`relative flex w-full shrink-0 flex-row items-start justify-center ${["z-[1]", "z-[2]", "z-[3]"][rowIndex]}`}
        >
          <div
            data-marquee
            className={`flex w-max shrink-0 flex-row items-start justify-start hover:[animation-play-state:paused] ${row.anim}`}
          >
            {[0, 1].map((copy) => (
              <div
                key={copy}
                aria-hidden={copy === 1}
                className="flex shrink-0 flex-row items-start justify-start gap-[14px] pr-[14px]"
              >
                {row.chips.map((label, chipIndex) => (
                  <Chip key={`${copy}-${chipIndex}`} label={label} highlight={rowIndex === 1 && chipIndex === row.highlight} />
                ))}
              </div>
            ))}
          </div>
        </Reveal>
      ))}

      <div className="pointer-events-none absolute top-0 left-0 z-[4] h-full w-[80px] md:w-[160px] xl:w-[300px] [background-image:linear-gradient(-90deg,transparent_0%,var(--canvas)_100%)]" />
      <div className="pointer-events-none absolute top-0 right-0 z-[5] h-full w-[80px] md:w-[160px] xl:w-[300px] [background-image:linear-gradient(90deg,transparent_0%,var(--canvas)_100%)]" />
    </section>
  );
}

import { Icon } from "./Icons";

const SUGGESTIONS: { label: string; icon: "droplet" | "box" | "cloud" | "key-round" }[] = [
  { label: "Check memory usage", icon: "droplet" },
  { label: "Diagnose a container", icon: "box" },
  { label: "Deploy an app", icon: "cloud" },
  { label: "Review security", icon: "key-round" },
];

export function ConsoleIdle({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="m-auto flex w-full max-w-[640px] shrink-0 flex-col items-center gap-[24px] p-[40px_20px] text-center">
      <div className="relative flex h-[160px] w-[160px] shrink-0 flex-row items-center justify-center motion-safe:animate-blur-rise sm:h-[200px] sm:w-[200px]">
        <div className="absolute h-full w-full rounded-full bg-[radial-gradient(circle,var(--glow),transparent_70%)] motion-safe:animate-[dot-pulse_5s_ease-in-out_infinite]" />
        <div className="absolute h-[85%] w-[85%] rounded-full border-[1.5px] border-[var(--line)] motion-safe:animate-[ring-breathe_18s_ease-in-out_infinite]" />
        <div className="absolute h-[62%] w-[62%] rounded-full border-[1.5px] border-[var(--line)] motion-safe:animate-[ring-breathe_22s_ease-in-out_infinite] motion-safe:[animation-delay:-7s]" />
        <div className="absolute h-[38%] w-[38%] rounded-full bg-[var(--hairline)]" />
        <div className="relative flex h-[56px] w-[56px] shrink-0 flex-row items-center justify-center rounded-full bg-[linear-gradient(-135deg,var(--accent),var(--accent-2))] [box-shadow:0px_12px_32px_var(--glow)]">
          <Icon name="orbit" className="h-[24px] w-[24px] text-[var(--canvas)] motion-safe:animate-[spin-slow_24s_linear_infinite]" />
        </div>
        <div className="absolute top-[14%] right-[18%] h-[9px] w-[9px] shrink-0 rounded-full bg-[var(--accent)] motion-safe:animate-[float-y_6.5s_ease-in-out_infinite]" />
        <div className="absolute bottom-[18%] left-[16%] h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--accent-2)] motion-safe:animate-[float-y_7.5s_ease-in-out_infinite] motion-safe:[animation-delay:-2s]" />
      </div>

      <h1 className="font-display flex w-full shrink-0 flex-col items-center gap-[2px] text-[40px] leading-[1.05] font-semibold tracking-[-1px] sm:text-[56px]">
        <span className="block overflow-hidden pb-[0.08em]">
          <span style={{ animationDelay: "90ms" }} className="block text-[var(--ink)] motion-safe:animate-mask-up">
            Your server.
          </span>
        </span>
        <span className="block overflow-hidden pb-[0.08em]">
          <span
            style={{ animationDelay: "200ms" }}
            className="block bg-[linear-gradient(90deg,var(--accent),var(--accent-2))] bg-clip-text text-transparent motion-safe:animate-mask-up"
          >
            A little more intuitive.
          </span>
        </span>
      </h1>

      <p style={{ animationDelay: "320ms" }} className="max-w-[440px] text-[15px]/[24px] text-[var(--muted)] motion-safe:animate-blur-rise sm:text-[16px]">
        Ask a question or set something in motion. Your workspace takes shape from there.
      </p>

      <div className="flex w-full shrink-0 flex-row flex-wrap items-center justify-center gap-[12px] p-[12px_0px_0px_0px]">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onPick(s.label)}
            style={{ animationDelay: `${400 + i * 60}ms` }}
            className="group flex w-fit shrink-0 cursor-pointer flex-row items-center gap-[10px] rounded-full bg-[var(--glass)] p-[6px_16px_6px_6px] transition-[background-color,box-shadow,outline-color,transform,translate,scale] duration-200 ease-enter hover:-translate-y-[1px] hover:bg-[var(--surface)] hover:[box-shadow:0px_10px_26px_var(--shadow)] active:scale-[0.97] active:duration-[120ms] active:[outline-color:var(--accent)] motion-safe:animate-blur-rise [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]"
          >
            <div className="flex h-[30px] w-[30px] shrink-0 flex-row items-center justify-center rounded-full bg-[var(--soft)] transition-colors duration-200 ease-enter group-hover:bg-[var(--glow)]">
              <Icon name={s.icon} className="h-[14px] w-[14px] shrink-0 text-[var(--accent)]" />
            </div>
            <span className="text-[13px] font-medium whitespace-nowrap text-[var(--ink)]">{s.label}</span>
            <Icon
              name="arrow-up-right"
              className="h-[13px] w-[13px] shrink-0 text-[var(--accent)] transition-transform duration-200 ease-enter group-hover:translate-x-[1px] group-hover:-translate-y-[1px]"
            />
          </button>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import { PrimaryButton, SecondaryButton } from "./Buttons";
import { Footer } from "./Footer";
import { Reveal, usePauseOffscreen } from "./Reveal";

const INSTALL_CMD = "curl -fsSL opsmira.sh/install | sh";

const RINGS: Record<"landing" | "pricing", string[]> = {
  landing: [
    "absolute left-[-20px] top-[-370px] h-[1400px] w-[1400px] rounded-full border-[2.8px] border-[var(--line)] motion-safe:animate-[ring-breathe_18s_ease-in-out_infinite]",
    "absolute left-[180px] top-[-170px] h-[1000px] w-[1000px] rounded-full border-[2.5px] border-[var(--line)] motion-safe:animate-[ring-breathe_22s_ease-in-out_infinite] motion-safe:[animation-delay:-7s]",
    "absolute left-[370px] top-[20px] h-[620px] w-[620px] rounded-full border-[2.48px] border-[var(--line)] motion-safe:animate-[ring-breathe_26s_ease-in-out_infinite] motion-safe:[animation-delay:-13s]",
  ],
  pricing: [
    "absolute left-[80px] top-[-300px] h-[1200px] w-[1200px] rounded-full border-[2.4px] border-[var(--line)] motion-safe:animate-[ring-breathe_20s_ease-in-out_infinite]",
    "absolute left-[280px] top-[-100px] h-[800px] w-[800px] rounded-full border-[2.4px] border-[var(--line)] motion-safe:animate-[ring-breathe_24s_ease-in-out_infinite] motion-safe:[animation-delay:-9s]",
  ],
};

const COPY = {
  landing: {
    title: (
      <>
        Meet your server
        <br />
        properly.
      </>
    ),
    body: "Install in two minutes. Free for your first server.",
    primary: "Connect a server",
    secondary: "Talk to us",
  },
  pricing: {
    title: (
      <>
        Start with one server.
        <br />
        It’s free.
      </>
    ),
    body: "No credit card. Connect in two minutes.",
    primary: "Connect your first server",
    secondary: "Talk to sales",
  },
} as const;

export function FinalCta({ variant }: { variant: "landing" | "pricing" }) {
  const landing = variant === "landing";
  const copy = COPY[variant];

  const pause = usePauseOffscreen<HTMLDivElement>();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onCopy = () => {
    navigator.clipboard?.writeText(INSTALL_CMD).catch(() => {});
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div {...pause} className="flex w-full shrink-0 flex-row items-start justify-start p-[0px_16px_16px_16px] md:p-[0px_40px_40px_40px]">
      <div
        className={`theme-dark relative isolate flex flex-1 flex-col items-center justify-start gap-0 overflow-hidden rounded-[40px] bg-[var(--canvas)] ${
          landing
            ? "p-[64px_20px_40px_20px] md:p-[100px_48px_44px_48px] xl:p-[130px_80px_48px_80px]"
            : "p-[56px_20px_40px_20px] md:p-[80px_48px_44px_48px] xl:p-[100px_80px_48px_80px]"
        }`}
      >
        <div
          className={`absolute top-0 left-1/2 z-0 w-[1360px] -translate-x-1/2 overflow-hidden ${
            landing ? "h-[900px]" : "h-[700px]"
          }`}
        >
          <div
            className={`absolute left-[230px] z-0 rounded-full bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,var(--glow)_0%,#00000000_100%)] motion-safe:animate-[glow-drift_21s_ease-in-out_infinite] ${
              landing ? "top-[120px] h-[700px] w-[900px]" : "top-[60px] h-[600px] w-[900px]"
            }`}
          />
          {RINGS[variant].map((ring) => (
            <div key={ring} className={ring} />
          ))}
        </div>

        <Reveal delay={60} className="relative z-[1] w-full">
          <div
            className={`flex w-full flex-col items-center justify-start ${
              landing ? "gap-[24px] p-[0px_0px_64px_0px] md:gap-[28px] md:p-[0px_0px_100px_0px] xl:p-[0px_0px_140px_0px]" : "gap-[20px] p-[0px_0px_48px_0px] md:gap-[24px] md:p-[0px_0px_80px_0px] xl:p-[0px_0px_110px_0px]"
            }`}
          >
            {landing && (
              <div className="flex h-[64px] w-[64px] shrink-0 flex-row items-center justify-center gap-0 rounded-[20px] bg-[linear-gradient(90deg,var(--accent)_0%,var(--accent-2)_100%)] [box-shadow:0px_0px_40px_var(--glow)] motion-safe:animate-[float-y_7s_ease-in-out_infinite]">
                <Icon name="orbit" className="h-[30px] w-[30px] shrink-0 text-white motion-safe:animate-[spin-slow_18s_linear_infinite]" />
              </div>
            )}

            <div
              className={`font-display text-center font-semibold text-[var(--ink)] ${
                landing
                  ? "text-[36px]/[38px] tracking-[-1.4px] md:text-[56px]/[56px] md:tracking-[-2.2px] xl:text-[80px]/[80px] xl:tracking-[-3.2px]"
                  : "text-[34px]/[36px] tracking-[-1.3px] md:text-[46px]/[46px] md:tracking-[-1.9px] xl:text-[64px]/[64px] xl:tracking-[-2.6px]"
              }`}
            >
              {copy.title}
            </div>

            <div className="text-center text-[16px] text-[var(--muted)] md:text-[18px]">{copy.body}</div>

            {landing && (
              <div className="flex w-full max-w-full shrink-0 flex-row items-center justify-start gap-[8px] rounded-full bg-[var(--glass)] p-[5px_5px_5px_12px] sm:w-fit sm:gap-[10px] sm:p-[6px_6px_6px_14px] [backdrop-filter:blur(8px)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px] xl:gap-[14px] xl:p-[8px_8px_8px_22px]">
                <div className="font-code hidden text-[15px] whitespace-nowrap text-[var(--accent)] xl:block">$</div>
                <div className="font-code min-w-0 flex-1 overflow-x-auto text-[11px] whitespace-nowrap text-[var(--ink)] hide-scrollbar sm:flex-none sm:text-[12px] xl:text-[15px]">{INSTALL_CMD}</div>
                <button
                  type="button"
                  onClick={onCopy}
                  aria-label="Copy install command"
                  className="flex h-[32px] w-[32px] shrink-0 cursor-pointer flex-row items-center justify-center gap-0 rounded-full bg-[var(--soft)] transition-[transform,translate,scale,rotate,background-color] duration-200 ease-enter hover:bg-[var(--glow)] active:scale-[0.92] active:duration-[120ms] xl:h-[36px] xl:w-[36px]"
                >
                  <Icon
                    key={copied ? "check" : "copy"}
                    name={copied ? "check" : "copy"}
                    className="h-[15px] w-[15px] shrink-0 text-[var(--accent)] motion-safe:animate-fade-in"
                  />
                </button>
              </div>
            )}

            <div className={`flex w-fit max-w-full shrink-0 flex-row flex-wrap items-center justify-center gap-[10px] xl:gap-[14px] ${landing ? "" : "p-[8px_0px_0px_0px]"}`}>
              <PrimaryButton tone="steel">{copy.primary}</PrimaryButton>
              <SecondaryButton tone="steel">{copy.secondary}</SecondaryButton>
            </div>
          </div>
        </Reveal>

        <Footer />
      </div>
    </div>
  );
}

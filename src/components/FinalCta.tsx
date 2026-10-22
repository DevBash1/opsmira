import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import { PrimaryButton, SecondaryButton } from "./Buttons";
import { Footer } from "./Footer";
import { Reveal, usePauseOffscreen } from "./Reveal";
import { DOCS_URL, INSTALL_COMMANDS, REPO_URL } from "../lib/site";

const RINGS = [
  "absolute left-[-20px] top-[-370px] h-[1400px] w-[1400px] rounded-full border-[2.8px] border-[var(--line)] motion-safe:animate-[ring-breathe_18s_ease-in-out_infinite]",
  "absolute left-[180px] top-[-170px] h-[1000px] w-[1000px] rounded-full border-[2.5px] border-[var(--line)] motion-safe:animate-[ring-breathe_22s_ease-in-out_infinite] motion-safe:[animation-delay:-7s]",
  "absolute left-[370px] top-[20px] h-[620px] w-[620px] rounded-full border-[2.48px] border-[var(--line)] motion-safe:animate-[ring-breathe_26s_ease-in-out_infinite] motion-safe:[animation-delay:-13s]",
];

export function FinalCta() {
  const [tab, setTab] = useState<(typeof INSTALL_COMMANDS)[number]["id"]>("script");
  const install = INSTALL_COMMANDS.find((c) => c.id === tab) ?? INSTALL_COMMANDS[0];

  const pause = usePauseOffscreen<HTMLDivElement>();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onCopy = () => {
    navigator.clipboard?.writeText(install.command).catch(() => {});
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div {...pause} id="install" className="flex w-full shrink-0 flex-row items-start justify-start p-[0px_16px_16px_16px] md:p-[0px_40px_40px_40px]">
      <div className="theme-dark relative isolate flex flex-1 flex-col items-center justify-start gap-0 overflow-hidden rounded-[40px] bg-[var(--canvas)] p-[64px_20px_40px_20px] md:p-[100px_48px_44px_48px] xl:p-[130px_80px_48px_80px]">
        <div className="absolute top-0 left-1/2 z-0 h-[900px] w-[1360px] -translate-x-1/2 overflow-hidden">
          <div className="absolute top-[120px] left-[230px] z-0 h-[700px] w-[900px] rounded-full bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,var(--glow)_0%,#00000000_100%)] motion-safe:animate-[glow-drift_21s_ease-in-out_infinite]" />
          {RINGS.map((ring) => (
            <div key={ring} className={ring} />
          ))}
        </div>

        <Reveal delay={60} className="relative z-[1] w-full">
          <div className="flex w-full flex-col items-center justify-start gap-[24px] p-[0px_0px_64px_0px] md:gap-[28px] md:p-[0px_0px_100px_0px] xl:p-[0px_0px_140px_0px]">
            <div className="flex h-[64px] w-[64px] shrink-0 flex-row items-center justify-center gap-0 rounded-[20px] bg-[linear-gradient(90deg,var(--accent)_0%,var(--accent-2)_100%)] [box-shadow:0px_0px_40px_var(--glow)] motion-safe:animate-[float-y_7s_ease-in-out_infinite]">
              <Icon name="orbit" className="h-[30px] w-[30px] shrink-0 text-white motion-safe:animate-[spin-slow_18s_linear_infinite]" />
            </div>

            <div className="font-display text-center text-[36px]/[38px] font-semibold tracking-[-1.4px] text-[var(--ink)] md:text-[56px]/[56px] md:tracking-[-2.2px] xl:text-[80px]/[80px] xl:tracking-[-3.2px]">
              Meet your server
              <br />
              properly.
            </div>

            <div className="text-center text-[16px] text-[var(--muted)] md:text-[18px]">Free and open source. Runs on your own machine.</div>

            <div role="tablist" aria-label="Install method" className="flex w-fit flex-row items-center gap-[4px] rounded-full bg-[var(--glass)] p-[4px] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]">
              {INSTALL_COMMANDS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === c.id}
                  onClick={() => setTab(c.id)}
                  className={`cursor-pointer rounded-full px-[14px] py-[6px] text-[13px] transition-colors duration-200 ease-enter ${
                    tab === c.id ? "bg-[var(--soft)] font-medium text-[var(--ink)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="flex w-full max-w-[860px] flex-row items-center justify-start gap-[8px] rounded-[20px] bg-[var(--glass)] p-[6px_6px_6px_14px] [backdrop-filter:blur(8px)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px] sm:gap-[10px] xl:gap-[14px] xl:p-[8px_8px_8px_22px]">
              <div className="font-code hidden text-[15px] whitespace-nowrap text-[var(--accent)] xl:block">$</div>
              <div className="font-code min-w-0 flex-1 overflow-x-auto py-[6px] text-[11px] whitespace-nowrap text-[var(--ink)] hide-scrollbar sm:text-[12px] xl:text-[14px]">{install.command}</div>
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
            <div className="font-code text-center text-[11px] text-[var(--muted)] md:text-[12px]">You need an OpenRouter key. The install prints your sign-in details.</div>

            <div className="flex w-fit max-w-full shrink-0 flex-row flex-wrap items-center justify-center gap-[10px] xl:gap-[14px]">
              <PrimaryButton tone="steel" href={REPO_URL}>
                View on GitHub
              </PrimaryButton>
              <SecondaryButton tone="steel" href={DOCS_URL}>
                Read the docs
              </SecondaryButton>
            </div>
          </div>
        </Reveal>

        <Footer />
      </div>
    </div>
  );
}

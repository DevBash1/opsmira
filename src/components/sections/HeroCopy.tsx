import { ApprovalCard } from "../ApprovalCard";
import { PrimaryButton, SecondaryButton } from "../Buttons";
import { HeadlineLines } from "../HeadlineLines";
import { Reveal } from "../Reveal";
import { REPO_URL } from "../../lib/site";

export function FloatingApproval() {
  return (
    <Reveal
      delay={300}
      className="relative z-[4] mx-auto -mt-14 w-full max-w-[360px] px-4 md:-mt-20 xl:absolute xl:top-[1064px] xl:left-1/2 xl:mt-0 xl:ml-[310px] xl:w-[320px] xl:max-w-none xl:px-0"
    >
      <ApprovalCard
        status="Awaiting approval"
        timestamp="just now"
        title="Clear the apt package cache"
        context="Removes downloaded .deb files, about 145 MB. Installed software is not affected."
        command="apt-get clean"
        riskFilled={1}
        riskLevel="Low"
        riskDetail="re-downloads if needed"
        className="motion-safe:animate-[float-y_8s_ease-in-out_infinite] [box-shadow:0px_30px_60px_var(--shadow),0px_0px_40px_var(--glow)]"
      />
    </Reveal>
  );
}

export function HeroCopy() {
  return (
    <div className="relative z-[2] flex w-full shrink-0 flex-col items-center justify-start gap-[20px] p-[56px_20px_44px_20px] md:gap-[24px] md:p-[72px_32px_56px_32px] lg:gap-[26px] lg:p-[96px_0px_64px_0px]">
      <Reveal>
        <div className="flex w-fit max-w-full shrink-0 flex-row items-center justify-start gap-[10px] rounded-full bg-[var(--glass)] p-[7px_14px_7px_8px] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]">
          <div className="flex w-fit shrink-0 flex-row items-start justify-start gap-0 rounded-full bg-[linear-gradient(90deg,var(--accent)_0%,var(--accent-2)_100%)] p-[3px_9px]">
            <div className="font-code text-[10px] font-semibold tracking-[1px] whitespace-nowrap text-[var(--canvas)]">
              OPEN SOURCE
            </div>
          </div>
          <div className="text-center text-[12px] text-[var(--muted)] md:text-[13px] md:whitespace-nowrap">
            Self-hosted, AGPL-3.0, bring your own model
          </div>
        </div>
      </Reveal>

      <h1 className="font-display mx-auto w-full max-w-[1000px] text-center text-[46px]/[46px] font-semibold tracking-[-2px] text-[var(--ink)] md:text-[68px]/[66px] md:tracking-[-3px] lg:text-[96px]/[94px] lg:tracking-[-4px]">
        <HeadlineLines lines={["Your server,", "in plain words."]} />
      </h1>

      <Reveal className="w-full" delay={300}>
        <p className="mx-auto w-full max-w-[600px] text-center text-[17px]/[27px] font-normal text-[var(--muted)] md:text-[19px]/[29px]">
          Ask anything. Opsmira inspects, explains, and builds a live view of the answer — and never changes production
          without your yes.
        </p>
      </Reveal>

      <Reveal delay={420}>
        <div className="flex w-fit shrink-0 flex-row flex-wrap items-center justify-center gap-[10px] p-[10px_0px_0px_0px] md:gap-[14px]">
          <PrimaryButton href="#install">Install it</PrimaryButton>
          <SecondaryButton href={REPO_URL}>View on GitHub</SecondaryButton>
        </div>
      </Reveal>

      <Reveal delay={520}>
        <div className="font-code px-2 text-center text-[11px] tracking-[0.2px] text-[var(--muted)] md:text-[12px] md:whitespace-nowrap">
          Free and open source · Linux, Docker, any VPS · one command to install
        </div>
      </Reveal>
    </div>
  );
}

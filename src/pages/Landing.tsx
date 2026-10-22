import { Nav } from "../components/Nav";
import type { Page } from "../components/Nav";
import { HeroBackdrop } from "../components/sections/HeroBackdrop";
import { HeroCopy } from "../components/sections/HeroCopy";
import { FloatingApproval } from "../components/sections/HeroCopy";
import { ProductWindow } from "../components/ProductWindow";
import { TrustStrip } from "../components/sections/TrustStrip";
import { HowItWorks } from "../components/sections/HowItWorks";
import { Safety } from "../components/sections/Safety";
import { AskAnything } from "../components/sections/AskAnything";
import { FinalCta } from "../components/FinalCta";
import { Reveal, usePauseOffscreen } from "../components/Reveal";

export function Landing({ onNavigate }: { onNavigate: (page: Page, hash?: string) => void }) {
  const heroPause = usePauseOffscreen<HTMLElement>();
  return (
    <div className="font-body flex w-full flex-col items-start justify-start bg-[var(--canvas)] text-[var(--ink)]">
      <section {...heroPause} className="relative flex w-full shrink-0 flex-col items-center justify-start overflow-hidden pb-[72px] md:pb-[110px] xl:pb-[140px]">
        <HeroBackdrop />
        <Nav page="landing" onNavigate={onNavigate} />
        <HeroCopy />
        <Reveal tilt delay={560} className="flex w-full justify-center px-4 md:px-8 xl:px-0">
          <ProductWindow />
        </Reveal>
        <FloatingApproval />
      </section>
      <TrustStrip />
      <HowItWorks />
      <Safety />
      <AskAnything />
      <FinalCta />
    </div>
  );
}

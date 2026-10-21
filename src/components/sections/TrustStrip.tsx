import { Icon } from "../Icons";
import type { IconName } from "../Icons";
import { REVEAL_BASE, revealState, stagger, useInView } from "../Reveal";

const PLATFORMS: { icon: IconName; name: string }[] = [
  { icon: "box", name: "Docker" },
  { icon: "terminal", name: "Ubuntu" },
  { icon: "cloud", name: "Hetzner" },
  { icon: "droplet", name: "DigitalOcean" },
  { icon: "server", name: "Bare metal" },
  { icon: "cpu", name: "Raspberry Pi" },
];

export function TrustStrip() {
  const [ref, shown] = useInView<HTMLDivElement>({ once: true });
  const rv = `${REVEAL_BASE} ${revealState(shown)}`;
  return (
    <div ref={ref} className="flex w-full shrink-0 flex-row flex-wrap items-center justify-center gap-x-[20px] gap-y-[12px] border-y border-[var(--line)] p-[22px_20px] md:flex-nowrap md:justify-between md:gap-0 md:p-[28px_40px] xl:p-[28px_120px]">
      <div style={stagger(0, 60)} className={`${rv} font-code w-full text-center text-[12px] tracking-[0.3px] text-[var(--muted)] md:w-auto md:text-left md:whitespace-nowrap`}>
        Runs where your servers live
      </div>
      {PLATFORMS.map((platform, i) => (
        <div
          key={platform.name}
          style={stagger(i + 1, 60)}
          className={`${rv} group flex w-fit shrink-0 cursor-default flex-row items-center justify-start gap-[8px]`}
        >
          <Icon
            name={platform.icon}
            className="h-[16px] w-[16px] shrink-0 text-[var(--muted)] transition-colors duration-200 ease-enter group-hover:text-[var(--accent)]"
          />
          <div className="font-display text-[16px] font-medium whitespace-nowrap text-[var(--muted)] transition-colors duration-200 ease-enter group-hover:text-[var(--ink)]">
            {platform.name}
          </div>
        </div>
      ))}
    </div>
  );
}

import { Icon } from "../Icons";
import type { IconName } from "../Icons";
import { ApprovalCard } from "../ApprovalCard";
import { AuditTrailCard } from "../AuditTrailCard";
import { Reveal, REVEAL_BASE, revealState, stagger, useInView, usePauseOffscreen } from "../Reveal";

const GUARANTEES: { icon: IconName; label: string; bordered: boolean }[] = [
  { icon: "eye", label: "Read-only until you approve", bordered: true },
  { icon: "key-round", label: "Root access scoped and revoked after each run", bordered: true },
  { icon: "scroll-text", label: "Every action in an exportable audit trail", bordered: true },
  { icon: "rotate-ccw", label: "One-tap rollback with a restore point", bordered: false },
];

export function Safety() {
  const pause = usePauseOffscreen<HTMLElement>();
  const [copyRef, shown] = useInView<HTMLDivElement>({ once: true });
  const rv = `${REVEAL_BASE} ${revealState(shown)}`;
  return (
    <section {...pause} id="safety" className="flex w-full shrink-0 flex-row items-start justify-start p-[0px_20px] md:p-[0px_40px]">
      <div className="theme-dark relative isolate flex flex-1 flex-col items-start justify-start gap-[40px] overflow-hidden rounded-[40px] bg-[var(--canvas)] p-[48px_24px] md:gap-[56px] md:p-[72px_48px] xl:flex-row xl:items-center xl:gap-[80px] xl:p-[110px_80px]">
        <div className="absolute top-0 left-1/2 z-0 h-[800px] w-[1360px] -translate-x-1/2 overflow-hidden">
          <div className="absolute top-[-200px] left-[620px] z-0 h-[800px] w-[900px] rounded-full bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,var(--glow)_0%,#00000000_100%)] motion-safe:animate-[glow-drift_23s_ease-in-out_infinite] motion-safe:[animation-delay:-5s]" />
          <div className="absolute top-[-170px] left-[450px] z-[1] h-[1100px] w-[1100px] rounded-full border-[2.2px] border-[var(--line)] motion-safe:animate-[ring-breathe_20s_ease-in-out_infinite]" />
          <div className="absolute top-0 left-[620px] z-[2] h-[760px] w-[760px] rounded-full border-[2.28px] border-[var(--line)] motion-safe:animate-[ring-breathe_24s_ease-in-out_infinite] motion-safe:[animation-delay:-8s]" />
        </div>

        <div ref={copyRef} className="relative z-[1] h-fit w-full flex-1">
          <div className="flex w-full flex-col items-start justify-start gap-[24px] xl:gap-[28px]">
            <div style={stagger(0, 70)} className={`${rv} font-code text-[12px] tracking-[1.6px] whitespace-nowrap text-[var(--accent)]`}>
              SAFETY BY DEFAULT
            </div>
            <div style={stagger(1, 70)} className={`${rv} font-display text-[34px]/[38px] font-semibold tracking-[-1.4px] text-[var(--ink)] md:text-[48px]/[50px] md:tracking-[-2px] md:whitespace-nowrap xl:text-[60px]/[60px] xl:tracking-[-2.4px]`}>
              You hold the keys.
              <br />
              Always.
            </div>
            <div style={stagger(2, 70)} className={`${rv} w-full max-w-[460px] text-[16px]/[26px] text-[var(--muted)] md:text-[17px]/[27px]`}>
              Opsmira reads freely and acts carefully. Every change is proposed, explained and only run once you approve
              it.
            </div>

            <div className="flex h-fit w-full max-w-[460px] shrink-0 flex-col items-start justify-start gap-0 p-[8px_0px_0px_0px]">
              {GUARANTEES.map((g, i) => (
                <div
                  key={g.label}
                  style={stagger(i + 3, 70)}
                  className={`${rv} group flex w-full shrink-0 flex-row items-center justify-start gap-[14px] p-[16px_0px] ${
                    g.bordered ? "border-b border-[var(--line)]" : ""
                  }`}
                >
                  <div className="flex h-[32px] w-[32px] shrink-0 flex-row items-center justify-center gap-0 rounded-[10px] bg-[var(--soft)] transition-[transform,translate,scale,rotate] duration-300 ease-enter group-hover:scale-110">
                    <Icon name={g.icon} className="h-[15px] w-[15px] shrink-0 text-[var(--accent)]" />
                  </div>
                  <div className="text-[15px] font-medium text-[var(--ink)] md:whitespace-nowrap">{g.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Reveal delay={200} className="relative z-[2] h-fit w-full max-w-[480px] xl:shrink-0">
          <div className="flex w-full flex-col items-start justify-start gap-[18px]">
            <ApprovalCard
              tone="dark"
              state="approved"
              status="Approved"
              timestamp="14:02"
              title="Restart nginx on web-02"
              context="Config reload failed twice. A full restart clears the stale worker pool."
              command="sudo systemctl restart nginx"
              riskFilled={2}
              riskLevel="Medium"
              riskDetail="~3s downtime"
              className="[box-shadow:0px_24px_60px_var(--shadow),0px_0px_40px_var(--glow)]"
            />
            <AuditTrailCard />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

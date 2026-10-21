import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Fragment } from "react";
import { Icon } from "../components/Icons";
import { Nav } from "../components/Nav";
import type { Page } from "../components/Nav";
import { FinalCta } from "../components/FinalCta";
import { SolidButton } from "../components/Buttons";
import { HeadlineLines } from "../components/HeadlineLines";
import { Reveal } from "../components/Reveal";

/* ---------------------------------- data ---------------------------------- */

type Period = "monthly" | "yearly";

interface PlanPrice {
  amount: string;
  previous?: string;
  unit: string;
}

interface Plan {
  name: string;
  description: string;
  monthly: PlanPrice;
  yearly: PlanPrice;
  cta: string;
  featuresLabel: string;
  features: string[];
  pro: boolean;
}

type Cell = { kind: "value"; text: string; strong?: boolean } | { kind: "included" } | { kind: "not" };

const v = (text: string, strong = false): Cell => ({ kind: "value", text, strong });
const inc: Cell = { kind: "included" };
const no: Cell = { kind: "not" };

const PLANS: Plan[] = [
  {
    name: "Hobby",
    description: "For a side project or a home lab.",
    monthly: { amount: "$0", unit: "free forever" },
    yearly: { amount: "$0", unit: "free forever" },
    cta: "Connect your first server",
    featuresLabel: "Includes",
    features: [
      "1 server",
      "Live views and charts",
      "Approval for every change",
      "7-day audit trail",
      "50 questions a day",
      "Community support",
    ],
    pro: false,
  },
  {
    name: "Pro",
    description: "For production apps and small teams.",
    monthly: { amount: "$19", unit: "per server, per month" },
    yearly: { amount: "$15", previous: "$19", unit: "per server, per month · billed yearly" },
    cta: "Start 14-day free trial",
    featuresLabel: "Everything in Hobby, plus",
    features: [
      "Up to 10 servers",
      "Unlimited questions",
      "90-day audit trail",
      "One-tap rollback and restore points",
      "Scheduled checks and alerts",
      "Email support",
    ],
    pro: true,
  },
  {
    name: "Team",
    description: "For teams that share on-call.",
    monthly: { amount: "$49", unit: "per server, per month" },
    yearly: { amount: "$39", previous: "$49", unit: "per server, per month · billed yearly" },
    cta: "Start 14-day free trial",
    featuresLabel: "Everything in Pro, plus",
    features: [
      "Unlimited servers",
      "Roles and shared approvals",
      "1-year audit trail export",
      "SSO with SAML",
      "Slack and PagerDuty alerts",
      "Priority support",
    ],
    pro: false,
  },
];

const GROUPS: { title: string; rows: { feature: string; cells: Cell[] }[] }[] = [
  {
    title: "Servers and usage",
    rows: [
      { feature: "Connected servers", cells: [v("1"), v("10", true), v("Unlimited")] },
      { feature: "Questions", cells: [v("50 a day"), v("Unlimited", true), v("Unlimited")] },
      { feature: "Live views and charts", cells: [inc, inc, inc] },
    ],
  },
  {
    title: "Safety",
    rows: [
      { feature: "Approval for every change", cells: [inc, inc, inc] },
      { feature: "Audit trail", cells: [v("7 days"), v("90 days", true), v("1 year, exportable")] },
      { feature: "One-tap rollback", cells: [no, inc, inc] },
      { feature: "Shared approval roles", cells: [no, no, inc] },
    ],
  },
  {
    title: "Integrations and support",
    rows: [
      { feature: "Scheduled checks and alerts", cells: [no, inc, inc] },
      { feature: "Slack and PagerDuty", cells: [no, no, inc] },
      { feature: "SSO with SAML", cells: [no, no, inc] },
      { feature: "Support", cells: [v("Community"), v("Email", true), v("Priority")] },
    ],
  },
];

const FAQS = [
  {
    q: "What counts as a server?",
    a: "Any machine or VM that Opsmira connects to. Containers on that machine are included, so ten containers on one host is still one server.",
  },
  {
    q: "Can Opsmira change things without asking?",
    a: "No. Opsmira only reads until you approve a change. Every approval shows the exact command and its risk first.",
  },
  {
    q: "What happens when I reach my plan’s server limit?",
    a: "Existing servers keep working. You can’t connect another one until you upgrade or disconnect a server.",
  },
  {
    q: "Can I switch plans or cancel later?",
    a: "Yes, at any time. Upgrades apply immediately, and cancelling keeps your plan until the end of the billing period.",
  },
  {
    q: "Does my data leave my servers?",
    a: "Opsmira reads logs and metrics through an encrypted connection and keeps them for your audit-trail period, then deletes them.",
  },
];

/* -------------------------------- components ------------------------------- */

/** Monthly / Yearly switch with a thumb that glides between the two options. */
function PeriodToggle({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const buttons = useRef<Record<Period, HTMLButtonElement | null>>({ monthly: null, yearly: null });
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const el = buttons.current[period];
      if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (track.current) ro.observe(track.current);
    return () => ro.disconnect();
  }, [period]);

  // Place the thumb without motion on first paint, then let later moves glide.
  useEffect(() => {
    if (thumb && !animate) {
      const id = requestAnimationFrame(() => setAnimate(true));
      return () => cancelAnimationFrame(id);
    }
  }, [thumb, animate]);

  return (
    <div
      ref={track}
      className="relative flex w-fit shrink-0 flex-row items-start justify-start gap-[4px] rounded-full bg-[var(--soft)] p-[4px] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]"
    >
      {thumb && (
        <span
          aria-hidden="true"
          style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }}
          className={`absolute top-[4px] bottom-[4px] left-0 rounded-full bg-[var(--surface)] [box-shadow:0px_2px_8px_var(--shadow)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px] motion-reduce:transition-none ${
            animate ? "transition-[transform,width] duration-300 ease-move" : ""
          }`}
        />
      )}
      {(["monthly", "yearly"] as const).map((p) => (
        <button
          key={p}
          ref={(el) => {
            buttons.current[p] = el;
          }}
          type="button"
          onClick={() => onChange(p)}
          aria-pressed={period === p}
          className="relative z-[1] flex w-fit shrink-0 cursor-pointer flex-row items-start justify-start gap-0 rounded-full p-[9px_20px]"
        >
          <div
            className={`text-[14px] whitespace-nowrap transition-colors duration-200 ease-enter ${
              period === p ? "font-semibold text-[var(--ink)]" : "font-medium text-[var(--muted)]"
            }`}
          >
            {p === "monthly" ? "Monthly" : "Yearly"}
          </div>
        </button>
      ))}
    </div>
  );
}

function PlanCard({ plan, period }: { plan: Plan; period: Period }) {
  const price = plan[period];
  return (
    <div
      className={`relative flex h-fit w-full flex-1 flex-col items-start justify-start gap-[22px] overflow-hidden rounded-[28px] p-[24px] transition-[transform,translate,scale,rotate,box-shadow,outline-color] duration-300 ease-enter hover:-translate-y-[3px] md:p-[30px] xl:gap-[28px] xl:p-[34px] ${
        plan.pro
          ? "theme-dark bg-[var(--canvas)] hover:[box-shadow:0px_38px_84px_var(--shadow),0px_0px_60px_var(--glow)] [box-shadow:0px_30px_70px_var(--shadow),0px_0px_50px_var(--glow)] [outline:1px_solid_var(--accent)] [outline-offset:-0.5px]"
          : "bg-[var(--surface)] hover:[box-shadow:0px_22px_48px_var(--shadow)] hover:[outline-color:var(--accent)] [box-shadow:0px_12px_32px_var(--shadow)] [outline:1px_solid_var(--line)] [outline-offset:-0.5px]"
      }`}
    >
      {plan.pro && (
        <div className="absolute top-0 left-0 z-0 h-[260px] w-[420px] overflow-hidden">
          <div className="absolute top-[-180px] left-[60px] z-0 h-[380px] w-[420px] rounded-full bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,var(--glow)_0%,#00000000_100%)]" />
        </div>
      )}

      <div className="relative z-[1] flex w-full shrink-0 flex-col items-start justify-start gap-[10px]">
        <div className="flex w-full shrink-0 flex-row items-center justify-between gap-0">
          <div className="font-display text-[24px] font-semibold tracking-[-0.6px] whitespace-nowrap text-[var(--ink)]">
            {plan.name}
          </div>
          {plan.pro && (
            <div className="flex w-fit shrink-0 flex-row items-center justify-start gap-[6px] rounded-full bg-[var(--soft)] p-[5px_12px] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]">
              <Icon name="sparkles" className="h-[12px] w-[12px] shrink-0 text-[var(--accent)]" />
              <div className="text-[12px] font-semibold whitespace-nowrap text-[var(--accent)]">Recommended</div>
            </div>
          )}
        </div>
        <div className="w-full text-[15px]/[23px] text-[var(--muted)]">{plan.description}</div>
      </div>

      <div
        key={period}
        className="relative z-[2] flex w-full shrink-0 flex-col items-start justify-start gap-[6px] motion-safe:animate-rise-in"
      >
        <div className="flex w-fit shrink-0 flex-row items-end justify-start gap-[10px]">
          <div className="font-display text-[56px]/[56px] font-semibold tracking-[-2.4px] whitespace-nowrap text-[var(--ink)] xl:text-[68px]/[68px] xl:tracking-[-3px]">
            {price.amount}
          </div>
          {price.previous && (
            <div className="font-display text-[22px] whitespace-nowrap text-[var(--muted)]">{price.previous}</div>
          )}
        </div>
        <div className="font-code text-[12px] text-[var(--muted)] xl:whitespace-nowrap">{price.unit}</div>
      </div>

      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        className={`group relative z-[3] flex w-full shrink-0 flex-row items-center justify-center gap-[10px] rounded-[14px] p-[14px_16px] transition-[transform,translate,scale,rotate,background-color,box-shadow] duration-200 ease-enter hover:-translate-y-[1px] active:scale-[0.99] active:duration-[120ms] xl:p-[15px_20px] ${
          plan.pro
            ? "bg-[linear-gradient(90deg,var(--accent)_0%,var(--accent-2)_100%)] [box-shadow:0px_10px_28px_var(--glow)]"
            : "bg-[var(--surface)] hover:bg-[var(--soft)] [outline:1px_solid_var(--line)] [outline-offset:-0.5px]"
        }`}
      >
        <div className={`text-[15px] font-semibold whitespace-nowrap ${plan.pro ? "text-[#0F1A14]" : "text-[var(--ink)]"}`}>
          {plan.cta}
        </div>
        <Icon
          name="arrow-right"
          className={`h-[15px] w-[15px] shrink-0 transition-transform duration-200 ease-enter group-hover:translate-x-[2px] ${
            plan.pro ? "text-[#0F1A14]" : "text-[var(--ink)]"
          }`}
        />
      </a>

      <div className="relative z-[4] flex w-full shrink-0 flex-col items-start justify-start gap-[14px] border-t border-[var(--line)] pt-[24px]">
        <div className="font-code text-[12px] tracking-[0.4px] text-[var(--muted)] xl:whitespace-nowrap">{plan.featuresLabel}</div>
        {plan.features.map((feature) => (
          <div key={feature} className="flex w-full shrink-0 flex-row items-center justify-start gap-[12px]">
            <Icon name="check" className="h-[16px] w-[16px] shrink-0 text-[var(--accent-strong)]" />
            <div className="flex-1 text-[15px] text-[var(--ink)]">{feature}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FaqItem({
  q,
  a,
  open,
  first,
  onToggle,
}: {
  q: string;
  a: string;
  open: boolean;
  first: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex w-full shrink-0 flex-col items-start justify-start border-b border-[var(--line)] ${
        first ? "border-t" : ""
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full shrink-0 cursor-pointer flex-row items-center justify-between gap-[16px] p-[20px_0px] text-left transition-colors duration-200 ease-enter hover:text-[var(--ink)] md:p-[24px_0px]"
      >
        <span className="font-display flex-1 text-[17px] font-semibold tracking-[-0.3px] text-[var(--ink)] md:text-[19px]">
          {q}
        </span>
        <span className="relative block h-[18px] w-[18px] shrink-0">
          <Icon
            name="plus"
            className={`absolute inset-0 h-[18px] w-[18px] text-[var(--muted)] transition-[opacity,rotate] duration-300 ease-enter motion-reduce:transition-none ${
              open ? "rotate-90 opacity-0" : "rotate-0 opacity-100"
            }`}
          />
          <Icon
            name="minus"
            className={`absolute inset-0 h-[18px] w-[18px] text-[var(--ink)] transition-[opacity,rotate] duration-300 ease-enter motion-reduce:transition-none ${
              open ? "rotate-0 opacity-100" : "-rotate-90 opacity-0"
            }`}
          />
        </span>
      </button>
      <div
        className={`grid w-full transition-[grid-template-rows] duration-300 ease-enter motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div
            className={`w-full max-w-[560px] pt-[10px] text-[15px]/[24px] text-[var(--muted)] transition-[opacity,transform,translate] ease-enter motion-reduce:transition-none ${
              open ? "translate-y-0 opacity-100 delay-100 duration-300" : "-translate-y-1 opacity-0 duration-150"
            }`}
          >
            {a}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- page ----------------------------------- */

export function Pricing({ onNavigate }: { onNavigate: (page: Page, hash?: string) => void }) {
  const [period, setPeriod] = useState<Period>("yearly");
  const [openFaq, setOpenFaq] = useState<number>(0);

  return (
    <div className="font-body flex w-full flex-col items-start justify-start bg-[var(--canvas)] text-[var(--ink)]">
      <section className="relative flex w-full shrink-0 flex-col items-center justify-start overflow-hidden pb-[56px] md:pb-[72px]">
        <div className="absolute top-0 left-1/2 z-0 h-[900px] w-[1440px] -translate-x-1/2 overflow-hidden">
          <div className="absolute top-[-260px] left-[240px] z-0 h-[640px] w-[960px] rounded-full bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,var(--glow)_0%,#00000000_100%)]" />
          <div className="absolute top-[-450px] left-[70px] z-[1] h-[1300px] w-[1300px] rounded-full border-[2.6px] border-[var(--line)] opacity-70" />
          <div className="absolute top-[-250px] left-[270px] z-[2] h-[900px] w-[900px] rounded-full border-[2.7px] border-[var(--line)] opacity-70" />
        </div>

        <Nav page="pricing" onNavigate={onNavigate} />

        <div className="relative z-[2] flex w-full shrink-0 flex-col items-center justify-start gap-[20px] p-[40px_20px_32px_20px] md:p-[56px_32px_36px_32px] xl:p-[72px_0px_40px_0px]">
          <Reveal>
            <div className="font-code text-[12px] tracking-[1.6px] whitespace-nowrap text-[var(--accent-strong)]">PRICING</div>
          </Reveal>
          <h1 className="font-display mx-auto w-full max-w-[900px] text-center text-[34px]/[38px] font-semibold tracking-[-1.4px] text-[var(--ink)] sm:text-[40px]/[42px] sm:tracking-[-1.7px] md:text-[56px]/[56px] md:tracking-[-2.3px] xl:text-[72px]/[72px] xl:tracking-[-3px]">
            <HeadlineLines lines={["Pay for the servers", "you connect."]} />
          </h1>
          <Reveal className="w-full" delay={280}>
            <p className="mx-auto w-full max-w-[560px] text-center text-[16px]/[26px] text-[var(--muted)] md:text-[18px]/[28px]">
              Every plan includes live views, approvals for every change, and rollback. Start free, add servers as you
              grow.
            </p>
          </Reveal>

          <Reveal delay={400}>
            <div className="flex w-fit shrink-0 flex-row flex-wrap items-center justify-center gap-[10px] p-[16px_0px_0px_0px] xl:gap-[14px]">
              <PeriodToggle period={period} onChange={setPeriod} />
              <div className="flex w-fit shrink-0 flex-row items-center justify-start gap-[6px] rounded-full bg-[var(--soft)] p-[5px_12px]">
                <Icon name="badge-percent" className="h-[14px] w-[14px] shrink-0 text-[var(--accent-strong)]" />
                <div className="text-[13px] font-medium whitespace-nowrap text-[var(--accent-strong)]">
                  Save 20% with yearly billing
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="flex w-full shrink-0 flex-col items-start justify-start gap-[20px] p-[0px_20px_60px_20px] md:gap-[24px] md:p-[0px_40px_80px_40px] lg:flex-row xl:p-[0px_72px_96px_72px]">
        {PLANS.map((plan, i) => (
          <Reveal key={plan.name} delay={i * 60} pop className="flex w-full lg:flex-1">
            <PlanCard plan={plan} period={period} />
          </Reveal>
        ))}
      </section>

      <section className="flex w-full shrink-0 flex-row items-start justify-start p-[0px_20px_60px_20px] md:p-[0px_40px_80px_40px] xl:p-[0px_72px_120px_72px]">
        <Reveal className="w-full">
          <div className="flex h-fit w-full flex-col items-start justify-between gap-[20px] rounded-[28px] bg-[var(--soft)] p-[24px_20px] lg:flex-row lg:items-center lg:gap-[40px] md:p-[32px_36px] xl:p-[36px_44px] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]">
            <div className="flex h-fit w-full flex-1 flex-col items-start justify-start gap-[8px]">
              <div className="flex w-fit shrink-0 flex-row items-center justify-start gap-[8px]">
                <Icon name="building-2" className="h-[15px] w-[15px] shrink-0 text-[var(--accent-strong)]" />
                <div className="font-code text-[12px] tracking-[1.4px] whitespace-nowrap text-[var(--accent-strong)]">
                  ENTERPRISE
                </div>
              </div>
              <div className="font-display text-[22px]/[28px] font-semibold tracking-[-0.8px] text-[var(--ink)] md:text-[26px]/[30px] xl:text-[30px]/[33px] xl:tracking-[-1px] xl:whitespace-nowrap">
                Hundreds of servers, one set of guardrails.
              </div>
              <div className="w-full max-w-[560px] text-[15px]/[23px] text-[var(--muted)]">
                Private networking, custom approval policies, SCIM, data residency and a named support engineer.
              </div>
            </div>
            <div className="flex w-fit shrink-0 flex-row flex-wrap items-center justify-start gap-[12px] lg:justify-end">
              <SolidButton arrow>Talk to sales</SolidButton>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="flex w-fit shrink-0 flex-row items-start justify-start gap-0 rounded-[14px] bg-[var(--surface)] p-[14px_22px] transition-[background-color,transform,translate,scale,rotate] duration-200 ease-enter hover:bg-[var(--canvas)] active:scale-[0.98] active:duration-[120ms] [outline:1px_solid_var(--line)] [outline-offset:-0.5px]"
              >
                <div className="text-[15px] font-medium whitespace-nowrap text-[var(--ink)]">Read the security overview</div>
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="flex w-full shrink-0 flex-col items-start justify-start gap-[32px] p-[0px_20px_70px_20px] md:gap-[40px] md:p-[0px_40px_90px_40px] xl:p-[0px_160px_140px_160px]">
        <Reveal className="flex w-full shrink-0 flex-col items-start justify-start gap-[12px]">
          <div className="font-code text-[12px] tracking-[1.6px] whitespace-nowrap text-[var(--accent-strong)]">
            COMPARE PLANS
          </div>
          <div className="font-display text-[32px]/[34px] font-semibold tracking-[-1.2px] text-[var(--ink)] md:text-[40px]/[42px] md:tracking-[-1.5px] md:whitespace-nowrap xl:text-[48px]/[48px] xl:tracking-[-1.8px]">
            Everything, side by side.
          </div>
        </Reveal>

        <Reveal delay={60} className="w-full shrink-0 overflow-x-auto">
          <div className="flex w-full shrink-0 flex-col items-start justify-start gap-0">
            <div className="flex w-full shrink-0 flex-row items-center justify-start gap-0 border-b border-[var(--ink)] pb-[16px]">
              <div className="flex h-fit flex-1 flex-row items-start justify-start gap-0">
                <div className="font-code text-[12px] whitespace-nowrap text-[var(--muted)]">Features</div>
              </div>
              {["Hobby", "Pro", "Team"].map((column) => (
                <div key={column} className="flex h-fit w-[68px] shrink-0 flex-row items-start justify-center gap-0 sm:w-[96px] md:w-[150px]">
                  <div className="font-display text-center text-[14px] font-semibold whitespace-nowrap text-[var(--ink)] md:text-[16px]">
                    {column}
                  </div>
                </div>
              ))}
            </div>

            {GROUPS.map((group) => (
              <Fragment key={group.title}>
                <div className="flex w-full shrink-0 flex-row items-start justify-start gap-0 p-[28px_0px_10px_0px]">
                  <div className="font-code text-[12px] tracking-[0.6px] whitespace-nowrap text-[var(--muted)]">
                    {group.title}
                  </div>
                </div>
                {group.rows.map((row) => (
                  <div
                    key={row.feature}
                    className="flex w-full shrink-0 flex-row items-center justify-start gap-0 border-b border-[var(--line)] p-[16px_0px]"
                  >
                    <div className="min-w-0 flex-1 pr-[8px] text-[13px]/[18px] text-[var(--ink)] md:text-[15px]/[normal]">{row.feature}</div>
                    {row.cells.map((cell, i) => (
                      <div key={i} className="flex h-fit w-[68px] shrink-0 flex-row items-center justify-center gap-[6px] sm:w-[96px] md:w-[150px]">
                        {cell.kind === "value" && (
                          <div
                            className={`text-center text-[12px]/[16px] text-[var(--ink)] md:text-[14px]/[normal] md:whitespace-nowrap ${
                              cell.strong ? "font-semibold" : "font-normal"
                            }`}
                          >
                            {cell.text}
                          </div>
                        )}
                        {cell.kind === "included" && (
                          <>
                            <Icon name="check" className="h-[18px] w-[18px] shrink-0 text-[var(--accent-strong)]" />
                            <div className="hidden text-[12px] whitespace-nowrap text-[var(--muted)] md:block">Included</div>
                          </>
                        )}
                        {cell.kind === "not" && (
                          <div className="text-[12px] whitespace-nowrap text-[var(--muted)]"><span className="md:hidden" aria-label="Not included">—</span><span className="hidden md:inline">Not included</span></div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </Reveal>
      </section>

      <section className="flex w-full shrink-0 flex-col items-start justify-start gap-[32px] p-[0px_20px_70px_20px] md:gap-[40px] md:p-[0px_40px_90px_40px] lg:flex-row lg:gap-[60px] xl:gap-[80px] xl:p-[0px_160px_140px_160px]">
        <Reveal className="h-fit w-full lg:w-[320px] lg:shrink-0 xl:w-[360px]">
          <div className="flex h-fit w-full flex-col items-start justify-start gap-[16px]">
            <div className="font-code text-[12px] tracking-[1.6px] whitespace-nowrap text-[var(--accent-strong)]">
              QUESTIONS
            </div>
            <div className="font-display w-full text-[30px]/[34px] font-semibold tracking-[-1.2px] text-[var(--ink)] md:text-[38px]/[40px] md:tracking-[-1.4px] xl:text-[44px]/[46px] xl:tracking-[-1.6px]">
              Before you connect a server.
            </div>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="group flex w-fit shrink-0 flex-row items-center justify-start gap-[8px] p-[8px_0px_0px_0px]"
            >
              <div className="text-[15px] font-semibold whitespace-nowrap text-[var(--accent-strong)]">
                Contact support about billing
              </div>
              <Icon
                name="arrow-up-right"
                className="h-[15px] w-[15px] shrink-0 text-[var(--accent-strong)] transition-transform duration-200 ease-enter group-hover:translate-x-[2px] group-hover:-translate-y-[2px]"
              />
            </a>
          </div>
        </Reveal>

        <Reveal delay={60} className="h-fit w-full flex-1">
          <div className="flex h-fit w-full flex-col items-start justify-start gap-0">
            {FAQS.map((faq, i) => (
              <FaqItem
                key={faq.q}
                q={faq.q}
                a={faq.a}
                first={i === 0}
                open={openFaq === i}
                onToggle={() => setOpenFaq(openFaq === i ? -1 : i)}
              />
            ))}
          </div>
        </Reveal>
      </section>

      <FinalCta variant="pricing" />
    </div>
  );
}

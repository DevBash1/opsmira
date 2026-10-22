import type { ReactNode } from "react";
import { Icon } from "./Icons";

/** A real link when there is an address, else the old inert placeholder. External addresses open in a new tab. */
function linkProps(href?: string) {
  if (!href) return { href: "#", onClick: (e: { preventDefault: () => void }) => e.preventDefault() };
  return /^https?:/.test(href) ? { href, target: "_blank", rel: "noreferrer" } : { href };
}

type Tone = "paper" | "steel";

export function PrimaryButton({
  children,
  tone = "paper",
  arrow = true,
  href,
}: {
  children: ReactNode;
  tone?: Tone;
  arrow?: boolean;
  href?: string;
}) {
  return (
    <a
      {...linkProps(href)}
      className="group relative flex h-fit w-fit shrink-0 flex-row items-center gap-[10px] overflow-hidden rounded-full bg-[linear-gradient(90deg,var(--accent)_0%,var(--accent-2)_100%)] p-[16px_26px] [box-shadow:0px_12px_32px_var(--glow)] transition-[transform,translate,scale,rotate,box-shadow] duration-200 ease-enter before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-[40%] before:-translate-x-[150%] before:-skew-x-12 before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)] before:duration-0 hover:-translate-y-[1px] hover:[box-shadow:0px_16px_40px_var(--glow)] hover:before:translate-x-[400%] hover:before:transition-transform hover:before:duration-[800ms] hover:before:ease-enter active:translate-y-0 active:scale-[0.98] active:duration-[120ms]"
    >
      <span
        className={`text-[16px] whitespace-nowrap ${
          tone === "paper" ? "font-semibold text-white" : "font-semibold text-[#0F1A14]"
        }`}
      >
        {children}
      </span>
      {arrow && (
        <Icon
          name="arrow-right"
          className={`h-[16px] w-[16px] shrink-0 transition-transform duration-200 ease-enter group-hover:translate-x-[2px] ${
            tone === "paper" ? "text-white" : "text-[#0F1A14]"
          }`}
        />
      )}
    </a>
  );
}

export function SecondaryButton({
  children,
  tone = "paper",
  icon,
  href,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: "play";
  href?: string;
}) {
  return (
    <a
      {...linkProps(href)}
      className={`group flex h-fit w-fit shrink-0 flex-row items-center gap-[10px] rounded-full p-[16px_24px] transition-[transform,translate,scale,rotate,outline-color,background-color] duration-200 ease-enter hover:-translate-y-[1px] hover:[outline-color:var(--accent)] active:translate-y-0 active:scale-[0.98] active:duration-[120ms] [outline:1px_solid_var(--line)] [outline-offset:-0.5px] ${
        tone === "paper" ? "bg-[var(--glass)]" : ""
      }`}
    >
      {icon === "play" && (
        <Icon
          name="play"
          className="h-[14px] w-[14px] shrink-0 text-[var(--ink)] transition-transform duration-200 ease-enter group-hover:scale-110"
        />
      )}
      <span className="text-[16px] font-medium whitespace-nowrap text-[var(--ink)]">{children}</span>
    </a>
  );
}

export function NavCta({ children, href }: { children: ReactNode; href?: string }) {
  return (
    <a
      {...linkProps(href)}
      className="flex h-fit w-fit shrink-0 flex-row items-start gap-0 rounded-full bg-[var(--ink)] p-[10px_18px] transition-[transform,translate,scale,rotate,opacity] duration-200 ease-enter hover:opacity-90 active:scale-[0.97] active:duration-[120ms]"
    >
      <span className="text-[14px] font-semibold whitespace-nowrap text-[var(--canvas)]">{children}</span>
    </a>
  );
}

export function SolidButton({
  children,
  arrow = false,
}: {
  children: ReactNode;
  arrow?: boolean;
}) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className="group flex h-fit w-fit shrink-0 flex-row items-center gap-[10px] rounded-[14px] bg-[var(--ink)] p-[14px_22px] transition-[transform,translate,scale,rotate,opacity] duration-200 ease-enter hover:opacity-90 active:scale-[0.97] active:duration-[120ms]"
    >
      <span className="text-[15px] font-semibold whitespace-nowrap text-[var(--canvas)]">{children}</span>
      {arrow && (
        <Icon
          name="arrow-right"
          className="h-[15px] w-[15px] shrink-0 text-[var(--canvas)] transition-transform duration-200 ease-enter group-hover:translate-x-[2px]"
        />
      )}
    </a>
  );
}

import { Icon } from "./Icons";
import { CHANGELOG_URL, DOCS_URL, LICENSE_URL, REPO_URL, SECURITY_URL } from "../lib/site";

const LINKS = [
  { label: "Docs", href: DOCS_URL },
  { label: "Security", href: SECURITY_URL },
  { label: "Changelog", href: CHANGELOG_URL },
  { label: "License", href: LICENSE_URL },
  { label: "GitHub", href: REPO_URL },
];

export function Footer() {
  return (
    <div className="relative z-[2] flex w-full max-w-[1200px] shrink-0 flex-col items-center justify-between gap-[16px] border-t border-[var(--line)] p-[24px_0px_0px_0px] md:flex-row md:gap-0 md:p-[28px_0px_0px_0px]">
      <div className="flex w-fit shrink-0 flex-row items-center justify-start gap-[10px]">
        <Icon
          name="orbit"
          className="h-[18px] w-[18px] shrink-0 text-[var(--accent)] motion-safe:animate-[spin-slow_20s_linear_infinite]"
        />
        <div className="font-display text-[18px] font-bold whitespace-nowrap text-[var(--ink)]">Opsmira</div>
        <div className="text-[13px] whitespace-nowrap text-[var(--muted)]">© 2026</div>
      </div>
      <div className="flex w-fit shrink-0 flex-row flex-wrap items-start justify-center gap-x-[20px] gap-y-[8px] md:gap-[28px]">
        {LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="text-[13px] whitespace-nowrap text-[var(--muted)] transition-colors duration-200 ease-enter hover:text-[var(--ink)]"
          >
            {link.label}
          </a>
        ))}
      </div>
      <div className="flex w-fit shrink-0 flex-row items-center justify-start gap-[8px]">
        <div className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--accent)] [box-shadow:0px_0px_8px_var(--accent)] motion-safe:animate-[dot-pulse_2.6s_ease-in-out_infinite]" />
        <div className="font-code text-[12px] whitespace-nowrap text-[var(--muted)]">AGPL-3.0</div>
      </div>
    </div>
  );
}

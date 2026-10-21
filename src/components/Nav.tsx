import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { Icon } from "./Icons";
import { NavCta } from "./Buttons";

export type Page = "landing" | "pricing" | "app";

export const LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Safety", href: "#safety" },
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "#" },
];

export function Nav({
  page,
  onNavigate,
}: {
  page: Page;
  onNavigate: (page: Page, hash?: string) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const onClick = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setOpen(false);
    if (href === "/pricing") {
      onNavigate("pricing");
    } else if (href.startsWith("#") && href !== "#") {
      if (page === "landing") {
        document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
      } else {
        onNavigate("landing", href);
      }
    }
  };

  return (
    <div className="relative z-[10] flex w-full shrink-0 flex-row items-center justify-between gap-0 p-[18px_20px] md:p-[22px_40px] lg:p-[28px_72px]">
      <a
        href="/"
        onClick={(e) => {
          e.preventDefault();
          setOpen(false);
          onNavigate("landing");
        }}
        className="flex w-fit shrink-0 flex-row items-center justify-start gap-[10px]"
      >
        <Icon name="orbit" className="h-[20px] w-[20px] shrink-0 text-[var(--accent)] lg:h-[22px] lg:w-[22px]" />
        <div className="font-display text-[20px] font-bold tracking-[-0.6px] whitespace-nowrap text-[var(--ink)] lg:text-[22px]">
          Opsmira
        </div>
      </a>

      <div className="hidden w-fit shrink-0 flex-row items-center justify-start gap-[36px] rounded-full bg-[var(--glass)] p-[10px_24px] [backdrop-filter:blur(8px)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px] lg:flex">
        {LINKS.map((link) => {
          const isActive = link.label === "Pricing" && page === "pricing";
          return (
            <a
              key={link.label}
              href={link.href}
              onClick={(e) => onClick(e, link.href)}
              className={`relative text-[14px] whitespace-nowrap transition-colors duration-200 ease-enter after:absolute after:inset-x-0 after:-bottom-[5px] after:h-[1.5px] after:origin-left after:rounded-full after:bg-[var(--accent)] after:transition-transform after:duration-300 after:ease-enter hover:after:scale-x-100 ${
                isActive
                  ? "font-semibold text-[var(--ink)] after:scale-x-100"
                  : "font-normal text-[var(--muted)] after:scale-x-0 hover:text-[var(--ink)]"
              }`}
            >
              {link.label}
            </a>
          );
        })}
      </div>

      <div className="flex w-fit shrink-0 flex-row items-center justify-start gap-[14px] lg:gap-[20px]">
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="hidden text-[14px] font-medium whitespace-nowrap text-[var(--ink)] transition-opacity duration-200 ease-enter hover:opacity-70 lg:block"
        >
          Sign in
        </a>
        <NavCta>Get Opsmira</NavCta>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-[38px] w-[38px] shrink-0 cursor-pointer flex-row items-center justify-center rounded-full bg-[var(--glass)] transition-colors duration-200 ease-enter hover:bg-[var(--soft)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px] lg:hidden"
        >
          <span className="relative block h-[12px] w-[18px]">
            <span
              className={`absolute top-0 left-0 h-[2px] w-full rounded-full bg-[var(--ink)] transition-transform duration-200 ease-enter ${
                open ? "translate-y-[5px] rotate-45" : ""
              }`}
            />
            <span
              className={`absolute top-[5px] left-0 h-[2px] w-full rounded-full bg-[var(--ink)] transition-opacity duration-150 ${
                open ? "opacity-0" : ""
              }`}
            />
            <span
              className={`absolute top-[10px] left-0 h-[2px] w-full rounded-full bg-[var(--ink)] transition-transform duration-200 ease-enter ${
                open ? "-translate-y-[5px] -rotate-45" : ""
              }`}
            />
          </span>
        </button>
      </div>

      <>
          <div className={`fixed inset-0 z-[8] lg:hidden ${open ? "" : "pointer-events-none"}`} onClick={() => setOpen(false)} />
          <div inert={!open} aria-hidden={!open} className={`absolute top-full right-3 left-3 z-[9] mt-[10px] flex origin-top flex-col items-stretch gap-[2px] rounded-[24px] bg-[var(--surface)] p-[12px] transition-[opacity,transform,translate,scale] ease-enter motion-reduce:transition-none ${open ? "translate-y-0 scale-100 opacity-100 duration-[280ms]" : "pointer-events-none -translate-y-2 scale-[0.97] opacity-0 duration-150"} [box-shadow:0px_30px_60px_var(--shadow),0px_0px_40px_var(--glow)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px] lg:hidden`}>
            {LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={(e) => onClick(e, link.href)}
                className="rounded-[14px] p-[12px_16px] text-[15px] font-medium text-[var(--ink)] transition-colors duration-200 ease-enter hover:bg-[var(--soft)]"
              >
                {link.label}
              </a>
            ))}
            <div className="mx-[16px] my-[8px] h-[1px] bg-[var(--hairline)]" />
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setOpen(false);
              }}
              className="rounded-[14px] p-[12px_16px] text-[15px] font-medium text-[var(--ink)] transition-colors duration-200 ease-enter hover:bg-[var(--soft)]"
            >
              Sign in
            </a>
            <div className="p-[6px_6px_4px_6px]">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setOpen(false);
                }}
                className="flex w-full flex-row items-center justify-center rounded-full bg-[var(--ink)] p-[13px_18px] transition-transform duration-200 ease-enter active:scale-[0.98] active:duration-[120ms]"
              >
                <span className="text-[14px] font-semibold whitespace-nowrap text-[var(--canvas)]">Get Opsmira</span>
              </a>
            </div>
          </div>
      </>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import { NavCta } from "./Buttons";
import { LINKS } from "./Nav";
import type { Page } from "./Nav";

const SHOW_AFTER = 520;

/**
 * Scroll progress hairline plus a compact glass nav that drops in once the page nav has
 * scrolled away. Both sit in fixed layers, so nothing in the page layout moves.
 */
export function StickyNav({ page, onNavigate }: { page: Page; onNavigate: (page: Page, hash?: string) => void }) {
  const [visible, setVisible] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    let lastY = window.scrollY;
    const phone = window.matchMedia("(max-width: 767px)");
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      // Written straight to the element: the bar stays locked to the scroll position, no re-render.
      if (bar.current) bar.current.style.transform = `scaleX(${progress})`;
      const y = window.scrollY;
      // On phones the bar would cover content while reading, so it tucks away on the way down.
      const dy = y - lastY;
      if (Math.abs(dy) > 6) {
        setVisible(y > SHOW_AFTER && (!phone.matches || dy < 0));
        lastY = y;
      } else if (y <= SHOW_AFTER) {
        setVisible(false);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [page]);

  const go = (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    if (href === "/pricing") onNavigate("pricing");
    else if (href.startsWith("#") && href !== "#") {
      if (page === "landing") document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
      else onNavigate("landing", href);
    }
  };

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[2px]" aria-hidden="true">
        <div
          ref={bar}
          className="h-full origin-left scale-x-0 bg-[linear-gradient(90deg,var(--accent),var(--accent-2))]"
        />
      </div>

      <div className="pointer-events-none fixed inset-x-0 top-[max(12px,env(safe-area-inset-top))] z-[60] flex justify-center pr-[max(12px,env(safe-area-inset-right))] pl-[max(12px,env(safe-area-inset-left))]">
        <nav
          aria-label="Quick navigation"
          inert={!visible}
          className={`flex w-full max-w-[760px] flex-row items-center justify-between gap-[16px] rounded-full bg-[var(--glass)] p-[8px_8px_8px_18px] [backdrop-filter:blur(14px)_saturate(1.4)] transition-[opacity,transform,translate,scale] ease-enter motion-reduce:transition-none [box-shadow:0px_14px_40px_var(--shadow)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px] ${
            visible
              ? "pointer-events-auto translate-y-0 opacity-100 duration-[380ms]"
              : "-translate-y-[140%] opacity-0 duration-200"
          }`}
        >
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              if (page === "landing") window.scrollTo({ top: 0, behavior: "smooth" });
              else onNavigate("landing");
            }}
            className="flex shrink-0 flex-row items-center gap-[8px]"
          >
            <Icon name="orbit" className="h-[18px] w-[18px] shrink-0 text-[var(--accent)]" />
            <span className="font-display text-[17px] font-bold tracking-[-0.5px] text-[var(--ink)]">Opsmira</span>
          </a>

          <div className="hidden flex-row items-center gap-[26px] md:flex">
            {LINKS.map((link) => {
              const active = link.label === "Pricing" && page === "pricing";
              return (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={(e) => go(e, link.href)}
                  className={`relative text-[13px] whitespace-nowrap transition-colors duration-200 ease-enter after:absolute after:inset-x-0 after:-bottom-[5px] after:h-[1.5px] after:origin-left after:rounded-full after:bg-[var(--accent)] after:transition-transform after:duration-300 after:ease-enter hover:after:scale-x-100 ${
                    active
                      ? "font-semibold text-[var(--ink)] after:scale-x-100"
                      : "text-[var(--muted)] after:scale-x-0 hover:text-[var(--ink)]"
                  }`}
                >
                  {link.label}
                </a>
              );
            })}
          </div>

          <NavCta>Get Opsmira</NavCta>
        </nav>
      </div>
    </>
  );
}

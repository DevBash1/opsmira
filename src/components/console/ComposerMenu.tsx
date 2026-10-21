import { useEffect, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ease, spring } from "../../lib/motion";

/**
 * Closes a menu on Escape (returning focus to its button) or a press outside `root`.
 */
export function useMenuDismiss(
  open: boolean,
  close: () => void,
  root: RefObject<HTMLElement | null>,
  button: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
      button.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, close, root, button]);
}

/**
 * An opaque menu panel that rises out of the composer. It positions against the composer box
 * (its nearest positioned ancestor), so every composer menu opens in the same place.
 */
export function ComposerMenu({
  open,
  label,
  role = "menu",
  className = "",
  children,
}: {
  open: boolean;
  label: string;
  role?: "menu" | "dialog";
  className?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role={role}
          aria-label={label}
          initial={{ opacity: 0, scale: 0.96, y: 8, filter: "blur(6px)" }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0,
            filter: "blur(0px)",
            transition: reduce ? { duration: 0 } : spring.soft,
            transitionEnd: { filter: "none" },
          }}
          exit={{ opacity: 0, scale: 0.97, y: 6, filter: "blur(4px)", transition: { duration: 0.16, ease: ease.exit } }}
          className={`absolute bottom-[calc(100%+10px)] left-[12px] z-30 flex origin-bottom-left flex-col rounded-[18px] bg-[var(--surface)] [box-shadow:0px_28px_70px_-12px_var(--shadow),0px_4px_16px_var(--shadow)] [outline:1px_solid_var(--line)] [outline-offset:-0.5px] ${className}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ease, spring } from "../../lib/motion";

/**
 * A floating glass sheet anchored under a top-bar control. It grows out of the corner it belongs to,
 * closes on Escape or an outside press, and hands focus back to its anchor when dismissed by keyboard.
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  label,
  className = "",
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
      anchorRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    const frame = requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>("button, [href], input, select, [tabindex]:not([tabindex='-1'])")
        ?.focus({ preventScroll: true });
    });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      cancelAnimationFrame(frame);
    };
  }, [open, onClose, anchorRef]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          initial={{ opacity: 0, scale: 0.96, y: -6, filter: "blur(6px)" }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0,
            filter: "blur(0px)",
            transition: reduce ? { duration: 0 } : spring.soft,
            transitionEnd: { filter: "none" },
          }}
          exit={{ opacity: 0, scale: 0.97, y: -4, filter: "blur(4px)", transition: { duration: 0.16, ease: ease.exit } }}
          className={`absolute top-[calc(100%+8px)] z-30 origin-top-right overflow-hidden rounded-[18px] bg-[var(--glass)] [backdrop-filter:blur(18px)] [box-shadow:0px_24px_60px_var(--shadow)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px] ${className}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

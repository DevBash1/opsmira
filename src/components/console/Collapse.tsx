import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { spring } from "../../lib/motion";

/**
 * Folds content away by animating its grid row from 1fr to 0fr (CSS only, any height).
 * Content is clipped only while folded or moving, so focus rings and glows show at rest.
 * Folded content is inert: it can't be clicked, focused or read.
 */
export function Collapse({ open, children, className = "" }: { open: boolean; children: ReactNode; className?: string }) {
  const [settled, setSettled] = useState(open);
  return (
    <div
      aria-hidden={!open}
      inert={!open}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && e.propertyName === "grid-template-rows") setSettled(open);
      }}
      // grid-cols-1 is minmax(0, 1fr): without it the column grows to fit unbreakable content
      // (a long one-line command) and everything inside spills out of its card once unclipped.
      className={`grid w-full grid-cols-1 transition-[grid-template-rows,opacity] duration-[600ms] ease-move ${
        open ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0"
      } ${className}`}
    >
      <div className={`min-h-0 min-w-0 ${open && settled ? "" : "overflow-hidden"}`}>{children}</div>
    </div>
  );
}

/** Glides its height to fit whatever its content becomes (more rows, another tab, a longer list). */
export function AutoHeight({ children, className = "" }: { children: ReactNode; className?: string }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");
  const reduce = useReducedMotion();

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      initial={false}
      animate={{ height }}
      transition={reduce ? { duration: 0 } : spring.soft}
      className={`w-full overflow-clip [overflow-clip-margin:4px] ${className}`}
    >
      <div ref={inner} className="w-full">
        {children}
      </div>
    </motion.div>
  );
}

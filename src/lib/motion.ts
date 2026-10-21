import type { Transition } from "motion/react";

/** Shared motion vocabulary for the console: one feel for every enter, exit and morph. */

export const ease = {
  enter: [0.22, 1, 0.36, 1],
  move: [0.25, 1, 0.5, 1],
  exit: [0.4, 0, 1, 1],
} as const satisfies Record<string, [number, number, number, number]>;

export const spring = {
  /** Popovers, height changes, collapses. */
  soft: { type: "spring", visualDuration: 0.45, bounce: 0.12 },
  /** Presses, icon swaps, number rolls. */
  snappy: { type: "spring", visualDuration: 0.22, bounce: 0.18 },
  /** Things that arrive: pills, the jump button, toasts. */
  liquid: { type: "spring", visualDuration: 0.6, bounce: 0.28 },
} as const satisfies Record<string, Transition>;

/* Entrances are CSS (`animate-blur-rise`, `.scene-stagger` in index.css) so they run on the compositor;
 * motion handles exits, springs and height. */

/** Leave by lifting away and dissolving. */
export const exitUp = {
  opacity: 0,
  y: -10,
  scale: 0.985,
  filter: "blur(4px)",
  transition: { duration: 0.24, ease: ease.exit },
} as const;

/**
 * Height collapse props for a motion.div inside AnimatePresence. Pass `reduce` from useReducedMotion():
 * height is a JS animation, so neither MotionConfig nor the CSS reduced-motion clamp reaches it.
 * Overflow is clipped only while moving, so focus rings aren't cut off at rest.
 */
export function collapseY(reduce: boolean | null, { blur = false }: { blur?: boolean } = {}) {
  const transition: Transition = reduce ? { duration: 0 } : spring.soft;
  const blurred = blur && !reduce;
  return {
    initial: { height: 0, opacity: 0, overflow: "hidden", ...(blurred ? { filter: "blur(6px)" } : {}) },
    animate: {
      height: "auto",
      opacity: 1,
      ...(blurred ? { filter: "blur(0px)" } : {}),
      transition,
      transitionEnd: { overflow: "visible", ...(blurred ? { filter: "none" } : {}) },
    },
    exit: { height: 0, opacity: 0, overflow: "hidden", ...(blurred ? { filter: "blur(6px)" } : {}), transition },
  } as const;
}

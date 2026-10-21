import { AnimatePresence, motion } from "motion/react";
import { spring } from "../../lib/motion";

const LABELS: Record<string, string> = {
  thinking: "Thinking",
  working: "Working",
  finishing: "Finishing up",
  "wrapping up": "Wrapping up",
  stopping: "Stopping",
};

/** The agent's presence while it works: a morphing orb and a label that rolls as the phase changes. */
export function PresenceIndicator({ status }: { status: string }) {
  const label = LABELS[status] ?? (status ? status[0].toUpperCase() + status.slice(1) : "Working");

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex w-fit shrink-0 flex-row items-center gap-[11px] rounded-full bg-[var(--glass)] p-[7px_16px_7px_8px] [box-shadow:0px_10px_30px_var(--shadow)] [outline:1px_solid_var(--hairline)] [outline-offset:-0.5px]"
    >
      <span className="relative flex h-[22px] w-[22px] shrink-0 items-center justify-center" aria-hidden="true">
        <span className="absolute inset-[-4px] rounded-full bg-[radial-gradient(circle,var(--glow),transparent_70%)] motion-safe:animate-[dot-pulse_1.8s_ease-in-out_infinite]" />
        <span className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,var(--accent),var(--accent-2),var(--accent-strong),var(--accent))] motion-safe:animate-[orb-morph_2.8s_ease-in-out_infinite,spin-slow_3.2s_linear_infinite]" />
        <span className="absolute inset-[6px] rounded-full bg-[var(--surface)] opacity-50 motion-safe:animate-[orb-morph_2.2s_ease-in-out_infinite_reverse]" />
      </span>
      <span className="relative h-[18px] w-[92px] overflow-hidden">
        <AnimatePresence initial={false}>
          <motion.span
            key={label}
            initial={{ y: 14, opacity: 0, filter: "blur(4px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
            exit={{ y: -14, opacity: 0, filter: "blur(4px)" }}
            transition={spring.snappy}
            className="text-shimmer absolute top-0 left-0 text-[13px]/[18px] font-medium whitespace-nowrap"
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  );
}

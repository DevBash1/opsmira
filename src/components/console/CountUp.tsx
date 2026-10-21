import { useLayoutEffect, useRef, type ReactNode } from "react";
import { animate, useReducedMotion } from "motion/react";
import { ease } from "../../lib/motion";

/**
 * Counts a number up from zero when it mounts. The text is written straight to the DOM on each frame,
 * so a counting value never re-renders React. Under reduced motion it simply shows the final value.
 */
export function CountUp({
  value,
  decimals = 0,
  grouping = false,
  duration = 0.9,
}: {
  value: number;
  decimals?: number;
  grouping?: boolean;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  // What is on screen right now. A new value tweens from here, so a live number glides to its next
  // reading instead of restarting from zero. Only the first appearance counts up from zero.
  const shown = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const format = (n: number) =>
      n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouping });
    if (reduce) {
      el.textContent = format(value);
      return;
    }
    const from = shown.current ?? 0;
    el.textContent = format(from);
    const controls = animate(from, value, {
      duration: shown.current === null ? duration : Math.min(duration, 0.7),
      ease: ease.enter,
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = format(v);
      },
      onComplete: () => {
        shown.current = value;
      },
    });
    return () => controls.stop();
  }, [value, decimals, grouping, duration, reduce]);

  return <span ref={ref} className="tabular-nums" />;
}

/** A display value like "6.4 GB", "$1,204" or "99.98%": when it holds exactly one number, that number counts up. */
export function AnimatedValue({ value }: { value: ReactNode }) {
  if (typeof value !== "string" && typeof value !== "number") return <>{value}</>;
  const text = String(value);
  const matches = text.match(/\d[\d,]*(?:\.\d+)?/g);
  if (!matches || matches.length !== 1) return <>{text}</>;
  const raw = matches[0];
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return <>{text}</>;
  const at = text.indexOf(raw);
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  return (
    <>
      {text.slice(0, at)}
      <CountUp value={n} decimals={decimals} grouping={raw.includes(",")} />
      {text.slice(at + raw.length)}
    </>
  );
}

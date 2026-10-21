import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Observes an element and reports whether it is (currently) in the viewport.
 * `once: true` stops observing after the first intersection.
 */
export function useInView<T extends HTMLElement>({
  once = true,
  rootMargin = "0px 0px -8% 0px",
  threshold = 0.05,
}: {
  once?: boolean;
  rootMargin?: string;
  threshold?: number;
} = {}) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting ?? false;
        setInView(visible);
        if (visible && once) io.disconnect();
      },
      { rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, rootMargin, threshold]);

  return [ref, inView] as const;
}

/**
 * Spread onto a section that holds ambient loops (rings, glows, floats): the CSS in
 * index.css pauses every animation inside it while it is far off screen.
 */
export function usePauseOffscreen<T extends HTMLElement>() {
  const [ref, inView] = useInView<T>({ once: false, rootMargin: "240px 0px 240px 0px", threshold: 0 });
  return { ref, "data-paused": inView ? "false" : "true" } as const;
}

/** Shared classes for anything that fades and lifts in once it is on screen. */
export const REVEAL_BASE =
  "transition-[opacity,transform,translate,scale] duration-[600ms] ease-enter motion-reduce:transition-none";

export function revealState(shown: boolean) {
  return shown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0";
}

/** Inline transition delay for staggered children (ms). */
export function stagger(index: number, step = 50, base = 0) {
  return { transitionDelay: `${base + index * step}ms` };
}

/** Fades and lifts its children when they scroll into view. `pop` adds a subtle scale-in, `tilt` a perspective settle. */
export function Reveal({
  children,
  delay = 0,
  pop = false,
  tilt = false,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  pop?: boolean;
  tilt?: boolean;
  className?: string;
}) {
  const [ref, shown] = useInView<HTMLDivElement>({ once: true });
  // After the tilt has settled, drop the 3D transform: WebKit mis-renders backdrop-filter inside one.
  const [settled, setSettled] = useState(false);
  const extra = tilt
    ? shown
      ? `origin-bottom scale-100 ${settled ? "[transform:none]" : "[transform:perspective(1600px)_rotateX(0deg)]"}`
      : "origin-bottom [transform:perspective(1600px)_rotateX(7deg)] scale-[0.97]"
    : pop
      ? shown
        ? "scale-100"
        : "scale-[0.94]"
      : "";
  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      onTransitionEnd={tilt && shown ? (e) => e.propertyName === "transform" && setSettled(true) : undefined}
      className={`${REVEAL_BASE} ${revealState(shown)} ${extra} ${className}`}
    >
      {children}
    </div>
  );
}

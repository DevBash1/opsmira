import { useEffect, useRef, useState } from "react";

let prefersReduced: boolean | null = null;
function reduced() {
  if (prefersReduced === null) {
    prefersReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return prefersReduced;
}

/** Types text out character by character; starts on mount or when scrolled into view. */
export function Typewriter({
  text,
  speed = 40,
  delay = 0,
  startOnView = false,
}: {
  text: string;
  speed?: number;
  delay?: number;
  startOnView?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [armed, setArmed] = useState(!startOnView);
  const [count, setCount] = useState(() => (reduced() ? text.length : 0));

  useEffect(() => {
    if (armed || !startOnView) return;
    if (reduced()) {
      setArmed(true);
      setCount(text.length);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setArmed(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setArmed(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [armed, startOnView, text]);

  useEffect(() => {
    if (!armed) return;
    if (reduced()) {
      setCount(text.length);
      return;
    }
    let i = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      i += 1;
      setCount(i);
      if (i < text.length) timer = setTimeout(tick, speed);
    };
    timer = setTimeout(tick, delay);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [armed, text, speed, delay]);

  return (
    <span ref={ref}>
      <span aria-hidden="true">{text.slice(0, count)}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

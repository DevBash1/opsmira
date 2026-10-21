import { useCallback, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Keeps the chat scroller pinned to its bottom while content grows (height animations included),
 * unless the reader has scrolled away. A ResizeObserver fires after layout and before paint, so the
 * bottom stays glued on every frame of an expanding pill, card or scene.
 *
 * Stages are keyed and overlap while one exits, so refs only clear when they still point at their node.
 */
export function useStickToBottom() {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const reduce = useReducedMotion();

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const away = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = away < 80;
    setShowJump(away > 160);
  }, []);

  const scrollerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    scrollRef.current = node;
    return () => {
      if (scrollRef.current === node) scrollRef.current = null;
    };
  }, []);

  const contentRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const observer = new ResizeObserver(() => {
        const el = scrollRef.current;
        // Only the live stage steers scrolling; an exiting stage keeps its own position.
        // Stages that read from the top (idle, previews) opt out with data-pin="false".
        if (!el || !el.contains(node) || node.dataset.pin !== "true") return;
        if (stickRef.current) el.scrollTop = el.scrollHeight;
        else measure();
      });
      observer.observe(node);
      return () => observer.disconnect();
    },
    [measure],
  );

  const jump = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [reduce]);

  /** A new turn starts pinned. */
  const reset = useCallback(() => {
    stickRef.current = true;
    setShowJump(false);
  }, []);

  return { scrollerRef, contentRef, onScroll: measure, showJump, jump, reset };
}

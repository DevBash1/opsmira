import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";

// Console light/dark theme. It follows the system setting until the owner picks one, then
// remembers the choice. index.html applies the same rule before first paint, so there is no flash.

export type Theme = "light" | "dark";

const STORAGE_KEY = "opsmira_theme";
const THEME_COLOR: Record<Theme, string> = { light: "#f8f9f7", dark: "#111614" };

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null; // private browsing / blocked storage
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("theme-dark", theme === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

/** The console's theme and a toggle that reveals the new theme from the given element. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Only the console is themed: leaving it (e.g. back to the landing page) restores light.
  useEffect(() => () => applyTheme("light"), []);

  // Until the owner picks a theme, follow the system as it changes.
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const onChange = () => {
      if (!storedTheme()) setTheme(systemTheme());
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(
    (from?: HTMLElement | null) => {
      const next: Theme = theme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore — the switch still works for this visit
      }
      const commit = () => {
        flushSync(() => setTheme(next));
        applyTheme(next);
      };
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
      if (!doc.startViewTransition || reduce || !from) {
        commit();
        return;
      }
      // The new theme grows out of the toggle as a circle reaching the farthest corner.
      const rect = from.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const root = document.documentElement.style;
      root.setProperty("--vt-x", `${x}px`);
      root.setProperty("--vt-y", `${y}px`);
      root.setProperty("--vt-r", `${r}px`);
      doc.startViewTransition(commit);
    },
    [theme],
  );

  return [theme, toggle] as const;
}

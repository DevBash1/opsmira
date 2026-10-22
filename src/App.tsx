import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Landing } from "./pages/Landing";
import { StickyNav } from "./components/StickyNav";
import { STATIC_SITE } from "./lib/site";

// The console (and its animation library) loads only on /app, keeping the marketing pages lean.
// A static build has no console, so its code is left out of the bundle entirely.
const Console = STATIC_SITE ? null : lazy(() => import("./pages/Console").then((m) => ({ default: m.Console })));
import type { Page } from "./components/Nav";

function pageFromPath(): Page {
  // A static host has no console behind it: every address is the landing page.
  if (STATIC_SITE) return "landing";
  return window.location.pathname.startsWith("/app") ? "app" : "landing";
}

export default function App() {
  const [page, setPage] = useState<Page>(pageFromPath);

  useEffect(() => {
    const onPop = () => setPage(pageFromPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((next: Page, hash?: string) => {
    const path = next === "app" ? "/app" : import.meta.env.BASE_URL;
    window.history.pushState({}, "", hash ? `${path}${hash}` : path);
    setPage(next);
    if (hash) {
      requestAnimationFrame(() => document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" }));
    } else {
      window.scrollTo({ top: 0 });
    }
  }, []);

  if (page === "app" && Console) {
    return (
      <Suspense fallback={<div className="h-dvh w-full bg-[var(--canvas)]" />}>
        <Console />
      </Suspense>
    );
  }

  return (
    <div className="min-h-dvh w-full overflow-x-clip bg-[var(--canvas)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <StickyNav page={page} onNavigate={navigate} />
      <div className="mx-auto w-full max-w-[1440px]">
        <div key={page} className="motion-safe:animate-fade-in">
          <Landing onNavigate={navigate} />
        </div>
      </div>
    </div>
  );
}

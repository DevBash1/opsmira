import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Landing } from "./pages/Landing";
import { Pricing } from "./pages/Pricing";
import { StickyNav } from "./components/StickyNav";

// The console (and its animation library) loads only on /app, keeping the marketing pages lean.
const Console = lazy(() => import("./pages/Console").then((m) => ({ default: m.Console })));
import type { Page } from "./components/Nav";

function pageFromPath(): Page {
  if (window.location.pathname.startsWith("/app")) return "app";
  return window.location.pathname.startsWith("/pricing") ? "pricing" : "landing";
}

export default function App() {
  const [page, setPage] = useState<Page>(pageFromPath);

  useEffect(() => {
    const onPop = () => setPage(pageFromPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((next: Page, hash?: string) => {
    const path = next === "pricing" ? "/pricing" : next === "app" ? "/app" : "/";
    window.history.pushState({}, "", hash ? `${path}${hash}` : path);
    setPage(next);
    if (hash) {
      requestAnimationFrame(() => document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" }));
    } else {
      window.scrollTo({ top: 0 });
    }
  }, []);

  if (page === "app") {
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
          {page === "pricing" ? <Pricing onNavigate={navigate} /> : <Landing onNavigate={navigate} />}
        </div>
      </div>
    </div>
  );
}

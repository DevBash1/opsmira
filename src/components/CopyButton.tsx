import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";

/** Puts text on the clipboard, with a fallback for pages where the clipboard API is unavailable. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      // nothing more to try
    }
    area.remove();
    return ok;
  }
}

/** A small icon button that copies `text` and shows a check for a moment. */
export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      aria-label={done ? "Copied" : label}
      title={done ? "Copied" : label}
      onClick={async () => {
        if (!(await copyText(text))) return;
        setDone(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setDone(false), 1600);
      }}
      className={`flex h-[26px] w-[26px] shrink-0 cursor-pointer flex-row items-center justify-center rounded-[8px] text-[var(--muted)] transition-[color,background-color,transform] duration-200 ease-enter hover:bg-[var(--soft)] hover:text-[var(--ink)] active:scale-[0.92] ${className}`}
    >
      <Icon name={done ? "check" : "copy"} className={`h-[13px] w-[13px] ${done ? "text-[var(--accent)]" : ""}`} />
    </button>
  );
}

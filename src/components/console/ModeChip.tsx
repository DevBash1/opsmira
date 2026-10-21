import { useCallback, useRef, useState } from "react";
import { Icon } from "../Icons";
import { ComposerMenu, useMenuDismiss } from "./ComposerMenu";
import type { AgentMode } from "../../lib/console-api";

const MODES: { id: AgentMode; label: string; detail: string; icon: "key-round" | "triangle-alert" }[] = [
  {
    id: "ask",
    label: "Ask first",
    detail: "Read-only checks run on their own. Every change waits for your approval.",
    icon: "key-round",
  },
  {
    id: "full",
    label: "Full access",
    detail: "Runs any command, changes included, without asking. No read-only check.",
    icon: "triangle-alert",
  },
];

/** The agent's permission mode, picked from a menu above the composer. */
export function ModeChip({ mode, onChange, disabled = false }: { mode: AgentMode; onChange: (mode: AgentMode) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useMenuDismiss(open, close, root, button);
  const full = mode === "full";
  const current = MODES.find((m) => m.id === mode) ?? MODES[0];

  // Not positioned itself: the menu anchors to the composer box, like the model menu.
  return (
    <div ref={root} className="shrink-0">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        title={disabled ? "Change the mode once the agent has finished" : current.detail}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-[26px] cursor-pointer flex-row items-center gap-[6px] rounded-full pr-[10px] pl-[9px] text-[11px] transition-colors duration-200 ease-enter disabled:cursor-not-allowed disabled:opacity-60 ${
          full
            ? "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_oklab,var(--danger)_22%,transparent)]"
            : "bg-[var(--soft)] text-[var(--ink)] hover:bg-[var(--line)]"
        }`}
      >
        <Icon name={current.icon} className="h-[11px] w-[11px] shrink-0" />
        <span className="font-code whitespace-nowrap">{current.label}</span>
        <Icon name="arrow-up" className={`h-[9px] w-[9px] shrink-0 opacity-70 transition-transform duration-300 ease-move ${open ? "rotate-0" : "rotate-180"}`} />
      </button>

      <ComposerMenu open={open} label="Agent permissions" className="w-[min(300px,calc(100%-24px))] gap-[2px] p-[6px]">
        {MODES.map((m) => {
          const selected = m.id === mode;
          const danger = m.id === "full";
          return (
            <button
              key={m.id}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              onClick={() => {
                setOpen(false);
                if (!selected) onChange(m.id);
                button.current?.focus();
              }}
              className={`flex w-full cursor-pointer flex-row items-start gap-[10px] rounded-[13px] p-[10px_11px] text-left transition-colors duration-150 ease-enter hover:bg-[var(--soft)] focus-visible:bg-[var(--soft)] ${
                selected ? "bg-[color-mix(in_oklab,var(--soft)_70%,transparent)]" : ""
              }`}
            >
              <span
                className={`mt-[1px] flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full ${
                  danger ? "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)]" : "bg-[var(--soft)] text-[var(--accent)]"
                }`}
              >
                <Icon name={m.icon} className="h-[12px] w-[12px]" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className={`text-[12.5px] font-medium ${danger ? "text-[var(--danger)]" : "text-[var(--ink)]"}`}>{m.label}</span>
                <span className="text-[11.5px] leading-[1.45] text-[var(--muted)]">{m.detail}</span>
              </span>
              {/* Radio, centred on the option: filled when chosen. */}
              <span
                aria-hidden="true"
                className={`flex h-[16px] w-[16px] shrink-0 items-center justify-center self-center rounded-full transition-colors duration-200 ease-enter ${
                  selected
                    ? danger
                      ? "bg-[var(--danger)]"
                      : "bg-[var(--accent)]"
                    : "[outline:1.5px_solid_var(--line)] [outline-offset:-1.5px]"
                }`}
              >
                {selected && <span className="h-[6px] w-[6px] rounded-full bg-[var(--surface)] motion-safe:animate-[pop-in_0.3s_cubic-bezier(0.22,1,0.36,1)_backwards]" />}
              </span>
            </button>
          );
        })}
      </ComposerMenu>
    </div>
  );
}

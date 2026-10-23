import { useCallback, useRef, useState } from "react";
import { Icon } from "../Icons";
import { ComposerMenu, useMenuDismiss } from "./ComposerMenu";

export interface ServerOption {
  /** "local" or agent:<name>. */
  id: string;
  label: string;
  detail: string;
  /** An offline server cannot be picked. */
  online: boolean;
}

/** Which server the agent works on, picked from a menu above the composer. Shown once more than one is available. */
export function ServerChip({ servers, value, onChange, onOpen, disabled = false }: { servers: ServerOption[]; value: string; onChange: (id: string) => void; onOpen?: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useMenuDismiss(open, close, root, button);
  const current = servers.find((s) => s.id === value) ?? servers[0];
  if (!current) return null;

  return (
    <div ref={root} className="min-w-0 shrink">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        title={disabled ? "Change the server once the agent has finished" : `Working on ${current.label}`}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen((v) => !v);
        }}
        className="flex h-[26px] max-w-full cursor-pointer flex-row items-center gap-[6px] rounded-full bg-[var(--soft)] pr-[10px] pl-[9px] text-[11px] text-[var(--ink)] transition-colors duration-200 ease-enter hover:bg-[var(--line)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Icon name="server" className="h-[11px] w-[11px] shrink-0 text-[var(--accent)]" />
        <span className="font-code max-w-[120px] truncate whitespace-nowrap">{current.label}</span>
        <Icon name="arrow-up" className={`h-[9px] w-[9px] shrink-0 opacity-70 transition-transform duration-300 ease-move ${open ? "rotate-0" : "rotate-180"}`} />
      </button>

      <ComposerMenu open={open} label="Server" className="w-[min(300px,calc(100%-24px))] gap-[2px] p-[6px]">
        {servers.map((s) => {
          const selected = s.id === current.id;
          return (
            <button
              key={s.id}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              disabled={!s.online}
              onClick={() => {
                setOpen(false);
                if (!selected) onChange(s.id);
                button.current?.focus();
              }}
              className={`flex w-full cursor-pointer flex-row items-start gap-[10px] rounded-[13px] p-[10px_11px] text-left transition-colors duration-150 ease-enter hover:bg-[var(--soft)] focus-visible:bg-[var(--soft)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent ${
                selected ? "bg-[color-mix(in_oklab,var(--soft)_70%,transparent)]" : ""
              }`}
            >
              <span className="mt-[1px] flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-[var(--soft)] text-[var(--accent)]">
                <Icon name="server" className="h-[12px] w-[12px]" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className="font-code truncate text-[12.5px] font-medium text-[var(--ink)]">{s.label}</span>
                <span className="text-[11.5px] leading-[1.45] text-[var(--muted)]">{s.detail}</span>
              </span>
              <span
                aria-hidden="true"
                className={`flex h-[16px] w-[16px] shrink-0 items-center justify-center self-center rounded-full transition-colors duration-200 ease-enter ${
                  selected ? "bg-[var(--accent)]" : "[outline:1.5px_solid_var(--line)] [outline-offset:-1.5px]"
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

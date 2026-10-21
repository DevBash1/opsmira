import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "../Icons";
import { spring } from "../../lib/motion";
import { ComposerMenu, useMenuDismiss } from "./ComposerMenu";
import type { ModelInfo } from "../../lib/console-api";

/** "vendor/model:free" → "model"; the FREE badge says the rest. */
const shortName = (id: string) => (id.split("/").pop() || id).replace(/:free$/, "");
const vendorOf = (id: string) => (id.includes("/") ? id.split("/")[0].replace(/^~/, "") : "");
const contextOf = (m: ModelInfo) =>
  m.contextLength ? `${m.contextLength >= 1_000_000 ? `${Math.round(m.contextLength / 100_000) / 10}M` : `${Math.round(m.contextLength / 1000)}k`} context` : "";

/**
 * Model picker for the composer: a chip that opens a searchable list above the composer.
 * Type to filter, narrow to free or vision models, move with the arrow keys and pick with Enter.
 */
export function ModelChip({
  models,
  value,
  onChange,
  attention = 0,
}: {
  models: ModelInfo[];
  value: string;
  onChange: (id: string) => void;
  /** Bump to draw the eye here (e.g. an image was pasted for a model that can't see it). */
  attention?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [onlyFree, setOnlyFree] = useState(false);
  const [onlyVision, setOnlyVision] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const close = useCallback(() => setOpen(false), []);
  useMenuDismiss(open, close, root, button);

  const current = models.find((m) => m.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter(
      (m) =>
        (!onlyFree || m.free) &&
        (!onlyVision || m.vision) &&
        (!q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)),
    );
  }, [models, query, onlyFree, onlyVision]);

  // Opening starts fresh, with the current model highlighted and in view.
  const toggle = () => {
    if (open) return setOpen(false);
    setQuery("");
    setOnlyFree(false);
    setOnlyVision(false);
    setActive(Math.max(0, models.findIndex((m) => m.id === value)));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      search.current?.focus({ preventScroll: true });
      list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // A new search or filter starts the highlight on the current model if it's listed, else the top.
  useEffect(() => {
    const index = filtered.findIndex((m) => m.id === value);
    setActive(index >= 0 ? index : 0);
    // Only a change of search or filter should move it; arrow keys move it otherwise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, onlyFree, onlyVision]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, listId]);

  const pick = (id: string) => {
    setOpen(false);
    if (id !== value) onChange(id);
    button.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = filtered[active];
      if (m) pick(m.id);
    }
  };

  const filterChip = (label: string, on: boolean, set: (fn: (v: boolean) => boolean) => void, icon?: "eye") => (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        set((v) => !v);
        search.current?.focus();
      }}
      className={`flex shrink-0 cursor-pointer flex-row items-center gap-[5px] rounded-full px-[10px] py-[4px] text-[11px] transition-colors duration-200 ease-enter ${
        on ? "bg-[var(--accent)] text-[var(--canvas)]" : "bg-[var(--soft)] text-[var(--muted)] hover:text-[var(--ink)]"
      }`}
    >
      {icon && <Icon name={icon} className="h-[11px] w-[11px]" />}
      {label}
    </button>
  );

  return (
    <div ref={root} className="min-w-0">
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Model: ${value}`}
        title={value}
        onClick={toggle}
        className="relative flex h-[26px] max-w-[220px] min-w-0 cursor-pointer flex-row items-center gap-[6px] rounded-full bg-[var(--soft)] pr-[10px] pl-[9px] text-[11px] text-[var(--ink)] transition-colors duration-200 ease-enter hover:bg-[var(--line)]"
      >
        {attention > 0 && (
          <span
            key={attention}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[inherit] motion-safe:animate-[pulse-ring_0.8s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:hidden"
          />
        )}
        <Icon name="sparkles" className="h-[11px] w-[11px] shrink-0 text-[var(--accent)]" />
        <span className="relative flex min-w-0 flex-row items-center overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={value}
              initial={{ opacity: 0, y: 8, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
              exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
              transition={spring.snappy}
              className="font-code block min-w-0 truncate"
            >
              {shortName(value)}
            </motion.span>
          </AnimatePresence>
        </span>
        {current?.vision && (
          <span title="Can see images" className="flex shrink-0">
            <Icon name="eye" className="h-[11px] w-[11px] text-[var(--accent-strong)]" />
          </span>
        )}
        {current?.free && <span className="font-code shrink-0 text-[9px] tracking-[0.4px] text-[var(--accent-strong)]">FREE</span>}
        <Icon name="arrow-up" className={`h-[9px] w-[9px] shrink-0 text-[var(--muted)] transition-transform duration-300 ease-move ${open ? "rotate-0" : "rotate-180"}`} />
      </button>

      <ComposerMenu open={open} label="Choose a model" role="dialog" className="w-[min(440px,calc(100%-24px))] overflow-hidden">
        <div className="flex flex-col gap-[10px] border-b border-[var(--hairline)] p-[12px_12px_10px_12px]">
          <label className="flex h-[36px] flex-row items-center gap-[8px] rounded-[11px] bg-[var(--canvas)] px-[11px] [outline:1px_solid_var(--line)] [outline-offset:-0.5px] focus-within:[outline-color:var(--accent)]">
            <Icon name="search" className="h-[13px] w-[13px] shrink-0 text-[var(--muted)]" />
            <input
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={`Search ${models.length} models`}
              aria-label="Search models"
              aria-controls={listId}
              aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
              role="combobox"
              aria-expanded="true"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
            />
          </label>
          <div className="flex flex-row items-center gap-[6px]">
            {filterChip("Free", onlyFree, setOnlyFree)}
            {filterChip("Vision", onlyVision, setOnlyVision, "eye")}
            <span className="font-code ml-auto text-[10px] text-[var(--muted)]">
              {filtered.length} of {models.length}
            </span>
          </div>
        </div>

        <div ref={list} id={listId} role="listbox" aria-label="Models" className="flex max-h-[min(360px,50vh)] flex-col overflow-y-auto p-[6px]">
          {filtered.length === 0 && <div className="p-[14px] text-center text-[12px] text-[var(--muted)]">No models match.</div>}
          {filtered.map((m, i) => {
            const selected = m.id === value;
            const header = i === 0 || filtered[i - 1].free !== m.free;
            const details = [vendorOf(m.id), contextOf(m)].filter(Boolean).join(" · ");
            return (
              <div key={m.id} className="contents">
                {header && (
                  <div className="font-code sticky top-[-6px] z-[1] bg-[var(--surface)] px-[10px] pt-[8px] pb-[4px] text-[9.5px] tracking-[0.8px] text-[var(--muted)]">
                    {m.free ? "FREE" : "PAID"}
                  </div>
                )}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => setActive(i)}
                  onClick={() => pick(m.id)}
                  // scroll-margin keeps a row scrolled into view clear of the sticky FREE / PAID header.
                  className={`flex w-full scroll-mt-[30px] cursor-pointer flex-row items-center gap-[10px] rounded-[11px] px-[10px] py-[8px] transition-colors duration-100 ${
                    i === active ? "bg-[var(--soft)]" : ""
                  }`}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
                    <span className={`font-code truncate text-[12px] ${selected ? "text-[var(--accent-strong)]" : "text-[var(--ink)]"}`}>
                      {shortName(m.id)}
                    </span>
                    {details && <span className="truncate text-[10.5px] text-[var(--muted)]">{details}</span>}
                  </span>
                  {m.vision && (
                    <span title="Can see images" className="flex shrink-0">
                      <Icon name="eye" className="h-[12px] w-[12px] text-[var(--muted)]" />
                    </span>
                  )}
                  {m.free && <span className="font-code shrink-0 text-[9px] tracking-[0.4px] text-[var(--accent-strong)]">FREE</span>}
                  <span className="flex w-[12px] shrink-0 justify-center">
                    {selected && <Icon name="check" className="h-[12px] w-[12px] text-[var(--accent)]" />}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </ComposerMenu>
    </div>
  );
}

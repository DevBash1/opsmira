import { useRef, type Ref } from "react";
import { Icon, type IconName } from "../Icons";

/** Quiet round control for the console's top bar: icon first, label slides out on hover or focus. */
export function IconButton({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
  dot = false,
  ref,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  dot?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  // Once the icon has changed at least once, every later change animates (even back to the first).
  const firstIcon = useRef(icon);
  const swapped = useRef(false);
  if (icon !== firstIcon.current) swapped.current = true;

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      data-active={active}
      className="group/icon relative flex h-[32px] shrink-0 cursor-pointer flex-row items-center rounded-full px-[9px] text-[var(--muted)] opacity-70 transition-[opacity,background-color,color] duration-200 ease-enter hover:bg-[var(--glass)] hover:text-[var(--ink)] hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 data-[active=true]:bg-[var(--glass)] data-[active=true]:text-[var(--ink)] data-[active=true]:opacity-100"
    >
      {/* A changed icon (sun ↔ moon) turns into place; the first paint doesn't animate. */}
      <span key={icon} className={`flex shrink-0 ${swapped.current ? "motion-safe:animate-[icon-swap_0.5s_cubic-bezier(0.22,1,0.36,1)_backwards]" : ""}`}>
        <Icon name={icon} className="h-[14px] w-[14px] shrink-0" />
      </span>
      <span className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-300 ease-move group-focus-visible/icon:grid-cols-[1fr] pointer-fine:group-hover/icon:grid-cols-[1fr]">
        <span className="overflow-hidden whitespace-nowrap">
          <span className="pl-[7px] text-[12px]">{label}</span>
        </span>
      </span>
      {dot && (
        <span className="absolute top-[6px] right-[6px] h-[6px] w-[6px] rounded-full bg-[var(--accent)] [box-shadow:0px_0px_6px_var(--glow)] motion-safe:animate-roll-in" />
      )}
    </button>
  );
}

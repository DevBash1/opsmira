/**
 * Small loading spinner that turns exactly on its centre: a faint full track with a short
 * round-capped arc on it. The even-sized box keeps the centre on the pixel grid and the whole
 * glyph turns as its own layer, so it isn't re-rasterised every frame (the old outline icon,
 * a three-quarter arc, read as wobbling around the middle at small sizes).
 */
export function Spinner({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 14 14"
      width={size}
      height={size}
      aria-hidden="true"
      className={`shrink-0 [will-change:transform] motion-safe:animate-spin ${className}`}
    >
      <circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.6" />
      <circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="9 24" />
    </svg>
  );
}

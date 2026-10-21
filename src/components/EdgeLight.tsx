import type { CSSProperties } from "react";

const DOTS = 22;
const SPACING = 7;

function Dots({ count, spacing }: { count: number; spacing: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          aria-hidden="true"
          className="edge-dot"
          style={{ "--back": `${i * spacing}px`, opacity: (1 - i / count) ** 1.7 } as CSSProperties}
        />
      ))}
    </>
  );
}

/** A comet of light running round the edge of its parent (which must be `relative` and rounded). */
export function EdgeLight({ glow = false, slow = false }: { glow?: boolean; slow?: boolean }) {
  return (
    <>
      {glow && (
        <span className="liquid-edge-glow motion-reduce:hidden">
          <Dots count={10} spacing={12} />
        </span>
      )}
      <span className={slow ? "liquid-edge liquid-edge-slow" : "liquid-edge"}>
        <Dots count={DOTS} spacing={SPACING} />
      </span>
    </>
  );
}

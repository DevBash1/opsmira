import type { CSSProperties, ReactNode } from "react";
import { useT } from "./time";

/* The product's frosted glass (.glass in src/index.css): translucent fills, a rim light and a specular
 * glare instead of backdrop-filter. */
export const GLASS_BG =
  "linear-gradient(145deg, color-mix(in oklab, var(--surface) 86%, transparent) 0%, color-mix(in oklab, var(--surface) 58%, transparent) 55%, color-mix(in oklab, var(--surface) 72%, transparent) 100%)";
export const GLASS_SHADOW =
  "inset 0 1px 0 color-mix(in oklab, var(--surface) 95%, transparent), inset 0 -1px 0 color-mix(in oklab, var(--accent) 10%, transparent), 0 1px 2px var(--shadow), 0 26px 60px -20px color-mix(in oklab, var(--accent) 38%, transparent)";
export const GLARE =
  "radial-gradient(130% 90% at 0% 0%, color-mix(in oklab, var(--surface) 80%, transparent), transparent 55%), radial-gradient(80% 60% at 100% 100%, color-mix(in oklab, var(--accent-2) 10%, transparent), transparent 70%)";

export function Glass({ radius = 22, style, children }: { radius?: number; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        borderRadius: radius,
        isolation: "isolate",
        background: GLASS_BG,
        boxShadow: GLASS_SHADOW,
        outline: "1px solid var(--hairline)",
        outlineOffset: -0.5,
        ...style,
      }}
    >
      <div style={{ position: "absolute", inset: 0, zIndex: -1, borderRadius: "inherit", pointerEvents: "none", background: GLARE }} />
      {children}
    </div>
  );
}

/** SceneKit's Panel: 20px radius, glass fill, soft drop shadow, hairline outline. */
export function Panel({ children, style, live = false, inset = false }: { children?: ReactNode; style?: CSSProperties; live?: boolean; inset?: boolean }) {
  return (
    <div
      style={{
        borderRadius: inset ? 14 : 20,
        background: inset ? "var(--canvas)" : "var(--glass)",
        boxShadow: inset ? undefined : "0px 16px 40px var(--shadow)",
        outline: live ? "1px solid var(--accent)" : "1px solid var(--hairline)",
        outlineOffset: -0.5,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const RING_MASK: CSSProperties = {
  padding: 1.5,
  overflow: "hidden",
  WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
  WebkitMaskComposite: "xor",
  mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
};

/** A comet of light running round the edge of its (relative, rounded) parent: the "agent is working" light. */
export function EdgeLight({
  radius = 22,
  period = 150,
  glow = false,
  opacity = 1,
  start = 0,
  c1 = "var(--accent-2)",
  c2 = "var(--accent)",
}: {
  radius?: number;
  /** Frames for one lap. */
  period?: number;
  glow?: boolean;
  opacity?: number;
  start?: number;
  c1?: string;
  c2?: string;
}) {
  const f = useT();
  const lap = (((f - start) / period) % 1 + 1) % 1;
  const dots = (count: number, spacing: number, size: number) =>
    Array.from({ length: count }, (_, i) => (
      <i
        key={i}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: size,
          height: size,
          borderRadius: "50%",
          background: i === 0 ? `color-mix(in oklab, ${c1} 80%, white)` : c2,
          offsetPath: `inset(0.75px round ${radius - 0.75}px)`,
          offsetRotate: "0deg",
          offsetAnchor: "50% 50%",
          offsetDistance: `calc(${lap * 100}% - ${i * spacing}px)`,
          opacity: (1 - i / count) ** 1.7,
        }}
      />
    ));
  return (
    <div style={{ position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none", opacity }}>
      {glow && (
        <span style={{ position: "absolute", inset: 0, borderRadius: "inherit", opacity: 0.16, filter: "blur(5px)" }}>
          {dots(10, 12, 12)}
        </span>
      )}
      <span style={{ position: "absolute", inset: 0, borderRadius: "inherit", opacity: 0.8, ...RING_MASK }}>{dots(22, 7, 8)}</span>
    </div>
  );
}

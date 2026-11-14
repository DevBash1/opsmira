import { E, ramp } from "./motion";
import { useT } from "./time";

/** A pointer drawn by us: arrow with a soft shadow, a small squash and a ripple when it presses. */
export function Cursor({
  x,
  y,
  visible = 1,
  pressAt,
  scale = 1,
  light = false,
}: {
  x: number;
  y: number;
  visible?: number;
  /** Frame of the click. */
  pressAt?: number;
  scale?: number;
  light?: boolean;
}) {
  const f = useT();
  const pressing = pressAt === undefined ? 0 : f >= pressAt - 2 && f < pressAt + 6 ? 1 : 0;
  const rip = pressAt === undefined ? 1 : ramp(f, pressAt, 22, E.enter);
  const squash = pressAt === undefined ? 0 : ramp(f, pressAt - 3, 3, E.enter) * (1 - ramp(f, pressAt + 3, 8, E.enter));
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, opacity: visible, zIndex: 100, transform: `translate(${x}px, ${y}px)`, pointerEvents: "none" }}>
      {pressAt !== undefined && f >= pressAt && rip < 1 && (
        <span
          style={{
            position: "absolute",
            left: -22 * scale,
            top: -22 * scale,
            width: 44 * scale,
            height: 44 * scale,
            borderRadius: 999,
            border: `${2 * scale}px solid ${light ? "rgba(51,123,88,0.55)" : "rgba(145,205,170,0.7)"}`,
            opacity: 0.9 * (1 - rip),
            transform: `scale(${0.3 + 1.1 * rip})`,
          }}
        />
      )}
      <svg
        width={26 * scale}
        height={30 * scale}
        viewBox="0 0 26 30"
        style={{ position: "absolute", left: -3 * scale, top: -2 * scale, overflow: "visible", transformOrigin: `${3 * scale}px ${2 * scale}px`, transform: `scale(${1 - 0.12 * Math.max(squash, pressing * 0)})`, filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.45))" }}
        aria-hidden="true"
      >
        <path d="M3 2 L3 21.5 L7.6 17.4 L10.9 24.6 L14.1 23.2 L10.9 16.2 L17.2 16.2 Z" fill={light ? "#111614" : "#ffffff"} stroke={light ? "#ffffff" : "#111614"} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** A cursor path through screen points [frame, x, y], eased between them. */
export function cursorAt(f: number, pts: Array<[number, number, number]>): { x: number; y: number } {
  if (f <= pts[0][0]) return { x: pts[0][1], y: pts[0][2] };
  for (let i = 1; i < pts.length; i++) {
    const [f1, x1, y1] = pts[i];
    const [f0, x0, y0] = pts[i - 1];
    if (f <= f1) {
      const t = f1 === f0 ? 1 : (f - f0) / (f1 - f0);
      const e = E.inOut(t);
      // A slight arc, like a hand moving: offset perpendicular to the path, strongest mid-way.
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const arc = Math.sin(e * Math.PI) * Math.min(26, len * 0.08);
      return { x: x0 + dx * e - (dy / len) * arc, y: y0 + dy * e + (dx / len) * arc };
    }
  }
  const last = pts[pts.length - 1];
  return { x: last[1], y: last[2] };
}

/** A glowing dot with a short trail travelling along a curve (quadratic Bezier) from a to b. */
export function FlowDot({ from, to, bend = -120, p, size = 9, color = "var(--accent)" }: { from: { x: number; y: number }; to: { x: number; y: number }; bend?: number; p: number; size?: number; color?: string }) {
  if (p <= 0 || p >= 1.02) return null;
  const mid = { x: (from.x + to.x) / 2 + (to.y - from.y) * 0.0, y: (from.y + to.y) / 2 + bend };
  const at = (u: number) => {
    const k = Math.min(1, Math.max(0, u));
    return {
      x: (1 - k) * (1 - k) * from.x + 2 * (1 - k) * k * mid.x + k * k * to.x,
      y: (1 - k) * (1 - k) * from.y + 2 * (1 - k) * k * mid.y + k * k * to.y,
    };
  };
  const e = E.inOut(Math.min(1, p));
  const trail = 14;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, zIndex: 90, pointerEvents: "none", opacity: p > 0.94 ? 1 - (p - 0.94) / 0.08 : 1 }}>
      {Array.from({ length: trail }, (_, i) => {
        const pt = at(e - i * 0.018);
        const k = 1 - i / trail;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: pt.x - (size * k) / 2,
              top: pt.y - (size * k) / 2,
              width: size * k,
              height: size * k,
              borderRadius: 999,
              background: i === 0 ? "#d9fbe9" : color,
              boxShadow: i === 0 ? `0 0 14px 3px color-mix(in oklab, ${color} 70%, transparent)` : undefined,
              opacity: k ** 1.6,
            }}
          />
        );
      })}
    </div>
  );
}

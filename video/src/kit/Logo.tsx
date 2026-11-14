import type { CSSProperties } from "react";
import { BRAND } from "./tokens";
import { FONT_DISPLAY } from "./fonts";

const R = 18;
const RING_LEN = R * ((3 * Math.PI) / 2);
const deg = (a: number) => (a * Math.PI) / 180;
const at = (angle: number) => ({ x: 32 + R * Math.cos(deg(angle)), y: 32 + R * Math.sin(deg(angle)) });

/**
 * The Opsmira mark (docs/assets/logo.svg), animatable.
 *  square  0..1  the rounded square fades/scales in
 *  draw    0..1  the ring draws itself, the pale dot riding at its head (3 o'clock round to 12 o'clock)
 *  settle  0..1  the dot slides on into its place in the gap, with a small overshoot
 *  glow    0..1  a halo around the dot (end-card pulse)
 */
export function Logo({
  size = 128,
  square = 1,
  draw = 1,
  settle = 1,
  glow = 0,
  shadow = true,
  style,
}: {
  size?: number;
  square?: number;
  draw?: number;
  settle?: number;
  glow?: number;
  shadow?: boolean;
  style?: CSSProperties;
}) {
  const ringP = Math.max(0, Math.min(1, draw));
  // 0..270 while drawing, then on to 315 (the resting angle of the dot) with a little overshoot.
  const overshoot = settle <= 0 ? 0 : settle >= 1 ? 1 : 1 - Math.pow(1 - settle, 3) * Math.cos(settle * Math.PI * 1.6);
  const angle = settle > 0 ? 270 + 45 * overshoot : 270 * ringP;
  const dot = at(angle);
  const dotR = 5.4 * Math.min(1, ringP * 6 + 0.001) * (1 + 0.12 * glow);
  const id = `logo-g-${size}`;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      style={{ overflow: "visible", display: "block", ...style }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="8" y1="4" x2="58" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={BRAND.from} />
          <stop offset="1" stopColor={BRAND.to} />
        </linearGradient>
        <radialGradient id={`${id}-halo`}>
          <stop offset="0" stopColor="#d9fbe9" stopOpacity="0.9" />
          <stop offset="1" stopColor="#d9fbe9" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-bloom`}>
          <stop offset="0" stopColor="#4aae7c" stopOpacity="0.55" />
          <stop offset="1" stopColor="#4aae7c" stopOpacity="0" />
        </radialGradient>
      </defs>
      {shadow && square > 0 && <circle cx="32" cy="34" r="46" fill={`url(#${id}-bloom)`} opacity={0.5 * square} />}
      <g
        style={{
          transformOrigin: "32px 32px",
          transform: `scale(${0.86 + 0.14 * square})`,
          opacity: square,
        }}
      >
        <rect width="64" height="64" rx="15" fill={`url(#${id})`} />
      </g>
      {ringP > 0.001 && (
        <path
          d="M50 32A18 18 0 1 1 32 14"
          fill="none"
          stroke="#fff"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${RING_LEN} ${RING_LEN}`}
          strokeDashoffset={RING_LEN * (1 - ringP)}
        />
      )}
      {glow > 0 && <circle cx={dot.x} cy={dot.y} r={16 + 10 * glow} fill={`url(#${id}-halo)`} opacity={0.55 * glow} />}
      {ringP > 0.001 && <circle cx={dot.x} cy={dot.y} r={dotR} fill={BRAND.dot} />}
    </svg>
  );
}

/** "Opsmira" the way the banner sets it: Space Grotesk 700, tight tracking. */
export function Wordmark({ size = 96, color = "#f2f6f4", style }: { size?: number; color?: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        fontFamily: FONT_DISPLAY,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: "-0.024em",
        color,
        ...style,
      }}
    >
      Opsmira
    </span>
  );
}

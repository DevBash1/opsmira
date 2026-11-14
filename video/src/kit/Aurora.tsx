import { useCurrentFrame, useVideoConfig } from "remotion";
import { E, kf, type EaseFn } from "./motion";

/* The console's aurora (src/index.css): four soft circles stretched and rotated as they drift. Only
 * transforms move; no filters. Frame-driven so every frame is deterministic. */

type Pose = [number, number, number, number, number]; // translateX %, translateY %, rotate deg, scaleX, scaleY
type Blob = {
  style: "tr" | "bl" | "ml" | "br";
  size: number; // vmax
  alpha: number; // mix of the colour with transparent, in %
  color: string;
  poses: Array<[number, Pose]>;
  duration: number;
  delay: number;
};

const ID: Pose = [0, 0, 0, 1, 1];
const BLOBS: Blob[] = [
  { style: "tr", size: 74, alpha: 24, color: "var(--accent)", duration: 30, delay: -7, poses: [[0, ID], [0.3, [-7, 6, 16, 1.1, 0.92]], [0.65, [-12, -3, -10, 0.94, 1.08]], [1, [-3, 9, 8, 1.06, 1]]] },
  { style: "bl", size: 66, alpha: 20, color: "var(--accent-2)", duration: 36, delay: -21, poses: [[0, ID], [0.35, [9, -7, -14, 1.12, 0.9]], [0.7, [4, -13, 12, 0.92, 1.1]], [1, [11, -2, -4, 1.04, 1.04]]] },
  { style: "ml", size: 52, alpha: 10, color: "var(--accent-strong)", duration: 25, delay: -12, poses: [[0, ID], [0.5, [14, -10, 28, 1.15, 0.88]], [1, [6, 8, -12, 0.95, 1.1]]] },
  { style: "br", size: 46, alpha: 13, color: "var(--accent-2)", duration: 42, delay: -33, poses: [[0, ID], [0.4, [-10, -8, 20, 0.9, 1.12]], [1, [-4, -14, -16, 1.1, 0.94]]] },
];

function pose(t: number, b: Blob): Pose {
  // CSS "alternate": 0 -> 1 -> 0 ..., ease-in-out between keyframes.
  const cycle = (((t - b.delay) / b.duration) % 2 + 2) % 2;
  const p = cycle <= 1 ? cycle : 2 - cycle;
  const keys = b.poses;
  const out: number[] = [];
  for (let c = 0; c < 5; c++) {
    out.push(kf(p, keys.map(([k, v]) => [k, v[c], E.cssInOut as EaseFn] as [number, number, EaseFn])));
  }
  return out as Pose;
}

export function Aurora({
  width,
  height,
  strength,
  energy = 0,
  veil = 0,
  speed = 3,
  offset = 0,
  grain = true,
}: {
  width?: number;
  height?: number;
  /** Multiplies --aurora-strength (1 = the theme's own value). */
  strength?: number;
  /** The glow that rises behind the composer while the agent works (0..1). */
  energy?: number;
  veil?: number;
  /** Video time runs faster than product time so the drift is visible in 80 seconds. */
  speed?: number;
  offset?: number;
  grain?: boolean;
}) {
  const frame = useCurrentFrame();
  const cfg = useVideoConfig();
  const w = width ?? cfg.width;
  const h = height ?? cfg.height;
  const vmax = Math.max(w, h) / 100;
  const t = (frame / cfg.fps) * speed + offset;
  const place = (b: Blob) => {
    const px = b.size * vmax;
    switch (b.style) {
      case "tr": return { top: -34 * vmax, right: -26 * vmax, width: px };
      case "bl": return { bottom: -32 * vmax, left: -28 * vmax, width: px };
      case "ml": return { top: 0.18 * h, left: -20 * vmax, width: px };
      case "br": return { right: 4 * vmax, bottom: -20 * vmax, width: px };
    }
  };
  const s = strength ?? 1;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", contain: "strict" }}>
      <div style={{ position: "absolute", inset: 0, opacity: `calc(var(--aurora-strength) * ${s})` as unknown as number }}>
        {BLOBS.map((b, i) => {
          const [tx, ty, rot, sx, sy] = pose(t, b);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                aspectRatio: "1",
                borderRadius: "50%",
                background: `radial-gradient(closest-side, color-mix(in oklab, ${b.color} ${b.alpha}%, transparent), transparent)`,
                transform: `translate(${tx}%, ${ty}%) rotate(${rot}deg) scale(${sx}, ${sy})`,
                willChange: "transform",
                ...place(b),
              }}
            />
          );
        })}
      </div>
      {energy > 0.001 && (
        <div
          style={{
            position: "absolute",
            bottom: -30 * vmax,
            left: "50%",
            width: 60 * vmax,
            aspectRatio: "1.6",
            borderRadius: "50%",
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--accent) 30%, transparent), color-mix(in oklab, var(--accent-2) 14%, transparent) 55%, transparent)",
            opacity: energy,
            transform: `translateX(-50%) translateY(${-6 * Math.sin(t * 0.4)}%) scale(${1 + 0.06 * Math.sin(t * 0.45)}, ${1 + 0.05 * Math.sin(t * 0.37)})`,
          }}
        />
      )}
      {veil > 0.001 && <div style={{ position: "absolute", inset: 0, background: "color-mix(in oklab, var(--canvas) 55%, transparent)", opacity: veil }} />}
      {grain && <GrainLayer opacity={0.035} />}
    </div>
  );
}

const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

/** Fine grain. It hops a few pixels every other frame so it reads as film, not as a pattern. */
export function GrainLayer({ opacity = 0.05, size = 160 }: { opacity?: number; size?: number }) {
  const frame = useCurrentFrame();
  const n = Math.floor(frame / 2);
  const x = Math.floor(((Math.sin(n * 12.9898) * 43758.5453) % 1 + 1) % 1 * size);
  const y = Math.floor(((Math.sin(n * 78.233) * 24634.6345) % 1 + 1) % 1 * size);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        backgroundImage: GRAIN,
        backgroundSize: `${size}px`,
        backgroundPosition: `${x}px ${y}px`,
      }}
    />
  );
}

export function Vignette({ strength = 0.4 }: { strength?: number }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        background: `radial-gradient(120% 120% at 50% 45%, transparent 55%, rgba(0,0,0,${strength}) 100%)`,
      }}
    />
  );
}

import { useId, type CSSProperties, type ReactNode } from "react";
import { useVideoConfig } from "remotion";
import { E, type EaseFn, kf } from "./motion";

/** A camera pose over a 1920x1080 "world": the point (x, y) sits at the centre of the frame. */
export type Pose = { x: number; y: number; zoom: number; rx?: number; ry?: number; rz?: number };
export type PoseKey = { f: number; pose: Pose; ease?: EaseFn };

/** Interpolates a list of poses (each segment eased with the ease of the key it arrives at). */
export function poseAt(f: number, keys: PoseKey[]): Required<Pose> {
  const pick = (get: (p: Pose) => number) => kf(f, keys.map((k) => [k.f, get(k.pose), k.ease ?? E.inOut] as [number, number, EaseFn]));
  return {
    x: pick((p) => p.x),
    y: pick((p) => p.y),
    zoom: pick((p) => p.zoom),
    rx: pick((p) => p.rx ?? 0),
    ry: pick((p) => p.ry ?? 0),
    rz: pick((p) => p.rz ?? 0),
  };
}

/**
 * The stage camera. Children live in 1920x1080 world coordinates; the pose pushes in, pans and tilts them in
 * 3D (CSS perspective), so layers at different `translateZ` parallax against each other.
 */
export function Camera({
  pose,
  children,
  perspective = 2200,
  style,
  origin,
}: {
  pose: Pose;
  children: ReactNode;
  perspective?: number;
  style?: CSSProperties;
  origin?: { x: number; y: number };
}) {
  const { width, height } = useVideoConfig();
  const ox = origin?.x ?? width / 2;
  const oy = origin?.y ?? height / 2;
  const { x, y, zoom, rx = 0, ry = 0, rz = 0 } = pose;
  return (
    <div style={{ position: "absolute", inset: 0, perspective, perspectiveOrigin: `${ox}px ${oy}px`, ...style }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height,
          transformStyle: "preserve-3d",
          transformOrigin: "0 0",
          transform: `translate(${ox}px, ${oy}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${zoom}) translate(${-x}px, ${-y}px)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** A directional (horizontal / vertical) blur for whip pans: one SVG filter, no repeated renders. */
export function StreakBlur({ x = 0, y = 0, children, style }: { x?: number; y?: number; children: ReactNode; style?: CSSProperties }) {
  const id = useId().replace(/:/g, "");
  if (Math.abs(x) < 0.3 && Math.abs(y) < 0.3) return <div style={{ position: "absolute", inset: 0, ...style }}>{children}</div>;
  return (
    <div style={{ position: "absolute", inset: 0, filter: `url(#sb-${id})`, ...style }}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <filter id={`sb-${id}`} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation={`${Math.abs(x)} ${Math.abs(y)}`} />
          </filter>
        </defs>
      </svg>
      {children}
    </div>
  );
}

/** Depth of field helper: a layer that sits `depth` away from the focal plane blurs by `amount` px per unit. */
export const dof = (depth: number, amount = 6): CSSProperties => (Math.abs(depth) < 0.01 ? {} : { filter: `blur(${Math.abs(depth) * amount}px)` });

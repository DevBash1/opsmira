import { useId, type CSSProperties } from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { E } from "./motion";

/* Designed transitions as custom presentations: plain CSS (no WebGL), so they render in headless Chrome. */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

/* ---- blur-through: the old scene swells and dissolves into a haze; the new one resolves out of it ---- */
type BlurThroughProps = { blur?: number; zoom?: number; glow?: number };
function BlurThroughC({ children, presentationDirection, presentationProgress, passedProps }: TransitionPresentationComponentProps<BlurThroughProps>) {
  const { blur = 26, zoom = 0.07, glow = 0 } = passedProps;
  const p = presentationProgress;
  const entering = presentationDirection === "entering";
  if (!entering) {
    const q = E.inOut(p);
    return (
      <AbsoluteFill style={{ transform: `scale(${1 + zoom * q})`, filter: q > 0.01 ? `blur(${blur * q}px)` : undefined }}>
        {children}
      </AbsoluteFill>
    );
  }
  const op = E.inOut(seg(p, 0.2, 0.85));
  const q = 1 - E.enter(seg(p, 0.15, 1));
  return (
    <AbsoluteFill style={{ opacity: op, transform: `scale(${1 - zoom * 0.8 * q})`, filter: q > 0.01 ? `blur(${blur * 0.9 * q}px)` : undefined }}>
      {children}
      {glow > 0 && (
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            background: "radial-gradient(60% 60% at 50% 50%, rgba(217,251,233,0.55), rgba(217,251,233,0) 70%)",
            opacity: glow * Math.sin(clamp01(p) * Math.PI) * 0.8,
          }}
        />
      )}
    </AbsoluteFill>
  );
}
export const blurThrough = (props: BlurThroughProps = {}): TransitionPresentation<BlurThroughProps> => ({ component: BlurThroughC, props });

/* ---- light sweep: the new scene is revealed behind a soft, bright edge travelling across the frame ---- */
type SweepProps = { dir?: 1 | -1; tone?: "light" | "dark"; soft?: number; angle?: number };
function SweepC({ children, presentationDirection, presentationProgress, passedProps }: TransitionPresentationComponentProps<SweepProps>) {
  const { dir = 1, tone = "light", soft = 26, angle = 100 } = passedProps;
  const p = Easing.bezier(0.6, 0, 0.3, 1)(presentationProgress);
  const entering = presentationDirection === "entering";
  if (!entering) {
    return (
      <AbsoluteFill style={{ transform: `scale(${1 + 0.03 * p})`, filter: p > 0.02 ? `blur(${6 * p}px)` : undefined }}>
        {children}
        <AbsoluteFill style={{ background: tone === "light" ? "#ffffff" : "#000000", opacity: 0.0 }} />
      </AbsoluteFill>
    );
  }
  // The front moves from -soft% to 100+soft% (mirrored when dir = -1).
  const front = interpolate(p, [0, 1], [-soft, 100 + soft]);
  const pos = dir === 1 ? front : 100 - front;
  const toward = dir === 1 ? "to right" : "to left";
  const a = Math.max(0, front - soft);
  const b = Math.min(100, front);
  // CSS mask: opaque behind the front (already revealed), transparent ahead of it.
  const mask = `linear-gradient(${angle - 90 + (dir === 1 ? 0 : 180)}deg, #000 0%, #000 ${Math.max(0, front - soft)}%, transparent ${front}%)`;
  void toward;
  void a;
  void b;
  const stripe: CSSProperties = {
    position: "absolute",
    top: -200,
    bottom: -200,
    width: "34%",
    left: `${pos - 17}%`,
    transform: `skewX(${dir === 1 ? -14 : 14}deg)`,
    background:
      tone === "light"
        ? "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,252,240,0.85) 55%, rgba(255,255,255,0) 100%)"
        : "linear-gradient(90deg, rgba(95,211,148,0) 0%, rgba(95,211,148,0.35) 55%, rgba(95,211,148,0) 100%)",
    opacity: Math.sin(clamp01(presentationProgress) * Math.PI),
    pointerEvents: "none",
  };
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ WebkitMaskImage: mask, maskImage: mask }}>{children}</AbsoluteFill>
      <div style={stripe} />
    </AbsoluteFill>
  );
}
export const sweep = (props: SweepProps = {}): TransitionPresentation<SweepProps> => ({ component: SweepC, props });

/* ---- whip: a fast horizontal pan with a directional streak ---- */
type WhipProps = { dir?: 1 | -1; streak?: number; width?: number };
function WhipC({ children, presentationDirection, presentationProgress, passedProps }: TransitionPresentationComponentProps<WhipProps>) {
  const { dir = 1, streak = 70, width = 1920 } = passedProps;
  const id = useId().replace(/:/g, "");
  const entering = presentationDirection === "entering";
  const q = Easing.bezier(0.7, 0, 0.18, 1)(presentationProgress);
  const x = entering ? dir * width * (1 - q) : -dir * width * q;
  const speed = Math.sin(clamp01(presentationProgress) * Math.PI); // 0..1..0
  const sx = streak * speed;
  return (
    <AbsoluteFill style={{ transform: `translateX(${x}px)`, filter: sx > 0.5 ? `url(#whip-${id})` : undefined }}>
      {sx > 0.5 && (
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          <defs>
            <filter id={`whip-${id}`} x="-5%" y="0%" width="110%" height="100%" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation={`${sx} 0`} />
            </filter>
          </defs>
        </svg>
      )}
      {children}
    </AbsoluteFill>
  );
}
export const whip = (props: WhipProps = {}): TransitionPresentation<WhipProps> => ({ component: WhipC, props });

/* ---- zoom-through: the camera pushes through the old scene and settles inside the new one ---- */
type ZoomProps = { amount?: number; blur?: number };
function ZoomC({ children, presentationDirection, presentationProgress, passedProps }: TransitionPresentationComponentProps<ZoomProps>) {
  const { amount = 0.55, blur = 22 } = passedProps;
  const p = presentationProgress;
  const entering = presentationDirection === "entering";
  if (!entering) {
    const q = Easing.bezier(0.55, 0, 0.9, 0.6)(p);
    return (
      <AbsoluteFill style={{ transform: `scale(${1 + amount * q})`, filter: q > 0.01 ? `blur(${blur * q}px)` : undefined }}>
        {children}
      </AbsoluteFill>
    );
  }
  const q = 1 - E.enter(seg(p, 0.1, 1));
  const op = E.inOut(seg(p, 0.1, 0.7));
  return (
    <AbsoluteFill style={{ opacity: op, transform: `scale(${1 - 0.22 * q})`, filter: q > 0.01 ? `blur(${blur * q}px)` : undefined }}>
      {children}
    </AbsoluteFill>
  );
}
export const zoomThrough = (props: ZoomProps = {}): TransitionPresentation<ZoomProps> => ({ component: ZoomC, props });

import type { CSSProperties, ReactNode } from "react";
import { Aurora } from "./Aurora";
import { FONT_BODY } from "./fonts";
import { themeVars, type Theme } from "./tokens";

export const WIN_W = 1280;
export const WIN_H = 720;
export const WIN_SCALE = 1.5;

/** Where a point of the console window (logical px) lands in the 1920x1080 world. */
export const winPt = (x: number, y: number, scale = WIN_SCALE, cx = 960, cy = 540) => ({ x: cx + (x - WIN_W / 2) * scale, y: cy + (y - WIN_H / 2) * scale });

/**
 * A console window: the product's chrome-free layout (aurora behind a column, top bar, composer dock)
 * at 1280x720 logical px, placed at the centre of the world and scaled to fill the frame.
 */
export function ConsoleWindow({
  theme,
  scale = WIN_SCALE,
  aurora = 1,
  energy = 0,
  veil = 0,
  radius = 18,
  cx = 960,
  cy = 540,
  chrome = true,
  children,
  style,
}: {
  theme: Theme;
  scale?: number;
  aurora?: number;
  energy?: number;
  veil?: number;
  radius?: number;
  cx?: number;
  cy?: number;
  chrome?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        ...themeVars(theme),
        position: "absolute",
        left: cx - WIN_W / 2,
        top: cy - WIN_H / 2,
        width: WIN_W,
        height: WIN_H,
        transform: `scale(${scale})`,
        transformOrigin: "50% 50%",
        borderRadius: radius,
        overflow: "hidden",
        background: "var(--canvas)",
        color: "var(--ink)",
        fontFamily: FONT_BODY,
        outline: chrome ? "1px solid rgba(255,255,255,0.08)" : undefined,
        outlineOffset: -1,
        boxShadow: chrome ? "0 60px 140px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)" : undefined,
        ...style,
      }}
    >
      <Aurora width={WIN_W} height={WIN_H} strength={aurora} energy={energy} veil={veil} speed={3} />
      {children}
    </div>
  );
}

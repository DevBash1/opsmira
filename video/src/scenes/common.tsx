import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { Aurora } from "../kit/Aurora";
import type { Pose } from "../kit/Camera";
import { themeVars, type Theme } from "../kit/tokens";
import { winPt } from "../kit/window";
import { COMPOSER_W } from "../kit/composer";

/** Chat viewport inside the 1280x720 console window (logical px). */
export const CHAT = { top: 48, bottom: 144 };
export const VIEW_BOTTOM = 720 - CHAT.bottom;

/** A camera pose aimed at a point of the console window (logical px). */
export const P = (lx: number, ly: number, zoom: number, rx = 0, ry = 0, rz = 0): Pose => ({ ...winPt(lx, ly), zoom, rx, ry, rz });

/** The world behind a floating console window: the canvas with a dimmer aurora. */
export function Backdrop({ theme = "dark", strength = 0.7, energy = 0 }: { theme?: Theme; strength?: number; energy?: number }) {
  return (
    <AbsoluteFill style={{ ...themeVars(theme), background: theme === "dark" ? "#0b100e" : "#eef1ed" }}>
      <Aurora width={1920} height={1080} strength={strength} energy={energy} speed={3} offset={40} grain={false} />
    </AbsoluteFill>
  );
}

/** The composer's place in the window: bottom centre. */
export function ComposerDock({ children }: { children: ReactNode }) {
  return <div style={{ position: "absolute", left: (1280 - COMPOSER_W) / 2, bottom: 28, zIndex: 10 }}>{children}</div>;
}

/** Window coordinates of the controls the cursor visits (logical px). */
export const TARGET = {
  send: { x: 1011, y: 663 },
  topIcon: (name: "theme" | "history" | "tasks" | "artifacts" | "memory" | "scenes" | "audit" | "logout") => {
    const order = ["theme", "history", "tasks", "artifacts", "memory", "scenes", "audit", "logout"] as const;
    const i = order.indexOf(name);
    return { x: 1236 - (order.length - 1 - i) * 34, y: 28 };
  },
};

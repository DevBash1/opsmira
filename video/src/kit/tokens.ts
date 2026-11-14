import type { CSSProperties } from "react";

/** The product's real design tokens (src/index.css), light and dark. */
export type Theme = "dark" | "light";

const light: Record<string, string> = {
  "--canvas": "#f8f9f7",
  "--ink": "#202b26",
  "--muted": "#66746c",
  "--line": "#dde4de",
  "--surface": "#ffffff",
  "--accent": "#337b58",
  "--soft": "#ebf2ec",
  "--accent-2": "#2e8c8a",
  "--accent-strong": "#1f5e40",
  "--glow": "#3fa06e33",
  "--glow-2": "#2e8c8a26",
  "--glass": "#ffffffcc",
  "--raised": "#ffffff",
  "--shadow": "#1f3a2a1f",
  "--hairline": "#20302814",
  "--danger": "#c2412d",
  "--tok-comment": "#7b8880",
  "--tok-string": "#9a5a1c",
  "--tok-keyword": "#86409c",
  "--tok-command": "#1f5e40",
  "--tok-flag": "#1d6a87",
  "--tok-variable": "#a3316a",
  "--tok-number": "#ad5810",
  "--tok-key": "#2a5aa8",
  "--tok-operator": "#66746c",
  "--tok-path": "#3d6b52",
  "--aurora-strength": "1",
  "--cmd": "#4f8cff",
};

const dark: Record<string, string> = {
  "--canvas": "#111614",
  "--ink": "#e9eee9",
  "--muted": "#96a59b",
  "--line": "#2c3730",
  "--surface": "#1a211d",
  "--accent": "#91cdaa",
  "--soft": "#23372b",
  "--accent-2": "#7fd6cf",
  "--accent-strong": "#b5efcb",
  "--glow": "#5fd39444",
  "--glow-2": "#4fc1c033",
  "--glass": "#1a211db3",
  "--raised": "#1f2823",
  "--shadow": "#00000080",
  "--hairline": "#ffffff14",
  "--danger": "#f08a80",
  "--tok-comment": "#72857a",
  "--tok-string": "#e6b673",
  "--tok-keyword": "#d2a2ee",
  "--tok-command": "#b5efcb",
  "--tok-flag": "#7fd0e6",
  "--tok-variable": "#f0a0c8",
  "--tok-number": "#f0b27a",
  "--tok-key": "#8db8f5",
  "--tok-operator": "#96a59b",
  "--tok-path": "#a9d9bd",
  "--aurora-strength": "0.6",
  "--cmd": "#4f8cff",
};

export const themeVars = (theme: Theme): CSSProperties => (theme === "dark" ? dark : light) as CSSProperties;

/** Raw values for places that need a number or hex in JS (SVG gradients, canvas-free glows). */
export const C = { dark, light };

export const CMD_BLUE = "#4f8cff";
export const BRAND = { from: "#4aae7c", to: "#1f7f86", dot: "#d9fbe9" };
export const BANNER = { from: "#0d1513", to: "#16251f" };

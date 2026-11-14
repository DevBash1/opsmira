import { loadFont as loadSpaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadPlexMono } from "@remotion/google-fonts/IBMPlexMono";

// Each loadFont call blocks rendering (delayRender) until its font files are ready.
const sg = loadSpaceGrotesk("normal", { weights: ["500", "600", "700"], subsets: ["latin"] });
const inter = loadInter("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
const mono = loadPlexMono("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });

export const FONT_DISPLAY = `${sg.fontFamily}, "Inter", system-ui, sans-serif`;
export const FONT_BODY = `${inter.fontFamily}, system-ui, sans-serif`;
export const FONT_CODE = `${mono.fontFamily}, ui-monospace, monospace`;

export const fontsReady = Promise.all([sg.waitUntilDone(), inter.waitUntilDone(), mono.waitUntilDone()]);

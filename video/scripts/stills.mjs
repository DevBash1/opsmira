#!/usr/bin/env node
/**
 * Render several frames of a composition in one go (one bundle, one browser), for art-direction review.
 *
 *   node scripts/stills.mjs Launch out/tmp/review 12.5,14.0,f1500 --scale=0.5
 *
 * Frames are seconds (12.5), or frame numbers prefixed with "f" (f1500). Output: <dir>/<comp>-<frame>.png
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [comp, outDirArg, list, ...rest] = process.argv.slice(2);
if (!comp || !outDirArg || !list) {
  console.error("usage: node scripts/stills.mjs <composition> <outDir> <seconds|fFrame,...> [--scale=0.5] [--props='{...}']");
  process.exit(1);
}
const opt = Object.fromEntries(rest.filter((a) => a.startsWith("--")).map((a) => a.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)));
const scale = Number(opt.scale ?? 1);
const props = opt.props ? JSON.parse(opt.props) : {};
const outDir = path.resolve(ROOT, outDirArg);
fs.mkdirSync(outDir, { recursive: true });

const serveUrl = await bundle({ entryPoint: path.join(ROOT, "src/index.ts"), onProgress: () => {} });
const browser = await openBrowser("chrome", { chromiumOptions: {}, chromeMode: "headless-shell" });
const composition = await selectComposition({ serveUrl, id: comp, inputProps: props, puppeteerInstance: browser });
const t0 = Date.now();
for (const item of list.split(",")) {
  const frame = item.startsWith("f") ? Number(item.slice(1)) : Math.round(Number(item) * composition.fps);
  const f = Math.min(composition.durationInFrames - 1, Math.max(0, frame));
  const output = path.join(outDir, `${comp}-${String(f).padStart(5, "0")}.png`);
  const t = Date.now();
  await renderStill({ composition, serveUrl, output, frame: f, scale, inputProps: props, puppeteerInstance: browser, imageFormat: "png" });
  console.log(`frame ${f} (${(f / composition.fps).toFixed(2)}s) -> ${path.relative(ROOT, output)}  ${Date.now() - t} ms`);
}
await browser.close({ silent: true });
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

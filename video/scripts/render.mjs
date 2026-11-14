#!/usr/bin/env node
/* Renders a deliverable: the picture with Remotion (muted), then muxes the finished mix (public/audio/master.wav) into it.
 *
 *   node scripts/render.mjs                    -> out/opsmira-launch-16x9.mp4
 *   node scripts/render.mjs --captions         -> out/opsmira-launch-16x9-captions.mp4
 *   node scripts/render.mjs --scale=0.5 --out=out/tmp/draft.mp4     (a quick half-size look)
 *   node scripts/render.mjs --poster           -> out/poster.png
 *
 * Run `npm run timeline && npm run audio` first if the beats, the voice or any sound changed.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const run = (cmd, argv) => {
  const r = spawnSync(cmd, argv, { cwd: root, stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`\n${cmd} ${argv.slice(0, 3).join(" ")} ... failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
};

mkdirSync(join(root, "out", "tmp"), { recursive: true });
const t0 = Date.now();

if (flag("poster")) {
  const out = opt("out", "out/poster.png");
  run("npx", ["remotion", "still", "src/index.ts", "Poster", out, "--image-format=png"]);
  console.log(`\n${out}  ${(statSync(join(root, out)).size / 1024).toFixed(0)} KB`);
  process.exit(0);
}

const captions = flag("captions");
const scale = opt("scale", "1");
const comp = captions ? "LaunchCaptions" : "Launch";
const out = opt("out", captions ? "out/opsmira-launch-16x9-captions.mp4" : "out/opsmira-launch-16x9.mp4");
const picture = join("out", "tmp", `${captions ? "captions" : "master"}-picture.mp4`);
const audio = "public/audio/master.wav";
if (!existsSync(join(root, audio))) {
  console.error(`${audio} is missing: run "npm run audio" first.`);
  process.exit(1);
}

const frames = opt("frames", null);
run("npx", [
  "remotion",
  "render",
  "src/index.ts",
  comp,
  picture,
  "--muted",
  "--concurrency=3",
  "--color-space=bt709",
  `--scale=${scale}`,
  ...(frames ? [`--frames=${frames}`] : []),
  `--props=${JSON.stringify({ captions, audio: false })}`,
]);

/* The length comes from the timeline, so a re-timed film is never cut short (it used to be a hard-coded 86). */
const timeline = JSON.parse(readFileSync(join(root, "src/timeline.generated.json"), "utf8"));
const seconds = frames ? null : opt("seconds", String(timeline.durationSeconds));
run("ffmpeg", [
  "-y",
  "-v",
  "error",
  "-i",
  picture,
  "-i",
  audio,
  "-map",
  "0:v:0",
  "-map",
  "1:a:0",
  "-c:v",
  "copy",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-ar",
  "48000",
  "-ac",
  "2",
  "-movflags",
  "+faststart",
  ...(seconds ? ["-t", seconds] : ["-shortest"]),
  out,
]);
rmSync(join(root, picture), { force: true });

const mins = ((Date.now() - t0) / 60000).toFixed(1);
console.log(`\n${out}  ${(statSync(join(root, out)).size / 1048576).toFixed(1)} MB  (${mins} min total)`);

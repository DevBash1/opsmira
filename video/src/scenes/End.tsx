import { AbsoluteFill } from "remotion";
import { Aurora } from "../kit/Aurora";
import { Camera, poseAt, type PoseKey } from "../kit/Camera";
import { FONT_CODE, FONT_DISPLAY } from "../kit/fonts";
import { Highlighted } from "../kit/Highlight";
import { Icon } from "../kit/Icon";
import { Logo, Wordmark } from "../kit/Logo";
import { E, blurRise, pulse, ramp } from "../kit/motion";
import { useDebug } from "../kit/debug";
import { useT } from "../kit/time";
import { themeVars } from "../kit/tokens";
import { GradientText, MaskLine } from "../kit/type";
import { ev, typed, wordFrom, TL } from "../timeline";

export function EndScene() {
  const f = useT();
  const debug = useDebug();
  const e = ev;
  const from = TL.scenes.end.from;
  const end = from + TL.scenes.end.duration;
  const t = typed("endcmd", f);
  const markAt = e("end_mark");
  const draw = ramp(f, markAt, 30, E.inOut);
  const settle = ramp(f, markAt + 30, 24, E.linear);
  const glow = ramp(f, e("end_glow"), 40, E.enter) * (0.65 + 0.35 * pulse(f, 90));
  const words: [string, number][] = [
    ["Your", wordFrom("e1", 1)],
    ["server,", wordFrom("e1", 2)],
    ["in", wordFrom("e1", 3)],
    ["plain", wordFrom("e1", 4)],
    ["words.", wordFrom("e1", 5)],
  ];
  const pose = debug.includes("nocam")
    ? { x: 960, y: 540, zoom: 1, rx: 0, ry: 0, rz: 0 }
    : poseAt(f, [
        { f: from, pose: { x: 960, y: 520, zoom: 1.12, rx: 0, ry: 0, rz: 0 } },
        { f: e("end_cmd_start"), pose: { x: 960, y: 560, zoom: 1.0, rx: 0, ry: 0, rz: 0 }, ease: E.inOut },
        { f: end, pose: { x: 960, y: 548, zoom: 0.97, rx: 0, ry: 0, rz: 0 }, ease: E.linear },
      ] satisfies PoseKey[]);
  const caretOn = f % 30 < 18 || f - t.last < 10;
  const cmdIn = ramp(f, e("end_cmd_start") - 10, 20, E.enter);
  const urlIn = e("end_url");
  const energy = 0.45 + 0.35 * glow;
  return (
    <AbsoluteFill style={{ ...themeVars("dark"), background: "#0b100e" }}>
      <Aurora width={1920} height={1080} strength={1.25} energy={energy} speed={3} offset={140} />
      <div style={{ position: "absolute", left: 660, top: 90, width: 600, height: 600, borderRadius: 999, background: "radial-gradient(circle, rgba(95,211,148,0.30), rgba(95,211,148,0) 62%)", opacity: glow }} />
      <Camera pose={pose}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 165 }}>
          <div style={{ position: "relative", width: 240, height: 240 }}>
            {[0, 1].map((k) => {
              const t0 = e("end_glow") + 20 + k * 54;
              const u = ((f - t0) % 108) / 108;
              if (f < t0 || u < 0) return null;
              return (
                <div
                  key={k}
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 60,
                    border: "3px solid rgba(127,214,207,0.9)",
                    // a breath out of the mark: it is gone before it reaches the wordmark
                    transform: `scale(${1 + u * 0.9})`,
                    opacity: Math.pow(1 - u, 3) * 0.8,
                  }}
                />
              );
            })}
            <Logo size={240} draw={draw} settle={settle} square={ramp(f, markAt - 6, 18, E.enter)} glow={glow} />
          </div>
          <div style={{ marginTop: 40 }}>
            <MaskLine start={wordFrom("e1", 0)} dur={26} pad="0.14em" inner={{}}>
              <Wordmark size={140} color="#f2f6f4" />
            </MaskLine>
          </div>
          <div style={{ marginTop: 26, fontFamily: FONT_DISPLAY, fontSize: 62, fontWeight: 500, letterSpacing: "-0.02em", display: "flex", gap: 17, color: "var(--accent-strong)" }}>
            {words.map(([w, at], i) => (
              <span key={i} style={{ display: "inline-block", ...blurRise(f, at - 2, { dur: 18, rise: 18, blur: 8 }) }}>
                {i >= 2 ? <GradientText from="#b5efcb" to="#7fd6cf">{w}</GradientText> : <span style={{ color: "#dfe9e3" }}>{w}</span>}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 70, opacity: cmdIn, transform: `translateY(${(1 - cmdIn) * 16}px)`, filter: cmdIn < 1 ? `blur(${(1 - cmdIn) * 6}px)` : undefined }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                borderRadius: 999,
                padding: "24px 44px 24px 34px",
                background: "rgba(14,20,17,0.78)",
                outline: "1px solid rgba(255,255,255,0.1)",
                outlineOffset: -1,
                boxShadow: "0 30px 90px rgba(0,0,0,0.5), 0 0 60px -10px rgba(95,211,148,0.25)",
                fontFamily: FONT_CODE,
                fontSize: 31,
                color: "#e9eee9",
                minWidth: 1080,
              }}
            >
              <span style={{ color: "#7fd6cf" }}>$</span>
              <span>
                <Highlighted text={t.text} />
                <span style={{ display: "inline-block", width: 15, height: 35, marginLeft: 3, transform: "translateY(6px)", background: caretOn ? "#e9eee9" : "transparent" }} />
              </span>
            </div>
          </div>
          <div style={{ marginTop: 36, display: "flex", alignItems: "center", gap: 22, ...blurRise(f, urlIn, { dur: 22 }) }}>
            <span style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: FONT_CODE, fontSize: 32, color: "#c3d3c9" }}>
              <Icon name="box" size={28} style={{ color: "#91cdaa" }} />
              github.com/DevBash1/opsmira
            </span>
            <span style={{ fontFamily: FONT_CODE, fontSize: 21, letterSpacing: 0.4, color: "#96a59b", borderRadius: 999, padding: "7px 16px", outline: "1px solid rgba(255,255,255,0.14)", outlineOffset: -1 }}>
              AGPL-3.0 · v0.1 · early software
            </span>
          </div>
        </div>
      </Camera>
    </AbsoluteFill>
  );
}

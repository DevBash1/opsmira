import { AbsoluteFill } from "remotion";
import { Camera, poseAt, type PoseKey } from "../kit/Camera";
import { Composer, ServerMenu } from "../kit/composer";
import { Cursor, cursorAt } from "../kit/cursor";
import { FONT_CODE, FONT_DISPLAY } from "../kit/fonts";
import { TypedCode } from "../kit/Highlight";
import { Hero } from "../kit/hero";
import { Icon, type IconName } from "../kit/Icon";
import { E, blurRise, kf, lerp, pulse, ramp } from "../kit/motion";
import { useDebug } from "../kit/debug";
import { useT } from "../kit/time";
import { TopBar } from "../kit/topbar";
import { ConsoleWindow } from "../kit/window";
import { WhereChip } from "../kit/chips";
import { ev, typed, TL } from "../timeline";
import { Backdrop, CHAT, ComposerDock } from "./common";

/* The install command runs on a made-up machine; the agent dials out to the console. */
export const INSTALL_CMD = "curl -fsSL https://your-console/agent/install.sh | sudo sh -s -- --server wss://your-console/api/agent/connect --token ops_connect_...";

const TERM = { cx: 700, cy: 540, w: 1240 };
const CON = { cx: 2780, cy: 540, scale: 1.12 };
const LINE = { x0: TERM.cx + TERM.w / 2 + 12, y0: 600, x1: CON.cx - (1280 / 2) * CON.scale - 18, y1: 540 };
const MID = (LINE.x0 + LINE.x1) / 2;
// where the server chip sits in the console's window, in world coordinates
const CHIP_W = { x: CON.cx - 640 * CON.scale + 420 * CON.scale, y: CON.cy - 360 * CON.scale + 663 * CON.scale };

const bez = (t: number) => {
  const c1 = { x: LINE.x0 + (LINE.x1 - LINE.x0) * 0.42, y: LINE.y0 };
  const c2 = { x: LINE.x0 + (LINE.x1 - LINE.x0) * 0.62, y: LINE.y1 };
  const u = 1 - t;
  return {
    x: u * u * u * LINE.x0 + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * LINE.x1,
    y: u * u * u * LINE.y0 + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * LINE.y1,
  };
};
const pathD = () => {
  const c1x = LINE.x0 + (LINE.x1 - LINE.x0) * 0.42;
  const c2x = LINE.x0 + (LINE.x1 - LINE.x0) * 0.62;
  return `M ${LINE.x0} ${LINE.y0} C ${c1x} ${LINE.y0}, ${c2x} ${LINE.y1}, ${LINE.x1} ${LINE.y1}`;
};

function Strike({ icon, label, x, y, inAt, strikeAt }: { icon: IconName; label: string; x: number; y: number; inAt: number; strikeAt: number }) {
  const f = useT();
  const p = ramp(f, inAt, 20, E.enter);
  const s = ramp(f, strikeAt, 14, E.inOut);
  const fade = s * 0.5;
  return (
    <div style={{ position: "absolute", left: x - 190, top: y - 44, width: 380, height: 88, opacity: p * (1 - fade * 0.55), transform: `translateY(${(1 - p) * 18}px) scale(${0.96 + 0.04 * p})`, filter: p < 1 ? `blur(${(1 - p) * 6}px)` : undefined }}>
      <div
        style={{
          position: "relative",
          display: "flex",
          height: "100%",
          alignItems: "center",
          gap: 20,
          borderRadius: 999,
          padding: "0 34px 0 22px",
          background: "color-mix(in oklab, var(--surface) 70%, transparent)",
          outline: `1px solid color-mix(in oklab, var(--danger) ${Math.round(s * 55)}%, var(--hairline))`,
          outlineOffset: -1,
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        <span style={{ display: "flex", width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 999, background: "var(--soft)", color: "var(--accent)" }}>
          <Icon name={icon} size={24} />
        </span>
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 34, fontWeight: 600, letterSpacing: -0.6, color: "var(--ink)" }}>{label}</span>
        <span style={{ position: "absolute", left: 20, top: "50%", height: 4, width: `${s * 92}%`, borderRadius: 2, background: "var(--danger)", boxShadow: "0 0 18px color-mix(in oklab, var(--danger) 70%, transparent)", transform: "translateY(-2px) rotate(-3deg)", transformOrigin: "0 50%" }} />
      </div>
    </div>
  );
}

export function ConnectScene() {
  const f = useT();
  const debug = useDebug();
  const e = ev;
  const q = typed("install", f);
  const enter = e("conn_enter");
  const termIn = ramp(f, e("conn_term_in"), 26, E.enter);
  const dial = e("conn_dial");
  const draw = ramp(f, dial, 40, E.inOut);
  const arrive = e("conn_arrive");
  const landed = ramp(f, arrive, 16, E.enter);
  const caretOn = f % 30 < 18 || f - q.last < 10;

  const keys: PoseKey[] = [
    { f: TL.scenes.connect.from, pose: { x: TERM.cx + 40, y: 548, zoom: 1.0, rx: 3, ry: 8, rz: 0 } },
    { f: e("v_c1_end"), pose: { x: TERM.cx + 80, y: 560, zoom: 1.1, rx: 0, ry: 3, rz: 0 }, ease: E.move },
    { f: e("v_c2a") + 40, pose: { x: MID + 40, y: 556, zoom: 0.94, rx: 0, ry: 0, rz: 0 }, ease: E.inOut },
    { f: e("v_c2b_end") - 6, pose: { x: MID + 60, y: 556, zoom: 0.98, rx: 0, ry: 0, rz: 0 }, ease: E.linear },
    { f: e("chip_click") - 8, pose: { x: CHIP_W.x + 150, y: CHIP_W.y - 150, zoom: 1.5, rx: 0, ry: 0, rz: 0 }, ease: E.inOut },
    { f: TL.scenes.connect.from + TL.scenes.connect.duration, pose: { x: CHIP_W.x + 160, y: CHIP_W.y - 170, zoom: 1.62, rx: 0, ry: 0, rz: 0 }, ease: E.linear },
  ];
  const pose = debug.includes("nocam") ? { x: 1900, y: 540, zoom: 0.55, rx: 0, ry: 0, rz: 0 } : poseAt(f, keys);

  // the console (right): the server menu
  const menuOpen = ramp(f, e("menu_open"), 16, E.enter) * (1 - ramp(f, e("chip_select") + 4, 12, E.exit));
  const selectedEdge = f >= e("chip_select");
  const rows = [
    { id: "web-01", label: "web-01", detail: "Connected. Commands allowed." },
    { id: "db-01", label: "db-01", detail: "Connected. Read-only." },
    { id: "edge-eu", label: "edge-eu", detail: "Connected. Read-only.", glow: lerp(1, 0, ramp(f, e("menu_open") + 20, 40)) },
  ];
  // cursor lives in the console's window coordinates (logical px)
  const chipPt = { x: 240 + 20 + 110 + 10 + 40, y: 592 + 100 - 12 - 17 };
  const cur = cursorAt(f, [
    [e("chip_click") - 26, chipPt.x + 260, chipPt.y + 120],
    [e("chip_click") - 2, chipPt.x, chipPt.y],
    [e("chip_click") + 14, chipPt.x + 6, chipPt.y + 2],
    [e("chip_select") - 6, 240 + 140 + 80, 592 - 10 - 28 - 4],
    [e("chip_select") + 4, 240 + 140 + 80, 592 - 10 - 28 - 4],
    [e("chip_select") + 30, 760, 420],
  ]);
  const curVis = ramp(f, e("chip_click") - 26, 10) * (1 - ramp(f, e("chip_select") + 22, 10));
  const curPress = f < e("chip_select") - 2 ? e("chip_click") : e("chip_select");
  const lineGlow = pulse(f, 48);

  return (
    <AbsoluteFill>
      <Backdrop theme="dark" strength={0.9} />
      <Camera pose={pose}>
        {/* the machine */}
        <div style={{ position: "absolute", left: TERM.cx - TERM.w / 2, top: TERM.cy - 230, width: TERM.w, opacity: termIn, transform: `rotateY(6deg) translateY(${(1 - termIn) * 40}px)`, transformOrigin: "100% 50%" }}>
          <div
            style={{
              borderRadius: 26,
              background: "linear-gradient(145deg, rgba(26,33,29,0.94), rgba(14,19,16,0.94))",
              boxShadow: "0 50px 140px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.07), inset 0 1px 0 rgba(255,255,255,0.08)",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 30px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ transform: "scale(1.5)", transformOrigin: "0 50%", display: "flex" }}>
                <WhereChip server="edge-eu" />
              </span>
              <span style={{ marginLeft: 36, fontFamily: FONT_CODE, fontSize: 20, color: "#96a59b" }}>203.0.113.24</span>
              <span style={{ marginLeft: "auto", fontFamily: FONT_CODE, fontSize: 18, color: "#6f7f75" }}>ssh session</span>
            </div>
            <div style={{ padding: "34px 40px 46px", fontFamily: FONT_CODE, fontSize: 28, lineHeight: "46px", color: "#e9eee9", minHeight: 330, overflowWrap: "anywhere" }}>
              <div style={{ color: "#6f7f75", marginBottom: 6 }}>Last login: Fri Oct 23 22:14:09 2026 from 203.0.113.9</div>
              <span style={{ color: "#7fd6cf" }}>ops@edge-eu</span>
              <span style={{ color: "#96a59b" }}>:~$ </span>
              <TypedCode full={TL.typing.install.text} count={q.count} caretOn={f < enter && caretOn} caretW={15} />
              {f >= enter && (
                <div style={{ marginTop: 16 }}>
                  <span style={{ color: "#7fd6cf" }}>ops@edge-eu</span>
                  <span style={{ color: "#96a59b" }}>:~$ </span>
                  <span style={{ display: "inline-block", width: 15, height: 34, marginLeft: 2, transform: "translateY(6px)", background: f % 30 < 18 ? "#e9eee9" : "transparent" }} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* the line the agent dials out along */}
        <svg width="3700" height="1080" viewBox="0 0 3700 1080" style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} aria-hidden="true">
          <defs>
            <linearGradient id="dial" x1={LINE.x0} y1="0" x2={LINE.x1} y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#7fd6cf" stopOpacity="0.1" />
              <stop offset="0.5" stopColor="#91cdaa" stopOpacity="0.9" />
              <stop offset="1" stopColor="#b5efcb" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path d={pathD()} fill="none" stroke="rgba(145,205,170,0.14)" strokeWidth="3" strokeDasharray="3 12" opacity={draw > 0 ? 1 : 0} />
          <path d={pathD()} fill="none" stroke="url(#dial)" strokeWidth="5" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} opacity={0.55 + 0.45 * lineGlow} />
          {draw > 0.02 &&
            [0, 1, 2].map((k) => {
              const t = ((f - dial) / 52 + k / 3) % 1;
              const vis = draw >= t ? 1 : 0;
              const pt = bez(Math.min(t, draw));
              return <circle key={k} cx={pt.x} cy={pt.y} r={7 - 2 * t} fill="#d9fbe9" opacity={vis * Math.sin(Math.PI * t) * 0.95} style={{ filter: "drop-shadow(0 0 10px rgba(145,205,170,0.9))" }} />;
            })}
        </svg>
        <div style={{ position: "absolute", left: LINE.x0 + 90, top: LINE.y0 - 96, fontFamily: FONT_CODE, fontSize: 22, color: "#96a59b", ...blurRise(f, dial + 10, { dur: 20 }), opacity: ramp(f, dial + 10, 20) * 0.9 }}>
          wss://your-console/api/agent/connect
        </div>

        {/* no SSH keys, no open ports */}
        <div style={{ position: "absolute", left: 0, top: 0, ...{ ["--ink" as string]: "#e9eee9", ["--soft" as string]: "#23372b", ["--accent" as string]: "#91cdaa", ["--danger" as string]: "#f08a80", ["--surface" as string]: "#1a211d", ["--hairline" as string]: "#ffffff14" } }}>
          <Strike icon="key-round" label="SSH keys" x={MID} y={330} inAt={e("no_ssh_in")} strikeAt={e("no_ssh_strike")} />
          <Strike icon="triangle-alert" label="Open ports" x={MID} y={790} inAt={e("no_port_in")} strikeAt={e("no_port_strike")} />
        </div>

        {/* the console */}
        <ConsoleWindow theme="dark" cx={CON.cx} cy={CON.cy} scale={CON.scale} energy={landed * 0.5}>
          <TopBar opacity={0.9} />
          <div style={{ position: "absolute", left: 0, right: 0, top: CHAT.top, bottom: CHAT.bottom }}>
            <Hero start={TL.scenes.connect.from - 30} orbOnly />
          </div>
          <ComposerDock>
            <Composer
              server={selectedEdge ? "edge-eu" : "web-01"}
              serverOpen={menuOpen > 0.3}
              chipHover={menuOpen > 0.01 ? "server" : undefined}
              menu={<ServerMenu servers={rows} selected={selectedEdge ? "edge-eu" : "web-01"} open={menuOpen} appear={{ "edge-eu": e("menu_open") + 6 }} hoverIdx={f >= e("chip_select") - 8 ? 2 : undefined} />}
            />
          </ComposerDock>
          <Cursor x={cur.x} y={cur.y} visible={curVis} pressAt={curPress} />
        </ConsoleWindow>
        {/* arrival ring on the console edge */}
        {landed > 0 && landed < 1 && (
          <div style={{ position: "absolute", left: LINE.x1 - 40, top: LINE.y1 - 40, width: 80, height: 80, borderRadius: 999, border: "3px solid #91cdaa", opacity: 1 - landed, transform: `scale(${0.4 + 2.2 * landed})` }} />
        )}
      </Camera>
    </AbsoluteFill>
  );
}

void kf;

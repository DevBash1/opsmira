import { AbsoluteFill, random } from "remotion";
import { Camera, poseAt } from "../kit/Camera";
import { FONT_CODE, FONT_DISPLAY } from "../kit/fonts";
import { Highlighted } from "../kit/Highlight";
import { E, kf, lerp, ramp } from "../kit/motion";
import { useDebug } from "../kit/debug";
import { useT } from "../kit/time";
import { ev, typed, TL } from "../timeline";

/* The pain, in the first seconds: a flood of terminal text, and a command you only half remember.
 * Every host, address and number is made up (203.0.113.x is a documentation range). */

type Tone = "dim" | "red" | "amber" | "ink";
const HOSTS = ["web-01", "web-02", "db-01", "api-prod", "edge-eu"];
const PROCS = ["node", "nginx", "postgres", "java", "python3", "redis-server", "php-fpm8.2", "gunicorn"];
const UNITS = ["app", "worker", "nginx", "postgresql", "queue", "cron"];

function logLine(i: number): { text: string; tone: Tone } {
  const r = (k: string) => random(`hk-${i}-${k}`);
  const n = (k: string, lo: number, hi: number) => Math.floor(lo + r(k) * (hi - lo));
  const host = HOSTS[n("h", 0, HOSTS.length)];
  const proc = PROCS[n("p", 0, PROCS.length)];
  const unit = UNITS[n("u", 0, UNITS.length)];
  const ip = `203.0.113.${n("ip", 2, 250)}`;
  const ts = `Mar ${String(n("d", 3, 4)).padStart(2, "0")} 02:${String(n("m", 38, 59)).padStart(2, "0")}:${String(n("s", 0, 59)).padStart(2, "0")}`;
  const pid = n("pid", 1000, 32000);
  const pick = n("t", 0, 14);
  switch (pick) {
    case 0:
      return { tone: "red", text: `${ts} ${host} kernel: Out of memory: Killed process ${pid} (${proc}) total-vm:${n("a", 400000, 9000000)}kB, anon-rss:${n("b", 100000, 4000000)}kB` };
    case 1:
      return { tone: "red", text: `nginx: [emerg] ${pid}#${pid}: open() "/var/log/nginx/access.log" failed (28: No space left on device)` };
    case 2:
      return { tone: "amber", text: `${ts} ${host} systemd[1]: ${unit}.service: Main process exited, code=killed, status=9/KILL` };
    case 3:
      return { tone: "dim", text: `${ts} ${host} sshd[${pid}]: Failed password for invalid user admin from ${ip} port ${n("pt", 20000, 60000)} ssh2` };
    case 4:
      return { tone: "dim", text: `${String(pid).padStart(7)} root      20   0 ${String(n("v", 100000, 9000000)).padStart(8)} ${String(n("w", 10000, 900000)).padStart(7)} ${String(n("x", 1000, 9000)).padStart(6)} S  ${(r("c") * 90).toFixed(1).padStart(5)} ${(r("e") * 40).toFixed(1).padStart(5)}  ${n("tm", 0, 99)}:${String(n("ts", 0, 59)).padStart(2, "0")}.${String(n("tf", 0, 99)).padStart(2, "0")} ${proc}` };
    case 5:
      return { tone: "amber", text: `[warn] ${pid}#${pid}: *${n("q", 1000, 99999)} upstream timed out (110: Connection timed out) while reading response header, client: ${ip}, server: example.test` };
    case 6:
      return { tone: "red", text: `/dev/vda1        80G   79G  1.2G  99% /` };
    case 7:
      return { tone: "red", text: `ERROR  ${host} postgres[${pid}]: could not write to file "pg_wal/xlogtemp.${pid}": No space left on device` };
    case 8:
      return { tone: "dim", text: `    at Socket.<anonymous> (/srv/app/node_modules/pg-pool/index.js:${n("l", 20, 400)}:${n("c", 3, 60)})` };
    case 9:
      return { tone: "dim", text: `${ts} ${host} CRON[${pid}]: (root) CMD (/usr/local/bin/rotate-logs.sh)` };
    case 10:
      return { tone: "amber", text: `WARN  ${host}: load average: ${(r("la") * 30 + 8).toFixed(2)}, ${(r("lb") * 24 + 6).toFixed(2)}, ${(r("lc") * 18 + 4).toFixed(2)}` };
    case 11:
      return { tone: "dim", text: `${ts} ${host} kernel: [${n("k1", 100000, 999999)}.${String(n("k2", 0, 999999)).padStart(6, "0")}] EXT4-fs warning (device vda1): ext4_dx_add_entry: Directory index full!` };
    case 12:
      return { tone: "red", text: `Error: connect ECONNREFUSED 127.0.0.1:5432 at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1595:16)` };
    default:
      return { tone: "dim", text: `${ts} ${host} ${proc}[${pid}]: connection reset by peer (client ${ip}:${n("pt", 20000, 60000)})` };
  }
}

const TONE: Record<Tone, string> = { dim: "#7b8d83", red: "#f59a90", amber: "#eebd7e", ink: "#c9d4cd" };
const LINE_H = 29;

function Wall({ scroll, dim, fontSize, opacity, cols = 1 }: { scroll: number; dim: number; fontSize: number; opacity: number; cols?: number }) {
  const first = Math.floor(scroll / LINE_H) - 1;
  const count = Math.ceil(1080 / LINE_H) + 3;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "hidden", opacity }}>
      {Array.from({ length: count }, (_, k) => {
        const i = first + k;
        if (i < 0) return null;
        const l = logLine(i);
        const y = i * LINE_H - scroll;
        const bright = l.tone === "red" ? 1 : l.tone === "amber" ? 0.9 : 0.75;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 60,
              top: y,
              width: 1860 / cols,
              height: LINE_H,
              whiteSpace: "pre",
              overflow: "hidden",
              fontFamily: FONT_CODE,
              fontSize,
              lineHeight: `${LINE_H}px`,
              color: TONE[l.tone],
              opacity: bright * (1 - 0.55 * dim),
            }}
          >
            {l.text}
          </div>
        );
      })}
    </div>
  );
}

function ErrorCard({ f, at, out }: { f: number; at: number; out: number }) {
  const p = ramp(f, at, 9, E.enter);
  const o = ramp(f, out, 18, E.exit);
  if (p <= 0 || o >= 1) return null;
  const jitter = (1 - ramp(f, at, 24)) * Math.sin(f * 2.6) * 4;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, display: "flex", alignItems: "center", justifyContent: "center", transform: "translateZ(40px)" }}>
      <div
        style={{
          position: "relative",
          opacity: p * (1 - o),
          transform: `translate(${jitter}px, ${-o * 18}px) scale(${1.1 - 0.1 * p + o * 0.06})`,
          filter: p < 1 || o > 0 ? `blur(${(1 - p) * 10 + o * 14}px)` : undefined,
          textAlign: "center",
        }}
      >
        <div style={{ position: "absolute", left: -260, right: -260, top: -120, bottom: -120, background: "radial-gradient(ellipse at 50% 50%, rgba(8,12,10,0.92) 20%, rgba(8,12,10,0.0) 70%)" }} />
        <div style={{ position: "relative", fontFamily: FONT_CODE, fontSize: 26, letterSpacing: 6, color: "#f08a80", opacity: 0.9, textTransform: "uppercase" }}>nginx · web-01</div>
        <div
          style={{
            position: "relative",
            marginTop: 14,
            fontFamily: FONT_DISPLAY,
            fontSize: 124,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "#ffb0a7",
            textShadow: "0 0 70px rgba(240,138,128,0.55), 0 4px 30px rgba(0,0,0,0.6)",
          }}
        >
          No space left on device
        </div>
      </div>
    </div>
  );
}

export function HookScene() {
  const f = useT();
  const debug = useDebug();
  const cardIn = ev("hook_card_in");
  const stall = ev("hook_stall");
  const q = typed("hook_cmd", f);
  const end = TL.scenes.hook.from + TL.scenes.hook.duration;

  // The flood scrolls fast, then slows as the sentence turns to "half remember".
  let scroll = 0;
  for (let k = 0; k < f; k++) scroll += lerp(17, 2.2, ramp(k, stall - 24, 46, E.inOut));
  const calm = ramp(f, stall, 40, E.inOut);
  const base = debug.includes("nocam")
    ? { x: 960, y: 540, zoom: 1, rx: 0, ry: 0, rz: 0 }
    : poseAt(f, [
        { f: 0, pose: { x: 960, y: 540, zoom: 1.0, rx: 9, ry: -7, rz: 0 } },
        { f: stall, pose: { x: 960, y: 548, zoom: 1.07, rx: 3, ry: -1.5, rz: 0 }, ease: E.move },
        { f: end, pose: { x: 960, y: 548, zoom: 1.12, rx: 0, ry: 0, rz: 0 }, ease: E.linear },
      ]);
  // a nervous hand-held shake while it is bad, gone by the time it goes quiet
  const shake = (1 - calm) * (1 - calm);
  const pose = debug.includes("nocam")
    ? base
    : { ...base, x: base.x + Math.sin(f * 1.9) * 3.2 * shake, y: base.y + Math.cos(f * 2.3) * 2.4 * shake, rz: base.rz + Math.sin(f * 0.83) * 0.28 * shake };
  const errIn = ev("hook_err_in");
  const errOut = ev("hook_err_out");
  const alarm = (1 - calm) * (0.55 + 0.45 * Math.sin(f / 3.2));
  const cardP = ramp(f, cardIn, 22, E.enter);
  const caretOn = q.done ? f % 30 < 17 : f - q.last < 12 || f % 30 < 18;
  const cardY = kf(f, [[cardIn, 40], [cardIn + 22, 0, E.enter]]);

  return (
    <AbsoluteFill style={{ background: "#080c0a" }}>
      <Camera pose={pose} perspective={2200}>
        {/* far wall: big, dim, slow */}
        <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transform: "translateZ(-640px) scale(1.5)", transformOrigin: "50% 50%", filter: "blur(3px)" }}>
          <Wall scroll={scroll * 0.55 + 400} dim={0.35 + 0.4 * calm} fontSize={21} opacity={0.5} />
        </div>
        {/* near wall */}
        <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transform: "translateZ(-260px) scale(1.12)", transformOrigin: "50% 50%", filter: calm > 0.01 ? `blur(${calm * 2.5}px)` : undefined }}>
          <Wall scroll={scroll} dim={calm * 0.6} fontSize={21} opacity={1 - 0.25 * calm} />
        </div>
        {/* the error that is the whole problem */}
        <ErrorCard f={f} at={errIn} out={errOut} />
        {/* the command line */}
        <div
          style={{
            position: "absolute",
            left: 330,
            top: 420,
            width: 1260,
            opacity: cardP,
            transform: `translateY(${cardY}px)`,
            filter: cardP < 1 ? `blur(${(1 - cardP) * 8}px)` : undefined,
          }}
        >
          <div
            style={{
              borderRadius: 22,
              background: "rgba(8,12,10,0.88)",
              padding: "34px 40px 36px",
              boxShadow: "0 40px 120px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.06)",
              outline: "1px solid rgba(255,255,255,0.09)",
              outlineOffset: -1,
            }}
          >
            <div style={{ fontFamily: FONT_CODE, fontSize: 31, lineHeight: "46px", color: "#e9eee9", wordBreak: "break-all", minHeight: 92 }}>
              <span style={{ color: "#7fd6cf" }}>deploy@web-01</span>
              <span style={{ color: "#96a59b" }}>:</span>
              <span style={{ color: "#8db8f5" }}>/var</span>
              <span style={{ color: "#96a59b" }}>$ </span>
              <Highlighted text={q.text} />
              <span style={{ display: "inline-block", width: 15, height: 34, marginLeft: 2, transform: "translateY(7px)", background: caretOn ? "#e9eee9" : "transparent" }} />
            </div>
          </div>
        </div>
      </Camera>
      {/* alarm: the edges glow red while it is bad, then go quiet */}
      <AbsoluteFill style={{ pointerEvents: "none", background: `radial-gradient(90% 90% at 50% 50%, rgba(240,138,128,0) 55%, rgba(240,138,128,${0.28 * alarm}) 100%)` }} />
    </AbsoluteFill>
  );
}

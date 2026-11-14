import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { Aurora } from "../kit/Aurora";
import { Camera, poseAt, type PoseKey } from "../kit/Camera";
import { useDebug } from "../kit/debug";
import { FONT_BODY, FONT_CODE, FONT_DISPLAY } from "../kit/fonts";
import { TypedCode } from "../kit/Highlight";
import { Icon, type IconName } from "../kit/Icon";
import { E, blurRise, ramp } from "../kit/motion";
import { useT } from "../kit/time";
import { themeVars } from "../kit/tokens";
import { GradientText } from "../kit/type";
import { AskingPill, DetachedPill, RestartingPill, UpdatedPill } from "../kit/livepill";
import { ev, typed, TL } from "../timeline";

/* "Open source. Self-host it. Bring any model. Your servers, your keys." One headline on the left, one card on
 * the right, handing over from beat to beat. Model names below are made up.
 * After the last spoken line two cards carry the newer work with no voice-over: other AI agents asking through
 * MCP (the console follows them live), and Opsmira upgrading itself with the run detached. */

const CARD_W = 800;
const CARD_X = 960;
const HEAD_X = 150;

function Headline({ lines, at, out }: { lines: [string, string]; at: number; out: number }) {
  const f = useT();
  const p1 = ramp(f, at, 26, E.enter);
  const p2 = ramp(f, at + 6, 26, E.enter);
  const o = ramp(f, out, 14, E.exit);
  const base: CSSProperties = { fontFamily: FONT_DISPLAY, fontSize: 118, lineHeight: 1.04, fontWeight: 700, letterSpacing: "-0.035em", whiteSpace: "nowrap" };
  if (p1 <= 0) return null;
  return (
    <div style={{ opacity: 1 - o, transform: `translateY(${-o * 26}px)`, filter: o > 0.01 ? `blur(${o * 10}px)` : undefined }}>
      <div style={{ overflow: "hidden", paddingBottom: "0.1em", marginBottom: "-0.1em" }}>
        <div style={{ ...base, color: "var(--ink)", transform: `translateY(${(1 - p1) * 112}%)` }}>{lines[0]}</div>
      </div>
      <div style={{ overflow: "hidden", paddingBottom: "0.12em", marginBottom: "-0.12em" }}>
        <div style={{ ...base, transform: `translateY(${(1 - p2) * 112}%)` }}>
          <GradientText>{lines[1]}</GradientText>
        </div>
      </div>
    </div>
  );
}

/** A glass card centred vertically on the right; it arrives from depth and leaves the other way. */
function Card({ inAt, outAt, children, w = CARD_W }: { inAt: number; outAt?: number; children: ReactNode; w?: number }) {
  const f = useT();
  const p = ramp(f, inAt, 30, E.enter);
  const o = outAt === undefined ? 0 : ramp(f, outAt, 16, E.exit);
  if (p <= 0 || o >= 1) return null;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: 1080, display: "flex", alignItems: "center" }}>
      <div
        style={{
          width: w,
          opacity: p * (1 - o),
          transform: `translate3d(${(1 - p) * 90 + o * -60}px, 0, ${-(1 - p) * 240 - o * 200}px) rotateY(${-7 + (1 - p) * -10}deg) scale(1.04)`,
          transformOrigin: "left center",
          filter: p < 1 || o > 0 ? `blur(${(1 - p) * 10 + o * 8}px)` : undefined,
        }}
      >
        <div
          style={{
            borderRadius: 28,
            background: "linear-gradient(145deg, color-mix(in oklab, var(--surface) 92%, transparent), color-mix(in oklab, var(--surface) 72%, transparent))",
            boxShadow: "0 60px 140px rgba(0,0,0,0.55), 0 30px 80px -30px color-mix(in oklab, var(--accent) 40%, transparent), inset 0 1px 0 rgba(255,255,255,0.09)",
            outline: "1px solid var(--hairline)",
            outlineOffset: -1,
            overflow: "hidden",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

const BigTag = ({ children, tone = "soft" }: { children: ReactNode; tone?: "soft" | "accent" }) => (
  <span
    style={{
      display: "inline-block",
      fontFamily: FONT_CODE,
      fontSize: 19,
      letterSpacing: 0.3,
      borderRadius: 999,
      padding: "7px 18px",
      background: tone === "accent" ? "color-mix(in oklab, var(--accent) 22%, transparent)" : "var(--soft)",
      color: tone === "accent" ? "var(--accent-strong)" : "var(--ink)",
    }}
  >
    {children}
  </span>
);

const CardHead = ({ icon, title, tag }: { icon: IconName; title: string; tag?: string }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "22px 34px", borderBottom: "1px solid var(--hairline)" }}>
    <Icon name={icon} size={22} style={{ color: "var(--accent)" }} />
    <span style={{ fontFamily: FONT_CODE, fontSize: 22, color: "var(--ink)" }}>{title}</span>
    {tag && (
      <span style={{ marginLeft: "auto" }}>
        <BigTag tone="accent">{tag}</BigTag>
      </span>
    )}
  </div>
);

const AGPL = [
  "GNU AFFERO GENERAL PUBLIC LICENSE",
  "Version 3, 19 November 2007",
  "",
  "Copyright (C) 2007 Free Software Foundation, Inc.",
  "<https://fsf.org/>",
  "Everyone is permitted to copy and distribute verbatim",
  "copies of this license document, but changing it is",
  "not allowed.",
];

function LicenseCard({ at, out }: { at: number; out: number }) {
  const f = useT();
  return (
    <Card inAt={at} outAt={out}>
      <CardHead icon="file-text" title="LICENSE" tag="AGPL-3.0" />
      <div style={{ padding: "26px 34px 32px", fontFamily: FONT_CODE, fontSize: 22, lineHeight: "34px", color: "var(--muted)" }}>
        {AGPL.map((line, i) => (
          <div key={i} style={{ minHeight: 34, color: i < 2 ? "var(--ink)" : "var(--muted)", ...blurRise(f, at + 10 + i * 3, { dur: 14, rise: 8, blur: 4 }) }}>
            {line}
          </div>
        ))}
        <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 12, color: "var(--accent-strong)", fontSize: 24, ...blurRise(f, at + 40, { dur: 18 }) }}>
          <Icon name="box" size={22} />
          github.com/DevBash1/opsmira
        </div>
      </div>
    </Card>
  );
}

function HostCard({ at, out }: { at: number; out: number }) {
  const f = useT();
  const t = typed("host", f);
  const caretOn = f % 30 < 18 || f - t.last < 10;
  return (
    <Card inAt={at} outAt={out}>
      <CardHead icon="terminal" title="your machine" />
      <div style={{ padding: "34px 34px 30px", fontFamily: FONT_CODE, fontSize: 24, lineHeight: "42px", color: "var(--ink)", minHeight: 170 }}>
        <span style={{ color: "var(--accent-2)" }}>$ </span>
        <TypedCode full={TL.typing.host.text} count={t.count} caretOn={caretOn} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "0 34px 34px" }}>
        {["Docker or systemd", "127.0.0.1 only", "amd64 · arm64"].map((label, i) => (
          <span key={label} style={blurRise(f, ev("host_tags") + i * 5, { dur: 16 })}>
            <BigTag>{label}</BigTag>
          </span>
        ))}
      </div>
    </Card>
  );
}

const MODELS = [
  { id: "northwind/lyra-large", ctx: "128k context", free: false, vision: true },
  { id: "acme/atlas-mini", ctx: "32k context", free: true, vision: false },
  { id: "contoso/flux-vision", ctx: "200k context", free: false, vision: true },
  { id: "acme/atlas-code", ctx: "64k context", free: true, vision: false },
  { id: "northwind/lyra-fast", ctx: "128k context", free: false, vision: false },
];

function ModelCard({ at, out }: { at: number; out: number }) {
  const f = useT();
  const active = Math.min(MODELS.length - 1, Math.floor(ramp(f, ev("model_scan"), 40, E.inOut) * (MODELS.length - 0.01)));
  return (
    <Card inAt={at} outAt={out}>
      <div style={{ padding: "26px 28px 20px", borderBottom: "1px solid var(--hairline)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, height: 58, borderRadius: 16, background: "var(--canvas)", padding: "0 20px", outline: "1px solid var(--accent)", outlineOffset: -1 }}>
          <Icon name="eye" size={22} style={{ color: "var(--muted)", opacity: 0 }} />
          <span style={{ fontFamily: FONT_BODY, fontSize: 24, color: "var(--muted)" }}>Search {MODELS.length} models</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
          {["Free", "Vision"].map((l) => (
            <span key={l} style={{ borderRadius: 999, background: "var(--soft)", padding: "7px 18px", fontFamily: FONT_BODY, fontSize: 19, color: "var(--muted)" }}>
              {l}
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 12 }}>
        {MODELS.map((m, i) => {
          const p = ramp(f, at + 8 + i * 4, 18, E.enter);
          const sel = i === active;
          return (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 14, borderRadius: 16, padding: "14px 18px", background: sel ? "var(--soft)" : "transparent", opacity: p, transform: `translateY(${(1 - p) * 10}px)` }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
                <span style={{ fontFamily: FONT_CODE, fontSize: 24, fontWeight: 500, color: "var(--ink)" }}>{m.id.split("/")[1]}</span>
                <span style={{ fontFamily: FONT_BODY, fontSize: 18, color: "var(--muted)" }}>
                  {m.id.split("/")[0]} · {m.ctx}
                </span>
              </div>
              {m.vision && <Icon name="eye" size={22} style={{ color: "var(--accent-strong)" }} />}
              {m.free && <span style={{ fontFamily: FONT_CODE, fontSize: 16, letterSpacing: 1, color: "var(--accent-strong)" }}>FREE</span>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Other AI agents (MCP): Claude asks in another conversation, the console follows the turn live. */
function AgentsCard({ at, out }: { at: number; out: number }) {
  const f = useT();
  return (
    <Card inAt={at} outAt={out}>
      <CardHead icon="box" title="AI agents" tag="MCP" />
      <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "24px 28px 28px" }}>
        <div style={{ display: "flex", minWidth: 0, ...blurRise(f, at + 8, { dur: 16, rise: 8 }) }}>
          <AskingPill client="Claude" ask="what does uname say here?" s={1.8} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, borderRadius: 18, background: "var(--canvas)", padding: "20px 22px", outline: "1px solid var(--hairline)", outlineOffset: -1, ...blurRise(f, at + 20, { dur: 18, rise: 8 }) }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: FONT_CODE, fontSize: 17, fontWeight: 500, color: "var(--accent-strong)" }}>Claude</span>
            <span style={{ fontSize: 16, color: "var(--muted)" }}>connected · asking Opsmira</span>
          </div>
          <div style={{ fontSize: 24, lineHeight: "32px", color: "var(--ink)" }}>what does uname say here?</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, width: "fit-content", borderRadius: 999, background: "var(--soft)", padding: "7px 16px 7px 12px", ...blurRise(f, at + 34, { dur: 16, rise: 6 }) }}>
            <Icon name="terminal" size={16} style={{ color: "var(--muted)" }} />
            <span style={{ fontFamily: FONT_CODE, fontSize: 19, color: "var(--ink)" }}>uname -s</span>
          </div>
          <div style={{ fontSize: 22, lineHeight: "30px", color: "var(--ink)", ...blurRise(f, at + 46, { dur: 18, rise: 6 }) }}>It runs Linux.</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {["Claude Code", "Claude Desktop", "Cursor"].map((name, i) => (
            <span key={name} style={blurRise(f, at + 54 + i * 5, { dur: 16 })}>
              <BigTag>{name}</BigTag>
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** Opsmira upgrading itself: the run detaches, the console restarts under it, the new build is one tap away. */
function UpgradeCard({ at }: { at: number }) {
  const f = useT();
  return (
    <Card inAt={at}>
      <CardHead icon="refresh-cw" title="Opsmira" tag="update" />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14, padding: "24px 28px 26px" }}>
        <div style={blurRise(f, at + 8, { dur: 16, rise: 8 })}>
          <DetachedPill server="edge-eu" step="$ docker compose pull && up -d" s={1.65} />
        </div>
        <div style={blurRise(f, at + 26, { dur: 16, rise: 8 })}>
          <RestartingPill s={1.65} />
        </div>
        <div style={blurRise(f, at + 46, { dur: 16, rise: 8 })}>
          <UpdatedPill s={1.65} />
        </div>
        <div style={{ width: "100%", borderRadius: 18, background: "var(--canvas)", padding: "16px 20px", fontSize: 21, lineHeight: "29px", color: "var(--ink)", outline: "1px solid var(--hairline)", outlineOffset: -1, ...blurRise(f, at + 60, { dur: 18, rise: 6 }) }}>
          Back on the new build. Every step is in Activity, and the report is in the chat.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, ...blurRise(f, at + 70, { dur: 16 }) }}>
          {["runs on the server", "approved first", "every step logged"].map((label) => (
            <BigTag key={label}>{label}</BigTag>
          ))}
        </div>
      </div>
    </Card>
  );
}

function KeysCard({ at, out }: { at: number; out: number }) {
  const f = useT();
  const dots = Math.floor(ramp(f, ev("keys_type"), 36, E.linear) * 24);
  const servers = [
    { n: "web-01", d: "Connected. Commands allowed." },
    { n: "db-01", d: "Connected. Read-only." },
    { n: "edge-eu", d: "Connected. Read-only." },
  ];
  return (
    <Card inAt={at} outAt={out}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14 }}>
        {servers.map((s, i) => (
          <div key={s.n} style={{ display: "flex", alignItems: "center", gap: 18, borderRadius: 18, padding: "16px 20px", background: i === 0 ? "color-mix(in oklab, var(--soft) 70%, transparent)" : "transparent", ...blurRise(f, at + 8 + i * 6, { dur: 18 }) }}>
            <span style={{ display: "flex", width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 999, background: "var(--soft)", color: "var(--accent)" }}>
              <Icon name="server" size={22} />
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
              <span style={{ fontFamily: FONT_CODE, fontSize: 26, fontWeight: 500, color: "var(--ink)" }}>{s.n}</span>
              <span style={{ fontFamily: FONT_BODY, fontSize: 19, color: "var(--muted)" }}>{s.d}</span>
            </span>
          </div>
        ))}
      </div>
      <div style={{ margin: "6px 14px 18px", display: "flex", alignItems: "center", gap: 16, borderRadius: 18, background: "var(--canvas)", padding: "20px 24px", outline: "1px solid var(--accent)", outlineOffset: -1, ...blurRise(f, at + 30, { dur: 18 }) }}>
        <Icon name="key-round" size={26} style={{ color: "var(--accent)" }} />
        <span style={{ fontFamily: FONT_CODE, fontSize: 26, letterSpacing: 4, color: "var(--ink)" }}>{"•".repeat(dots)}</span>
        {f % 30 < 18 && <span style={{ width: 3, height: 30, background: "var(--ink)", marginLeft: -10 }} />}
      </div>
    </Card>
  );
}

export function OwnScene() {
  const f = useT();
  const debug = useDebug();
  const e = ev;
  const end = TL.scenes.own.from + TL.scenes.own.duration;
  const keys: PoseKey[] = [
    { f: TL.scenes.own.from, pose: { x: 960, y: 540, zoom: 1.0, rx: 1.5, ry: 4, rz: 0 } },
    { f: end, pose: { x: 975, y: 540, zoom: 1.06, rx: 0, ry: -2, rz: 0 }, ease: E.linear },
  ];
  const pose = debug.includes("nocam") ? { x: 960, y: 540, zoom: 1, rx: 0, ry: 0, rz: 0 } : poseAt(f, keys);
  const drift = (k: number) => Math.sin(f / 70 + k) * 8;
  return (
    <AbsoluteFill style={{ ...themeVars("dark"), background: "#0b100e", color: "var(--ink)", fontFamily: FONT_BODY }}>
      <Aurora width={1920} height={1080} strength={1.1} speed={3} offset={90} />
      <div style={{ position: "absolute", left: 760, top: 140, width: 1100, height: 800, background: "radial-gradient(ellipse at 50% 50%, rgba(74,174,124,0.16), rgba(74,174,124,0) 62%)" }} />
      <Camera pose={pose}>
        <div style={{ position: "absolute", left: HEAD_X, top: 0, width: 800, height: 1080, display: "flex", alignItems: "center" }}>
          <div style={{ position: "relative", width: 800, height: 260 }}>
            <Headline lines={["Open", "source."]} at={e("own_a_head")} out={e("own_b_head") - 8} />
            <div style={{ position: "absolute", left: 0, top: 0 }}>
              <Headline lines={["Self-host", "it."]} at={e("own_b_head")} out={e("own_c_head") - 8} />
            </div>
            <div style={{ position: "absolute", left: 0, top: 0 }}>
              <Headline lines={["Any", "model."]} at={e("own_c_head")} out={e("own_d_head") - 8} />
            </div>
            <div style={{ position: "absolute", left: 0, top: 0 }}>
              <Headline lines={["Your servers.", "Your keys."]} at={e("own_d_head")} out={e("own_e_head") - 8} />
            </div>
            <div style={{ position: "absolute", left: 0, top: 0 }}>
              <Headline lines={["Your other", "agents."]} at={e("own_e_head")} out={e("own_f_head") - 8} />
            </div>
            <div style={{ position: "absolute", left: 0, top: 0 }}>
              <Headline lines={["Upgrade", "itself."]} at={e("own_f_head")} out={end + 100} />
            </div>
          </div>
        </div>
        <div style={{ position: "absolute", left: CARD_X, top: 0, width: CARD_W, height: 1080, transform: `translateY(${drift(0)}px)` }}>
          <LicenseCard at={e("own_a_card")} out={e("own_b_card") - 6} />
          <HostCard at={e("own_b_card")} out={e("own_c_card") - 6} />
          <ModelCard at={e("own_c_card")} out={e("own_d_card") - 6} />
          <KeysCard at={e("own_d_card")} out={e("own_e_card") - 6} />
          <AgentsCard at={e("own_e_card")} out={e("own_f_card") - 6} />
          <UpgradeCard at={e("own_f_card")} />
        </div>
      </Camera>
    </AbsoluteFill>
  );
}

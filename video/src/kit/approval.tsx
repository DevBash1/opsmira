import type { CSSProperties, ReactNode } from "react";
import { FONT_CODE, FONT_DISPLAY } from "./fonts";
import { EdgeLight, Glass } from "./glass";
import { Icon } from "./Icon";
import { E, blurRise, lerp, pulse, ramp } from "./motion";
import { WhereChip } from "./chips";
import { Spinner } from "./chips";
import { Highlighted } from "./Highlight";
import { useT } from "./time";

const RISK_STEPS = { Low: 1, Medium: 2, High: 3 } as const;

export type ApprovalTimes = {
  /** Card starts to appear. */
  card: number;
  /** Title, explanation, command row, risk row, buttons: the beats the voice-over walks through. */
  title: number;
  context: number;
  command: number;
  risk: number;
  buttons: number;
};

/**
 * The approval card (src/components/ConsoleApprovalCard.tsx): what it does, how risky, the exact command,
 * Deny / Approve. `collapse` 0..1 folds it into the resolved pill ("Approved - Done - exit 0").
 * `hover` and `press` are the Approve button's states; `pressAt` is the frame of the click (pulse ring).
 */
export function ApprovalCard({
  title,
  context,
  command,
  server,
  riskLevel = "Low",
  riskDetail,
  times,
  collapse = 0,
  hover = 0,
  press = 0,
  pressAt,
  busy = false,
  result = "Done · exit 0 · 1.2s",
  style,
}: {
  title: string;
  context: string;
  command: string;
  server: string;
  riskLevel?: keyof typeof RISK_STEPS;
  riskDetail: string;
  times: ApprovalTimes;
  collapse?: number;
  hover?: number;
  press?: number;
  pressAt?: number;
  busy?: boolean;
  result?: string;
  style?: CSSProperties;
}) {
  const f = useT();
  const c = collapse;
  const cardIn = ramp(f, times.card, 22, E.enter);
  const steps = RISK_STEPS[riskLevel];
  const riskP = ramp(f, times.risk + 6, 18, E.enter);
  const ringP = pressAt === undefined ? 1 : ramp(f, pressAt, 24, E.enter);
  const pending = c < 0.5;
  const dotPulse = 0.35 + 0.65 * pulse(f, 66);
  return (
    <div style={{ opacity: cardIn, transform: `translateY(${(1 - cardIn) * 16}px) scale(${0.97 + 0.03 * cardIn})`, filter: cardIn < 1 ? `blur(${(1 - cardIn) * 5}px)` : undefined, ...style }}>
      <Glass
        radius={lerp(20, 22, c)}
        style={{
          display: "flex",
          width: lerp(380, 300, c),
          maxWidth: "100%",
          flexDirection: "column",
          alignItems: "flex-start",
          padding: `${lerp(20, 7, c)}px ${lerp(20, 14, c)}px ${lerp(20, 7, c)}px ${lerp(20, 8, c)}px`,
          outline: `1px solid color-mix(in oklab, var(--accent) ${Math.round(lerp(45, 0, c))}%, var(--hairline))`,
          outlineOffset: -0.5,
          opacity: 1,
        }}
      >
        {c < 0.98 && (
          <div style={{ opacity: 1 - c }}>
            <EdgeLight radius={20} period={240} opacity={0.6} />
          </div>
        )}
        {pressAt !== undefined && ringP < 1 && (
          <span style={{ position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none", boxShadow: `0 0 0 ${16 * ringP}px color-mix(in oklab, var(--accent) ${Math.round(45 * (1 - ringP))}%, transparent)` }} />
        )}
        <div style={{ display: "flex", width: "100%", minWidth: 0, flexShrink: 0, flexDirection: "row", alignItems: "center" }}>
          <div style={{ display: "flex", width: "fit-content", flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, background: "var(--soft)", padding: "4px 10px 4px 8px" }}>
            {pending ? (
              <div style={{ width: 6, height: 6, flexShrink: 0, borderRadius: 999, background: "var(--accent)", boxShadow: "0px 0px 6px var(--glow)", opacity: dotPulse }} />
            ) : (
              <Icon name="check" size={12} style={{ color: "var(--accent-strong)" }} />
            )}
            <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", color: "var(--accent-strong)" }}>{pending ? "Awaiting approval" : "Approved"}</div>
          </div>
          <div style={{ display: "grid", minWidth: 0, gridTemplateColumns: `${c}fr`, marginLeft: 10 * c, opacity: c }}>
            <div style={{ display: "flex", minWidth: 0, flexDirection: "column", overflow: "hidden" }}>
              <span style={{ fontSize: 12, lineHeight: "15px", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--ink)" }}>{title}</span>
              <span style={{ fontFamily: FONT_CODE, fontSize: 10.5, lineHeight: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--muted)" }}>{result}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "grid", width: "100%", gridTemplateRows: `${1 - c}fr` }}>
          <div style={{ minHeight: 0, overflow: c > 0 ? "hidden" : "visible" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <Sec at={times.title} pt={16}>
                <div style={{ fontFamily: FONT_DISPLAY, width: "100%", fontSize: 17, fontWeight: 600, letterSpacing: -0.3, color: "var(--ink)" }}>{title}</div>
              </Sec>
              <Sec at={times.context} pt={6}>
                <div style={{ width: "100%", fontSize: 13, lineHeight: "20px", color: "var(--muted)" }}>{context}</div>
              </Sec>
              <Sec at={times.command} pt={16}>
                <div
                  style={{
                    display: "flex",
                    width: "100%",
                    flexShrink: 0,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    borderRadius: 12,
                    background: "color-mix(in oklab, var(--canvas) 62%, transparent)",
                    padding: "10px 12px",
                    outline: "1px solid var(--hairline)",
                    outlineOffset: -0.5,
                  }}
                >
                  <WhereChip server={server} />
                  <div style={{ fontFamily: FONT_CODE, fontSize: 12, whiteSpace: "nowrap", color: "var(--muted)" }}>$</div>
                  <div style={{ fontFamily: FONT_CODE, minWidth: 0, flex: 1, fontSize: 12, whiteSpace: "nowrap", color: "var(--ink)" }}>
                    <Highlighted text={command} />
                  </div>
                </div>
              </Sec>
              <Sec at={times.risk} pt={16}>
                <div style={{ display: "flex", width: "100%", flexShrink: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10, rowGap: 4 }}>
                  <div style={{ fontFamily: FONT_CODE, fontSize: 10, letterSpacing: 1, whiteSpace: "nowrap", color: "var(--muted)" }}>RISK</div>
                  <div style={{ display: "flex", width: "fit-content", flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 3 }}>
                    {[1, 2, 3].map((n) => {
                      const fill = n <= steps ? ramp(riskP, (n - 1) / steps, 1 / steps, E.enter) : 0;
                      return <div key={n} style={{ width: 10, height: 4, flexShrink: 0, borderRadius: 2, background: fill > 0.5 ? "var(--ink)" : "var(--line)", opacity: fill > 0 && fill < 1 ? 0.5 + fill * 0.5 : 1 }} />;
                    })}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", color: "var(--ink)", opacity: riskP }}>{riskLevel}</div>
                  <div style={{ width: "100%", minWidth: 0, fontSize: 12, lineHeight: "18px", color: "var(--muted)", opacity: riskP }}>{riskDetail}</div>
                </div>
              </Sec>
              <Sec at={times.buttons} pt={16}>
                <div style={{ width: "100%", height: 1, flexShrink: 0, background: "var(--hairline)" }} />
                <div style={{ display: "flex", minHeight: 38, width: "100%", flexShrink: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, paddingTop: 16 }}>
                  <div
                    style={{
                      display: "flex",
                      flexShrink: 0,
                      alignItems: "center",
                      borderRadius: 12,
                      background: "color-mix(in oklab, var(--surface) 55%, transparent)",
                      padding: "9px 14px",
                      outline: "1px solid var(--line)",
                      outlineOffset: -0.5,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", color: "var(--ink)" }}>Deny</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexShrink: 0,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      borderRadius: 12,
                      background: "linear-gradient(-45deg, var(--accent), var(--accent-2))",
                      padding: "9px 15px",
                      boxShadow: `inset 0px 1px 0px color-mix(in oklab, var(--canvas) 35%, transparent), 0px ${8 + 4 * hover}px ${20 + 8 * hover}px var(--glow)`,
                      filter: `brightness(${1 + 0.1 * hover})`,
                      transform: `scale(${1 - 0.03 * press})`,
                    }}
                  >
                    {busy ? <Spinner color="var(--canvas)" size={15} /> : <Icon name="check" size={15} style={{ color: "var(--canvas)" }} />}
                    <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", color: "var(--canvas)" }}>Approve</span>
                  </div>
                </div>
              </Sec>
            </div>
          </div>
        </div>
      </Glass>
    </div>
  );
}

/** A section of the card that grows into place (height, fade, small rise) at frame `at`. */
function Sec({ at, pt, children }: { at: number; pt: number; children: ReactNode }) {
  const f = useT();
  const p = ramp(f, at, 22, E.enter);
  if (p <= 0.001) return null;
  return (
    <div style={{ display: "grid", width: "100%", gridTemplateRows: `${p}fr` }}>
      <div style={{ minHeight: 0, overflow: p < 1 ? "hidden" : "visible" }}>
        <div style={{ paddingTop: pt, ...(p < 1 ? { opacity: p, transform: `translateY(${(1 - p) * 10}px)`, filter: `blur(${(1 - p) * 4}px)` } : {}) }}>{children}</div>
      </div>
    </div>
  );
}

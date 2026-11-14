import { useCurrentFrame } from "remotion";
import { FONT_BODY } from "./fonts";
import { E, ramp } from "./motion";
import { TL } from "../timeline";

/** Where a caption sits, per voice line (px at 1080p). The default is a bottom margin of 96. Where the console's message box sits low in
 *  the frame (it is the subject of the scene) the caption steps up out of its way; while the approval card fills the frame
 *  (it runs down to the bottom edge, buttons included) the caption goes to the top so it never covers the card.
 *  Every line is its own pill that fades in and out, so a different place from one line to the next never slides. */
const PLACE: Record<string, { bottom?: number; top?: number }> = {
  o1: { bottom: 215 },
  o2: { bottom: 290 },
  p1: { top: 96 },
  p2a: { top: 96 },
  w1: { bottom: 240 },
  w2: { bottom: 240 },
  w3: { bottom: 240 },
  w4: { bottom: 240 },
  w6: { bottom: 150 },
  b1: { bottom: 310 },
};
const BASE_BOTTOM = 96;

/** Karaoke captions from the voice-over's own word times (burned-in variant). */
export function Captions({ width = 1920, height = 1080 }: { width?: number; height?: number }) {
  const f = useCurrentFrame();
  const id = TL.voiceOrder.find((k) => f >= TL.voice[k].from - 4 && f <= TL.voice[k].to + 12);
  if (!id) return null;
  const line = TL.voice[id];
  const inP = ramp(f, line.from - 4, 10, E.enter);
  const outP = 1 - ramp(f, line.to + 2, 10, E.exit);
  const op = Math.min(inP, outP);
  const tall = height > width;
  const size = tall ? 44 : 38;
  const place = tall ? { bottom: 300 } : PLACE[id] ?? { bottom: BASE_BOTTOM };
  const edge = place.top !== undefined ? { top: place.top } : { bottom: place.bottom ?? BASE_BOTTOM };
  const drift = place.top !== undefined ? -(1 - op) * 8 : (1 - op) * 8;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, ...edge, display: "flex", justifyContent: "center", padding: "0 96px", pointerEvents: "none", opacity: op, transform: `translateY(${drift}px)` }}>
      <div
        style={{
          maxWidth: tall ? width - 160 : 1380,
          borderRadius: 20,
          padding: "12px 28px 14px",
          background: "rgba(8,12,10,0.74)",
          boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
          textAlign: "center",
          fontFamily: FONT_BODY,
          fontSize: size,
          lineHeight: 1.28,
          fontWeight: 600,
          letterSpacing: -0.2,
        }}
      >
        {line.words.map((w, i) => {
          const spoken = f >= w.from;
          const current = f >= w.from && f < Math.max(w.to, w.from + 6);
          return (
            <span key={i} style={{ color: current ? "#b5efcb" : spoken ? "#f2f6f4" : "rgba(242,246,244,0.5)", whiteSpace: "pre" }}>
              {w.word}
              {i < line.words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

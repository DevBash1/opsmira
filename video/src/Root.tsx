import type { ComponentType } from "react";
import { AbsoluteFill, Composition, Sequence, Still, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { AskScene } from "./scenes/Ask";
import { HookScene } from "./scenes/Hook";
import { ConnectScene } from "./scenes/Connect";
import { WatchScene } from "./scenes/Watch";
import { CommandScene } from "./scenes/Command";
import { OwnScene } from "./scenes/Own";
import { EndScene } from "./scenes/End";
import { Captions } from "./kit/Captions";
import { GrainLayer, Vignette } from "./kit/Aurora";
import { SceneClock } from "./kit/time";
import { blurThrough, sweep, whip, zoomThrough } from "./kit/transitions";
import "./kit/fonts";
import { TL, TOTAL, FPS } from "./timeline";
import { DebugCtx } from "./kit/debug";

/** captions: burn the voice-over in as karaoke captions. audio: play public/audio/preview.mp3 (Studio preview; renders use --muted and mux the wav). */
export type LaunchProps = { captions: boolean; audio: boolean; debug?: string };

const SCENES: Record<string, ComponentType> = {
  hook: HookScene,
  ask: AskScene,
  connect: ConnectScene,
  watch: WatchScene,
  command: CommandScene,
  own: OwnScene,
  end: EndScene,
};

const TRANSITIONS: Record<string, ReturnType<typeof blurThrough> | ReturnType<typeof sweep> | ReturnType<typeof whip> | ReturnType<typeof zoomThrough>> = {
  ask: blurThrough({ blur: 26, zoom: 0.07 }),
  connect: whip({ dir: 1, streak: 70 }),
  watch: sweep({ dir: 1, tone: "light", soft: 26 }),
  command: sweep({ dir: -1, tone: "dark", soft: 26 }),
  own: zoomThrough({ amount: 0.5, blur: 22 }),
  end: blurThrough({ blur: 22, zoom: 0.06, glow: 1 }),
};

export const Launch = ({ captions, audio, debug = "" }: LaunchProps) => {
  const order = TL.sceneOrder;
  const nodes: React.ReactNode[] = [];
  order.forEach((id, i) => {
    const s = TL.scenes[id];
    if (i > 0) {
      const tr = TRANSITIONS[id];
      nodes.push(<TransitionSeries.Transition key={`t-${id}`} presentation={tr as never} timing={linearTiming({ durationInFrames: s.transIn })} />);
    }
    const Scene = SCENES[id];
    nodes.push(
      <TransitionSeries.Sequence key={id} durationInFrames={s.duration}>
        <SceneClock from={s.from}>
          <Scene />
        </SceneClock>
      </TransitionSeries.Sequence>,
    );
  });
  return (
    <DebugCtx.Provider value={debug}>
      <AbsoluteFill style={{ background: "#0b100e" }}>
        <TransitionSeries>{nodes}</TransitionSeries>
        <GrainLayer opacity={0.045} />
        <Vignette strength={0.32} />
        {captions && <Captions />}
        {audio && <Audio src={staticFile("audio/preview.mp3")} />}
      </AbsoluteFill>
    </DebugCtx.Provider>
  );
};

/** The poster: the finished film at the moment the end card is complete (mark, name, tagline, install command, address). */
const POSTER_FRAME = TOTAL - 36;
const Poster = () => (
  <Sequence from={-POSTER_FRAME}>
    <Launch captions={false} audio={false} />
  </Sequence>
);

export const Root = () => (
  <>
    <Composition id="Launch" component={Launch} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} defaultProps={{ captions: false, audio: true } satisfies LaunchProps} />
    <Composition id="LaunchCaptions" component={Launch} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} defaultProps={{ captions: true, audio: true } satisfies LaunchProps} />
    <Still id="Poster" component={Poster} width={1920} height={1080} />
  </>
);


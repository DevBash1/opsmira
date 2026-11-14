import { AbsoluteFill } from "remotion";
import { Camera, poseAt, type PoseKey } from "../kit/Camera";
import { AskLine, ChatStage, Collapse, CommandPill, Reply } from "../kit/chat";
import { Presence } from "../kit/chips";
import { Composer } from "../kit/composer";
import { useDebug } from "../kit/debug";
import { E, ramp } from "../kit/motion";
import { useT } from "../kit/time";
import { TopBar } from "../kit/topbar";
import { ConsoleWindow } from "../kit/window";
import { Hero } from "../kit/hero";
import { ev, typed, TL } from "../timeline";
import { Backdrop, CHAT, ComposerDock, P } from "./common";

const SERVER = "web-01";
const OUTPUT = `● nginx.service - A high performance web server and a reverse proxy server
     Loaded: loaded (/lib/systemd/system/nginx.service; enabled)
     Active: active (running) since Mon 2026-10-19 08:12:41 UTC; 5 days ago
       Docs: man:nginx(8)
   Main PID: 1243 (nginx)
      Tasks: 3 (limit: 4557)
     Memory: 8.4M`;

export function CommandScene() {
  const f = useT();
  const debug = useDebug();
  const e = ev;
  const from = TL.scenes.command.from;
  const cmd = typed("cmd", f);
  const enter = e("cmd_enter");
  const bang = e("cmd_start");
  const sent = f >= enter;

  const commandAmt = sent ? 1 - ramp(f, enter, 8, E.exit) : ramp(f, bang, 10, E.enter);
  const focus = ramp(f, from + 6, 14);
  const sendPress = ramp(f, enter - 2, 3, E.enter) * (1 - ramp(f, enter + 3, 8, E.enter));
  const sendReady = sent ? 0 : Math.min(1, Math.max(0, cmd.count - 1) / 3);
  const running = ramp(f, e("cmd_pill_done") + 4, 12) * (1 - ramp(f, e("cmd_reply") + 20, 20));
  const heroOut = ramp(f, enter, 12);

  const keys: PoseKey[] = [
    { f: from, pose: P(640, 420, 1.15, 0, 0, 0) },
    { f: e("cmd_start") - 10, pose: P(640, 455, 1.36, 0, 0, 0), ease: E.inOut },
    { f: enter - 2, pose: P(650, 458, 1.42, 0, 0, 0), ease: E.linear },
    // after Enter the camera pulls back (message up top, composer below: the whole window), then settles on the answer
    { f: enter + 8, pose: P(640, 372, 1.02, 0, 0, 0), ease: E.move },
    { f: e("cmd_pill_in") + 24, pose: P(640, 334, 1.28, 0, 0, 0), ease: E.inOut },
    { f: e("cmd_reply") + 30, pose: P(640, 338, 1.32, 0, 0, 0), ease: E.linear },
  ];
  const pose = debug.includes("nocam") ? P(640, 360, 1) : poseAt(f, keys);

  return (
    <AbsoluteFill>
      <Backdrop theme="dark" strength={0.8} />
      <Camera pose={pose}>
        <ConsoleWindow theme="dark" energy={running * 0.8}>
          <TopBar />
          {f < enter + 16 && (
            <div style={{ position: "absolute", left: 0, right: 0, top: CHAT.top, bottom: CHAT.bottom }}>
              <Hero start={from - 20} orbOnly out={heroOut} />
            </div>
          )}
          <ChatStage top={CHAT.top} bottom={CHAT.bottom}>
            {f >= enter && <AskLine text={TL.typing.cmd.text} start={enter} />}
            {f >= e("cmd_pill_in") && (
              <CommandPill
                command="systemctl status nginx"
                server={SERVER}
                start={e("cmd_pill_in")}
                done={e("cmd_pill_done")}
                open={ramp(f, e("cmd_pill_done") + 4, 20, E.soft)}
                output={OUTPUT}
                outputStart={e("cmd_pill_done") + 8}
              />
            )}
            {f >= e("cmd_read") && (
              <Collapse show={e("cmd_read")} hide={e("cmd_reply")}>
                <Presence label="Reading" />
              </Collapse>
            )}
            {f >= e("cmd_reply") && <Reply start={e("cmd_reply")}>nginx is active and has been running for 5 days. Nothing here needs attention.</Reply>}
          </ChatStage>
          <ComposerDock>
            <Composer
              text={sent ? "" : cmd.text}
              lastKey={cmd.last}
              focus={sent ? 0 : focus}
              command={commandAmt}
              commandSince={bang + 14}
              server={SERVER}
              send={sendReady}
              sendPress={sendPress}
              running={running}
            />
          </ComposerDock>
        </ConsoleWindow>
      </Camera>
    </AbsoluteFill>
  );
}

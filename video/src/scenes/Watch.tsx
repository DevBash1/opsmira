import { AbsoluteFill } from "remotion";
import { ApprovalCard } from "../kit/approval";
import { Camera, poseAt, type PoseKey } from "../kit/Camera";
import { AskLine, ChatStage, Collapse, CommandPill, Reply } from "../kit/chat";
import { Presence, SoftPill } from "../kit/chips";
import { Composer } from "../kit/composer";
import { Cursor, cursorAt } from "../kit/cursor";
import { useDebug } from "../kit/debug";
import { Hero } from "../kit/hero";
import { E, blurRise, ramp } from "../kit/motion";
import { useT } from "../kit/time";
import { Popover, TasksList, TopBar, type TaskRow } from "../kit/topbar";
import { ConsoleWindow } from "../kit/window";
import { ev, typed, TL } from "../timeline";
import { Backdrop, CHAT, ComposerDock, P, TARGET } from "./common";

const SERVER = "edge-eu";
const WAKE = `[Task] "Morning disk check" woke you at 2026-10-24T07:00:00.000Z because it is scheduled (cron 0 7 * * *). It runs on ${SERVER}. Check the disks and report anything unusual.`;
const REPORT = "Disks look healthy: / is at 41%. The system journal has grown to 3.2 GB. Keeping only the last week would free about 2.6 GB.";

export function WatchScene() {
  const f = useT();
  const debug = useDebug();
  const e = ev;
  const from = TL.scenes.watch.from;
  const end = from + TL.scenes.watch.duration;

  /* ---- the three requests, typed in step with the voice ---- */
  const t1 = typed("t1", f);
  const t2 = typed("t2", f);
  const t3 = typed("t3", f);
  const s1 = e("t1_send");
  const s2 = e("t2_send");
  const s3 = e("t3_send");
  const current = f < s1 ? t1 : f < s2 ? t2 : f < s3 ? t3 : null;
  const compText = current ? current.text : "";
  const sendPress = Math.max(...[s1, s2, s3].map((s) => ramp(f, s - 2, 3, E.enter) * (1 - ramp(f, s + 3, 8, E.enter))));
  const sendReady = Math.min(1, compText.length / 3);
  const focus = ramp(f, e("wt_focus"), 12) * (1 - ramp(f, e("row_move"), 14));

  /* ---- tasks popover and the task waking up ---- */
  const popIn = ramp(f, e("tasks_open"), 18, E.enter);
  const popOut = ramp(f, e("row_click") + 2, 10, E.exit);
  const tasksOpen = popIn * (1 - popOut);
  const woke = f >= e("task_wake");
  const ranDone = f >= e("tk_pill2_done") + 6;
  const rowGlow = ramp(f, e("task_wake"), 10) * (1 - ramp(f, e("row_click") - 6, 8)) * 0.9 + ramp(f, e("row_click") - 6, 8) * (1 - popOut) * 0.9;
  const fresh = (at: number) => ramp(f, at, 6) * (1 - ramp(f, at + 12, 30)) * 0.85;
  const tasks: TaskRow[] = [
    {
      name: "Morning disk check",
      server: SERVER,
      when: "cron 0 7 * * *",
      state: woke && !ranDone ? "running" : "on",
      ran: woke ? "ran just now" : "not run yet",
      next: "in 24h",
      waiting: f >= e("tk_waiting") ? 1 : 0,
      appear: e("t1_chip"),
      glow: Math.max(rowGlow, fresh(e("t1_chip"))),
    },
    { name: "Watch nginx config", server: SERVER, when: 'when "md5sum /etc/nginx/nginx.conf" output changes (checked every 5m)', state: "on", ran: "not run yet", next: "in 5m", appear: e("t2_chip"), glow: fresh(e("t2_chip")) },
    { name: "Memory guard", server: SERVER, when: `when "free | awk '/Mem/{printf "%d", $3/$2*100}'" above 90 (checked every 1m)`, state: "on", ran: "not run yet", next: "in 1m", appear: e("t3_chip"), glow: fresh(e("t3_chip")) },
  ];

  /* ---- first chat gives way to the task's own chat ---- */
  const chat2 = ramp(f, e("task_chat_in"), 16, E.inOut);
  const chat1Vis = 1 - chat2;

  /* ---- camera ---- */
  const keys: PoseKey[] = [
    { f: from, pose: P(640, 360, 1.0, 0, 0, 0) },
    { f: e("wt_focus") + 24, pose: P(680, 378, 1.08, 0, -1, 0), ease: E.inOut },
    { f: e("t3_chip") + 20, pose: P(684, 372, 1.12, 0, -1, 0), ease: E.linear },
    { f: e("row_click") - 6, pose: P(720, 300, 1.18, 0, -1, 0), ease: E.inOut },
    { f: e("task_chat_in") + 30, pose: P(650, 300, 1.2, 0, 0, 0), ease: E.inOut },
    { f: e("tk_card_in") + 30, pose: P(630, 385, 1.28, 0, 0, 0), ease: E.inOut },
    { f: e("tk_waiting") - 4, pose: P(630, 385, 1.3, 0, 0, 0), ease: E.linear },
    { f: end - 10, pose: P(700, 335, 1.1, 0, 0, 0), ease: E.inOut },
  ];
  const pose = debug.includes("nocam") ? P(640, 360, 1) : poseAt(f, keys);

  /* ---- cursor: once to open Tasks, once to open the task's chat ---- */
  const tasksIcon = TARGET.topIcon("tasks");
  const rowName = { x: 830, y: 120 };
  const cur = cursorAt(f, [
    [e("tasks_move"), 900, 340],
    [e("tasks_click") - 2, tasksIcon.x, tasksIcon.y],
    [e("tasks_click") + 12, tasksIcon.x, tasksIcon.y],
    [e("tasks_click") + 44, 980, 300],
    [e("row_move"), 960, 380],
    [e("row_click") - 3, rowName.x, rowName.y],
    [e("row_click") + 26, rowName.x - 30, rowName.y + 90],
  ]);
  const curVis =
    ramp(f, e("tasks_move"), 8) * (1 - ramp(f, e("tasks_click") + 26, 12)) +
    ramp(f, e("row_move") - 6, 10) * (1 - ramp(f, e("row_click") + 22, 10));
  const curPress = f < e("row_move") ? e("tasks_click") : e("row_click");

  /* ---- the morning light at the wake-up ---- */
  const dawn = ramp(f, e("task_wake") - 4, 22, E.enter) * (1 - ramp(f, e("task_wake") + 36, 56, E.inOut));

  /* ---- the waiting dot ---- */
  const dot = ramp(f, e("tk_waiting"), 12, E.enter);
  const ping = ramp(f, e("tk_waiting"), 44, E.enter);

  return (
    <AbsoluteFill>
      <Backdrop theme="light" strength={0.9} />
      <Camera pose={pose}>
        <ConsoleWindow theme="light" energy={0}>
          <TopBar
            theme="light"
            state={{
              tasks: { dot, ping, active: Math.max(tasksOpen, 0), hover: ramp(f, e("tasks_click") - 8, 6) * (1 - popIn) },
            }}
          />
          <Popover open={tasksOpen} width={520}>
            <TasksList tasks={tasks} />
          </Popover>

          {f < s1 + 24 && (
            <div style={{ position: "absolute", left: 0, right: 0, top: CHAT.top, bottom: CHAT.bottom, opacity: 1 - ramp(f, s1 + 4, 14) }}>
              <Hero start={from - 10} orbOnly />
            </div>
          )}

          {/* the requests, and the tasks they set up */}
          <div style={{ position: "absolute", inset: 0, opacity: chat1Vis, filter: chat2 > 0.01 ? `blur(${chat2 * 6}px)` : undefined, visibility: chat1Vis <= 0.001 ? "hidden" : "visible" }}>
            <ChatStage top={CHAT.top} bottom={CHAT.bottom}>
              {f >= e("t1_ask") && <AskLine text={TL.typing.t1.text} start={e("t1_ask")} />}
              {f >= e("t1_chip") && <SoftPill icon="refresh-cw" label="Task set up" name="Morning disk check" style={{ ...blurRise(f, e("t1_chip"), { dur: 18 }) }} />}
              {f >= e("t2_ask") && <AskLine text={TL.typing.t2.text} start={e("t2_ask")} />}
              {f >= e("t2_chip") && <SoftPill icon="refresh-cw" label="Task set up" name="Watch nginx config" style={{ ...blurRise(f, e("t2_chip"), { dur: 18 }) }} />}
              {f >= e("t3_ask") && <AskLine text={TL.typing.t3.text} start={e("t3_ask")} />}
              {f >= e("t3_chip") && <SoftPill icon="refresh-cw" label="Task set up" name="Memory guard" style={{ ...blurRise(f, e("t3_chip"), { dur: 18 }) }} />}
            </ChatStage>
          </div>

          {/* the task's own chat: it woke up by itself */}
          {chat2 > 0.001 && (
            <div style={{ position: "absolute", inset: 0, opacity: chat2, filter: chat2 < 1 ? `blur(${(1 - chat2) * 6}px)` : undefined }}>
              <ChatStage top={CHAT.top} bottom={CHAT.bottom}>
                <AskLine text={WAKE} start={e("task_chat_in")} />
                <Collapse show={e("task_chat_in") + 6} hide={e("tk_pill1_in")}>
                  <Presence label="Looking" />
                </Collapse>
                {f >= e("tk_pill1_in") && <CommandPill command="df -h" server={SERVER} start={e("tk_pill1_in")} done={e("tk_pill1_done")} />}
                {f >= e("tk_pill2_in") && <CommandPill command="journalctl --disk-usage" server={SERVER} start={e("tk_pill2_in")} done={e("tk_pill2_done")} />}
                {f >= e("task_report") && <Reply start={e("task_report")}>{REPORT}</Reply>}
                {f >= e("tk_card_in") && (
                  <ApprovalCard
                    title="Trim the system journal"
                    context="Removes journal entries older than a week. New entries keep arriving as usual."
                    command="journalctl --vacuum-time=7d"
                    server={SERVER}
                    riskLevel="Low"
                    riskDetail="Only entries older than seven days are removed. Recent logs stay."
                    times={{ card: e("tk_card_in"), title: e("tk_card_in") + 5, context: e("tk_card_in") + 12, command: e("tk_card_in") + 22, risk: e("tk_card_in") + 32, buttons: e("tk_card_in") + 42 }}
                  />
                )}
              </ChatStage>
            </div>
          )}

          <ComposerDock>
            <Composer text={compText} lastKey={current ? current.last : -1000} focus={focus} server={SERVER} send={sendReady} sendPress={sendPress} />
          </ComposerDock>
          <Cursor x={cur.x} y={cur.y} visible={curVis} pressAt={curPress} light />
          {/* seven o'clock: a warm morning light washes in from the top-right (where the Tasks button is) as the task wakes */}
          {dawn > 0.002 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                zIndex: 40,
                opacity: dawn,
                background: "radial-gradient(70% 85% at 88% -6%, rgba(255,198,128,0.55), rgba(255,214,160,0.22) 38%, rgba(255,230,190,0) 72%)",
              }}
            />
          )}
        </ConsoleWindow>
      </Camera>
    </AbsoluteFill>
  );
}

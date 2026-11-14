import { AbsoluteFill } from "remotion";
import { ApprovalCard } from "../kit/approval";
import { Camera, poseAt, type PoseKey } from "../kit/Camera";
import { AskLine, ChatStage, Collapse, CommandPill, Reveal } from "../kit/chat";
import { Presence } from "../kit/chips";
import { Composer } from "../kit/composer";
import { Cursor, FlowDot, cursorAt } from "../kit/cursor";
import { DiskSurface, type DiskData } from "../kit/disk";
import { Hero } from "../kit/hero";
import { Logo, Wordmark } from "../kit/Logo";
import { E, blurOut, blurRise, ramp } from "../kit/motion";
import { useT } from "../kit/time";
import { useDebug } from "../kit/debug";
import { ActivityList, Popover, TopBar } from "../kit/topbar";
import { winPt, ConsoleWindow } from "../kit/window";
import { TL, typed, ev } from "../timeline";
import { Backdrop, CHAT, ComposerDock, P, TARGET, VIEW_BOTTOM } from "./common";

export const DISK: DiskData = {
  host: "web-01",
  percent: 87,
  used: "69 GB",
  total: "80 GB",
  rootAvail: "11 GB",
  rootSize: "80 GB",
  rootFs: "/dev/vda1",
  readAt: "14:02:24",
  mounts: [
    { mount: "/", size: "80G", used: "69G", avail: "11G", percent: 87 },
    { mount: "/data", size: "200G", used: "112G", avail: "88G", percent: 56 },
    { mount: "/boot", size: "1.0G", used: "312M", avail: "712M", percent: 31 },
  ],
};

const SERVER = "web-01";
const DF_OUTPUT = `Filesystem      Size  Used Avail Use% Mounted on
/dev/vda1        80G   69G   11G  87% /
/dev/vdb1       200G  112G   88G  56% /data
/dev/vda15      1.0G  312M  712M  31% /boot
tmpfs           3.9G     0  3.9G   0% /dev/shm`;
const QUESTION = "Why is web-01 running out of disk space?";

export function AskScene() {
  const f = useT();
  const e = ev;

  /* ---- timing (all from the beat map) ---- */
  const heroIn = e("ask_hero_in");
  const markIn = e("ask_mark_in");
  const markOut = e("ask_mark_out");
  const q = typed("q1", f);
  const send = e("ask_send");
  const askLine = e("ask_line");

  /* ---- camera ---- */
  const keys: PoseKey[] = [
    { f: TL.scenes.ask.from, pose: P(640, 395, 0.8, 7, -11, 0) },
    { f: e("ask_cam_hero"), pose: P(640, 340, 0.97, 2, -4, 0), ease: E.move },
    { f: e("ask_cam_mark"), pose: P(640, 330, 1.04, 0, 0, 0), ease: E.inOut },
    { f: e("ask_cam_composer"), pose: P(640, 455, 1.32, 0, 0, 0), ease: E.inOut },
    { f: e("ask_cam_composer_hold"), pose: P(650, 460, 1.38, 0, 0, 0), ease: E.linear },
    // after "send" the camera pulls back so the whole window shows the work begin (message up top, composer docked), then dives in
    { f: e("ask_cam_overview"), pose: P(640, 360, 1.0, 0, 0, 0), ease: E.move },
    { f: e("ask_cam_pills"), pose: P(420, 205, 1.75, 0, 0, 0), ease: E.inOut },
    { f: e("ask_cam_surface"), pose: P(640, 340, 1.2, 0, 0, 0), ease: E.inOut },
    { f: e("ask_cam_action"), pose: P(940, 500, 1.9, 0, 0, 0), ease: E.inOut },
    { f: e("ask_cam_card"), pose: P(400, 352, 1.6, 0, 0, 0), ease: E.inOut },
    { f: e("ask_cam_card2"), pose: P(400, 352, 1.7, 0, 0, 0), ease: E.linear },
    { f: e("ask_cam_approve"), pose: P(500, 480, 2.1, 0, 0, 0), ease: E.inOut },
    { f: e("ask_cam_audit"), pose: P(880, 225, 1.6, 0, 0, 0), ease: E.inOut },
    { f: e("ask_cam_end"), pose: P(700, 340, 1.1, 1, -2, 0), ease: E.inOut },
  ];
  const pose = useDebug().includes("nocam") ? P(640, 360, 1) : poseAt(f, keys);

  /* ---- hero and mark ---- */
  const heroOut = ramp(f, markIn - 8, 16, E.inOut);
  const markShow = ramp(f, markIn, 12, E.enter) * (1 - 0.62 * ramp(f, markOut, 16, E.inOut)) * (1 - ramp(f, send, 14, E.exit));
  const markSettle = ramp(f, markOut, 22, E.inOut);
  const draw = ramp(f, markIn + 2, 26, E.inOut);
  const settle = ramp(f, markIn + 26, 22, E.linear);

  /* ---- composer ---- */
  const focus = ramp(f, markOut, 10, E.enter);
  const sendReady = ramp(f, e("q1_start"), 10, E.enter) * (1 - ramp(f, send, 6, E.exit));
  const sendPress = ramp(f, send - 2, 3, E.enter) * (1 - ramp(f, send + 3, 8, E.enter));
  const sent = f >= send;
  const running1 = ramp(f, askLine, 14) * (1 - ramp(f, e("surf_in") + 30, 20));
  const running2 = ramp(f, e("ask2_in"), 14) * (1 - ramp(f, e("card_btn") + 12, 20));
  const running = Math.max(running1, running2);

  /* ---- surface ---- */
  const surfIn = e("surf_in");
  const pill1Open = ramp(f, e("pill1_done") + 4, 22, E.soft) * (1 - ramp(f, surfIn - 6, 20, E.move));
  const live = e("surf_live");
  const tick = ramp(f, live, 8, E.enter) * (1 - ramp(f, live + 14, 20, E.move));
  const percentShown = f >= live + 4 ? 88 : 87;
  const readAt = f >= live + 4 ? "14:02:29" : "14:02:24";
  const actionHover = ramp(f, e("act_press") - 14, 8, E.enter);
  const actionPress = ramp(f, e("act_press") - 2, 3, E.enter) * (1 - ramp(f, e("act_press") + 3, 8, E.enter));

  /* ---- approval ---- */
  const apprPress = e("appr_press");
  const collapse = ramp(f, e("appr_done"), 22, E.soft);
  const approveHover = ramp(f, e("appr_hover"), 8, E.enter);
  const approvePress = ramp(f, apprPress - 2, 3, E.enter) * (1 - ramp(f, apprPress + 3, 8, E.enter));
  const busy = f >= apprPress + 4 && f < e("appr_done");

  /* ---- audit ---- */
  const flow = ramp(f, e("flow_go"), 24, E.linear);
  const flowLanded = f >= e("flow_go") + 22;
  const auditOpen = ramp(f, e("audit_open"), 16, E.enter);
  const auditIcon = TARGET.topIcon("audit");
  const pillAfter = { x: 180 + 150, y: VIEW_BOTTOM - 28 - 17 };

  /* ---- cursor ---- */
  const cursorPts: Array<[number, number, number]> = [
    [e("ask_send_move"), 1160, 760],
    [send - 3, TARGET.send.x, TARGET.send.y],
    [send + 14, TARGET.send.x + 40, TARGET.send.y + 70],
    [e("act_move"), 900, 420],
    [e("act_press") - 3, 1017, 531],
    [e("act_press") + 18, 1030, 546],
    [e("appr_move"), 760, 520],
    [e("appr_hover"), 528, 509],
    [apprPress + 12, 540, 515],
    [e("audit_click") - 4, auditIcon.x, auditIcon.y],
    [e("audit_click") + 26, auditIcon.x + 30, auditIcon.y + 90],
  ];
  const cursor = cursorAt(f, cursorPts);
  const cursorVis =
    Math.max(
      ramp(f, e("ask_send_move"), 8) * (1 - ramp(f, send + 14, 8)),
      ramp(f, e("act_move"), 8) * (1 - ramp(f, e("act_press") + 20, 10)),
      ramp(f, e("appr_move"), 8) * (1 - ramp(f, e("audit_click") + 24, 10)),
    );
  const pressFrame = f < send + 20 ? send : f < e("act_press") + 22 ? e("act_press") : f < apprPress + 20 ? apprPress : e("audit_click");

  const rows = [
    { title: "apt-get clean", kind: "act" as const, exit: 0, at: "14:03:12", appear: e("audit_row") },
    { title: "du -sh /var/cache/apt /var/log /tmp", kind: "inspect" as const, exit: 0, at: "14:02:58" },
    { title: "journalctl --disk-usage", kind: "inspect" as const, exit: 0, at: "14:02:23" },
    { title: "du -xh /var -d 1 2>/dev/null | sort -rh | head -5", kind: "inspect" as const, exit: 0, at: "14:02:21" },
    { title: "df -h", kind: "inspect" as const, exit: 0, at: "14:02:19" },
  ];

  return (
    <AbsoluteFill>
      <Backdrop theme="dark" strength={0.75} />
      <Camera pose={pose}>
        <ConsoleWindow theme="dark" energy={running * 0.9}>
          <TopBar
            opacity={ramp(f, heroIn, 20)}
            state={{ audit: { dot: ramp(f, e("flow_go") + 20, 10, E.enter), active: auditOpen, hover: ramp(f, e("audit_click") - 8, 6) * (1 - auditOpen) } }}
          />
          <Popover open={auditOpen} width={440}>
            <ActivityList rows={rows} />
          </Popover>

          {/* empty state, then the mark */}
          {f < markIn + 30 && (
            <div style={{ position: "absolute", left: 0, right: 0, top: CHAT.top, bottom: CHAT.bottom }}>
              <Hero start={heroIn} out={heroOut} />
            </div>
          )}
          {markShow > 0.01 && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: CHAT.top,
                bottom: CHAT.bottom,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 22,
                opacity: markShow,
                transform: `translateY(${(1 - ramp(f, markIn, 18, E.enter)) * 14 - markSettle * 70}px) scale(${(0.94 + 0.06 * ramp(f, markIn, 12, E.enter)) * (1 - 0.22 * markSettle)})`,
                filter: f > send ? `blur(${ramp(f, send, 14, E.exit) * 10}px)` : undefined,
              }}
            >
              <Logo size={132} draw={draw} settle={settle} square={ramp(f, markIn, 14, E.enter)} />
              <div style={{ ...blurRise(f, markIn + 10, { dur: 18, rise: 10, blur: 6 }) }}>
                <Wordmark size={60} color="var(--ink)" />
              </div>
            </div>
          )}

          <ChatStage top={CHAT.top} bottom={CHAT.bottom}>
            {sent && <AskLine text={QUESTION} start={askLine} />}
            {sent && (
              <Collapse show={askLine + 6} hide={e("pill1_in")}>
                <Presence label="Thinking" />
              </Collapse>
            )}
            {f >= e("pill1_in") && (
              <CommandPill command="df -h" server={SERVER} start={e("pill1_in")} done={e("pill1_done")} open={pill1Open} output={DF_OUTPUT} outputStart={e("pill1_done") + 6} />
            )}
            {f >= e("pill2_in") && <CommandPill command="du -xh /var -d 1 2>/dev/null | sort -rh | head -5" server={SERVER} start={e("pill2_in")} done={e("pill2_done")} />}
            {f >= e("pill3_in") && <CommandPill command="journalctl --disk-usage" server={SERVER} start={e("pill3_in")} done={e("pill3_done")} />}
            {f >= surfIn && (
              <Reveal start={surfIn} dur={26} blur={5}>
                <div style={{ paddingTop: 6, paddingBottom: 4 }}>
                  <DiskSurface data={DISK} start={surfIn + 4} percentShown={percentShown} readAt={readAt} liveTick={tick} actionHover={actionHover} actionPress={actionPress} />
                </div>
              </Reveal>
            )}
            {f >= e("ask2_in") && <AskLine text="Show where reclaimable storage space is." start={e("ask2_in")} />}
            {f >= e("ask2_in") && (
              <Collapse show={e("ask2_in") + 6} hide={e("pill4_in")}>
                <Presence label="Looking" />
              </Collapse>
            )}
            {f >= e("pill4_in") && <CommandPill command="du -sh /var/cache/apt /var/log /tmp" server={SERVER} start={e("pill4_in")} done={e("pill4_done")} />}
            {f >= e("card_in") && (
              <ApprovalCard
                title="Clear apt package cache"
                context="Removes the downloaded .deb package files in /var/cache/apt/archives, about 6.2 GB right now. Installed software is not affected, and apt re-downloads any package if it is needed again."
                command="apt-get clean"
                server={SERVER}
                riskLevel="Low"
                riskDetail="Only the cached installers are removed, so the next install of those packages downloads them again."
                times={{ card: e("card_in"), title: e("card_title"), context: e("card_ctx"), command: e("card_cmd"), risk: e("card_risk"), buttons: e("card_btn") }}
                collapse={collapse}
                hover={approveHover}
                press={approvePress}
                pressAt={apprPress}
                busy={busy}
                result="Done · exit 0 · 1.2s"
              />
            )}
          </ChatStage>

          <ComposerDock>
            <Composer
              text={sent ? "" : q.text}
              lastKey={q.last}
              focus={sent ? 0 : focus}
              server={SERVER}
              send={sendReady}
              sendPress={sendPress}
              running={running}
            />
          </ComposerDock>

          {flow > 0 && !flowLanded && <FlowDot from={pillAfter} to={{ x: auditIcon.x, y: auditIcon.y + 6 }} p={flow} bend={-150} />}
          <Cursor x={cursor.x} y={cursor.y} visible={cursorVis} pressAt={pressFrame} />
        </ConsoleWindow>
      </Camera>
    </AbsoluteFill>
  );
}

void winPt;
void blurOut;

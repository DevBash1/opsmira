/**
 * The hand-authored beat map: everything that is a decision rather than a measurement.
 * Voice clip lengths and word times come from public/voice/manifest.json (scripts/voice.mjs);
 * `npm run timeline` merges the two into src/timeline.generated.json.
 *
 * Anchors:  { line, word?, at: "start" | "end", offset }   a voice line (or one of its words)
 *           { ev, offset }                                  another event
 *           { t }                                           absolute seconds
 */
export const FPS = 30;

/** [line id, gap in seconds after the previous line ends] (the first number is the absolute start). */
export const voice = [
  ["h1", 0.45],
  ["h2", 0.43],
  ["o1", 0.55],
  ["o2", 0.35],
  ["a2", 1.9],
  ["a3", 0.34],
  ["p1", 1.25],
  ["p2a", 0.35],
  ["p2b", 0.3],
  ["c1", 0.9],
  ["c2a", 0.32],
  ["c2b", 0.3],
  ["w1", 2.2],
  ["w2", 0.25],
  ["w3", 0.25],
  ["w4", 0.24],
  ["w5", 0.27],
  ["w6", 0.27],
  ["b1", 0.8],
  ["b2", 0.35],
  ["s1a", 0.65],
  ["s1b", 0.25],
  ["s2a", 0.28],
  ["s2b", 0.18],
  /* a long gap: the two silent cards play out before the tagline comes back over the end card */
  ["e1", 10.13],
];

/** Scene cuts are the middle of a transition of `trans` frames. */
const CUT = {
  ask: { line: "h2", at: "end", offset: 0.35 },
  connect: { line: "p2b", at: "end", offset: 0.55 },
  watch: { line: "c2b", at: "end", offset: 2.1 },
  command: { line: "w6", at: "end", offset: 0.55 },
  own: { line: "b2", at: "end", offset: 0.4 },
  /* after the two silent cards that follow the last spoken line */
  end: { ev: "own_f_card", offset: 3.8 },
};
export const scenes = [
  { id: "hook" },
  { id: "ask", cut: CUT.ask, trans: 22 },
  { id: "connect", cut: CUT.connect, trans: 18 },
  { id: "watch", cut: CUT.watch, trans: 18 },
  { id: "command", cut: CUT.command, trans: 16 },
  { id: "own", cut: CUT.own, trans: 18 },
  { id: "end", cut: CUT.end, trans: 22 },
];

export const end = { ev: "end_hold", offset: 0 };

export const events = [
  /* ---------- HOOK ---------- */
  ["hook_err_in", { t: 0.1 }],
  ["hook_err_out", { line: "h2", offset: -0.05 }],
  ["hook_card_in", { line: "h2", offset: 0.0 }],
  { id: "hook_cmd", text: "find / -xdev -type f -size +100M -exec ls -lh {} + | sort -k5 -h | tail -n ", start: { line: "h2", word: "fix", offset: -0.1 }, dur: 2.15, rhythm: (i) => (i > 66 ? 2.4 : 1) },
  ["hook_stall", { line: "h2", offset: -0.25 }],

  /* ---------- ASK: the empty state, the question, the read-only commands, the surface, the approval, the audit log ---------- */
  ["ask_hero_in", { line: "o1", offset: -0.15 }],
  ["ask_mark_in", { line: "o2", offset: -0.05 }],
  ["ask_mark_out", { line: "o2", word: "Ask", offset: -0.05 }],
  { id: "q1", text: "Why is web-01 running out of disk space?", start: { line: "o2", at: "end", offset: -0.45 }, dur: 1.9 },
  ["ask_send_move", { ev: "q1_end", offset: -0.55 }],
  ["ask_send", { ev: "q1_end", offset: 0.28 }],
  ["ask_line", { ev: "ask_send", offset: 0.12 }],
  ["pill1_in", { line: "a2", offset: 0.1 }],
  ["pill1_done", { ev: "pill1_in", offset: 0.62 }],
  ["pill2_in", { line: "a2", word: "read-only", offset: -0.2 }],
  ["pill2_done", { ev: "pill2_in", offset: 0.66 }],
  ["pill3_in", { line: "a2", word: "run", offset: -0.1 }],
  ["pill3_done", { ev: "pill3_in", offset: 0.6 }],
  ["surf_in", { line: "a3", offset: 0.1 }],
  ["surf_live", { line: "a3", word: "Live." }],
  ["act_move", { line: "a3", at: "end", offset: -0.3 }],
  ["act_press", { line: "p1", offset: -0.4 }],
  ["ask2_in", { ev: "act_press", offset: 0.1 }],
  ["pill4_in", { ev: "act_press", offset: 0.32 }],
  ["pill4_done", { ev: "pill4_in", offset: 0.5 }],
  ["card_in", { line: "p1", word: "proposes", offset: -0.2 }],
  ["card_title", { line: "p1", word: "proposes" }],
  ["card_ctx", { line: "p1", word: "what" }],
  ["card_risk", { line: "p1", word: "how" }],
  ["card_cmd", { line: "p1", word: "exact", offset: -0.25 }],
  ["card_btn", { line: "p1", word: "command." }],
  ["appr_move", { line: "p2a", word: "changes" }],
  ["appr_hover", { line: "p2a", word: "approve.", offset: -0.15 }],
  ["appr_press", { line: "p2a", word: "approve.", offset: 0.22 }],
  ["appr_done", { ev: "appr_press", offset: 0.5 }],
  ["flow_go", { line: "p2b" }],
  ["audit_click", { line: "p2b", word: "goes", offset: 0.1 }],
  ["audit_open", { ev: "audit_click", offset: 0.1 }],
  ["audit_row", { line: "p2b", word: "audit" }],
  /* camera keys */
  ["ask_cam_hero", { line: "o1", offset: 0.6 }],
  ["ask_cam_mark", { line: "o2" }],
  ["ask_cam_composer", { ev: "q1_start", offset: -0.1 }],
  ["ask_cam_composer_hold", { ev: "ask_send", offset: -0.1 }],
  ["ask_cam_overview", { ev: "ask_send", offset: 0.38 }],
  ["ask_cam_pills", { line: "a2", offset: 0.9 }],
  ["ask_cam_surface", { line: "a3", word: "shows" }],
  ["ask_cam_action", { ev: "act_press", offset: -0.2 }],
  ["ask_cam_card", { line: "p1", word: "proposes", offset: 0.5 }],
  ["ask_cam_card2", { line: "p1", at: "end", offset: 0.1 }],
  ["ask_cam_approve", { ev: "appr_hover", offset: -0.1 }],
  ["ask_cam_audit", { line: "p2b", offset: 0.7 }],
  ["ask_cam_end", { line: "p2b", at: "end", offset: 0.3 }],

  /* ---------- CONNECT ---------- */
  ["conn_term_in", { line: "c1", offset: -0.3 }],
  {
    id: "install",
    text: "curl -fsSL https://your-console/agent/install.sh | sudo sh -s -- --server wss://your-console/api/agent/connect --token ops_connect_...",
    start: { line: "c1", offset: 0.1 },
    dur: 2.15,
    rhythm: (i) => (i < 66 ? 1 : 0.22),
  },
  ["conn_enter", { line: "c1", at: "end", offset: 0.08 }],
  ["conn_dial", { line: "c2a", offset: -0.05 }],
  ["conn_arrive", { line: "c2a", at: "end", offset: 0.1 }],
  ["no_ssh_in", { line: "c2b", offset: -0.05 }],
  ["no_ssh_strike", { line: "c2b", word: "keys." }],
  ["no_port_in", { line: "c2b", word: "No", nth: 1, offset: -0.05 }],
  ["no_port_strike", { line: "c2b", word: "ports." }],
  ["chip_click", { line: "c2b", at: "end", offset: 0.45 }],
  ["menu_open", { ev: "chip_click", offset: 0.12 }],
  ["chip_select", { ev: "chip_click", offset: 1.0 }],

  /* ---------- WATCH (the light-theme morning) ---------- */
  ["tasks_move", { line: "w1", offset: -0.25 }],
  ["tasks_click", { line: "w1", word: "it", offset: 0.05 }],
  ["tasks_open", { ev: "tasks_click", offset: 0.08 }],
  ["wt_focus", { line: "w1", word: "keep", offset: -0.1 }],
  { id: "t1", text: "Check the disks every morning", fromLine: "w2" },
  ["t1_send", { line: "w2", at: "end", offset: 0.1 }],
  ["t1_ask", { ev: "t1_send", offset: 0.1 }],
  ["t1_chip", { line: "w2", at: "end", offset: 0.5 }],
  { id: "t2", text: "Tell me if the nginx config changes", fromLine: "w3" },
  ["t2_send", { line: "w3", at: "end", offset: 0.1 }],
  ["t2_ask", { ev: "t2_send", offset: 0.1 }],
  ["t2_chip", { line: "w3", at: "end", offset: 0.5 }],
  { id: "t3", text: "Look into it if memory passes 90 percent", fromLine: "w4" },
  ["t3_send", { line: "w4", at: "end", offset: 0.1 }],
  ["t3_ask", { ev: "t3_send", offset: 0.1 }],
  ["t3_chip", { line: "w4", at: "end", offset: 0.5 }],
  ["task_wake", { line: "w5", word: "up", offset: 0.12 }],
  ["row_move", { line: "w5", word: "on", offset: 0.0 }],
  ["row_click", { line: "w5", word: "investigates,", offset: -0.1 }],
  ["task_chat_in", { ev: "row_click", offset: 0.14 }],
  ["tk_pill1_in", { ev: "task_chat_in", offset: 0.4 }],
  ["tk_pill1_done", { ev: "tk_pill1_in", offset: 0.5 }],
  ["tk_pill2_in", { ev: "tk_pill1_done", offset: 0.1 }],
  ["tk_pill2_done", { ev: "tk_pill2_in", offset: 0.5 }],
  ["task_report", { ev: "tk_pill2_done", offset: 0.05 }],
  ["tk_card_in", { line: "w6", word: "change", offset: -0.35 }],
  ["tk_waiting", { line: "w6", word: "waits", offset: 0.0 }],

  /* ---------- COMMAND MODE ---------- */
  { id: "cmd", text: "!systemctl status nginx", start: { line: "b1", word: "exclamation" }, dur: 1.45, rhythm: (i) => (i === 1 ? 6 : 0.6) },
  ["cmd_enter", { line: "b2", word: "runs", offset: 0.1 }],
  ["cmd_pill_in", { ev: "cmd_enter", offset: 0.12 }],
  ["cmd_pill_done", { ev: "cmd_pill_in", offset: 0.6 }],
  ["cmd_read", { line: "b2", word: "agent", offset: -0.1 }],
  ["cmd_reply", { line: "b2", word: "result.", offset: -0.05 }],

  /* ---------- OWN IT ---------- */
  ["own_a_head", { line: "s1a", word: "open", offset: -0.25 }],
  ["own_a_card", { line: "s1a", offset: -0.15 }],
  ["own_b_head", { line: "s1b", word: "Self-host", offset: -0.1 }],
  ["own_b_card", { line: "s1b", word: "Self-host", offset: -0.25 }],
  { id: "host", text: "curl -fsSL https://devbash1.github.io/opsmira/install.sh | sh", start: { line: "s1b", word: "Self-host", offset: 0.15 }, dur: 1.9 },
  ["host_tags", { line: "s1b", word: "command.", offset: -0.1 }],
  ["own_c_head", { line: "s2a", offset: -0.1 }],
  ["own_c_card", { line: "s2a", offset: -0.2 }],
  ["model_scan", { line: "s2a", word: "any" }],
  ["own_d_head", { line: "s2b", offset: -0.1 }],
  ["own_d_card", { line: "s2b", offset: -0.2 }],
  ["keys_type", { line: "s2b", word: "your", nth: 1 }],
  /* two cards after the last spoken line, with no voice-over: other AI agents (MCP), and Opsmira upgrading itself */
  ["own_e_head", { ev: "own_d_card", offset: 3.8 }],
  ["own_e_card", { ev: "own_e_head", offset: 0.1 }],
  ["own_f_head", { ev: "own_e_card", offset: 4.2 }],
  ["own_f_card", { ev: "own_f_head", offset: 0.1 }],

  /* ---------- END CARD ---------- */
  ["end_mark", { line: "e1", offset: -0.22 }],
  ["end_glow", { line: "e1", word: "words." }],
  { id: "endcmd", text: "curl -fsSL https://devbash1.github.io/opsmira/install.sh | sh", start: { line: "e1", at: "end", offset: -0.15 }, dur: 1.7 },
  ["end_cmd_start", { ev: "endcmd_start" }],
  ["end_url", { ev: "endcmd_end", offset: 0.2 }],
  /* the end card holds about 8.6 s after its cut (CUT.end is own_f_card + 3.8), so the install command
     and the repository line sit on screen for about 2.8 s after they finish drawing */
  ["end_hold", { ev: "own_f_card", offset: 12.0 }],

  /* scene cuts as events, so sound can hang on them (last, so a cut may hang on any event above) */
  ...Object.entries(CUT).map(([id, anchor]) => [`cut_${id}`, anchor]),
];
export const typing = [];

/* =====================================================================================================================
 * SOUND. Every cue hangs on an event above (so it is on the exact frame the picture does it) and plays a file from
 * public/sfx (Mixkit recordings fitted by scripts/audio/fetch_sounds.py). `gain` is in dB relative to the file;
 * `rate` shifts pitch; whooshes are placed so their peak lands on the middle of the transition they belong to.
 * ================================================================================================================== */
const KEYS = ["key_a", "key_b", "key_c", "key_d"];
const keys = (id, o = {}) => ({ typing: id, pool: KEYS, space: "key_space", gain: -21, ...o });
const cue = (ev, file, gain, o = {}) => ({ at: { ev, offset: o.offset ?? 0 }, file, gain, rate: o.rate, pan: o.pan ?? 0, name: o.name ?? `${file} @ ${ev}` });
/** A pill appears (soft tick), then finishes (a small step up). */
const pill = (id, i = 0) => [
  cue(`${id}_in`, "tick", -17, { offset: 0.03, rate: [1, 0.94, 1.07, 1.12][i % 4] }),
  cue(`${id}_done`, "tick_up", -18, { offset: 0.0, rate: [1, 1.05, 0.96, 1.1][i % 4] }),
];

export const sfx = [
  /* ---------- HOOK: noise, a slam, a held breath ---------- */
  { at: { t: 0 }, file: "chatter", gain: -13, name: "log chatter" },
  { at: { t: 0 }, file: "drone", gain: -20, name: "tension" },
  cue("hook_err_in", "impact", -9.5, { name: "error slam" }),
  cue("hook_card_in", "glass_in", -16, { offset: 0.02, name: "command card" }),
  keys("hook_cmd", { every: 2, gain: -20 }),
  cue("cut_ask", "exhale", -17, { offset: -0.55, name: "exhale" }),
  cue("cut_ask", "whoosh_c", -14, { offset: -0.5, name: "cut: ask" }),

  /* ---------- ASK ---------- */
  cue("ask_hero_in", "glass_in", -16, { name: "hero in" }),
  cue("ask_mark_in", "ping_soft", -14, { offset: 0.02, name: "the mark" }),
  cue("ask_mark_out", "whoosh_small", -20, { offset: -0.1, name: "mark to composer" }),
  keys("q1"),
  cue("ask_send", "click", -12, { offset: -0.05, name: "send" }),
  cue("ask_line", "pop", -19, { name: "your message" }),
  ...pill("pill1", 0),
  ...pill("pill2", 1),
  ...pill("pill3", 2),
  cue("surf_in", "glass_in", -14, { name: "live surface in" }),
  cue("surf_in", "gauge", -13, { offset: 0.73, name: "gauge fills" }),
  cue("surf_live", "tick", -15, { name: "live tick" }),
  cue("surf_live", "audit_tick", -17, { offset: 0.13, name: "number moves" }),
  cue("act_press", "click", -13, { offset: -0.05, name: "action click" }),
  cue("ask2_in", "pop", -19, { name: "your message 2" }),
  ...pill("pill4", 3),
  cue("card_in", "glass_in", -13, { name: "approval card" }),
  cue("card_risk", "risk_ticks", -16, { name: "risk bar" }),
  cue("card_cmd", "tick_up", -18, { name: "exact command" }),
  cue("card_btn", "pop", -18, { name: "deny / approve" }),
  cue("appr_press", "approve", -9, { offset: -0.05, name: "APPROVE" }),
  cue("appr_done", "tick_up", -14, { name: "approved" }),
  cue("flow_go", "whoosh_small", -20, { name: "into the audit log" }),
  cue("audit_click", "click", -13, { offset: -0.05, name: "activity click" }),
  cue("audit_open", "glass_in", -15, { name: "activity opens" }),
  cue("audit_row", "audit_tick", -14, { name: "audit row" }),

  /* ---------- CONNECT ---------- */
  cue("cut_connect", "whoosh_b", -16, { offset: -0.32, name: "cut: connect" }),
  cue("conn_term_in", "glass_in", -15, { name: "terminal in" }),
  keys("install", { every: 3, gain: -20 }),
  cue("conn_enter", "key_enter", -12, { name: "enter" }),
  cue("conn_dial", "dial", -12, { name: "the agent dials out" }),
  cue("conn_arrive", "arrive", -12, { name: "it arrives" }),
  cue("no_ssh_in", "pop", -18, { name: "SSH keys" }),
  cue("no_ssh_strike", "strike", -12, { name: "strike" }),
  cue("no_port_in", "pop", -18, { rate: 0.92, name: "open ports" }),
  cue("no_port_strike", "strike", -12, { rate: 0.95, name: "strike" }),
  cue("chip_click", "click", -13, { offset: -0.05, name: "server chip" }),
  cue("menu_open", "pop", -17, { name: "menu" }),
  cue("chip_select", "click", -13, { offset: -0.05, name: "choose edge-eu" }),
  cue("chip_select", "tick_up", -15, { offset: 0.06, name: "selected" }),

  /* ---------- WATCH ---------- */
  cue("cut_watch", "whoosh_a", -16, { offset: -0.36, name: "cut: watch" }),
  cue("tasks_click", "click", -13, { offset: -0.05, name: "Tasks button" }),
  cue("tasks_open", "pop", -17, { name: "Tasks panel" }),
  keys("t1"),
  cue("t1_send", "key_enter", -15, { name: "send" }),
  cue("t1_ask", "pop", -20, { name: "request 1" }),
  cue("t1_chip", "tick_up", -16, { name: "task 1 set up" }),
  keys("t2"),
  cue("t2_send", "key_enter", -15, { name: "send" }),
  cue("t2_ask", "pop", -20, { rate: 1.06, name: "request 2" }),
  cue("t2_chip", "tick_up", -16, { rate: 1.06, name: "task 2 set up" }),
  keys("t3"),
  cue("t3_send", "key_enter", -15, { name: "send" }),
  cue("t3_ask", "pop", -20, { rate: 0.94, name: "request 3" }),
  cue("t3_chip", "tick_up", -16, { rate: 1.12, name: "task 3 set up" }),
  cue("task_wake", "wake", -12, { name: "it wakes up" }),
  cue("row_click", "click", -13, { offset: -0.05, name: "open the task" }),
  cue("task_chat_in", "whoosh_small", -20, { name: "its own chat" }),
  ...["tk_pill1", "tk_pill2"].flatMap((id, i) => pill(id, i)),
  cue("task_report", "glass_in", -15, { name: "report" }),
  cue("tk_card_in", "glass_in", -14, { name: "approval waits" }),
  cue("tk_waiting", "ping_soft", -13, { rate: 0.84, name: "something waits" }),

  /* ---------- COMMAND ---------- */
  cue("cut_command", "whoosh_b", -16, { offset: -0.32, name: "cut: command" }),
  cue("cmd_start", "pop", -16, { offset: 0.02, rate: 1.25, name: "command mode" }),
  keys("cmd"),
  cue("cmd_enter", "key_enter", -12, { name: "enter" }),
  ...pill("cmd_pill", 0),
  cue("cmd_reply", "glass_in", -15, { name: "agent reads it" }),

  /* ---------- OWN ---------- */
  cue("cut_own", "whoosh_c", -14, { offset: -0.5, name: "cut: own" }),
  cue("own_a_card", "glass_in", -16, { name: "licence card" }),
  cue("own_a_head", "whoosh_small", -20, { name: "Open source." }),
  cue("own_b_card", "glass_in", -16, { name: "host card" }),
  cue("own_b_head", "whoosh_small", -20, { rate: 1.1, name: "Self-host it." }),
  keys("host", { every: 2, gain: -20 }),
  cue("host_tags", "pop", -19, { name: "tag 1" }),
  cue("host_tags", "pop", -19, { offset: 0.167, rate: 1.1, name: "tag 2" }),
  cue("host_tags", "pop", -19, { offset: 0.333, rate: 1.2, name: "tag 3" }),
  cue("own_c_card", "glass_in", -16, { name: "models card" }),
  cue("own_c_head", "whoosh_small", -20, { rate: 0.95, name: "Any model." }),
  ...[0, 0.494, 0.619, 0.715, 0.841].map((o, i) => cue("model_scan", "tick", -19, { offset: o, rate: 0.9 + i * 0.07, name: `model ${i + 1}` })),
  cue("own_d_card", "glass_in", -16, { name: "keys card" }),
  cue("own_d_head", "whoosh_small", -20, { rate: 1.05, name: "Your servers. Your keys." }),
  ...Array.from({ length: 12 }, (_, k) => cue("keys_type", KEYS[k % 4], -24, { offset: k * 0.1, name: `key ${k + 1}` })),
  /* the two silent cards: other AI agents, then the detached upgrade */
  cue("own_e_card", "glass_in", -16, { name: "agents card" }),
  cue("own_e_head", "whoosh_small", -20, { rate: 1.08, name: "Your other agents." }),
  cue("own_e_card", "tick", -18, { offset: 0.27, name: "Claude is asking" }),
  cue("own_e_card", "pop", -19, { offset: 0.67, name: "its question" }),
  cue("own_e_card", "tick_up", -18, { offset: 1.13, name: "uname -s" }),
  cue("own_e_card", "glass_in", -15, { offset: 1.53, name: "the reply" }),
  cue("own_f_card", "glass_in", -16, { name: "upgrade card" }),
  cue("own_f_head", "whoosh_small", -20, { rate: 0.98, name: "Upgrade itself." }),
  cue("own_f_card", "tick", -18, { offset: 0.27, name: "detached" }),
  cue("own_f_card", "tick_up", -18, { offset: 0.87, name: "restarting" }),
  cue("own_f_card", "tick_up", -15, { offset: 1.53, name: "updated" }),
  cue("own_f_card", "glass_in", -15, { offset: 2.0, name: "the report" }),

  /* ---------- END ---------- */
  cue("cut_end", "bloom_low", -21, { offset: -0.4, name: "cut: end (bloom)" }),
  cue("cut_end", "whoosh_a", -17, { offset: -0.36, name: "cut: end" }),
  cue("end_mark", "mark_draw", -11, { name: "the mark draws" }),
  { at: { line: "e1", at: "end", offset: -0.12 }, file: "chime", gain: -11, name: "end chime" },
  keys("endcmd", { every: 2, gain: -23 }),
  cue("end_url", "tick_up", -16, { name: "the address" }),
];

/** The music bed: a Mixkit track (scripts/audio/fetch_sounds.py) that comes in on the cut out of the hook. Its level is
 * set in loudness units before it ducks under the voice. `npm run audio -- --music music/mixkit-<id>.wav` tries another. */
export const music = { file: "music/mixkit-726.wav", at: "cut_ask", fadeIn: 0.04, lufs: -24, duckDb: -8, attack: 0.12, release: 0.9, fadeOut: 2.2 };

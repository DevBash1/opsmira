# Opsmira launch film: storyboard

96.7 s, 1920x1080, 30 fps, one stereo mix. English voice-over (AI voice, see README), synthesised sound design, a quiet harmonic bed.
Everything on screen is a recreation of the real product with invented machines and data. Nothing was captured from a running system.

## The story in one breath

A server runs out of disk and you half-remember the command that fixes it. There is a calmer way: ask in plain words.
The agent looks (read-only commands run on their own), shows what it found (a live surface), proposes the fix as a card
(what it does, how risky, the exact command), and nothing changes until you approve. Every action lands in the audit log.
Connect a machine with one command: the agent dials out, so no SSH keys and no open ports. Ask it to keep watch: tasks
and triggers wake it up on their own, it investigates, and when a change is needed it waits for you. Prefer to type?
Start a message with `!` and run the command yourself. Open source, self-hosted, any model, your servers, your keys.
Other AI agents can ask it through MCP (and you can watch their turn live), and Opsmira can upgrade itself with the
run detached, coming back on the new build.

## Running order

Times are where the scene's cut falls (the middle of its transition). Frames are at 30 fps.

| # | Scene | Time | Voice-over | On screen | Camera | Transition in |
|---|-------|------|-----------|-----------|--------|---------------|
| 1 | Hook | 0:00 to 0:06.3 | "Something's wrong with the server." "And the fix is a command you only half remember." | A wall of scrolling server logs (web-01, web-02, db-01, edge-eu, api-prod; addresses 203.0.113.x) in warning red. Headline "No space left on device" slams in at 0.1 s. A terminal card types `find / -xdev -type f -size +100M -exec ls -lh {} + \| sort -k5 -h \| tail -n` and stalls. | Slow push, logs drift behind a blur | none (first frame is already full) |
| 2 | Ask | 0:06.3 to 0:32.4 | "There's a calmer way." "Opsmira. Ask in plain words." "It looks, with read-only commands that run on their own." "And it shows you what it found. Live." "Then it proposes the fix: what it does, how risky it is, the exact command." "Nothing changes until you approve." "Every action goes in the audit log." | The console, dark. Hero "Your server. A little more intuitive." then the mark. The question "Why is web-01 running out of disk space?" is typed and sent. Three read-only pills run on their own (`df -h`, `du -xh /var -d 1 ...`, `journalctl --disk-usage`). A live Disk surface (ring, filesystems table, "Read at" time that ticks). "Find reclaimable space" opens a fourth pill and the approval card "Clear apt package cache" (explanation, risk bar Low, `apt-get clean`, Deny / Approve). The cursor approves; the card settles to Approved. The Activity (audit log) panel opens and the new row lands. | 3D stage camera: hero, mark, composer, pull-back, pills, surface, card, approve, audit | Blur-through (the dark window resolves out of the logs) |
| 3 | Connect | 0:32.4 to 0:43.0 | "Connect any server with one command." "The agent dials out." "No SSH keys. No open ports." | A terminal on `edge-eu` (203.0.113.24) types the install command (`curl -fsSL https://your-console/agent/install.sh \| sudo sh -s -- --server wss://your-console/api/agent/connect --token ops_connect_...`). A line dials out from the machine to the console. "SSH keys" and "Open ports" are struck through. The server menu shows web-01, db-01, edge-eu connected, and edge-eu is chosen. | Wide parallax between the terminal and the console, then in on the menu | Whip (streak) |
| 4 | Watch | 0:43.0 to 1:02.0 | "Ask it to keep watch." "Check the disks every morning." "Tell me if the nginx config changes." "Look into it if memory passes ninety percent." "It wakes up on its own, investigates, and leaves you a report." "If a change is needed, it waits for you." | The console, light theme. The Tasks panel is empty, then three requests are typed and each becomes a "Task set up" chip and a row (Morning disk check, Watch nginx config, Memory guard). A warm morning light washes in as the first task wakes. Its own chat opens: the wake-up message, two read-only pills (`df -h`, `journalctl --disk-usage`), a report ("Disks look healthy: / is at 41%..."), then the approval card "Trim the system journal" (`journalctl --vacuum-time=7d`, risk Low) waiting for Approve. A dot on the Tasks icon pings. | Hold on the composer, glide to the Tasks panel, push in on the task's chat and the waiting card | Light sweep (dark to light) |
| 5 | Command | 1:02.0 to 1:09.7 | "Prefer to type it yourself? Start with an exclamation mark." "It runs your command, and the agent reads the result." | Dark again. `!systemctl status nginx` is typed; the composer turns blue with a short "Command" label. Enter: a pill runs the command, the output appears, the agent reads it ("nginx is active and has been running for 5 days. Nothing here needs attention."). | Composer, then pull up to the result | Dark sweep (light to dark) |
| 6 | Own it | 1:09.7 to 1:28.5 | "Opsmira is open source." "Self-host it in one command." "Bring any model." "Your servers, your keys." | Four voiced beats on glass cards: "Open source." with the AGPL-3.0 licence; "Self-host it." with `curl -fsSL https://devbash1.github.io/opsmira/install.sh \| sh` typing and the tags "Docker or systemd" and "127.0.0.1 only"; "Any model." with a model picker (invented models); "Your servers. Your keys." with the server list and a key field. Then two cards with no voice-over (see below): "Your other agents." (MCP) and "Upgrade itself." (a detached run). | Locked shots, each card eases in with a small parallax | Zoom-through |
| 7 | End card | 1:28.5 to 1:36.7 | "Opsmira. Your server, in plain words." | The mark draws in, "Opsmira", the tagline "Your server, in plain words.", the install command typed out, `github.com/DevBash1/opsmira` with "AGPL-3.0 · v0.1 · early software". A glow pulses out of the mark. The finished card is held for about 2.8 s after the command has typed out. | Slow settle | Blur-through with a glow |

### The two cards after the last spoken line (no voice-over)

The film was finished before MCP and detach mode shipped. Both are now shown as two more cards in the Own scene,
after "Your servers. Your keys." and before the end card, **with music only** — the voice-over is cached per line and
the text-to-speech key used to record it was rotated, so no new lines could be recorded. Nothing is said about them;
they are shown, and the pills and wording on them are the console's own:

- **"Your other agents."** — an AI agents (MCP) card: the console's "<client> is asking … WATCH" pill, then the turn it
  opens (Claude's question, the read-only `uname -s` pill, the reply), with "Claude Code", "Claude Desktop" and
  "Cursor" as the clients that connect. The pill and its wording are the console's own (`Console.tsx`).
- **"Upgrade itself."** — an update card: the detached-run pill ("Detached on edge-eu … OPEN"), the console
  restarting under it, the "Opsmira was updated · RELOAD" pill, and the report back in the chat. All three pill
  states are the console's own; the run is approved first and every step lands in Activity.

If new lines are wanted, re-record with a fresh key (`scripts/voice.mjs`), add them to `scripts/beats.mjs` and
`npm run timeline && npm run audio` re-times the film around them.

## Final voice-over script (25 lines, about 61 s of speech)

1. Something's wrong with the server.
2. And the fix is a command you only half remember.
3. There's a calmer way.
4. Opsmira. Ask in plain words.
5. It looks, with read-only commands that run on their own.
6. And it shows you what it found. Live.
7. Then it proposes the fix: what it does, how risky it is, the exact command.
8. Nothing changes until you approve.
9. Every action goes in the audit log.
10. Connect any server with one command.
11. The agent dials out.
12. No SSH keys. No open ports.
13. Ask it to keep watch.
14. Check the disks every morning.
15. Tell me if the nginx config changes.
16. Look into it if memory passes ninety percent.
17. It wakes up on its own, investigates, and leaves you a report.
18. If a change is needed, it waits for you.
19. Prefer to type it yourself? Start with an exclamation mark.
20. It runs your command, and the agent reads the result.
21. Opsmira is open source.
22. Self-host it in one command.
23. Bring any model.
24. Your servers, your keys.
25. Opsmira. Your server, in plain words.

Lines 14 to 16 are also what the user types on screen, word for word, in step with the voice.

## What every claim rests on

Only things the product does today are shown or said. Nothing about notifications, a hosted service, customers, numbers or compliance.

| On screen or said | Where it is true |
|-------------------|------------------|
| "Your server. A little more intuitive." / "Your server, in plain words." | The product's own hero copy and tagline |
| Read-only commands run on their own, as pills | The agent runs read-only commands without asking |
| Live surface with a ticking "Read at" time | Surfaces are live views of command output |
| Approval card: title, explanation, risk, exact command, Deny / Approve | The approval card; nothing that changes a machine runs until approved |
| "Every action goes in the audit log" (Activity) | The Activity log lists every command with exit code and time |
| One-command connect, "The agent dials out", no SSH keys, no open ports | The agent connects outward to the console; read-only by default |
| web-01 "Connected. Commands allowed.", db-01 and edge-eu "Connected. Read-only." | The server menu's own wording: a machine is read-only unless it is allowed to run commands |
| "Ask first" in the message box | The approval mode (the other is Full access) |
| Tasks, schedule and trigger rows, "woke you at ... because it is scheduled", the waiting dot | Tasks and triggers that wake the agent |
| `!` prefix, blue border, "Command" label | Command mode |
| "Any model" | Bring your own model |
| Self-host one-liner, Docker or systemd, 127.0.0.1 only | The install script (Docker when present, otherwise systemd; binds to 127.0.0.1) |
| AGPL-3.0, v0.1, early software, github.com/DevBash1/opsmira | The repository |
| "<client> is asking … WATCH" pill, the client's message labelled with its name, the read-only command pill | Watching an MCP client's turn live in the console |
| "Detached on <server> … OPEN", "Opsmira is restarting", "Opsmira was updated · RELOAD" | The detached-run pills; the console follows the run, reloads onto the new build, and the report lands in the chat |

## Invented on purpose

Machines `web-01`, `db-01`, `edge-eu`, `api-prod`; addresses in 203.0.113.0/24; console address `your-console`; model names `lyra-large`, `atlas-mini`, `flux-vision`, `atlas-code`, `lyra-fast`;
all disk numbers, log lines and timestamps. No real host name, address or data from the owner's machines appears anywhere.

## Sound

- Voice: a warm, low, unhurried voice (OpenAI `gpt-4o-mini-tts`, voice "cedar", with a written delivery brief), levelled per clip to the same loudness, high-passed at 80 Hz, lightly compressed.
- Sound effects are all synthesised in `scripts/audio/make_sfx.py` (no samples, no downloads): keyboard ticks with a space bar and an Enter, soft clicks, glass "in" shimmers for panels, a rising gauge sweep, risk-bar ticks, an approval chime, a dial-out tone, strikes for "No SSH keys / No open ports", a wake-up swell, whooshes tuned to each transition, an error slam in the hook, and a D-major arpeggio under the logo.
- Every cue hangs on the same named event the picture uses (`scripts/beats.mjs`), so sound and picture cannot drift apart.
- A harmonic bed of stacked fifths (D, B, A, G roots) enters with the calm after the hook, lifts for the end card and is ducked 5 dB under every spoken word.
- Mix: integrated loudness -16 LUFS, true peak below -1.5 dBTP, voice about 8 LU above the effects.

## Differences from the brief

- The `theme` prop was dropped. The film uses a dark theme for the product scenes and a light one for the Watch scene by design, so a global switch had no meaning.
- 9:16 and 1:1 variants were not made (optional in the brief); the layout is built for 16:9.

# Opsmira — Build Plan

Rebuild the Opsmira marketing design from `opsmira.pen` as a real website.

**Scope:** Landing page, Pricing page, and the `/app` console (all 30 scenario screens).
**Source of truth:** `.pen` frames `lRhoX` (landing, 1440×4780), `B1Ycbq` (pricing, 1440×3765), and `bi8Au`…`SAnsr` (console scenarios 01–30, light + dark).

**Status: ✅ built + verified (desktop, tablet, mobile).** Marketing pages are implemented and compared side by side against the pen frames; the console is built and verified end-to-end (login, live inspect → scene, proposal → approve/decline → auto-continued reply). Responsive + motion pass at 390 / 768 / 1440 widths: no horizontal overflow, scroll-reveals fire, reduced-motion respected. Run `npm run dev` → `http://localhost:5173/` (landing), `/pricing`, `/app`.

## Stack
- React 19 + TypeScript + Vite
- Tailwind CSS v4 (`@tailwindcss/vite`, `@import "tailwindcss"`)
- Fonts via Google Fonts `<link>`: **Space Grotesk** (display/headings), **Inter** (body), **IBM Plex Mono** (code/terminal)
- Icons as inline SVG (lucide-style strokes), matching the pen icons
- No image assets in the design — everything is shapes, type, and icons

## Design tokens
15 theme-aware color variables from the pen file, mapped to CSS custom properties:

| Token | Light | Dark |
|---|---|---|
| canvas | #F8F9F7 | #111614 |
| ink | #202B26 | #E9EEE9 |
| muted | #66746C | #96A59B |
| line | #DDE4DE | #2C3730 |
| surface | #FFFFFF | #1A211D |
| accent | #337B58 | #91CDAA |
| soft | #EBF2EC | #23372B |
| accent-2 | #2E8C8A | #7FD6CF |
| accent-strong | #1F5E40 | #B5EFCB |
| glow / glow-2 | rgba greens | rgba greens |
| glass | #FFFFFFCC | #1A211DB3 |
| raised | #FFFFFF | #1F2823 |
| shadow | #1F3A2A1F | #00000080 |
| hairline | #20302814 | #FFFFFF14 |

Light values live on `:root`; dark sections (Safety, Final CTA, Pro plan card) wrap content in a `.theme-dark` scope that redefines the same variables — mirroring the pen `theme: {mode}` mechanism.

## Phases

### 1. Scaffold + tokens
- Vite + React + TS project, Tailwind v4 wired
- Font links, token CSS (light + dark scopes), helper utilities

### 2. Landing page (build order = design order)
1. **Nav** — wordmark, links (How it works / Safety / Pricing / Docs), Sign in, "Get Opsmira" button
2. **Hero** — backdrop glow/rings, eyebrow pill, 96px headline "Your server, in plain words.", subcopy, CTAs, trust line, then the **product window mockup** (live banner, response intro, latency chart, stat tiles, disk breakdown, floating approval card)
3. **Trust strip** — platform chips: Docker · Ubuntu · Hetzner · DigitalOcean · Bare metal · Raspberry Pi
4. **How it works** — header "Ask. Watch. Approve." + 3 steps with visuals
5. **Safety** (dark) — "You hold the keys. Always." + evidence list / logs
6. **Ask anything** — header + 3 rows of suggestion chips
7. **Final CTA** (dark) — "Meet your server properly.", install command, buttons + footer

### 3. Pricing page
1. Hero, 2. Plans (Hobby $0 / Pro $15 dark / Team $39), 3. Enterprise strip, 4. Comparison table, 5. FAQ, 6. CTA + footer

### 4. Verification loop (per section, not at the end)
- Run dev server; load it in the pen.dev integrated browser
- Screenshot the build and compare against pen frame screenshots side by side
- Fix spacing, type, color drift immediately; verify no console errors
- Final pass: full-page screenshots of both pages vs the pen frames

## File layout (as built)
```
src/
  main.tsx, App.tsx           # page switch: / and /pricing, hash scroll
  index.css                   # 15 tokens (light + .theme-dark), font utilities
  components/
    Nav.tsx, Footer.tsx, FinalCta.tsx
    Buttons.tsx               # PrimaryButton / SecondaryButton / NavCta / SolidButton
    Reveal.tsx                # scroll-reveal wrapper + useInView hook
    Icons.tsx                 # 30 icons, currentColor, geometry from the pen export
    LiveBanner.tsx, ApprovalCard.tsx, AuditTrailCard.tsx
    ProductWindow.tsx         # hero app mockup
    sections/ HeroCopy.tsx, HeroBackdrop.tsx, TrustStrip.tsx,
              HowItWorks.tsx, Safety.tsx, AskAnything.tsx
  pages/
    Landing.tsx, Pricing.tsx
```
Routing: simple in-app switch (landing `/`, pricing `/pricing`) — no router dependency needed unless scope grows.

## Motion & responsiveness
- **Layout**: the pen frame is a fixed 1440px artboard; the build is fluid with padding steps (`base → md 768 → lg 1024 → xl 1280`) and content centered at `max-w-[1440px]`. Verified at 390 / 768 / 1440: no horizontal overflow, comparison table scrolls horizontally on small screens, nav collapses to a hamburger menu (backdrop + Escape to close).
- **Motion (subtle & functional)** — CSS only (Tailwind v4 `@theme` + `@keyframes` in `index.css`, no animation library):
  - Hover/press transitions on buttons and chips (150–300ms ease-out, 1px lift, `active:scale` press)
  - Scroll-reveal fade/rise via `Reveal` + `IntersectionObserver` (once, staggered 60–240ms delays)
  - Live indicators: blinking caret, pulsing status dots, spinning loader icons
  - Latency bars grow in (`bar-grow`, 25ms stagger) when the product window scrolls into view
  - Chip-wall marquee: 3 rows drifting left/right (85–100s loops), pauses on hover and while the section is off screen
  - Text writers: the prompt chip, the window headline and the "Why is my disk full" prompt type themselves out (`Typewriter`, on scroll-into-view, full text instantly under reduced motion)
  - Ambient backdrop motion: hero/safety/CTA rings "breathe" (`ring-breathe`, 16–26s), glows drift (`glow-drift`), status dots pulse + float, the footer and CTA orbit icons rotate slowly
  - Floating elements idle-lift (`FloatingApproval` card, CTA orb); skeleton lines shimmer; plan and stage cards pop in (`Reveal pop`) and lift on hover
  - Every interactive element carries `cursor-pointer` (chips, prompt suggestions, send button, buttons)
  - FAQ accordion animates open/closed (`grid-rows-[0fr→1fr]`); page switch crossfades
- **Polish pass (motion)**:
  - Transition-property fix: Tailwind v4 moves `translate-*`/`scale-*`/`rotate-*` onto the standalone `translate`/`scale`/`rotate` CSS properties, so `transition-[…transform…]` silently skipped them (hover lifts, press-scales and reveal rises snapped). Every arbitrary transition list now names `transform,translate,scale,rotate`; use `transition-transform` or keep that list when adding new ones.
  - One shared curve: `--ease-enter` / `--ease-move` in `@theme` (`ease-enter`, `ease-move`); `Reveal` uses it at 600ms with inline `transitionDelay`. Press feedback shortens to 120ms (`active:duration-[120ms]`).
  - Hero headline lines rise out of masks (`HeadlineLines`, `line-up` keyframe); product window settles with a perspective tilt (`Reveal tilt`).
  - `StickyNav`: scroll-progress hairline (written straight to `transform`, no re-render) + compact glass nav that drops in after 520px of scroll; nav links get a sliding underline.
  - Mobile menu stays mounted and transitions open/close (retargets mid-flight; `inert` when closed).
  - Staggered reveals for the trust strip and Safety copy/rows; disk-usage segments grow in from the left; primary button gets a hover shine sweep; pricing Monthly/Yearly thumb glides (measured, `ease-move`); FAQ icon rotates and the answer fades.
  - Ambient loops pause off screen: `usePauseOffscreen` sets `data-paused` on the hero, Safety and Final CTA, and `index.css` pauses every animation inside.
  - Global `:focus-visible` accent ring and `::selection` colour.
- **Apple / Safari pass** (code-audited and checked in Chromium only; WebKit was not available to test):
  - `index.html`: `viewport-fit=cover` + `theme-color`; safe-area insets on the app root and the sticky nav; `min-h-dvh` instead of `min-h-screen`.
  - Press feedback: a no-op `touchstart` listener in `main.tsx` (iOS only applies `:active` once one exists); `touch-action: manipulation`, `-webkit-touch-callout: none`, font smoothing.
  - WebKit rendering: `isolate` on the rounded, `overflow-hidden` cards with animated children (product window, Safety, Final CTA); `Reveal tilt` drops its 3D transform once settled (Safari mis-renders `backdrop-filter` inside one); `.hide-scrollbar` also hides the WebKit scrollbar.
  - Already fine: all `backdrop-filter` rules ship with `-webkit-`, and `hover:` utilities sit inside `@media (hover:hover)`.
  - Known: outlines on rounded boxes (the design's 1px borders) only follow the radius from Safari 16.4 / iOS 16.4.
- **Functional upgrades**: Monthly/Yearly toggle swaps real amounts ($19↔$15, $49↔$39 + "billed yearly"), all 5 FAQ answers wired to an accessible accordion (`aria-expanded`), install command has copy-to-clipboard, all placeholder links no-op.
- **Reduced motion**: `prefers-reduced-motion: reduce` collapses animations/transitions to 0.01ms and content stays visible at rest (verified via CDP media emulation).

## Self-hosted app (v1)
The real product, not a mock: a chat console at `/app` where natural-language requests turn into inspected server state and approved shell commands, running entirely on the box it's installed on.

- **`server/`** — Express (ESM), separate `package.json`. `src/env.js` loads `server/.env` (gitignored) and generates+persists an `OPSMIRA_PASSWORD` on first boot if one isn't set, printing it once. `src/auth.js` is a single-admin HMAC-signed cookie session (no user table — v1 is one operator). `src/exec.js` runs commands via `spawn('/bin/sh', …)` with a 30s timeout, 64KB output cap, and an env stripped of `OPENROUTER_*`/`OPSMIRA_PASSWORD` so the model can't read its own secrets back. `src/ai.js` talks to OpenRouter (`openai` npm client, OpenAI-compatible) with three tools: `inspect` (read-only, allow-listed first-word classifier, runs immediately), `propose_action` (anything else — returns a card, never executes on its own), and `show_surface` (opens any of the 30 console surfaces by id, no execution). `src/store.js` appends every run to `server/data/audit.jsonl`.
- **Ask → Watch → Approve, for real**: `POST /api/chat` streams SSE status/tool/scene/proposal/message events; the frontend renders them live (inspect output inline, derived scenario panels, permission/destructive surfaces, `ConsoleApprovalCard` for ordinary proposals). `POST /api/approve` / `/api/decline` execute or skip, log to the audit trail, and return the agent's follow-up events so the same turn closes with a real result instead of going silent.
- **Frontend**: `src/pages/Console.tsx` + `src/lib/console-api.ts` + `src/components/ConsoleHeader.tsx` + `src/components/ConsoleIdle.tsx` + `src/components/ConsoleApprovalCard.tsx` — new, data-driven, routed at `/app` in `App.tsx`'s page switch, bypassing the marketing chrome entirely. (The landing page's `ApprovalCard`/`AuditTrailCard` are untouched static demos — not reused.)
- **Design source**: the first pass (above) was an original layout, not matched to any frame — the .pen file (`/home/bash/.pencil/documents/2db6f225-83f5-47d3-8506-ade25a1404e8/opsmira.pen`) turned out to already contain a full console design: 30 scenario screens (`01 · Live memory — Light` … `30 · Connection interrupted — Dark`, ids `bi8Au`…`SAnsr`) plus a 6-part component library frame `Opsmira · Live UI components` (`JDyGB`: Agent activity, Metrics, Data display, Charts, Actions & approvals, Layout & states). The console was rebuilt against these frames. Reused directly: the token names (`$glass`/`$accent`/`$soft`/`$ink`/`$muted`/`$line`/`$hairline`/`$canvas`) are identical to `index.css`'s existing variables — no new palette needed.
  - `ConsoleHeader` matches the "Quiet workspace header" shell (orbit mark, "Opsmira / Personal workspace", `production` pill, glass blur, bottom hairline).
  - `ConsoleIdle` matches "03 · Open canvas — Ready": concentric orbit rings with a gradient core + two floating satellite dots, "Connected to production" pill, the two-line headline ("Your server." / gradient "A little more intuitive."), and the four suggestion chips (now wired to send a message on click).
  - `ConsoleApprovalCard` matches "05 · Actions & approvals"' pending/approved/denied card spec (344px-ish card, pad 20, gap 16, radius 16, `$accent` stroke only while pending, `$line` once resolved) and adds a `High`-risk variant matching the component library's "Confirm/Destructive bar" (full-width bar, `$ink` stroke and fill, no red anywhere in the palette — the design's "serious" action color is near-black, not red).
  - Tool calls render as the design's "Tool activity line" pill (icon + command + elapsed), expandable to a dark `.theme-dark`-scoped terminal panel for output, instead of inline `$ command` text blocks.
  - The input dock matches "Persistent input dock": centered 800px glass card, 16px placeholder, toolbar row with the connected-server context + a circular accent-gradient send button, and the safety note below it.
  - The ambient background (blurred glow circles + thin orbit rings in the corner) reuses the landing page's existing `rounded-full border` ring technique rather than replicating the .pen file's gradient-arc rings exactly.
- **All 30 scenario surfaces built + wired**: every screen from the .pen file is a real React component under `src/components/console/scenes/` — `DiagnosticScenes` (01, 02, 04–08, 16, 22, 23), `InfraScenes` (09–12, 17–21, 24), `WorkflowScenes` (13–15, 25, 28, 29), `StateScenes` (03, 26, 27, 30) — sharing `src/components/console/SceneKit.tsx` primitives (Panel, SceneIntro, StatRow, Tag/Status/Dot, Ring, Bars, StackedBar, Table, LogPanel, CodePanel, Steps, ListPanel, Timeline, Notice, Action, SceneFooter, LiveMeta, KeyValue). `scenes/index.tsx` holds the 30-item registry (`SceneId`, `SCENES`, `sceneMeta`) and the `SceneView` dispatcher.
  - **In the console:** the utility-row **Surfaces** drawer lists all 30 (grouped, numbered, 6 marked LIVE) and opens a preview pane labelled "PREVIEW · design data"; the agent renders relevant surfaces inline, either derived from an inspection or selected with the `show_surface` tool.
  - **Live-derived from real inspections:** `server/src/views.js` parses successful `free -h`, `df -h`, `ps aux`, `docker ps`, `journalctl` / `tail` / `cat /var/log` output and emits `{type:"scene", scene, data:{live:true,…}}`; the console merges it into the turn. Covers memory (01), disk (05), processes (07), logs (08), container inventory (16), file explorer (22) with real values, percentages and rows.
  - **Live states:** the idle canvas (03), elevated-permission surface (26) for pending `sudo` proposals, destructive typed-confirmation surface (27) whenever a proposal carries a `confirmPhrase`, and the connection-interrupted surface (30) on a failed fetch, with retry wired back to the original ask. 26/27 use the real proposal title, context, command, risk detail and phrase; approve/decline feed the same server flow as the compact card.
  - **Agent-surfaced on request:** a third tool, `show_surface`, takes one of the 30 ids and emits the same `{type:"scene"}` event, so every surface is dynamically reachable — not just the six with live parsers. The model is instructed to prefer `inspect` for memory/disk/processes/logs/containers/files (real data), and to use `show_surface` for the rest (network, TLS, backups, costs, incidents, …). It does not run anything and does not need approval.
  - **Design-data previews:** the remaining scenario surfaces are fully built from the pen copy and reachable in Surfaces or directly by the agent via `show_surface`; they render the same components with the design's sample data when the backend has no matching real structure, and an inline "ILLUSTRATIVE · SAMPLE DATA" tag makes that explicit in a turn.
- **Running it**: `npm run dev` (root) now runs Vite + the server together via `concurrently`; Vite proxies `/api` → `127.0.0.1:8787`. The server binds `127.0.0.1` by default.
- **Verified live** (2026-10-20, Chromium): login gate (with ambient background) → idle "Open canvas" state → suggestion chip / typed request → tool-activity pill → `propose_action` card matching the component-library spec → real `systemctl restart nginx` proposal rendered correctly (left pending, not approved, since nginx isn't installed on the dev box). Earlier in the session also verified end-to-end through Approve: real `df -h` inspect → real low-disk finding → Approve → real `apt-get clean` execution → audit trail updated. The OpenRouter key is copied from another local project (not committed; see `server/.gitignore`); default model `anthropic/claude-sonnet-4.5`, overridable via `OPENROUTER_MODEL`.
- **Single-focus view (no scrollback)**: matching the .pen design's "one workspace, not a chat log" intent — the console now shows only the current turn (ask + tool trail + reply + approval cards). Sending a new message crossfades the old turn out (`--animate-turn-out` in `index.css`) while the new one fades/rises in; the outer page (`h-dvh`, `overflow-hidden`) never scrolls, only the inner turn area does if content runs long. The AI still has the full conversation server-side (`server/src/state.js`'s `conversation` array is untouched) — only the frontend stopped rendering history. Idle state and each piece of a turn (tool pills, reply, approval cards) animate in with a staggered `rise-in`.
- **Temporary OpenRouter model switcher**: a `<select>` next to "View activity", now backed by the live OpenRouter catalog instead of a hardcoded list. `server/src/models.js` fetches `GET {OPENROUTER_BASE_URL}/models` (cached and fails open: 6h TTL, in-flight de-dupe), filters to the ~400 models whose `supported_parameters` include `tools` (this agent is built entirely on function calling — a non-tool-capable model would silently break it), and sorts free models (`:free` suffix or zero pricing) first, then alphabetically within each group. The `<select>` renders them as `<optgroup>`s ("Free" / "Paid"). `POST /api/chat`'s optional `model` field is validated against this same live list server-side. Added to make it easy to swap to a free/cheap model while the shared key's balance is low; not meant to be the permanent model-selection UX.
- **Markdown rendering**: assistant replies render through `src/components/Markdown.tsx` (`react-markdown` + `remark-gfm` for tables/strikethrough/task lists), with every element re-styled to the design tokens instead of the library's defaults — tables get a bordered, horizontally-scrollable wrapper with a `$soft` header row, code blocks reuse the `.theme-dark` terminal panel look, inline code/links/headings/blockquotes all map to `$ink`/`$muted`/`$accent`/`$line`. Error replies stay plain red text (short diagnostic strings, not worth parsing).
- **Long commands no longer blow out the layout**: `ToolActivityLine` trims any command over 64 chars for display (`…`, full command in the `title` tooltip and in the expanded output panel's header) and the pill/containers got `min-w-0`/`truncate` so a long chained shell command can't force horizontal page scroll again.
- **Model choice persists across reloads**: stored in `localStorage` (`opsmira_model`, read/write wrapped in `try/catch`) and re-validated against the live catalog on load, falling back to the server default if the stored id is no longer in the list.
- **Per-tab conversations + New chat**: conversation state is keyed by auth session + a tab id kept in `sessionStorage` (sent as `X-Opsmira-Conversation`; server keys `state.js` maps as `session:tab` with LRU eviction), so tabs no longer share a turn or a pending approval. The console's "New chat" button rotates the tab id and returns to idle. Verified in one Chromium profile with two tabs: the chat probe landed only in tab A's `/api/history`, tab B stayed empty, ids rotated on New chat, and 390px has no overflow.
- **Console polish**: approve/decline failures surface in a small status toast instead of being swallowed; approval cards animate their resolution (outline eases to its resolved colour, resolved footer rises in, badge icon fades) with a stable footer height so nothing jumps; every console control carries `cursor-pointer` (plus `disabled:cursor-not-allowed`).
- **No more silent half-turns**: the agent loop had a habit of ending mid-task (length truncation, tiny token budget, a model that proposes and then waits forever, approval that never reported back). Fixes: `max_tokens` 1024 (`OPSMIRA_MAX_TOKENS` to override); one 402 retry only when ≥120 tokens are affordable; a friendly `code:"credits"` error + `CreditsNotice` in the console; continuation when `finish_reason === "length"`; validated tool arguments with errors fed back to the model; a closing summary when the round cap is reached; a **hard pause after a proposal** (the owner must decide — no open model call left spinning); and approve/decline now **auto-continue the turn**, returning the follow-up events in the JSON response and merging them client-side via the shared `applyEvent`, so the agent verifies the result and reports it. The conversation's last selected model is reused for that continuation (request model wins; `session.lastModel` fallback) so a free-model session doesn't silently fall back to the paid default.
- **Known gaps / not yet built**: server runs as the unprivileged dev user, so anything needing root will visibly fail rather than being blocked proactively; single operator by design — conversations are isolated per tab now, but there's still no per-user history or multi-tenancy (that's v2's hosted dashboard territory); no production build/serve path wired yet (`server/src/index.js` doesn't serve `dist/`); synthetic `[System] …` approval/decline notes are pushed into the conversation as `role: "user"` for model context and filtered out of the rendered turns; proposals don't expire server-side; rendered scenes and tool trails are turn-scoped and not persisted across reloads (history restores the last ask/reply and any pending approvals, not the scene payload); the OpenRouter account behind the shared key is nearly out of credit — the 402 path is friendly and free models work, but top up at openrouter.ai for the default paid model.
- **Verified this pass** (Chromium via CDP, 1440 / 390): all 30 surfaces open from the drawer as previews — 30/30 report `PREVIEW`, with no desktop/mobile horizontal overflow and zero console errors; live free-model turn `free -h` → memory scene 01 → reply; free-model `show_surface(costs)` → cost breakdown surface (labelled illustrative) + reply; 26 renders for a real `sudo systemctl restart nginx` proposal with the actual command; 27 renders a real destructive proposal with a working typed phrase and enables Approve only on an exact match; approval executes (`exit 0`), the continuation runs `cat`/`cat -A` verification and reports back; decline acknowledges and does not run; paid-model request shows the credits notice + Add credits link; `npm run build` + `tsc --noEmit` clean.
- **Surface truthfulness + reply brevity (2026-10-20)**: every live surface now labels itself as a snapshot rather than claiming a refresh it doesn't have (removed "2s refresh" / "Last 30 minutes" from live memory; logs use a neutral Snapshot tag; disk title, root device, free-space badge and used/available percentages are derived; processes hides the hard-coded api-worker story and filters the `ps`/`grep` inspection command out of the top rows; inventory shows only the three columns `docker ps` actually returns, with real up/not-up counts; files is read-only and no longer offers an upload; secrets is masked/read-only instead of offering inert Edit/Rotate). Live log tabs filter the rendered lines. Design-only scenes now carry "Sample data" internally (containers, CPU, network, costs); surfaces leave a muted, inert action when there is no handler, and the destructive preview's input is disabled, so nothing pretends to work. When a surface is shown, the agent's follow-up is capped at two short sentences and stripped of headings/lists/code by `condenseSceneReply`, plus a no-number-restatement prompt and a `console_ui` note; verified with `deepseek/deepseek-v4-pro-0813`: memory → "More than half of memory is used, though plenty remains available since a large share sits in cache. Nothing looks wrong right now." (no bullets, no numeric recap), live logs → Error tab shows only ERROR rows, settings/secrets preview has no fake edits. Docker's daemon is down on this dev box, so the live inventory UI was checked through the `docker ps` parser (total/up/status/3-column contract) rather than a live daemon; the scene is wired for a running daemon.
- **v2 (not built)**: thin proxy-only agent on the user's box, managed/paid through a hosted Opsmira dashboard instead of local `.env` config. Deferred until v1 is validated.

## Console: history, rewind, suggestions, memory
- **Agent style** (`server/src/ai.js`): no em dashes (prompt rule plus a `noDashes` backstop in `text.js` on replies, proposals, suggestions and notes), no repeating what a surface shows, one short sentence, and a "dynamic UI first" rule (plain `free`, `df`, `docker ps`, `ps`, `journalctl`, `ls -l` render surfaces, so no awk/grep piping).
- **`suggest_next`**: 2 to 4 tappable follow-ups under the reply. A reply written alongside only "quiet" tools (`show_surface`, `suggest_next`, `remember`, `forget`) is the turn's reply, so a suggestion costs no extra model round.
- **Memory**: `remember` / `forget` tools, notes in `server/data/memory.json` (max 50, 200 chars, deduped), injected into the system prompt each turn. The turn shows a "Remembered" pill; the Memory sheet in the top bar lists and deletes notes.
- **History**: each conversation is saved to `server/data/conversations/<id>.json` (+ `index.json`) after every turn, keyed by the tab's conversation id (not the login, which changes per boot). The History sheet lists, reopens and deletes them. Reopening rebuilds the latest turn (tool pills, surface, approvals, chips) from the stored messages (`history.js`). Pasted images are not kept on disk (a note replaces them). Only the latest turn is shown, as before.
- **Double Esc** with an empty composer: stops the agent if it is working, removes the last owner message (and everything after it) from the conversation (`POST /api/rewind`), and puts it back in the composer. Changes that already ran are not undone; the hint says so. User messages that open a turn carry `ask: true` (stripped before the model sees them).
- **Artifacts**: titled markdown documents (`save_artifact` / `load_artifact` / `delete_artifact`), stored in `server/data/artifacts/` (max 100, 20k chars, same title updates in place). Only `id: title` lines are injected into the system prompt; the agent calls `load_artifact` when a request relates to one. Saving shows a pill in the turn that opens the Artifacts sheet (list, reader with copy and delete). Bodies are capped by the model's output limit (`OPSMIRA_MAX_TOKENS`, default 1024), so the prompt asks for under about 500 words, and a cut-off call returns a clear error.
- Not verified end to end: the model-driven parts (`remember`, `suggest_next` after a fresh prompt) hit OpenRouter's credit limit during testing; `suggest_next` was confirmed once on a real turn earlier. The authed UI (double Esc, History, Memory sheets) was typechecked but not driven in a browser.

## Known deviations from the pen file
- The pen design defines only a 1440px frame; smaller breakpoints are a reasonable interpretation (stacked sections, hamburger nav, scrollable comparison table where the design has none).
- Decorative clip-path "Orbit rings" are rendered as `rounded-full` borders (stroke widths recovered from the clip paths, e.g. 3.75 / 2.2 / 2.6px).
- Vertical position of the whole page lands within ~2% of the pen frame (line-height normalization differences between pen's text engine and Chrome).
- Two pen-doc nits not reproduced: the fully clipped satellite dot, a sub-pixel bar overhang.

- The pricing Monthly/Yearly thumb transitions `width` as well as `transform` (absolutely positioned, ~13px delta, no sibling reflow; `scaleX` would distort the pill). Intentional: don't "fix" it.
- The sticky nav shows only logo + CTA below `md` (no hamburger); the in-page menu lives in the hero nav.
- The Pro/Team price swap still uses `key={period}` + `rise-in` (a keyframe that restarts on rapid toggling). Left as is.
- Reduced motion for the polish pass is structurally guarded (`motion-reduce:transition-none`, `motion-safe:` keyframes, the global guard) but was not re-emulated; confirm via DevTools → Rendering → `prefers-reduced-motion`.

## Notes
- Match text labels, icons, and spacing exactly from the design.
- Page width: content max-width 1360px (sections) / 1200px (inner), as per frames.
- Dark surfaces (Safety, Final CTA, Pro plan card) use a `.theme-dark` scope class, mirroring the pen `theme: {mode}` mechanism.

## Live surfaces (no sample data)

Surfaces used to render design mock data. Now every surface the agent or the Surfaces menu can open is read from the machine.

- **Server**: `server/src/metrics.js` samples /proc every 5s (CPU, memory, per-interface traffic), keeps 720 samples (1 hour) and persists them to `server/data/metrics.json` so history survives restarts. `server/src/surfaces.js` holds one collector per surface and `collectSurface(id, target)`; a collector that can't read its source returns an "unavailable" result with the reason instead of numbers.
- **Surfaces**: cpu, memory, network, disk, processes, logs (`target` = service), files (`target` = directory), containers (`target` = name), inventory, uptime, jobs, tls (`target` = host[:port]), firewall, cleanup.
- **API**: `GET /api/surfaces` (list, drives the menu), `GET /api/surfaces/:id?target=` (fresh reading). The menu preview fetches live, has Refresh, and polls every 5s for cpu, memory and network.
- **Agent**: `show_surface` takes `scene` (collector ids only) and `target`, runs the collector and shows the result. The reading is stored with the tool message (`view`, never sent to the model) so reopening a chat shows the same data. Chats saved before this have no stored view and show no surface.
- **Client**: `scenes/DiagnosticScenes.tsx` and `scenes/LiveScenes.tsx` render only fields the server sent (no fallbacks); `UnavailableScene` shows the reason and fix. Every button asks the agent something or is absent. The "ILLUSTRATIVE" badge is gone.
- **Unavailable on a typical unprivileged host**: Docker surfaces when the user isn't in the `docker` group, firewall rules (need root; listening ports and ufw on/off still show), TLS when no certs are found locally (give it a host to check).
- **Removed from reach**: deploy, build, rollback, restore, queries, costs, backups, dns, secrets, incident, complete, plus the design-data previews. `InfraScenes.tsx` and `WorkflowScenes.tsx` are no longer imported and can be deleted.

### Surfaces over SSH

Every surface can read another server instead of the one Opsmira runs on.

- `server/src/machine.js`: a machine is `run / readFile / listDir / isDir / home / name / check`. The local one uses the OS, the SSH one runs each call as `ssh -o BatchMode=yes ... host -- '<quoted command>'` with a shared connection (ControlMaster, 90s). BatchMode means it never waits on a password or host-key question, and an unknown host key fails, so only servers already connected to from a terminal on the Opsmira server can be reached. Hosts are validated (`[user@]name[:port]`, no leading dash). Failures map to plain reasons (key refused, host key not trusted, can't resolve, refused, no answer).
- Collectors take a machine, so there is one copy of each. `metrics.js` has one `Sampler` per machine: the local one runs from boot and persists; an SSH one starts on first look (one ssh exec per 5s tick), keeps up to an hour in memory, and stops after 10 idle minutes. Remote history therefore starts when someone first looks.
- Port checks on a remote server run there and report answered or not, without a timing.
- API: `GET /api/surfaces/:id?host=&target=`, `GET /api/hosts` (ssh config entries without wildcards, plus servers that answered before, saved in `data/hosts.json`). `OPSMIRA_SSH_CONFIG` can point at a different ssh config.
- Agent: `show_surface` takes `host`. Readings carry `ssh`, so a refresh keeps reading the same server.
- Client: the Surfaces menu has a Server field (datalist of known hosts).
- Tested with a stand-in `ssh` that runs commands locally (no sshd on this machine) and with real ssh for the failure paths. A real login to a remote server has not been tested.

## Agent-composed views (`show_view`)

The agent can show any data as UI, not only what a built-in surface covers (Kubernetes pods, query results, API output).

- **Tool**: `show_view { title, summary, source, blocks[], actions[] }`. The agent runs `inspect` (over ssh when needed) to get real data, then describes the UI with a closed set of blocks: stats, table, bars, ring, stacked, logs, keyvalues, notice, code, steps. The prompt requires every value to come from output read that turn and has a worked example.
- **Server** (`server/src/view.js`, `normalizeView`): drops unknown block types and fields, caps sizes (16 blocks, 60 rows, 80 bars), coerces numbers, pads short table rows, strips em dashes. The client only ever sees what this emits. Problems are returned to the model (`skipped`, or an error when nothing can be shown) so it can fix its call. Truncated arguments give a clear "fewer rows" error.
- **Client** (`scenes/ComposedScene.tsx`): maps each block to the existing SceneKit parts; unknown types render nothing. The footer states the source and time, plus the agent's buttons and an Update button that asks the agent for fresh data.
- **Not live**: a composed view is a snapshot of what the agent read. Updating it takes a model round. The 14 built-in surfaces remain live and are unchanged.
- History: the shown view is stored on the tool message (`view`), so a reopened chat shows the same view.

- **Tool round limit**: one turn may use up to 30 model calls (was 6; 12 with guidance). Set `OPSMIRA_MAX_ROUNDS` in `server/.env` to change it. Each steering message adds 2 more, up to the limit plus 12. When the limit is hit the agent writes a short summary and the next step.

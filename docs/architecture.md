# Architecture

```
 browser ──HTTP──▶ Express server ──▶ model provider (OpenRouter, OpenAI-compatible)
 (React app)        │
                    ├── agent loop (ai.js): model ⇄ tools
                    ├── machine (machine.js): this server, or another over SSH
                    ├── collectors (surfaces.js): read real data, per machine
                    ├── samplers (metrics.js): CPU, memory, network history
                    └── data dir: chats, memory, artifacts, audit log, trusted hosts
```

## Web app (`src/`)

React 19, Tailwind v4, Vite. The marketing pages and the console are one app. A self-hosted server shows only the console, at `/` (`/app` redirects there); with `OPSMIRA_SITE=1` it serves the marketing pages at `/` and the console at `/app`.
`src/pages/Console.tsx` is the chat. A turn is a list of blocks: tool activity, a scene, the reply,
suggestions. Scenes live in `src/components/console/scenes/`.

- `SceneView` picks a renderer by scene id (`memory`, `disk`, `logs`, `view`, …).
- `LiveSurface` wraps a scene that can refresh: it polls `/api/surfaces/:id` every few seconds for the
  pollable ones and only for data the server collected itself.
- `ComposedScene` draws agent-built views from a closed set of blocks.

## Server (`server/src/`)

| File | Role |
|---|---|
| `index.js` | HTTP routes, login, static files |
| `ai.js` | The agent loop and the tool schema (`inspect`, `propose_action`, `show_surface`, `show_view`, memory, artifacts…) |
| `exec.js` | Runs local commands; classifies read-only versus changing |
| `machine.js` | The `Machine` interface: local, SSH, or a connected agent. Every collector takes one |
| `agents.js` | Agent gateway: one-time tokens, credentials, WebSocket calls to connected servers |
| `surfaces.js` | Collectors: real readings or an "unavailable" result with a reason |
| `metrics.js` | Per-machine samplers (a ring of recent readings) |
| `view.js` | Checks and cleans agent-composed views |
| `views.js` | Turns plain command output into a card (only for plain commands) |
| `store.js`, `state.js`, `history.js` | Persistence: chats, audit log, rewind |
| `env.js` | Settings, the data directory, generated secrets |

### One turn

1. The owner's message goes to the model with the tool list and a system prompt.
2. The model calls tools. `inspect` runs read-only commands. `propose_action` ends the turn with a
   proposal the owner approves or declines. `show_surface`/`show_view` put a visual in the chat.
3. Results go back to the model until it answers, a proposal pauses the turn, or the round limit
   (`OPSMIRA_MAX_ROUNDS`) is reached and the model summarizes.
4. Every approved or declined action is appended to the audit log.

### Rules the code keeps

- Data shown is data read. If a collector cannot read, it returns why, never a placeholder.
- `show_view` needs a `source`, and the UI shows it.
- The agent cannot approve its own proposals. Only the browser session can.
- Nothing in the browser can reach a machine except through the server.

## Adding a surface

1. Write a collector in `surfaces.js`: `(machine, target) => data`, using `machine.run(...)` so it works
   locally and over SSH. Return the shape from `base(machine, extra)`.
2. Register it in `SURFACES`.
3. Add a renderer under `src/components/console/scenes/` and register it in `scenes/index.tsx`.
4. Add a test in `server/test/` if there is parsing involved.

# Detach mode

Some changes take the console down while they run: upgrading the web server or proxy the console is reached
through, restarting the machine it runs on, updating Opsmira itself. A turn that does this from the console
cuts its own connection halfway through (the browser's stream drops, the console stops the reply, the command is
killed). Detach mode hands such a job to the server it is about: a small runner starts there, does the work on its
own with the model, and reports back when the console can hear it again.

It is meant to be rare. Every detached run needs the owner's approval, even with Full access, because it sends
the model key to that server and runs there without anyone watching the console.

## Who can detach

Only servers connected with `opsmira-agent` in **operate** access (the runner runs commands). The runner is
started by the agent, so it runs as the agent's account, with whatever `sudo` that account has.

## The flow

1. The agent in the console calls the `detach` tool with a goal, the plan, why it must run detached, and a time
   limit. The owner sees an approval card (server, goal, plan, budget, "sends your model key to this server").
2. Approved: the console sends the agent `{ type: "detach", id, spec, key, runner }` over its WebSocket. `runner`
   is the runner script's text and its sha256; the agent checks the hash, writes the run directory, installs
   the `opsmira` command and starts the runner in its own session (so it outlives the agent's connection and,
   for installs with `KillMode=process`, an agent restart).
3. The runner works through the goal: model call, run a command, read the output, repeat. It writes every step to
   `log.jsonl`. Between steps it reads messages the owner sent with `opsmira say`, and a stop request.
4. While the console is reachable the agent relays new log entries (`{ type: "detach-log", id, entries }`); when
   it is not, they wait in the log and are sent on reconnect. Every command the runner ran lands in the console's
   audit log (`kind: "act"`, `by: "detached"`).
5. The runner finishes (done, failed, stopped, out of time or steps), deletes the key, and writes `report.json`.
   The agent sends `{ type: "detach-report", id, report }`; the console stores it in the conversation that started
   the run and answers `{ type: "detach-ack", id }`. Then the agent removes the `opsmira` command, and deletes the
   run directory after a grace period (24 h), so the owner can still read the log on the server.

## The run directory

`<agent state dir>/detached/<id>/`, mode 0700, owned by the agent's account.

| File | Written by | What |
|------|------------|------|
| `spec.json` | agent | `{ id, goal, plan, why, server, model, baseUrl, maxSteps, deadline, createdAt, console }` |
| `key` | agent, deleted by runner | The model API key, mode 0600. Removed the moment the run ends. |
| `runner.mjs` | agent | The runner script (verified against the sha256 the console sent). |
| `log.jsonl` | runner | One JSON object per line, append only (below). |
| `inbox/` | `opsmira say` | One file per message: `{ "text": "...", "at": "ISO" }`. The runner deletes each as it reads it. |
| `stop` | `opsmira stop` | Present: finish the current command, then stop. |
| `report.json` | runner | `{ status, summary, at, steps, commands }`, written last. |
| `pid` | runner | Its process id while it runs. |

### `log.jsonl` entries

Every entry has `t` (ISO time) and `type`:

- `start`: `{ goal, model, maxSteps, deadline }`
- `note`: `{ text }`: what the model says it is doing (its reasoning summary or the text of a `say` call)
- `run`: `{ n, command, why }`: a command is about to run (`n` counts commands from 1)
- `result`: `{ n, exitCode, output, durationMs, timedOut }`: output capped at 16 KB in the log
- `user`: `{ text }`: a message from `opsmira say` was handed to the model
- `error`: `{ text }`: a model call or the runner itself failed (it retries model calls 3 times)
- `end`: `{ status, summary }`

`status` is one of `done`, `failed`, `stopped`, `timeout`, `budget`.

## The runner

`agent/opsmira-detached.mjs`, one file, Node 22+, no dependencies.

    node opsmira-detached.mjs run <run dir>     # what the agent starts
    opsmira status | watch | say "<text>" | stop # the owner's command on the server (same file)

The model is called with the OpenAI-compatible chat completions API (`baseUrl` + `/chat/completions`, the key
as a Bearer token), with three tools:

- `run { command, why, timeout? }`: runs `/bin/sh -c command` (timeout default 120 s, at most 3600 s; output capped
  at 64 KB for the model). One at a time.
- `say { text }`: tells the owner something (goes to the log, so `opsmira watch` and the console show it).
- `done { status: "done" | "failed", summary }`: ends the run. The summary is the report the owner reads.

Budgets: `maxSteps` model calls (default 40) and `deadline` (default 30 minutes from the start). Running out ends
the run with `budget` or `timeout` and a summary of what was done so far. The system prompt tells the model that
nobody is watching, that it must check before and after every change, keep backups of anything it edits, prefer
the smallest change that reaches the goal, roll back if the result is worse than the start, and not touch
anything outside the goal.

## The `opsmira` command

The agent puts a readable copy of the runner next to its state file and a small wrapper at `/usr/local/bin/opsmira`
when it can write there (or with `sudo -n`), otherwise at `~/.local/bin/opsmira` of the agent's account
(`OPSMIRA_CLI_PATH` picks the place), and says where in the run's result. Run directories are private to the
agent's account: by default that is the person who installed the agent; otherwise use `sudo opsmira`. It finds the
newest run under the agent's state directory (or `--run <dir>`):

- `opsmira status`: goal, state, steps used, time left, the last few entries
- `opsmira watch`: follows the log as it grows (Ctrl-C to leave; the run keeps going)
- `opsmira say "use port 8443 instead"`: a message the model reads before its next step
- `opsmira stop`: ask the run to stop after the current command

It is removed when the console has the report. While a run has not reported back, the agent also holds off any
update of itself, so a restart cannot cut the run short or lose its report.

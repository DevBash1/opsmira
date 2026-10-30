# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Servers can ask to join: an agent started without a token (or with a used one) shows up under Connect a server
  with its hostname, address and requested access. Accept pairs it; Decline makes it uninstall itself. Requests
  never expire; they are capped and rate limited per address. Install tokens work once and no longer expire.
- Agents update themselves when the console ships a new one: download from the console, sha256 check, test run,
  restart into it, and fall back if it cannot connect. `--no-auto-update` opts out.
- Update check: the console compares its build with GitHub (latest release, or main for `:edge` builds) and shows
  an Update button that asks the AI to update it the right way for how it is installed.
- Detach mode: for changes that take the console down while they run, the AI hands the job to a connected server
  that runs it on its own with the model, logs every step, and reports back into the chat. An `opsmira` command on
  that server follows the run and talks to it (`opsmira watch`, `say`, `stop`). Always approved first; every
  command lands in Activity. See docs/detach.md.
- Command mode: start a message with ! to run a command yourself on the selected server (`!df -h`). It runs as typed,
  shows in the chat like any command, and the agent then answers with the command and its output in front of it.
- Rows, stats and key-value lines in the agent's views and in the live surfaces are clickable: a click asks the
  agent about that item, and hovering shows what it will ask. They look the same and work from the keyboard.
- Tasks: the agent can set up work that happens on its own, by schedule (cron or every 30m) or by trigger (a read-only
  check that wakes it when a file changes, memory passes a line, a service stops...). Each task has its own chat,
  asks before changes unless allowed, and is managed from a new Tasks panel. See docs/tasks.md.
- Chats are named by the model after the first reply, and renamed from the last 10 messages each time another 50
  of your messages have gone by (History shows the title). If the model cannot be reached the first message is used.
- Connecting a server asks first: Linux or Mac, Windows, or a hosted app, and read only or run commands. The
  command shown matches the choice.
- Windows agents: a PowerShell installer (`install.ps1`, a scheduled task that starts at boot) and PowerShell
  command running. Commands there always wait for approval.
- Hosted platforms (Heroku, Railway, Pxxl...): a credential for the app's environment and `--exec`, which runs the
  app under the agent so every deploy reconnects as the same server and its output can be read.

### Fixed
- An agent no longer exits when its console answers the connection with an error (a proxy's 502 while the console
  restarts): Node's WebSocket reports that without a close event, so the agent never retried and quit (systemd hid
  it by restarting the service). It now retries like any other lost connection.
- Re-running the agent installer restarts the agent, so the new version runs at once (it used to keep the old one
  running until the next restart).
- The "connection lost" screen showed made-up servers, routes and paused actions. It now shows when the
  connection dropped, whether the console answers again (checked live), and points to Activity before "Send again".
- Every command and approval card now says where it runs: the connected server's name, or "this server" (or
  "Opsmira container" when a default server is set) for the machine Opsmira is on. Local commands used to show no tag.
- A hosted app's agent no longer hangs after SIGTERM when a child process outlives the app, and no longer drops the
  last output of a crashing app.
- The agent installer no longer picks a snap-packaged Node (it cannot run as a service and crash-looped); it uses
  `--install-node`'s private Node 22 instead.
- A reasoning model that used up its reply budget thinking no longer ends the turn with "I stopped before finishing":
  the round is retried with more room. Tool calls a model writes into its reply as markup are run instead of shown.

### Changed
- The agent installer now runs the agent as the user who ran `sudo` (it used to always use a locked-down
  `opsmira-agent` account that could not read your home directory). A root login still gets `opsmira-agent`;
  `--run-as opsmira-agent` opts out.
- A self-hosted server is now the console at `/` instead of `/app`. Old `/app` links redirect. With
  `OPSMIRA_SITE=1` the marketing pages stay at `/` and the console at `/app`.
- Sign-in now takes a username (default `admin`, set with `OPSMIRA_USERNAME`) and the password, and an address is
  blocked for 10 minutes after 5 failed attempts.

### Added
- A server switcher in the composer, shown once another server is connected. The choice applies to the agent's
  commands and to the surfaces, and is remembered.
- `OPSMIRA_DEFAULT_SERVER` for installs inside a container: commands and surfaces run on that connected server unless
  another is named (`local` means the container itself).
- The agent installer can download a private, checksum-verified Node 22 (`--install-node`, now part of the command the
  console shows) so servers with an older Node can connect without touching the system Node.
- Code in the console (command panels and code blocks in replies) is syntax highlighted and has a copy button.
- Sign out button in the console. Signing out now revokes the session, so a copied cookie stops working.
- An install script (`public/install.sh`): Docker or a native systemd service, asks for the key, prints the
  sign-in details, upgrades by re-running, `--uninstall` to remove.
- A static landing page for GitHub Pages (`npm run build:site`) with no sign-in, pricing or console, and a
  workflow that publishes it once the repository is public. Docker images are now built for amd64 and arm64, and
  `ghcr.io/devbash1/opsmira:edge` follows `main`.
- Reasoning models: their thinking streams live as one line (a brain icon and the latest words) above what they
  did, and opens to the full text. It shares one open slot with command output, and is kept with the chat.
- Connect a server without SSH: `opsmira-agent` (one file, Node 22+) dials out to the console with a one-time
  token. Surfaces work on it as `agent:<name>`. Install it as a service with `agent/install.sh`, or run it once.
  Revoke it from the Surfaces menu.
- Commands on connected servers: with `--access operate` the AI can inspect and propose changes on an agent
  (`server` on `inspect` and `propose_action`), with the usual approvals, audit entries and Stop.
- CLA and sign-in workflow for outside contributions (`CLA.md` is a draft pending legal review). The workflow is switched off until the review is done.

## [0.1.0] - 2026-10-21

First self-hostable release.

### Added
- Console: chat with an agent that inspects servers, proposes changes, and waits for approval.
- Live surfaces for memory, CPU, network, disk, processes, logs, files, containers, services, schedules,
  TLS certificates, firewall exposure and storage cleanup, on this machine or over SSH.
- Agent-composed views (`show_view`) for data no built-in surface covers.
- Memory, artifacts, conversation history, rewind, and an audit log.
- Self-hosting: Docker image, compose file, systemd unit, configurable data directory, persisted secrets,
  and the web app served by the server.

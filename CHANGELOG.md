# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- A reasoning model that used up its reply budget thinking no longer ends the turn with "I stopped before finishing":
  the round is retried with more room. Tool calls a model writes into its reply as markup are run instead of shown.

### Changed
- A self-hosted server is now the console at `/` instead of `/app`. Old `/app` links redirect. With
  `OPSMIRA_SITE=1` the marketing pages stay at `/` and the console at `/app`.
- Sign-in now takes a username (default `admin`, set with `OPSMIRA_USERNAME`) and the password, and an address is
  blocked for 10 minutes after 5 failed attempts.

### Added
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

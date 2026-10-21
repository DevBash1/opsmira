# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Connect a server without SSH: `opsmira-agent` (one file, Node 22+) dials out to the console with a one-time
  token. Surfaces work on it as `agent:<name>`. Install it as a service with `agent/install.sh`, or run it once.
  Revoke it from the Surfaces menu.
- Commands on connected servers: with `--access operate` the AI can inspect and propose changes on an agent
  (`server` on `inspect` and `propose_action`), with the usual approvals, audit entries and Stop.
- CLA and sign-in workflow for outside contributions (`CLA.md` is a draft pending legal review).

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

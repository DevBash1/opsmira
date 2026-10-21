# Roadmap

Rough order, not promises. Open an issue to discuss anything here.

## Self-hosted (this repository)

- [x] v0.1: console, live surfaces, SSH, agent-composed views, audit log, Docker image
- [ ] Multiple users and roles (today: one shared password)
- [ ] Per-host settings: allowed commands, default mode, labels
- [ ] Alerts: notify when a surface crosses a threshold (email, webhook)
- [ ] Composed views that refresh live from a read-only command
- [ ] Plugin surfaces: add a collector without touching core
- [ ] Better offline/"local model" support through any OpenAI-compatible endpoint

## Opsmira Cloud (hosted)

Plan: [docs/hosted-plan.md](docs/hosted-plan.md). Accounts, billing, and a one-line command that connects any
server to your account.

## Project

- [ ] Decide the contributor agreement (CLA) and enable the sign-in bot before accepting outside pull requests
- [ ] Make the repository public

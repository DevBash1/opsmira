<div align="center">

<img src="docs/assets/banner.svg" alt="Opsmira: your server, in plain words" width="100%">

<br>

[![CI](https://github.com/DevBash1/opsmira/actions/workflows/ci.yml/badge.svg)](https://github.com/DevBash1/opsmira/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/DevBash1/opsmira?color=2f8f63&label=release)](https://github.com/DevBash1/opsmira/releases)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-2f8f63)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-20%2B-2f8f63?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/docker-ready-2f8f63?logo=docker&logoColor=white)](docs/self-hosting.md)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-2f8f63)](CONTRIBUTING.md)

**Ask a question about your server. Opsmira looks, shows you what it found, and asks before it changes anything.**

<br>

[![Quick start](https://img.shields.io/badge/%E2%96%B6%20%20Quick%20start-2f8f63?style=for-the-badge)](#quick-start)
[![Self-hosting guide](https://img.shields.io/badge/Self--hosting%20guide-1f7f86?style=for-the-badge)](docs/self-hosting.md)
[![How it works](https://img.shields.io/badge/How%20it%20works-3a4a45?style=for-the-badge)](docs/architecture.md)
[![Roadmap](https://img.shields.io/badge/Roadmap-3a4a45?style=for-the-badge)](ROADMAP.md)

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/shot-hero.webp">
  <img src="docs/assets/shot-hero-light.webp" alt="Opsmira answering &quot;is this server low on memory?&quot; with a live memory gauge, history chart and a plain-language verdict" width="100%">
</picture>

</div>

<br>

> [!NOTE]
> Early software (v0.1). It works and is used daily, but expect rough edges. Anything that changes a machine
> waits for your approval, but read [SECURITY.md](SECURITY.md) before pointing it at something important.

## Why Opsmira

Running a server usually means remembering which command shows what, reading raw output, and hoping a
copied one-liner does what you think. Opsmira puts a conversation in front of that:

- **You ask in plain words.** "Why is the disk filling up?" "Is anything listening that shouldn't be?"
- **It investigates with read-only commands** and shows the answer as live visuals, not a wall of text.
- **It proposes the fix; you decide.** Each change is a card with what it does, how risky it is and the exact
  command. Nothing runs until you press Approve, and every action lands in an audit log.

<div align="center">

<img src="docs/assets/shot-approval.webp" alt="An approval card: Clear apt package cache, risk Low, the exact command apt-get clean, with Deny and Approve buttons" width="72%">

<sub>A proposed change: what it does, how risky it is, the exact command. You approve or deny.</sub>

</div>

## Features

| | |
| --- | --- |
| **Asks, then acts** | Read-only inspections run on their own. Changes are proposals you approve, and everything is audited. A Stop button cancels a turn in flight. |
| **Live surfaces** | Memory, CPU, network, disk, processes, logs, files, containers, services, schedules, TLS certificates, firewall exposure and storage cleanup, read from the real machine. |
| **Any server** | Manage other hosts over SSH, or have a server connect itself with one command: no SSH keys, no open port. [Details](docs/self-hosting.md#connect-a-server-without-ssh-agent). |
| **Agent-composed views** | For data no built-in surface covers, the agent builds a view from stats, tables, charts, logs and key-values, and says where the data came from. |
| **Memory and artifacts** | It remembers facts about your servers and keeps notes you can reopen. |
| **Bring your own model** | Any model on [OpenRouter](https://openrouter.ai), including your own provider keys (BYOK). |
| **Light and dark** | Responsive down to a phone, and it respects reduced motion. |

## Quick start

You need Node 20+ (or Docker) and an [OpenRouter key](https://openrouter.ai/keys).

```bash
git clone https://github.com/DevBash1/opsmira.git && cd opsmira
npm run setup                      # install web and server dependencies
cp .env.example server/.env        # then put your OPENROUTER_API_KEY in it
npm run build
npm start                          # http://127.0.0.1:8787
```

Open `http://127.0.0.1:8787` and sign in. The username is `admin` unless you set `OPSMIRA_USERNAME`; the
password is printed on first start and saved in `server/data/.admin-password` (or set `OPSMIRA_PASSWORD`).

<details>
<summary><b>With Docker</b></summary>

<br>

```bash
cp .env.example .env               # add OPENROUTER_API_KEY
docker compose up -d --build
```

Data lives in the `/data` volume. Tagged releases also publish an image to `ghcr.io/devbash1/opsmira`.

</details>

For HTTPS, running as a service, managing other servers and security advice, read
[docs/self-hosting.md](docs/self-hosting.md).

## Connect another server

Open **Surfaces → Connect a server** and run the command it shows on the machine you want to manage:

```bash
curl -fsSL https://your-console/agent/install.sh | sudo sh -s -- --server wss://your-console/api/agent/connect --token ops_connect_...
```

The agent dials out to your console, so the server needs no inbound port and you hand over no key. It is
**read-only by default**; add `--access operate` to let it run commands you approve. Revoking it from the
console disconnects it immediately.

## How it fits together

```mermaid
flowchart LR
    You([You]) -->|ask| Console[Opsmira console]
    Console <-->|tools| AI[Your model via OpenRouter]
    Console -->|read-only inspect| Local[This server]
    Console -->|SSH| Remote[Other hosts]
    Agent[opsmira-agent] -->|dials out, outbound only| Console
    Console -.->|approved changes only| Local
    Console -.->|approved changes only| Agent
    Console --> Audit[(Audit log)]
```

More in [docs/architecture.md](docs/architecture.md).

## Development

```bash
npm run setup
cp .env.example server/.env
npm run dev                        # web on :5173, server on :8787, both reload on change
npm run check                      # typecheck + server tests
```

Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).
Pull requests need to agree to the [CLA](CLA.md). Changes are tracked in [CHANGELOG.md](CHANGELOG.md).

## Safety

Opsmira runs commands as the user it runs under. Read [SECURITY.md](SECURITY.md) before pointing it at
anything important, and never expose it to the internet without HTTPS.

## License

[AGPL-3.0-only](LICENSE). If you run a modified Opsmira as a service for other people, you must offer them
the source of your changes.

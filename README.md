# Opsmira

**Your server, in plain words.** Opsmira is an AI operator console for the servers you run. Ask a question
("why is the disk filling up?"), and it inspects the machine, shows what it found as live visuals, and
proposes fixes that only run after you approve them. Self-host it on your own infrastructure.

> Status: early (v0.1). It works and is used daily, but expect rough edges. See [ROADMAP.md](ROADMAP.md).

## What it does

- **Asks, then acts.** The agent runs read-only inspections on its own. Anything that changes the machine
  is a *proposal* you approve or decline, and every action lands in an audit log.
- **Live surfaces.** Memory, CPU, network, disk, processes, logs, files, containers, services, schedules,
  TLS certificates, firewall exposure and storage cleanup, read from the real machine, not mock-ups.
- **Any server.** The same surfaces work on another host over SSH, or on one that connects itself with a
  one-line command (no SSH, no open port), where the agent can also run commands you approve.
- **Agent-composed views.** For data no built-in surface covers, the agent builds a view from a small
  set of blocks (stats, tables, charts, logs, key-values) and says where the data came from.
- **Memory and artifacts.** It remembers facts about your servers and keeps notes you can reopen.
- **Bring your own model.** Any model on [OpenRouter](https://openrouter.ai), including your own provider
  keys (BYOK).

## Quick start

You need Node 20+ (or Docker) and an [OpenRouter key](https://openrouter.ai/keys).

```bash
git clone https://github.com/DevBash1/opsmira.git && cd opsmira
npm run setup                      # install web and server dependencies
cp .env.example server/.env        # then put your OPENROUTER_API_KEY in it
npm run build
npm start                          # http://127.0.0.1:8787
```

Open `http://127.0.0.1:8787`. The admin password is printed on first start and saved in
`server/data/.admin-password`.

With Docker:

```bash
cp .env.example .env               # add OPENROUTER_API_KEY
docker compose up -d --build
```

For HTTPS, running as a service, managing other servers, and security advice, read
[docs/self-hosting.md](docs/self-hosting.md).

## Development

```bash
npm run setup
cp .env.example server/.env
npm run dev                        # web on :5173, server on :8787, both reload on change
npm run check                      # typecheck + server tests
```

How it fits together: [docs/architecture.md](docs/architecture.md). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).

## Safety

Opsmira runs commands as the user it runs under. Read [SECURITY.md](SECURITY.md) before pointing it at
anything important, and never expose it to the internet without HTTPS.

## License

[AGPL-3.0-only](LICENSE). If you run a modified Opsmira as a service for other people, you must offer them
the source of your changes.

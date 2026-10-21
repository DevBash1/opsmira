# Self-hosting Opsmira

Opsmira is one Node process that serves the web app and the API. It keeps its data in a directory on disk.
There is no database to run.

## Requirements

- Node 20+ (or Docker)
- An [OpenRouter](https://openrouter.ai/keys) key. Add your own provider keys in OpenRouter if you want
  your own accounts billed (BYOK). Provider failures are shown in the console with the provider's reason.
- `ssh` on the machine, only if you want to manage other servers

## Install

### Docker

```bash
git clone https://github.com/DevBash1/opsmira.git && cd opsmira
cp .env.example .env              # set OPENROUTER_API_KEY
docker compose up -d --build
docker compose logs opsmira       # the admin password is printed on first start
```

Data lives in the `opsmira-data` volume (`/data`). If you bind-mount a host directory there instead, it must be
owned by uid 1000 (`sudo chown 1000:1000 ./data`), or the first start fails with a permission error.

The container sees itself, not the host. Its surfaces show the container's memory, processes and disk.
To manage the host or other machines, mount your SSH keys (see `docker-compose.yml`) and add them as servers,
or run Opsmira directly on the host.

### From source

```bash
git clone https://github.com/DevBash1/opsmira.git && cd opsmira
npm run setup
cp .env.example server/.env       # set OPENROUTER_API_KEY
npm run build
npm start
```

### As a service (systemd)

Run it on the server you want it to manage, as a dedicated user:

```bash
sudo useradd --system --home /opt/opsmira opsmira
sudo cp -r . /opt/opsmira && cd /opt/opsmira && sudo -u opsmira npm run setup && sudo -u opsmira npm run build
sudo cp .env.example /etc/opsmira.env && sudo nano /etc/opsmira.env
sudo cp deploy/opsmira.service /etc/systemd/system/ && sudo systemctl enable --now opsmira
```

The agent can do what the `opsmira` user can do. Grant sudo rules narrowly, if at all.

## HTTPS

The server speaks plain HTTP and binds to `127.0.0.1` by default. Do not expose it to the internet as is.
Put a reverse proxy in front. With Caddy ([`deploy/Caddyfile.example`](../deploy/Caddyfile.example)):

```
opsmira.example.com {
	reverse_proxy 127.0.0.1:8787
}
```

Then set `OPSMIRA_TRUST_PROXY=1` so the session cookie is marked secure.
If you must reach it from another machine without HTTPS, use an SSH tunnel: `ssh -L 8787:127.0.0.1:8787 you@server`.

## Managing other servers (SSH)

In the console, open **Surfaces**, type `user@host` in **Server**, and every surface reads that machine
over SSH. Requirements:

- The server already trusts the host: connect once by hand (`ssh user@host`) so the host key is in
  `known_hosts`. Opsmira never accepts unknown host keys.
- Key-based login that works without a prompt (`BatchMode`). Passwords and passphrase prompts do not work.
- Read access is enough for surfaces. Changes the agent proposes run over SSH as that user.

## Settings

All settings are environment variables; see [`.env.example`](../.env.example). The ones that matter:

| Variable | Default | |
|---|---|---|
| `OPENROUTER_API_KEY` | required | Model provider key |
| `OPSMIRA_PASSWORD` | generated | Console password |
| `HOST` / `PORT` | `127.0.0.1` / `8787` | Where it listens |
| `OPSMIRA_DATA_DIR` | `server/data` (`/data` in Docker) | Everything Opsmira stores |
| `OPSMIRA_TRUST_PROXY` | off | Behind an HTTPS proxy |
| `OPSMIRA_SITE` | off | Also serve the marketing pages |
| `OPSMIRA_MAX_ROUNDS` | `30` | Model calls per request |

## Data, backups, upgrades

`OPSMIRA_DATA_DIR` holds chats, memory, artifacts, the audit log (`audit.jsonl`), metrics, trusted
hosts, and two generated secrets (`.admin-password`, `.session-secret`). Back it up, and treat it as sensitive.

Upgrade: `git pull && npm run setup && npm run build`, then restart (Docker: `docker compose pull && docker compose up -d`).
Read [CHANGELOG.md](../CHANGELOG.md) first. Data formats are kept backward compatible within a major version.

## Troubleshooting

| Symptom | Check |
|---|---|
| "OPENROUTER_API_KEY is not set" | Put it in `server/.env`, or pass it as an environment variable |
| Blank page or 404 on `/app` | Run `npm run build`; the server logs if no build is found |
| Signed out after every restart | `OPSMIRA_DATA_DIR` is not persistent (Docker without a volume) |
| "credits exhausted" | OpenRouter fell back to credits after your own provider key failed. The message names the provider and its error |
| A server shows "unavailable" | Host key not trusted yet, key needs a passphrase, or no `ssh` on the PATH |

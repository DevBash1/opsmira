# Self-hosting Opsmira

Opsmira is one Node process that serves the web app and the API. It keeps its data in a directory on disk.
There is no database to run.

## Requirements

- Node 20+ (or Docker)
- An [OpenRouter](https://openrouter.ai/keys) key. Add your own provider keys in OpenRouter if you want
  your own accounts billed (BYOK). Provider failures are shown in the console with the provider's reason.
- `ssh` on the machine, only if you want to manage other servers

## Install

### The install script

```bash
curl -fsSL https://devbash1.github.io/opsmira/install.sh | sh
```

It picks Docker if it works and builds from source as a systemd service otherwise. Options: `--mode docker|native`,
`--key`, `--port`, `--dir`, `--image`, `--ref`, `--dry-run` (print the steps and change nothing), `--uninstall`
(add `--purge` to delete the data too). Settings, including the generated password, live in
`/opt/opsmira/opsmira.env` (mode 600). Run it again to upgrade. A native install runs as the `opsmira` user, so
it can read the machine but not change it as root; to let it change more, give that account the access you want.

### Docker

```bash
git clone https://github.com/DevBash1/opsmira.git && cd opsmira
cp .env.example .env              # set OPENROUTER_API_KEY
docker compose up -d --build
docker compose logs opsmira       # username (admin) and the generated password are printed on first start
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

## Connect a server without SSH (agent)

Open **Surfaces**, choose **Connect a server**, pick what you are connecting and whether the console may run commands there, and run the command it shows on the server (as root). The agent needs Node 22+; if the server has an older one the command downloads a private Node 22 for the agent (`--install-node`) and leaves the system Node alone.
It installs `opsmira-agent` as a systemd service that dials out to the console, so the server needs no open
port and you hand over no key. Prefer not to install anything? The panel also has a "just run it once" command.

**Running in a container (Docker, Kubernetes)?** "This server" is then only the container, so install the agent on the host as above and set `OPSMIRA_DEFAULT_SERVER=agent:<name>`. Commands and surfaces then go to the host by default; the agent can still reach the container by naming `local`.

- **Pairing:** the command carries a token that works once and does not expire. After pairing, the agent keeps a
  long-lived credential in its state file (mode 0600); the console stores only a hash of it.
- **Asking to join:** an agent started without a token, or with one that was used already, shows up under
  **Connect a server** as a request: its name, hostname, address and the access it wants. It waits connected
  for as long as it takes. **Accept** pairs it; **Decline** tells it to remove itself (the service, its files,
  and the `opsmira-agent` account if the installer made it). An answer given while it is offline reaches it when
  it comes back. Anyone who can reach the console can ask, so at most 50 requests wait at once and an address
  can open 5 an hour; nothing is admitted without you.
- **Keeps itself current.** When the console ships a different agent (after the console is updated), connected
  agents download it from the console, check its sha256, test-run it and restart into it; one that cannot
  connect three times running goes back to the installed version. This includes read-only agents: read-only
  still blocks every command, but the console can now change the agent's code, so a console that has been
  taken over could too. `--no-auto-update` (installer and agent) keeps a version fixed.
- **Detached runs:** for a change that takes the console down while it runs (upgrading the proxy in front of
  it, updating Opsmira), the AI can hand the job to an `operate` agent's server, which runs it on its own and
  reports back. It always asks first. See [detach.md](detach.md).
- **Never stops trying.** Whatever happens to the network or the console (down, unreachable, a proxy answering
  errors, a connection that dies without closing), the agent keeps reconnecting: 1, 2, 4... up to 30 seconds
  between tries, for as long as it runs. A try that gets no answer is given up after 30 seconds, and once
  connected it pings the console every 25 seconds and reconnects if it hears nothing for 75. After the first
  minutes offline it logs one line every 10 minutes. Only Decline (and restarting into an update) ends it; the
  installer's service also restarts it without limit if it ever exits.
- **Remove** in the Surfaces menu revokes it at once. An installed agent then asks to
  join again (it shows as a request, flagged "came with a used token"): **Decline** it and it removes itself from
  that server, or uninstall it there with `--uninstall`. The same happens if the console loses its data: agents
  come back as requests instead of being lost.
- **Read-only by default.** The agent runs only the read-only programs the surfaces use, so surfaces work and
  nothing can change. Add `--access operate` to the command to let the console run shell commands there: the
  AI can then `inspect` it, and propose changes that wait for your approval exactly as on this server. Proposal
  cards and activity lines show which server a command targets.
- **Runs as you by default.** The installer uses the account that ran `sudo`, so the agent can see your
  projects and files, and anything the console runs is what that user could run. That includes reading that
  user's keys and config, even in read-only mode, so only connect a console you trust. Installed from a root
  login (no sudo user), it gets a dedicated `opsmira-agent` account instead. `--run-as opsmira-agent` confines
  it to a service account that cannot read other users' home directories; `--run-as USER` picks any account.
  Re-run the installer to change it.
- **Use HTTPS (`wss://`).** Over plain `ws://` the credential crosses the network unencrypted; the installer
  and the agent both warn.
- **Remove it:** `curl -fsSL https://CONSOLE/agent/install.sh | sudo sh -s -- --uninstall`, then Remove in the console.
  Agents installed before join requests, self-update and detached runs existed get them by running the installer once more.
- Trust: the agent obeys the console it paired with. Anyone who controls the console can use an `operate`
  agent's account, so protect the console like an SSH key.

### Windows

Choose **Windows** in the Connect panel and run the command it shows in a PowerShell opened as administrator. It adds a scheduled task (`opsmira-agent`) that starts at boot and restarts if it stops, downloading a checksum-verified private Node 22 only if the machine has none. Commands the console runs there are PowerShell. The Linux-style surfaces (memory, disks, journal) do not read a Windows machine, so work through chat; with **Run commands** the AI proposes PowerShell and every command waits for your approval (nothing on Windows is treated as read-only). **Read only** is very limited there: just `hostname`, `whoami`, `tasklist`, `ipconfig`, `systeminfo`, `netstat`. The scheduled task runs as SYSTEM, so an `operate` agent has full rights on that machine. Remove it with `-Uninstall`. The Windows installer is new and has had less testing than the Linux one.

### Hosted platforms (Heroku, Railway, Pxxl, Render and similar)

There is no systemd and no root there, and the disk resets on every deploy, so the installer does not apply. Choose **Hosted app** in the Connect panel instead: it makes a credential and gives you one command to use as the platform's start command, with your own start command in the quotes. Your app then runs *under* the agent:

```
curl -fsSL https://CONSOLE/agent/opsmira-agent.mjs -o opsmira-agent.mjs && OPSMIRA_CREDENTIAL=ops_agent_... node opsmira-agent.mjs --server wss://CONSOLE/api/agent/connect --exec "npm start"
```

The credential sits in that command; if the platform has a secret environment variable setting, move `OPSMIRA_CREDENTIAL` there and drop it from the command.

- The credential is long-lived and reused on every deploy and restart, so the app comes back as the same server in the console. It is shown once; keep it like a password. Remove the server in the console to revoke it.
- The app's output goes to the platform's own logs as before, and is also copied to a log file (`OPSMIRA_APP_LOG`, default `/tmp/opsmira-app.log`, kept to its last 512 KB) that the AI can tail.
- The agent exits with the app's exit code, so the platform's restart policy works unchanged. If the agent cannot connect, or is misconfigured, the app still starts.
- Commands run as the platform's unprivileged user inside the app's container, with the app's own directory as the working directory. The `logs` surface (journalctl) does not apply there; the AI reads the log file instead.
- The agent needs Node 22+ in the container. Without it, add it to the image or the build.

## Settings

All settings are environment variables; see [`.env.example`](../.env.example). The ones that matter:

| Variable | Default | |
|---|---|---|
| `OPENROUTER_API_KEY` | required | Model provider key |
| `OPSMIRA_USERNAME` | `admin` | Console username |
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

The console checks GitHub for a newer Opsmira every few hours: a release build against the latest release, an
`:edge` build (or a checkout of `main`) against the newest commit. When there is one, an **Update** button shows
in the top bar; it asks the AI to update this console, which knows how it was installed (Kubernetes, Docker, the
install script, a checkout) and runs the update detached on the server that hosts it, because an update restarts
the console mid-reply. Without a connected agent there, it gives you the commands to run. Connected agents then
update themselves. `OPSMIRA_UPDATE_CHECK=off` turns the check off; `OPSMIRA_AGENT_UPDATES=off` stops pushing
agent updates.

## Troubleshooting

| Symptom | Check |
|---|---|
| "OPENROUTER_API_KEY is not set" | Put it in `server/.env`, or pass it as an environment variable |
| Blank page or 404 on `/` | Run `npm run build`; the server logs if no build is found |
| Signed out after every restart | `OPSMIRA_DATA_DIR` is not persistent (Docker without a volume) |
| "credits exhausted" | OpenRouter fell back to credits after your own provider key failed. The message names the provider and its error |
| A server shows "unavailable" | Host key not trusted yet, key needs a passphrase, or no `ssh` on the PATH |

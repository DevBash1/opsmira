# Security

## What Opsmira can do

Opsmira runs shell commands on the machine it is installed on, and over SSH on hosts you point it at, as the
operating-system user it runs under. That is the product, and also the risk.

- **Ask mode (default):** the agent may run read-only inspections itself. Anything that changes the machine
  is a proposal that waits for your approval.
- **Full access:** the agent runs any command without asking. Use it only on machines you can afford to
  break, and never on production.
- Run it as a dedicated user with only the access you want it to have. Use SSH keys limited to what it needs.
- The read-only check is a safety net, not a sandbox. Treat anyone who can sign in as able to run commands.
- Connected agents update themselves from the console they paired with, read-only ones included. Read-only still
  blocks commands, but whoever controls the console controls the agent's code; start an agent with
  `--no-auto-update` to keep its version fixed.
- A detached run (docs/detach.md) sends the model API key to that server for the length of the run and runs its
  commands without approving each one. It always needs your approval, every command lands in the audit log, and
  the key is deleted when the run ends.
- Anyone who can reach the console can ask to connect a server. Requests are capped and rate limited, and nothing
  is connected until you accept it.

## Deploying safely

- Keep `HOST=127.0.0.1` and put HTTPS in front (see `docs/self-hosting.md`). The login is one shared password;
  do not send it over plain HTTP.
- Choose a long password, or let Opsmira generate one. Sign-in is one shared username and password, and
  an address is blocked for 10 minutes after 5 wrong attempts. Per-user accounts are on the roadmap.
- Chats, memory and the audit log can contain command output. The data directory is sensitive; back it up
  and protect it like any other secret store.
- Model providers see what the agent sees, including command output. Use a provider you trust.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting:
**Security → Report a vulnerability** on this repository. We aim to reply within 3 working days and will
credit you in the release notes if you wish.

Supported versions: the latest release.

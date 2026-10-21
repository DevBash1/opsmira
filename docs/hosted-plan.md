# Opsmira Cloud: hosted version plan

Status: plan only. Nothing here is built. The self-hosted version (this repository) comes first and stays
free. The hosted product is the same console, run for people who do not want to run it, plus the parts that
only make sense as a service: accounts, billing, and connecting servers with one command.

## Goals

1. Sign up, run one command on a server, and see it in the console in under two minutes.
2. No inbound ports, no SSH keys handed over, no VPN. The server dials out.
3. Per-server billing that is easy to understand.
4. The self-hosted console and the hosted one stay one codebase.

## The connect command

After sign-up the console shows a command with a one-time token:

```bash
curl -fsSL https://get.opsmira.com | sudo sh -s -- --token ops_connect_XXXXXXXX
```

The script (short, readable, checksummed) does four things and says what it is doing:

1. Downloads the `opsmira-agent` binary for the machine (linux amd64/arm64 first).
2. Creates a service user, `opsmira-agent`, with no sudo by default.
3. Installs and starts a systemd service.
4. Registers: sends the one-time token plus hostname and OS; receives a long-lived credential that is
   stored only on that server (`/etc/opsmira-agent/credential`, mode 0600). The one-time token is then dead.

Options: `--name web-1`, `--access read-only|ask|full`, `--uninstall`. A Docker form and a manual form
(download, verify, run) are documented for people who do not pipe to a shell.

## How it works

```
 browser ◀──▶ Cloud control plane ◀══ outbound TLS (WebSocket) ══▶ opsmira-agent (on your server)
                  │  accounts, orgs, billing, agent loop, history
                  └─ model providers
```

- **opsmira-agent** is a small program that holds one outbound TLS WebSocket to the control plane and
  answers requests: run this command, read this surface, stream these samples. It reuses the same collectors
  and the same read-only classifier as the self-hosted server.
- **The seam already exists.** Collectors take a `Machine` (`server/src/machine.js`: local or SSH).
  The hosted version adds a third, `agentMachine(serverId)`, that sends the request down the agent's socket.
  Surfaces, the agent loop and the UI do not change.
- **Approvals stay with the human.** The control plane never executes a changing command without an approval
  from a signed-in session. Optional per-server policy: `read-only` (agent refuses changes), `ask` (default),
  `full` (owner explicitly opts in, shown with a warning).
- **Commands are checked twice**: in the control plane, and again in the agent against a local policy file
  the owner controls. The agent enforces the strictest of the two.
- **Credential safety**: revoking a server in the console kills its credential immediately; the agent
  reconnects only with a valid one; tokens are rotated on a schedule.

## Accounts and tenancy

- Sign-in: email + passkey or magic link; Google/GitHub later. Organizations with members and roles
  (owner, admin, operator, viewer) arrive with the self-hosted multi-user work, so both share one model.
- Every row carries `org_id`; every query is scoped by it. Chats, memory, artifacts and audit logs are
  per org. The audit log is append-only and exportable.
- Command output can contain secrets. Retention is configurable (default 30 days), and output is redacted
  for common token shapes before storage.

## Billing

Provider: Stripe (Checkout + Customer Portal + webhooks). Open decisions are marked.

| Plan | Idea |
|---|---|
| Free | 1 server, read-only surfaces, small monthly agent allowance |
| Pro | Per connected server per month, includes a fair-use model allowance, approvals, history |
| Team | Pro plus members/roles, longer retention, audit export, SSO later |
| Bring your own key | Same price minus the model allowance; your OpenRouter or provider key |

- **Metering:** a "connected server" is one that checked in during the billing period (so a dead server
  is not billed). Model usage is metered per org from provider-reported token usage.
- **Decision: model costs.** Include a pooled allowance (simple, needs cost control and abuse limits) versus
  bring-your-own-key only (no margin on tokens, simpler). Recommended: both, with BYOK as the default
  for the free plan.
- **Failure modes designed up front:** payment fails → grace period, then servers go read-only, never
  disconnect or delete; downgrade over a server limit → oldest servers pause, nothing is lost.
- Tax handled by Stripe Tax. Invoices from the portal.

## Architecture changes needed

| Area | Today (self-hosted) | Hosted |
|---|---|---|
| Storage | JSON files in a data dir | Postgres (orgs, servers, chats, audit), object storage for large output |
| Auth | One shared password | Accounts + sessions, org-scoped |
| Machines | local, ssh | + `agentMachine` over the agent socket |
| Model calls | One key in env | Per-org key or pooled key, metered |
| Agent loop | In-process | Same code, running per request in a worker, state in the database |
| Samplers | In-process ring | The agent streams samples; the control plane keeps a short window |

To keep one codebase, storage and auth go behind two small interfaces (`Store`, `Auth`) in the server, with the
file/password implementations as the self-hosted defaults. The hosted product supplies Postgres/accounts
implementations from a separate **private** repository (`opsmira-cloud`: billing, accounts, agent gateway,
infrastructure). The AGPL repository never needs billing code in it.

## Licensing and contributions

- This repository is AGPL-3.0. Cloud-only code lives in the private repository and talks to this one through
  the `Store`/`Auth`/`Machine` interfaces and a network API, so it is a separate program.
- **CLA vs DCO:** a CLA (lets us relicense or ship
  commercial features in the combined work) or only a DCO sign-off (lighter, but no relicensing).
  Decided: CLA (`CLA.md`, draft pending legal review, enforced by `.github/workflows/cla.yml`).

## Phases

1. **Self-host polish (now):** this repository, Docker, docs, CI, releases.
2. **Interfaces:** extract `Store` and `Auth`; users and roles in the self-hosted app.
3. **Agent:** `opsmira-agent` binary, install script, token pairing, `agentMachine`, revocation. Works
   against a self-hosted control plane first (a second way to add a server, no SSH needed).
4. **Cloud MVP:** private repo, Postgres, accounts, org tenancy, agent gateway, deployed on one region.
5. **Billing:** Stripe plans, metering, grace and downgrade behavior, invoices.
6. **Launch:** status page, backups and restore drills, terms and privacy policy, security review of the agent.

## Open questions

- Name and domain for the install host (`get.opsmira.com`) and the cloud app.
- Agent language: Node single-binary (fast to build, reuses collectors) versus Go (small, no runtime).
- Do we offer an on-prem control plane to companies (a paid license) later?
- Windows and macOS servers: out of scope for v1.

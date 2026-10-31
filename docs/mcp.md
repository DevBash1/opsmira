# Connecting AI agents (MCP)

Opsmira is also an [MCP](https://modelcontextprotocol.io) server. Another AI agent (Claude Code, Claude Desktop,
Cursor, an agent of your own) connects to your console and can either hand a job to Opsmira's own agent and get its
answer back, or go straight to one of your servers: read it, or run a command there.

## Connect Claude on the web, Desktop or mobile

In Claude, add a custom connector (Settings → Connectors) with the URL `https://YOUR-CONSOLE/mcp`. Claude sends you
to your console to sign in and choose the access (Ask first or Full access), then comes back connected. The
connection shows under **Surfaces → AI agents** in the console, marked "signed in from claude.ai", and **Revoke**
ends it. Claude Code can sign in the same way: `claude mcp add --transport http opsmira https://YOUR-CONSOLE/mcp`
with no header, then `/mcp` in Claude Code to sign in.

This is OAuth 2.1, served by the console itself: discovery (`/.well-known/oauth-protected-resource/mcp`,
`/.well-known/oauth-authorization-server`), clients by Client ID Metadata Document or Dynamic Client Registration
(`/oauth/register`), the approval page (`/oauth/authorize`, PKCE S256 only), and `/oauth/token` (access tokens last
an hour; refresh tokens rotate on every use and last 90 days). It needs the console on HTTPS at a public address
Claude can reach, and behind a proxy `OPSMIRA_TRUST_PROXY=1`, so the addresses it advertises are `https://`.

## Connect with a token

In the console, open **Surfaces → Connect an AI agent (MCP)**, give it a name, choose its access, and copy the
setting it shows. The token is shown once; the console keeps only a hash of it. **Revoke** cuts it off at once.

Claude Code:

    claude mcp add --transport http opsmira https://YOUR-CONSOLE/mcp --header "Authorization: Bearer opsmira_mcp_..."

Clients that take a JSON config (Claude Desktop, Cursor and others):

    { "mcpServers": { "opsmira": { "type": "http", "url": "https://YOUR-CONSOLE/mcp",
      "headers": { "Authorization": "Bearer opsmira_mcp_..." } } } }

The endpoint is `POST /mcp`, Streamable HTTP without sessions or streams: each request is one JSON-RPC message and
the answer is the response body. It needs HTTPS like the rest of the console.

## Access

| | Ask first | Full access |
|---|---|---|
| List servers, read surfaces | yes | yes |
| `opsmira_run_command` | read-only commands only (`ls`, `df`, `systemctl status`...) | any command |
| `opsmira_ask` | Opsmira works in Ask first mode: changes it proposes wait for your approval in the console | Opsmira works in Full access mode |
| Approve a change | no, only you, in the console | no, only you, in the console |

Every command a client runs, directly or through Opsmira's agent, is in **Activity**: direct ones are marked `mcp`
with the client's name. Conversations a client starts show up in **History**, titled with the client's name, so you
can follow them and approve what they propose.

## Tools

- **`opsmira_list_servers`**: the machine Opsmira runs on (`local`) and every connected server (`agent:<name>`):
  online or not, and whether commands may run there. The ids go into `server` below.
- **`opsmira_read_surface`** `{ surface, server?, target? }`: live data from a server (memory, disks, processes,
  logs, services, containers, certificates...), as JSON. Works on read-only servers.
- **`opsmira_run_command`** `{ command, server? }`: one shell command on a server, straight there, without Opsmira's
  agent: exit code and output. It may run 2 minutes when read-only and 15 otherwise; `timeout_seconds` asks for
  more, up to an hour. Long calls stream a keep-alive, so proxies such as Cloudflare do not cut them.
- **`opsmira_ask`** `{ message, conversation_id?, server?, wait_seconds? }`: a message to Opsmira's agent, as you would
  type it in the console. It investigates, answers, and returns its reply, the commands it ran, and any change
  waiting for your approval. It waits up to `wait_seconds` (default 50, at most 90, under what proxies such as
  Cloudflare allow a request); if it is still working, the result says `working`.
- **`opsmira_get_reply`** `{ conversation_id, wait_seconds? }`: waits for the rest of a `working` answer, or reads where
  a conversation stands.
- **`opsmira_stop`** `{ conversation_id }`: stops Opsmira's agent in that conversation, like the Stop button.

Pass `conversation_id` back to `opsmira_ask` to continue a conversation. Opsmira's agent answers with the model you
last chose in the console (the console tells the server whenever you pick one); `model` on `opsmira_ask` picks another
for that conversation. Every answer names the model that gave it, so a model error is easy to place.

## Security

- A token is as good as a login for what its access allows. Keep it in the client's settings, not in a repository.
  Five wrong tokens from one address block it for ten minutes, like wrong passwords.
- Requests that carry an `Origin` from another site are refused, so a web page cannot use a token in your browser.
- Nothing a client does can approve a change: proposals wait for you in the console whatever the token.
- Anyone can register an OAuth client (that is how Claude connects), but nothing is granted without you signing in
  to the console and pressing Allow. The approval page names the app, shows where it returns to (with a warning
  when that is a program on your own computer), refuses other sites' forms, and cannot be framed.

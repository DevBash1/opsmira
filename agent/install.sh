#!/bin/sh
# Installs opsmira-agent as a systemd service, so this server stays connected to your Opsmira console.
#
#   curl -fsSL https://CONSOLE/agent/install.sh | sudo sh -s -- --server wss://CONSOLE/api/agent/connect --token ops_connect_...
#
# Options:
#   --server URL     the console's agent address (required)
#   --token TOKEN    the one-time token from the console (required the first time)
#   --name NAME      how the server is named in the console (default: this hostname)
#   --access MODE    read-only (default) or operate (lets the console run commands here)
#   --run-as USER    the account the agent runs as (default: opsmira-agent, created if missing)
#   --dry-run        print what would be done and change nothing
#   --uninstall      stop and remove the service (the console entry is removed in its Surfaces menu)
set -eu

SERVER="" TOKEN="" NAME="" ACCESS="read-only" RUN_AS="opsmira-agent" DRY=0 UNINSTALL=0
DIR=/opt/opsmira-agent
STATE_DIR=/var/lib/opsmira-agent
ENV_FILE=/etc/opsmira-agent.env
UNIT=/etc/systemd/system/opsmira-agent.service

say() { printf '%s\n' "$*"; }
die() { printf 'opsmira-agent install: %s\n' "$*" >&2; exit 1; }
run() { if [ "$DRY" = 1 ]; then say "+ $*"; else "$@"; fi; }

while [ $# -gt 0 ]; do
  case "$1" in
    --server) SERVER="${2:-}"; shift 2 ;;
    --token) TOKEN="${2:-}"; shift 2 ;;
    --name) NAME="${2:-}"; shift 2 ;;
    --access) ACCESS="${2:-}"; shift 2 ;;
    --run-as) RUN_AS="${2:-}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) sed -n '2,15p' "$0" 2>/dev/null || true; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

if [ "$UNINSTALL" = 1 ]; then
  [ "$DRY" = 1 ] || [ "$(id -u)" = 0 ] || die "run as root (sudo)"
  run systemctl disable --now opsmira-agent 2>/dev/null || true
  run rm -f "$UNIT" "$ENV_FILE"
  run rm -rf "$DIR" "$STATE_DIR"
  run systemctl daemon-reload
  say "Removed. The user '$RUN_AS' was left in place; delete it with: userdel $RUN_AS"
  exit 0
fi

[ -n "$SERVER" ] || die "--server is required"
case "$SERVER" in ws://*|wss://*) ;; *) die "--server must start with ws:// or wss://" ;; esac
case "$ACCESS" in read-only|operate) ;; *) die "--access must be read-only or operate" ;; esac
case "$RUN_AS" in *[!a-zA-Z0-9._-]*|"") die "--run-as has characters that are not allowed" ;; esac
[ "$DRY" = 1 ] || [ "$(id -u)" = 0 ] || die "run as root (sudo), or add --dry-run to see the steps"
command -v systemctl >/dev/null 2>&1 || die "this needs systemd. Run the agent by hand instead: node opsmira-agent.mjs --server ... --token ..."
command -v node >/dev/null 2>&1 || die "Node 22 or newer is required. Install it first (https://nodejs.org)."
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] || die "Node 22 or newer is required (found $(node -v))."
command -v curl >/dev/null 2>&1 || die "curl is required"

# Where to fetch the agent: the same origin as the console.
ORIGIN=$(printf '%s' "$SERVER" | sed -e 's#^wss://#https://#' -e 's#^ws://#http://#' -e 's#/api/agent/connect$##')
[ -n "$NAME" ] || NAME=$(hostname | tr 'A-Z' 'a-z' | tr -c 'a-z0-9.\n-' '-')

say "Installing opsmira-agent ($ACCESS) for $ORIGIN as '$NAME', running as '$RUN_AS'."
case "$SERVER" in ws://localhost*|ws://127.*) ;; ws://*) say "Warning: ws:// is not encrypted. Use an https:// console (wss://) so the credential is not sent in the clear." ;; esac

if [ "$DRY" = 1 ] || ! id "$RUN_AS" >/dev/null 2>&1; then
  run useradd --system --home-dir "$STATE_DIR" --shell /usr/sbin/nologin "$RUN_AS"
fi
run mkdir -p "$DIR" "$STATE_DIR"
run curl -fsSL "$ORIGIN/agent/opsmira-agent.mjs" -o "$DIR/opsmira-agent.mjs"
run chown -R "$RUN_AS" "$STATE_DIR"

# A read-only agent cannot gain privileges. One that may run commands is left able to use sudo if you grant it.
HARDEN="NoNewPrivileges=true"
[ "$ACCESS" = operate ] && HARDEN="# NoNewPrivileges is off so sudo works, if you allow it for $RUN_AS"

if [ "$DRY" = 1 ]; then
  say "+ write $ENV_FILE (mode 600) with the token"
  say "+ write $UNIT"
else
  # The token is only needed until the agent has paired once; it is stored with mode 600.
  umask 077
  { printf 'OPSMIRA_SERVER=%s\n' "$SERVER"; [ -z "$TOKEN" ] || printf 'OPSMIRA_TOKEN=%s\n' "$TOKEN"; } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  umask 022
  cat > "$UNIT" <<UNITEOF
[Unit]
Description=Opsmira agent
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_AS
EnvironmentFile=$ENV_FILE
Environment=HOME=$STATE_DIR
ExecStart=$(command -v node) $DIR/opsmira-agent.mjs --name $NAME --access $ACCESS --state $STATE_DIR/state.json
Restart=always
RestartSec=3
$HARDEN

[Install]
WantedBy=multi-user.target
UNITEOF
fi
run systemctl daemon-reload
run systemctl enable --now opsmira-agent

say ""
say "Done. It should appear as 'agent:$NAME' in the console's Surfaces menu in a few seconds."
say "Logs: journalctl -u opsmira-agent -f"
[ "$ACCESS" = operate ] && say "Commands are allowed. They run as '$RUN_AS'; give that account only the access you want it to have."
exit 0

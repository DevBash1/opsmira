#!/bin/sh
# Installs opsmira-agent as a systemd service, so this server stays connected to your Opsmira console.
#
#   curl -fsSL https://CONSOLE/agent/install.sh | sudo sh -s -- --server wss://CONSOLE/api/agent/connect --token ops_connect_...
#
# Options:
#   --server URL     the console's agent address (required)
#   --token TOKEN    the token from the console (works once, does not expire). Without one, or with one that
#                    was used already, the server asks to join: the console owner accepts it, or declines it and
#                    the agent removes itself from this server
#   --name NAME      how the server is named in the console (default: this hostname)
#   --access MODE    read-only (default) or operate (lets the console run commands here)
#   --run-as USER    the account the agent runs as. Default: the user who ran sudo, so it can see that user's
#                    files and projects (a root login gets a dedicated opsmira-agent account instead).
#                    --run-as opsmira-agent keeps it in a locked-down service account of its own
#   --install-node   if this machine has no Node 22+, download one for the agent only (checksum verified,
#                    kept in /opt/opsmira-agent/node, the system Node is left alone)
#   --node PATH      run the agent with this Node 22+ binary
#   --no-auto-update keep this agent version (by default it updates itself when the console ships a new one)
#   --dry-run        print what would be done and change nothing
#   --uninstall      stop and remove the service (the console entry is removed in its Surfaces menu)
set -eu

SERVER="" TOKEN="" NAME="" ACCESS="read-only" RUN_AS="" DRY=0 UNINSTALL=0 INSTALL_NODE=0 NODE_BIN="" NO_UPDATE=""
DIR=/opt/opsmira-agent
DECLINED=78
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
    --install-node) INSTALL_NODE=1; shift ;;
    --node) NODE_BIN="${2:-}"; shift 2 ;;
    --no-auto-update) NO_UPDATE=" --no-auto-update"; shift ;;
    --dry-run) DRY=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) sed -n '2,20p' "$0" 2>/dev/null || true; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

if [ "$UNINSTALL" = 1 ]; then
  [ "$DRY" = 1 ] || [ "$(id -u)" = 0 ] || die "run as root (sudo)"
  run systemctl disable --now opsmira-agent 2>/dev/null || true
  run rm -f "$UNIT" "$ENV_FILE" /usr/local/bin/opsmira
  run rm -rf "$DIR" "$STATE_DIR"
  run systemctl daemon-reload
  say "Removed. The user '$RUN_AS' was left in place; delete it with: userdel $RUN_AS"
  exit 0
fi

[ -n "$SERVER" ] || die "--server is required"
case "$SERVER" in ws://*|wss://*) ;; *) die "--server must start with ws:// or wss://" ;; esac
case "$ACCESS" in read-only|operate) ;; *) die "--access must be read-only or operate" ;; esac
# By default the agent is the person who installed it: it can then see their projects, and whatever the console
# runs is what that person could run. A root login (no sudo user) gets a dedicated service account.
if [ -z "$RUN_AS" ]; then
  if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != root ] && id "$SUDO_USER" >/dev/null 2>&1; then RUN_AS="$SUDO_USER"; else RUN_AS=opsmira-agent; fi
fi
case "$RUN_AS" in *[!a-zA-Z0-9._-]*|"") die "--run-as has characters that are not allowed" ;; esac
[ "$DRY" = 1 ] || [ "$(id -u)" = 0 ] || die "run as root (sudo), or add --dry-run to see the steps"
command -v systemctl >/dev/null 2>&1 || die "this needs systemd. On a hosting platform (Heroku, Railway, Pxxl, ...) there is no systemd: use Connect a server > Hosted app in the console, which runs your app under the agent. Otherwise run it by hand: node opsmira-agent.mjs --server ... --token ..."
# A snap-packaged Node cannot run as a system service (snap-confine needs privileges the service lacks), so it never counts.
is_snap() { case "$1" in /snap/*|*/snap/bin/*) return 0 ;; esac; case "$(readlink -f "$1" 2>/dev/null)" in /snap/*|*/snap) return 0 ;; esac; return 1; }
node_ok() { ! is_snap "$1" && [ -x "$1" ] && [ "$("$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 22 ]; }
NEED_NODE=0
if [ -n "$NODE_BIN" ]; then
  node_ok "$NODE_BIN" || die "$NODE_BIN is not Node 22 or newer"
elif command -v node >/dev/null 2>&1 && node_ok "$(command -v node)"; then
  NODE_BIN=$(command -v node)
elif [ "$INSTALL_NODE" = 1 ]; then
  NEED_NODE=1
  NODE_BIN="$DIR/node/bin/node"
else
  SNAPNOTE=""; if command -v node >/dev/null 2>&1 && is_snap "$(command -v node)"; then SNAPNOTE=" The Node here is a snap, which cannot run as a service."; fi
  die "Node 22 or newer is required (found: $(node -v 2>/dev/null || echo none)).$SNAPNOTE Install one, or add --install-node to download one for the agent only."
fi
command -v curl >/dev/null 2>&1 || die "curl is required"

# Where to fetch the agent: the same origin as the console.
ORIGIN=$(printf '%s' "$SERVER" | sed -e 's#^wss://#https://#' -e 's#^ws://#http://#' -e 's#/api/agent/connect$##')
[ -n "$NAME" ] || NAME=$(hostname | tr 'A-Z' 'a-z' | tr -c 'a-z0-9.\n-' '-')

say "Installing opsmira-agent ($ACCESS) for $ORIGIN as '$NAME', running as '$RUN_AS'."
case "$SERVER" in ws://localhost*|ws://127.*) ;; ws://*) say "Warning: ws:// is not encrypted. Use an https:// console (wss://) so the credential is not sent in the clear." ;; esac

CREATED_USER=0
if ! id "$RUN_AS" >/dev/null 2>&1; then
  run useradd --system --home-dir "$STATE_DIR" --shell /usr/sbin/nologin "$RUN_AS"
  CREATED_USER=1
fi
run mkdir -p "$DIR" "$STATE_DIR"
# A real person's account keeps its own home (so ~ and their projects are where they expect); a service account uses the state directory.
AGENT_HOME="$STATE_DIR"
if id "$RUN_AS" >/dev/null 2>&1; then
  USER_HOME="$(getent passwd "$RUN_AS" | cut -d: -f6)"
  case "$RUN_AS" in opsmira-agent) ;; *) [ -n "$USER_HOME" ] && [ -d "$USER_HOME" ] && AGENT_HOME="$USER_HOME" ;; esac
fi
if [ "$NEED_NODE" = 1 ]; then
  if [ "$DRY" = 1 ]; then
    say "+ download Node 22 (checksum verified) into $DIR/node"
  else
    case "$(uname -m)" in x86_64) NARCH=x64 ;; aarch64|arm64) NARCH=arm64 ;; armv7l) NARCH=armv7l ;; *) die "no Node download for $(uname -m); install Node 22 and use --node" ;; esac
    command -v xz >/dev/null 2>&1 || die "xz is needed to unpack Node (apt install xz-utils)"
    NBASE=https://nodejs.org/dist/latest-v22.x
    SUMS=$(curl -fsSL "$NBASE/SHASUMS256.txt") || die "could not reach nodejs.org"
    NFILE=$(printf '%s\n' "$SUMS" | awk -v a="linux-$NARCH.tar.xz" '$2 ~ a"$" { print $2; exit }')
    [ -n "$NFILE" ] || die "no Node 22 build for $NARCH"
    NSUM=$(printf '%s\n' "$SUMS" | awk -v f="$NFILE" '$2 == f { print $1 }')
    NTMP=$(mktemp -d)
    curl -fsSL "$NBASE/$NFILE" -o "$NTMP/$NFILE" || die "could not download $NFILE"
    [ "$(sha256sum "$NTMP/$NFILE" | cut -d' ' -f1)" = "$NSUM" ] || die "Node download failed its checksum"
    rm -rf "$DIR/node"; mkdir -p "$DIR/node"
    tar -xJf "$NTMP/$NFILE" -C "$DIR/node" --strip-components=1
    rm -rf "$NTMP"
    say "Installed $("$NODE_BIN" -v) for the agent in $DIR/node (the system Node is untouched)."
  fi
fi
run curl -fsSL "$ORIGIN/agent/opsmira-agent.mjs" -o "$DIR/opsmira-agent.mjs"
# A version the agent downloaded for itself would otherwise win over the one just installed.
run rm -f "$STATE_DIR/opsmira-agent.update.mjs"
run chown -R "$RUN_AS" "$STATE_DIR"

# A read-only agent cannot gain privileges. One that may run commands is left able to use sudo if you grant it.
HARDEN="NoNewPrivileges=true"
[ "$ACCESS" = operate ] && HARDEN="# NoNewPrivileges is off so sudo works, if you allow it for $RUN_AS"

if [ "$DRY" = 1 ]; then
  say "+ write $ENV_FILE (mode 600) with the token"
  say "+ write $DIR/uninstall.sh"
  say "+ write $UNIT"
else
  # What the service runs (as root, through ExecStopPost) when the console owner declines this server.
  DELUSER=""
  [ "$CREATED_USER" = 1 ] && DELUSER="userdel $RUN_AS 2>/dev/null || true"
  cat > "$DIR/uninstall.sh" <<UNEOF
#!/bin/sh
# Written by the opsmira-agent installer. Removes the agent; the service runs it when the console declines this server.
systemctl disable opsmira-agent 2>/dev/null || true
systemctl stop opsmira-agent 2>/dev/null || true
rm -f $UNIT $ENV_FILE /usr/local/bin/opsmira
rm -rf $DIR $STATE_DIR
systemctl daemon-reload
$DELUSER
UNEOF
  chmod 700 "$DIR/uninstall.sh"
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
# Never give up restarting it (systemd stops after 5 starts in 10 s by default).
StartLimitIntervalSec=0

[Service]
User=$RUN_AS
EnvironmentFile=$ENV_FILE
Environment=HOME=$AGENT_HOME
# Tells the agent this service restarts it (after it updates itself).
Environment=OPSMIRA_SUPERVISED=systemd
ExecStart=$NODE_BIN $DIR/opsmira-agent.mjs --name $NAME --access $ACCESS --state $STATE_DIR/state.json$NO_UPDATE
Restart=always
RestartSec=3
# Declined by the console owner (exit $DECLINED): do not restart, remove the agent (as root, outside this unit).
RestartPreventExitStatus=$DECLINED
ExecStopPost=+/bin/sh -c '[ "\$\$EXIT_STATUS" = $DECLINED ] && systemd-run --no-block --collect --unit=opsmira-agent-remove /bin/sh $DIR/uninstall.sh || true'
# A detached run (docs/detach.md) and its commands outlive a restart of the agent itself.
KillMode=process
$HARDEN

[Install]
WantedBy=multi-user.target
UNITEOF
fi
run systemctl daemon-reload
run systemctl enable opsmira-agent
# restart, not just start: on a re-run the old version is still running and would keep running
run systemctl restart opsmira-agent

say ""
if [ -n "$TOKEN" ]; then
  say "Done. It should appear as 'agent:$NAME' in the console's Surfaces menu in a few seconds."
elif grep -q '"credential"' "$STATE_DIR/state.json" 2>/dev/null; then
  say "Done. It reconnects as before with its saved credential (agent:$NAME)."
else
  say "Done. It is asking to join: accept it in the console (Surfaces, Connect a server). Declining it removes the agent from this server."
fi
say "Logs: journalctl -u opsmira-agent -f"
if [ "$RUN_AS" = opsmira-agent ]; then
  say "It runs as the service account 'opsmira-agent', which cannot read other users' home directories. Re-run with --run-as YOUR_USER to let it see your projects."
else
  say "It runs as '$RUN_AS', so it can see that user's files and projects. Re-run with --run-as opsmira-agent to confine it."
fi
[ "$ACCESS" = operate ] && say "Commands are allowed. They run as '$RUN_AS'; give that account only the access you want it to have."
exit 0

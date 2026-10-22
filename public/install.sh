#!/bin/sh
# Installs Opsmira on this machine: with Docker if it is there, otherwise from source as a systemd service.
#
#   curl -fsSL https://devbash1.github.io/opsmira/install.sh | sh
#
# Options (or the matching environment variable):
#   --mode docker|native   how to install (default: docker if it works, else native)
#   --key KEY              your OpenRouter key (OPENROUTER_API_KEY). Asked for if left out and a terminal is attached
#   --port N               port on this machine (default 8787, bound to 127.0.0.1 only)
#   --dir PATH             where to keep settings and the app (default /opt/opsmira as root, else ~/opsmira)
#   --image REF            the Docker image (default ghcr.io/devbash1/opsmira:latest)
#   --ref REF              the branch or tag to build in native mode (default main; OPSMIRA_REF)
#   --repo URL             the Git repository to build in native mode (OPSMIRA_REPO)
#   --dry-run              print what would be done and change nothing
#   --uninstall            remove the container or service. Your data is kept unless you add --purge
#   --purge                with --uninstall: also delete the data
#
# Re-running it upgrades an existing install and keeps its settings, password and data.
set -eu

MODE="" KEY="${OPENROUTER_API_KEY:-}" PORT=8787 DIR="" DRY=0 UNINSTALL=0 PURGE=0
IMAGE="${OPSMIRA_IMAGE:-ghcr.io/devbash1/opsmira:latest}"
REF="${OPSMIRA_REF:-main}"
REPO="${OPSMIRA_REPO:-https://github.com/DevBash1/opsmira.git}"
NAME=opsmira
USERNAME="${OPSMIRA_USERNAME:-admin}"

say() { printf '%s\n' "$*"; }
die() { printf 'opsmira install: %s\n' "$*" >&2; exit 1; }
run() { if [ "$DRY" = 1 ]; then say "+ $*"; else "$@"; fi; }

while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --key) KEY="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --dir) DIR="${2:-}"; shift 2 ;;
    --image) IMAGE="${2:-}"; shift 2 ;;
    --ref) REF="${2:-}"; shift 2 ;;
    --repo) REPO="${2:-}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    --purge) PURGE=1; shift ;;
    -h|--help) sed -n '2,20p' "$0" 2>/dev/null || true; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

case "$PORT" in ""|*[!0-9]*) die "--port must be a number" ;; esac
case "$MODE" in ""|docker|native) ;; *) die "--mode must be docker or native" ;; esac
IS_ROOT=0; [ "$(id -u)" = 0 ] && IS_ROOT=1
if [ -z "$DIR" ]; then
  if [ "$IS_ROOT" = 1 ]; then DIR=/opt/opsmira; else DIR="${HOME:-.}/opsmira"; fi
fi
ENV_FILE="$DIR/opsmira.env"
UNIT=/etc/systemd/system/opsmira.service

docker_works() { command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; }

if [ -z "$MODE" ]; then
  if docker_works; then MODE=docker; else MODE=native; fi
fi

# ---- uninstall
if [ "$UNINSTALL" = 1 ]; then
  if [ "$MODE" = docker ]; then
    run docker rm -f "$NAME" 2>/dev/null || true
    [ "$PURGE" = 1 ] && run docker volume rm opsmira-data 2>/dev/null || true
  else
    [ "$DRY" = 1 ] || [ "$IS_ROOT" = 1 ] || die "run as root (sudo)"
    run systemctl disable --now opsmira 2>/dev/null || true
    run rm -f "$UNIT"
    run systemctl daemon-reload
    run rm -rf "$DIR/app"
    [ "$PURGE" = 1 ] && run rm -rf "$DIR/data"
  fi
  [ "$PURGE" = 1 ] && run rm -f "$ENV_FILE"
  say "Removed. Settings and data were $( [ "$PURGE" = 1 ] && echo deleted || echo "kept in $DIR (add --purge to delete them)" )."
  exit 0
fi

# ---- checks
if [ "$MODE" = docker ]; then
  [ "$DRY" = 1 ] || docker_works || die "Docker is installed but not usable by this account (is the daemon running? are you in the docker group?)"
else
  [ "$DRY" = 1 ] || [ "$IS_ROOT" = 1 ] || die "a native install runs as a service, so run it as root (sudo), or add --dry-run to see the steps"
  command -v systemctl >/dev/null 2>&1 || [ "$DRY" = 1 ] || die "a native install needs systemd. Use --mode docker, or run it by hand: see docs/self-hosting.md"
  for tool in git node npm curl; do
    command -v "$tool" >/dev/null 2>&1 || [ "$DRY" = 1 ] || die "$tool is required for a native install"
  done
  if command -v node >/dev/null 2>&1; then
    [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || die "Node 20 or newer is required (found $(node -v))."
  fi
fi

# ---- settings (kept across upgrades)
random() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"; }
have_tty() { [ -r /dev/tty ] && (: </dev/tty) 2>/dev/null; }
env_value() { [ -f "$ENV_FILE" ] && sed -n "s/^$1=//p" "$ENV_FILE" | head -n 1 || true; }

PASSWORD="$(env_value OPSMIRA_PASSWORD)"
[ -n "$KEY" ] || KEY="$(env_value OPENROUTER_API_KEY)"
if [ -z "$KEY" ] && [ "$DRY" != 1 ] && have_tty; then
  printf 'OpenRouter API key (get one at https://openrouter.ai/keys): ' >/dev/tty
  stty -echo </dev/tty 2>/dev/null || true
  read -r KEY </dev/tty || KEY=""
  stty echo </dev/tty 2>/dev/null || true
  printf '\n' >/dev/tty
fi
case "$KEY" in *[!A-Za-z0-9_.-]*) die "that does not look like an OpenRouter key (unexpected characters)" ;; esac
NEW_PASSWORD=0
if [ -z "$PASSWORD" ]; then
  PASSWORD="$(random 18)"; NEW_PASSWORD=1
  [ "$DRY" = 1 ] && PASSWORD="<generated>"
fi
[ "$DRY" = 1 ] && [ -z "$KEY" ] && KEY="sk-or-..."

write_env() {
  # The key and password live in this file, so only its owner may read it.
  run mkdir -p "$DIR"
  if [ "$DRY" = 1 ]; then say "+ write $ENV_FILE (mode 600)"; return; fi
  umask 077
  {
    printf 'OPENROUTER_API_KEY=%s\n' "$KEY"
    printf 'OPSMIRA_USERNAME=%s\n' "$USERNAME"
    printf 'OPSMIRA_PASSWORD=%s\n' "$PASSWORD"
    if [ "$MODE" = native ]; then
      printf 'HOST=127.0.0.1\nPORT=%s\nOPSMIRA_DATA_DIR=%s/data\n' "$PORT" "$DIR"
    fi
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  umask 022
}

say "Installing Opsmira ($MODE) in $DIR."
write_env

STARTED=0
if [ "$MODE" = docker ]; then
  if [ "$DRY" = 1 ]; then say "+ docker pull $IMAGE"
  elif ! docker pull "$IMAGE"; then
    # Before the first tagged release there is no :latest yet, only :edge (the current main branch).
    if [ "$IMAGE" = ghcr.io/devbash1/opsmira:latest ] && docker pull ghcr.io/devbash1/opsmira:edge; then
      IMAGE=ghcr.io/devbash1/opsmira:edge
    # An image that is already here (built locally, or pulled earlier) is enough.
    elif ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
      die "could not pull $IMAGE. Check the name, or build it (docker build -t opsmira .) and pass --image opsmira"
    fi
  fi
  run docker rm -f "$NAME" 2>/dev/null || true
  if [ -n "$KEY" ]; then
    run docker run -d --name "$NAME" --restart unless-stopped \
      -p "127.0.0.1:$PORT:8787" -v opsmira-data:/data --env-file "$ENV_FILE" "$IMAGE"
    STARTED=1
  fi
else
  if [ "$DRY" = 1 ] || ! id opsmira >/dev/null 2>&1; then
    run useradd --system --home-dir "$DIR" --shell /usr/sbin/nologin opsmira
  fi
  if [ -d "$DIR/app/.git" ]; then
    run git -C "$DIR/app" fetch --depth 1 origin "$REF"
    run git -C "$DIR/app" checkout -q FETCH_HEAD
  else
    run rm -rf "$DIR/app"
    run git clone --depth 1 --branch "$REF" "$REPO" "$DIR/app"
  fi
  run npm --prefix "$DIR/app" run setup
  run npm --prefix "$DIR/app" run build
  run mkdir -p "$DIR/data"
  run chown -R opsmira "$DIR/data"
  # The service account reads the environment file through systemd, so it stays root-only.
  if [ "$DRY" = 1 ]; then
    say "+ write $UNIT"
  else
    cat > "$UNIT" <<UNITEOF
[Unit]
Description=Opsmira
After=network-online.target
Wants=network-online.target

[Service]
User=opsmira
WorkingDirectory=$DIR/app/server
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) src/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNITEOF
  fi
  run systemctl daemon-reload
  if [ -n "$KEY" ]; then run systemctl enable --now opsmira; STARTED=1; else run systemctl enable opsmira; fi
fi

say ""
if [ "$STARTED" = 1 ] || [ "$DRY" = 1 ]; then
  say "Opsmira is running at http://127.0.0.1:$PORT (on this machine only)."
  if [ "$NEW_PASSWORD" = 1 ]; then
    say "Sign in with username '$USERNAME' and password: $PASSWORD"
  else
    say "Sign in with username '$USERNAME' and the password saved in $ENV_FILE."
  fi
  say "To reach it from your own computer: ssh -L $PORT:127.0.0.1:$PORT <this server>, then open http://127.0.0.1:$PORT"
  say "Put HTTPS in front of it before exposing it to the internet: docs/self-hosting.md"
else
  say "Nothing was started: no OpenRouter key was given."
  say "Put OPENROUTER_API_KEY=... in $ENV_FILE, then $( [ "$MODE" = docker ] && echo "re-run this installer" || echo "run: systemctl start opsmira" )."
  say "Your sign-in will be username '$USERNAME' and password: $PASSWORD"
fi
if [ "$MODE" = docker ]; then
  say "Logs: docker logs -f $NAME      Upgrade: run this installer again"
  say "Note: the container sees itself, not this host. To manage the host, install with --mode native."
else
  say "Logs: journalctl -u opsmira -f      Upgrade: run this installer again"
  say "It runs as the 'opsmira' user, so it can inspect this machine but not change it as root."
fi

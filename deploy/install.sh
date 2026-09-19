#!/usr/bin/env bash
#
# Installiert Warensystem Home auf einem Debian- oder Ubuntu-System als
# systemd-Dienst. Gedacht für einen LXC-Container auf Proxmox, läuft aber
# genauso auf einem Raspberry Pi, in einer VM oder auf einem alten Laptop.
#
#   curl -fsSL https://raw.githubusercontent.com/Marlon1694/Warensystem-Home/HEAD/deploy/install.sh | bash
#
# Ein erneuter Aufruf aktualisiert eine bestehende Installation, ohne Daten
# anzufassen: die Datenbank liegt außerhalb des Programmverzeichnisses.
#
# Einstellungen über Umgebungsvariablen, zum Beispiel:
#   PORT=8080 ENABLE_TLS=no bash deploy/install.sh
#
set -euo pipefail

APP_USER="${APP_USER:-warensystem}"
APP_DIR="${APP_DIR:-/opt/warensystem-home}"
DATA_DIR="${DATA_DIR:-/var/lib/warensystem-home}"
REPO_URL="${REPO_URL:-https://github.com/Marlon1694/Warensystem-Home.git}"
BRANCH="${BRANCH:-}"
PORT="${PORT:-4000}"
NODE_MAJOR="${NODE_MAJOR:-22}"
ENABLE_TLS="${ENABLE_TLS:-yes}"
SERVICE_NAME="warensystem-home"

log()  { printf '\033[1;32m[warensystem]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warensystem]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[warensystem]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die 'Bitte als root ausführen (oder mit sudo).'
command -v systemctl >/dev/null || die 'Dieses System nutzt kein systemd.'

# ---------------------------------------------------------------------------
# Pakete
# ---------------------------------------------------------------------------

log 'Installiere Systempakete …'
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates git openssl tzdata >/dev/null

# ---------------------------------------------------------------------------
# Node.js
#
# Die Datenbank läuft über node:sqlite, das in Node selbst steckt. Deshalb
# braucht es mindestens Version 22.5 – die Paketquellen von Debian und Ubuntu
# liefern ältere Stände aus, daher die Quelle von NodeSource.
# ---------------------------------------------------------------------------

node_ok() {
  command -v node >/dev/null || return 1
  local version
  version="$(node -p 'process.versions.node' 2>/dev/null || echo 0)"
  node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=5)?0:1)' 2>/dev/null
}

if node_ok; then
  log "Node.js $(node -v) ist bereits vorhanden."
else
  log "Installiere Node.js ${NODE_MAJOR}.x …"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
  node_ok || die "Node.js ist zu alt: $(node -v). Benötigt wird mindestens 22.5."
  log "Node.js $(node -v) installiert."
fi

# ---------------------------------------------------------------------------
# Benutzer und Verzeichnisse
# ---------------------------------------------------------------------------

if ! id -u "$APP_USER" >/dev/null 2>&1; then
  log "Lege Systembenutzer $APP_USER an …"
  useradd --system --create-home --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

mkdir -p "$APP_DIR" "$DATA_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR"

# ---------------------------------------------------------------------------
# Quellcode
# ---------------------------------------------------------------------------

as_app() { runuser -u "$APP_USER" -- "$@"; }

if [ -d "$APP_DIR/.git" ]; then
  log 'Aktualisiere bestehende Installation …'
  as_app git -C "$APP_DIR" fetch --depth 1 origin "${BRANCH:-HEAD}"
  as_app git -C "$APP_DIR" reset --hard FETCH_HEAD
else
  log "Hole den Quellcode nach $APP_DIR …"
  # git clone verlangt ein leeres Ziel, das Home des Benutzers enthält aber
  # bereits die Dateien aus /etc/skel. Deshalb daneben klonen und übernehmen.
  checkout="$(mktemp -d)"
  chown "$APP_USER:$APP_USER" "$checkout"
  if [ -n "$BRANCH" ]; then
    as_app git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$checkout/repo"
  else
    as_app git clone --depth 1 "$REPO_URL" "$checkout/repo"
  fi
  as_app cp -a "$checkout/repo/." "$APP_DIR/"
  rm -rf "$checkout"
fi

# ---------------------------------------------------------------------------
# Bauen
# ---------------------------------------------------------------------------

log 'Installiere Abhängigkeiten …'
as_app env HOME="$APP_DIR" npm --prefix "$APP_DIR" ci --no-audit --no-fund

log 'Baue die Oberfläche …'
as_app env HOME="$APP_DIR" npm --prefix "$APP_DIR" run build

# Nach dem Bauen werden die Werkzeuge nicht mehr gebraucht.
log 'Entferne Bauwerkzeuge …'
as_app env HOME="$APP_DIR" npm --prefix "$APP_DIR" prune --omit=dev --no-audit --no-fund

# ---------------------------------------------------------------------------
# Konfiguration
# ---------------------------------------------------------------------------

if [ ! -f "$APP_DIR/.env" ]; then
  log 'Schreibe .env …'
  cat > "$APP_DIR/.env" <<ENV
PORT=${PORT}
HOST=0.0.0.0
DATABASE_FILE=${DATA_DIR}/warensystem.db
BACKUP_DIR=${DATA_DIR}/backups
TLS_MODE=auto
TLS_KEY_FILE=${DATA_DIR}/certs/server.key
TLS_CERT_FILE=${DATA_DIR}/certs/server.crt
EXPIRY_WARN_DAYS=5
OFF_ENABLED=true
ENV
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
else
  log 'Bestehende .env bleibt unverändert.'
fi

# ---------------------------------------------------------------------------
# Zertifikat
#
# Ohne HTTPS gibt Safari auf iPhone und iPad die Kamera nicht frei – der
# Barcode-Scanner bliebe gesperrt. Alles Übrige liefe auch über HTTP.
# ---------------------------------------------------------------------------

if [ "$ENABLE_TLS" = 'yes' ] && [ ! -f "${DATA_DIR}/certs/server.crt" ]; then
  log 'Erzeuge ein Zertifikat für den Zugriff im Heimnetz …'
  mkdir -p "${DATA_DIR}/certs"
  chown "$APP_USER:$APP_USER" "${DATA_DIR}/certs"
  as_app env HOME="$APP_DIR" node "$APP_DIR/scripts/generate-cert.mjs" >/dev/null
  as_app cp "$APP_DIR/certs/server.key" "$APP_DIR/certs/server.crt" "${DATA_DIR}/certs/"
  rm -rf "$APP_DIR/certs"
fi

# ---------------------------------------------------------------------------
# Dienst
# ---------------------------------------------------------------------------

log 'Richte den systemd-Dienst ein …'
sed -e "s|__APP_USER__|${APP_USER}|g" \
    -e "s|__APP_DIR__|${APP_DIR}|g" \
    -e "s|__DATA_DIR__|${DATA_DIR}|g" \
    "$APP_DIR/deploy/warensystem-home.service" > "/etc/systemd/system/${SERVICE_NAME}.service"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
systemctl restart "$SERVICE_NAME"

# ---------------------------------------------------------------------------
# Prüfen
# ---------------------------------------------------------------------------

scheme='http'
[ -f "${DATA_DIR}/certs/server.crt" ] && scheme='https'

log 'Warte auf den Dienst …'
for attempt in $(seq 1 30); do
  if curl -fsk --max-time 2 "${scheme}://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    warn 'Der Dienst antwortet nicht. Protokoll:'
    journalctl -u "$SERVICE_NAME" -n 40 --no-pager >&2 || true
    die 'Installation abgeschlossen, aber der Dienst läuft nicht.'
  fi
  sleep 1
done

addresses="$(hostname -I 2>/dev/null || true)"

cat <<SUMMARY

  Warensystem Home läuft.

  Im Heimnetz:  $(for ip in $addresses; do printf '%s://%s:%s  ' "$scheme" "$ip" "$PORT"; done)
  Daten:        ${DATA_DIR}
  Dienst:       systemctl status ${SERVICE_NAME}
  Protokoll:    journalctl -u ${SERVICE_NAME} -f

  Auf dem iPhone die Adresse in Safari öffnen und über das Teilen-Symbol
  "Zum Home-Bildschirm" wählen.
SUMMARY

if [ "$scheme" = 'https' ]; then
  cat <<'TLS'
  Beim ersten Aufruf meldet der Browser ein unbekanntes Zertifikat. Das ist
  erwartet: es wurde lokal erzeugt und von keiner Stelle beglaubigt. Damit der
  Barcode-Scanner auf dem iPhone funktioniert, muss dem Zertifikat einmalig
  vertraut werden – siehe README, Abschnitt "Barcode-Scanner auf dem iPhone".

TLS
fi

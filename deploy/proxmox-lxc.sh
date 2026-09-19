#!/usr/bin/env bash
#
# Legt auf einem Proxmox-Host einen unprivilegierten LXC-Container an und
# installiert Warensystem Home darin.
#
# Auf der Proxmox-Shell ausführen (nicht im Container):
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/Marlon1694/Warensystem-Home/HEAD/deploy/proxmox-lxc.sh)"
#
# Einstellungen über Umgebungsvariablen, zum Beispiel:
#   CTID=140 RAM_MB=2048 ROOTFS_STORAGE=local-zfs bash deploy/proxmox-lxc.sh
#   IPV4=192.168.1.50/24 GATEWAY=192.168.1.1 bash deploy/proxmox-lxc.sh
#
set -euo pipefail

CT_HOSTNAME="${CT_HOSTNAME:-warensystem}"
CORES="${CORES:-2}"
RAM_MB="${RAM_MB:-1024}"
SWAP_MB="${SWAP_MB:-512}"
DISK_GB="${DISK_GB:-8}"
BRIDGE="${BRIDGE:-vmbr0}"
IPV4="${IPV4:-dhcp}"
GATEWAY="${GATEWAY:-}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
ROOTFS_STORAGE="${ROOTFS_STORAGE:-local-lvm}"
TEMPLATE_PREFIX="${TEMPLATE_PREFIX:-debian-13-standard}"
START_ON_BOOT="${START_ON_BOOT:-1}"
REPO_URL="${REPO_URL:-https://github.com/Marlon1694/Warensystem-Home.git}"
BRANCH="${BRANCH:-}"
PORT="${PORT:-4000}"
ENABLE_TLS="${ENABLE_TLS:-yes}"

log()  { printf '\033[1;32m[proxmox]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[proxmox]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[proxmox]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die 'Bitte als root auf dem Proxmox-Host ausführen.'
command -v pct   >/dev/null || die 'pct wurde nicht gefunden. Dieses Skript gehört auf den Proxmox-Host, nicht in einen Container.'
command -v pveam >/dev/null || die 'pveam wurde nicht gefunden.'

CTID="${CTID:-$(pvesh get /cluster/nextid)}"
pct status "$CTID" >/dev/null 2>&1 && die "Die ID $CTID ist bereits vergeben. Mit CTID=<Nummer> eine andere wählen."

[ "$IPV4" = 'dhcp' ] || [ -n "$GATEWAY" ] || die 'Bei fester IP-Adresse bitte auch GATEWAY setzen.'

# ---------------------------------------------------------------------------
# Vorlage
# ---------------------------------------------------------------------------

log 'Suche eine passende Container-Vorlage …'
pveam update >/dev/null 2>&1 || warn 'Die Vorlagenliste konnte nicht aktualisiert werden – nutze den vorhandenen Stand.'

TEMPLATE="$(pveam available --section system 2>/dev/null \
  | awk -v prefix="$TEMPLATE_PREFIX" '$2 ~ prefix {print $2}' | sort -V | tail -1)"

if [ -z "$TEMPLATE" ]; then
  # Ältere Proxmox-Stände kennen debian-13 noch nicht.
  TEMPLATE="$(pveam available --section system 2>/dev/null \
    | awk '$2 ~ /debian-12-standard/ {print $2}' | sort -V | tail -1)"
fi
[ -n "$TEMPLATE" ] || die 'Keine Debian-Vorlage gefunden. Mit TEMPLATE_PREFIX eine andere wählen.'

if ! pveam list "$TEMPLATE_STORAGE" 2>/dev/null | grep -q "$TEMPLATE"; then
  log "Lade die Vorlage $TEMPLATE herunter …"
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
fi

TEMPLATE_REF="${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}"

# Mit TEMPLATE_PREFIX lässt sich auch eine Ubuntu-Vorlage wählen; der ostype
# muss dann dazu passen, sonst richtet Proxmox das Netzwerk falsch ein.
OSTYPE="$(printf '%s' "$TEMPLATE" | grep -oE '^[a-z]+' || echo debian)"

# ---------------------------------------------------------------------------
# Container anlegen
# ---------------------------------------------------------------------------

if [ "$IPV4" = 'dhcp' ]; then
  NET="name=eth0,bridge=${BRIDGE},ip=dhcp"
else
  NET="name=eth0,bridge=${BRIDGE},ip=${IPV4},gw=${GATEWAY}"
fi

cat <<PLAN

  Container wird angelegt:

    ID          ${CTID}
    Name        ${CT_HOSTNAME}
    Vorlage     ${TEMPLATE}
    Kerne       ${CORES}
    Arbeitssp.  ${RAM_MB} MB (+ ${SWAP_MB} MB Swap)
    Festplatte  ${DISK_GB} GB auf ${ROOTFS_STORAGE}
    Netzwerk    ${NET}

PLAN

cleanup_hint() {
  local code=$?
  [ "$code" -eq 0 ] && return 0
  warn "Abbruch. Der Container $CTID wurde bereits angelegt."
  warn "Aufräumen mit:  pct stop $CTID; pct destroy $CTID"
  warn "Oder erneut versuchen mit:  pct exec $CTID -- bash /root/install.sh"
  return "$code"
}

log "Lege Container $CTID an …"
pct create "$CTID" "$TEMPLATE_REF" \
  --hostname "$CT_HOSTNAME" \
  --cores "$CORES" \
  --memory "$RAM_MB" \
  --swap "$SWAP_MB" \
  --rootfs "${ROOTFS_STORAGE}:${DISK_GB}" \
  --net0 "$NET" \
  --features nesting=1 \
  --unprivileged 1 \
  --onboot "$START_ON_BOOT" \
  --ostype "$OSTYPE" \
  --description 'Warensystem Home – Haushalts-Warenwirtschaft' \
  >/dev/null

trap cleanup_hint EXIT

log 'Starte den Container …'
pct start "$CTID"

# ---------------------------------------------------------------------------
# Auf das Netzwerk warten
# ---------------------------------------------------------------------------

log 'Warte auf die Netzwerkverbindung …'
for attempt in $(seq 1 60); do
  if pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    die "Der Container $CTID hat keine Netzwerkverbindung. Prüfe Bridge ${BRIDGE} und DHCP."
  fi
  sleep 2
done

# ---------------------------------------------------------------------------
# Installation im Container
# ---------------------------------------------------------------------------

log 'Bereite den Container vor …'
pct exec "$CTID" -- bash -c 'export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq curl ca-certificates >/dev/null'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"

if [ -n "$SCRIPT_DIR" ] && [ -f "${SCRIPT_DIR}/install.sh" ]; then
  log 'Übertrage das Installationsskript …'
  pct push "$CTID" "${SCRIPT_DIR}/install.sh" /root/install.sh --perms 755
else
  log 'Lade das Installationsskript in den Container …'
  pct exec "$CTID" -- bash -c \
    "curl -fsSL https://raw.githubusercontent.com/Marlon1694/Warensystem-Home/HEAD/deploy/install.sh -o /root/install.sh && chmod 755 /root/install.sh"
fi

log 'Installiere Warensystem Home …'
pct exec "$CTID" -- env \
  REPO_URL="$REPO_URL" \
  BRANCH="$BRANCH" \
  PORT="$PORT" \
  ENABLE_TLS="$ENABLE_TLS" \
  bash /root/install.sh

# ---------------------------------------------------------------------------
# Ergebnis
# ---------------------------------------------------------------------------

trap - EXIT

CT_IP="$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')"
SCHEME='http'
[ "$ENABLE_TLS" = 'yes' ] && SCHEME='https'

cat <<SUMMARY

  Fertig.

    Adresse       ${SCHEME}://${CT_IP}:${PORT}
    Container     ${CTID} (${CT_HOSTNAME})
    Konsole       pct enter ${CTID}
    Protokoll     pct exec ${CTID} -- journalctl -u warensystem-home -f
    Aktualisieren pct exec ${CTID} -- bash /root/install.sh

  Damit die Adresse dauerhaft gleich bleibt, im Router eine feste IP-Adresse
  für den Container vergeben – oder den Container mit IPV4=… und GATEWAY=…
  gleich mit fester Adresse anlegen.

SUMMARY

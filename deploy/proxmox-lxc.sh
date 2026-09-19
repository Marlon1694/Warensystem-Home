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
#
# Feste IP-Adresse (die Netzmaske hinter dem Schrägstrich gehört dazu):
#
#   IPV4=192.168.1.50/24 GATEWAY=192.168.1.1 bash deploy/proxmox-lxc.sh
#
# DNS kommt sonst vom DHCP-Server. Bei fester Adresse übernimmt der Container
# die Einstellungen des Proxmox-Hosts; mit NAMESERVER lässt sich das übergehen:
#
#   IPV4=192.168.1.50/24 GATEWAY=192.168.1.1 NAMESERVER=192.168.1.1 \
#     bash deploy/proxmox-lxc.sh
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
NAMESERVER="${NAMESERVER:-}"
SEARCHDOMAIN="${SEARCHDOMAIN:-}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
ROOTFS_STORAGE="${ROOTFS_STORAGE:-local-lvm}"
TEMPLATE_PREFIX="${TEMPLATE_PREFIX:-debian-13-standard}"
START_ON_BOOT="${START_ON_BOOT:-1}"
# Zusatzfunktionen des Containers. Proxmox weist bei Debian 13 ausdrücklich
# darauf hin ("Systemd 257 detected. You may need to enable nesting"), weil
# neuere systemd-Fassungen es im unprivilegierten Container brauchen.
FEATURES="${FEATURES:-nesting=1}"
# Mit SKIP_CREATE=1 wird ein bereits vorhandener Container nur bespielt.
SKIP_CREATE="${SKIP_CREATE:-0}"
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

# Startet den Container und zeigt bei einem Fehlschlag die ausführliche
# Meldung von LXC. "Failed to spawn container" allein nennt die Ursache nicht,
# die steht erst in der Debug-Ausgabe.
start_container() {
  if [ "$(pct status "$CTID" 2>/dev/null)" = 'status: running' ]; then
    log "Container $CTID läuft bereits."
    return 0
  fi

  log 'Starte den Container …'
  pct start "$CTID" && return 0

  warn 'Der Container ließ sich nicht starten. Ausführliche Meldung:'
  pct start "$CTID" --debug 2>&1 | tail -25 | sed 's/^/    /' >&2 || true

  # Das Here-Dokument ist bewusst mit Anführungszeichen begrenzt: der Hinweis
  # enthält eine Befehlszeile mit $(…), die hier angezeigt und nicht
  # ausgeführt werden soll. Die Container-Nummer wird danach eingesetzt.
  cat <<'HINT' | sed "s|<CTID>|${CTID}|g" >&2

  Was in dieser Reihenfolge zu prüfen ist:

  1. Steht oben "Exec format error" beim Aufruf von /sbin/init, passt die
     Vorlage nicht zur CPU des Hosts. Der Container ist dann nicht zu
     retten, er muss mit passender Vorlage neu angelegt werden:

         pct destroy <CTID>

  2. AppArmor. Fehlt es im Kernel, scheitert der Start ohne klare Meldung.
     In /etc/pve/lxc/<CTID>.conf ergänzen:

         lxc.apparmor.profile: unconfined

     danach erneut starten.

  3. Zusatzfunktionen. Debian 13 braucht "nesting" und bekommt es hier auch.
     Auf sehr alten Kerneln kann das Gegenteil nötig sein:

         pct set <CTID> --features ''
         pct start <CTID>

  4. Läuft der Container, lässt sich die Installation nachholen, ohne ihn
     neu anzulegen:

         CTID=<CTID> SKIP_CREATE=1 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Marlon1694/Warensystem-Home/HEAD/deploy/proxmox-lxc.sh)"

HINT
  die 'Der Container wurde angelegt, konnte aber nicht gestartet werden.'
}

cleanup_hint() {
  local code=$?
  [ "$code" -eq 0 ] && return 0
  warn "Abbruch. Der Container $CTID wurde bereits angelegt."
  warn "Aufräumen mit:  pct stop $CTID; pct destroy $CTID"
  warn "Oder erneut versuchen mit:  pct exec $CTID -- bash /root/install.sh"
  return "$code"
}

if [ "$SKIP_CREATE" = '1' ]; then
  pct status "$CTID" >/dev/null 2>&1 \
    || die "Container $CTID gibt es nicht. SKIP_CREATE=1 bespielt nur einen vorhandenen Container."
else
  pct status "$CTID" >/dev/null 2>&1 \
    && die "Die ID $CTID ist bereits vergeben. Mit CTID=<Nummer> eine andere wählen, oder mit SKIP_CREATE=1 diesen Container bespielen."
fi

# ---------------------------------------------------------------------------
# Feste IP-Adresse prüfen
#
# Die drei Fehler, die hier regelmäßig passieren: vergessene Netzmaske,
# Gateway in einem anderen Subnetz und eine bereits vergebene Adresse. Alle
# drei fallen sonst erst viel später auf – als scheinbarer Netzwerkfehler.
# ---------------------------------------------------------------------------

is_ipv4() {
  local octet
  case "$1" in
    *[!0-9.]*|*..*|.*|*.) return 1 ;;
  esac
  [ "$(printf '%s' "$1" | tr -cd . | wc -c)" -eq 3 ] || return 1
  for octet in ${1//./ }; do
    [ "$octet" -le 255 ] 2>/dev/null || return 1
  done
  return 0
}

ipv4_to_int() {
  local IFS=.
  # shellcheck disable=SC2086
  set -- $1
  echo $(( ($1 << 24) + ($2 << 16) + ($3 << 8) + $4 ))
}

if [ "$IPV4" != 'dhcp' ] && [ "$SKIP_CREATE" != '1' ]; then
  case "$IPV4" in
    */*) ;;
    *) die "IPV4 braucht die Netzmaske: IPV4=${IPV4}/24 statt IPV4=${IPV4}" ;;
  esac

  ADDRESS="${IPV4%%/*}"
  PREFIX="${IPV4##*/}"

  is_ipv4 "$ADDRESS" || die "IPV4 ist keine gültige IPv4-Adresse: ${ADDRESS}"
  { [ "$PREFIX" -ge 1 ] && [ "$PREFIX" -le 32 ]; } 2>/dev/null \
    || die "Die Netzmaske muss zwischen 1 und 32 liegen: /${PREFIX}"

  [ -n "$GATEWAY" ] || die 'Bei fester IP-Adresse bitte auch GATEWAY setzen, z. B. GATEWAY=192.168.1.1'
  is_ipv4 "$GATEWAY" || die "GATEWAY ist keine gültige IPv4-Adresse: ${GATEWAY}"

  MASK=$(( 0xFFFFFFFF << (32 - PREFIX) & 0xFFFFFFFF ))
  if [ $(( $(ipv4_to_int "$ADDRESS") & MASK )) -ne $(( $(ipv4_to_int "$GATEWAY") & MASK )) ]; then
    die "Gateway ${GATEWAY} liegt nicht im Netz von ${ADDRESS}/${PREFIX}. Beide müssen im selben Subnetz liegen."
  fi

  if command -v ping >/dev/null 2>&1; then
    if ping -c 1 -W 1 "$ADDRESS" >/dev/null 2>&1; then
      die "Unter ${ADDRESS} antwortet bereits ein Gerät. Bitte eine freie Adresse wählen."
    fi
  else
    # Lieber sagen als stillschweigend durchwinken.
    warn "ping ist nicht verfügbar – ob ${ADDRESS} noch frei ist, wurde nicht geprüft."
  fi
fi

# ---------------------------------------------------------------------------
# Vorlage
# ---------------------------------------------------------------------------

if [ "$SKIP_CREATE" = '1' ]; then
  log "Überspringe das Anlegen – bespiele den vorhandenen Container $CTID."
fi

if [ "$SKIP_CREATE" != '1' ]; then
log 'Suche eine passende Container-Vorlage …'
pveam update >/dev/null 2>&1 || warn 'Die Vorlagenliste konnte nicht aktualisiert werden – nutze den vorhandenen Stand.'

# Die Vorlagenliste enthält auch Vorlagen für andere Architekturen. Eine
# arm64-Vorlage lässt sich auf einem x86-Host anstandslos anlegen – beim Start
# scheitert dann aber /sbin/init mit "Exec format error". Deshalb wird die
# Auswahl hier auf die Architektur des Hosts eingegrenzt.
# Maßgeblich ist der Kernel, denn er führt die Programme im Container aus.
# Auf einem Raspberry Pi kann ein 64-Bit-Kernel mit einem 32-Bit-System
# darüber laufen – dann widerspricht dpkg dem Kernel, und dpkg läge falsch.
case "$(uname -m)" in
  x86_64)           HOST_ARCH='amd64' ;;
  aarch64|arm64)    HOST_ARCH='arm64' ;;
  armv7l|armv6l)    HOST_ARCH='armhf' ;;
  i386|i486|i686)   HOST_ARCH='i386' ;;
  *)                HOST_ARCH="$(dpkg --print-architecture 2>/dev/null || uname -m)" ;;
esac

DPKG_ARCH="$(dpkg --print-architecture 2>/dev/null || true)"
if [ -n "$DPKG_ARCH" ] && [ "$DPKG_ARCH" != "$HOST_ARCH" ]; then
  warn "Kernel meldet ${HOST_ARCH}, das System darüber ${DPKG_ARCH}. Maßgeblich ist der Kernel."
fi

find_template() {
  pveam available --section system 2>/dev/null \
    | awk -v prefix="$1" -v arch="_${HOST_ARCH}." '$2 ~ prefix && index($2, arch) > 0 {print $2}' \
    | sort -V | tail -1
}

TEMPLATE="$(find_template "$TEMPLATE_PREFIX")"
# Ältere Proxmox-Stände kennen debian-13 noch nicht.
[ -n "$TEMPLATE" ] || TEMPLATE="$(find_template 'debian-12-standard')"
[ -n "$TEMPLATE" ] || die "Keine Debian-Vorlage für ${HOST_ARCH} gefunden. Mit TEMPLATE_PREFIX eine andere wählen."

log "Architektur des Hosts: ${HOST_ARCH}"

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
    Architektur ${HOST_ARCH}
    Kerne       ${CORES}
    Arbeitssp.  ${RAM_MB} MB (+ ${SWAP_MB} MB Swap)
    Festplatte  ${DISK_GB} GB auf ${ROOTFS_STORAGE}
    Netzwerk    ${NET}

PLAN


# Ohne Angabe übernimmt der Container die DNS-Einstellungen des Hosts.
DNS_ARGS=()
[ -n "$NAMESERVER" ]   && DNS_ARGS+=(--nameserver "$NAMESERVER")
[ -n "$SEARCHDOMAIN" ] && DNS_ARGS+=(--searchdomain "$SEARCHDOMAIN")

FEATURE_ARGS=()
[ -n "$FEATURES" ] && FEATURE_ARGS+=(--features "$FEATURES")

log "Lege Container $CTID an …"
pct create "$CTID" "$TEMPLATE_REF" \
  --hostname "$CT_HOSTNAME" \
  --cores "$CORES" \
  --memory "$RAM_MB" \
  --swap "$SWAP_MB" \
  --rootfs "${ROOTFS_STORAGE}:${DISK_GB}" \
  --net0 "$NET" \
  ${DNS_ARGS[@]+"${DNS_ARGS[@]}"} \
  ${FEATURE_ARGS[@]+"${FEATURE_ARGS[@]}"} \
  --unprivileged 1 \
  --onboot "$START_ON_BOOT" \
  --ostype "$OSTYPE" \
  --description 'Warensystem Home – Haushalts-Warenwirtschaft' \
  >/dev/null

fi

trap cleanup_hint EXIT

start_container

# ---------------------------------------------------------------------------
# Auf das Netzwerk warten
# ---------------------------------------------------------------------------

# Adresse und Namensauflösung getrennt prüfen: sonst sieht ein fehlender
# DNS-Server genauso aus wie ein Container ohne Netzwerkanschluss.
log 'Warte auf die Netzwerkadresse …'
for attempt in $(seq 1 30); do
  if pct exec "$CTID" -- ip -4 addr show dev eth0 2>/dev/null | grep -q 'inet '; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    if [ "$IPV4" = 'dhcp' ]; then
      die "Container $CTID hat keine Adresse erhalten. Prüfe die Bridge ${BRIDGE} und ob dort ein DHCP-Server antwortet."
    fi
    die "Container $CTID konnte ${IPV4} nicht einrichten. Prüfe die Bridge ${BRIDGE}."
  fi
  sleep 2
done

log 'Warte auf die Namensauflösung …'
for attempt in $(seq 1 30); do
  if pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    warn "Die Adresse steht, aber Namen werden nicht aufgelöst."
    warn "Im Container eingetragen:"
    pct exec "$CTID" -- cat /etc/resolv.conf 2>/dev/null | sed 's/^/    /' >&2 || true
    die "Bitte den Container mit NAMESERVER=<Adresse des DNS-Servers> neu anlegen, z. B. NAMESERVER=${GATEWAY:-192.168.1.1}"
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

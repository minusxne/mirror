#!/usr/bin/env bash
#
# Mirror — guided board transfer.
#
# A friendly front end for tools/db-sync.mjs so you never have to remember the
# flags. Run it with no arguments and it asks what you want to do:
#
#     ./sync.sh
#
# Shortcuts, if you already know:
#
#     ./sync.sh status [device]
#     ./sync.sh push   [device]
#     ./sync.sh pull   [device]
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT" || exit 1

TOOL="tools/db-sync.mjs"
CONFIG="sync.config.json"
API_PORT="${API_PORT:-5174}"
WEB_PORT="${WEB_PORT:-5173}"

# ---------------------------------------------------------------- colours --

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; R=$'\033[31m'; G=$'\033[32m'
  Y=$'\033[33m'; C=$'\033[36m'; N=$'\033[0m'
else
  B=""; DIM=""; R=""; G=""; Y=""; C=""; N=""
fi

say()  { printf '%s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '  %swarning%s  %s\n' "$Y" "$N" "$*"; }
err()  { printf '  %serror%s    %s\n' "$R" "$N" "$*"; }
rule() { printf '  %s%s%s\n' "$DIM" "$(repeat '─' 56)" "$N"; }

repeat() {
  local ch="$1" n="$2" out=""
  while [ "$n" -gt 0 ]; do out="$out$ch"; n=$((n - 1)); done
  printf '%s' "$out"
}

# A titled box whose borders are measured from the text, not counted by hand.
banner() {
  local text="$1"
  local pad=3
  local width=$(( ${#text} + pad * 2 ))
  local line
  line="$(repeat '─' "$width")"
  printf '  %s┌%s┐%s\n' "$C" "$line" "$N"
  printf '  %s│%s%*s%s%s%s%*s%s│%s\n' \
    "$C" "$N" "$pad" "" "$B" "$text" "$N" "$pad" "" "$C" "$N"
  printf '  %s└%s┘%s\n' "$C" "$line" "$N"
}

title() {
  say ""
  printf '  %s%s%s\n' "$B" "$*" "$N"
  say ""
}

pause() {
  say ""
  read -rp "  ${DIM}Press Enter to continue${N} " _ || true
}

# ------------------------------------------------------------ preflight --

require_node() {
  if ! command -v node >/dev/null 2>&1; then
    err "node is not installed, and the board tools need it."
    info "Install Node 22.5 or newer, then run this again."
    exit 1
  fi
  local major minor
  major=$(node -p 'process.versions.node.split(".")[0]')
  minor=$(node -p 'process.versions.node.split(".")[1]')
  if [ "$major" -lt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -lt 5 ]; }; then
    err "Node $(node -v) is too old — the database needs 22.5 or newer."
    exit 1
  fi
}

require_ssh() {
  if ! command -v ssh >/dev/null 2>&1 || ! command -v scp >/dev/null 2>&1; then
    err "ssh and scp are needed to move the board between machines."
    info "On Debian/Ubuntu:  sudo apt install openssh-client"
    info "On Arch:           sudo pacman -S openssh"
    return 1
  fi
  return 0
}

# Is the board app running here? If it is, it holds the database open, and the
# receiving side of a transfer should not have it open at all.
app_is_running() {
  local port
  for port in "$API_PORT" "$WEB_PORT"; do
    if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
      exec 3>&- 2>/dev/null
      return 0
    fi
  done
  return 1
}

# --------------------------------------------------------------- devices --

have_config() { [ -f "$CONFIG" ]; }

device_names() {
  [ -f "$CONFIG" ] || return 0
  node -e '
    const fs = require("fs");
    try {
      const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      for (const name of Object.keys(c.devices || {})) console.log(name);
    } catch { /* unreadable config: behave as if there are none */ }
  ' "$CONFIG" 2>/dev/null
}

device_summary() {
  [ -f "$CONFIG" ] || return 0
  node -e '
    const fs = require("fs");
    try {
      const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      for (const [n, d] of Object.entries(c.devices || {})) {
        console.log(`${n}|${d.host || "?"}|${d.path || "~/Repos/mirror"}`);
      }
    } catch {}
  ' "$CONFIG" 2>/dev/null
}

device_count() { device_names | grep -c . ; }

# Ask which machine to work with. With exactly one configured, just use it.
pick_device() {
  local prompt="${1:-Which machine?}"
  local -a names=()
  # Read line by line rather than with `mapfile`, which the bash 3.2 that ships
  # on macOS does not have — and the other machine may well be a Mac.
  local nm
  while IFS= read -r nm; do
    [ -n "$nm" ] && names+=("$nm")
  done < <(device_names)

  if [ "${#names[@]}" -eq 0 ]; then
    PICKED=""
    return 1
  fi
  if [ "${#names[@]}" -eq 1 ]; then
    PICKED="${names[0]}"
    return 0
  fi

  say ""
  info "$prompt"
  local i=1 line
  while IFS='|' read -r name host path; do
    printf '    %s%d%s) %s%-14s%s %s%s%s\n' "$B" "$i" "$N" "$B" "$name" "$N" "$DIM" "$host" "$N"
    i=$((i + 1))
  done < <(device_summary)
  say ""

  local choice
  read -rp "  Number (or Enter to cancel): " choice
  if [ -z "$choice" ]; then PICKED=""; return 1; fi
  if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "${#names[@]}" ]; then
    err "That is not one of the numbers above."
    PICKED=""
    return 1
  fi
  PICKED="${names[$((choice - 1))]}"
  return 0
}

# ------------------------------------------------------------- first run --

setup_wizard() {
  title "Set up a machine to sync with"

  info "This is where you tell Mirror about your ${B}other${N} computer — the one you"
  info "want to carry your boards to and from. You only do this once per machine."
  say ""
  info "You will need two things:"
  info "  ${B}1.${N} its ssh address, the bit that makes ${B}ssh you@laptop.local${N} work"
  info "  ${B}2.${N} where you cloned this project over there"
  say ""
  rule
  say ""

  local name host path
  read -rp "  A short name for it ${DIM}(e.g. laptop, pc, desktop)${N}: " name
  name="$(printf '%s' "$name" | tr -cd '[:alnum:]_-')"
  if [ -z "$name" ]; then
    err "A name is needed. Nothing was changed."
    return 1
  fi

  read -rp "  Its ssh address ${DIM}(e.g. ${USER}@laptop.local or ${USER}@192.168.1.42)${N}: " host
  if [ -z "$host" ]; then
    err "An address is needed. Nothing was changed."
    return 1
  fi

  read -rp "  Where this project lives there ${DIM}[~/Repos/mirror]${N}: " path
  [ -z "$path" ] && path="~/Repos/mirror"

  say ""
  info "Adding ${B}${name}${N} → ${host}:${path}"
  say ""

  if ! have_config; then
    node "$TOOL" init >/dev/null 2>&1
    # `init` writes a placeholder device; drop it so only real ones remain.
    node -e '
      const fs = require("fs");
      const p = process.argv[1];
      const c = JSON.parse(fs.readFileSync(p, "utf8"));
      c.devices = {};
      fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
    ' "$CONFIG" 2>/dev/null
  fi

  if ! node "$TOOL" add "$name" --host "$host" --path "$path"; then
    err "Could not save that. Nothing was changed."
    return 1
  fi

  say ""
  info "Now checking that ${B}${name}${N} answers…"
  say ""
  if node "$TOOL" status "$name"; then
    say ""
    info "${G}That machine is reachable.${N} You can send and fetch boards now."
  else
    say ""
    warn "Could not reach ${name} yet. The entry is saved, so fix the cause and retry."
    say ""
    info "Usual reasons:"
    info "  · the other machine is asleep, or not on this network"
    info "  · ssh is not enabled over there"
    info "  · this project is not cloned at ${B}${path}${N}"
    say ""
    info "Try this by hand to see the real error:"
    info "  ${B}ssh ${host}${N}"
    say ""
    info "If ssh asks for a password every time, set up a key once:"
    info "  ${B}ssh-keygen -t ed25519${N}"
    info "  ${B}ssh-copy-id ${host}${N}"
  fi
  return 0
}

# ------------------------------------------------------------- actions --

do_status() {
  local device="${1:-}"
  if [ -z "$device" ]; then
    pick_device "Check against which machine?" || return 0
    device="$PICKED"
  fi
  title "Comparing this computer with ${device}"
  info "${DIM}Nothing is copied — this only looks.${N}"
  node "$TOOL" status "$device"
}

do_push() {
  local device="${1:-}"
  if [ -z "$device" ]; then
    pick_device "Send your boards to which machine?" || return 0
    device="$PICKED"
  fi

  title "Send this computer's boards to ${device}"
  info "Direction:  ${B}this computer${N}  ${C}────▶${N}  ${B}${device}${N}"
  say ""
  info "The boards on ${B}${device}${N} will be ${B}replaced${N} by the ones here."
  info "A dated backup is made over there first, so it is undoable."
  say ""
  warn "Close the board app on ${device} before continuing."
  say ""
  rule

  node "$TOOL" push "$device"
}

do_pull() {
  local device="${1:-}"
  if [ -z "$device" ]; then
    pick_device "Fetch boards from which machine?" || return 0
    device="$PICKED"
  fi

  title "Bring ${device}'s boards to this computer"
  info "Direction:  ${B}${device}${N}  ${C}────▶${N}  ${B}this computer${N}"
  say ""
  info "The boards on ${B}this computer${N} will be ${B}replaced${N} by ${device}'s."
  info "A dated backup is made here first, in .db-backups/, so it is undoable."
  say ""

  if app_is_running; then
    warn "The board app looks like it is running on this computer."
    warn "Stop it first (Ctrl+C in its terminal), or the copy may not stick."
    say ""
    local go
    read -rp "  Carry on anyway? ${DIM}[y/N]${N} " go
    case "$go" in
      [yY]*) ;;
      *) info "Cancelled."; return 0 ;;
    esac
  fi
  rule

  node "$TOOL" pull "$device"
}

do_backup()  { title "Backing up this computer's boards"; node "$TOOL" backup; }
do_restore() { title "Restore a backup";                  node "$TOOL" restore "${1:-}"; }

do_devices() {
  title "Machines this computer knows about"
  node "$TOOL" devices
  say ""
  info "  ${B}a${N}) add another    ${B}r${N}) remove one    ${B}Enter${N}) back"
  say ""
  local pick
  read -rp "  Choice: " pick
  case "$pick" in
    a|A) setup_wizard ;;
    r|R)
      pick_device "Remove which machine?" || return 0
      node "$TOOL" remove "$PICKED"
      ;;
    *) ;;
  esac
}

do_where() {
  title "Where your work is kept"
  info "Everything you draw lives in one file:"
  info "  ${B}${ROOT}/data/study-board.db${N}"
  say ""
  info "That file is gitignored, so ${B}git push${N} never uploads your notes."
  info "This script is how it travels between your machines instead."
  say ""
  node "$TOOL" status
}

# ------------------------------------------------------------- the menu --

main_menu() {
  while true; do
    local n
    n="$(device_count)"

    say ""
    banner "Mirror — move your study board around"
    say ""

    if [ "$n" -eq 0 ]; then
      info "No other machine set up yet."
      say ""
      printf '    %s1%s) Set up my other computer   %s← start here%s\n' "$B" "$N" "$Y" "$N"
      printf '    %s2%s) Where is my work kept?\n' "$B" "$N"
      printf '    %s3%s) Back up my boards now\n' "$B" "$N"
      printf '    %s4%s) Restore a backup\n' "$B" "$N"
      printf '    %s5%s) Show the full command reference\n' "$B" "$N"
      printf '    %sq%s) Quit\n' "$B" "$N"
      say ""
      local pick
      read -rp "  Choice: " pick
      case "$pick" in
        1) setup_wizard; pause ;;
        2) do_where; pause ;;
        3) do_backup; pause ;;
        4) do_restore; pause ;;
        5) node "$TOOL" help | ${PAGER:-less -R} ;;
        q|Q|"") say ""; exit 0 ;;
        *) err "Pick a number from the list." ;;
      esac
    else
      printf '    %s1%s) Which side has the newer work?   %s(compare, copies nothing)%s\n' "$B" "$N" "$DIM" "$N"
      printf '    %s2%s) Send my boards to another machine %s(leaving this computer)%s\n' "$B" "$N" "$DIM" "$N"
      printf '    %s3%s) Fetch boards from another machine %s(arriving at this one)%s\n' "$B" "$N" "$DIM" "$N"
      say ""
      printf '    %s4%s) Back up my boards now\n' "$B" "$N"
      printf '    %s5%s) Restore a backup\n' "$B" "$N"
      printf '    %s6%s) Machines I sync with\n' "$B" "$N"
      printf '    %s7%s) Where is my work kept?\n' "$B" "$N"
      printf '    %s8%s) Show the full command reference\n' "$B" "$N"
      printf '    %sq%s) Quit\n' "$B" "$N"
      say ""
      local pick
      read -rp "  Choice: " pick
      case "$pick" in
        1) do_status; pause ;;
        2) require_ssh && do_push; pause ;;
        3) require_ssh && do_pull; pause ;;
        4) do_backup; pause ;;
        5) do_restore; pause ;;
        6) do_devices; pause ;;
        7) do_where; pause ;;
        8) node "$TOOL" help | ${PAGER:-less -R} ;;
        q|Q|"") say ""; exit 0 ;;
        *) err "Pick a number from the list." ;;
      esac
    fi
  done
}

usage() {
  cat <<EOF

  ${B}./sync.sh${N} — move your study board between your computers

  Run it with no arguments for a menu that walks you through it:

      ${B}./sync.sh${N}

  Or go straight to one thing:

      ${B}./sync.sh status${N} [machine]   which side has the newer work
      ${B}./sync.sh push${N}   [machine]   send your boards there
      ${B}./sync.sh pull${N}   [machine]   fetch their boards here
      ${B}./sync.sh setup${N}              add another computer
      ${B}./sync.sh backup${N}             snapshot this computer's boards
      ${B}./sync.sh restore${N} [file]     put a backup back

  Everything underneath is ${B}node ${TOOL}${N}; run
  ${B}node ${TOOL} help${N} for its full reference.

EOF
}

# ------------------------------------------------------------------ main --

require_node

if [ ! -f "$TOOL" ]; then
  err "Cannot find $TOOL — run this script from inside the project."
  exit 1
fi

trap 'say ""; say ""; info "Stopped. Nothing was left half-done."; exit 130' INT

case "${1:-}" in
  "")             main_menu ;;
  status|st)      do_status "${2:-}" ;;
  push|send)      require_ssh && do_push "${2:-}" ;;
  pull|get|fetch) require_ssh && do_pull "${2:-}" ;;
  setup|init|add) setup_wizard ;;
  backup)         do_backup ;;
  restore)        do_restore "${2:-}" ;;
  where|info)     do_where ;;
  help|-h|--help) usage ;;
  *)
    err "Do not know what \"$1\" means."
    usage
    exit 1
    ;;
esac

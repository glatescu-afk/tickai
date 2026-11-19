#!/usr/bin/env bash
#
# Tick.AI — bridge desktop « lance une fois et oublie » (démo mono-poste).
#
# Ce script, lancé UNE fois sur le Mac de démo, garde la machine éveillée et
# sert en continu le bridge desktop H Company sur un session_id FIXE. Le service
# cloud (Render) s'y attache via ce même id (variable HAI_DESKTOP_SESSION_ID).
# Si le bridge s'arrête (crash connu : il ne gère qu'une session à la fois), on
# le relance automatiquement avec le MÊME id — donc rien à reconfigurer côté
# Render entre deux tickets.
#
# Pré-requis (une fois) :
#   1) holo est connecté sur ce Mac (`holo login`) et les permissions macOS
#      (Accessibilité + Enregistrement de l'écran) sont accordées (`holo doctor`).
#   2) Sur Render, poser la variable d'environnement :
#         HAI_DESKTOP_SESSION_ID = <l'id affiché ci-dessous>
#      puis redémarrer le service une fois.
#
# Usage :
#   ./demo_desktop.sh                 # id par défaut (ci-dessous)
#   ./demo_desktop.sh <session-id>    # forcer un autre id
#   HAI_DESKTOP_SESSION_ID=... ./demo_desktop.sh
#
set -uo pipefail

# --- Réglages -------------------------------------------------------------
# Id de session FIXE de la démo. Doit être IDENTIQUE à HAI_DESKTOP_SESSION_ID
# sur Render. Priorité : argument > variable d'env > valeur par défaut.
DEFAULT_SESSION_ID="a08dae4b-6695-426e-babf-70df99d873d2"
SESSION_ID="${1:-${HAI_DESKTOP_SESSION_ID:-$DEFAULT_SESSION_ID}}"

RESTART_DELAY=3   # secondes entre deux relances du bridge

# --- Localisation du repo et de holo --------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Charge le .env du projet (HAI_API_KEY, HAI_BASE_URL) sans casser sur set -u.
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source ./.env 2>/dev/null || true
  set +a
fi

# holo du venv en priorité, sinon celui du PATH.
if [[ -x "$SCRIPT_DIR/.venv/bin/holo" ]]; then
  HOLO="$SCRIPT_DIR/.venv/bin/holo"
elif command -v holo >/dev/null 2>&1; then
  HOLO="$(command -v holo)"
else
  echo "✖ 'holo' introuvable (ni .venv/bin/holo ni dans le PATH). Installe le SDK ou active le venv." >&2
  exit 1
fi

# --- Anti-veille : garde le Mac éveillé tant que ce script tourne ---------
# -d écran, -i veille système au repos, -m disque, -s sur secteur, -u actif.
# -w <pid> : les verrous tiennent jusqu'à la fin de ce script.
caffeinate -dimsu -w "$$" &
CAFFEINATE_PID=$!

RUNNING=1
arreter() {
  RUNNING=0
  echo ""
  echo "⏹  Arrêt demandé — on coupe le bridge et on rend la veille au Mac."
  kill "$CAFFEINATE_PID" 2>/dev/null || true
  "$HOLO" local stop >/dev/null 2>&1 || true
  exit 0
}
trap arreter INT TERM

# --- Bannière -------------------------------------------------------------
echo "────────────────────────────────────────────────────────────────"
echo " Tick.AI — bridge desktop (served desktop)"
echo "────────────────────────────────────────────────────────────────"
echo " session_id servi : $SESSION_ID"
echo " holo             : $HOLO"
echo ""
echo " ⚠️  Sur Render, HAI_DESKTOP_SESSION_ID doit valoir EXACTEMENT :"
echo "        $SESSION_ID"
echo ""
echo " Le Mac reste éveillé tant que cette fenêtre tourne."
echo " Ctrl+C pour tout arrêter proprement."
echo "────────────────────────────────────────────────────────────────"
echo ""

# --- Boucle : sert le bridge, le relance s'il s'arrête --------------------
PREMIER=1
while [[ "$RUNNING" -eq 1 ]]; do
  if [[ "$PREMIER" -eq 0 ]]; then
    echo "↻  Bridge arrêté — nettoyage puis relance dans ${RESTART_DELAY}s…"
    "$HOLO" local stop >/dev/null 2>&1 || true
    sleep "$RESTART_DELAY"
    [[ "$RUNNING" -eq 1 ]] || break
  fi
  PREMIER=0
  echo "▶  $(date '+%H:%M:%S')  holo local desktop --session-id $SESSION_ID"
  "$HOLO" local desktop --session-id "$SESSION_ID" || true
done

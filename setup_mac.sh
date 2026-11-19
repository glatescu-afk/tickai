#!/usr/bin/env bash
#
# Tick.AI — installeur « un coup » du bridge desktop sur un Mac d'équipe.
#
# À lancer UNE fois sur la machine cible. Il :
#   1. installe le CLI holo (H Company) dans ~/.tickai/venv (rien d'autre du repo
#      n'est requis : le cerveau tourne dans le cloud) ;
#   2. connecte la machine au compte H (`holo login`) — DOIT être le MÊME compte
#      que le service Render (sinon l'agent ne peut pas s'attacher à la session) ;
#   3. installe un LaunchAgent qui lance le bridge au login, le relance s'il tombe
#      et garde le Mac éveillé (plus de terminal, plus de relance manuelle) ;
#   4. ouvre les réglages de permissions macOS à accorder (étape manuelle unique).
#
# Usage :
#   ./setup_mac.sh                 # session_id par défaut (démo mono-poste)
#   ./setup_mac.sh <session-id>    # id dédié à cette machine
#
set -uo pipefail

# session_id servi par ce Mac. DOIT correspondre à HAI_DESKTOP_SESSION_ID côté
# service (Render), OU être enregistré pour ce poste (multi-poste).
SESSION_ID="${1:-${HAI_DESKTOP_SESSION_ID:-a08dae4b-6695-426e-babf-70df99d873d2}}"

TICKAI_DIR="$HOME/.tickai"
VENV="$TICKAI_DIR/venv"
HOLO="$VENV/bin/holo"
LOG="$TICKAI_DIR/bridge.log"
LABEL="ai.tickai.bridge"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

echo "────────────────────────────────────────────────────────────"
echo " Tick.AI — installation du bridge desktop"
echo " session_id : $SESSION_ID"
echo "────────────────────────────────────────────────────────────"

# --- 1. Python + venv + holo ------------------------------------------------
if ! command -v python3 >/dev/null 2>&1; then
  echo "✖ Python 3 introuvable. Installe-le (https://www.python.org ou 'brew install python')." >&2
  exit 1
fi
mkdir -p "$TICKAI_DIR"
[ -d "$VENV" ] || python3 -m venv "$VENV"
echo "▸ Installation du CLI holo (hai-agents[cli,desktop])…"
"$VENV/bin/pip" install -q --upgrade pip
if ! "$VENV/bin/pip" install -q 'hai-agents[cli,desktop]'; then
  echo "✖ Échec de l'installation de hai-agents." >&2
  exit 1
fi

# --- 2. Connexion au compte H (même compte que Render) ----------------------
echo "▸ Connexion au compte H Company (une fenêtre de navigateur peut s'ouvrir)…"
echo "  ⚠️  Utilise le MÊME compte H que le service Render."
"$HOLO" login || { echo "✖ 'holo login' a échoué." >&2; exit 1; }

# --- 3. LaunchAgent : démarrage auto + relance + anti-veille ----------------
# caffeinate -dimsu lance holo et garde le Mac éveillé tant qu'il tourne ;
# quand holo s'arrête, caffeinate s'arrête → launchd (KeepAlive) le relance.
echo "▸ Installation du service de démarrage automatique (LaunchAgent)…"
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string>
    <string>-dimsu</string>
    <string>$HOLO</string>
    <string>local</string>
    <string>desktop</string>
    <string>--session-id</string>
    <string>$SESSION_ID</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST_EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load -w "$PLIST" && echo "  ✓ LaunchAgent chargé ($LABEL)" || echo "  ⚠️ launchctl load a échoué — vérifie $PLIST"

# --- 4. Permissions macOS (étape manuelle unique) ---------------------------
echo "▸ Vérification des permissions (holo doctor)…"
"$HOLO" doctor || true
echo ""
echo "────────────────────────────────────────────────────────────"
echo " DERNIÈRE ÉTAPE (une seule fois) : accorde à holo/Python ces 2 permissions"
echo "   • Accessibilité            (contrôle souris/clavier)"
echo "   • Enregistrement de l'écran (captures d'écran)"
echo " J'ouvre les réglages. Si une pop-up apparaît au 1er pilotage, accepte-la ;"
echo " sinon ajoute manuellement ce binaire (le grant est lié à ce chemin) :"
echo "   $VENV/bin/python"
echo ""
echo " NB : après avoir coché « Enregistrement de l'écran », le bridge se relance"
echo " tout seul (KeepAlive) pour la prendre en compte. Sur macOS Sequoia, cette"
echo " permission peut être redemandée périodiquement (comportement Apple)."
echo "────────────────────────────────────────────────────────────"
open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility" 2>/dev/null || true
open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture" 2>/dev/null || true

echo ""
echo "✅ Terminé. Le bridge tourne et redémarrera à chaque ouverture de session."
echo "   Logs        : $LOG"
echo "   Arrêter     : launchctl unload \"$PLIST\""
echo "   Relancer    : launchctl load -w \"$PLIST\""
echo "   session_id  : $SESSION_ID  (doit = HAI_DESKTOP_SESSION_ID côté Render)"

"""Diag N2 : pourquoi la session d'ACTION renvoie-t-elle 'failed' ?
On appelle run_session directement (sans la couche retry) et on inspecte tout."""
import os
from dotenv import load_dotenv
from hai_agents import Client
from capacites_macos import _RemediationN2

load_dotenv()
AGENT = os.getenv("HAI_DESKTOP_AGENT", "tickai-desktop")
client = Client()

MSG = (
    "Ouvre « Réglages Système » (System Settings) de macOS. Va dans « Notifications ». "
    "Sélectionne « Microsoft Teams ». Si « Autoriser les notifications » est désactivé, "
    "active-le. Décris l'action et l'état final."
)

def essayer(nom, **kw):
    print(f"\n=== {nom} (kwargs={list(kw)}) ===")
    try:
        r = client.run_session(agent=AGENT, messages=MSG, **kw)
        print("status   :", getattr(r, "status", "?"))
        print("answer   :", repr(getattr(r, "answer", None))[:300])
        fc = getattr(r, "final_changes", None)
        print("final    :", repr(fc)[:500])
    except Exception as e:  # noqa: BLE001
        print("EXCEPTION:", type(e).__name__, str(e)[:300])

# 1) exactement comme etape5 (qui marchait) : schéma, pas de timeout_seconds
essayer("avec schéma, sans timeout_seconds", answer_schema=_RemediationN2)
# 2) sans schéma du tout
essayer("sans schéma", )

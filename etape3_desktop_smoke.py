"""
Étape 3 — smoke test DESKTOP.
But : vérifier que l'agent `h/holo-desktop` peut VOIR et CONTRÔLER ce Mac
(vrais événements souris/clavier), avant de câbler l'action N1 dessus.

La première exécution déclenche les demandes de permission macOS
(Accessibilité + Enregistrement de l'écran) pour l'app qui lance ce script.

Lancer :  python etape3_desktop_smoke.py
"""
import os

from dotenv import load_dotenv
from hai_agents import Client

load_dotenv()

AGENT_NAME = os.getenv("HAI_DESKTOP_AGENT", "tickai-desktop")


def main() -> None:
    client = Client()

    # Agent custom : environnement "desktop" en mode visuel (voit l'écran,
    # bouge la vraie souris / tape au vrai clavier).
    try:
        client.agents.create_agent(
            name=AGENT_NAME,
            description="Agent Tick.AI pilotant le bureau local (mode visuel).",
            environments=[{"id": "poste", "kind": "desktop"}],
        )
        print(f"Agent desktop « {AGENT_NAME} » créé.")
    except Exception as e:  # noqa: BLE001 — agent déjà créé lors d'un run précédent
        print(f"(agent desktop déjà présent : {e})")

    print("Lancement d'une session desktop minimale (capture + description)…")
    result = client.run_session(
        agent=AGENT_NAME,
        messages=(
            "Prends une capture de l'écran et indique en une phrase quelle "
            "application est au premier plan. N'effectue AUCUNE autre action."
        ),
    )
    print("Statut :", result.status)
    print("Réponse :", result.answer)


if __name__ == "__main__":
    main()

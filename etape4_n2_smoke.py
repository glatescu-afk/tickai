"""
Étape 4 — smoke test DESKTOP pour N2 (Microsoft Teams).
But : vérifier que l'agent `kind:desktop` (mode visuel) VOIT la fenêtre Teams,
AVANT de lui confier l'action N2 (réactiver les notifications).

Lecture seule : capture + description. AUCUN clic, AUCUNE modification.
Lancer :  python etape4_n2_smoke.py
"""
import os

from dotenv import load_dotenv
from hai_agents import Client

load_dotenv()

AGENT_NAME = os.getenv("HAI_DESKTOP_AGENT", "tickai-desktop")


def main() -> None:
    client = Client()

    # Réutilise l'agent desktop déjà créé pour N1 (même environnement visuel).
    try:
        client.agents.create_agent(
            name=AGENT_NAME,
            description="Agent Tick.AI pilotant le bureau local (mode visuel).",
            environments=[{"id": "poste", "kind": "desktop"}],
        )
        print(f"Agent desktop « {AGENT_NAME} » créé.")
    except Exception as e:  # noqa: BLE001 — agent déjà créé lors d'un run précédent
        print(f"(agent desktop déjà présent : {e})")

    print("Session desktop (lecture seule) : l'agent regarde Teams…")
    result = client.run_session(
        agent=AGENT_NAME,
        messages=(
            "Microsoft Teams est déjà ouvert sur ce Mac mais peut être masqué "
            "derrière d'autres fenêtres. Amène la fenêtre de Microsoft Teams au "
            "premier plan (clique son icône dans le Dock, ou utilise le sélecteur "
            "d'applications Cmd+Tab). Prends ensuite une capture et décris en une "
            "ou deux phrases ce que tu vois dans Teams (vue active, et si tu "
            "repères l'accès aux Paramètres / Settings, en général via le menu « … » "
            "ou l'icône d'engrenage en haut). NE MODIFIE AUCUN réglage, ne fais "
            "qu'amener Teams au premier plan et l'observer."
        ),
    )
    print("Statut :", result.status)
    print("Réponse :", result.answer)


if __name__ == "__main__":
    main()

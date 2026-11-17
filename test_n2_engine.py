"""Test N2 ciblé, À TRAVERS tickai_core.engine (macOS).

Fait passer UN ticket N2 (notifications Teams) par le moteur complet :
décision en code -> 2 consentements (ici accordés) -> action agent ->
vérification indépendante -> résultat. L'agent prend la souris.
"""
import os

from dotenv import load_dotenv
from hai_agents import Client

from capacites_macos import capacite_n2_notifs
from tickai_core.engine import Ticket, TypeDemande, etat_suivi, traiter_ticket

load_dotenv()
AGENT = os.getenv("HAI_DESKTOP_AGENT", "tickai-n1-desktop")


def main() -> None:
    client = Client()
    try:
        client.agents.create_agent(
            name=AGENT, description="Agent Tick.AI desktop (mode visuel).",
            environments=[{"id": "poste", "kind": "desktop"}],
        )
    except Exception as e:  # noqa: BLE001 — déjà créé
        print(f"(agent desktop réutilisé : {e})")

    capacites = {TypeDemande.REMEDIATION: capacite_n2_notifs(client, AGENT)}

    # Ticket N2 : les deux consentements accordés (simule les 2 « Oui » du portail).
    ticket = Ticket(
        id="N2-TEST", demandeur_email="marie.durand@exemple.fr",
        type=TypeDemande.REMEDIATION, action="reactiver_notifications",
        application="Microsoft Teams", motif="Plus de notifications Teams",
        consentement_acces=True, consentement_correction=True,
    )

    print("→ N2 via engine (l'agent prend la souris)…\n")
    res = traiter_ticket(ticket, capacites=capacites,
                         on_progress=lambda e: print(f"   [progress] {e}"))

    print(f"\nissue           : {res.issue.value}")
    print(f"état tracker    : {etat_suivi(res.issue).value}")
    print(f"vérifié         : {res.verifie}")
    print(f"raison          : {res.raison}")
    print(f"preuve          : {res.preuve}")
    print(f"details         : {res.details}")
    print(f"durée           : {res.duree_s} s")


if __name__ == "__main__":
    main()

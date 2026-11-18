"""Démo locale end-to-end du cas micro Teams, À TRAVERS `tickai_core.engine`.

Chaque ticket passe par la boucle complète : décision EN CODE (policy) ->
action de l'agent (capacité micro Teams) -> vérification indépendante (appel test)
-> journal. C'est la version « sans n8n » : pratique pour mettre au point l'agent
et montrer le moteur. En production, c'est `service_api.py` que n8n appelle.

  HAI_DRY_RUN=1  -> prévisualisation : décisions seules, AUCUNE action machine.
  (sans)         -> exécution réelle (l'agent prend la main sur le poste Windows).

Pré-requis réel : poste Windows avec Teams, .env renseigné (HAI_API_KEY…).
Lancer :  python demo_local.py   |   HAI_DRY_RUN=1 python demo_local.py
"""
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from hai_agents import Client

from agent_teams import capacite_micro_teams
from tickai_core import audit
from tickai_core.engine import Ticket, TypeDemande, traiter_lot

load_dotenv()

DRY_RUN = os.getenv("HAI_DRY_RUN", "").strip().lower() in ("1", "true", "yes", "oui")
AGENT_NAME = os.getenv("HAI_DESKTOP_AGENT", "tickai-teams-desktop")
DATASET = Path("data/tickets_teams.json")


def charger_tickets() -> list[Ticket]:
    """Mappe le dataset micro vers le Ticket normalisé de l'engine (type REMEDIATION)."""
    donnees = json.loads(DATASET.read_text(encoding="utf-8")) if DATASET.exists() else []
    return [
        Ticket(
            id=t["id"],
            demandeur_email=t["demandeur_email"],
            type=TypeDemande.REMEDIATION,
            action=t["action_demandee"],
            application=t["application"],
            motif=t.get("motif", ""),
        )
        for t in donnees
    ]


def main() -> None:
    client = Client()
    try:
        client.agents.create_agent(
            name=AGENT_NAME,
            description="Agent Tick.AI micro Teams (Windows desktop, mode visuel).",
            environments=[{"id": "poste", "kind": "desktop"}],
        )
    except Exception as e:  # noqa: BLE001 — agent déjà créé
        print(f"(agent desktop réutilisé : {e})")

    capacites = {TypeDemande.REMEDIATION: capacite_micro_teams(client, AGENT_NAME)}

    tickets = charger_tickets()
    suffixe = " · DRY-RUN (décisions seules)" if DRY_RUN else ""
    print(f"{len(tickets)} ticket(s) · micro Teams via tickai_core.engine{suffixe}\n")

    resultats = traiter_lot(tickets, capacites=capacites, executer=not DRY_RUN)

    for r in resultats:
        print(f"[{r.ticket_id}] {r.issue.value.upper()} — {r.raison}")
        if r.intervention_agent:
            print(f"         vérifié={r.verifie} · preuve: {r.preuve[:120]}")
        print(f"         ({r.duree_s} s)")

    metr = audit.resumer([r.model_dump(mode="json") for r in resultats])
    print("\n========== MÉTRIQUES ==========")
    for k, v in metr.items():
        print(f"{k:28}: {v}")


if __name__ == "__main__":
    main()

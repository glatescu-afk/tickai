"""Étape 6 — démo end-to-end À TRAVERS tickai_core.engine (macOS).

Montre le moteur complet : chaque ticket passe par `engine.traiter_ticket`
(décision en code -> consentement -> action agent -> vérification indépendante
-> journal), via les Capacités concrètes macOS validées en réel.

  HAI_DRY_RUN=1  -> prévisualisation : décisions seules, AUCUNE action machine.
  (sans)         -> exécution réelle (l'agent prend la souris : ne touche à rien).

Pré-requis réel : Chrome connecté à GitLab (N1) et Teams installé (N2) au premier
plan ; .env avec HAI_API_KEY, CONSOLE_URL, GITLAB_GROUP.
"""
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from hai_agents import Client

from capacites_macos import capacite_n1_gitlab, capacite_n2_notifs
from tickai_core import audit
from tickai_core.engine import Ticket, TypeDemande, traiter_lot

load_dotenv()

DRY_RUN = os.getenv("HAI_DRY_RUN", "").strip().lower() in ("1", "true", "yes", "oui")
AGENT_NAME = os.getenv("HAI_DESKTOP_AGENT", "tickai-n1-desktop")


def _charger(chemin: str) -> list[dict]:
    p = Path(chemin)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else []


def construire_tickets() -> list[Ticket]:
    """Mappe les datasets N1/N2 existants vers le Ticket normalisé de l'engine."""
    tickets: list[Ticket] = []
    # N1 — on suppose employé actif + approbation manager accordée (données backend).
    for t in _charger("data/tickets_n1.json"):
        tickets.append(Ticket(
            id=t["id"], demandeur_email=t["demandeur_email"], type=TypeDemande.ACCES_LOGICIEL,
            role=t["role"], logiciel=t["logiciel"], motif=t.get("motif", ""),
            employe_actif=True, approbation_manager=True,
        ))
    # N2 — les DEUX consentements accordés (simule les 2 « Oui » du portail :
    # accès au poste + correction). Mettre consentement_correction=None pour
    # d'abord obtenir le diagnostic read-only et la proposition de correction.
    for t in _charger("data/tickets_n2.json"):
        tickets.append(Ticket(
            id=t["id"], demandeur_email=t["demandeur_email"], type=TypeDemande.REMEDIATION,
            action=t["action_demandee"], application=t["application"], motif=t.get("motif", ""),
            consentement_acces=True, consentement_correction=True,
        ))
    return tickets


def main() -> None:
    client = Client()
    try:
        client.agents.create_agent(
            name=AGENT_NAME,
            description="Agent Tick.AI desktop (mode visuel).",
            environments=[{"id": "poste", "kind": "desktop"}],
        )
    except Exception as e:  # noqa: BLE001 — agent déjà créé
        print(f"(agent desktop réutilisé : {e})")

    console_url = os.getenv("CONSOLE_URL", "")
    groupe = os.getenv("GITLAB_GROUP", "tickai-group1")
    capacites = {
        TypeDemande.ACCES_LOGICIEL: capacite_n1_gitlab(client, AGENT_NAME, console_url, groupe),
        TypeDemande.REMEDIATION: capacite_n2_notifs(client, AGENT_NAME),
    }

    tickets = construire_tickets()
    suffixe = " · DRY-RUN (décisions seules)" if DRY_RUN else ""
    print(f"{len(tickets)} ticket(s) via tickai_core.engine{suffixe}\n")

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

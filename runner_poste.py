"""Runner Tick.AI (poste macOS) — SQUELETTE à finaliser avec Sarah (backend).

Rôle : relier le backend (Next.js/Vercel, source de vérité) au moteur Python
`tickai_core`. C'est LE process qui tourne sur le Mac (là où vivent l'écran, la
souris et donc le bridge desktop H). Boucle simple :

    réclamer un ticket « prêt » au backend
        -> engine.traiter_ticket (décision en code + appels H Company)
        -> renvoyer progression (on_progress) et résultat au backend

Le backend, lui, tient l'état du ticket, le tracker 6 états, les consentements
et les mails. Le runner ne décide rien : il exécute et rend compte.

À convenir avec le backend (contrat HTTP, les 3 routes ci-dessous) :
  GET  /api/runner/next            -> un ticket au format `Ticket` (JSON), ou 204
  POST /api/tickets/{id}/progress  -> {"etape": "..."}  (avance le tracker, mails)
  POST /api/tickets/{id}/result    -> le `Resultat` (JSON)  (état final + mails)

Les CONSENTEMENTS ne sont pas demandés par le runner : le portail les enregistre
dans le ticket. Le runner ne reçoit un ticket « prêt » que lorsque l'étape
suivante est débloquée (accès, puis correction). Un ticket qui ressort en
EN_ATTENTE est simplement reposé côté backend jusqu'au prochain consentement.
"""
import os
import time

import httpx
from dotenv import load_dotenv
from hai_agents import Client

from capacites_macos import capacite_n1_gitlab, capacite_n2_notifs
from tickai_core.engine import Ticket, TypeDemande, traiter_ticket

load_dotenv()

BACKEND = os.environ.get("BACKEND_URL", "http://localhost:3000")
TOKEN = os.getenv("RUNNER_TOKEN", "")          # auth runner <-> backend
AGENT = os.getenv("HAI_DESKTOP_AGENT", "tickai-n1-desktop")

http = httpx.Client(
    base_url=BACKEND,
    headers={"Authorization": f"Bearer {TOKEN}"} if TOKEN else {},
    timeout=30,
)


def construire_capacites(client: Client) -> dict:
    """Crée (ou réutilise) l'agent desktop et assemble les capacités macOS."""
    try:
        client.agents.create_agent(
            name=AGENT, description="Agent Tick.AI desktop (mode visuel).",
            environments=[{"id": "poste", "kind": "desktop"}],
        )
    except Exception:  # noqa: BLE001 — déjà créé
        pass
    return {
        TypeDemande.ACCES_LOGICIEL: capacite_n1_gitlab(
            client, AGENT, os.getenv("CONSOLE_URL", ""), os.getenv("GITLAB_GROUP", "")),
        TypeDemande.REMEDIATION: capacite_n2_notifs(client, AGENT),
    }


def prochain_ticket() -> dict | None:
    """Réclame au backend un ticket prêt à être traité (ou None s'il n'y en a pas)."""
    r = http.get("/api/runner/next")
    return r.json() if r.status_code == 200 else None


def signaler_progres(ticket_id: str, etape: str) -> None:
    http.post(f"/api/tickets/{ticket_id}/progress", json={"etape": etape})


def envoyer_resultat(res) -> None:
    http.post(f"/api/tickets/{res.ticket_id}/result", json=res.model_dump(mode="json"))


def boucle() -> None:
    client = Client()
    capacites = construire_capacites(client)
    print("Runner Tick.AI prêt — en attente de tickets…")
    while True:
        brut = prochain_ticket()
        if brut is None:
            time.sleep(3)
            continue
        ticket = Ticket(**brut)   # le backend envoie déjà la forme Ticket
        print(f"→ traitement {ticket.id} ({ticket.type.value})")
        res = traiter_ticket(
            ticket, capacites=capacites,
            on_progress=lambda etape, tid=ticket.id: signaler_progres(tid, etape),
        )
        envoyer_resultat(res)
        print(f"← {ticket.id} : {res.issue.value}")


if __name__ == "__main__":
    boucle()

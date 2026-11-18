"""Service HTTP de Tick.AI — le point d'entrée appelé par **n8n** (workflow 2).

Contrat (cf. Guide Gabriel / Skill n8n, pris comme référence d'intégration) :

    POST /run
      body : {"demande_id": "...", "description": "...", "callback_url": "..."}
      -> réponse 202 IMMÉDIATE (une session d'agent est longue).

    À la fin, le service rappelle `callback_url` (POST) avec :
      {"succes": bool, "resultat": "...", "preuve": "...", "duree_s": 142}
      succes = true UNIQUEMENT si la vérification indépendante (appel test Teams)
      a confirmé. En cas d'erreur, on rappelle quand même avec succes=false.

Le service ne décide pas du statut final (`resolu`/`escalade`) ni des mails :
c'est n8n qui s'en charge d'après `succes`. Ici on exécute l'agent via l'engine
(`tickai_core`) puis on rend compte.

Lancer :  uvicorn service_api:app --host 0.0.0.0 --port 8000
(exposer via Render/Railway, ou un tunnel ngrok pour la démo.)
"""
from __future__ import annotations

import logging
import os
import threading
import typing

import httpx
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI
from pydantic import BaseModel

from agent_teams import capacite_micro_teams
from tickai_core.engine import Issue, Ticket, TypeDemande, traiter_ticket

load_dotenv()

logger = logging.getLogger("tickai.service")
logging.basicConfig(level=logging.INFO)

AGENT_NAME = os.getenv("HAI_DESKTOP_AGENT", "tickai-teams-desktop")

# Cas de démo figé : le niveau 1 agent = micro HS dans Teams (RB-20).
ACTION_MICRO = "corriger_micro_teams"
APPLICATION = "Microsoft Teams"

app = FastAPI(title="Tick.AI — service agent", version="0.1.0")

# Client H Company construit paresseusement (évite un appel réseau au démarrage).
# Les tâches de fond tournent dans un threadpool : le verrou évite une double
# création de l'agent si deux requêtes /run arrivent en même temps.
_client: typing.Any = None
_capacites: typing.Any = None
_init_lock = threading.Lock()


def _agent_pret() -> tuple[typing.Any, dict]:
    """Construit (une seule fois) le client H, l'agent desktop et les capacités."""
    global _client, _capacites
    if _capacites is not None:
        return _client, _capacites
    with _init_lock:
        if _capacites is not None:  # re-contrôle après acquisition du verrou
            return _client, _capacites
        from hai_agents import Client  # import tardif : pas requis pour /health

        client = Client()  # lit HAI_API_KEY
        try:
            client.agents.create_agent(
                name=AGENT_NAME,
                description="Agent Tick.AI micro Teams (Windows desktop, mode visuel).",
                environments=[{"id": "poste", "kind": "desktop"}],
            )
        except Exception as e:  # noqa: BLE001 — agent déjà créé lors d'un run précédent
            logger.info("agent desktop réutilisé par nom « %s » : %s", AGENT_NAME, e)
        _capacites = {TypeDemande.REMEDIATION: capacite_micro_teams(client, AGENT_NAME)}
        _client = client
    return _client, _capacites


# ---------------------------------------------------------------------------
# Schémas de la requête / du callback
# ---------------------------------------------------------------------------
class RunRequest(BaseModel):
    demande_id: str
    description: str = ""
    callback_url: str
    # Optionnel : enrichi depuis Supabase côté n8n si besoin [À IMPLÉMENTER].
    demandeur_email: str = "inconnu@tickai.local"


class CallbackPayload(BaseModel):
    succes: bool
    resultat: str
    preuve: str = ""
    duree_s: float = 0.0


# ---------------------------------------------------------------------------
# Exécution en tâche de fond : engine -> callback n8n
# ---------------------------------------------------------------------------
def _notifier(callback_url: str, payload: CallbackPayload) -> None:
    """Rappelle le webhook n8n (nœud Wait) avec le résultat de l'agent."""
    try:
        httpx.post(callback_url, json=payload.model_dump(), timeout=30)
    except Exception as e:  # noqa: BLE001 — on log, n8n a sa limite de temps (escalade)
        logger.error("callback n8n a échoué (%s) : %s: %s", callback_url, type(e).__name__, e)


def executer_agent(req: RunRequest) -> None:
    """Traite la demande via l'engine, puis rappelle n8n. Isolé : toute erreur -> succes=false."""
    try:
        _, capacites = _agent_pret()
        ticket = Ticket(
            id=req.demande_id,
            demandeur_email=req.demandeur_email,
            type=TypeDemande.REMEDIATION,
            action=ACTION_MICRO,
            application=APPLICATION,
            motif=req.description,
        )
        # [À IMPLÉMENTER bonus] : on_progress -> écrire les étapes dans la table
        # `journal` Supabase (agent_lance, correction_faite, verification_ok…).
        res = traiter_ticket(ticket, capacites=capacites)
        _notifier(req.callback_url, CallbackPayload(
            succes=res.issue is Issue.RESOLU,   # vrai seulement si l'appel test a confirmé
            resultat=res.details,
            preuve=res.preuve,
            duree_s=res.duree_s,
        ))
    except Exception as e:  # noqa: BLE001 — n8n doit toujours recevoir un callback
        logger.exception("échec de l'exécution de l'agent pour %s", req.demande_id)
        _notifier(req.callback_url, CallbackPayload(
            succes=False,
            resultat=f"Échec technique de l'agent : {type(e).__name__}: {e}",
        ))


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/run", status_code=202)
def run(req: RunRequest, background_tasks: BackgroundTasks) -> dict:
    """Accuse réception (202) et lance l'agent en tâche de fond."""
    background_tasks.add_task(executer_agent, req)
    return {"accepte": True, "demande_id": req.demande_id}

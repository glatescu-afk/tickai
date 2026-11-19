"""Service HTTP de Tick.AI — le point d'entrée appelé par **n8n** (workflow 2).

Contrat (cf. Guide Gabriel / Skill n8n, pris comme référence d'intégration) :

    POST /run
      body : {"demande_id": "...", "description": "...", "callback_url": "...",
              "session_id": "..."}
      -> réponse 202 IMMÉDIATE (une session d'agent est longue).

    À la fin, le service rappelle `callback_url` (POST) avec :
      {"succes": bool, "resultat": "...", "preuve": "...", "duree_s": 142}
      succes = true UNIQUEMENT si la vérification indépendante (appel test Teams)
      a confirmé. En cas d'erreur, on rappelle quand même avec succes=false.

Le service ne décide pas du statut final (`resolu`/`escalade`) ni des mails :
c'est n8n qui s'en charge d'après `succes`. Ici on exécute l'agent via l'engine
(`tickai_core`) puis on rend compte.

**Deux montages H Company (choisis par `HAI_SERVED_DESKTOP`) :**

- `HAI_SERVED_DESKTOP=1` (défaut, montage PRODUIT) — *served desktop*. Le service
  est **hébergé dans le cloud** (Render/Railway, sans écran) et pilote À DISTANCE
  le bureau d'une machine cible (celle du collaborateur, tout OS avec écran). Sur
  cette machine on lance une seule fois le bridge fin :
      holo local desktop        # imprime un session_id
  Le `session_id` arrive ici dans le body `/run` (ou, à défaut, via la variable
  `HAI_DESKTOP_SESSION_ID` pour un test mono-poste). On coupe l'auto-connect
  (`client.auto_bridges = False`) et on injecte le `session_id` dans l'entrée
  d'environnement desktop de l'agent (cf. doc H « your desktop », l'équivalent du
  `agent.environments[kind=desktop].session_id=<id>` du CLI).

- `HAI_SERVED_DESKTOP=0` (montage LOCAL de test) — *auto-connect*. Le service
  tourne SUR la machine à l'écran (ton Mac) et ouvre le bridge lui-même, comme
  avant. Pratique pour un premier test rapide via un tunnel ngrok.

Lancer :  uvicorn service_api:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import logging
import os
import re
import threading
import typing

import httpx
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI
from pydantic import BaseModel

from agent_teams import capacite_micro_teams, capacite_notifications_teams
from tickai_core.engine import Issue, Ticket, TypeDemande, traiter_ticket

load_dotenv()

logger = logging.getLogger("tickai.service")
logging.basicConfig(level=logging.INFO)

# Nom de base de l'agent desktop (en served desktop on y ajoute un suffixe de session).
AGENT_NAME = os.getenv("HAI_DESKTOP_AGENT", "tickai-teams-desktop")

# Montage : served desktop (produit, cloud) par défaut ; 0 = auto-connect local (Mac).
SERVED_DESKTOP = os.getenv("HAI_SERVED_DESKTOP", "1").strip().lower() not in ("0", "false", "no", "")
# Session de repli pour un test mono-poste (le vrai flux la reçoit dans /run).
SESSION_ID_DEFAUT = os.getenv("HAI_DESKTOP_SESSION_ID", "").strip()

# Cas agent niveau 1 (RB-20) : micro HS, OU notifications coupées, dans Teams.
ACTION_MICRO = "corriger_micro_teams"
ACTION_NOTIFS = "reactiver_notifications"
APPLICATION = "Microsoft Teams"
# categorie_id Supabase de « Notifications Teams » -> capacité notifications.
CATEGORIE_NOTIFS = 1

app = FastAPI(title="Tick.AI — service agent", version="0.2.0")

# Client H construit paresseusement (évite un appel réseau au démarrage). Les
# agents (un par session cible) sont mis en cache. Le verrou évite une double
# création concurrente quand deux requêtes /run arrivent en même temps.
_client: typing.Any = None
_agents: dict[str, typing.Any] = {}
_init_lock = threading.Lock()


def _client_pret() -> typing.Any:
    """Construit le client H une seule fois. En served desktop, coupe l'auto-connect."""
    global _client
    if _client is not None:
        return _client
    with _init_lock:
        if _client is not None:  # re-contrôle après acquisition du verrou
            return _client
        from hai_agents import Client  # import tardif : pas requis pour /health

        client = Client()  # lit HAI_API_KEY (+ HAI_BASE_URL)
        if SERVED_DESKTOP:
            # On ne veut PAS ouvrir un bridge local (le serveur cloud n'a pas
            # d'écran) : on se branche sur le bridge déjà servi par la machine
            # cible, via le session_id de l'agent. Le SDK lit `_auto_bridges`
            # (pas de setter public) : vérifié dans hai_agents/client.py.
            client._auto_bridges = False
        _client = client
    return _client


def _nom_agent(session_id: str) -> str:
    """Nom d'agent unique par session cible (chaque machine a son bridge/session_id)."""
    if not session_id:
        return AGENT_NAME
    suffixe = re.sub(r"[^a-zA-Z0-9]", "", session_id)[:24] or "default"
    return f"{AGENT_NAME}-{suffixe}"


def _agent_pour_session(client: typing.Any, session_id: str) -> str:
    """Crée (et met en cache) l'agent desktop lié à la session cible, renvoie son nom.

    En served desktop, le `session_id` de la machine cible est injecté dans
    l'entrée d'environnement desktop ; en auto-connect local, l'environnement
    reste générique (le bridge s'ouvre depuis ce process).
    """
    cle = session_id or "__local__"
    agent = _agents.get(cle)
    if agent is not None:
        return agent
    with _init_lock:
        if cle in _agents:  # re-contrôle après acquisition du verrou
            return _agents[cle]
        nom = _nom_agent(session_id)
        env: dict[str, typing.Any] = {"id": "poste", "kind": "desktop"}
        if SERVED_DESKTOP and session_id:
            env["session_id"] = session_id
        try:
            client.agents.create_agent(
                name=nom,
                description="Agent Tick.AI micro Teams (desktop, mode visuel).",
                environments=[env],
            )
        except Exception as e:  # noqa: BLE001 — agent déjà créé lors d'un run précédent
            logger.info("agent desktop réutilisé par nom « %s » : %s", nom, e)
        _agents[cle] = nom
        return nom


# ---------------------------------------------------------------------------
# Schémas de la requête / du callback
# ---------------------------------------------------------------------------
class RunRequest(BaseModel):
    demande_id: str
    description: str = ""
    callback_url: str
    # Machine cible (served desktop) : session imprimée par `holo local desktop`.
    # Vide => on retombe sur HAI_DESKTOP_SESSION_ID (test mono-poste).
    session_id: str = ""
    # Catégorie Supabase : choisit la capacité (1 = notifications, sinon micro).
    categorie_id: typing.Optional[int] = None
    # Optionnel : enrichi depuis Supabase côté n8n si besoin.
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
        session_id = req.session_id.strip() or SESSION_ID_DEFAUT
        if SERVED_DESKTOP and not session_id:
            # Produit : sans machine cible connue, on ne peut pas agir -> escalade côté n8n.
            _notifier(req.callback_url, CallbackPayload(
                succes=False,
                resultat="Aucune session cible (session_id) : la machine du collaborateur "
                         "n'a pas de bridge actif. Ticket à escalader.",
            ))
            return

        client = _client_pret()
        agent = _agent_pour_session(client, session_id)
        # Choix de la capacité selon la catégorie du ticket (notifications vs micro).
        if req.categorie_id == CATEGORIE_NOTIFS:
            capacite, action = capacite_notifications_teams(client, agent), ACTION_NOTIFS
        else:
            capacite, action = capacite_micro_teams(client, agent), ACTION_MICRO
        logger.info("capacité « %s » (categorie_id=%s) pour %s", action, req.categorie_id, req.demande_id)
        capacites = {TypeDemande.REMEDIATION: capacite}
        ticket = Ticket(
            id=req.demande_id,
            demandeur_email=req.demandeur_email,
            type=TypeDemande.REMEDIATION,
            action=action,
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
    return {"status": "ok", "served_desktop": SERVED_DESKTOP}


@app.post("/run", status_code=202)
def run(req: RunRequest, background_tasks: BackgroundTasks) -> dict:
    """Accuse réception (202) et lance l'agent en tâche de fond."""
    background_tasks.add_task(executer_agent, req)
    return {"accepte": True, "demande_id": req.demande_id}

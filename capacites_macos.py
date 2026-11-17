"""Capacités concrètes macOS pour Tick.AI (ce qui parle à H Company).

Deux `Capacite` branchées sur `tickai_core.engine`, qui reprennent EXACTEMENT les
flux validés en réel sur le Mac :
  - N1 (accès) : inviter un membre dans la console GitLab (mode desktop, vrais clics).
  - N2 (notifs) : réactiver les notifications dans Réglages Système (OS-level),
    avec un diagnostic read-only entre les deux consentements.

Chaque capacité fournit `agir` (l'action réelle via l'agent H) et `verifier` (une
session SÉPARÉE, en lecture seule = vérification indépendante). H Company est
entièrement encapsulé ici : l'engine ne le voit pas.

⚠️ On N'UTILISE PAS `answer_schema` (sortie structurée de H) : celle-ci a montré
des erreurs internes côté serveur H en mode desktop. À la place, on demande à
l'agent de terminer par un bloc JSON et on le parse nous-mêmes (robuste et
indépendant de cette fonctionnalité serveur).
"""
from __future__ import annotations

import json
import typing

from tickai_core.engine import Capacite, Ticket, Verification
from tickai_core.runner import run_session_fiable

_CONSIGNE_JSON = (
    " Termine ta réponse par un UNIQUE bloc JSON valide (et rien après), "
    "avec EXACTEMENT ces clés : {cles}."
)


def _extraire_json(answer: typing.Any) -> dict:
    """Extrait un objet JSON de la réponse de l'agent (dict, ou dernier {...} d'un texte)."""
    if isinstance(answer, dict):
        return answer
    if not isinstance(answer, str):
        return {}
    debut, fin = answer.find("{"), answer.rfind("}")
    if debut == -1 or fin == -1 or fin < debut:
        return {}
    try:
        return json.loads(answer[debut:fin + 1])
    except json.JSONDecodeError:
        return {}


def _session_json(client: typing.Any, agent: typing.Any, consigne: str) -> dict:
    """Lance une session (sans answer_schema) et renvoie le JSON parsé de la réponse."""
    res = run_session_fiable(client, agent=agent, messages=consigne)
    return _extraire_json(res.answer)


# ---------------------------------------------------------------------------
# N1 — Access Management (console GitLab, mode desktop)
# ---------------------------------------------------------------------------
def capacite_n1_gitlab(client: typing.Any, agent: typing.Any, console_url: str, groupe: str) -> Capacite:
    """Capacité N1 : invite le demandeur au groupe GitLab, puis vérifie sa présence."""

    def agir(ticket: Ticket) -> str:
        data = _session_json(client, agent, (
            f"Ouvre la page des membres du groupe GitLab : {console_url}. "
            "Le navigateur Google Chrome ouvert à l'écran est déjà connecté à GitLab "
            "(amène-le au premier plan si besoin). "
            f"Invite l'utilisateur « {ticket.demandeur_email} » comme membre du groupe "
            f"« {groupe} » avec le rôle « Developer », puis valide l'invitation. "
            "N'effectue AUCUNE autre modification (ne change aucun rôle, ne supprime personne)."
            + _CONSIGNE_JSON.format(cles='{"action_effectuee": "...", "membre": "...", "message": "..."}')
        ))
        return str(data.get("action_effectuee", "Invitation tentée."))

    def verifier(ticket: Ticket) -> Verification:
        data = _session_json(client, agent, (
            f"Ouvre la page des membres du groupe GitLab : {console_url}. "
            "Le navigateur Chrome est déjà connecté (amène-le au premier plan si besoin). "
            f"Vérifie, SANS rien modifier, si « {ticket.demandeur_email} » apparaît bien "
            f"dans la liste des membres du groupe « {groupe} » (invitation en attente = présent)."
            + _CONSIGNE_JSON.format(cles='{"acces_present": true/false, "details": "..."}')
        ))
        return Verification(ok=bool(data.get("acces_present", False)),
                            preuve=str(data.get("details", "")))

    return Capacite(agir=agir, verifier=verifier, requiert_consentement=False)


# ---------------------------------------------------------------------------
# N2 — Software Troubleshooting (Réglages Système macOS, OS-level)
# ---------------------------------------------------------------------------
def capacite_n2_notifs(client: typing.Any, agent: typing.Any) -> Capacite:
    """Capacité N2 : réactive les notifications de l'app dans Réglages Système,
    puis relit l'état du toggle. Un diagnostic READ-ONLY (entre les 2 accords)
    observe l'état et propose la correction."""

    def diagnostiquer(ticket: Ticket) -> str:
        app = ticket.application
        data = _session_json(client, agent, (
            f"Ouvre « Réglages Système » > « Notifications » > « {app} ». "
            "SANS RIEN MODIFIER, observe l'état de l'interrupteur « Autoriser les "
            "notifications » (Allow notifications) et décris ce que tu vois. Aucun clic de modification."
            + _CONSIGNE_JSON.format(cles='{"notifications_actives": true/false, "details": "..."}')
        ))
        actives = bool(data.get("notifications_actives", False))
        constat = str(data.get("details", ""))
        if actives:
            return f"Notifications déjà activées pour {app} ({constat})."
        return f"Notifications désactivées pour {app}. Correction proposée : les activer. ({constat})"

    def agir(ticket: Ticket) -> str:
        app = ticket.application
        data = _session_json(client, agent, (
            "Ouvre l'application « Réglages Système » (System Settings) de macOS "
            "(menu Pomme > Réglages Système, ou Spotlight ⌘-Espace). Va dans « Notifications ». "
            f"Dans la liste des applications, sélectionne « {app} ». Si l'interrupteur "
            "« Autoriser les notifications » (Allow notifications) est DÉSACTIVÉ, ACTIVE-le. "
            f"Ne modifie AUCUN autre réglage et AUCUNE autre application que « {app} »."
            + _CONSIGNE_JSON.format(cles='{"action_effectuee": "...", "etat_final": "ON/OFF"}')
        ))
        return str(data.get("action_effectuee", "Remédiation tentée."))

    def verifier(ticket: Ticket) -> Verification:
        app = ticket.application
        data = _session_json(client, agent, (
            f"Ouvre « Réglages Système » > « Notifications » > « {app} ». SANS rien modifier, "
            "indique si l'interrupteur « Autoriser les notifications » (Allow notifications) est ACTIVÉ. "
            "notifications_actives=true SEULEMENT si tu le vois explicitement en position activée."
            + _CONSIGNE_JSON.format(cles='{"notifications_actives": true/false, "details": "..."}')
        ))
        return Verification(ok=bool(data.get("notifications_actives", False)),
                            preuve=str(data.get("details", "")))

    return Capacite(agir=agir, verifier=verifier, requiert_consentement=True,
                    diagnostiquer=diagnostiquer)

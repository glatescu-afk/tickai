"""Capacité « micro HS dans Teams » (RB-20) — poste **Windows desktop**, via H Company.

Branche une `Capacite` sur `tickai_core.engine` pour le seul cas de la démo finale :
le micro d'un collaborateur ne fonctionne pas dans Microsoft Teams. La boucle est
celle de l'engine : décision EN CODE (policy) -> action agent -> **vérification
indépendante** (appel test Teams, session séparée en lecture seule) -> journal.

Règles de l'agent : voir `POLICY_AGENT_TEAMS.md` (RB-20 + garde-fous Banque). Ce
module traduit l'allowlist (§6) et le constat (§4) en consignes pour H ; le
contrôle d'autorisation reste, lui, dans `tickai_core.policy` (hors agent).

⚠️ SQUELETTE : `agir()` passe une consigne cadre (constat -> correction autorisée)
et laisse l'arbre de décision complet du §5 à affiner [À IMPLÉMENTER]. `verifier()`
est, lui, complet : c'est l'appel test Teams, seule preuve de succès.

On N'UTILISE PAS `answer_schema` (sorties structurées de H instables en desktop) :
l'agent termine par un bloc JSON qu'on parse nous-mêmes.
"""
from __future__ import annotations

import json
import typing

from tickai_core.engine import Capacite, Ticket, Verification
from tickai_core.runner import run_session_fiable

# Message affiché au collaborateur avant la prise de main (RB-20 / runbooks étape 3).
# Il INFORME, il ne demande pas d'accord (autonomie de l'agent).
MESSAGE_PRISE_EN_MAIN = (
    "Un agent va prendre le contrôle de votre ordinateur pendant quelques minutes "
    "pour résoudre ce problème. Vous pouvez l'arrêter à tout moment."
)

_CONSIGNE_JSON = (
    " Termine ta réponse par un UNIQUE bloc JSON valide (et rien après), "
    "avec EXACTEMENT ces clés : {cles}."
)

# Garde-fous rappelés à l'agent à chaque session (extrait de POLICY_AGENT_TEAMS.md §1).
_GARDE_FOUS = (
    "RÈGLES : ne modifie QUE les réglages autorisés listés ; un réglage grisé/"
    "verrouillé = politique entreprise, ne force rien ; pilotes uniquement via "
    "« Rechercher automatiquement les pilotes » de Windows ; pendant une réunion "
    "en cours ne ferme aucune application, ne change pas le micro, ne redémarre "
    "rien ; ne supprime aucune donnée ; arrête-toi après 2 échecs sur une étape."
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
# RB-20 — Son ou micro pendant une réunion Teams (Windows desktop)
# ---------------------------------------------------------------------------
def capacite_micro_teams(client: typing.Any, agent: typing.Any) -> Capacite:
    """Capacité micro Teams : constat lecture seule -> correction autorisée -> appel test.

    `requiert_consentement=False` : conforme aux runbooks (l'agent informe le
    collaborateur mais n'attend aucune validation pendant la résolution).
    """

    def diagnostiquer(ticket: Ticket) -> str:
        """Constat RB-20 en LECTURE SEULE (aucun réglage modifié). Voir POLICY §4."""
        data = _session_json(client, agent, (
            "Tu es technicien IT sur le poste Windows du collaborateur. Problème : "
            "son micro ne fonctionne pas dans Microsoft Teams. Fais UNIQUEMENT un "
            "CONSTAT, SANS rien modifier, en regardant dans l'ordre : "
            "(1) une autre application occupe-t-elle le micro (Paramètres > "
            "Confidentialité et sécurité > Microphone) ; "
            "(2) le bon micro est-il choisi dans Teams (… > Paramètres > Appareils) ; "
            "(3) le bon micro dans Windows (Paramètres > Système > Son > Entrée) ; "
            "(4) la barre de volume bouge-t-elle quand on parle ; "
            "(5) Teams est-il autorisé au micro (Confidentialité > Microphone) ; "
            "(6) le micro est-il activé dans le Gestionnaire de périphériques. "
            "Classe chaque point ok / pas_ok / non_verifie. Ne change RIEN."
            + _CONSIGNE_JSON.format(
                cles='{"constat": {"...": "ok|pas_ok|non_verifie"}, '
                     '"point_bloquant": "...", "correction_proposee": "..."}')
        ))
        bloquant = str(data.get("point_bloquant", "")) or "aucun point bloquant identifié"
        proposee = str(data.get("correction_proposee", "")) or "escalade"
        return f"Constat RB-20 : {bloquant}. Correction proposée : {proposee}."

    def agir(ticket: Ticket) -> str:
        """Applique UNE correction de l'allowlist (POLICY §6). [À IMPLÉMENTER : l'arbre
        de décision complet §5 — ici consigne cadre bornée par l'allowlist]."""
        data = _session_json(client, agent, (
            f"{MESSAGE_PRISE_EN_MAIN} "
            "Tu es technicien IT sur le poste Windows du collaborateur. Corrige le "
            "micro dans Microsoft Teams en appliquant UNIQUEMENT, selon le constat, "
            "l'une de ces corrections AUTORISÉES (et rien d'autre) : "
            "sélectionner le bon micro dans Teams (Paramètres > Appareils) ; "
            "sélectionner le bon périphérique dans Windows (Son > Entrée) ; "
            "remonter le curseur de volume d'entrée s'il est à zéro ; "
            "activer les autorisations micro de Teams (Confidentialité > Microphone : "
            "« Accès au micro », « Autoriser les applications de bureau », Microsoft Teams) ; "
            "activer le micro dans le Gestionnaire de périphériques, ou mettre à jour "
            "son pilote via la recherche automatique Windows. "
            f"{_GARDE_FOUS}"
            + _CONSIGNE_JSON.format(
                cles='{"action_effectuee": "...", "reglage_modifie": "...", "message": "..."}')
        ))
        return str(data.get("action_effectuee", "Correction micro tentée."))

    def verifier(ticket: Ticket) -> Verification:
        """Vérification INDÉPENDANTE = appel test Teams (session séparée, lecture seule).

        succès (ok=True) UNIQUEMENT si la voix est rejouée dans l'appel test.
        """
        data = _session_json(client, agent, (
            "Dans Microsoft Teams (desktop), ouvre … > Paramètres > Appareils, puis "
            "clique sur « Faire un appel test ». Parle quelques secondes quand c'est "
            "demandé, puis écoute. SANS modifier aucun réglage, indique si ta voix a "
            "bien été REJOUÉE. voix_rejouee=true SEULEMENT si tu l'as explicitement "
            "entendue rejouée."
            + _CONSIGNE_JSON.format(cles='{"voix_rejouee": true/false, "details": "..."}')
        ))
        return Verification(
            ok=bool(data.get("voix_rejouee", False)),
            preuve=str(data.get("details", "")),
        )

    return Capacite(
        agir=agir,
        verifier=verifier,
        requiert_consentement=False,
        diagnostiquer=diagnostiquer,
    )

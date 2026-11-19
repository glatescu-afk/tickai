"""Capacité « micro HS dans Teams » (RB-20) — poste **macOS desktop**, via H Company.

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

# Consigne d'ARRÊT : empêche l'agent de boucler / « ne pas s'arrêter ». À placer
# juste avant _CONSIGNE_JSON (le bloc JSON doit rester le tout dernier élément).
_CONSIGNE_ARRET = (
    " Procède par étapes courtes et NE REFAIS JAMAIS une vérification déjà faite. "
    "Dès que tu as de quoi conclure — OU si tu es bloqué / ne trouves pas un écran — "
    "ARRÊTE-TOI immédiatement et renvoie le bloc JSON (remplis les clés au mieux, "
    "mets non_verifie / escalade si besoin). N'explore plus rien après ça."
)

# Bornes de session (côté serveur H via run_session_fiable). Garde-fou DUR : la
# session se termine d'elle-même au-delà, même si l'agent ne converge pas.
_MAX_STEPS_CONSTAT = 15      # constat en lecture seule : court
_MAX_STEPS_CORRECTION = 25   # une correction + revérification locale
_MAX_STEPS_VERIF = 15        # appel test Teams : court
_IDLE_TIMEOUT_S = 150        # arrêt si l'agent reste inactif trop longtemps

# Garde-fous rappelés à l'agent à chaque session (extrait de POLICY_AGENT_TEAMS.md §1).
_GARDE_FOUS = (
    "RÈGLES : ne modifie QUE les réglages autorisés listés ; un réglage grisé/"
    "verrouillé (cadenas, géré par MDM) = politique entreprise, ne force rien ; "
    "ne touche à aucun pilote ni réglage système hors de ceux listés ; pendant une "
    "réunion en cours ne ferme aucune application, ne change pas le micro, ne "
    "redémarre rien ; ne supprime aucune donnée ; arrête-toi après 2 échecs sur une étape."
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


def _session_json(
    client: typing.Any,
    agent: typing.Any,
    consigne: str,
    *,
    max_steps: int,
    idle_timeout_s: int = _IDLE_TIMEOUT_S,
) -> dict:
    """Lance une session (sans answer_schema) BORNÉE et renvoie le JSON parsé.

    `max_steps` / `idle_timeout_s` garantissent que la session s'arrête côté
    serveur même si l'agent ne converge pas (plus de prise de main sans fin).
    """
    res = run_session_fiable(
        client, agent=agent, messages=consigne,
        max_steps=max_steps, idle_timeout_s=idle_timeout_s,
    )
    return _extraire_json(res.answer)


# ---------------------------------------------------------------------------
# RB-20 — Son ou micro pendant une réunion Teams (macOS desktop)
# ---------------------------------------------------------------------------
def capacite_micro_teams(client: typing.Any, agent: typing.Any) -> Capacite:
    """Capacité micro Teams : constat lecture seule -> correction autorisée -> appel test.

    `requiert_consentement=False` : conforme aux runbooks (l'agent informe le
    collaborateur mais n'attend aucune validation pendant la résolution).
    """

    def diagnostiquer(ticket: Ticket) -> str:
        """Constat RB-20 en LECTURE SEULE (aucun réglage modifié). Voir POLICY §4."""
        data = _session_json(client, agent, (
            "Tu es technicien IT sur le Mac (macOS) du collaborateur. Problème : "
            "son micro ne fonctionne pas dans Microsoft Teams. Fais UNIQUEMENT un "
            "CONSTAT, SANS rien modifier, en regardant dans l'ordre : "
            "(1) le bon micro est-il choisi dans Teams (menu « … » Paramètres et plus, "
            "ou photo de profil en haut à droite > Paramètres > Appareils > Microphone) ; "
            "(2) le bon périphérique d'entrée est-il choisi dans macOS (menu Pomme > "
            "Réglages Système > Son > onglet Entrée) ; "
            "(3) la barre « Niveau d'entrée » bouge-t-elle quand on parle (Réglages "
            "Système > Son > Entrée) ; "
            "(4) le volume d'entrée n'est-il pas à zéro ; "
            "(5) Teams est-il autorisé au micro (Réglages Système > Confidentialité et "
            "sécurité > Microphone > Microsoft Teams) ; "
            "(6) le casque/micro a-t-il un bouton Mute physique resté coupé. "
            "Classe chaque point ok / pas_ok / non_verifie. Ne change RIEN."
            + _CONSIGNE_ARRET
            + _CONSIGNE_JSON.format(
                cles='{"constat": {"...": "ok|pas_ok|non_verifie"}, '
                     '"point_bloquant": "...", "correction_proposee": "..."}')
        ), max_steps=_MAX_STEPS_CONSTAT)
        bloquant = str(data.get("point_bloquant", "")) or "aucun point bloquant identifié"
        proposee = str(data.get("correction_proposee", "")) or "escalade"
        return f"Constat RB-20 : {bloquant}. Correction proposée : {proposee}."

    def agir(ticket: Ticket) -> str:
        """Applique UNE correction de l'allowlist (POLICY §6). [À IMPLÉMENTER : l'arbre
        de décision complet §5 — ici consigne cadre bornée par l'allowlist]."""
        data = _session_json(client, agent, (
            f"{MESSAGE_PRISE_EN_MAIN} "
            "Tu es technicien IT sur le Mac (macOS) du collaborateur. Corrige le "
            "micro dans Microsoft Teams en appliquant UNIQUEMENT, selon le constat, "
            "l'une de ces corrections AUTORISÉES (et rien d'autre) : "
            "sélectionner le bon micro dans Teams (menu « … » ou photo de profil > "
            "Paramètres > Appareils > Microphone) ; "
            "sélectionner le bon périphérique d'entrée dans macOS (Réglages Système > "
            "Son > Entrée) ; "
            "remonter le volume d'entrée s'il est à zéro (Réglages Système > Son > Entrée) ; "
            "autoriser Teams au micro (Réglages Système > Confidentialité et sécurité > "
            "Microphone : activer « Microsoft Teams ») — dans ce cas, quitte Teams "
            "(Cmd+Q) puis rouvre-le pour que l'autorisation prenne effet (JAMAIS "
            "pendant une réunion en cours). "
            f"{_GARDE_FOUS}"
            + _CONSIGNE_ARRET
            + _CONSIGNE_JSON.format(
                cles='{"action_effectuee": "...", "reglage_modifie": "...", "message": "..."}')
        ), max_steps=_MAX_STEPS_CORRECTION)
        return str(data.get("action_effectuee", "Correction micro tentée."))

    def verifier(ticket: Ticket) -> Verification:
        """Vérification INDÉPENDANTE par RELECTURE D'ÉTAT (session séparée, lecture seule).

        Un agent computer-use ne peut pas « entendre » : on ne s'appuie donc pas sur
        l'« appel test » Teams (de plus indisponible sur compte perso). On relit, dans
        une session distincte, que le micro est maintenant CORRECTEMENT CONFIGURÉ —
        même logique que la vérif par relecture du cas notifications (RB).
        ok=True seulement si les trois points sont bons.
        """
        data = _session_json(client, agent, (
            "Tu es technicien IT sur le Mac (macOS). Vérifie, SANS RIEN MODIFIER, que "
            "le micro est maintenant correctement configuré pour Microsoft Teams, en "
            "relisant dans l'ordre : "
            "(a) dans Teams (menu « … » Paramètres et plus, ou photo de profil > "
            "Paramètres > Appareils), un microphone PRÉCIS est sélectionné (pas "
            "« Aucun » ni vide) et, si une barre de niveau d'entrée est visible, elle "
            "n'est pas figée à zéro ; "
            "(b) dans Réglages Système > Son > Entrée, le bon périphérique est choisi "
            "et le volume d'entrée n'est pas à zéro ; "
            "(c) dans Réglages Système > Confidentialité et sécurité > Microphone, "
            "« Microsoft Teams » est bien AUTORISÉ (interrupteur activé). "
            "micro_ok=true SEULEMENT si (a), (b) et (c) sont TOUS bons ; sinon false."
            + _CONSIGNE_ARRET
            + _CONSIGNE_JSON.format(cles='{"micro_ok": true/false, "details": "..."}')
        ), max_steps=_MAX_STEPS_VERIF)
        return Verification(
            ok=bool(data.get("micro_ok", False)),
            preuve=str(data.get("details", "")),
        )

    return Capacite(
        agir=agir,
        verifier=verifier,
        requiert_consentement=False,
        diagnostiquer=diagnostiquer,
    )

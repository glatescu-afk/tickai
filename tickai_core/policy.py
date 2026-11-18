"""Couche de sécurité de Tick.AI : décider, EN CODE, ce qu'un agent a le droit de faire.

Principe directeur (exigence de gouvernance) : la prévention des actions
dangereuses ne doit PAS reposer sur des instructions texte données à l'agent.
Ici la décision est prise **avant** toute action, par du code déterministe et
testable, indépendant du raisonnement de l'agent.

Posture : **default-deny**. Rien ne s'exécute qui ne soit explicitement autorisé.
Trois issues possibles :

  - AUTORISE : action au catalogue + habilitation OK  -> l'agent peut agir.
  - REFUSE   : « non » certain  -> soit action INTERDITE DURE (destructive),
               soit règle d'habilitation qui refuse. Auto-traité, journalisé.
  - ESCALADE : on ne peut pas trancher sûrement (rôle / action / app inconnus)
               -> JAMAIS exécuté, routé vers un humain.

Défense en profondeur : la liste d'interdits durs (`ACTIONS_INTERDITES`) est
évaluée EN PREMIER et prime sur le catalogue d'autorisations — ainsi une erreur
d'édition du catalogue ne peut pas, à elle seule, laisser passer une action
destructive.

Ce module est volontairement pur (aucun appel réseau, aucun import de l'agent) :
il se teste instantanément et reste la source unique de vérité pour la sécurité.
À terme, les catalogues seront chargés depuis une config/API de politique
versionnée plutôt qu'écrits en dur ici.

Entrées attendues **canoniques** (ex. rôle « developpeur », app « Microsoft
Teams ») : la comparaison aux catalogues est exacte, sensible à la casse et aux
espaces. C'est un choix fail-safe : un libellé non reconnu tombe en ESCALADE ou
REFUSE, JAMAIS en AUTORISE par erreur. La normalisation des libellés (si besoin)
est du ressort de l'appelant (portail / normalisation du ticket), en amont.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Decision(str, Enum):
    """Issue d'une évaluation de politique."""

    AUTORISE = "autorise"
    REFUSE = "refuse"
    ESCALADE = "escalade"
    ATTENTE = "attente"     # pré-requis manquant mais rattrapable (approbation, licence)


class Risque(str, Enum):
    """Niveau de risque associé à la décision (sert au tri/priorisation humaine)."""

    AUCUN = "aucun"        # action autorisée, sûre
    FAIBLE = "faible"      # refus de routine (habilitation)
    ELEVE = "eleve"        # action interdite dure (tentative potentiellement destructive)
    INCONNU = "inconnu"    # cas non couvert -> humain


@dataclass(frozen=True)
class Evaluation:
    """Résultat déterministe d'une décision de politique.

    `escalade_humaine` dit à l'appelant (moteur / portail) s'il faut router la
    demande vers un humain. La MANIÈRE d'escalader (file, email…) n'est pas du
    ressort de la politique : elle reste côté moteur/intégration.
    """

    decision: Decision
    raison: str
    escalade_humaine: bool
    risque: Risque

    @property
    def peut_agir(self) -> bool:
        """Vrai uniquement si l'agent est explicitement autorisé à agir."""
        return self.decision is Decision.AUTORISE


# ---------------------------------------------------------------------------
# Catalogues (politique de l'entreprise). En dur pour l'instant ; à charger
# depuis une config/API versionnée plus tard. Source unique de vérité.
# ---------------------------------------------------------------------------

# N1 — Access Management : matrice rôle -> {logiciel: durée max d'accès en JOURS}.
# (doc TECH §4 : p.ex. Design -> Figma Éditeur, 90 jours max.)
MATRICE_ACCES: dict[str, dict[str, int]] = {
    "developpeur": {"GitLab": 365, "Jira": 365, "VSCode": 365},
    "support": {"Zendesk": 365, "Jira": 365},
    "stagiaire": {"VSCode": 90},
    "design": {"Figma": 90},
}

# N2 — Software Troubleshooting : remédiations sûres autorisées par application.
# `corriger_micro_teams` = cas de démo (RB-20) : l'agent corrige UNIQUEMENT les
# réglages son/micro listés dans l'allowlist (voir POLICY_AGENT_TEAMS.md §6).
REMEDIATIONS_PAR_ACTION: dict[str, frozenset[str]] = {
    "corriger_micro_teams": frozenset({"Microsoft Teams"}),
    "reactiver_notifications": frozenset({"Microsoft Teams", "Outlook", "Slack"}),
}

# Interdits DURS : jamais exécutés, quel que soit l'auteur ou le catalogue.
# Défense en profondeur : prime sur toute autorisation. Tout ce qui est
# destructif, affaiblit la sécurité du poste ou supprime des accès/données.
ACTIONS_INTERDITES: frozenset[str] = frozenset(
    {
        "desactiver_pare_feu",
        "desactiver_antivirus",
        "desactiver_gatekeeper",
        "desactiver_chiffrement",
        "desactiver_filevault",
        "desactiver_2fa",
        "supprimer_membre",
        "supprimer_compte",
        "supprimer_fichiers",
        "accorder_role_admin",
        "ouvrir_acces_production",
    }
)


# ---------------------------------------------------------------------------
# Évaluateurs
# ---------------------------------------------------------------------------
def _interdiction_dure(action: str) -> Evaluation | None:
    """Barrière prioritaire : si l'action est interdite dure, refus immédiat."""
    if action in ACTIONS_INTERDITES:
        return Evaluation(
            decision=Decision.REFUSE,
            raison=(
                f"Action {action!r} interdite par la politique de sécurité "
                f"(potentiellement destructive / affaiblissant la sécurité). "
                f"Jamais exécutée par un agent."
            ),
            escalade_humaine=False,  # « non » net : pas besoin d'humain pour trancher
            risque=Risque.ELEVE,
        )
    return None


def evaluer_acces_logiciel(
    role: str,
    logiciel: str,
    *,
    employe_actif: bool = True,
    approbation_manager: bool = False,
    licence_disponible: bool = True,
    duree_jours: typing.Optional[int] = None,
) -> Evaluation:
    """N1 — Décide si l'on peut accorder l'accès `logiciel` à un `role`.

    Applique les **5 contrôles** du doc TECH §4, dans l'ordre (default-deny) :
      1. employé actif      -> sinon REFUSE (compte inactif, « non »).
      2. rôle + logiciel     -> rôle inconnu : ESCALADE ; logiciel non habilité : REFUSE.
      3. durée conforme      -> durée demandée > max du rôle : REFUSE.
      4. approbation manager -> absente : ATTENTE (rattrapable, boucle de validation).
      5. licence disponible  -> indisponible : ATTENTE (rattrapable).
    Tout OK -> AUTORISE.

    Les entrées 1/4/5 (statut RH, approbation, inventaire licences) sont fournies
    par l'appelant (backend) qui les lit dans ses données ; la politique reste pure.
    N1 repose sur une matrice fermée (rôle -> logiciels) : un accès sensible non
    listé n'est jamais AUTORISE.
    """
    # 1. Employé actif ?
    if not employe_actif:
        return Evaluation(
            decision=Decision.REFUSE,
            raison="Compte de l'employé inactif : aucun accès accordé.",
            escalade_humaine=False,
            risque=Risque.FAIBLE,
        )

    # 2. Rôle connu + logiciel habilité ?
    droits = MATRICE_ACCES.get(role)
    if droits is None:
        return Evaluation(
            decision=Decision.ESCALADE,
            raison=f"Rôle {role!r} inconnu : aucune habilitation définie, décision humaine requise.",
            escalade_humaine=True,
            risque=Risque.INCONNU,
        )
    if logiciel not in droits:
        return Evaluation(
            decision=Decision.REFUSE,
            raison=(
                f"{logiciel} non autorisé pour le rôle {role!r} "
                f"(autorisés : {', '.join(sorted(droits))})."
            ),
            escalade_humaine=False,
            risque=Risque.FAIBLE,
        )

    # 3. Durée conforme au maximum du rôle ?
    max_jours = droits[logiciel]
    if duree_jours is not None and duree_jours > max_jours:
        return Evaluation(
            decision=Decision.REFUSE,
            raison=(
                f"Durée demandée {duree_jours} j > maximum {max_jours} j pour "
                f"{logiciel} / rôle {role!r}."
            ),
            escalade_humaine=False,
            risque=Risque.FAIBLE,
        )

    # 4. Approbation manager présente ? (sinon en attente, rattrapable)
    if not approbation_manager:
        return Evaluation(
            decision=Decision.ATTENTE,
            raison=f"Accès {logiciel} éligible, en attente de l'approbation du manager.",
            escalade_humaine=False,
            risque=Risque.FAIBLE,
        )

    # 5. Licence disponible ?
    if not licence_disponible:
        return Evaluation(
            decision=Decision.ATTENTE,
            raison=f"Accès {logiciel} approuvé, en attente d'une licence disponible.",
            escalade_humaine=False,
            risque=Risque.FAIBLE,
        )

    return Evaluation(
        decision=Decision.AUTORISE,
        raison=f"{logiciel} autorisé pour le rôle {role!r} (durée, approbation, licence OK).",
        escalade_humaine=False,
        risque=Risque.AUCUN,
    )


def evaluer_remediation(action: str, application: str) -> Evaluation:
    """N2 — Décide si l'on peut exécuter la remédiation `action` sur `application`.

    Ordre d'évaluation (défense en profondeur) :
      1. interdit dur            -> REFUSE (prioritaire).
      2. action inconnue         -> ESCALADE (hors catalogue sûr -> humain).
      3. action connue, app hors périmètre -> ESCALADE (humain confirme le périmètre).
      4. action connue + app au périmètre  -> AUTORISE.
    """
    dure = _interdiction_dure(action)
    if dure is not None:
        return dure

    apps = REMEDIATIONS_PAR_ACTION.get(action)
    if apps is None:
        return Evaluation(
            decision=Decision.ESCALADE,
            raison=(
                f"Remédiation {action!r} hors catalogue sûr : non reconnue comme "
                f"action autorisée, décision humaine requise."
            ),
            escalade_humaine=True,
            risque=Risque.INCONNU,
        )
    if application not in apps:
        return Evaluation(
            decision=Decision.ESCALADE,
            raison=(
                f"{application} hors périmètre pour l'action {action!r} "
                f"(apps couvertes : {', '.join(sorted(apps))}) : confirmation humaine requise."
            ),
            escalade_humaine=True,
            risque=Risque.INCONNU,
        )
    return Evaluation(
        decision=Decision.AUTORISE,
        raison=f"Remédiation {action!r} autorisée pour {application!r}.",
        escalade_humaine=False,
        risque=Risque.AUCUN,
    )

"""Engine Tick.AI : l'orchestrateur unique et stable pour l'équipe.

`traiter_ticket(ticket, capacites, ...) -> Resultat` enchaîne :
  1. **policy**        — décide EN CODE (AUTORISE / REFUSE / ESCALADE / ATTENTE), avant tout agent.
  2. **consentement**  — si l'action touche le POSTE de l'utilisateur (règle TECH §6),
                         DEUX accords explicites : #1 accès au poste (avant toute session,
                         même le diagnostic read-only), #2 correction (après le diagnostic).
                         Manquant -> EN_ATTENTE ; refusé -> ESCALADE.
  3. **capacite.agir** — exécute l'action (fonction injectée ; H Company vit dedans, côté runner).
  4. **capacite.verifier** — VÉRIFICATION INDÉPENDANTE, de préférence EN CODE.
  5. **audit**         — journalise une ligne immuable.

Un callback optionnel `on_progress(etape)` émet l'avancement ("decision",
"diagnostic", "action", "verification", "termine") pour que le backend fasse
avancer le tracker « Suivi de ma demande » (6 états) et envoie les mails.
`etat_suivi(issue)` donne l'état de tracker correspondant à une issue.
"""
from __future__ import annotations

import time
import typing
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, model_validator

from tickai_core import audit, policy
from tickai_core.policy import Decision, Evaluation, Risque


# ---------------------------------------------------------------------------
# Contrat d'ENTRÉE : le ticket normalisé (ce que l'équipe produit)
# ---------------------------------------------------------------------------
class TypeDemande(str, Enum):
    ACCES_LOGICIEL = "acces_logiciel"   # N1 — Access Management
    REMEDIATION = "remediation"         # N2 — Software Troubleshooting


class Ticket(BaseModel):
    """Demande entrante normalisée. Les champs requis dépendent du `type`.

    Deux consentements pour les actions sur le poste (N2), chacun None = pas
    encore demandé / en attente, True = oui, False = refusé. Le backend/portail
    les renseigne au bon moment (doc TECH §6).
    """

    id: str
    demandeur_email: str
    type: TypeDemande
    motif: str = ""

    # N1 — accès logiciel (role/logiciel requis ; les 3 suivants fournis par le
    # backend depuis ses données RH / approbations / inventaire licences).
    role: typing.Optional[str] = None
    logiciel: typing.Optional[str] = None
    employe_actif: bool = True
    approbation_manager: bool = False
    licence_disponible: bool = True
    duree_jours: typing.Optional[int] = None

    # N2 — remédiation
    action: typing.Optional[str] = None
    application: typing.Optional[str] = None

    # Consentements (actions sur le poste de l'utilisateur)
    consentement_acces: typing.Optional[bool] = None       # #1 : accès au poste
    consentement_correction: typing.Optional[bool] = None  # #2 : correction proposée
    consentement_portee: typing.Optional[str] = None       # ce que l'accord couvre (audit)

    @model_validator(mode="after")
    def _champs_requis_par_type(self) -> "Ticket":
        if self.type is TypeDemande.ACCES_LOGICIEL:
            manquants = [n for n in ("role", "logiciel") if getattr(self, n) is None]
        else:
            manquants = [n for n in ("action", "application") if getattr(self, n) is None]
        if manquants:
            raise ValueError(
                f"Ticket {self.id} de type {self.type.value} : champ(s) requis manquant(s) : "
                f"{', '.join(manquants)}."
            )
        return self


# ---------------------------------------------------------------------------
# Résultat d'une vérification indépendante (rendu par une Capacite)
# ---------------------------------------------------------------------------
class Verification(BaseModel):
    ok: bool
    preuve: str = ""   # ce qui a été observé (ligne de base lue, sortie PowerShell…)


# ---------------------------------------------------------------------------
# Contrat de SORTIE : le résultat stable (ce que l'équipe consomme)
# ---------------------------------------------------------------------------
class Issue(str, Enum):
    RESOLU = "resolu"            # autorisé, agi ET vérifié indépendamment -> OK
    NON_VERIFIE = "non_verifie"  # autorisé et agi, mais la vérif indépendante ne confirme pas
    REFUSE = "refuse"            # la politique a dit non (certain)
    ESCALADE = "escalade"        # cas incertain / consentement refusé -> humain
    EN_ATTENTE = "en_attente"    # autorisé mais en attente (consentement/approbation) -> pas d'action
    ECHEC = "echec"              # échec technique (session/agent) malgré autorisation
    A_EXECUTER = "a_executer"    # autorisé mais exécution différée (executer=False)


class EtatSuivi(str, Enum):
    """Les 6 états du tracker « Suivi de ma demande » (flowchart utilisateur)."""

    ENVOYEE = "envoyee"
    PRISE_EN_CHARGE = "prise_en_charge"
    TRAITEMENT = "traitement"
    A_VERIFIER = "a_verifier"
    RESOLU = "resolu"
    CLOTURE = "cloture"


# Mapping issue -> état du tracker. La CLÔTURE n'est jamais produite par l'engine :
# elle vient de la confirmation de l'utilisateur (flowchart F). refuse/escalade/echec
# partent vers le support humain (E), affichés « pris en charge ».
_ETAT_PAR_ISSUE: dict[Issue, EtatSuivi] = {
    Issue.A_EXECUTER: EtatSuivi.PRISE_EN_CHARGE,
    Issue.EN_ATTENTE: EtatSuivi.PRISE_EN_CHARGE,
    Issue.NON_VERIFIE: EtatSuivi.A_VERIFIER,
    Issue.RESOLU: EtatSuivi.RESOLU,
    Issue.REFUSE: EtatSuivi.PRISE_EN_CHARGE,
    Issue.ESCALADE: EtatSuivi.PRISE_EN_CHARGE,
    Issue.ECHEC: EtatSuivi.PRISE_EN_CHARGE,
}


def etat_suivi(issue: Issue) -> EtatSuivi:
    """État du tracker à afficher pour une issue donnée (jamais CLOTURE : la
    clôture vient de la confirmation utilisateur, pas de l'engine)."""
    return _ETAT_PAR_ISSUE[issue]


class Resultat(BaseModel):
    """Verdict stable d'un ticket. `issue` pilote la suite côté appelant."""

    ticket_id: str
    demandeur_email: str
    type: TypeDemande
    issue: Issue
    decision_securite: Decision
    raison: str
    risque: Risque
    escalade_humaine: bool
    intervention_agent: bool
    verifie: typing.Optional[bool]   # résultat de la vérif indépendante (None si pas d'action)
    preuve: str                      # preuve de la vérif (vide si non applicable)
    details: str
    duree_s: float
    horodatage: str


# ---------------------------------------------------------------------------
# Point d'extension : ce qui est propre à chaque TYPE de demande
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class Capacite:
    """Comment AGIR et VÉRIFIER pour un type de demande (injecté, pas codé en dur).

    - `agir(ticket) -> str` : exécute l'action réelle (peut lancer une session H).
    - `verifier(ticket) -> Verification` : contrôle INDÉPENDANT, de préférence en code.
    - `requiert_consentement` : True si l'action touche le POSTE (N2) -> 2 accords.
    - `diagnostiquer(ticket) -> str` (optionnel, N2) : inspection READ-ONLY qui
      décrit le problème et propose une correction, exécutée entre les 2 accords.
    """

    agir: typing.Callable[["Ticket"], str]
    verifier: typing.Callable[["Ticket"], Verification]
    requiert_consentement: bool = False
    diagnostiquer: typing.Optional[typing.Callable[["Ticket"], str]] = None


# ---------------------------------------------------------------------------
# Décision de sécurité (dispatch vers la bonne règle de politique)
# ---------------------------------------------------------------------------
def _evaluer(ticket: Ticket) -> Evaluation:
    if ticket.type is TypeDemande.ACCES_LOGICIEL:
        return policy.evaluer_acces_logiciel(
            ticket.role, ticket.logiciel,
            employe_actif=ticket.employe_actif,
            approbation_manager=ticket.approbation_manager,
            licence_disponible=ticket.licence_disponible,
            duree_jours=ticket.duree_jours,
        )
    return policy.evaluer_remediation(ticket.action, ticket.application)


def _maintenant() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _progres(on_progress: typing.Optional[typing.Callable[[str], None]], etape: str) -> None:
    if on_progress is not None:
        on_progress(etape)


def _resultat(
    ticket: Ticket, *, issue: Issue, ev: Evaluation, escalade_humaine: bool,
    intervention_agent: bool, verifie: typing.Optional[bool], preuve: str,
    details: str, debut: float,
) -> Resultat:
    return Resultat(
        ticket_id=ticket.id, demandeur_email=ticket.demandeur_email, type=ticket.type,
        issue=issue, decision_securite=ev.decision, raison=ev.raison, risque=ev.risque,
        escalade_humaine=escalade_humaine, intervention_agent=intervention_agent,
        verifie=verifie, preuve=preuve, details=details,
        duree_s=round(time.time() - debut, 1), horodatage=_maintenant(),
    )


def _peut_etre_journaliser(res: Resultat, journaliser: bool) -> Resultat:
    if journaliser:
        audit.journaliser(res.model_dump(mode="json"))
    return res


# ---------------------------------------------------------------------------
# Traitement d'UN ticket — le cœur du contrat
# ---------------------------------------------------------------------------
def traiter_ticket(
    ticket: Ticket,
    *,
    capacites: typing.Optional[typing.Mapping[TypeDemande, Capacite]] = None,
    executer: bool = True,
    journaliser: bool = True,
    on_progress: typing.Optional[typing.Callable[[str], None]] = None,
) -> Resultat:
    """Décide, (éventuellement) agit + vérifie, journalise, renvoie un `Resultat`.

    - executer=False : on ne fait QUE la décision de sécurité (prévisualisation).
    - AUTORISE + executer : nécessite une `Capacite`. Les actions sur le poste
      exigent les 2 consentements (accès puis correction) avant d'agir.
    - on_progress(etape) : callback d'avancement pour le tracker/les mails.
    """
    debut = time.time()
    ev = _evaluer(ticket)
    _progres(on_progress, "decision")

    # --- Refus / escalade / attente de politique ---
    if ev.decision is Decision.REFUSE:
        return _peut_etre_journaliser(_resultat(
            ticket, issue=Issue.REFUSE, ev=ev, escalade_humaine=ev.escalade_humaine,
            intervention_agent=False, verifie=None, preuve="", details=ev.raison, debut=debut), journaliser)
    if ev.decision is Decision.ESCALADE:
        return _peut_etre_journaliser(_resultat(
            ticket, issue=Issue.ESCALADE, ev=ev, escalade_humaine=True,
            intervention_agent=False, verifie=None, preuve="", details=ev.raison, debut=debut), journaliser)
    if ev.decision is Decision.ATTENTE:
        # Pré-requis rattrapable (approbation manager, licence) : boucle de validation.
        return _peut_etre_journaliser(_resultat(
            ticket, issue=Issue.EN_ATTENTE, ev=ev, escalade_humaine=False,
            intervention_agent=False, verifie=None, preuve="", details=ev.raison, debut=debut), journaliser)

    # --- AUTORISE mais exécution différée (prévisualisation) ---
    if not executer:
        return _peut_etre_journaliser(_resultat(
            ticket, issue=Issue.A_EXECUTER, ev=ev, escalade_humaine=False,
            intervention_agent=False, verifie=None, preuve="",
            details="Autorisé ; exécution différée.", debut=debut), journaliser)

    # --- AUTORISE + executer : il faut une capacité ---
    capacite = (capacites or {}).get(ticket.type)
    if capacite is None:
        raise ValueError(
            f"Aucune Capacite fournie pour le type {ticket.type.value} : impossible d'exécuter."
        )

    # --- Deux consentements (règle non négociable pour les actions sur le poste) ---
    if capacite.requiert_consentement:
        # #1 Accès au poste (avant toute session, même le diagnostic read-only).
        if ticket.consentement_acces is False:
            return _peut_etre_journaliser(_resultat(
                ticket, issue=Issue.ESCALADE, ev=ev, escalade_humaine=True,
                intervention_agent=False, verifie=None, preuve="",
                details="Accès au poste refusé par l'utilisateur : aucune action, escalade.",
                debut=debut), journaliser)
        if ticket.consentement_acces is not True:
            return _peut_etre_journaliser(_resultat(
                ticket, issue=Issue.EN_ATTENTE, ev=ev, escalade_humaine=False,
                intervention_agent=False, verifie=None, preuve="",
                details="En attente de l'accord d'accès au poste (consentement #1).",
                debut=debut), journaliser)

        # #2 Correction. Si pas encore décidé et qu'un diagnostic read-only existe,
        # on diagnostique et on propose la correction, puis on attend l'accord #2.
        if ticket.consentement_correction is False:
            return _peut_etre_journaliser(_resultat(
                ticket, issue=Issue.ESCALADE, ev=ev, escalade_humaine=True,
                intervention_agent=False, verifie=None, preuve="",
                details="Correction refusée par l'utilisateur : rien modifié, escalade.",
                debut=debut), journaliser)
        if ticket.consentement_correction is not True:
            proposition = ""
            if capacite.diagnostiquer is not None:
                _progres(on_progress, "diagnostic")
                try:
                    proposition = capacite.diagnostiquer(ticket)
                except Exception as e:  # noqa: BLE001 — échec technique isolé
                    return _peut_etre_journaliser(_resultat(
                        ticket, issue=Issue.ECHEC, ev=ev, escalade_humaine=True,
                        intervention_agent=True, verifie=False, preuve="",
                        details=f"Échec technique (diagnostic) : {type(e).__name__}: {e}",
                        debut=debut), journaliser)
            details = (
                (f"Diagnostic : {proposition}. " if proposition else "")
                + "En attente de l'accord de correction (consentement #2)."
            )
            return _peut_etre_journaliser(_resultat(
                ticket, issue=Issue.EN_ATTENTE, ev=ev, escalade_humaine=False,
                intervention_agent=bool(proposition), verifie=None, preuve="",
                details=details, debut=debut), journaliser)

    # --- Action + vérification INDÉPENDANTE ---
    try:
        _progres(on_progress, "action")
        detail_action = capacite.agir(ticket)
        _progres(on_progress, "verification")
        verif = capacite.verifier(ticket)
    except Exception as e:  # noqa: BLE001 — échec technique isolé par ticket
        return _peut_etre_journaliser(_resultat(
            ticket, issue=Issue.ECHEC, ev=ev, escalade_humaine=True,
            intervention_agent=True, verifie=False, preuve="",
            details=f"Échec technique : {type(e).__name__}: {e}", debut=debut), journaliser)

    _progres(on_progress, "termine")
    issue = Issue.RESOLU if verif.ok else Issue.NON_VERIFIE
    details = (
        f"{detail_action} | Vérification indépendante : "
        + ("confirmée." if verif.ok else "NON confirmée.")
    )
    return _peut_etre_journaliser(_resultat(
        ticket, issue=issue, ev=ev, escalade_humaine=False, intervention_agent=True,
        verifie=verif.ok, preuve=verif.preuve, details=details, debut=debut), journaliser)


def traiter_lot(
    tickets: typing.Sequence[Ticket],
    **kwargs: typing.Any,
) -> list[Resultat]:
    """Traite une liste de tickets (chacun isolé) et renvoie les résultats."""
    return [traiter_ticket(t, **kwargs) for t in tickets]

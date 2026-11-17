"""tickai_core — cœur réutilisable du moteur Tick.AI.

Pensé pour être appelé par le portail de tickets / les déclencheurs de l'équipe
SANS connaître H Company. Point d'entrée public : `engine.traiter_ticket`.
"""

from tickai_core.policy import (
    Decision,
    Evaluation,
    Risque,
    evaluer_acces_logiciel,
    evaluer_remediation,
)
from tickai_core.runner import (
    EchecSessionError,
    run_session_fiable,
)
from tickai_core.engine import (
    Capacite,
    EtatSuivi,
    Issue,
    Resultat,
    Ticket,
    TypeDemande,
    Verification,
    etat_suivi,
    traiter_lot,
    traiter_ticket,
)

__all__ = [
    # policy
    "Decision",
    "Evaluation",
    "Risque",
    "evaluer_acces_logiciel",
    "evaluer_remediation",
    # runner
    "EchecSessionError",
    "run_session_fiable",
    # engine (contrat public)
    "Capacite",
    "EtatSuivi",
    "Issue",
    "Resultat",
    "Ticket",
    "TypeDemande",
    "Verification",
    "etat_suivi",
    "traiter_ticket",
    "traiter_lot",
]

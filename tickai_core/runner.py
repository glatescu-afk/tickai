"""Couche de fiabilité de Tick.AI : exécuter une session d'agent de façon robuste.

Problèmes traités (cf. diagnostic bridge dans la mémoire projet) :

  1. **Bruit de log bénin.** Comme une machine n'a qu'UN bureau, lancer deux
     sessions desktop à la suite (action puis vérification indépendante) fait que
     la 2ᵉ « déplace » le bridge de la 1ʳᵉ, déjà terminée. Le SDK logge alors
     `local bridge for session … crashed; cancelling the session` : c'est
     cosmétique, pas une panne. On le fait taire pour une sortie propre.
     ⚠️ La CORRECTION ne repose jamais sur les logs : elle s'appuie sur le
     STATUT terminal renvoyé par la session. Faire taire le log est donc sûr.

  2. **Vrais échecs transitoires.** Un statut `failed` / `timed_out` /
     `interrupted`, ou une exception réseau, peut survenir. On **retente** un
     nombre borné de fois, puis on lève une erreur claire que le moteur isole
     par ticket.

Statuts acceptés tels quels : `completed` et `idle` (l'agent a fini son tour ;
nos runs renvoient souvent `idle` avec une réponse valide).
"""
from __future__ import annotations

import contextlib
import logging
import typing

# Constantes AUTORITATIVES du SDK (évite toute dérive de notre côté).
from hai_agents.polling import TERMINAL_SESSION_STATUSES

logger = logging.getLogger("tickai_core.runner")

# Nom du logger du SDK qui émet le bruit de bridge (sessions.py, manager.py…).
_LOGGER_SDK_LOCAL = "hai_agents_local"

# Statuts terminaux qui comptent comme un ÉCHEC à retenter (tout terminal sauf
# le succès). `idle` n'est pas terminal et reste accepté.
ECHECS_A_RETENTER: frozenset[str] = frozenset(TERMINAL_SESSION_STATUSES - {"completed"})


class EchecSessionError(RuntimeError):
    """Une session a fini sur un statut d'échec après toutes les tentatives."""

    def __init__(self, statut: str, tentatives: int) -> None:
        super().__init__(
            f"Session terminée en échec (statut={statut!r}) après {tentatives} tentative(s)."
        )
        self.statut = statut
        self.tentatives = tentatives


def statut_normalise(resultat: typing.Any) -> str:
    """Statut en minuscules, que ce soit une str, un enum ou un objet imbriqué."""
    s = getattr(resultat, "status", resultat)
    s = getattr(s, "status", s)   # cas objet {status: {status: "..."}}
    s = getattr(s, "value", s)    # cas enum
    return str(s).lower()


@contextlib.contextmanager
def logs_sdk_silencieux(niveau: int = logging.CRITICAL) -> typing.Iterator[None]:
    """Fait taire le bruit du SDK local pendant le bloc, puis restaure le niveau.

    On remonte le niveau du logger `hai_agents_local` : ses enfants
    (`.sessions`, `.manager`) héritent de ce niveau tant qu'ils n'en fixent pas
    un propre, donc le `crashed`/`stopping bridge` (ERROR/WARNING) est masqué.
    Sûr car la correction s'appuie sur le statut de session, pas sur ces logs.
    """
    lg = logging.getLogger(_LOGGER_SDK_LOCAL)
    ancien = lg.level
    lg.setLevel(niveau)
    try:
        yield
    finally:
        lg.setLevel(ancien)


def run_session_fiable(
    client: typing.Any,
    *,
    agent: typing.Any,
    messages: str,
    answer_schema: typing.Optional[type] = None,
    tentatives: int = 2,
    timeout_seconds: float = 180.0,
    wait_for_seconds: int = 20,
    silencer: bool = True,
) -> typing.Any:
    """Lance une session en encaissant le bruit et les échecs transitoires.

    Renvoie le `SessionRunResult` dès qu'un statut *réglé non-échec*
    (`completed`/`idle`) est obtenu. Retente sur statut d'échec terminal ou sur
    exception, jusqu'à `tentatives`. Lève `EchecSessionError` ou la dernière
    exception si tout échoue — le moteur isole ce cas par ticket.
    """
    if tentatives < 1:
        raise ValueError("tentatives doit être >= 1")

    derniere_exc: typing.Optional[BaseException] = None
    dernier_statut = "inconnu"

    for essai in range(1, tentatives + 1):
        try:
            gestion = logs_sdk_silencieux() if silencer else contextlib.nullcontext()
            with gestion:
                resultat = client.run_session(
                    agent=agent,
                    messages=messages,
                    answer_schema=answer_schema,
                    timeout_seconds=timeout_seconds,
                    wait_for_seconds=wait_for_seconds,
                )
        except Exception as e:  # noqa: BLE001 — on veut retenter les transitoires
            derniere_exc = e
            logger.warning(
                "Session en exception (essai %d/%d) : %s: %s",
                essai, tentatives, type(e).__name__, e,
            )
            continue

        dernier_statut = statut_normalise(resultat)
        if dernier_statut in ECHECS_A_RETENTER:
            logger.warning(
                "Session en échec (statut=%s, essai %d/%d) — nouvelle tentative.",
                dernier_statut, essai, tentatives,
            )
            derniere_exc = None
            continue

        # completed / idle -> réglé, on rend la main.
        return resultat

    # Toutes les tentatives épuisées.
    if derniere_exc is not None:
        raise derniere_exc
    raise EchecSessionError(dernier_statut, tentatives)

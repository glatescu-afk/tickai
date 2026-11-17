"""Tests de la couche de fiabilité `tickai_core.runner`.

Utilise un faux client scripté : aucune session réelle, aucun réseau. Valide la
logique de retry, l'acceptation de `completed`/`idle`, et le silencieux de logs.
Lancer :  python -m unittest discover -s tests
"""
import logging
import types
import unittest

from tickai_core.runner import (
    EchecSessionError,
    logs_sdk_silencieux,
    run_session_fiable,
    statut_normalise,
)


def _resultat(statut: str, answer="ok"):
    return types.SimpleNamespace(status=statut, answer=answer)


class FauxClient:
    """run_session consomme un script : chaque élément est soit un statut (renvoyé),
    soit une Exception (levée). Compte les appels."""

    def __init__(self, script):
        self._script = list(script)
        self.appels = 0

    def run_session(self, **_kwargs):
        self.appels += 1
        element = self._script.pop(0)
        if isinstance(element, Exception):
            raise element
        return _resultat(element)


class TestRunSessionFiable(unittest.TestCase):
    def test_completed_du_premier_coup(self):
        c = FauxClient(["completed"])
        res = run_session_fiable(c, agent="a", messages="m")
        self.assertEqual(statut_normalise(res), "completed")
        self.assertEqual(c.appels, 1)

    def test_idle_accepte_sans_retry(self):
        c = FauxClient(["idle"])
        res = run_session_fiable(c, agent="a", messages="m")
        self.assertEqual(statut_normalise(res), "idle")
        self.assertEqual(c.appels, 1)

    def test_retente_sur_statut_echec_puis_reussit(self):
        c = FauxClient(["interrupted", "completed"])
        res = run_session_fiable(c, agent="a", messages="m", tentatives=2)
        self.assertEqual(statut_normalise(res), "completed")
        self.assertEqual(c.appels, 2)

    def test_echec_persistant_leve_erreur(self):
        c = FauxClient(["failed", "failed"])
        with self.assertRaises(EchecSessionError) as ctx:
            run_session_fiable(c, agent="a", messages="m", tentatives=2)
        self.assertEqual(ctx.exception.statut, "failed")
        self.assertEqual(c.appels, 2)

    def test_retente_sur_exception_puis_reussit(self):
        c = FauxClient([RuntimeError("réseau"), "completed"])
        res = run_session_fiable(c, agent="a", messages="m", tentatives=2)
        self.assertEqual(statut_normalise(res), "completed")
        self.assertEqual(c.appels, 2)

    def test_exception_persistante_relevee(self):
        boom = RuntimeError("réseau KO")
        c = FauxClient([boom, boom])
        with self.assertRaises(RuntimeError):
            run_session_fiable(c, agent="a", messages="m", tentatives=2)
        self.assertEqual(c.appels, 2)

    def test_tentatives_invalides(self):
        c = FauxClient(["completed"])
        with self.assertRaises(ValueError):
            run_session_fiable(c, agent="a", messages="m", tentatives=0)


class TestSilencieux(unittest.TestCase):
    def test_niveau_restaure_apres_le_bloc(self):
        lg = logging.getLogger("hai_agents_local")
        lg.setLevel(logging.INFO)
        with logs_sdk_silencieux():
            self.assertEqual(lg.level, logging.CRITICAL)
        self.assertEqual(lg.level, logging.INFO)


if __name__ == "__main__":
    unittest.main()

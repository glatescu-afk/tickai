"""Tests du contrat public `tickai_core.engine`.

Capacités fictives (agir/verifier/diagnostiquer = closures locales) : aucune
session réelle, aucun réseau. Valide le mapping décision -> issue, les DEUX
consentements, la vérification indépendante, le callback de progression et le
mapping vers le tracker. Lancer :  python -m unittest discover -s tests
"""
import tempfile
import unittest
from pathlib import Path

from pydantic import ValidationError

from tickai_core import audit
from tickai_core.engine import (
    Capacite,
    EtatSuivi,
    Issue,
    Ticket,
    TypeDemande,
    Verification,
    etat_suivi,
    traiter_ticket,
)


def _ticket_acces(role="developpeur", logiciel="GitLab", approbation_manager=True):
    return Ticket(id="T-1", demandeur_email="a@b.fr", type=TypeDemande.ACCES_LOGICIEL,
                  role=role, logiciel=logiciel, motif="test", approbation_manager=approbation_manager)


def _ticket_remediation(action="reactiver_notifications", application="Microsoft Teams",
                        acces=None, correction=None):
    return Ticket(id="T-2", demandeur_email="a@b.fr", type=TypeDemande.REMEDIATION,
                  action=action, application=application, motif="test",
                  consentement_acces=acces, consentement_correction=correction)


class _Compteur:
    def __init__(self, verif_ok=True, avec_diagnostic=False):
        self.agir_appels = self.verif_appels = self.diag_appels = 0
        self._verif_ok = verif_ok
        self._avec_diagnostic = avec_diagnostic

    def agir(self, _t) -> str:
        self.agir_appels += 1
        return "action exécutée"

    def verifier(self, _t) -> Verification:
        self.verif_appels += 1
        return Verification(ok=self._verif_ok, preuve="relu en base")

    def diagnostiquer(self, _t) -> str:
        self.diag_appels += 1
        return "notifications désactivées, activation proposée"

    def capacite(self, requiert_consentement=False) -> Capacite:
        return Capacite(
            agir=self.agir, verifier=self.verifier,
            requiert_consentement=requiert_consentement,
            diagnostiquer=self.diagnostiquer if self._avec_diagnostic else None,
        )


def _caps(compteur, requiert_consentement=False):
    cap = compteur.capacite(requiert_consentement)
    return {TypeDemande.ACCES_LOGICIEL: cap, TypeDemande.REMEDIATION: cap}


class TestDecisionSansAction(unittest.TestCase):
    def test_refus_ne_lance_rien(self):
        c = _Compteur()
        res = traiter_ticket(_ticket_acces(role="stagiaire"), capacites=_caps(c), journaliser=False)
        self.assertIs(res.issue, Issue.REFUSE)
        self.assertEqual(c.agir_appels, 0)

    def test_role_inconnu_escalade(self):
        c = _Compteur()
        res = traiter_ticket(_ticket_acces(role="pdg"), capacites=_caps(c), journaliser=False)
        self.assertIs(res.issue, Issue.ESCALADE)
        self.assertTrue(res.escalade_humaine)

    def test_executer_false_previsualise(self):
        c = _Compteur()
        res = traiter_ticket(_ticket_acces(), capacites=_caps(c), executer=False, journaliser=False)
        self.assertIs(res.issue, Issue.A_EXECUTER)
        self.assertEqual(c.agir_appels, 0)

    def test_n1_approbation_absente_en_attente(self):
        c = _Compteur()
        res = traiter_ticket(_ticket_acces(approbation_manager=False), capacites=_caps(c), journaliser=False)
        self.assertIs(res.issue, Issue.EN_ATTENTE)
        self.assertEqual(c.agir_appels, 0)


class TestDeuxConsentements(unittest.TestCase):
    def test_acces_manquant_en_attente(self):
        c = _Compteur(avec_diagnostic=True)
        res = traiter_ticket(_ticket_remediation(acces=None), capacites=_caps(c, True), journaliser=False)
        self.assertIs(res.issue, Issue.EN_ATTENTE)
        self.assertEqual(c.diag_appels, 0)   # pas même de diagnostic sans accès
        self.assertEqual(c.agir_appels, 0)

    def test_acces_refuse_escalade(self):
        c = _Compteur()
        res = traiter_ticket(_ticket_remediation(acces=False), capacites=_caps(c, True), journaliser=False)
        self.assertIs(res.issue, Issue.ESCALADE)
        self.assertEqual(c.agir_appels, 0)

    def test_acces_ok_diagnostic_puis_attente_correction(self):
        # Accès accordé, correction pas encore décidée : on diagnostique (read-only)
        # et on attend le 2e accord. On n'agit PAS.
        c = _Compteur(avec_diagnostic=True)
        res = traiter_ticket(_ticket_remediation(acces=True, correction=None),
                             capacites=_caps(c, True), journaliser=False)
        self.assertIs(res.issue, Issue.EN_ATTENTE)
        self.assertEqual(c.diag_appels, 1)
        self.assertEqual(c.agir_appels, 0)
        self.assertIn("proposée", res.details)

    def test_correction_refusee_escalade(self):
        c = _Compteur(avec_diagnostic=True)
        res = traiter_ticket(_ticket_remediation(acces=True, correction=False),
                             capacites=_caps(c, True), journaliser=False)
        self.assertIs(res.issue, Issue.ESCALADE)
        self.assertEqual(c.agir_appels, 0)

    def test_deux_accords_agit_et_resolu(self):
        c = _Compteur(verif_ok=True, avec_diagnostic=True)
        res = traiter_ticket(_ticket_remediation(acces=True, correction=True),
                             capacites=_caps(c, True), journaliser=False)
        self.assertIs(res.issue, Issue.RESOLU)
        self.assertEqual(c.agir_appels, 1)
        self.assertEqual(c.verif_appels, 1)
        self.assertEqual(c.diag_appels, 0)   # correction déjà consentie -> pas de diagnostic

    def test_n1_sans_consentement_agit(self):
        c = _Compteur(verif_ok=True)
        res = traiter_ticket(_ticket_acces(), capacites=_caps(c, requiert_consentement=False),
                             journaliser=False)
        self.assertIs(res.issue, Issue.RESOLU)
        self.assertEqual(c.agir_appels, 1)


class TestActionEtVerification(unittest.TestCase):
    def test_verif_echoue_non_verifie(self):
        c = _Compteur(verif_ok=False)
        res = traiter_ticket(_ticket_remediation(acces=True, correction=True),
                             capacites=_caps(c, True), journaliser=False)
        self.assertIs(res.issue, Issue.NON_VERIFIE)

    def test_echec_technique_isole(self):
        def agir_qui_plante(_t):
            raise RuntimeError("runner mort")
        cap = Capacite(agir=agir_qui_plante, verifier=lambda t: Verification(ok=True),
                       requiert_consentement=True)
        res = traiter_ticket(_ticket_remediation(acces=True, correction=True),
                             capacites={TypeDemande.REMEDIATION: cap}, journaliser=False)
        self.assertIs(res.issue, Issue.ECHEC)

    def test_capacite_absente_leve(self):
        with self.assertRaises(ValueError):
            traiter_ticket(_ticket_remediation(acces=True, correction=True),
                           capacites={}, journaliser=False)


class TestProgressEtEtatSuivi(unittest.TestCase):
    def test_on_progress_sequence(self):
        c = _Compteur(verif_ok=True)
        etapes = []
        traiter_ticket(_ticket_remediation(acces=True, correction=True),
                       capacites=_caps(c, True), journaliser=False,
                       on_progress=etapes.append)
        self.assertEqual(etapes, ["decision", "action", "verification", "termine"])

    def test_etat_suivi_mapping(self):
        self.assertIs(etat_suivi(Issue.RESOLU), EtatSuivi.RESOLU)
        self.assertIs(etat_suivi(Issue.NON_VERIFIE), EtatSuivi.A_VERIFIER)
        self.assertIs(etat_suivi(Issue.EN_ATTENTE), EtatSuivi.PRISE_EN_CHARGE)
        self.assertIs(etat_suivi(Issue.ESCALADE), EtatSuivi.PRISE_EN_CHARGE)
        # L'engine ne produit jamais CLOTURE (confirmation utilisateur).
        self.assertNotIn(EtatSuivi.CLOTURE, {etat_suivi(i) for i in Issue})


class TestValidationTicket(unittest.TestCase):
    def test_champs_manquants_rejetes(self):
        with self.assertRaises(ValidationError):
            Ticket(id="T", demandeur_email="a@b.fr", type=TypeDemande.ACCES_LOGICIEL)


class TestJournalEtMetriques(unittest.TestCase):
    def test_journalise_et_resume(self):
        with tempfile.TemporaryDirectory() as d:
            chemin = Path(d) / "j.jsonl"
            audit.journaliser({"issue": "resolu", "duree_s": 10}, chemin=chemin)
            audit.journaliser({"issue": "en_attente", "duree_s": 0}, chemin=chemin)
            self.assertEqual(len(chemin.read_text(encoding="utf-8").strip().splitlines()), 2)
        metr = audit.resumer([{"issue": "resolu", "duree_s": 10}, {"issue": "refuse", "duree_s": 2}])
        self.assertEqual(metr["resolus_verifies"], 1)
        self.assertEqual(metr["taux_resolution"], "1/1")


if __name__ == "__main__":
    unittest.main()

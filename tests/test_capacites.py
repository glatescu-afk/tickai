"""Tests d'intégration : les VRAIES Capacités macOS à travers l'engine, avec un
faux client (aucune session réelle, aucun réseau). Valide tout le câblage
engine <-> capacités <-> runner, sauf l'agent H lui-même.
"""
import types
import unittest

from capacites_macos import capacite_n1_gitlab, capacite_n2_notifs
from tickai_core.engine import Issue, Ticket, TypeDemande, traiter_ticket


class FauxClient:
    """run_session renvoie des réponses scriptées (action puis vérif), statut completed."""

    def __init__(self, reponses):
        self._reponses = list(reponses)

    def run_session(self, **_kwargs):
        return types.SimpleNamespace(status="completed", answer=self._reponses.pop(0))


def _ticket_n1(role="developpeur"):
    return Ticket(id="N1", demandeur_email="marie@ex.fr", type=TypeDemande.ACCES_LOGICIEL,
                  role=role, logiciel="GitLab", approbation_manager=True)


def _ticket_n2(action="reactiver_notifications", acces=True, correction=True):
    return Ticket(id="N2", demandeur_email="marie@ex.fr", type=TypeDemande.REMEDIATION,
                  action=action, application="Microsoft Teams",
                  consentement_acces=acces, consentement_correction=correction)


class TestCapaciteN1(unittest.TestCase):
    def test_invitation_verifiee_resolu(self):
        client = FauxClient([
            {"action_effectuee": "Invitation envoyée", "identifiant_cree": "marie@ex.fr", "message_console": "ok"},
            {"acces_present": True, "details": "marie@ex.fr listée (pending)"},
        ])
        cap = {TypeDemande.ACCES_LOGICIEL: capacite_n1_gitlab(client, "agent", "http://console", "grp")}
        res = traiter_ticket(_ticket_n1(), capacites=cap, journaliser=False)
        self.assertIs(res.issue, Issue.RESOLU)
        self.assertTrue(res.verifie)
        self.assertIn("pending", res.preuve)

    def test_stagiaire_refuse_sans_agir(self):
        client = FauxClient([])  # ne doit jamais être appelé
        cap = {TypeDemande.ACCES_LOGICIEL: capacite_n1_gitlab(client, "agent", "http://console", "grp")}
        res = traiter_ticket(_ticket_n1(role="stagiaire"), capacites=cap, journaliser=False)
        self.assertIs(res.issue, Issue.REFUSE)


class TestCapaciteN2(unittest.TestCase):
    def test_remediation_verifiee_resolu(self):
        client = FauxClient([
            {"action_effectuee": "Toggle activé", "etat_final_interrupteur": "ON", "message": "ok"},
            {"notifications_actives": True, "details": "Allow notifications = ON"},
        ])
        cap = {TypeDemande.REMEDIATION: capacite_n2_notifs(client, "agent")}
        res = traiter_ticket(_ticket_n2(), capacites=cap, journaliser=False)
        self.assertIs(res.issue, Issue.RESOLU)
        self.assertTrue(res.verifie)

    def test_acces_manquant_pas_d_appel(self):
        client = FauxClient([])  # aucune session sans l'accord d'accès au poste
        cap = {TypeDemande.REMEDIATION: capacite_n2_notifs(client, "agent")}
        res = traiter_ticket(_ticket_n2(acces=None), capacites=cap, journaliser=False)
        self.assertIs(res.issue, Issue.EN_ATTENTE)

    def test_pare_feu_refuse_interdit_dur(self):
        client = FauxClient([])
        cap = {TypeDemande.REMEDIATION: capacite_n2_notifs(client, "agent")}
        res = traiter_ticket(_ticket_n2(action="desactiver_pare_feu"), capacites=cap, journaliser=False)
        self.assertIs(res.issue, Issue.REFUSE)


if __name__ == "__main__":
    unittest.main()

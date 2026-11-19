"""Tests d'intégration : la capacité micro Teams (RB-20) à travers l'engine, avec
un faux client (aucune session réelle, aucun réseau). Valide le câblage
engine <-> agent_teams <-> runner, sauf l'agent H lui-même.

Lancer :  python -m unittest discover -s tests
"""
import types
import unittest

from agent_teams import capacite_micro_teams, capacite_notifications_teams
from tickai_core.engine import Issue, Ticket, TypeDemande, traiter_ticket


class FauxClient:
    """run_session renvoie des réponses scriptées (agir puis vérif), statut completed."""

    def __init__(self, reponses):
        self._reponses = list(reponses)

    def run_session(self, **_kwargs):
        return types.SimpleNamespace(status="completed", answer=self._reponses.pop(0))


def _ticket_micro() -> Ticket:
    return Ticket(
        id="TCK-TEST",
        demandeur_email="test@exemple.fr",
        type=TypeDemande.REMEDIATION,
        action="corriger_micro_teams",
        application="Microsoft Teams",
        motif="micro HS en réunion",
    )


def _ticket_notifs() -> Ticket:
    return Ticket(
        id="TCK-NOTIF",
        demandeur_email="test@exemple.fr",
        type=TypeDemande.REMEDIATION,
        action="reactiver_notifications",
        application="Microsoft Teams",
        motif="plus de notifications Teams",
    )


class TestCapaciteNotificationsTeams(unittest.TestCase):
    def test_notifs_reactivees_et_verifiees(self):
        """Réactivation + relecture qui confirme le toggle ON -> RESOLU, vérifié."""
        client = FauxClient([
            '{"action_effectuee": "Autorisation notifications Teams réactivée", "etat_final": "ON"}',
            '{"notifications_actives": true, "details": "interrupteur ON"}',
        ])
        capacites = {TypeDemande.REMEDIATION: capacite_notifications_teams(client, "agent")}
        res = traiter_ticket(_ticket_notifs(), capacites=capacites, journaliser=False)
        self.assertIs(res.issue, Issue.RESOLU)
        self.assertTrue(res.verifie)
        self.assertTrue(res.intervention_agent)

    def test_notifs_toujours_off_non_verifie(self):
        """Toggle toujours OFF à la relecture -> NON_VERIFIE (jamais resolu sans vérif)."""
        client = FauxClient([
            '{"action_effectuee": "tentative de réactivation"}',
            '{"notifications_actives": false, "details": "toujours OFF"}',
        ])
        capacites = {TypeDemande.REMEDIATION: capacite_notifications_teams(client, "agent")}
        res = traiter_ticket(_ticket_notifs(), capacites=capacites, journaliser=False)
        self.assertIs(res.issue, Issue.NON_VERIFIE)
        self.assertFalse(res.verifie)


class TestCapaciteMicroTeams(unittest.TestCase):
    def test_capacite_sans_consentement(self):
        """L'agent informe mais ne demande pas d'accord (autonomie des runbooks)."""
        cap = capacite_micro_teams(FauxClient([]), "agent")
        self.assertFalse(cap.requiert_consentement)
        self.assertIsNotNone(cap.diagnostiquer)

    def test_micro_corrige_et_verifie(self):
        """Correction appliquée + relecture d'état qui confirme -> RESOLU, vérifié."""
        client = FauxClient([
            '{"action_effectuee": "Bon micro sélectionné dans Teams", '
            '"reglage_modifie": "Teams > Appareils > Micro", "message": "ok"}',
            '{"micro_ok": true, "details": "micro sélectionné, volume ok, Teams autorisé"}',
        ])
        capacites = {TypeDemande.REMEDIATION: capacite_micro_teams(client, "agent")}
        res = traiter_ticket(_ticket_micro(), capacites=capacites, journaliser=False)
        self.assertIs(res.issue, Issue.RESOLU)
        self.assertTrue(res.verifie)
        self.assertTrue(res.intervention_agent)

    def test_verif_etat_echoue_non_verifie(self):
        """Config micro toujours KO à la relecture -> NON_VERIFIE (jamais resolu sans vérif)."""
        client = FauxClient([
            '{"action_effectuee": "Autorisations micro Teams activées"}',
            '{"micro_ok": false, "details": "Teams toujours non autorisé au micro"}',
        ])
        capacites = {TypeDemande.REMEDIATION: capacite_micro_teams(client, "agent")}
        res = traiter_ticket(_ticket_micro(), capacites=capacites, journaliser=False)
        self.assertIs(res.issue, Issue.NON_VERIFIE)
        self.assertFalse(res.verifie)

    def test_hors_perimetre_escalade_sans_agent(self):
        """Action hors catalogue sûr -> ESCALADE décidée en code, l'agent n'agit pas."""
        client = FauxClient([])  # aucune session ne doit être consommée
        capacites = {TypeDemande.REMEDIATION: capacite_micro_teams(client, "agent")}
        ticket = Ticket(
            id="TCK-HS", demandeur_email="x@exemple.fr", type=TypeDemande.REMEDIATION,
            action="reinstaller_os", application="Windows", motif="poste lent",
        )
        res = traiter_ticket(ticket, capacites=capacites, journaliser=False)
        self.assertIs(res.issue, Issue.ESCALADE)
        self.assertFalse(res.intervention_agent)


if __name__ == "__main__":
    unittest.main()

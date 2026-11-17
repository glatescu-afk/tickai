"""Tests de la couche de sécurité `tickai_core.policy`.

Pur, déterministe, hors-ligne : valide la logique d'autorisation sans l'agent
ni le bureau. Lancer :  python -m unittest discover -s tests
"""
import unittest

from tickai_core.policy import (
    ACTIONS_INTERDITES,
    Decision,
    Risque,
    evaluer_acces_logiciel,
    evaluer_remediation,
)


class TestAccesLogicielN1(unittest.TestCase):
    def test_tout_ok_autorise(self):
        ev = evaluer_acces_logiciel("developpeur", "GitLab", approbation_manager=True)
        self.assertIs(ev.decision, Decision.AUTORISE)
        self.assertTrue(ev.peut_agir)
        self.assertIs(ev.risque, Risque.AUCUN)

    def test_employe_inactif_refuse(self):
        ev = evaluer_acces_logiciel("developpeur", "GitLab",
                                    employe_actif=False, approbation_manager=True)
        self.assertIs(ev.decision, Decision.REFUSE)
        self.assertFalse(ev.peut_agir)

    def test_role_connu_non_habilite_refuse(self):
        ev = evaluer_acces_logiciel("stagiaire", "GitLab", approbation_manager=True)
        self.assertIs(ev.decision, Decision.REFUSE)
        self.assertFalse(ev.peut_agir)

    def test_role_inconnu_escalade(self):
        ev = evaluer_acces_logiciel("directeur_marketing", "GitLab", approbation_manager=True)
        self.assertIs(ev.decision, Decision.ESCALADE)
        self.assertTrue(ev.escalade_humaine)

    def test_logiciel_inconnu_pour_role_connu_refuse(self):
        ev = evaluer_acces_logiciel("developpeur", "LogicielBidon", approbation_manager=True)
        self.assertIs(ev.decision, Decision.REFUSE)

    def test_duree_trop_longue_refuse(self):
        # stagiaire -> VSCode plafonné à 90 j ; 120 demandés -> refus.
        ev = evaluer_acces_logiciel("stagiaire", "VSCode",
                                    approbation_manager=True, duree_jours=120)
        self.assertIs(ev.decision, Decision.REFUSE)

    def test_approbation_absente_attente(self):
        ev = evaluer_acces_logiciel("developpeur", "GitLab", approbation_manager=False)
        self.assertIs(ev.decision, Decision.ATTENTE)
        self.assertFalse(ev.peut_agir)
        self.assertFalse(ev.escalade_humaine)

    def test_licence_indisponible_attente(self):
        ev = evaluer_acces_logiciel("developpeur", "GitLab",
                                    approbation_manager=True, licence_disponible=False)
        self.assertIs(ev.decision, Decision.ATTENTE)
        self.assertFalse(ev.peut_agir)

    def test_design_figma_90j_ok(self):
        # Cas du doc : Design -> Figma, 90 j.
        ev = evaluer_acces_logiciel("design", "Figma",
                                    approbation_manager=True, duree_jours=90)
        self.assertIs(ev.decision, Decision.AUTORISE)


class TestRemediationN2(unittest.TestCase):
    def test_remediation_autorisee(self):
        ev = evaluer_remediation("reactiver_notifications", "Microsoft Teams")
        self.assertIs(ev.decision, Decision.AUTORISE)
        self.assertTrue(ev.peut_agir)
        self.assertIs(ev.risque, Risque.AUCUN)

    def test_action_interdite_dure_refuse(self):
        # Interdit dur : refus net, risque élevé, PAS d'escalade (décision claire).
        ev = evaluer_remediation("desactiver_pare_feu", "macOS")
        self.assertIs(ev.decision, Decision.REFUSE)
        self.assertFalse(ev.peut_agir)
        self.assertFalse(ev.escalade_humaine)
        self.assertIs(ev.risque, Risque.ELEVE)

    def test_action_inconnue_escalade(self):
        ev = evaluer_remediation("reinstaller_os", "macOS")
        self.assertIs(ev.decision, Decision.ESCALADE)
        self.assertFalse(ev.peut_agir)
        self.assertTrue(ev.escalade_humaine)

    def test_app_hors_perimetre_escalade(self):
        # Action connue mais app non couverte : humain confirme le périmètre.
        ev = evaluer_remediation("reactiver_notifications", "ApplicationInconnue")
        self.assertIs(ev.decision, Decision.ESCALADE)
        self.assertFalse(ev.peut_agir)
        self.assertTrue(ev.escalade_humaine)


class TestDefenseEnProfondeur(unittest.TestCase):
    def test_interdiction_prime_sur_tout(self):
        # Même si une action interdite était par erreur rangée dans le catalogue
        # autorisé, la barrière d'interdits durs doit la refuser EN PREMIER.
        for action in ACTIONS_INTERDITES:
            ev = evaluer_remediation(action, "Microsoft Teams")
            self.assertIs(
                ev.decision, Decision.REFUSE,
                msg=f"{action} aurait dû être refusée par la barrière dure.",
            )
            self.assertFalse(ev.peut_agir)

    def test_default_deny_rien_n_agit_hors_autorisation(self):
        # Toute issue non-AUTORISE interdit l'action.
        for ev in (
            evaluer_acces_logiciel("role_x", "GitLab"),
            evaluer_acces_logiciel("stagiaire", "GitLab"),
            evaluer_remediation("desactiver_antivirus", "macOS"),
            evaluer_remediation("action_x", "App"),
        ):
            self.assertFalse(ev.peut_agir)


if __name__ == "__main__":
    unittest.main()

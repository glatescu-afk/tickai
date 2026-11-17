// Miroir CÔTÉ FRONT du contrat de l'engine Python (tickai_core).
// Ce fichier NE remplace PAS la logique métier : il ne sert qu'à l'affichage du
// portail (libellés du tracker, mapping issue -> état). La décision réelle est
// prise par tickai_core, côté runner. Garder ces deux listes synchronisées avec
// engine.EtatSuivi / engine.Issue.

export const ETATS = [
  "envoyee",
  "prise_en_charge",
  "traitement",
  "a_verifier",
  "resolu",
  "cloture",
];

export const LABELS = {
  envoyee: "Envoyée",
  prise_en_charge: "Prise en charge",
  traitement: "Traitement",
  a_verifier: "À vérifier",
  resolu: "Résolu",
  cloture: "Clôturé",
};

// Mapping issue (Resultat.issue) -> état du tracker, miroir de engine.etat_suivi.
// `cloture` n'est JAMAIS produit par l'engine : il vient de la confirmation
// de l'utilisateur (étape F du flowchart).
const ETAT_PAR_ISSUE = {
  a_executer: "prise_en_charge",
  en_attente: "prise_en_charge",
  non_verifie: "a_verifier",
  resolu: "resolu",
  refuse: "prise_en_charge",
  escalade: "prise_en_charge",
  echec: "prise_en_charge",
};

export function etatFromIssue(issue) {
  return ETAT_PAR_ISSUE[issue] || "prise_en_charge";
}

export function indexEtat(etat) {
  const i = ETATS.indexOf(etat);
  return i === -1 ? 0 : i;
}

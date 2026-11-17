"""Traçabilité de Tick.AI : journal append-only + métriques agrégées.

Chaque ticket traité produit une ligne JSON immuable (on n'écrase jamais). Les
métriques (ce qu'on montre au jury / ce que le portail affiche) se recalculent à
partir de ces lignes. Volontairement découplé de l'engine (ne l'importe pas) :
`resumer` travaille sur de simples dicts, pour éviter tout cycle d'import.
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
import typing

JOURNAL_DEFAUT = Path("logs/sessions.jsonl")


def journaliser(entree: dict, chemin: Path = JOURNAL_DEFAUT) -> None:
    """Ajoute une ligne JSON au journal (append-only, jamais d'écrasement)."""
    chemin.parent.mkdir(parents=True, exist_ok=True)
    with chemin.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entree, ensure_ascii=False, default=str) + "\n")


def resumer(entrees: typing.Sequence[dict]) -> dict:
    """Agrège des résultats (dicts avec au moins `issue` et `duree_s`).

    Renvoie un dict de métriques stable :
      - total, par_issue (comptage par issue)
      - resolus / interventions_executees -> taux de résolution vérifié
      - refus, escalades, echecs
      - duree_moyenne_s
    """
    total = len(entrees)
    par_issue = Counter(str(e.get("issue", "inconnu")) for e in entrees)

    resolus = par_issue.get("resolu", 0)
    non_verifies = par_issue.get("non_verifie", 0)
    echecs = par_issue.get("echec", 0)
    # Interventions réellement exécutées = autorisées puis tentées sur la console
    # (résolues + agies-mais-non-vérifiées + échecs techniques).
    executees = resolus + non_verifies + echecs
    duree_moyenne = (
        round(sum(float(e.get("duree_s", 0.0)) for e in entrees) / total, 1) if total else 0.0
    )

    return {
        "total": total,
        "par_issue": dict(par_issue),
        "interventions_executees": executees,
        "resolus_verifies": resolus,
        "taux_resolution": f"{resolus}/{executees}" if executees else "n/a",
        "refus": par_issue.get("refuse", 0),
        "escalades": par_issue.get("escalade", 0),
        "echecs": echecs,
        "duree_moyenne_s": duree_moyenne,
    }

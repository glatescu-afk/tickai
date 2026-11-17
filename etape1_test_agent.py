"""
Étape 1 — Premier appel à l'Agents API de H Company.
But : vérifier que la clé fonctionne, voir l'agent naviguer, et mesurer
temps + tokens d'une session (base de nos futures métriques).
Lancer :  python etape1_test_agent.py
"""
import json
import os
import time
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv
from hai_agents import Client
from pydantic import BaseModel

load_dotenv()  # lit le fichier .env


# 1) Le format de réponse qu'on exige de l'agent (sortie structurée)
class FicheEntreprise(BaseModel):
    nom: str
    ville_siege: str
    annee_creation: int
    pdg_actuel: str


def tokens_utilises() -> dict | None:
    """Lit la consommation de tokens du compte (endpoint quota de H)."""
    base = os.getenv("HAI_BASE_URL", "https://agp.eu.hcompany.ai/api/v2")
    try:
        r = requests.get(
            f"{base}/quota/tokens",
            headers={"Authorization": f"Bearer {os.environ['HAI_API_KEY']}"},
            timeout=15,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:  # on ne bloque pas le test si ça échoue
        print(f"(quota non lu : {e})")
        return None


def main():
    client = Client()  # lit HAI_API_KEY dans l'environnement

    quota_avant = tokens_utilises()
    debut = time.time()

    # 2) La session : un agent prêt à l'emploi, avec navigateur cloud
    result = client.run_session(
        agent="h/web-surfer-flash",
        messages=(
            "Va sur https://fr.wikipedia.org/wiki/H_Company et relève : "
            "le nom de l'entreprise, la ville du siège, l'année de création "
            "et le PDG actuel."
        ),
        answer_schema=FicheEntreprise,
    )

    duree = round(time.time() - debut, 1)
    quota_apres = tokens_utilises()

    # 3) Affichage
    print("\n=== RÉSULTAT ===")
    print("Statut :", result.status)
    print("Réponse :", result.answer)
    print(f"Durée : {duree} s")
    print("Quota avant :", quota_avant)
    print("Quota après :", quota_apres)

    # 4) Journal (le début de notre traçabilité / métriques)
    Path("logs").mkdir(exist_ok=True)
    entree = {
        "date": datetime.now().isoformat(timespec="seconds"),
        "etape": "1-test",
        "statut": str(result.status),
        "duree_s": duree,
        "reponse": str(result.answer),
        "quota_avant": quota_avant,
        "quota_apres": quota_apres,
    }
    with open("logs/sessions.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(entree, ensure_ascii=False, default=str) + "\n")
    print("\nSession enregistrée dans logs/sessions.jsonl")


if __name__ == "__main__":
    main()

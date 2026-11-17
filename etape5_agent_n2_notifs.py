"""
Étape 5 — Agent N2 « Software Troubleshooting » (cas : notifications Microsoft Teams).

Cas MVP : un ticket signale que les notifications Teams ne fonctionnent plus.
Sur macOS, le vrai blocage est au niveau de l'OS (Réglages Système > Notifications >
Microsoft Teams > « Autoriser les notifications »). Pour CHAQUE ticket, Tick.AI :
  1) vérifie EN CODE que la remédiation demandée est autorisée et non destructive ;
  2) si refusé  -> l'agent n'agit pas, on trace le refus (= « refus correct ») ;
  3) si autorisé -> l'agent réactive les notifications de l'app dans Réglages Système ;
  4) VÉRIFIE le résultat de façon indépendante (session séparée, lecture seule) ;
  5) journalise temps / statut / vérification (base des métriques du pitch).

Même colonne vertébrale que l'agent N1 : décision en code -> action réelle ->
preuve indépendante -> journal. La vérité terrain est la VÉRIFICATION, pas ce que
l'agent de remédiation annonce.

Lancer :  python etape5_agent_n2_notifs.py
Dry-run (aucune modif réelle, vérif seule) :  HAI_DRY_RUN=1 python etape5_agent_n2_notifs.py
"""
import json
import os
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from hai_agents import Client
from pydantic import BaseModel

load_dotenv()

DATASET = Path("data/tickets_n2.json")

# N2 est intrinsèquement DESKTOP (on pilote l'app Réglages Système, hors
# navigateur). On réutilise l'agent desktop (mode visuel, vrais clics OS) déjà
# validé par N1 et le smoke test Teams.
AGENT_NAME = os.getenv("HAI_DESKTOP_AGENT", "tickai-n1-desktop")

# Dry-run : pour un ticket AUTORISÉ, on saute la remédiation (aucune modification
# réelle) et on ne fait que la vérification en lecture seule.
DRY_RUN = os.getenv("HAI_DRY_RUN", "").strip().lower() in ("1", "true", "yes", "oui")


def obtenir_agent(client: Client):
    """Crée (ou réutilise) l'agent desktop visuel."""
    try:
        return client.agents.create_agent(
            name=AGENT_NAME,
            description="Agent N2 Tick.AI pilotant le bureau local (mode visuel, vrais clics).",
            environments=[{"id": "poste", "kind": "desktop"}],
        )
    except Exception as e:  # noqa: BLE001 — agent déjà créé lors d'un run précédent
        print(f"(agent desktop déjà présent, réutilisation par nom « {AGENT_NAME} » : {e})")
        return AGENT_NAME


# ---------------------------------------------------------------------------
# 1) Le ticket entrant (dataset fictif — à remplacer par le portail de tickets)
# ---------------------------------------------------------------------------
class Ticket(BaseModel):
    id: str
    demandeur_email: str
    categorie: str          # type de problème (ex. "notifications")
    application: str        # application concernée (ex. "Microsoft Teams")
    action_demandee: str    # remédiation demandée (ex. "reactiver_notifications")
    motif: str


def charger_tickets() -> list[Ticket]:
    """Charge les tickets depuis data/tickets_n2.json."""
    if not DATASET.exists():
        raise SystemExit(f"Dataset introuvable : {DATASET}")
    donnees = json.loads(DATASET.read_text(encoding="utf-8"))
    return [Ticket(**t) for t in donnees]


# ---------------------------------------------------------------------------
# 2) Politique de remédiation N2 (ce que l'agent a le DROIT de faire).
#    Volontairement SÉPARÉE de l'agent : contrôle indépendant, non destructif.
#    Clé = action autorisée -> ensemble des applications où elle est permise.
#    Toute action non listée (ex. désactiver un pare-feu) est refusée par défaut.
#    À terme : charger depuis un fichier/API de politique, pas en dur.
# ---------------------------------------------------------------------------
REMEDIATIONS_AUTORISEES: dict[str, set[str]] = {
    "reactiver_notifications": {"Microsoft Teams", "Outlook", "Slack"},
}


def est_autorise(ticket: Ticket) -> tuple[bool, str]:
    """Décide AVANT toute action si la remédiation est permise. Indépendant de l'agent."""
    apps = REMEDIATIONS_AUTORISEES.get(ticket.action_demandee)
    if apps is None:
        return False, (
            f"Action {ticket.action_demandee!r} hors périmètre N2 autorisé "
            f"(pas de remédiation sûre définie — p.ex. action potentiellement destructive)."
        )
    if ticket.application not in apps:
        return False, (
            f"{ticket.application} hors périmètre pour l'action {ticket.action_demandee!r} "
            f"(apps autorisées : {', '.join(sorted(apps))})."
        )
    return True, (
        f"Remédiation {ticket.action_demandee!r} autorisée pour {ticket.application!r}."
    )


# ---------------------------------------------------------------------------
# 3) Schémas de sortie structurée exigés de l'agent
# ---------------------------------------------------------------------------
class ResultatRemediation(BaseModel):
    action_effectuee: str          # ce que l'agent dit avoir fait
    etat_final_interrupteur: str   # état observé de « Autoriser les notifications »
    message: str                   # observations à l'écran


class ResultatVerification(BaseModel):
    notifications_actives: bool    # l'interrupteur OS est-il VRAIMENT activé ?
    details: str                   # ce qui est observé à l'écran


# ---------------------------------------------------------------------------
# 4) Consignes données à l'agent (Réglages Système macOS)
# ---------------------------------------------------------------------------
def consigne_remediation(ticket: Ticket) -> str:
    app = ticket.application
    return (
        "Ouvre l'application « Réglages Système » (System Settings) de macOS "
        "(menu Pomme  > Réglages Système, ou via Spotlight ⌘-Espace puis tape "
        "« Réglages Système »). Va dans la rubrique « Notifications ». "
        f"Dans la liste des applications, trouve et sélectionne « {app} ». "
        "Si l'interrupteur « Autoriser les notifications » (Allow notifications) "
        "est DÉSACTIVÉ, ACTIVE-le. "
        f"Ne modifie AUCUN autre réglage, et AUCUNE autre application que « {app} ». "
        "Décris précisément l'action réalisée et l'état final de l'interrupteur "
        "« Autoriser les notifications »."
    )


def consigne_verification(ticket: Ticket) -> str:
    app = ticket.application
    return (
        "Ouvre « Réglages Système » (System Settings) > « Notifications » > "
        f"« {app} ». SANS rien modifier, indique si l'interrupteur « Autoriser les "
        "notifications » (Allow notifications) est ACTIVÉ. "
        "Mets notifications_actives=true SEULEMENT si tu vois explicitement cet "
        "interrupteur en position activée."
    )


# ---------------------------------------------------------------------------
# 5) Utilitaires : journal, normalisation des réponses de l'agent
# ---------------------------------------------------------------------------
def journaliser(entree: dict) -> None:
    Path("logs").mkdir(exist_ok=True)
    with open("logs/sessions.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(entree, ensure_ascii=False, default=str) + "\n")


def _statut(session_result) -> str:
    """Normalise le statut en minuscules, que ce soit une str, un enum ou un objet."""
    s = getattr(session_result, "status", session_result)
    s = getattr(s, "status", s)      # cas objet {status: {status: "..."}}
    s = getattr(s, "value", s)       # cas enum
    return str(s).lower()


def _champ(answer, nom: str, defaut):
    """Lit un champ de la réponse, qu'elle soit un modèle Pydantic, un dict ou du JSON."""
    if answer is None:
        return defaut
    if hasattr(answer, nom):                      # modèle Pydantic / objet
        return getattr(answer, nom)
    if isinstance(answer, str):                   # JSON brut renvoyé en texte
        try:
            answer = json.loads(answer)
        except json.JSONDecodeError:
            return defaut
    if isinstance(answer, dict):
        return answer.get(nom, defaut)
    return defaut


# ---------------------------------------------------------------------------
# 6) Traitement d'UN ticket (la boucle démo complète)
# ---------------------------------------------------------------------------
def traiter_ticket(client: Client, ticket: Ticket, agent) -> dict:
    debut = time.time()
    print(f"\n===== Ticket {ticket.id} — {ticket.application} / {ticket.action_demandee} =====")

    # --- Étape A : contrôle de la politique de remédiation (en code, avant l'agent) ---
    autorise, raison = est_autorise(ticket)
    print(f"[Contrôle] {raison}")

    if not autorise:
        # Refus correct : l'agent n'intervient PAS. On trace et on s'arrête.
        duree = round(time.time() - debut, 1)
        entree = {
            "date": datetime.now().isoformat(timespec="seconds"),
            "etape": "5-n2-notifs",
            "ticket": ticket.model_dump(),
            "decision": "refus",
            "raison": raison,
            "intervention_agent": False,
            "succes_bout_en_bout": None,   # non applicable à un refus
            "duree_s": duree,
        }
        journaliser(entree)
        print("[Décision] REFUS (remédiation non autorisée) — aucune action, refus journalisé.")
        return entree

    # --- Étape B : l'agent réactive les notifications dans Réglages Système ---
    if DRY_RUN:
        remediation = None
        print("[Remédiation] DRY-RUN — aucune modification effectuée.")
    else:
        remediation = client.run_session(
            agent=agent,
            messages=consigne_remediation(ticket),
            answer_schema=ResultatRemediation,
        )
        print(f"[Remédiation] statut : {remediation.status}")
        print(f"[Remédiation] réponse : {remediation.answer}")

    # --- Étape C : vérification INDÉPENDANTE (session séparée, lecture seule) ---
    # On ne se fie pas à ce que l'agent a annoncé : on relit l'état réel du toggle.
    verif = client.run_session(
        agent=agent,
        messages=consigne_verification(ticket),
        answer_schema=ResultatVerification,
    )
    print(f"[Vérification] statut : {verif.status}")
    print(f"[Vérification] réponse : {verif.answer}")

    # --- Étape D : verdict de bout en bout + journal ---
    duree = round(time.time() - debut, 1)
    notifs_ok = bool(_champ(verif.answer, "notifications_actives", False))
    # Vérité terrain = la vérification INDÉPENDANTE, pas l'état auto-déclaré par
    # l'agent de remédiation.
    succes_bout_en_bout = notifs_ok

    entree = {
        "date": datetime.now().isoformat(timespec="seconds"),
        "etape": "5-n2-notifs",
        "ticket": ticket.model_dump(),
        "decision": "autorise",
        "dry_run": DRY_RUN,
        # En dry-run aucune remédiation n'est émise : on le reflète honnêtement.
        "intervention_agent": not DRY_RUN,
        "statut_remediation": None if DRY_RUN else _statut(remediation),
        "reponse_remediation": None if DRY_RUN else str(remediation.answer),
        "statut_verification": _statut(verif),
        "verification_notifications_actives": notifs_ok,
        "succes_bout_en_bout": succes_bout_en_bout,
        "duree_s": duree,
    }
    journaliser(entree)
    verdict = "état vérifié (lecture seule)" if DRY_RUN else "succès vérifié bout-en-bout"
    print(f"[Verdict] {verdict} : {succes_bout_en_bout} ({duree} s)")
    return entree


# ---------------------------------------------------------------------------
# 7) Métriques agrégées (ce qu'on montre au jury)
# ---------------------------------------------------------------------------
def resumer(resultats: list[dict]) -> None:
    total = len(resultats)
    refus = [r for r in resultats if r["decision"] == "refus"]
    erreurs = [r for r in resultats if r["decision"] == "erreur"]
    # Interventions tentées = remédiations autorisées (y compris finies en erreur).
    tentees = [r for r in resultats if r["decision"] in ("autorise", "erreur")]
    reussis = [r for r in tentees if r.get("succes_bout_en_bout")]
    duree_moy = round(sum(r["duree_s"] for r in resultats) / total, 1) if total else 0

    print("\n========== MÉTRIQUES ==========")
    if DRY_RUN:
        print("(DRY-RUN : aucune remédiation émise — la lecture seule a été validée, "
              "le bout-en-bout n'est PAS mesuré ici.)")
    print(f"Tickets traités             : {total}")
    print(f"Refus corrects (bloqués)    : {len(refus)}")
    if DRY_RUN:
        print(f"Remédiations autorisées     : {len(tentees)}")
    else:
        print(f"Remédiations tentées        : {len(tentees)}")
        taux = f"{len(reussis)}/{len(tentees)}" if tentees else "n/a"
        print(f"Succès vérifié bout-en-bout : {taux}")
    if erreurs:
        print(f"Échecs techniques           : {len(erreurs)}")
    print(f"Temps moyen / ticket        : {duree_moy} s")
    print("Détail complet dans logs/sessions.jsonl")


def main() -> None:
    client = Client()  # lit HAI_API_KEY
    agent = obtenir_agent(client)
    tickets = charger_tickets()
    suffixe = " · DRY-RUN (aucune remédiation réelle)" if DRY_RUN else ""
    print(f"{len(tickets)} ticket(s) · N2 notifications · agent={AGENT_NAME} (desktop){suffixe}")

    # Chaque ticket est isolé : un échec/exception est tracé mais n'interrompt pas
    # le reste du batch.
    resultats: list[dict] = []
    for t in tickets:
        try:
            resultats.append(traiter_ticket(client, t, agent))
        except Exception as e:  # noqa: BLE001 — on veut continuer la démo
            entree = {
                "date": datetime.now().isoformat(timespec="seconds"),
                "etape": "5-n2-notifs",
                "ticket": t.model_dump(),
                "decision": "erreur",
                "erreur": f"{type(e).__name__}: {e}",
                "intervention_agent": True,
                "succes_bout_en_bout": False,
                "duree_s": 0.0,
            }
            journaliser(entree)
            resultats.append(entree)
            print(f"[Erreur] ticket {t.id} : {type(e).__name__}: {e}")

    resumer(resultats)


if __name__ == "__main__":
    main()

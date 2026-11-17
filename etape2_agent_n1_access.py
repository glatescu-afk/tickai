"""
Étape 2 — Agent N1 « Access Management » (console de test : GitLab).

Cas MVP : un ticket demande un accès logiciel. Pour CHAQUE ticket, Tick.AI :
  1) vérifie l'habilitation EN CODE (contrôle indépendant du raisonnement de l'agent) ;
  2) si refusé  -> l'agent n'agit pas, on trace le refus (= « refus correct ») ;
  3) si autorisé -> l'agent invite l'utilisateur au groupe GitLab de test ;
  4) VÉRIFIE le résultat de façon indépendante (session séparée, lecture seule) ;
  5) journalise temps / statut / vérification (base des métriques du pitch).

À la fin, agrège les métriques : réussite bout-en-bout, temps moyen, refus corrects.

Lancer :  python etape2_agent_n1_access.py
Config (.env) : voir .env.example (HAI_API_KEY, CONSOLE_URL, GITLAB_GROUP, …).
"""
import json
import os
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from hai_agents import Client
from pydantic import BaseModel

load_dotenv()  # lit le fichier .env

# Agent utilisé : "pro" est plus fiable que "flash" sur les parcours interactifs
# (connexion, formulaire d'invitation). On garde "flash" pour les tests rapides.
AGENT = os.getenv("HAI_AGENT", "h/web-surfer-pro")
DATASET = Path("data/tickets_n1.json")

# Mode d'exécution :
#   "cloud" (défaut) -> agent pré-construit sur navigateur hébergé par H.
#                       Simple, mais bloqué par les anti-bots (Cloudflare) au login.
#   "local"          -> agent custom pilotant TON Chrome local (host=user_device).
#                       Passe Cloudflare, mais les clics SYNTHÉTIQUES ne déclenchent
#                       pas certains boutons Vue.js (ex. « Invite members » GitLab).
#   "desktop"        -> agent custom pilotant le BUREAU (vraie souris/clavier, mode
#                       visuel). Les clics sont de VRAIS événements OS -> ils
#                       réveillent les boutons Vue.js. Nécessite les permissions
#                       macOS (Accessibilité + Enregistrement de l'écran).
MODE = os.getenv("HAI_RUN_MODE", "cloud").lower()


def obtenir_agent(client: Client):
    """Retourne l'agent selon le mode (string cloud, ou agent custom local/desktop)."""
    if MODE == "local":
        nom = os.getenv("HAI_LOCAL_AGENT", "tickai-n1-local")
        try:
            return client.agents.create_agent(
                name=nom,
                description="Agent N1 Tick.AI pilotant le navigateur local (user_device).",
                environments=[{"id": "poste", "kind": "web", "host": "user_device"}],
            )
        except Exception as e:  # noqa: BLE001 — agent déjà créé lors d'un run précédent
            print(f"(agent local déjà présent, réutilisation par nom « {nom} » : {e})")
            return nom
    if MODE == "desktop":
        nom = os.getenv("HAI_DESKTOP_AGENT", "tickai-n1-desktop")
        try:
            return client.agents.create_agent(
                name=nom,
                description="Agent N1 Tick.AI pilotant le bureau local (mode visuel, vrais clics).",
                environments=[{"id": "poste", "kind": "desktop"}],
            )
        except Exception as e:  # noqa: BLE001 — agent déjà créé lors d'un run précédent
            print(f"(agent desktop déjà présent, réutilisation par nom « {nom} » : {e})")
            return nom
    return AGENT  # cloud, agent pré-construit


# ---------------------------------------------------------------------------
# 1) Le ticket entrant (dataset fictif — à remplacer par le portail de tickets)
# ---------------------------------------------------------------------------
class Ticket(BaseModel):
    id: str
    demandeur_email: str
    role: str              # rôle/poste du demandeur, sert à l'habilitation
    logiciel: str          # logiciel demandé
    motif: str


def charger_tickets() -> list[Ticket]:
    """Charge les tickets depuis data/tickets_n1.json."""
    if not DATASET.exists():
        raise SystemExit(f"Dataset introuvable : {DATASET}")
    donnees = json.loads(DATASET.read_text(encoding="utf-8"))
    return [Ticket(**t) for t in donnees]


# ---------------------------------------------------------------------------
# 2) Les règles d'habilitation N1 (politique de l'entreprise).
#    Volontairement SÉPARÉES de l'agent : c'est un contrôle indépendant.
#    À terme : charger depuis un fichier/API de politique, pas en dur.
# ---------------------------------------------------------------------------
HABILITATIONS: dict[str, set[str]] = {
    "developpeur": {"GitLab", "Jira", "VSCode"},
    "support": {"Zendesk", "Jira"},
    "stagiaire": {"VSCode"},
}


def est_autorise(ticket: Ticket) -> tuple[bool, str]:
    """Décide AVANT toute action si l'accès est permis. Indépendant de l'agent."""
    autorises = HABILITATIONS.get(ticket.role)
    if autorises is None:
        return False, f"Rôle inconnu : {ticket.role!r} (aucune politique définie)."
    if ticket.logiciel not in autorises:
        return False, (
            f"{ticket.logiciel} non autorisé pour le rôle {ticket.role!r} "
            f"(autorisés : {', '.join(sorted(autorises))})."
        )
    return True, f"{ticket.logiciel} autorisé pour le rôle {ticket.role!r}."


# ---------------------------------------------------------------------------
# 3) Schémas de sortie structurée exigés de l'agent
# ---------------------------------------------------------------------------
class ResultatCreation(BaseModel):
    action_effectuee: str      # ce que l'agent dit avoir fait
    identifiant_cree: str      # email/membre invité, ou "" si échec
    message_console: str       # message affiché par GitLab


class ResultatVerification(BaseModel):
    acces_present: bool        # l'utilisateur est-il VRAIMENT membre du groupe ?
    details: str               # ce qui est observé à l'écran


# ---------------------------------------------------------------------------
# 4) Consignes données à l'agent (spécifiques GitLab)
# ---------------------------------------------------------------------------
def _bloc_connexion() -> str:
    """Consigne de connexion selon le mode d'exécution."""
    if MODE in ("local", "desktop"):
        # Navigateur déjà authentifié par l'humain : aucun identifiant à passer.
        return "Le navigateur Google Chrome ouvert à l'écran est déjà connecté à GitLab. "
    email = os.getenv("GITLAB_EMAIL")
    mdp = os.getenv("GITLAB_PASSWORD")
    if email and mdp:
        # Mode cloud : on injecte réellement les identifiants (corrige le bug où la
        # valeur du mot de passe n'était jamais transmise à l'agent).
        return (
            f"Si une page de connexion s'affiche, connecte-toi avec l'email "
            f"« {email} » et le mot de passe « {mdp} ». "
        )
    return "Le navigateur est déjà connecté au compte d'administration. "


def consigne_creation(ticket: Ticket, console_url: str, groupe: str) -> str:
    return (
        f"Ouvre la page des membres du groupe GitLab : {console_url}. "
        + _bloc_connexion() +
        f"Invite l'utilisateur « {ticket.demandeur_email} » comme membre du groupe "
        f"« {groupe} » avec le rôle « Developer », puis valide l'invitation. "
        "N'effectue AUCUNE autre modification (ne change aucun rôle existant, "
        "ne supprime aucun membre). "
        "Décris précisément l'action réalisée, le membre invité et le message "
        "affiché par GitLab."
    )


def consigne_verification(ticket: Ticket, console_url: str, groupe: str) -> str:
    return (
        f"Ouvre la page des membres du groupe GitLab : {console_url}. "
        + _bloc_connexion() +
        f"Vérifie, SANS rien modifier, si « {ticket.demandeur_email} » apparaît "
        f"bien dans la liste des membres du groupe « {groupe} ». "
        "Mets acces_present=true seulement si tu vois explicitement cet "
        "utilisateur listé comme membre (invitation en attente = true aussi)."
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
def traiter_ticket(client: Client, ticket: Ticket, console_url: str, groupe: str, agent) -> dict:
    debut = time.time()
    print(f"\n===== Ticket {ticket.id} — {ticket.logiciel} / {ticket.role} =====")

    # --- Étape A : contrôle d'habilitation (en code, avant l'agent) ---
    autorise, raison = est_autorise(ticket)
    print(f"[Contrôle] {raison}")

    if not autorise:
        # Refus correct : l'agent n'intervient PAS. On trace et on s'arrête.
        duree = round(time.time() - debut, 1)
        entree = {
            "date": datetime.now().isoformat(timespec="seconds"),
            "etape": "2-n1-access",
            "ticket": ticket.model_dump(),
            "decision": "refus",
            "raison": raison,
            "intervention_agent": False,
            "succes_bout_en_bout": None,   # non applicable à un refus
            "duree_s": duree,
        }
        journaliser(entree)
        print("[Décision] REFUS (demande non autorisée) — aucune action, refus journalisé.")
        return entree

    # --- Étape B : l'agent invite l'utilisateur au groupe GitLab ---
    creation = client.run_session(
        agent=agent,
        messages=consigne_creation(ticket, console_url, groupe),
        answer_schema=ResultatCreation,
    )
    print(f"[Création] statut : {creation.status}")
    print(f"[Création] réponse : {creation.answer}")

    # --- Étape C : vérification INDÉPENDANTE (session séparée, lecture seule) ---
    # On ne se fie pas à ce que l'agent a annoncé : on relit l'état réel.
    verif = client.run_session(
        agent=agent,
        messages=consigne_verification(ticket, console_url, groupe),
        answer_schema=ResultatVerification,
    )
    print(f"[Vérification] statut : {verif.status}")
    print(f"[Vérification] réponse : {verif.answer}")

    # --- Étape D : verdict de bout en bout + journal ---
    duree = round(time.time() - debut, 1)
    acces_ok = bool(_champ(verif.answer, "acces_present", False))
    # Vérité terrain = la vérification INDÉPENDANTE, pas le statut auto-déclaré
    # par l'agent de création. L'accès ne compte comme accordé que si une
    # session séparée l'a réellement observé dans la liste des membres.
    succes_bout_en_bout = acces_ok

    entree = {
        "date": datetime.now().isoformat(timespec="seconds"),
        "etape": "2-n1-access",
        "ticket": ticket.model_dump(),
        "decision": "autorise",
        "intervention_agent": True,
        "statut_creation": _statut(creation),
        "reponse_creation": str(creation.answer),
        "statut_verification": _statut(verif),
        "verification_acces_present": acces_ok,
        "succes_bout_en_bout": succes_bout_en_bout,
        "duree_s": duree,
    }
    journaliser(entree)
    print(f"[Verdict] succès vérifié bout-en-bout : {succes_bout_en_bout} ({duree} s)")
    return entree


# ---------------------------------------------------------------------------
# 7) Métriques agrégées (ce qu'on montre au jury)
# ---------------------------------------------------------------------------
def resumer(resultats: list[dict]) -> None:
    total = len(resultats)
    refus = [r for r in resultats if r["decision"] == "refus"]
    erreurs = [r for r in resultats if r["decision"] == "erreur"]
    # Interventions tentées = demandes autorisées (y compris celles finies en erreur).
    tentees = [r for r in resultats if r["decision"] in ("autorise", "erreur")]
    reussis = [r for r in tentees if r.get("succes_bout_en_bout")]
    duree_moy = round(sum(r["duree_s"] for r in resultats) / total, 1) if total else 0

    print("\n========== MÉTRIQUES ==========")
    print(f"Tickets traités             : {total}")
    print(f"Refus corrects (bloqués)    : {len(refus)}")
    print(f"Interventions tentées       : {len(tentees)}")
    taux = f"{len(reussis)}/{len(tentees)}" if tentees else "n/a"
    print(f"Succès vérifié bout-en-bout : {taux}")
    if erreurs:
        print(f"Échecs techniques           : {len(erreurs)}")
    print(f"Temps moyen / ticket        : {duree_moy} s")
    print("Détail complet dans logs/sessions.jsonl")


def main() -> None:
    console_url = os.getenv("CONSOLE_URL")
    groupe = os.getenv("GITLAB_GROUP", "tickai-demo")
    if not console_url:
        raise SystemExit(
            "CONSOLE_URL manquant. Renseigne dans .env l'URL des membres du groupe "
            "GitLab de test (cf. .env.example)."
        )

    client = Client()  # lit HAI_API_KEY
    agent = obtenir_agent(client)
    tickets = charger_tickets()
    etiquettes = {
        "cloud": AGENT,
        "local": "tickai-n1-local (user_device)",
        "desktop": "tickai-n1-desktop (bureau, vrais clics)",
    }
    etiquette = etiquettes.get(MODE, AGENT)
    print(f"{len(tickets)} ticket(s) · mode={MODE} · agent={etiquette} · groupe={groupe}")

    # Chaque ticket est isolé : un échec/exception (réseau, AnswerValidationError,
    # session interrompue…) est tracé mais n'interrompt pas le reste du batch.
    resultats: list[dict] = []
    for t in tickets:
        try:
            resultats.append(traiter_ticket(client, t, console_url, groupe, agent))
        except Exception as e:  # noqa: BLE001 — on veut continuer la démo
            duree = 0.0
            entree = {
                "date": datetime.now().isoformat(timespec="seconds"),
                "etape": "2-n1-access",
                "ticket": t.model_dump(),
                "decision": "erreur",
                "erreur": f"{type(e).__name__}: {e}",
                "intervention_agent": True,
                "succes_bout_en_bout": False,
                "duree_s": duree,
            }
            journaliser(entree)
            resultats.append(entree)
            print(f"[Erreur] ticket {t.id} : {type(e).__name__}: {e}")

    resumer(resultats)


if __name__ == "__main__":
    main()

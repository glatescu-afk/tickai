# Tick.AI

Plateforme d'agents IA **computer-use** pour automatiser le **support IT** des grandes
entreprises. Les agents agissent sur de vraies interfaces (voir l'écran, cliquer, taper,
naviguer) via l'**Agents API de [H Company](https://hub.hcompany.ai)** (modèles *Holo*),
plutôt que par connecteurs/API dédiés.

> Hackathon H Company « Build The Future » — 16–20 novembre 2026.

## Niveaux de support (2 niveaux)

| Niveau | Cas | Rôle de l'agent |
|--------|-----|-----------------|
| **1** | Micro qui ne fonctionne pas en réunion **Microsoft Teams** (RB-20) | ✅ L'agent **agit** sur le poste **macOS** (Teams + Réglages Système), puis **revérifie** |
| **2** | Incident complexe | ✍️ Pas d'agent : un **diagnostic écrit** est transmis au support |

Le use case de la démo finale est le **niveau 1 (micro Teams)**. Les règles que suit
l'agent sont dans [`POLICY_AGENT_TEAMS.md`](POLICY_AGENT_TEAMS.md) (runbook RB-20 +
garde-fous). Les documents sources sont dans [`documentation/`](documentation/).

## Principe de la boucle

```
Ticket validé → consentement (niveau 1) → contrôle d'autorisation (EN CODE)
             → action de l'agent → vérification INDÉPENDANTE (relecture d'état,
               session séparée) → résultat + journal
```

**On ne croit jamais l'agent sur parole.** Après son intervention, une **session
séparée en lecture seule** relit l'état réel du poste (micro sélectionné, volume
d'entrée, autorisation Teams au micro) : le succès n'est compté que si cette relecture
le confirme. Le contrôle des autorisations se fait **en code** (`tickai_core/policy.py`),
séparé du raisonnement de l'agent — jamais seulement par des instructions textuelles.
Pour le niveau 1, l'agent ne prend la main qu'après un **consentement explicite** du
collaborateur.

## Architecture (relation avec n8n + Supabase)

```
Front (portail)                     n8n (orchestrateur)              Ce dépôt (agent)
   │  crée/valide un ticket            │                                │
   └──────────────────────────────────┤                                │
            Supabase (demandes, statut, journal) ◄───── écrit ──────────┤
                                       │  POST /run {demande_id,         │
                                       │   description, callback,        │
                                       │   session_id}                   │
                                       ├────────────────────────────────►  service_api.py
                                       │           202 immédiat          │   (FastAPI, cloud)
                                       │                                 │        │
                                       │  ◄── callback {succes, resultat,│        ▼
                                       │        preuve, duree_s} ────────┤   agent_teams.py
                                       │                                 │   (RB-20, H Company)
   front lit le statut en Realtime ◄── n8n met à jour Supabase + mails ──┘
```

- Le **front ne parle jamais à H Company** : il lit `statut`/`resultat` dans Supabase.
- **n8n** déclenche `POST /run`, applique le **gate de consentement**, gère le statut final
  (`resolu`/`escalade`/`transmis_support`) et les mails (réponse client + audit support).
- **Ce dépôt** expose l'agent : `service_api.py` (ce que n8n appelle) → `agent_teams.py`
  (la capacité micro Teams) → `tickai_core` (le moteur : décision, vérif, journal).
- **Served desktop** : `service_api.py` tourne **dans le cloud** (Render) et pilote à
  distance le bureau d'une machine cible (le Mac du collaborateur) via un **bridge**
  (`holo local desktop`) et un **`session_id`**. Le modèle *Holo* est cloud ; seul le
  bridge a besoin d'un vrai écran. Voir [`demo_desktop.sh`](demo_desktop.sh).

## Structure

```
.
├── service_api.py          # API HTTP appelée par n8n : POST /run -> 202 -> callback
├── agent_teams.py          # capacité micro Teams (RB-20, macOS) pour l'engine
├── tickai_core/            # moteur stable : policy / engine / runner / audit
├── demo_desktop.sh         # served desktop : sert le bridge Mac sur un session_id fixe
├── etape1_test_agent.py    # smoke test de l'Agents API (clé + une navigation)
├── demo_local.py           # démo end-to-end locale (sans n8n), via l'engine
├── data/tickets_teams.json # tickets de démo (micro Teams)
├── POLICY_AGENT_TEAMS.md    # règles de l'agent (RB-20 + garde-fous)
├── documentation/           # docs sources (Supabase, runbooks, n8n…)
├── tests/                   # tests hors-ligne (policy, engine, runner, agent_teams)
├── front/                   # front Next.js Tick.AI (espace client + tableau de bord support)
├── Dockerfile · render.yaml
├── requirements.txt
└── .env.example            # modèle de configuration (ne pas committer .env)
```

## Installation

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # puis renseigne tes valeurs
```

Clé API H Company : https://platform.hcompany.ai/settings/api-keys (affichée une seule fois).

## Utilisation

```bash
python etape1_test_agent.py                 # smoke test : vérifie la clé + une navigation
python demo_local.py                        # démo micro Teams via l'engine (exécution réelle)
HAI_DRY_RUN=1 python demo_local.py          # décisions seules, aucune action machine

uvicorn service_api:app --host 0.0.0.0 --port 8000   # le service que n8n appelle
```

Exemple d'appel (ce que fait n8n) :

```bash
curl -X POST http://localhost:8000/run \
  -H 'Content-Type: application/json' \
  -d '{"demande_id":"TCK-0042","description":"micro HS en réunion Teams","callback_url":"https://n8n.example/webhook/xxx","session_id":"<bridge>"}'
# -> 202 {"accepte": true, ...}  puis, à la fin, POST sur callback_url :
#    {"succes": true, "resultat": "...", "preuve": "...", "duree_s": 142}
```

## Déploiement (served desktop)

- **Service** : hébergé sur **Render** (`Dockerfile` + `render.yaml`, tier gratuit).
  Variables : `HAI_API_KEY`, `HAI_BASE_URL`, `HAI_SERVED_DESKTOP=1`, `HAI_DESKTOP_SESSION_ID`.
- **Machine cible** (le Mac à l'écran) : lancer une fois le bridge, qui reste servi :

  ```bash
  ./demo_desktop.sh        # garde le Mac éveillé + sert le bridge sur un session_id fixe
  ```

  Le `session_id` doit être identique côté service (`HAI_DESKTOP_SESSION_ID`).

- **Installation « un coup » sur un Mac d'équipe** : [`setup_mac.sh`](setup_mac.sh)
  installe le CLI holo, connecte au compte H, et pose un **LaunchAgent** (le bridge
  démarre au login, se relance seul, garde le Mac éveillé). Une seule étape manuelle :
  accorder **Accessibilité** + **Enregistrement de l'écran**. Aucun autre prérequis.

## Tests

```bash
python -m unittest discover -s tests
```

Hors-ligne et déterministes (faux client H, aucun réseau) : valident la couche de
sécurité, le moteur, la fiabilité des sessions et le câblage de l'agent micro Teams.

## Sécurité & gouvernance

- **Consentement explicite** du collaborateur avant toute prise de main (niveau 1),
  vérifié par n8n avant de lancer l'agent (fail-closed).
- Contrôle d'autorisation **en code** (`tickai_core/policy.py`), indépendant de l'agent.
- **Allowlist stricte** des réglages modifiables (RB-20) : tout le reste est refusé.
- **Vérification indépendante** par relecture d'état (session séparée) avant de compter
  un succès — jamais de « résolu » sur la seule parole de l'agent.
- Sessions **bornées** (`max_steps` / `idle_timeout_s`) : l'agent ne peut pas boucler.
- Traçabilité complète (`logs/sessions.jsonl` + table `journal` Supabase + mail d'audit).
- Secrets uniquement via `.env` (jamais committé). Clé `service_role` jamais dans le front.
```

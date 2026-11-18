# Tick.AI

Plateforme d'agents IA **computer-use** pour automatiser le **support IT** des grandes
entreprises. Les agents agissent sur de vraies interfaces (voir l'écran, cliquer, taper,
naviguer) via l'**Agents API de [H Company](https://hub.hcompany.ai)** (modèles *Holo*),
plutôt que par connecteurs/API dédiés.

> Hackathon H Company « Build The Future » — 16–20 novembre 2026.

## Niveaux de support (2 niveaux)

| Niveau | Cas | Rôle de l'agent |
|--------|-----|-----------------|
| **1** | Micro qui ne fonctionne pas en réunion **Microsoft Teams** (RB-20) | ✅ L'agent **agit** sur le poste Windows, puis vérifie |
| **2** | Incident complexe | ✍️ Pas d'agent : un **diagnostic écrit** est transmis au support |

Le use case de la démo finale est le **niveau 1 (micro Teams)**. Les règles que suit
l'agent sont dans [`POLICY_AGENT_TEAMS.md`](POLICY_AGENT_TEAMS.md) (runbook RB-20 +
garde-fous). Les documents sources sont dans [`documentation/`](documentation/).

## Principe de la boucle

```
Ticket validé → contrôle d'autorisation (EN CODE) → action de l'agent
             → vérification INDÉPENDANTE (appel test Teams) → résultat + journal
```

**On ne croit jamais l'agent sur parole.** Chaque action est re-vérifiée par une
session séparée en lecture seule (l'**appel test Teams**) avant d'être comptée comme
un succès. Le contrôle des autorisations se fait **en code** (`tickai_core/policy.py`),
séparé du raisonnement de l'agent — jamais seulement par des instructions textuelles.

## Architecture (relation avec n8n + Supabase)

```
Front (portail)                     n8n (orchestrateur)              Ce dépôt (agent)
   │  crée/valide un ticket            │                                │
   └──────────────────────────────────┤                                │
            Supabase (demandes, statut, journal) ◄───── écrit ──────────┤
                                       │  POST /run {demande_id,         │
                                       │        description, callback}   │
                                       ├────────────────────────────────►  service_api.py
                                       │           202 immédiat          │   (FastAPI)
                                       │                                 │        │
                                       │  ◄── callback {succes, resultat,│        ▼
                                       │        preuve, duree_s} ────────┤   agent_teams.py
                                       │                                 │   (RB-20, H Company)
   front lit le statut en Realtime ◄── n8n met à jour Supabase + mails ──┘
```

- Le **front ne parle jamais à H Company** : il lit `statut`/`resultat` dans Supabase.
- **n8n** déclenche `POST /run` et gère le statut final (`resolu`/`escalade`) + les mails.
- **Ce dépôt** expose l'agent : `service_api.py` (ce que n8n appelle) → `agent_teams.py`
  (la capacité micro Teams) → `tickai_core` (le moteur : décision, vérif, journal).

## Structure

```
.
├── service_api.py          # API HTTP appelée par n8n : POST /run -> 202 -> callback
├── agent_teams.py          # capacité micro Teams (RB-20, Windows) pour l'engine
├── tickai_core/            # moteur stable : policy / engine / runner / audit
├── etape1_test_agent.py    # smoke test de l'Agents API (clé + une navigation)
├── demo_local.py           # démo end-to-end locale (sans n8n), via l'engine
├── data/tickets_teams.json # tickets de démo (micro Teams)
├── POLICY_AGENT_TEAMS.md    # règles de l'agent (RB-20 + garde-fous)
├── documentation/           # docs sources (Supabase, runbooks, n8n…)
├── tests/                   # tests hors-ligne (policy, engine, runner, agent_teams)
├── tickai-portal/           # front Next.js (rebranchement Supabase à venir)
├── requirements.txt
└── .env.example             # modèle de configuration (ne pas committer .env)
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
  -d '{"demande_id":"TCK-0042","description":"micro HS en réunion Teams","callback_url":"https://n8n.example/webhook/xxx"}'
# -> 202 {"accepte": true, ...}  puis, à la fin, POST sur callback_url :
#    {"succes": true, "resultat": "...", "preuve": "...", "duree_s": 142}
```

## Tests

```bash
python -m unittest discover -s tests
```

Hors-ligne et déterministes (faux client H, aucun réseau) : valident la couche de
sécurité, le moteur, la fiabilité des sessions et le câblage de l'agent micro Teams.

## Sécurité & gouvernance

- Contrôle d'autorisation **en code** (`tickai_core/policy.py`), indépendant de l'agent.
- **Allowlist stricte** des réglages modifiables (RB-20) : tout le reste est refusé.
- **Vérification indépendante** (appel test Teams) avant de compter un succès.
- Traçabilité complète (`logs/sessions.jsonl` + table `journal` Supabase).
- Secrets uniquement via `.env` (jamais committé). Clé `service_role` jamais dans le front.

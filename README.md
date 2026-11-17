# Tick.AI

Plateforme d'agents IA **computer-use** pour automatiser le **support IT** des grandes
entreprises. Les agents agissent sur de vraies interfaces (voir l'écran, cliquer, taper,
naviguer) via l'**Agents API de [H Company](https://hub.hcompany.ai)** (modèles *Holo*),
plutôt que par connecteurs/API dédiés.

> Hackathon H Company « Build The Future » — 16–20 novembre 2026.

## Niveaux de support

| Niveau | Nom | Statut |
|--------|-----|--------|
| **N1** | Access Management — création/contrôle d'accès logiciels | ✅ MVP |
| **N2** | Software Troubleshooting — diagnostic + correction (ex. Teams) | 🚧 MVP |
| N3 | Advanced IT Diagnostics | hors MVP |

## Principe de la boucle (démo)

```
Ticket arrivé → contrôle d'habilitation (EN CODE) → intervention de l'agent
             → vérification INDÉPENDANTE du résultat → ticket mis à jour + journal
```

Le principe clé : **on ne croit jamais l'agent sur parole**. Chaque action est
re-vérifiée par une session séparée en lecture seule avant d'être comptée comme un
succès. Le contrôle des habilitations se fait en code, séparé du raisonnement de
l'agent — pas seulement par des instructions textuelles.

## Cas N1 (ce dépôt)

Console de test : **GitLab** (gestion des membres d'un groupe).
Pour chaque ticket du dataset :

1. `est_autorise()` décide **en code** si le rôle du demandeur a droit au logiciel.
2. Refusé → l'agent n'agit pas, le **refus correct** est journalisé.
3. Autorisé → l'agent invite l'utilisateur au groupe GitLab (rôle *Developer*).
4. Une **session de vérification** séparée relit la liste des membres.
5. Succès = `completed` **et** utilisateur réellement présent. Tout est journalisé.

## Installation

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # puis renseigne tes valeurs
```

Clé API : https://platform.hcompany.ai/settings/api-keys (affichée une seule fois).

## Utilisation

```bash
python etape1_test_agent.py        # smoke test : vérifie la clé + une navigation
python etape2_agent_n1_access.py   # agent N1 : traite data/tickets_n1.json
```

Métriques affichées en fin d'exécution (réussite bout-en-bout, temps moyen, refus
corrects) et détaillées dans `logs/sessions.jsonl`.

## Structure

```
.
├── etape1_test_agent.py       # smoke test de l'Agents API
├── etape2_agent_n1_access.py  # agent N1 Access Management (GitLab)
├── data/tickets_n1.json       # dataset de tickets fictifs
├── requirements.txt
├── .env.example               # modèle de configuration (ne pas committer .env)
└── logs/                       # journaux de sessions (git-ignoré)
```

## Sécurité & gouvernance (exigences de conception)

- Contrôle d'habilitation **en code**, indépendant de l'agent.
- Vérification indépendante de chaque action avant de la compter comme réussie.
- Consignes explicites : aucune action destructive, aucune modification hors périmètre.
- Traçabilité complète via `logs/sessions.jsonl`.
- Compte GitLab de test **jetable** (sans 2FA) recommandé : les identifiants passés
  via `.env` sont transmis à l'agent cloud. Ne jamais committer `.env`.

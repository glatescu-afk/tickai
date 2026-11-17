# Tick.AI — Portail (front + stubs d'API)

Front **Next.js (App Router)** déployable sur **Vercel**. Le back (base tickets,
routes runner, n8n) se branche **plus tard**, dans ce même projet, sur les routes
`/api/*` déjà présentes en stub. Ne dépend **pas** de `tickai_core` (Python), qui
vit dans le runner sur le Mac.

## Lancer en local
```bash
cd tickai-portal
npm install
npm run dev        # http://localhost:3000
```
Parcours : `/` → « Créer une demande » → `/demande` → envoi → `/suivi/{id}` (tracker 6 états).

## Déployer sur Vercel
1. Pousser ce dossier sur un repo GitHub.
2. Sur **vercel.com/new**, importer le repo (Vercel détecte Next.js tout seul).
3. Chaque `git push` redéploie.

Variables d'environnement (Vercel → Settings), à remplir quand le back arrive :
`DATABASE_URL`, `RUNNER_TOKEN`.

## Ce qui est déjà là
- **Front** : accueil, formulaire (`/demande`), tracker de suivi (`/suivi/[id]`).
- **API (stubs)** alignés sur le contrat de l'engine :
  - `POST /api/tickets` — crée un ticket (formulaire + n8n).
  - `GET  /api/runner/next` — le runner réclame un ticket prêt.
  - `POST /api/tickets/{id}/progress` — avancement (on_progress).
  - `POST /api/tickets/{id}/result` — résultat final (engine.Resultat).

## Ce qui reste (back, plus tard)
- Remplacer le store en mémoire (`app/lib/store.js`) par une vraie base (Vercel
  Postgres / Neon).
- Sécuriser `/api/runner/*` (Bearer `RUNNER_TOKEN`) et gérer les consentements.
- Brancher n8n (formulaire → `POST /api/tickets`) et les mails.
- Ne jamais clôturer automatiquement sur `resolu` : attendre la confirmation user.

> Front de démonstration : `app/lib/tickets.js` est un **miroir d'affichage** du
> contrat (`EtatSuivi` / `Issue`) ; la décision réelle reste dans `tickai_core`.

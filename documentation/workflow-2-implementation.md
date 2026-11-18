# Tick.AI — Workflow 2 : note d'implémentation n8n

> Compagnon des specs équipe (à lire avec elles, pas à leur place) :
> - *Skill n8n — Workflow 2 (exécution agent / diagnostic)* — la spec de référence des nœuds.
> - *Guide Gabriel — brancher l'agent H Company à n8n (workflow 2)* — le contrat d'intégration.
> - *Fiche Supabase — architecture des tables* — le schéma (`demandes`, `profils`, `messages`, `journal`).
>
> Cette note décrit **ce qui a été réellement construit** sur l'instance et **ce qu'il reste à faire** pour le rendre vivant.

## 1. Ce qui est en place

- **Workflow** : « Tick.AI — Exécution (workflow 2) », id `Dmchb691CR29lwbj`.
  URL n8n : https://tickai.app.n8n.cloud/workflow/Dmchb691CR29lwbj
  État : **brouillon non publié** (à publier explicitement quand il sera testé).
- **Webhook d'entrée** : `POST /webhook/tickai-execution`, body `{ "demande_id": "..." }`, **répond immédiatement** (le WF1 n'attend pas la fin de l'agent).
- **Credentials réutilisés** (déjà présents sur l'instance) : `Supabase Tickai`, `Gmail Tickai`, `HuggingFace Tickai`.
- **Hugging Face** : même montage que le WF1 — nœud `Chain LLM` + sous-nœud `lmChatOpenAi`, modèle `meta-llama/Llama-3.3-70B-Instruct` (credential OpenAI-compatible du routeur HF).

## 2. Carte des nœuds (fidèle à la spec)

**Tronc commun** : `Webhook exécution` → `Normaliser` (extrait `demande_id`) → `Lire la demande` (table `demandes`, par `id`) → `Lire profil` (table `profils`, par `user_id`) → `Aiguiller selon le niveau` (Switch sur `niveau`).

**Niveau 1 — agent H Company** (Switch sortie 1) :
`Passer en cours` (`statut = en_cours`) → `Journal : agent lancé` → `Appeler le service agent` (HTTP POST `/run`) → `Attendre le callback agent` (Wait, resume webhook POST, **limite 15 min**) → `Agent réussi ?` (If `succes`)
- **vrai** → `Marquer résolu` (`statut = resolu`, `resultat`, `preuve`) → `Journal : vérification OK` → `Mail résolu (client)`.
- **faux ou délai dépassé** → `Marquer escalade` (`statut = escalade`, `resultat`) → `Journal : escalade` → `Mail escalade (client)` → `Mail escalade (support)`.

**Niveau 2 — diagnostic** (Switch sortie 2) :
`Charger les messages` → `Préparer le diagnostic` → `Hugging Face (diagnostic)` → `Enregistrer le diagnostic` (`diagnostic`, `statut = transmis_support`) → `Journal : diagnostic généré` → `Mail transmis (client)`.

## 3. Contrat avec le service agent (`service_api.py`)

Le workflow appelle le service de Gabriel ; il ne pilote jamais la machine lui-même.

```
POST {SERVICE_URL}/run
  { "demande_id": "...", "description": "...", "callback_url": "{{ $execution.resumeUrl }}" }
  → 202 immédiat.
À la fin, le service POST sur callback_url :
  { "succes": bool, "resultat": "...", "preuve": "...", "duree_s": 142 }
  succes = true UNIQUEMENT si la vérification indépendante (appel test Teams) a confirmé.
```

C'est **n8n qui décide** du statut final (`resolu` / `escalade`) et envoie les mails. Le service exécute et rend compte.

## 4. Décisions & écarts assumés (vs spec)

- **Mail support niveau 2** : reste dans le **WF1** (branche « valider »), pas ici — on ne double pas l'alerte. WF2 niveau 2 se contente de `transmis_support` + mail client.
- **Diagnostic niveau 2 en texte simple** (pas `response_format: json_object` puis reformatage) : le modèle rend directement un diagnostic structuré en 4 parties, écrit tel quel dans `demandes.diagnostic`. Évite un nœud Code de parsing et son risque. Même résultat stocké.
- **Mails résolu/escalade/transmis = nœuds distincts** (au lieu d'un seul nœud « 2e mail » paramétré par statut). Plus lisible, comportement identique.
- **`journal`** : une ligne par étape clé (`agent_lance`, `verification_ok` / `escalade`, `diagnostic_genere`). `details` (jsonb) laissé vide pour l'instant (la frise bonus s'appuie sur `evenement` + `created_at`).
- **Résilience** : `Appeler le service agent` est en `continueRegularOutput` (si le service est injoignable, on tombe dans le Wait qui expire en 15 min → escalade, jamais de blocage). Le Wait avec limite garantit : **délai dépassé → escalade**, jamais `resolu` sans vérification.
- **SUPPORT_EMAIL** : codé en dur `sranganadane+support@eugeniaschool.com` (comme le WF1), à passer en variable n8n plus tard.

## 5. Ce qu'il reste à faire pour le rendre vivant

1. **`SERVICE_URL`** : renseigner l'URL du service agent dans le nœud `Appeler le service agent`.
   Le service tourne **sur la machine qui a le bureau** (le Mac), car le computer-use H Company a besoin d'un vrai écran. Pour que n8n (cloud) l'atteigne, l'exposer par un tunnel :
   ```
   uvicorn service_api:app --host 0.0.0.0 --port 8000
   ngrok http 8000      # → https://xxxx.ngrok.app
   ```
   puis mettre `https://xxxx.ngrok.app/run` dans le nœud.
2. **Brancher le WF1 sur le WF2** : à la fin de la branche « valider » du WF1, ajouter un `HTTP Request` → `POST .../webhook/tickai-execution` avec `{ "demande_id": "..." }`. (WF1 est publié : à faire avec confirmation.)
3. **Publier le WF2** une fois testé.

## 6. Tester sans l'agent (recette de la spec)

Tant que le service n'est pas joignable : mettre une URL bidon dans `Appeler le service agent` (il tombera en `continueRegularOutput`), déclencher le webhook avec un `demande_id` de niveau 1, repérer la **resume URL** du nœud Wait dans l'exécution, et l'appeler à la main avec un faux callback :

```
POST <resume-url>
{ "succes": true, "resultat": "Micro corrigé (test).", "preuve": "voix rejouée", "duree_s": 30 }
```

Ça valide toute la mécanique (statuts, Realtime côté front, mails, journal) sans l'agent. Un `demande_id` de niveau 2 teste la branche diagnostic de bout en bout (Hugging Face est déjà joignable).

## 7. Checklist (spec)

- [ ] WF1 appelle `tickai-execution` après « Valider »
- [ ] Niveau 2 → `transmis_support` avec un `diagnostic`
- [ ] Niveau 1 → `en_cours`, puis `resolu` ou `escalade`
- [ ] Délai dépassé → `escalade` (jamais `resolu` sans vérification)
- [ ] 2e mail client dans les 3 cas ; mail support seulement sur escalade niveau 1
- [ ] Chaque étape apparaît dans `journal`

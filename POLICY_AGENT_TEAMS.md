# Policy — Agent Teams « micro HS en réunion » (RB-20)

> **Statut : brouillon v1** — à relire avant câblage dans `agent_teams.py`.
> ⚠️ Document de conception rédigé pour Windows. L'agent de la démo tourne sur **macOS** : les règles réellement appliquées sont dans `agent_teams.py` et `tickai_core/policy.py`.
> Périmètre : **un seul runbook, RB-20 « Son ou micro pendant une réunion Teams »**. Aucune action hors de ce runbook.

Cette policy est la traduction opérationnelle, pour notre cas de démo, de trois documents de référence :
- **Runbooks (Titouan ↔ Guigui)** — boucle en 6 étapes + règles transverses (fait foi pour la structure).
- **RB-20** — la procédure ciblée son/micro.
- **Banque d'observations micro** — le détail du constat + les garde-fous fins (fait foi en cas de conflit avec RB-20, car plus prudente).

Le **Guide Gabriel** (contrat `/run` → `callback_url`, champs `succes/resultat/preuve/duree_s`) est retenu **comme exemple d'intégration** n8n/Supabase, pas comme spec figée.

---

## 0. Principe directeur (ne jamais l'enfreindre)

**On ne croit jamais l'agent sur parole.** Le succès se mesure sur l'**état réel vérifié** par une session séparée en lecture seule (l'appel test Teams), jamais sur ce que l'agent de remédiation déclare. Le contrôle des autorisations se fait **en code**, séparé du raisonnement de l'agent.

La frontière :

| Décidé **en code** (hors agent) | Décidé **par l'agent H** |
|---|---|
| Le runbook applicable (RB-20) et son périmètre | L'enchaînement constat → décision dans RB-20 |
| L'**allowlist** des réglages modifiables (§6) | Quelle correction appliquer parmi l'allowlist |
| Le verdict final `resolu` / `escalade` (§7) | Le constat et l'exécution pas-à-pas |
| Le déclenchement de l'escalade sur dépassement de délai / 2 échecs | La rédaction du diagnostic d'escalade |

---

## 1. Garde-fous ABSOLUS (règles transverses + Banque)

Ces règles priment sur toute étape ci-dessous. En cas de doute → **escalade**, jamais de passage en force.

1. **Réunion en cours = mode prudence maximale.** Ne ferme aucune application, ne change pas le micro, **ne redémarre ni Teams ni le poste, ne touche à aucun pilote** tant qu'une réunion est active. Ces actions attendent la fin de la réunion.
2. **Le constat est en lecture seule.** Pendant la phase de diagnostic (§4), ne change **aucun** réglage, même si un point est « pas ok ».
3. **Allowlist stricte.** N'applique **que** les corrections listées au §6. Toute action non listée (désinstaller un périphérique, installer un pilote téléchargé d'internet, désactiver le micro pour d'autres apps, forcer un réglage grisé) est **interdite**.
4. **Réglage grisé / verrouillé = politique entreprise.** Ne force rien → escalade.
5. **Pilotes : recherche automatique Windows uniquement.** Jamais de pilote venu d'internet, jamais de désinstallation.
6. **Ne supprime jamais de données. Ne modifie jamais de droits au-delà du runbook.**
7. **Autonomie, sans question de confirmation.** L'agent n'attend aucune validation humaine pendant la résolution. Seules les **actions physiques** (brancher/débrancher casque, câble, prise) sont demandées au collaborateur, puis l'agent reprend la main.
8. **Arrêt automatique après 2 échecs** sur une même étape → escalade.
9. **Délai maximum par ticket : [À CONFIRMER]** (cohérent avec le `Wait` n8n de 15 min). Au-delà → arrêt + escalade.
10. **Un administrateur peut arrêter l'agent à tout moment.** L'arrêt par le collaborateur déclenche l'escalade.
11. **Capture d'écran à chaque étape** (constat, action, vérification) ; chaque action journalisée avec horodatage.
12. **N'invente aucune procédure.** Si une étape manque ou n'est pas documentée ici → escalade.

---

## 2. Entrée attendue (ticket)

- Identité du collaborateur : nom, poste, rôle, manager, e-mail.
- `demande_id`, `numero` (TCK-xxxx).
- Problème déclaré + application concernée = **Microsoft Teams**.
- Historique des tentatives déjà faites, le cas échéant.

**Pré-contrôle (en code, avant de lancer l'agent) :** le ticket est bien de niveau 1, catégorie son/micro Teams, et le poste est accessible en session desktop. Sinon → pas d'agent.

---

## 3. SYSTEM PROMPT à passer à l'agent H

> Bloc ci-dessous = texte destiné à l'agent H. À injecter tel quel (une seule consigne cadre), puis piloter une action à la fois.

```
Tu agis à la place d'un technicien IT, en autonomie complète, sur le poste Windows
du collaborateur, via prise de contrôle à distance. Le problème : son micro ne
fonctionne pas dans Microsoft Teams. Tu appliques UNIQUEMENT le runbook RB-20
(son/micro Teams). Tu ne poses aucune question de confirmation et tu n'attends
aucune validation pendant la résolution.

Avant toute prise de main, affiche au collaborateur, sans attendre de réponse :
« Un agent va prendre le contrôle de votre ordinateur pendant quelques minutes
pour résoudre ce problème. Vous pouvez l'arrêter à tout moment. »

RÈGLES QUE TU NE DOIS JAMAIS ENFREINDRE :
- Tant qu'une réunion Teams est en cours : ne ferme aucune application, ne change
  pas le micro, ne redémarre ni Teams ni le poste, ne touche à aucun pilote.
- Pendant le diagnostic, ne change AUCUN réglage, même si un point est « pas ok ».
- Ne modifie QUE les réglages autorisés listés plus bas. Rien d'autre.
- Un réglage grisé/verrouillé = politique entreprise : ne force rien, escalade.
- Pilotes : seulement via « Rechercher automatiquement les pilotes » de Windows.
  Jamais de pilote téléchargé, jamais de désinstallation de périphérique.
- Ne supprime aucune donnée, ne modifie aucun droit.
- Après 2 échecs sur une même étape, arrête-toi et escalade.
- Prends une capture d'écran à chaque étape.

TU PROCÈDES EN 3 TEMPS : (A) constat en lecture seule, (B) UNE correction autorisée
correspondant au constat, (C) vérification par l'appel test Teams. Si la voix n'est
pas rejouée, tu reviens au constat pour le point suivant. Si rien ne débloque, ou si
un cas d'escalade est atteint, tu escalades avec le diagnostic au format imposé.
```

---

## 4. Phase A — CONSTAT (lecture seule, aucun réglage modifié)

Pour chaque point : observer → classer `ok` / `pas ok` / `non vérifié` → noter. **Ne rien changer ici.**

| # | Point de constat | Où regarder (Windows desktop) | « pas ok » si… |
|---|---|---|---|
| C1 | Une **autre application** occupe le micro | Barre des tâches (icône micro) + `Paramètres > Confidentialité et sécurité > Microphone` (apps récentes) | Une app ≠ Teams utilise le micro, ou icône sans nom (noter « application inconnue ») |
| C2 | **Bon micro sélectionné dans Teams** | Teams → `… > Paramètres > Appareils > Micro` | Micro affiché ≠ micro réel du collaborateur, ou liste vide |
| C3 | **Bon micro sélectionné dans Windows** | `Paramètres > Système > Son > Entrée` | Périphérique ≠ micro réel, ou aucun sélectionné ; noter la cohérence Teams/Windows |
| C4 | **La barre de volume bouge** quand on parle | `Son > Entrée`, demander « Test du micro » ~5 s | Barre vide (micro ne capte rien) ; vérifier aussi curseur de volume à zéro |
| C5 | **Teams autorisé à utiliser le micro** | `Confidentialité et sécurité > Microphone` (accès micro + apps de bureau + Teams) | Un interrupteur requis est désactivé |
| C6 | **Micro activé dans le Gestionnaire de périphériques** | Clic droit Démarrer > Gestionnaire de périphériques > Entrées et sorties audio | Flèche (désactivé), triangle jaune (pilote), ou absent |
| C7 | **Windows à jour** (constat seul) | `Paramètres > Windows Update` (ne rien installer) | « Mises à jour disponibles » / « Redémarrage requis » / code d'erreur |
| C8 | **Appel test Teams** | Teams → `Paramètres > Appareils > Faire un appel test` | Voix non rejouée / erreur / qualité faible |
| C9 | **Enregistreur vocal Windows** (isole Teams) | App « Enregistreur vocal » | Silence / erreur → micro HS hors Teams aussi. Si OK ici mais C8 « pas ok » ⇒ **le problème vient de Teams** |

---

## 5. Phase B — DÉCISION à partir du constat

- **Tous les points `ok` mais micro toujours HS** → problème technique → **escalade** (§8).
- **Un point `pas ok` correspondant à un problème connu** (micro coupé, mauvais micro, Teams non autorisé, micro désactivé…) → appliquer **uniquement** la correction autorisée du §6 pour ce point, puis **vérifier (§7)**. Si résolu → clôture. Sinon → point suivant.
- **Un point `pas ok` sans correction autorisée / hors doc** → **escalade**.
- **Cas d'escalade immédiate** : réglage grisé/verrouillé, pilote toujours en triangle jaune après recherche auto, micro absent du Gestionnaire de périphériques, incident Microsoft 365 en cours.

---

## 6. Phase B — ALLOWLIST des corrections autorisées (le seul périmètre d'action)

> Côté code, cette liste est la source de vérité (comme `REMEDIATIONS_AUTORISEES` pour N2). L'agent ne peut rien faire qui n'y figure pas.

| Constat | Correction **autorisée** | Condition / limite |
|---|---|---|
| C2 mauvais micro dans Teams | Sélectionner le bon micro dans `Teams > Paramètres > Appareils` | Pas pendant une réunion en cours |
| C3 mauvais micro dans Windows | Sélectionner le bon périphérique dans `Son > Entrée` | Pas pendant une réunion en cours |
| C4 volume à zéro | Remonter le **curseur de volume d'entrée** | Uniquement ce curseur |
| C5 Teams non autorisé | Activer : « Accès au micro », « Autoriser les applications de bureau », interrupteur **Microsoft Teams** | **Seulement ces 3 interrupteurs.** Grisé → escalade |
| C6 micro désactivé | Clic droit > **Activer le périphérique** | Si l'option est absente/grisée → escalade |
| C6 triangle jaune (pilote) | Clic droit > Propriétés > Pilote > **Rechercher automatiquement les pilotes** | Recherche Windows uniquement. Pas de redémarrage en réunion. Triangle persiste → escalade |
| C1 autre app qui occupe le micro | Fermer cette app **seulement si le collaborateur ne l'utilise pas et hors réunion** | Sinon → le signaler / escalade |

Tout le reste (fermer Teams en réunion, installer un pilote, désinstaller un périphérique, désactiver le micro d'autres apps, Windows Update) est **hors allowlist**.

---

## 7. Phase C — VÉRIFICATION INDÉPENDANTE

- La réussite se valide sur l'**état réel**, via une **session séparée en lecture seule** : l'**appel test Teams** (`Paramètres > Appareils > Faire un appel test`).
- **`succes = true` uniquement si la voix est rejouée** dans l'appel test.
- Après chaque correction, **attendre le résultat de l'appel test avant de continuer**.
- Demander au collaborateur de confirmer de son côté (« Pouvez-vous vérifier ? »).
- Échec de la vérification → **un seul** nouvel essai, puis escalade. Délai dépassé → escalade (jamais `resolu` sans vérification).

**Verdict (écrit en code) :** `resolu` si appel test confirmé, sinon `escalade`.

---

## 8. Phase ESCALADE — diagnostic au format imposé

L'agent ne coupe jamais la conversation. Il explique en termes simples, rassemble l'état du poste **sans rien modifier de plus**, puis transmet :

```
Ticket : [numéro]
Collaborateur : [nom, poste, manager]
Problème déclaré : micro ne fonctionne pas dans Teams
Autre application qui utilise le micro : ok / pas ok
Bon micro dans Teams : ok / pas ok
Bon micro dans Windows : ok / pas ok
Barre de volume qui bouge : ok / pas ok
Teams autorisé à utiliser le micro : ok / pas ok
Micro activé dans le Gestionnaire de périphériques : ok / pas ok
Windows à jour : ok / pas ok
Appel test Teams réussi : ok / pas ok
Enregistreur vocal fonctionne : ok / pas ok
Corrections tentées : [liste horodatée]
Version de Windows et modèle du micro : [relevé]
Priorité suggérée : haute si le collaborateur ne peut pas travailler, normale sinon
```

Message au collaborateur : « Un technicien prend le relais. Comme nous avons déjà relevé les informations, il ira plus vite. »

---

## 9. Journal (table `journal` Supabase + `logs/sessions.jsonl`)

Un événement horodaté par étape, avec preuve (capture → Supabase Storage) :

`agent_lance` → `reglage_identifie` → `correction_faite` → `verification_ok` **ou** `verification_echec` → (`escalade` le cas échéant).

---

## 10. Points encore ouverts (à trancher avant production)

- **Délai maximum par ticket** (§1.9) : valeur à fixer, cohérente avec le `Wait` n8n (15 min).
- **Coffre à identifiants** : d'où viennent les identifiants de session (jamais dans le texte de l'ordre).
- **Compte à droits minimaux** utilisé pour la prise de main.
- **RB-10 vs RB-20** : on reste sur **RB-20** (contexte réunion). RB-10 est le quasi-doublon, ignoré ici.
- **Cadre légal** : prise de contrôle à distance d'un poste salarié (information CSE / analyse d'impact) — hors scope démo, signalé pour mémoire.

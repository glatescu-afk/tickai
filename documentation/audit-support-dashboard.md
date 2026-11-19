# Fiche d'audit dans le dashboard support — spec front

> Pour le dev du front (`tick-ai-front`). Objectif : afficher, dans la vue détail
> d'un ticket du **dashboard support**, une **fiche d'audit** de l'intervention
> (ce que l'agent a fait, la preuve, la frise d'événements). **Aucune action
> back-end supplémentaire n'est requise** : tout est déjà dans Supabase.

## 1. D'où viennent les données

Deux tables, le même projet Supabase que le reste du front :

- **`demandes`** (1 ligne = le ticket) : le résultat, la preuve, le diagnostic, le consentement, la durée.
- **`journal`** (N lignes = la frise) : un événement horodaté par étape clé.

## 2. Champs à afficher (table `demandes`)

| Champ | Type | Sens | Affichage |
|---|---|---|---|
| `numero` | text | n° ticket (TCK-xxxx) | titre |
| `statut` | text | état final (voir §5) | badge |
| `niveau` | int | 1 = agent, 2 = diagnostic | badge |
| `resultat` | text | **ce que l'agent a fait** | bloc principal |
| `preuve` | text | **vérification indépendante** (relecture d'état) | bloc « preuve » |
| `diagnostic` | text | diagnostic (coulisses / niveau 2) | bloc repliable |
| `duree_s` | numeric | durée d'intervention agent (secondes) | ex. « 2 min 50 s » |
| `consentement_agent` | bool | le collaborateur a-t-il autorisé l'agent | ✅/—  |
| `consentement_at` | timestamptz | date du consentement | sous le badge |
| `updated_at` | timestamptz | dernière mise à jour | pied de fiche |

> `resultat`/`preuve` peuvent contenir des retours à la ligne (`\n`) → convertir en `<br>` ou `white-space: pre-line`.

## 3. La frise (table `journal`)

Une ligne par étape, à afficher **triée par `created_at` croissant**. Événements possibles :

| `evenement` | Niveau | Signification |
|---|---|---|
| `agent_lance` | 1 | l'agent a été lancé sur le poste |
| `verification_ok` | 1 | vérification indépendante confirmée → **résolu** |
| `escalade` | 1 | agent en échec / non vérifié → transmis à un humain |
| `diagnostic_genere` | 2 | diagnostic écrit généré → transmis au support |

(`details` est un `jsonb`, réservé à un usage futur — ignorer pour l'instant.)

## 4. Requête prête (supabase-js)

```js
// id = demandes.id (uuid) du ticket ouvert dans le dashboard
const { data: ticket, error: e1 } = await supabase
  .from('demandes')
  .select('numero,statut,niveau,resultat,preuve,diagnostic,duree_s,consentement_agent,consentement_at,updated_at')
  .eq('id', id)
  .single();

const { data: frise, error: e2 } = await supabase
  .from('journal')
  .select('evenement,created_at')
  .eq('demande_id', id)
  .order('created_at', { ascending: true });
```

Helper durée (si `duree_s` absent sur d'anciens tickets, retomber sur la frise) :

```js
function dureeAffichee(ticket, frise) {
  let s = ticket.duree_s;
  if (s == null && frise?.length) {
    const t0 = new Date(frise[0].created_at);
    const t1 = new Date(frise[frise.length - 1].created_at);
    s = (t1 - t0) / 1000;
  }
  if (s == null) return '—';
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return m ? `${m} min ${r} s` : `${r} s`;
}
```

## 5. Statuts (badge)

| `statut` | Libellé | Couleur suggérée |
|---|---|---|
| `valide` | Validé | neutre |
| `en_cours` | Intervention en cours | bleu |
| `resolu` | Résolu (auto) | vert |
| `escalade` | Escaladé (humain) | orange |
| `transmis_support` | Transmis au support (diagnostic) | violet |

## 6. Rendu proposé du panneau « Audit »

```
┌ Ticket TCK-0061   [Résolu auto] [Niveau 1]
│ Consentement : ✅ le 19/11 13:28   ·   Durée : 2 min 52 s
│
│ Ce que l'agent a fait
│   Activé l'autorisation du micro pour Microsoft Teams (Réglages Système >
│   Confidentialité > Microphone), puis Quit & Reopen Teams.
│
│ Preuve (vérification indépendante)
│   (a) Teams : micro « MacBook Air Microphone » sélectionné …
│   (b) Son > Entrée : volume ~50 % …  (c) Teams autorisé au micro …
│
│ Frise
│   13:28:30  Agent lancé
│   13:31:22  Vérification OK → résolu
│
│ ▸ Diagnostic (coulisses)   [repliable]
└
```

## 7. Temps réel (optionnel mais recommandé)

Le Realtime est déjà activé sur `demandes`. S'abonner aux `UPDATE` de la ligne
pour rafraîchir la fiche en direct (ex. `en_cours` → `resolu`) sans recharger :

```js
supabase.channel('ticket-' + id)
  .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'demandes', filter: 'id=eq.' + id },
      ({ new: row }) => majFiche(row))
  .subscribe();
```

## 8. À vérifier côté Supabase (RLS)

Le rôle qui alimente le dashboard support doit pouvoir **lire** `demandes` **et**
`journal`. Si une policy RLS manque sur `journal`, la frise reviendra vide (sans
erreur bloquante). Vérifier/ajouter une policy `select` pour le rôle support.

## 9. Notes

- **Niveau 1** = l'agent a agi sur le poste (`resultat`/`preuve` remplis).
  **Niveau 2** = pas d'agent : seul `diagnostic` est rempli, statut `transmis_support`.
- `resultat`/`preuve` sont écrits par le workflow n8n (WF2) depuis le callback de
  l'agent ; `duree_s` est la durée mesurée par l'agent (en secondes).

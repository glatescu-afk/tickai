# Runbook — lancer l'agent N1 en mode **desktop** (vrais clics)

> Pourquoi ce mode : l'agent *web* passe Cloudflare en local, mais ses clics
> **synthétiques** ne déclenchent pas le bouton Vue.js « Invite members » de GitLab.
> Le mode **desktop** utilise la **vraie souris/clavier** (événements OS réels) qui,
> eux, réveillent le bouton comme un humain. Contrepartie : permissions macOS.

Tout est déjà configuré (`.env` → `HAI_RUN_MODE=desktop`, groupe `tickai-group1`).
Il reste **3 étapes manuelles**, à faire une fois.

---

## 1. Autoriser Terminal (Réglages Système → Confidentialité et sécurité)

Ajoute **Terminal** dans ces deux listes et **active l'interrupteur** :

- **Accessibilité** → `x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility`
- **Enregistrement de l'écran** → `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`

(Colle ces liens dans Safari pour ouvrir directement le bon panneau, ou passe par
Réglages Système → Confidentialité et sécurité.)

## 2. Quitter puis rouvrir Terminal

Les permissions ne s'appliquent qu'à un **processus neuf** : **⌘Q** sur Terminal,
puis rouvre-le. *(C'est l'étape qui ferme la session Claude Code en cours — normal.)*

## 3. Préparer GitLab à l'écran

Dans ton **Chrome habituel**, connecte-toi à GitLab si besoin et ouvre, **fenêtre
visible au premier plan** :

```
https://gitlab.com/groups/tickai-group1/-/group_members
```

Ferme le panneau **GitLab Duo** à droite s'il s'ouvre.

---

## 4. Lancer (dans le Terminal rouvert)

```bash
cd ~/Downloads/tickai

# a) Smoke test : confirme que l'agent voit/contrôle l'écran (rapide)
./.venv/bin/python etape3_desktop_smoke.py | tee logs/desktop_smoke.txt

# b) Agent N1 complet : invitation réelle + vérification indépendante
./.venv/bin/python etape2_agent_n1_access.py | tee logs/desktop_n1.txt
```

> ⚠️ Pendant que ça tourne, **ne touche pas** la souris ni le clavier : l'agent
> pilote le vrai curseur. Les résultats s'affichent et sont copiés dans
> `logs/desktop_*.txt` + `logs/sessions.jsonl`.

## 5. Reprendre avec Claude

Relance `claude` dans ce dossier. La mémoire projet est à jour ; tu peux dire
« regarde logs/desktop_n1.txt » pour qu'il analyse le résultat.

---

### Si ça bloque encore
- **Permission refusée** au lancement → l'app autorisée n'est pas celle qui lance
  Python, ou Terminal n'a pas été relancé. Refais 1–2.
- **L'agent n'ouvre pas la bonne page** → laisse la page des membres déjà ouverte
  et au premier plan avant de lancer.
- **Le clic « Invite members » échoue même en desktop** → note-le : ce serait un
  vrai résultat. Plan B documenté : invitation via l'API GitLab (token) en gardant
  l'agent pour la vérification visuelle.

# **Tick.AI — Comment tester**

Le prototype se teste en 5 minutes depuis un navigateur : [https\://tick-ai-front.vercel.app](https://tick-ai-front.vercel.app)

## **1\. Côté collaborateur**

1. Ouvrez le site et créez un compte collaborateur (prénom, poste, e-mail, mot de passe). Utilisez une vraie adresse : vous recevrez un mail de confirmation, puis les mails de suivi du ticket.  
2. Cliquez sur « Nouvelle demande » et décrivez l'un des deux cas pris en charge par l'agent :  
   * « Mon micro ne fonctionne pas en réunion Teams »  
   * « Je ne reçois plus mes notifications Teams »  
3. Répondez aux questions du chatbot, puis validez le résumé proposé.  
4. Donnez votre accord pour l'intervention de l'agent (« Lancer maintenant »).  
5. Suivez le ticket en direct : il passe en cours, puis en « résolu » ou en « escalade ». Une intervention dure 3 à 4 minutes.

L'agent intervient sur le Mac de démonstration de l'équipe : il doit être allumé, avec le bridge desktop actif. Sinon, le ticket passe en escalade vers un technicien, ce qui illustre le garde-fou.

## **2\. Côté support IT**

1. Connectez-vous à l'espace support avec le compte de démonstration :  
   * E-mail : sranganadane+support@eugeniaschool.com  
   * Mot de passe : eugenia2026  
2. Ouvrez le tableau de bord : vous y voyez les tickets, leur statut et le taux de résolution.  
3. Ouvrez un ticket pour voir sa fiche d'audit : accord du collaborateur, ce que l'agent a fait, preuve de vérification, durée et frise du journal.

## **3\. Ce qui est vérifié à chaque essai**

* L'agent n'agit qu'après l'accord du collaborateur.  
* Le ticket n'est marqué « résolu » que si une session séparée, en lecture seule, confirme l'état réel du poste.  
* En cas d'échec ou de doute, le ticket passe en escalade et le support reçoit un mail.

## **4\. Faire intervenir l'agent sur un autre Mac**

Par défaut, l'agent intervient sur le Mac de démonstration. Pour qu'il agisse sur un autre Mac, le dépôt fournit un script d'installation, setup\_mac.sh, à lancer une seule fois sur ce Mac.

1. Récupérez le dépôt sur le Mac, puis lancez ./setup\_mac.sh dans un terminal.  
2. Le script installe l'outil holo de H Company, connecte le Mac au compte H, puis installe un service de démarrage : le bridge se lance à l'ouverture de session, redémarre seul s'il s'arrête et empêche le Mac de se mettre en veille.  
3. Accordez une fois les deux autorisations demandées dans Réglages Système \> Confidentialité et sécurité : **Accessibilité** et **Enregistrement de l'écran**. Redémarrez ensuite le bridge (ou le Mac) pour que l'enregistrement de l'écran soit pris en compte.  
4. L'identifiant de session du bridge doit être le même que celui configuré sur le service agent (HAI\_DESKTOP\_SESSION\_ID).

## **5\. Pour les développeurs**

Le code et les instructions d'installation sont sur GitHub : [https\://github.com/glatescu-afk/tickai](https://github.com/glatescu-afk/tickai) (README : installation, service agent, tests hors ligne avec python \-m unittest discover \-s tests).
---
name: deploy
description: Commiter, pousser, déployer et vérifier en ligne (Vercel/Render), avec les liens. À proposer quand l'utilisateur demande de commiter, pousser et mettre en ligne.
argument-hint: [message ou périmètre du déploiement]
---
1. Lance les tests/le build ; arrête-toi en cas d'échec.
2. Exécute `gh auth status` ; si un push renvoie une 403, indique la permission de token manquante et donne le lien vers les paramètres.
3. Commite avec un message clair, pousse, et ouvre ou fusionne la PR si demandé.
4. Attends la fin du déploiement Vercel/Render (interroge le statut ; si l'API Render est en veille, réveille-la).
5. Ouvre l'URL de production avec l'outil navigateur et fais-en une capture sur mobile (390px) et sur ordinateur.
6. Réponds avec les liens : PR, déploiement, URL en ligne, et tout ce qui reste non vérifié.

Ne termine jamais sur « déploiement en cours » : continue jusqu'à confirmation ou échec.

Périmètre : $ARGUMENTS

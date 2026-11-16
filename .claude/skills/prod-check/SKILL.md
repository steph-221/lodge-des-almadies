---
name: prod-check
description: Vérifie les accès réels aux environnements (local, SSH, Neon, Vercel, Render, GitHub) avant de travailler en PRODUCTION. À proposer dès qu'une demande concerne un site en ligne, une base de production ou un déploiement.
argument-hint: [tâche à faire en production]
---
Avant de faire quoi que ce soit : liste les environnements que tu peux réellement atteindre (local, serveur SSH, base Neon de prod, CLI Vercel, Render, push GitHub), en le vérifiant par des commandes en lecture seule et non de mémoire.

Ensuite, fais la tâche en PRODUCTION, et dis-moi dès le départ quelles étapes je devrai faire moi-même (avec la commande ou le SQL exact).

Tâche : $ARGUMENTS

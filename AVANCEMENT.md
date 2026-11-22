---
statut: actif
maj: 2026-11-22
---
# Avancement — lodge-des-almadies

## Où on en est
Le site a été refondu le 05/11 (carrousel, galerie, images WebP). Depuis le 17/11, le module « services hôtel » est construit par lots : socle avec comptes par rôle (lot 0), chambres, séjours et ménage (1a), linge, stocks, minibar (1b), visites de chambre et défauts (1c), page Aujourd'hui, cahier de liaison, e-mail du matin et sauvegarde Drive (2), demandes clients par QR code, guide de la chambre, pannes (3), alertes WhatsApp par service via l'API Cloud de Meta (3b). Tous les lots sont fusionnés dans `main` ; dernier commit le 22/11.

## Évolutions proposées
- Vérifier en production les alertes WhatsApp (lot 3b) et l'e-mail du matin.
- Basculer le domaine lodgedesalmadies.com sur Vercel.
- Créer la branche Neon par aperçu Vercel.
- Compléter les fiches de formation du personnel par rôle (à confirmer avec toi).
- Brancher ou documenter le lien avec Octorate.

## Journal
### 2026-11-22
- Création du suivi (inventaire automatique, fiches complétées à partir des docs et des derniers commits).
- Lots 1a à 3b du module services hôtel, fusionnés dans `main` (#4 à #9).
- CI : build à chaque pull request et push sur `main`.

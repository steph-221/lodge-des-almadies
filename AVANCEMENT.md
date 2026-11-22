---
statut: actif
maj: 2026-11-22
---
# Avancement — lodge-des-almadies

## Où on en est
Le site a été refondu le 05/11. Depuis le 17/11, le module « services hôtel » est construit par lots, tous fusionnés dans `main` jusqu'au lot 4 (groupes et séminaires, #10, en production le 22/11, migration 0007). Le lot 5 (fiches de ménage papier lues par IA, migration 0008) est en PR n°11, non fusionné : la lecture réelle d'écriture manuscrite n'est pas mesurée (pas de clé API ni de fiches réelles). Reste le lot 6 (cartes RFID, objets trouvés).

## Évolutions proposées
- Fusionner le lot 5, ajouter `ANTHROPIC_API_KEY` sur Vercel, puis mesurer la lecture sur 10 fiches réelles et fixer le modèle (`SHEETS_MODEL`).
- Vérifier en production les alertes WhatsApp (lot 3b) et l'e-mail du matin.
- Lot 6 : registre des cartes RFID et objets trouvés.
- Basculer le domaine lodgedesalmadies.com sur Vercel.
- Créer la branche Neon par aperçu Vercel.

## Journal
### 2026-11-22 (soir)
- Lot 4 en production : dossiers de groupes, calendrier des salles sans chevauchement, devis et feuille de fonction (#10).
- Lot 5 en PR n°11 : fiche de ménage A4, photo lue par l'API Claude, validation par la gouvernante (`src/lib/hotel/sheets*.ts`, `vision.ts`, migration 0008). Photos purgées après 30 jours.
- Nouvelles variables : `ANTHROPIC_API_KEY`, `SHEETS_MODEL` (facultative) ; fonctions Vercel limitées à 60 s.

### 2026-11-22
- Création du suivi (inventaire automatique, fiches complétées à partir des docs et des derniers commits).
- Lots 1a à 3b du module services hôtel, fusionnés dans `main` (#4 à #9).
- CI : build à chaque pull request et push sur `main`.

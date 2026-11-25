---
statut: actif
maj: 2026-11-25
---
# Avancement — lodge-des-almadies

## Où on en est
Le site a été refondu le 05/11. Depuis le 17/11, le module « services hôtel » est construit par lots, fusionnés dans `main` jusqu'au lot 5 (fiches de ménage papier lues par IA, #11, en production le 22/11, migration 0008). Le lot 6 (registre des cartes RFID, objets trouvés, #12, migration 0009) est en production depuis le 22/11, vérifié (pages 302, API 401, tables vides). La lecture réelle d'écriture manuscrite reste à mesurer (pas de clé API ni de fiches réelles). Le plan ne prévoit pas de lot après le 6.

## Évolutions proposées
- Ajouter `ANTHROPIC_API_KEY` sur Vercel, puis mesurer la lecture des fiches sur 10 fiches réelles et fixer le modèle (`SHEETS_MODEL`).
- Vérifier en production les alertes WhatsApp (lot 3b), l'e-mail du matin et les impressions A4 réelles.
- Faire une matinée d'essai complète avec une femme de chambre avant de généraliser.
- Basculer le domaine lodgedesalmadies.com sur Vercel.
- Créer la branche Neon par aperçu Vercel.

## Journal
### 2026-11-25
- Descriptif des chambres (tableau Excel de STEPH) en PR : migration 0010 avec 10 types de chambre (tarif 2027, lit sup., descriptions FR/EN), 32 équipements par type et les 36 chambres. Insertion seulement si absent : rien de saisi dans l'application n'est écrasé. C'est la seule migration qui contient des données de l'hôtel (base de production vide le 25/11).
- Back-office chambres : tarif, emplacement, descriptions et grille d'équipements modifiables par type.
- Site : tableau des tarifs en 10 catégories (36 chambres), pages Suites / Double / Twin et llms.txt alignés sur le descriptif.
- Réponses de STEPH (25/11) : pas de balcon dans les 15 standards B, la 201 est à 63 000 FCFA. Restent à confirmer : bâtiment des chambres balcon côté route (103 à 106), superficies, répartition twin / double.

### 2026-11-22 (nuit)
- Lot 6 fusionné et en production (#12) : registre des cartes RFID (client, passe, personnel) et objets trouvés (`src/lib/hotel/keys*.ts`, routes `cards` et `lost`, page `/admin/hotel/cartes/`, migration 0009).
- Une carte déclarée perdue ou retirée ne redevient jamais active ; une carte perdue sort du registre actif, écrit dans le cahier de liaison et le journal d'audit.
- Lot 5 fusionné et vérifié en production (#11).

### 2026-11-22 (soir)
- Lot 4 en production : dossiers de groupes, calendrier des salles sans chevauchement, devis et feuille de fonction (#10).
- Lot 5 en PR n°11 : fiche de ménage A4, photo lue par l'API Claude, validation par la gouvernante (`src/lib/hotel/sheets*.ts`, `vision.ts`, migration 0008). Photos purgées après 30 jours.
- Nouvelles variables : `ANTHROPIC_API_KEY`, `SHEETS_MODEL` (facultative) ; fonctions Vercel limitées à 60 s.

### 2026-11-22
- Création du suivi (inventaire automatique, fiches complétées à partir des docs et des derniers commits).
- Lots 1a à 3b du module services hôtel, fusionnés dans `main` (#4 à #9).
- CI : build à chaque pull request et push sur `main`.

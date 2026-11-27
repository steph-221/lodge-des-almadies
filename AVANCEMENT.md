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
### 2026-11-27 (suite)
- Prix sur une seule ligne sur /tarifs/ et les pages chambres (« 49 000 FCFA ≈ 75 € » ne se coupe plus, c'est le libellé qui passe à la ligne).
- Nombre de personnes par chambre : migration 0012 (`rooms.base_capacity` et `max_capacity`, vides = comme le type). Réglable dans la fiche chambre du back-office (2/2 sans lit supplémentaire, 2/3 avec, 3/3 chambre triple). Le contrôle de capacité des séjours et la page client du QR code utilisent la capacité effective.

### 2026-11-26
- Mise à jour du descriptif des chambres (nouveau tableau de STEPH) : migration 0011 (superficies, literie « triple », « frigo bar », nouveau type STD-B2 pour les 13 standards du bâtiment B sans lit supplémentaire).
- Équipements par chambre : une chambre hérite de la grille de son type, `room_amenities` ne garde que les écarts (203 communique avec la 201 ; les 205 et 207 forment le type STD-AR2, sans communication). Réglable dans le back-office Chambres, listing Excel (`/api/hotel/rooms/amenities`).
- Page client du QR code : bloc « Votre chambre en détail » (inclus / sur demande / en supplément). Pages chambres du site : équipements lus dans la base.
- Réponses de STEPH (27/11) : les chambres 103 à 106 restent à 49 000 FCFA ; « double ou twin » = lits collés ou séparés, « double » = pas de twin ; lit supplémentaire seulement dans les types indiqués ; « minibar » retiré de la description de la suite (on garde « frigo bar »). Le tableau compte maintenant 13 types : STD-B2, STD-AR2 (205, 207) et STD-AP2 (202, 204, 208) sont « sans lit supplémentaire ».

### 2026-11-25
- Descriptif des chambres (tableau Excel de STEPH) en PR : migration 0010 avec 10 types de chambre (tarif 2027, lit sup., descriptions FR/EN), 32 équipements par type et les 36 chambres. Insertion seulement si absent : rien de saisi dans l'application n'est écrasé. C'est la seule migration qui contient des données de l'hôtel (base de production vide le 25/11).
- Back-office chambres : tarif, emplacement, descriptions et grille d'équipements modifiables par type.
- Site : tableau des tarifs en 10 catégories (36 chambres), pages Suites / Double / Twin et llms.txt alignés sur le descriptif.
- Réponses de STEPH (25/11) : pas de balcon dans les 15 standards B, la 201 est à 63 000 FCFA. Les 103 à 106 (balcon côté route, 63 000 FCFA) sont bien au bâtiment A. Restent à confirmer : superficies, répartition twin / double.

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

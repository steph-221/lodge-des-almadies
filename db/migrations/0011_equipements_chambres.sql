-- Mise à jour du descriptif des chambres (tableau du 26/11/2026) et équipements par chambre.
-- 1) Types : superficies, literie « triple », mention « frigo bar », nouveau type STD-B2 (13 chambres du bâtiment B sans lit supplémentaire).
-- 2) Équipements par chambre : une chambre hérite de la grille de son type ; room_amenities ne garde que les écarts.
-- Les mises à jour de types ne s'appliquent que si la valeur est encore celle de la migration 0010 : ce qui a été modifié dans l'application n'est jamais écrasé.
-- Non repris du tableau : tarif des chambres 103 à 106 (49 000 dans le tableau, 63 000 jusqu'ici) et capacité des types du bâtiment A, en attente de confirmation.

create table room_amenities (
  room_id     bigint not null references rooms(id) on delete cascade,
  amenity_key text not null references amenities(key) on delete cascade,
  value       text not null check (value in ('oui','non','sur_demande','supplement','a_verifier')),
  primary key (room_id, amenity_key)
);

update room_types set area_m2 = 20 where lower(code) = 'std-b' and area_m2 is null;
update room_types set area_m2 = 24 where lower(code) = 'sup-b' and area_m2 is null;
update room_types set area_m2 = 24 where lower(code) = 'sup-b-pmr' and area_m2 is null;
update room_types set area_m2 = 44 where lower(code) = 'ste-b' and area_m2 is null;
update room_types set area_m2 = 18 where lower(code) = 'std-ar' and area_m2 is null;
update room_types set area_m2 = 18 where lower(code) = 'bal-ar' and area_m2 is null;
update room_types set area_m2 = 22 where lower(code) = 'sup-ar' and area_m2 is null;
update room_types set area_m2 = 18 where lower(code) = 'std-ap' and area_m2 is null;
update room_types set area_m2 = 18 where lower(code) = 'bal-ap' and area_m2 is null;
update room_types set area_m2 = 30 where lower(code) = 'sjr-ap' and area_m2 is null;

update room_types set beds = 'Double ou twin ou triple' where lower(code) in ('std-b','sup-b') and beds in ('Double ou twin','Double');

update room_types set description_fr = 'Chambre supérieure climatisée du Bâtiment B, avec lit double, TV écran plat, coffre-fort, plateau d''accueil avec bouilloire, café, thé et infusions, Wi-Fi gratuit, frigo bar et salle de bain privative.', description_en = 'Air-conditioned superior room in Building B with a double bed, flat-screen TV, safe, welcome tray with kettle, coffee, tea and herbal teas, free Wi-Fi, mini-fridge and private bathroom.'
  where lower(code) = 'sup-b' and description_fr = 'Chambre supérieure climatisée du Bâtiment B, avec lit double, TV écran plat, coffre-fort, plateau d''accueil avec bouilloire, café, thé et infusions, Wi-Fi gratuit et salle de bain privative.' and description_en = 'Air-conditioned superior room in Building B with a double bed, flat-screen TV, safe, welcome tray with kettle, coffee, tea and herbal teas, free Wi-Fi and private bathroom.';
update room_types set description_fr = 'Chambre supérieure du Bâtiment B adaptée aux personnes à mobilité réduite, climatisée, avec TV écran plat, coffre-fort, plateau d''accueil avec bouilloire, café, thé et infusions, Wi-Fi gratuit, frigo bar et salle de bain accessible.', description_en = 'Accessible superior room in Building B for guests with reduced mobility, air-conditioned, with flat-screen TV, safe, welcome tray with kettle, coffee, tea and herbal teas, free Wi-Fi, mini-fridge and accessible bathroom.'
  where lower(code) = 'sup-b-pmr' and description_fr = 'Chambre supérieure du Bâtiment B adaptée aux personnes à mobilité réduite, climatisée, avec TV écran plat, coffre-fort, plateau d''accueil avec bouilloire, café, thé et infusions, Wi-Fi gratuit et salle de bain accessible.' and description_en = 'Accessible superior room in Building B for guests with reduced mobility, air-conditioned, with flat-screen TV, safe, welcome tray with kettle, coffee, tea and herbal teas, free Wi-Fi and accessible bathroom.';
update room_types set description_fr = 'Notre plus grand hébergement : suite du Bâtiment B avec coin salon, minibar, TV écran plat, coffre-fort, plateau d''accueil avec bouilloire, café, thé et infusions, machine à café Nespresso, Wi-Fi gratuit, frigo bar et salle de bain privative.', description_en = 'Our largest accommodation: suite in Building B with sitting area, minibar, flat-screen TV, safe, welcome tray with kettle, coffee, tea and herbal teas, Nespresso coffee machine, free Wi-Fi, mini-fridge and private bathroom.'
  where lower(code) = 'ste-b' and description_fr = 'Notre plus grand hébergement : suite du Bâtiment B avec coin salon, minibar, TV écran plat, coffre-fort, plateau d''accueil avec bouilloire, café, thé et infusions, machine à café Nespresso, Wi-Fi gratuit et salle de bain privative.' and description_en = 'Our largest accommodation: suite in Building B with sitting area, minibar, flat-screen TV, safe, welcome tray with kettle, coffee, tea and herbal teas, Nespresso coffee machine, free Wi-Fi and private bathroom.';
update room_types set description_fr = 'Chambre supérieure climatisée du Bâtiment A, côté route, avec lit double, TV écran plat, coffre-fort, plateau d''accueil avec bouilloire, café, thé et infusions, Wi-Fi gratuit, frigo bar et salle de bain privative.', description_en = 'Air-conditioned superior room in Building A, street side, with a double bed, flat-screen TV, safe, welcome tray with kettle, coffee, tea and herbal teas, free Wi-Fi, mini-fridge and private bathroom.'
  where lower(code) = 'sup-ar' and description_fr = 'Chambre supérieure climatisée du Bâtiment A, côté route, avec lit double, TV écran plat, coffre-fort, plateau d''accueil avec bouilloire, café, thé et infusions, Wi-Fi gratuit et salle de bain privative.' and description_en = 'Air-conditioned superior room in Building A, street side, with a double bed, flat-screen TV, safe, welcome tray with kettle, coffee, tea and herbal teas, free Wi-Fi and private bathroom.';
update room_types set description_fr = 'Suite junior du Bâtiment A, côté piscine, avec terrasse privative, lit double, TV écran plat, coffre-fort, plateau d''accueil avec bouilloire, café, thé et infusions, machine à café Nespresso, Wi-Fi gratuit, frigo bar et salle de bain privative.', description_en = 'Junior suite in Building A, pool side, with private terrace, double bed, flat-screen TV, safe, welcome tray with kettle, coffee, tea and herbal teas, Nespresso coffee machine, free Wi-Fi, mini-fridge and private bathroom.'
  where lower(code) = 'sjr-ap' and description_fr = 'Suite junior du Bâtiment A, côté piscine, avec terrasse privative, lit double, TV écran plat, coffre-fort, plateau d''accueil avec bouilloire, café, thé et infusions, machine à café Nespresso, Wi-Fi gratuit et salle de bain privative.' and description_en = 'Junior suite in Building A, pool side, with private terrace, double bed, flat-screen TV, safe, welcome tray with kettle, coffee, tea and herbal teas, Nespresso coffee machine, free Wi-Fi and private bathroom.';

update room_type_amenities set value = 'oui' where value = 'non' and amenity_key = 'lits_twin' and room_type_id = (select id from room_types where lower(code) = 'sup-b');

update room_types set position = position + 1 where position >= 2 and not exists (select 1 from room_types where lower(code) = 'std-b2');
insert into room_types (code, label, label_en, building, location, base_capacity, max_capacity, beds, area_m2, price_fcfa, extra_bed_fcfa, description_fr, description_en, position)
values ('std-b2', 'Chambre Standard sans lit supplémentaire (bâtiment B)', 'Standard Room – No extra bed (Building B)', 'B', 'Bâtiment B', 2, 2, 'Double ou twin', 20, 57000, null,
  'Chambre climatisée du Bâtiment B, avec lit double ou deux lits séparés, TV écran plat, coffre-fort, plateau d''accueil avec bouilloire, café, thé et infusions, Wi-Fi gratuit et salle de bain privative.', 'Air-conditioned room in Building B with a double bed or twin beds, flat-screen TV, safe, welcome tray with kettle, coffee, tea and herbal teas, free Wi-Fi and private bathroom.', 2)
on conflict (lower(code)) do nothing;

insert into room_type_amenities (room_type_id, amenity_key, value)
select n.id, a.amenity_key, case when a.amenity_key = 'lit_sup' then 'non' else a.value end
from room_type_amenities a
join room_types o on o.id = a.room_type_id and lower(o.code) = 'std-b'
cross join (select id from room_types where lower(code) = 'std-b2') n
on conflict do nothing;

update rooms set room_type_id = (select id from room_types where lower(code) = 'std-b2')
  where number in ('004', '006', '110', '112', '114', '115', '116', '210', '211', '212', '214', '215', '216')
  and room_type_id = (select id from room_types where lower(code) = 'std-b');

-- Écarts par chambre : la communication ne concerne que les chambres 201 et 203.
insert into room_amenities (room_id, amenity_key, value)
select r.id, 'chambres_communicantes', 'non' from rooms r where r.number in ('205', '207')
on conflict do nothing;

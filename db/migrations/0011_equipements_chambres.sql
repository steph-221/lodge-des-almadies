-- Mise à jour du descriptif des chambres (tableau du 26/11/2026, confirmé par STEPH le 27/11) et équipements par chambre.
-- 1) Types : superficies, literie « triple », « frigo bar » (sans « minibar »), tarif des chambres 103 à 106 à 49 000 FCFA.
-- 2) Trois nouveaux types « sans lit supplémentaire » : STD-B2 (13 chambres du bâtiment B), STD-AR2 (205, 207), STD-AP2 (202, 204, 208).
-- 3) Équipements par chambre : une chambre hérite de la grille de son type ; room_amenities ne garde que les écarts éventuels.
-- Les mises à jour de types ne s'appliquent que si la valeur est encore celle de la migration 0010 : ce qui a été modifié dans l'application n'est jamais écrasé.

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
update room_types set description_fr = 'Notre plus grand hébergement : suite du Bâtiment B avec coin salon, TV écran plat, coffre-fort, plateau d''accueil avec bouilloire, café, thé et infusions, machine à café Nespresso, Wi-Fi gratuit, frigo bar et salle de bain privative.', description_en = 'Our largest accommodation: suite in Building B with sitting area, flat-screen TV, safe, welcome tray with kettle, coffee, tea and herbal teas, Nespresso coffee machine, free Wi-Fi, mini-fridge and private bathroom.'
  where lower(code) = 'ste-b' and description_fr = 'Notre plus grand hébergement : suite du Bâtiment B avec coin salon, minibar, TV écran plat, coffre-fort, plateau d''accueil avec bouilloire, café, thé et infusions, machine à café Nespresso, Wi-Fi gratuit et salle de bain privative.' and description_en = 'Our largest accommodation: suite in Building B with sitting area, minibar, flat-screen TV, safe, welcome tray with kettle, coffee, tea and herbal teas, Nespresso coffee machine, free Wi-Fi and private bathroom.';
update room_types set description_fr = 'Chambre supérieure climatisée du Bâtiment A, côté route, avec lit double, TV écran plat, coffre-fort, plateau d''accueil avec bouilloire, café, thé et infusions, Wi-Fi gratuit, frigo bar et salle de bain privative.', description_en = 'Air-conditioned superior room in Building A, street side, with a double bed, flat-screen TV, safe, welcome tray with kettle, coffee, tea and herbal teas, free Wi-Fi, mini-fridge and private bathroom.'
  where lower(code) = 'sup-ar' and description_fr = 'Chambre supérieure climatisée du Bâtiment A, côté route, avec lit double, TV écran plat, coffre-fort, plateau d''accueil avec bouilloire, café, thé et infusions, Wi-Fi gratuit et salle de bain privative.' and description_en = 'Air-conditioned superior room in Building A, street side, with a double bed, flat-screen TV, safe, welcome tray with kettle, coffee, tea and herbal teas, free Wi-Fi and private bathroom.';
update room_types set description_fr = 'Suite junior du Bâtiment A, côté piscine, avec terrasse privative, lit double, TV écran plat, coffre-fort, plateau d''accueil avec bouilloire, café, thé et infusions, machine à café Nespresso, Wi-Fi gratuit, frigo bar et salle de bain privative.', description_en = 'Junior suite in Building A, pool side, with private terrace, double bed, flat-screen TV, safe, welcome tray with kettle, coffee, tea and herbal teas, Nespresso coffee machine, free Wi-Fi, mini-fridge and private bathroom.'
  where lower(code) = 'sjr-ap' and description_fr = 'Suite junior du Bâtiment A, côté piscine, avec terrasse privative, lit double, TV écran plat, coffre-fort, plateau d''accueil avec bouilloire, café, thé et infusions, machine à café Nespresso, Wi-Fi gratuit et salle de bain privative.' and description_en = 'Junior suite in Building A, pool side, with private terrace, double bed, flat-screen TV, safe, welcome tray with kettle, coffee, tea and herbal teas, Nespresso coffee machine, free Wi-Fi and private bathroom.';

update room_type_amenities set value = 'oui' where value = 'non' and amenity_key = 'lits_twin' and room_type_id = (select id from room_types where lower(code) = 'sup-b');

update room_types set price_fcfa = 49000 where lower(code) = 'bal-ar' and price_fcfa = 63000;

-- Types « sans lit supplémentaire » : mêmes caractéristiques et équipements que le type d'origine, sans lit supplémentaire.
insert into room_types (code, label, label_en, building, location, base_capacity, max_capacity, beds, area_m2, price_fcfa, extra_bed_fcfa, description_fr, description_en, position)
select 'std-b2', 'Chambre Standard sans lit supplémentaire (bâtiment B)', 'Standard Room – No extra bed (Building B)', building, location, base_capacity, 2, 'Double ou twin', 20, price_fcfa, null, description_fr, description_en, position + 1
from room_types where lower(code) = 'std-b' on conflict (lower(code)) do nothing;
insert into room_types (code, label, label_en, building, location, base_capacity, max_capacity, beds, area_m2, price_fcfa, extra_bed_fcfa, description_fr, description_en, position)
select 'std-ar2', 'Chambre Standard côté route sans lit supplémentaire (bâtiment A)', 'Standard Room – Street side, no extra bed (Building A)', building, location, base_capacity, 2, beds, 18, price_fcfa, null, description_fr, description_en, position + 1
from room_types where lower(code) = 'std-ar' on conflict (lower(code)) do nothing;
insert into room_types (code, label, label_en, building, location, base_capacity, max_capacity, beds, area_m2, price_fcfa, extra_bed_fcfa, description_fr, description_en, position)
select 'std-ap2', 'Chambre Standard côté piscine sans lit supplémentaire (bâtiment A)', 'Standard Room – Pool side, no extra bed (Building A)', building, location, base_capacity, 2, beds, 18, price_fcfa, null, description_fr, description_en, position + 1
from room_types where lower(code) = 'std-ap' on conflict (lower(code)) do nothing;

-- Équipements des nouveaux types : copie du type d'origine, lit supplémentaire « non » (et pas de communication pour 205 et 207).
insert into room_type_amenities (room_type_id, amenity_key, value)
select n.id, a.amenity_key,
  case when a.amenity_key = 'lit_sup' then 'non'
       when a.amenity_key = 'chambres_communicantes' and lower(n.code) = 'std-ar2' then 'non'
       else a.value end
from (values ('std-b', 'std-b2'), ('std-ar', 'std-ar2'), ('std-ap', 'std-ap2')) as m(src, dst)
join room_types o on lower(o.code) = m.src
join room_type_amenities a on a.room_type_id = o.id
join room_types n on lower(n.code) = m.dst
on conflict do nothing;

update rooms set room_type_id = (select id from room_types where lower(code) = 'std-b2')
  where number in ('004', '006', '110', '112', '114', '115', '116', '210', '211', '212', '214', '215', '216')
  and room_type_id = (select id from room_types where lower(code) = 'std-b');
update rooms set room_type_id = (select id from room_types where lower(code) = 'std-ar2')
  where number in ('205', '207') and room_type_id = (select id from room_types where lower(code) = 'std-ar');
update rooms set room_type_id = (select id from room_types where lower(code) = 'std-ap2')
  where number in ('202', '204', '208') and room_type_id = (select id from room_types where lower(code) = 'std-ap');

-- Ordre d'affichage du tableau.
update room_types t set position = o.p
from (values ('std-b', 1), ('std-b2', 2), ('sup-b', 3), ('sup-b-pmr', 4), ('ste-b', 5), ('std-ar', 6), ('std-ar2', 7), ('bal-ar', 8), ('sup-ar', 9), ('std-ap', 10), ('std-ap2', 11), ('bal-ap', 12), ('sjr-ap', 13)) as o(c, p)
where lower(t.code) = o.c;

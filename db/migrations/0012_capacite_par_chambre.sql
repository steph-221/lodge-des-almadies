-- Capacité par chambre : par défaut celle du type (room_types.base_capacity / max_capacity), modifiable chambre par chambre.
-- NULL = comme le type. La capacité maximale compte le lit supplémentaire.
alter table rooms
  add column base_capacity smallint check (base_capacity between 1 and 8),
  add column max_capacity  smallint check (max_capacity between 1 and 8),
  add constraint rooms_capacity_chk check (base_capacity is null or max_capacity is null or max_capacity >= base_capacity);

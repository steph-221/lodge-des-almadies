-- Lot 1c : fichiers (photos), visites de chambre par la direction, grille de contrôle réglable, défauts à corriger.
-- La grille de contrôle se règle dans l'application : aucune donnée de l'hôtel n'est écrite ici.
-- Migrations additives uniquement : ne jamais modifier un fichier déjà appliqué en production.

-- Un fichier est stocké hors de la base (Google Drive, ou dossier local en développement) ; la base garde la référence.
create table files (
  id         bigint generated always as identity primary key,
  storage    text not null check (storage in ('drive','local')),
  remote_id  text not null check (length(remote_id) between 1 and 200),
  kind       text not null check (kind in ('inspection')),
  entity_id  bigint not null,
  mime       text not null check (mime in ('image/jpeg','image/png','image/webp')),
  size       integer not null check (size > 0),
  staff_id   bigint references staff(id),
  created_at timestamptz not null default now()
);
create index files_entity_idx on files (kind, entity_id);

create table inspection_points (
  id         bigint generated always as identity primary key,
  label      text not null check (length(label) between 1 and 80),
  zone       text not null default '' check (length(zone) <= 40),
  service    text not null default 'housekeeping' check (service in ('housekeeping','maintenance')),
  sort_order integer not null default 0,
  active     boolean not null default true
);

create table room_inspections (
  id       bigint generated always as identity primary key,
  room_id  bigint not null references rooms(id),
  staff_id bigint references staff(id),
  at       timestamptz not null default now(),
  overall  smallint check (overall between 1 and 5),
  comment  text not null default '' check (length(comment) <= 1000)
);
create index room_inspections_room_idx on room_inspections (room_id, at desc);

-- Le libellé et la zone sont recopiés : modifier la grille plus tard ne change pas les visites passées.
create table room_inspection_items (
  id            bigint generated always as identity primary key,
  inspection_id bigint not null references room_inspections(id) on delete cascade,
  point_id      bigint references inspection_points(id),
  label         text not null,
  zone          text not null default '',
  result        text not null check (result in ('ok','fix','na')),
  comment       text not null default '' check (length(comment) <= 500),
  service       text check (service in ('housekeeping','maintenance')),
  fixed_at      timestamptz,
  fixed_by      bigint references staff(id)
);
create index room_inspection_items_open_idx on room_inspection_items (service) where result = 'fix' and fixed_at is null;

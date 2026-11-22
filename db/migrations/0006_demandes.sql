-- Lot 3 : demandes des clients (QR code par chambre), guide de la chambre, pannes (maintenance).
-- Tout est saisissable dans l'application : aucune donnée de l'hôtel n'est écrite ici.
-- Migrations additives uniquement : ne jamais modifier un fichier déjà appliqué en production.

-- Un jeton secret par chambre pour le QR code ; seule l'empreinte est conservée. Régénérer = révoquer l'ancien.
create table room_tokens (
  id         bigint generated always as identity primary key,
  room_id    bigint not null references rooms(id),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by bigint references staff(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index room_tokens_hash_uq on room_tokens (token_hash);
create unique index room_tokens_active_uq on room_tokens (room_id) where revoked_at is null;

-- Ce que le client peut demander. « service » : qui reçoit la demande. Prix : room service seulement (FCFA).
create table request_catalog (
  id         bigint generated always as identity primary key,
  label_fr   text not null check (length(label_fr) between 1 and 80),
  label_en   text not null default '' check (length(label_en) <= 80),
  kind       text not null default 'service' check (kind in ('service','room_service')),
  service    text not null check (service in ('reception','housekeeping','technique','restaurant')),
  price      integer check (price is null or price between 0 and 10000000),
  ask_note   boolean not null default false,   -- demande une précision (heure du réveil, destination du taxi…)
  active     boolean not null default true,
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);

-- Guide de la chambre (Wi-Fi, chaînes TV, horaires, numéros utiles). « occupied_only » : jamais montré à une chambre libre.
create table guide_sections (
  id            bigint generated always as identity primary key,
  title_fr      text not null check (length(title_fr) between 1 and 80),
  title_en      text not null default '' check (length(title_en) <= 80),
  body_fr       text not null default '' check (length(body_fr) <= 2000),
  body_en       text not null default '' check (length(body_en) <= 2000),
  occupied_only boolean not null default true,
  active        boolean not null default true,
  sort          integer not null default 0,
  created_at    timestamptz not null default now()
);

create table requests (
  id         bigint generated always as identity primary key,
  room_id    bigint not null references rooms(id),
  stay_id    bigint references stays(id),
  catalog_id bigint references request_catalog(id),
  label      text not null check (length(label) between 1 and 120),  -- libellé figé à la création
  qty        smallint not null default 1 check (qty between 1 and 20),
  note       text not null default '' check (length(note) <= 300),
  service    text not null check (service in ('reception','housekeeping','technique','restaurant')),
  status     text not null default 'new' check (status in ('new','doing','done','cancelled')),
  source     text not null default 'guest' check (source in ('guest','staff')),
  lang       text not null default 'fr' check (lang in ('fr','en')),
  created_by bigint references staff(id),
  created_at timestamptz not null default now(),
  doing_at   timestamptz,
  done_at    timestamptz,
  handled_by bigint references staff(id),
  charge_id  bigint references charges(id)   -- extra créé à la fin d'un room service chiffré
);
create index requests_open_idx on requests (service, created_at) where status in ('new','doing');
create index requests_room_idx on requests (room_id, created_at desc);

-- Pannes signalées par le personnel. Une chambre « bloquée » passe hors service jusqu'à la réparation.
create table issues (
  id          bigint generated always as identity primary key,
  room_id     bigint references rooms(id),
  place       text not null default '' check (length(place) <= 80),      -- hors chambre : piscine, restaurant…
  title       text not null check (length(title) between 1 and 120),
  detail      text not null default '' check (length(detail) <= 1000),
  priority    text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status      text not null default 'open' check (status in ('open','doing','done')),
  blocks_room boolean not null default false,
  reported_by bigint references staff(id),
  created_at  timestamptz not null default now(),
  doing_at    timestamptz,
  done_at     timestamptz,
  done_by     bigint references staff(id),
  check (room_id is not null or place <> '')
);
create index issues_open_idx on issues (created_at) where status <> 'done';

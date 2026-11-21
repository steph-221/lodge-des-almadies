-- Lot 1a : chambres, types de chambre, séjours, tâches de ménage.
-- Tout est saisissable dans l'application (ou importé depuis un tableau) : aucune donnée de l'hôtel n'est écrite ici.
-- Migrations additives uniquement : ne jamais modifier un fichier déjà appliqué en production.

create extension if not exists btree_gist;

create table room_types (
  id            bigint generated always as identity primary key,
  code          text not null check (code ~ '^[a-z0-9_-]{1,30}$'),
  label         text not null check (length(label) between 1 and 80),
  base_capacity smallint not null default 2 check (base_capacity between 1 and 8),
  max_capacity  smallint not null default 2 check (max_capacity between 1 and 8),
  beds          text not null default '' check (length(beds) <= 80),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  check (max_capacity >= base_capacity)
);
create unique index room_types_code_uq on room_types (lower(code));

create table rooms (
  id           bigint generated always as identity primary key,
  number       text not null check (length(number) between 1 and 20),
  building     text not null default '' check (length(building) <= 40),
  floor        text not null default '' check (length(floor) <= 40),
  room_type_id bigint references room_types(id),
  minibar      boolean not null default false,
  notes        text not null default '' check (length(notes) <= 500),
  active       boolean not null default true,
  status       text not null default 'ready' check (status in ('dirty','in_progress','to_check','ready','out_of_service')),
  status_at    timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create unique index rooms_number_uq on rooms (lower(number));

create table room_status_log (
  id       bigint generated always as identity primary key,
  room_id  bigint not null references rooms(id),
  status   text not null,
  staff_id bigint references staff(id),
  at       timestamptz not null default now()
);
create index room_status_log_room_idx on room_status_log (room_id, at desc);

create table stays (
  id          bigint generated always as identity primary key,
  room_id     bigint not null references rooms(id),
  guest_name  text not null check (length(guest_name) between 1 and 120),
  guests      smallint not null default 1 check (guests between 1 and 8),
  arrival     date not null,
  departure   date not null,
  arrival_time text check (arrival_time is null or arrival_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  extra_bed   boolean not null default false,
  baby_cot    boolean not null default false,
  notes       text not null default '' check (length(notes) <= 500),
  source      text not null default 'manual' check (source in ('manual','import','octorate')),
  external_id text check (external_id is null or length(external_id) <= 80),
  status      text not null default 'booked' check (status in ('booked','cancelled')),
  created_by  bigint references staff(id),
  created_at  timestamptz not null default now(),
  check (departure > arrival),
  -- Une chambre ne peut pas être attribuée deux fois la même nuit (le jour de départ est libre pour l'arrivée suivante).
  constraint stays_no_overlap exclude using gist (room_id with =, daterange(arrival, departure, '[)') with &&) where (status = 'booked')
);
create unique index stays_external_uq on stays (source, external_id) where external_id is not null;
create index stays_arrival_idx on stays (arrival);
create index stays_departure_idx on stays (departure);

create table hk_tasks (
  id            bigint generated always as identity primary key,
  task_date     date not null,
  room_id       bigint not null references rooms(id),
  kind          text not null check (kind in ('depart','recouche')),
  guests        smallint check (guests is null or guests between 1 and 8),
  arrival_today boolean not null default false,
  extra_bed     boolean not null default false,
  baby_cot      boolean not null default false,
  status        text not null default 'todo' check (status in ('todo','doing','done','checked')),
  assigned_to   bigint references staff(id),
  note          text not null default '' check (length(note) <= 500),
  done_at       timestamptz,
  checked_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (task_date, room_id)
);
create index hk_tasks_date_idx on hk_tasks (task_date);

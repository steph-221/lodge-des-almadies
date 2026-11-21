-- Lot 1b : catalogue d'articles, stocks par lieu, gabarits de préparation, blanchisserie, minibar, extras.
-- Tout est saisissable dans l'application (ou importé depuis un tableau) : aucune donnée de l'hôtel n'est écrite ici.
-- Migrations additives uniquement : ne jamais modifier un fichier déjà appliqué en production.

create table items (
  id         bigint generated always as identity primary key,
  name       text not null check (length(name) between 1 and 80),
  kind       text not null check (kind in ('linen','supply','minibar')),
  unit       text not null default 'pièce' check (length(unit) between 1 and 20),
  min_stock  integer not null default 0 check (min_stock >= 0),
  price      integer not null default 0 check (price >= 0),  -- FCFA, 0 = non facturé
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index items_name_uq on items (lower(name));

-- Journal des mouvements : le stock est toujours la somme des mouvements (jamais un compteur modifié à la main).
create table stock_movements (
  id        bigint generated always as identity primary key,
  item_id   bigint not null references items(id),
  location  text not null check (location in ('store','soiled','laundry','scrap')),
  qty       integer not null check (qty <> 0),
  reason    text not null check (reason in ('inventory','receipt','transfer','consumption','laundry','loss','minibar','task')),
  ref       text not null default '' check (length(ref) <= 60),
  note      text not null default '' check (length(note) <= 300),
  staff_id  bigint references staff(id),
  at        timestamptz not null default now()
);
create index stock_movements_item_idx on stock_movements (item_id, location);
create index stock_movements_ref_idx on stock_movements (ref) where ref <> '';

create view stock_levels as
  select item_id, location, sum(qty)::int as qty from stock_movements group by item_id, location;

-- Gabarits : pour un type de chambre (ou tous), une nature, une occupation (ou toutes) et une condition (lit d'appoint, lit bébé), tant d'exemplaires d'un article.
create table prep_lines (
  id           bigint generated always as identity primary key,
  room_type_id bigint references room_types(id),
  kind         text not null check (kind in ('depart','recouche')),
  occupancy    smallint check (occupancy between 1 and 8),
  cond         text check (cond in ('extra_bed','baby_cot')),
  item_id      bigint not null references items(id),
  qty          integer not null check (qty between 0 and 999)
);
create unique index prep_lines_uq on prep_lines (coalesce(room_type_id, 0), kind, coalesce(occupancy, 0), coalesce(cond, ''), item_id);

-- Le décompte du stock se fait une seule fois par tâche, à la première fois où elle est terminée.
alter table hk_tasks add column stock_posted_at timestamptz;

create table laundry_batches (
  id          bigint generated always as identity primary key,
  status      text not null default 'sent' check (status in ('sent','received')),
  sent_at     timestamptz not null default now(),
  received_at timestamptz,
  note        text not null default '' check (length(note) <= 300),
  staff_id    bigint references staff(id)
);

create table laundry_lines (
  id           bigint generated always as identity primary key,
  batch_id     bigint not null references laundry_batches(id) on delete cascade,
  item_id      bigint not null references items(id),
  qty_sent     integer not null check (qty_sent > 0),
  qty_received integer check (qty_received >= 0),
  qty_damaged  integer check (qty_damaged >= 0),
  unique (batch_id, item_id)
);

-- Dotation de minibar par type de chambre.
create table minibar_dotation (
  room_type_id bigint not null references room_types(id),
  item_id      bigint not null references items(id),
  qty          integer not null check (qty between 1 and 99),
  primary key (room_type_id, item_id)
);

create table minibar_readings (
  id       bigint generated always as identity primary key,
  room_id  bigint not null references rooms(id),
  staff_id bigint references staff(id),
  at       timestamptz not null default now()
);
create index minibar_readings_room_idx on minibar_readings (room_id, at desc);

create table minibar_reading_lines (
  id          bigint generated always as identity primary key,
  reading_id  bigint not null references minibar_readings(id) on delete cascade,
  item_id     bigint not null references items(id),
  dotation    integer not null check (dotation >= 0),
  counted     integer not null check (counted >= 0),
  consumed    integer not null check (consumed >= 0),
  unit_price  integer not null check (unit_price >= 0)
);

-- Extras par chambre, à reporter sur la facture du PMS. Aucun encaissement ici.
create table charges (
  id         bigint generated always as identity primary key,
  room_id    bigint not null references rooms(id),
  stay_id    bigint references stays(id),
  source     text not null check (source in ('minibar','room_service','laundry','other')),
  label      text not null check (length(label) between 1 and 120),
  qty        integer not null default 1 check (qty > 0),
  unit_price integer not null check (unit_price >= 0),
  amount     bigint generated always as (qty::bigint * unit_price) stored,
  carried    boolean not null default false,
  carried_at timestamptz,
  voided     boolean not null default false,
  ref        text not null default '' check (length(ref) <= 60),
  staff_id   bigint references staff(id),
  created_at timestamptz not null default now()
);
create index charges_open_idx on charges (room_id) where not carried and not voided;

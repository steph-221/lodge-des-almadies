-- Lot 6 : registre des cartes RFID (sans encodage automatique) et objets trouvés.
-- Aucune donnée de l'hôtel n'est écrite ici. Migrations additives uniquement.

-- Une carte perdue ou retirée ne redevient jamais active : la serrure doit être reprogrammée, pas la fiche.
create table key_cards (
  id         bigint generated always as identity primary key,
  code       text not null check (length(code) between 1 and 40),
  kind       text not null default 'client' check (kind in ('client','passe','personnel')),
  room_id    bigint references rooms(id),
  holder     text not null default '' check (length(holder) <= 80),
  notes      text not null default '' check (length(notes) <= 300),
  status     text not null default 'active' check (status in ('active','lost','retired')),
  status_note text not null default '' check (length(status_note) <= 300),
  status_at  timestamptz,
  status_by  bigint references staff(id),
  created_by bigint references staff(id),
  created_at timestamptz not null default now()
);
create unique index key_cards_code_uq on key_cards (lower(code));
create index key_cards_status_idx on key_cards (status);

create table lost_items (
  id          bigint generated always as identity primary key,
  found_on    date not null,
  room_id     bigint references rooms(id),
  place       text not null default '' check (length(place) <= 120),
  description text not null check (length(description) between 1 and 200),
  storage     text not null default '' check (length(storage) <= 80),
  status      text not null default 'stored' check (status in ('stored','returned','discarded')),
  returned_to text not null default '' check (length(returned_to) <= 120),
  closed_at   timestamptz,
  closed_by   bigint references staff(id),
  found_by    bigint references staff(id),
  created_at  timestamptz not null default now()
);
create index lost_items_status_idx on lost_items (status, found_on desc);

-- Lot 4 : groupes et séminaires (dossiers, calendrier des salles, devis, feuille de fonction, bloc de chambres, participants).
-- Tout est saisissable dans l'application : aucune donnée de l'hôtel (salles, tarifs, clients) n'est écrite ici.
-- Migrations additives uniquement : ne jamais modifier un fichier déjà appliqué en production.

-- Salles réservables (la salle de séminaire, une terrasse privatisée…).
create table spaces (
  id         bigint generated always as identity primary key,
  name       text not null check (length(name) between 1 and 80),
  capacity   integer check (capacity is null or capacity between 1 and 1000),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index spaces_name_uq on spaces (lower(name));

-- Numérotation des dossiers : un compteur par clé (ex. « GRP-2026 »).
create table doc_counters (
  key   text primary key,
  value integer not null default 0
);

-- Un dossier : de la demande à la fin de l'événement. Pas de suppression physique (statut « cancelled »).
create table events (
  id            bigint generated always as identity primary key,
  reference     text not null unique,
  title         text not null check (length(title) between 1 and 120),
  client_name   text not null check (length(client_name) between 1 and 120),
  contact_name  text not null default '' check (length(contact_name) <= 120),
  contact_phone text not null default '' check (length(contact_phone) <= 40),
  contact_email text not null default '' check (length(contact_email) <= 120),
  attendees     integer not null default 1 check (attendees between 1 and 1000),
  status        text not null default 'request' check (status in ('request','option','quoted','confirmed','done','cancelled')),
  option_until  date,                                                      -- fin de l'option posée sur la salle
  notes         text not null default '' check (length(notes) <= 1000),
  -- Feuille de fonction
  layout        text not null default '' check (length(layout) <= 500),    -- disposition de la salle
  equipment     text not null default '' check (length(equipment) <= 500), -- matériel
  breaks_note   text not null default '' check (length(breaks_note) <= 500),
  meals_note    text not null default '' check (length(meals_note) <= 500),
  quote_note    text not null default '' check (length(quote_note) <= 500), -- conditions affichées sur le devis
  version       integer not null default 1,
  created_by    bigint references staff(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index events_status_idx on events (status);

-- Créneaux d'occupation d'une salle. « blocking » : le créneau retient la salle (option, devis envoyé, confirmé, terminé) ;
-- une demande simple ou un dossier annulé ne bloque rien. Deux créneaux qui retiennent la même salle ne peuvent pas se chevaucher
-- (la fin d'un créneau peut coïncider avec le début du suivant).
create table event_slots (
  id         bigint generated always as identity primary key,
  event_id   bigint not null references events(id),
  space_id   bigint not null references spaces(id),
  slot_date  date not null,
  start_time time not null,
  end_time   time not null,
  label      text not null default '' check (length(label) <= 120),        -- accueil, atelier, déjeuner…
  blocking   boolean not null default false,
  check (end_time > start_time),
  constraint event_slots_no_overlap exclude using gist (
    space_id with =,
    tsrange(slot_date + start_time, slot_date + end_time, '[)') with &&
  ) where (blocking)
);
create index event_slots_event_idx on event_slots (event_id);
create index event_slots_date_idx on event_slots (slot_date);

-- Lignes du devis (prix unitaire × quantité, en FCFA entiers).
create table event_lines (
  id        bigint generated always as identity primary key,
  event_id  bigint not null references events(id),
  position  integer not null default 0,
  label     text not null check (length(label) between 1 and 120),
  detail    text not null default '' check (length(detail) <= 200),
  unit_fcfa integer not null check (unit_fcfa between 0 and 1000000000),
  qty       integer not null default 1 check (qty between 0 and 100000)
);
create index event_lines_event_idx on event_lines (event_id, position);

-- Bloc de chambres réservé pour le groupe (nombre de chambres par type et par période).
create table event_room_blocks (
  id           bigint generated always as identity primary key,
  event_id     bigint not null references events(id),
  room_type_id bigint references room_types(id),
  rooms        integer not null check (rooms between 1 and 100),
  arrival      date not null,
  departure    date not null,
  note         text not null default '' check (length(note) <= 200),
  check (departure > arrival)
);
create index event_room_blocks_event_idx on event_room_blocks (event_id);

-- Participants. « stay_id » : séjour créé à partir du participant (voir Réservations).
create table event_attendees (
  id       bigint generated always as identity primary key,
  event_id bigint not null references events(id),
  name     text not null check (length(name) between 1 and 120),
  company  text not null default '' check (length(company) <= 120),
  diet     text not null default '' check (length(diet) <= 120),           -- régime alimentaire, allergies
  stay_id  bigint references stays(id)
);
create index event_attendees_event_idx on event_attendees (event_id);

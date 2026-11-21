-- Lot 2 : cahier de liaison entre les équipes, avec accusé de lecture.
-- Migrations additives uniquement : ne jamais modifier un fichier déjà appliqué en production.

create table logbook_entries (
  id         bigint generated always as identity primary key,
  author_id  bigint references staff(id),   -- null : accès de secours
  body       text not null check (length(body) between 1 and 1000),
  pinned     boolean not null default false,
  removed    boolean not null default false, -- pas de suppression physique
  created_at timestamptz not null default now()
);
create index logbook_entries_idx on logbook_entries (created_at desc) where not removed;

create table logbook_reads (
  entry_id bigint not null references logbook_entries(id),
  staff_id bigint not null references staff(id),
  at       timestamptz not null default now(),
  primary key (entry_id, staff_id)
);

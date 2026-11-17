-- Lot 0 : socle (personnel, limitation des tentatives, journal, réglages, tâches planifiées).
-- Migrations additives uniquement : ne jamais modifier un fichier déjà appliqué en production.

create table staff (
  id              bigint generated always as identity primary key,
  login           text not null check (login ~ '^[a-z0-9._-]{3,40}$'),
  display_name    text not null check (length(display_name) between 1 and 80),
  role            text not null check (role in ('direction','reception','gouvernante','femme_chambre','technique','restaurant')),
  secret_hash     text not null,
  secret_kind     text not null check (secret_kind in ('pin','password')),
  active          boolean not null default true,
  session_version integer not null default 1,
  lang            text not null default 'fr' check (lang in ('fr','en')),
  last_login_at   timestamptz,
  created_at      timestamptz not null default now()
);
create unique index staff_login_uq on staff (lower(login));
create index staff_role_active_idx on staff (role) where active;

create table auth_throttle (
  key          text primary key,
  fails        integer not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz
);

create table audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  staff_id    bigint references staff(id),
  actor       text not null check (actor in ('staff','secours','client','cron')),
  action      text not null,
  entity_type text,
  entity_id   text,
  diff        jsonb,
  ip_hash     text
);
create index audit_entity_idx on audit_log (entity_type, entity_id, at desc);
create index audit_at_idx on audit_log (at desc);
create index audit_staff_idx on audit_log (staff_id, at desc);

create function audit_log_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log est en ajout seul';
end $$;
create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function audit_log_immutable();
create trigger audit_log_no_truncate before truncate on audit_log
  for each statement execute function audit_log_immutable();

create table settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by bigint references staff(id)
);

create table job_runs (
  job         text not null,
  run_date    date not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  result      jsonb,
  primary key (job, run_date)
);

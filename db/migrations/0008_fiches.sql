-- Lot 5 : fiches de ménage papier (imprimées par l'app, photographiées, lues par IA, validées par la gouvernante).
-- Aucune donnée de l'hôtel n'est écrite ici.
-- Migrations additives uniquement : ne jamais modifier un fichier déjà appliqué en production.

-- Les photos de fiche sont rangées comme les photos de visite (Drive ou dossier local), avec une nature de plus.
alter table files drop constraint files_kind_check;
alter table files add constraint files_kind_check check (kind in ('inspection','sheet'));

-- Une fiche = les chambres d'une personne pour un jour. « rows » garde ce qui a été imprimé (chambres, articles du minibar),
-- pour que la lecture et la validation se fassent toujours contre la fiche telle qu'elle a été remise.
create table hk_sheets (
  id         bigint generated always as identity primary key,
  sheet_date date not null,
  staff_id   bigint references staff(id),
  rows       jsonb not null,
  status     text not null default 'printed' check (status in ('printed','read','validated','cancelled')),
  applied    jsonb not null default '{}'::jsonb,
  created_by bigint references staff(id),
  created_at timestamptz not null default now(),
  validated_by bigint references staff(id),
  validated_at timestamptz
);
create index hk_sheets_date_idx on hk_sheets (sheet_date desc);

-- Une lecture = une photo envoyée pour une fiche. Le résultat brut est conservé tel que rendu par le modèle.
create table sheet_reads (
  id         bigint generated always as identity primary key,
  sheet_id   bigint not null references hk_sheets(id),
  file_id    bigint references files(id),
  model      text not null default '' check (length(model) <= 80),
  status     text not null check (status in ('read','failed')),
  result     jsonb,
  error      text not null default '' check (length(error) <= 300),
  input_tokens  integer,
  output_tokens integer,
  created_by bigint references staff(id),
  created_at timestamptz not null default now()
);
create index sheet_reads_sheet_idx on sheet_reads (sheet_id, id desc);

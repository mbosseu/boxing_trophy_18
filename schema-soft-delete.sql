-- Soft delete Trophy / TrophyRec : archive + deleted_at.

create table if not exists public.deleted_records (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id text not null,
  payload jsonb not null,
  deleted_at timestamptz not null default now(),
  deleted_by text
);

create index if not exists deleted_records_source_idx
  on public.deleted_records (source_table, source_id, deleted_at desc);

alter table public.deleted_records enable row level security;

alter table public.registrations add column if not exists deleted_at timestamptz;
alter table public.matches add column if not exists deleted_at timestamptz;

create index if not exists registrations_alive_idx
  on public.registrations (deleted_at) where deleted_at is null;
create index if not exists matches_alive_idx
  on public.matches (deleted_at) where deleted_at is null;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'trophyrec_fighters') then
    alter table public.trophyrec_fighters add column if not exists deleted_at timestamptz;
    create index if not exists trophyrec_fighters_alive_idx
      on public.trophyrec_fighters (deleted_at) where deleted_at is null;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'trophyrec_bouts') then
    alter table public.trophyrec_bouts add column if not exists deleted_at timestamptz;
    create index if not exists trophyrec_bouts_alive_idx
      on public.trophyrec_bouts (deleted_at) where deleted_at is null;
  end if;
end $$;

-- trophyrec_fighters est lu colonne par colonne par le public (e-mail et licence proteges) :
-- sans ce droit, le filtre deleted_at casse le classement public.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'trophyrec_fighters') then
    grant select (deleted_at) on public.trophyrec_fighters to anon, authenticated;
  end if;
end $$;

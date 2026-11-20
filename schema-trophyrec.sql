-- TrophyRec — a executer dans le SQL Editor Supabase (apres schema.sql).
-- Lecture publique des fiches / combats. Ecriture palmares : service role (API admin).
-- Ecriture profil : combattant authentifie, colonnes autorisees seulement.

create table if not exists trophyrec_editions (
  id text primary key,
  label text not null,
  event_date text,
  venue text
);

insert into trophyrec_editions (id, label, event_date, venue)
values ('t20', 'Boxing Trophy 20', '2026-12-12', 'Garage Moteka, Fenouillet')
on conflict (id) do nothing;

create table if not exists trophyrec_coaches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gym_id text not null default 'autre',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into trophyrec_coaches (name, gym_id)
select v.name, v.gym_id from (values
  ('Mehdi', 'minimes'),
  ('Pascal', 'ramonville'),
  ('Dadi', 'st-cyprien'),
  ('Valentin', 'portet'),
  ('Sebastien', 'etats-unis')
) as v(name, gym_id)
where not exists (
  select 1 from trophyrec_coaches c where c.name = v.name and c.gym_id = v.gym_id
);

create table if not exists trophyrec_fighters (
  id text primary key,
  slug text not null unique,
  prenom text,
  nom text,
  alias text,
  email text unique,
  user_id uuid unique,
  photo_url text,
  height_cm integer,
  stance text,
  gym_id text,
  gym_other text,
  coach_id uuid references trophyrec_coaches(id),
  sexe text,
  registration_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trophyrec_bouts (
  id uuid primary key default gen_random_uuid(),
  edition_id text not null references trophyrec_editions(id),
  source_match_id text,
  fighter_a text not null references trophyrec_fighters(id),
  fighter_b text not null references trophyrec_fighters(id),
  discipline text,
  sexe text,
  categorie_poids text,
  result text not null,
  method text,
  round integer,
  bout_date text,
  created_at timestamptz not null default now(),
  unique (edition_id, source_match_id)
);

create index if not exists trophyrec_fighters_slug_idx on trophyrec_fighters (slug);
create index if not exists trophyrec_bouts_fighters_idx on trophyrec_bouts (fighter_a, fighter_b);

alter table trophyrec_editions enable row level security;
alter table trophyrec_coaches enable row level security;
alter table trophyrec_fighters enable row level security;
alter table trophyrec_bouts enable row level security;

drop policy if exists "trophyrec editions read" on trophyrec_editions;
create policy "trophyrec editions read" on trophyrec_editions for select using (true);

drop policy if exists "trophyrec coaches read" on trophyrec_coaches;
create policy "trophyrec coaches read" on trophyrec_coaches for select using (true);

drop policy if exists "trophyrec fighters read" on trophyrec_fighters;
create policy "trophyrec fighters read" on trophyrec_fighters for select using (true);

drop policy if exists "trophyrec fighters update own" on trophyrec_fighters;
create policy "trophyrec fighters update own" on trophyrec_fighters
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "trophyrec bouts read" on trophyrec_bouts;
create policy "trophyrec bouts read" on trophyrec_bouts for select using (true);

-- Inserts / updates bouts et coaches : cle service_role (API admin), pas d'anon write.

alter table registrations add column if not exists "licenceGate" text;

-- ─── Comptes TrophyRec : statut, licence verifiee par l'organisation ───
alter table trophyrec_fighters add column if not exists account_status text not null default 'actif'; -- actif | ferme
alter table trophyrec_fighters add column if not exists licence_status text not null default 'a_verifier'; -- a_verifier | verifiee | refusee
alter table trophyrec_fighters add column if not exists licence_gate text; -- existing (licence) | paid_50 (cotisation)
alter table trophyrec_fighters add column if not exists numero_licence text;
alter table trophyrec_fighters add column if not exists closed_reason text;

-- Lecture publique sans les donnees perso (e-mail, numero de licence) : le back office passe par l'API (service role).
revoke select on trophyrec_fighters from anon, authenticated;
grant select (id, slug, prenom, nom, alias, photo_url, height_cm, stance, gym_id, gym_other, coach_id, sexe,
  user_id, registration_id, account_status, licence_status, licence_gate, created_at, updated_at)
  on trophyrec_fighters to anon, authenticated;

-- Le combattant ne modifie que son profil (jamais statut, licence, e-mail ou palmares).
revoke update on trophyrec_fighters from anon, authenticated;
grant update (prenom, nom, alias, height_cm, stance, gym_id, gym_other, coach_id, photo_url, updated_at)
  on trophyrec_fighters to authenticated;

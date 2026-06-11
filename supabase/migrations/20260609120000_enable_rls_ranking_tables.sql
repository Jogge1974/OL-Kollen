-- Security advisor fix: enable Row-Level Security on the public ranking tables.
--
-- Both tables hold only public orienteering ranking data (no secrets), but with
-- RLS disabled anyone holding the project URL + anon key could also INSERT,
-- UPDATE or DELETE rows. Enable RLS and grant a read-only (SELECT) policy so the
-- app can keep reading them, while writes are limited to the service role
-- (edge functions) and the direct-Postgres scraper — both of which bypass RLS.

-- Sverigelistan -------------------------------------------------------------
alter table public."Sverigelistan" enable row level security;

drop policy if exists "anon_select_sverigelistan" on public."Sverigelistan";
create policy "anon_select_sverigelistan"
  on public."Sverigelistan"
  for select
  using (true);

-- club_ranking --------------------------------------------------------------
alter table public.club_ranking enable row level security;

drop policy if exists "anon_select_club_ranking" on public.club_ranking;
create policy "anon_select_club_ranking"
  on public.club_ranking
  for select
  using (true);

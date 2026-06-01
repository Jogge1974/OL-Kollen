-- Club ranking: aggregated from Sverigelistan
-- Men: average of top 10 runners per club
-- Women: average of top 7 runners per club
-- Stored monthly for trend tracking

create table if not exists public.club_ranking (
  id bigint generated always as identity primary key,
  gender varchar(1) not null,        -- 'H' or 'D'
  club varchar(100) not null,
  club_id integer null,
  avg_points numeric(7,2) not null,
  runner_count integer not null,     -- how many runners contributed (max 10 H / 7 D)
  rank integer not null,
  month date not null,               -- first day of the month (e.g. 2026-05-01)
  calculated_at timestamptz not null default now(),
  constraint club_ranking_unique unique (gender, club, month)
);

create index if not exists club_ranking_month_gender_idx
  on public.club_ranking (month, gender, rank);

create index if not exists club_ranking_club_idx
  on public.club_ranking (club, gender);

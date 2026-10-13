-- Eventor API call log used to map how many Eventor requests the app, the edge
-- functions and the cron pollers actually generate. While the Eventor API key is
-- revoked we comment out the real network calls and instead append one row per
-- call site invocation here, so the request volume can be aggregated per minute /
-- per source without hitting Eventor.
--
-- This is a plain append-only log (one row per attempted call). Aggregate it in
-- SQL afterwards, e.g.
--   select date_trunc('minute', called_at) as minute, origin, source, count(*)
--   from public.eventor_api_call_log
--   group by 1, 2, 3
--   order by 1;

create table if not exists public.eventor_api_call_log (
  id           bigint generated always as identity primary key,
  called_at    timestamptz not null default now(),
  origin       text        not null,          -- 'app' | 'edge' (edge covers cron-triggered pollers)
  source       text        not null,          -- API function name / poller name
  endpoint     text        null,              -- Eventor path/url when known
  detail       jsonb       null               -- optional extra context
);

create index if not exists eventor_api_call_log_called_at_idx
  on public.eventor_api_call_log (called_at);

create index if not exists eventor_api_call_log_source_idx
  on public.eventor_api_call_log (source);

create index if not exists eventor_api_call_log_origin_idx
  on public.eventor_api_call_log (origin);

alter table public.eventor_api_call_log enable row level security;

-- The app talks to Supabase with the publishable (anon) key and is not signed in
-- via Supabase auth, so allow anon + authenticated to INSERT their call records.
-- Edge functions / cron use the service role, which bypasses RLS.
drop policy if exists "anon_insert_eventor_call_log" on public.eventor_api_call_log;
create policy "anon_insert_eventor_call_log"
  on public.eventor_api_call_log
  for insert
  to anon, authenticated
  with check (true);

grant insert on public.eventor_api_call_log to anon, authenticated;

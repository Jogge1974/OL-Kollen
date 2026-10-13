-- Server-side response cache for the eventor-proxy edge function (Phase 1 of the
-- proxy that keeps the Eventor API key off client devices).
--
-- The proxy fetches a whitelisted Eventor endpoint once, stores the XML here with
-- a per-endpoint TTL, and serves every subsequent request for the same
-- endpoint+params from the cache until it expires. Shared, high-volume endpoints
-- (events calendar, competitorcount, organisations) are requested by many users
-- for the same data, so this collapses hundreds of identical calls into one.
--
-- Only the edge function (service role) touches this table; RLS is enabled with
-- no anon policies so clients can never read/write it directly.

create table if not exists public.eventor_proxy_cache (
  cache_key   text        primary key,   -- endpoint path incl. sorted params
  endpoint    text        not null,      -- whitelist key (events|competitorcount|organisations)
  payload     text        not null,      -- cached Eventor XML
  fetched_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists eventor_proxy_cache_expires_idx
  on public.eventor_proxy_cache (expires_at);

alter table public.eventor_proxy_cache enable row level security;

-- Housekeeping: drop expired rows hourly (reads already ignore expired rows).
do $$ begin perform cron.unschedule('cleanup-eventor-proxy-cache'); exception when others then null; end $$;
select cron.schedule(
  'cleanup-eventor-proxy-cache',
  '17 * * * *',
  $$ delete from public.eventor_proxy_cache where expires_at < now(); $$
);

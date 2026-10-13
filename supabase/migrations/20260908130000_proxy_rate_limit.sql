-- Per-identity rate limiting for the eventor-proxy (Phase-2 auth).
--
-- Each authenticated caller (anonymous Supabase user id) gets a fixed-window
-- request budget. proxy_rate_limit_hit() atomically bumps the counter and
-- returns whether the request is within budget, so the proxy can 429 abusers
-- without becoming an open Eventor gateway.
--
-- Only the edge function (service role) touches these; RLS on, no anon policies.

create table if not exists public.proxy_rate_limit (
  identity     text        primary key,
  window_start timestamptz not null default now(),
  count        integer     not null default 0
);

alter table public.proxy_rate_limit enable row level security;

-- Atomic fixed-window counter: resets the window when it has elapsed, otherwise
-- increments. Returns true when the (post-increment) count is within p_limit.
create or replace function public.proxy_rate_limit_hit(p_identity text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
as $$
declare
  v_now   timestamptz := now();
  v_count integer;
begin
  insert into public.proxy_rate_limit (identity, window_start, count)
    values (p_identity, v_now, 1)
  on conflict (identity) do update
    set
      count = case
        when public.proxy_rate_limit.window_start < v_now - make_interval(secs => p_window_seconds) then 1
        else public.proxy_rate_limit.count + 1
      end,
      window_start = case
        when public.proxy_rate_limit.window_start < v_now - make_interval(secs => p_window_seconds) then v_now
        else public.proxy_rate_limit.window_start
      end
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

grant execute on function public.proxy_rate_limit_hit(text, integer, integer) to service_role;

-- Drop stale counters daily.
do $$ begin perform cron.unschedule('cleanup-proxy-rate-limit'); exception when others then null; end $$;
select cron.schedule(
  'cleanup-proxy-rate-limit',
  '23 3 * * *',
  $$ delete from public.proxy_rate_limit where window_start < now() - interval '1 day'; $$
);

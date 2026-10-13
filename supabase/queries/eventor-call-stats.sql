-- Eventor call volume stats, queried against public.eventor_api_call_log.
-- Columns: id, called_at, origin ('app'|'edge'|'proxy'), source, endpoint, detail jsonb.
-- Run via the Supabase SQL editor, or psql against the pooler connection.

-- 1) Calls per hour, last 24 hours (total across all sources).
select
  date_trunc('hour', called_at) as hour,
  count(*) as calls
from public.eventor_api_call_log
where called_at > now() - interval '24 hours'
group by 1
order by 1;

-- 2) Calls per function/source, last 24 hours (which poller/edge fn is calling the most).
select
  source,
  count(*) as calls
from public.eventor_api_call_log
where called_at > now() - interval '24 hours'
group by source
order by calls desc;

-- 3) Combined: calls per hour, broken down per source, last 24 hours.
select
  date_trunc('hour', called_at) as hour,
  source,
  count(*) as calls
from public.eventor_api_call_log
where called_at > now() - interval '24 hours'
group by 1, 2
order by 1, 2;

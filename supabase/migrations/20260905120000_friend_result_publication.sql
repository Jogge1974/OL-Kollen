-- "Result list published" push for friends' events.
--
-- A single /events?fromDate=today&toDate=today call returns the publication
-- HashTableEntry flags (officialResult_<raceId> etc.) for ALL of today's events
-- at once. That lets poll-friend-result-publication check every event a watched
-- friend is entered in today with ONE Eventor request, instead of polling
-- /results/person per friend every few minutes.
--
-- This column dedupes the "results are published, go look" push separately from
-- result_notified_at (which the per-result poller sets when a completed result
-- is actually found). Both live on friend_activity_state, which the daily
-- cleanup already trims to today's rows.

alter table public.friend_activity_state
  add column if not exists result_list_notified_at timestamptz;

comment on column public.friend_activity_state.result_list_notified_at
  is 'When the "result list published" push was sent for this friend+event+race (poll-friend-result-publication).';

-- Poll publication for friends' events every 10 minutes, 07-22 UTC. One Eventor
-- call per run regardless of how many friends/events are tracked.
do $$ begin perform cron.unschedule('poll-friend-result-publication'); exception when others then null; end $$;
select cron.schedule(
  'poll-friend-result-publication',
  '*/10 7-22 * * *',
  $$
  select net.http_post(
    url := 'https://hvscmyudneihjbtitffy.supabase.co/functions/v1/poll-friend-result-publication',
    headers := '{"Content-Type":"application/json","x-cron-secret":"azsxdcfvgbhnjmk,l.","apikey":"sb_publishable_rpCcNEKGIGt2RVDxwe1z0Q_gujFKho7","Authorization":"Bearer sb_publishable_rpCcNEKGIGt2RVDxwe1z0Q_gujFKho7"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

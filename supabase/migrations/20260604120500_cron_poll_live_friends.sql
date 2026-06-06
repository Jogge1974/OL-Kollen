-- Live friends poller: every minute during competition hours (UTC 06-21 =
-- Swedish summer time 08-23). Reads matched live competitions from
-- friend_activity_state and pushes start/split/result notifications.
-- Uses the literal cron secret (current_setting('app.cron_secret') is not
-- supported on Supabase).

do $$ begin perform cron.unschedule('poll-live-friends'); exception when others then null; end $$;
select cron.schedule(
  'poll-live-friends',
  '* 6-21 * * *',
  $$
  select net.http_post(
    url := 'https://hvscmyudneihjbtitffy.supabase.co/functions/v1/poll-live-friends',
    headers := '{"Content-Type":"application/json","x-cron-secret":"azsxdcfvgbhnjmk,l."}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

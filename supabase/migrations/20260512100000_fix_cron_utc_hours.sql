-- Fix cron schedules: use UTC 06-21 = Swedish summer time 08-23.
-- (Winter time will be 07-22, which is acceptable.)

-- Safely unschedule and re-create with correct hours.
-- Use DO blocks to ignore errors if a job doesn't exist yet.

do $$ begin perform cron.unschedule('poll-friend-activity'); exception when others then null; end $$;
select cron.schedule(
  'poll-friend-activity',
  '*/3 6-21 * * *',
  $$
  select net.http_post(
    url := 'https://hvscmyudneihjbtitffy.supabase.co/functions/v1/poll-friend-activity',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

do $$ begin perform cron.unschedule('poll-eventor-publication'); exception when others then null; end $$;
select cron.schedule(
  'poll-eventor-publication',
  '*/15 6-21 * * *',
  $$
  select net.http_post(
    url := 'https://hvscmyudneihjbtitffy.supabase.co/functions/v1/poll-eventor-publication',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

do $$ begin perform cron.unschedule('poll-friend-entries'); exception when others then null; end $$;
select cron.schedule(
  'poll-friend-entries',
  '7,27,47 6-21 * * *',
  $$
  select net.http_post(
    url := 'https://hvscmyudneihjbtitffy.supabase.co/functions/v1/poll-friend-entries',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Re-create all cron jobs with the literal cron secret instead of
-- current_setting('app.cron_secret') which is not supported on Supabase.

do $$ begin perform cron.unschedule('poll-friend-activity'); exception when others then null; end $$;
select cron.schedule(
  'poll-friend-activity',
  '*/3 6-21 * * *',
  $$
  select net.http_post(
    url := 'https://hvscmyudneihjbtitffy.supabase.co/functions/v1/poll-friend-activity',
    headers := '{"Content-Type":"application/json","x-cron-secret":"azsxdcfvgbhnjmk,l."}'::jsonb,
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
    headers := '{"Content-Type":"application/json","x-cron-secret":"azsxdcfvgbhnjmk,l."}'::jsonb,
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
    headers := '{"Content-Type":"application/json","x-cron-secret":"azsxdcfvgbhnjmk,l."}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

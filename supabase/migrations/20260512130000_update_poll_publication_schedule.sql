-- Update poll-eventor-publication to every 10 minutes, 07-23 Swedish summer time (UTC 5-21).
do $$ begin perform cron.unschedule('poll-eventor-publication'); exception when others then null; end $$;
select cron.schedule(
  'poll-eventor-publication',
  '*/10 5-21 * * *',
  $$
  select net.http_post(
    url := 'https://hvscmyudneihjbtitffy.supabase.co/functions/v1/poll-eventor-publication',
    headers := '{"Content-Type":"application/json","x-cron-secret":"azsxdcfvgbhnjmk,l."}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

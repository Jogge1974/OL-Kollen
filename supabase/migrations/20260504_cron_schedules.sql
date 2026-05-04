-- Enable pg_cron and pg_net for scheduled HTTP calls from within Postgres.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Poll friend activity (starts + results) every 3 minutes, 06–20 Swedish time.
select cron.schedule(
  'poll-friend-activity',
  '*/3 6-20 * * *',
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

-- Poll favorite event watches (start/result list publications) every 15 minutes.
select cron.schedule(
  'poll-eventor-publication',
  '*/15 6-20 * * *',
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

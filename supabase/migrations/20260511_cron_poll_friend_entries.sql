-- Poll friend entries 3 times per hour (minute 7, 27, 47), 08–23 Swedish time.
select cron.schedule(
  'poll-friend-entries',
  '7,27,47 8-23 * * *',
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

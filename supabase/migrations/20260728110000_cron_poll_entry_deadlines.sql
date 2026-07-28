-- Schedule entry-deadline reminders. The function computes the exact trigger
-- moments (20:00 the evening before, and deadline minus 3 hours) internally in
-- Swedish local time, so we just need to run it often enough across the day.
-- Every 30 minutes, 05–22 UTC (covers Swedish daytime + evening).
select cron.schedule(
  'poll-entry-deadlines',
  '*/30 5-22 * * *',
  $$
  select net.http_post(
    url := 'https://hvscmyudneihjbtitffy.supabase.co/functions/v1/poll-entry-deadlines',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

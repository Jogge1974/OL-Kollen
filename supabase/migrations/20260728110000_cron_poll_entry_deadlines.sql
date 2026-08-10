-- Schedule entry-deadline reminders. The function computes the exact trigger
-- moments (20:00 the evening before, and deadline minus 3 hours) internally in
-- Swedish local time, so we just need to run it often enough across the day.
-- Every 30 minutes, 05–22 UTC (covers Swedish daytime + evening).
-- Uses the literal cron secret (current_setting('app.cron_secret') is not
-- supported on Supabase and makes the whole job fail). The publishable anon key
-- is sent as apikey/Authorization so the request passes the Functions gateway
-- even if the function is deployed with JWT verification enabled.
select cron.schedule(
  'poll-entry-deadlines',
  '*/30 5-22 * * *',
  $$
  select net.http_post(
    url := 'https://hvscmyudneihjbtitffy.supabase.co/functions/v1/poll-entry-deadlines',
    headers := '{"Content-Type":"application/json","x-cron-secret":"azsxdcfvgbhnjmk,l.","apikey":"sb_publishable_rpCcNEKGIGt2RVDxwe1z0Q_gujFKho7","Authorization":"Bearer sb_publishable_rpCcNEKGIGt2RVDxwe1z0Q_gujFKho7"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

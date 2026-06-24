-- Auto-update club ranking every 10 minutes.
-- Checks if Sverigelistan has a newer Updated date than club_ranking,
-- and if so triggers calculation. The edge function skips if already up to date.

do $$ begin perform cron.unschedule('auto-update-club-ranking'); exception when others then null; end $$;
select cron.schedule(
  'auto-update-club-ranking',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://hvscmyudneihjbtitffy.supabase.co/functions/v1/calculate-club-ranking',
    headers := '{"Content-Type":"application/json","x-cron-secret":"azsxdcfvgbhnjmk,l."}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

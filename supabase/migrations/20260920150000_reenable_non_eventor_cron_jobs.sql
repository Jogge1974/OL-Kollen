-- Re-enable three cron jobs that were disabled (likely during the period the
-- Eventor API key risked revocation) but don't call Eventor at all:
--  * auto-update-club-ranking: calls calculate-club-ranking, which only reads
--    already-stored Sverigelistan data from Supabase — no Eventor request.
--  * cleanup-cron-history / cleanup-notification-state: pure SQL housekeeping
--    (delete stale rows), no network calls whatsoever.
do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'auto-update-club-ranking';
  if jid is not null then perform cron.alter_job(jid, active := true); end if;

  select jobid into jid from cron.job where jobname = 'cleanup-cron-history';
  if jid is not null then perform cron.alter_job(jid, active := true); end if;

  select jobid into jid from cron.job where jobname = 'cleanup-notification-state';
  if jid is not null then perform cron.alter_job(jid, active := true); end if;
end $$;

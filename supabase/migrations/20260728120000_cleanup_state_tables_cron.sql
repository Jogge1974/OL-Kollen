-- Daily cleanup of push-notification dedupe/state tables so they don't grow
-- unbounded. Runs at 03:00. Each delete is chosen to be safe (never causes a
-- notification to be re-sent):
--
--  * friend_activity_state: the poll only ever reads TODAY's rows for dedupe
--    (where event_date = today), so anything before today is dead weight.
--
--  * friend_entry_state: has no event_date. Friend entries are polled in a
--    window of today .. +9 months, so a row notified more than 10 months ago
--    belongs to an event that is already in the past and can't be re-notified.
--
--  * entry_deadline_state: the entry-deadline reminders only fire while
--    now < deadline. Once the deadline has passed nothing can re-fire, and a
--    row notified more than 7 days ago is well past its deadline.
--
--  * cron.job_run_details: pg_cron writes one row per job execution here and it
--    grows unbounded; keep only the last 7 days of run history.
select cron.schedule(
  'cleanup-notification-state',
  '0 3 * * *',
  $$
  delete from public.friend_activity_state where event_date < current_date;
  delete from public.friend_entry_state where notified_at < now() - interval '10 months';
  delete from public.entry_deadline_state where notified_at < now() - interval '7 days';
  delete from cron.job_run_details where end_time < now() - interval '7 days';
  $$
);

-- Remove legacy cron job that has been replaced by poll-friend-activity.
do $$ begin perform cron.unschedule('KontrolleraStartResultatEventor'); exception when others then null; end $$;

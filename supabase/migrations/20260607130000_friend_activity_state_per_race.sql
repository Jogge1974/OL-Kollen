-- Per-stage notification state for multi-stage (multi-day) events, keyed by
-- Eventor's EventRaceId.
--
-- Background: a multi-day event has ONE EventId but one EventRaceId per stage
-- (etapp). EventRaceId is globally unique. Previously friend_activity_state was
-- unique on (friend_person_id, event_id), so all stages reused stage 1's row.
-- The start poller rolled that row forward to the new day, but the upsert
-- preserved the old result_notified_at, so later stages were treated as
-- "already notified" and their result push was skipped. Keying by EventRaceId
-- gives each stage its own row — and unlike event_date it stays unique even when
-- two stages run on the same day.
--
-- Single-day events keep event_race_id = event_id (see backfill + the poller),
-- which is exactly equivalent to the old (friend_person_id, event_id) behaviour,
-- so single-day notifications are unaffected.

-- 1. Add the column (nullable first so we can backfill existing rows).
alter table public.friend_activity_state
  add column if not exists event_race_id text;

comment on column public.friend_activity_state.event_race_id
  is 'Eventor EventRaceId for the stage. Single-day events use event_id (stable).';

-- 2. Backfill existing rows to event_id so they stay unique under the new key
--    and never collide with future single-day rows (which also use event_id).
update public.friend_activity_state
set event_race_id = event_id
where event_race_id is null;

-- 3. Require it so the new unique key and ON CONFLICT always match.
alter table public.friend_activity_state
  alter column event_race_id set not null;

-- 4. Drop the old 2-column unique constraint (whatever it is named).
do $$
declare
  conname_to_drop text;
begin
  select conname into conname_to_drop
  from pg_constraint
  where conrelid = 'public.friend_activity_state'::regclass
    and contype = 'u'
    and array_length(conkey, 1) = 2;
  if conname_to_drop is not null then
    execute format('alter table public.friend_activity_state drop constraint %I', conname_to_drop);
  end if;
end $$;

-- 5. New per-stage uniqueness keyed by EventRaceId.
alter table public.friend_activity_state
  add constraint friend_activity_state_friend_event_race_key
  unique (friend_person_id, event_id, event_race_id);

comment on constraint friend_activity_state_friend_event_race_key on public.friend_activity_state
  is 'Per-stage state: multi-day events share event_id, so uniqueness includes EventRaceId.';

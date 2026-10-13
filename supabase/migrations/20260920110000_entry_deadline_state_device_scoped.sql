-- entry_deadline_state records "have we already sent this reminder" for a
-- favorited event. Now that favorites are device-scoped (device_favorite_watches),
-- the recipient of a reminder is a device, not a person, so re-key this dedupe
-- table the same way.
alter table public.entry_deadline_state drop constraint if exists entry_deadline_state_person_id_fkey;
alter table public.entry_deadline_state rename column person_id to device_id;

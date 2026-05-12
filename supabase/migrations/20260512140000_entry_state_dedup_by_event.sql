-- Change friend_entry_state dedup from entry_id to event_id.
-- Multi-stage events can produce multiple entries per person, but we only
-- need one notification per person+event.

-- 1. Remove old unique constraint (name from Supabase auto-generated)
ALTER TABLE friend_entry_state
  DROP CONSTRAINT IF EXISTS friend_entry_state_friend_person_id_entry_id_key;

-- 2. Delete duplicate rows that would violate the new constraint,
--    keeping only the row with the latest notified_at per person+event.
DELETE FROM friend_entry_state a
USING friend_entry_state b
WHERE a.friend_person_id = b.friend_person_id
  AND a.event_id = b.event_id
  AND a.id < b.id;

-- 3. Make entry_id nullable (no longer required for dedup)
ALTER TABLE friend_entry_state
  ALTER COLUMN entry_id DROP NOT NULL;

-- 4. Add new unique constraint on (friend_person_id, event_id)
ALTER TABLE friend_entry_state
  ADD CONSTRAINT friend_entry_state_friend_person_id_event_id_key
  UNIQUE (friend_person_id, event_id);

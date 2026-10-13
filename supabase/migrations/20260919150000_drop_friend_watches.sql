-- Friends became device-scoped (device_friend_watches, migration
-- 20260919140000). The old person-scoped friend_watches table is fully
-- unused now — the product decision is that it's fine for a device to just
-- rebuild its friend list rather than carry forward old per-person data, so
-- there's no need to keep it around "just in case".
drop table if exists public.friend_watches;
drop function if exists public.friend_watches_set_updated_at();

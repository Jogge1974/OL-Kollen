-- Calendar filters and favorite classes no longer sync to/from the server:
-- there's no password login any more, so restoring them by person_id let the
-- setting "travel" with whichever person you pick, rather than staying with
-- the phone. They're stored locally on the device only now (already were, via
-- AsyncStorage) — nothing needs to know them centrally.
alter table public.app_users drop column if exists preferences_json;

-- device_identities rows are now created at app launch (see touch-device-identity),
-- before a person has necessarily ever been selected on that device, so
-- person_id/username can no longer be guaranteed NOT NULL at insert time.
-- select-identity still fills them in once a person is actually picked.
alter table public.device_identities alter column person_id drop not null;
alter table public.device_identities alter column username drop not null;

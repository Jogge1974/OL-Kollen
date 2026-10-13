-- Push tokens become purely device-scoped: with no password login, "person_id"
-- on this table only ever reflected whichever person happened to be selected
-- at registration time, and every consumer (all poll-* functions, push-sync
-- itself) already reads/writes device_push_tokens by device_id alone. Drop the
-- app_users/person_id dependency entirely so a device has exactly one token
-- row, independent of which person is currently selected on it.

-- Keep one row per device_id: the active one if there is one, else the most
-- recently updated row (identity switches on a device used to create a new
-- row per person rather than update in place).
delete from public.device_push_tokens
where id not in (
  select distinct on (device_id) id
  from public.device_push_tokens
  order by device_id, is_active desc, updated_at desc, id desc
);

alter table public.device_push_tokens drop constraint if exists device_push_tokens_person_id_fkey;
alter table public.device_push_tokens drop constraint if exists device_push_tokens_person_id_device_id_key;
alter table public.device_push_tokens drop constraint if exists device_push_tokens_pkey;
alter table public.device_push_tokens drop column if exists person_id;
alter table public.device_push_tokens drop column if exists id;
alter table public.device_push_tokens add primary key (device_id);

comment on table public.device_push_tokens is 'Expo push-token per enhet (device_id) — inte per person.';

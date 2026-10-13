-- Records which Eventor person each device has selected as "who am I", now that
-- password login against Eventor is gone. One row per device (device_id is the
-- same stable identifier used for push tokens), overwritten whenever the
-- selection changes.
--
-- Secrets/PII-light but still only service-role writable (via the
-- select-identity edge function) — RLS on, no anon policies.

create table if not exists public.device_identities (
  device_id text primary key,
  person_id text not null,
  username text not null,
  organisation_id text,
  club_name text,
  updated_at timestamptz not null default now()
);

create index if not exists device_identities_person_id_idx on public.device_identities (person_id);

alter table public.device_identities enable row level security;

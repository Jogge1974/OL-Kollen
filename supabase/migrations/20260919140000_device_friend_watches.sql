-- Friends become device-scoped instead of person-scoped: with no password login
-- any device can select ANY personId as "who am I", so syncing friend_watches by
-- person_id let a new device silently inherit another device's friend list (and
-- implicitly, control over it) just by picking the same person. Friends must
-- instead be private to the physical device that added them.
--
-- device_id is the same stable identifier already used for device_push_tokens.
create table if not exists public.device_friend_watches (
  id bigint generated always as identity primary key,
  device_id text not null,
  friend_person_id text not null,
  friend_name text not null,
  friend_club text,
  friend_gender text,
  friend_birth_year integer,
  push_on_start boolean not null default true,
  push_on_result boolean not null default true,
  push_on_entry boolean not null default false,
  push_on_live boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (device_id, friend_person_id)
);

create index if not exists device_friend_watches_device_id_idx on public.device_friend_watches (device_id);
create index if not exists device_friend_watches_friend_person_id_idx on public.device_friend_watches (friend_person_id);

alter table public.device_friend_watches enable row level security;

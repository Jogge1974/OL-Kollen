-- Favorites become device-scoped instead of person-scoped, for the same reason
-- friends did (see 20260919140000_device_friend_watches.sql): with no password
-- login, any device can select ANY personId as "who am I", so syncing
-- favorite_event_watches by person_id let a new device silently inherit (and
-- implicitly control) another device's favorited events just by picking the
-- same person. Favorites must instead be private to the physical device that
-- added them.
--
-- device_id is the same stable identifier already used for device_push_tokens
-- and device_friend_watches.
create table if not exists public.device_favorite_watches (
  id bigint generated always as identity primary key,
  device_id text not null,
  event_id text not null,
  event_name text not null,
  event_date date,
  classification_id integer not null default 0,
  classification_label text not null default '',
  has_published_starts boolean not null default false,
  has_published_results boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (device_id, event_id)
);

create index if not exists device_favorite_watches_device_id_idx on public.device_favorite_watches (device_id);
create index if not exists device_favorite_watches_event_id_idx on public.device_favorite_watches (event_id);

alter table public.device_favorite_watches enable row level security;

comment on table public.device_favorite_watches is 'Favoritmarkerade tävlingar per enhet (device_id) som backend bevakar mot Eventor.';

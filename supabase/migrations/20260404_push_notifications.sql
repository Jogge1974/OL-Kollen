create table if not exists public.app_users (
  person_id text primary key,
  username text not null,
  full_name text,
  email text,
  club_id text,
  club_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notification_preferences (
  person_id text primary key references public.app_users(person_id) on delete cascade,
  push_on_start_list boolean not null default false,
  push_on_result_list boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.favorite_event_watches (
  id bigint generated always as identity primary key,
  person_id text not null references public.app_users(person_id) on delete cascade,
  event_id text not null,
  event_name text not null,
  event_date date,
  classification_id integer not null default 0,
  classification_label text not null,
  has_published_starts boolean not null default false,
  has_published_results boolean not null default false,
  last_checked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (person_id, event_id)
);

create table if not exists public.device_push_tokens (
  id bigint generated always as identity primary key,
  person_id text not null references public.app_users(person_id) on delete cascade,
  device_id text not null,
  platform text not null,
  push_token text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (person_id, device_id)
);

create index if not exists favorite_event_watches_person_id_idx on public.favorite_event_watches(person_id);
create index if not exists favorite_event_watches_event_id_idx on public.favorite_event_watches(event_id);
create index if not exists device_push_tokens_person_id_idx on public.device_push_tokens(person_id);

alter table public.app_users enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.favorite_event_watches enable row level security;
alter table public.device_push_tokens enable row level security;

comment on table public.app_users is 'Appspecifik användarprofil kopplad till Eventor person_id.';
comment on table public.notification_preferences is 'Val för push på favoritmarkerade tävlingar.';
comment on table public.favorite_event_watches is 'Favoritmarkerade tävlingar som backend bevakar mot Eventor.';
comment on table public.device_push_tokens is 'Expo push-token per användare och enhet.';

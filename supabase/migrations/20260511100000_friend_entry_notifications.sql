-- Add push_on_entry column to friend_watches and create entry notification state table.

alter table public.friend_watches
  add column if not exists push_on_entry boolean not null default true;

-- Track which entry notifications have already been sent (one row per friend × entry).
create table if not exists public.friend_entry_state (
  id bigint generated always as identity primary key,
  friend_person_id text not null,
  entry_id text not null,
  event_id text not null,
  event_name text,
  notified_at timestamptz not null default timezone('utc', now()),
  unique (friend_person_id, entry_id)
);

create index if not exists friend_entry_state_friend_idx
  on public.friend_entry_state(friend_person_id);

alter table public.friend_entry_state enable row level security;

-- Update the trigger to also track push_on_entry changes.
create or replace function public.friend_watches_set_updated_at()
returns trigger as $$
begin
  if
    OLD.push_on_start IS DISTINCT FROM NEW.push_on_start OR
    OLD.push_on_result IS DISTINCT FROM NEW.push_on_result OR
    OLD.push_on_entry IS DISTINCT FROM NEW.push_on_entry
  then
    NEW.updated_at = timezone('utc', now());
  end if;
  return NEW;
end;
$$ language plpgsql;

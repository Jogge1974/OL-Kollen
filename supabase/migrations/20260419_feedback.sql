create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null,
  message text not null,
  person_id text,
  person_name text,
  organisation text
);

comment on table public.feedback is 'User feedback submitted from the app.';

-- Allow anonymous inserts (the app uses the publishable/anon key)
alter table public.feedback enable row level security;

create policy "Anyone can insert feedback"
  on public.feedback
  for insert
  with check (true);

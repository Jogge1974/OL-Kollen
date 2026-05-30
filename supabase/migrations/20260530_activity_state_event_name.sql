-- Add event_name column to friend_activity_state for liveresultat matching on the client.
alter table public.friend_activity_state add column if not exists event_name text;

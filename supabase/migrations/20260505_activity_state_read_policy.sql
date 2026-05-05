-- Allow the app (anon) to read friend_activity_state rows.
-- The table only contains personId + eventId + timestamps, no secrets.
create policy "anon_select_friend_activity_state"
  on public.friend_activity_state
  for select
  using (true);

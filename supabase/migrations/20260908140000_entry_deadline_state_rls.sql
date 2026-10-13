-- Security review after enabling anonymous sign-ins (anon users now use the
-- `authenticated` role, so any unprotected public table is reachable by them).
--
-- entry_deadline_state was created without RLS, leaving it readable/writable by
-- anon + authenticated via Supabase's default grants. It only holds server-side
-- reminder dedupe state and is only touched by the poll-entry-deadlines edge
-- function + cleanup cron (both service role / direct Postgres, which bypass
-- RLS), so we enable RLS with NO policies to lock it down — mirroring
-- friend_entry_state.

alter table public.entry_deadline_state enable row level security;

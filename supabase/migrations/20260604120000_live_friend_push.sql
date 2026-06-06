-- Live friends push: per-friend opt-in flag + state tracking for liveresultat
-- notifications (start, split passings, final result).

-- 1. Per-friend opt-in. Default OFF — live push is noisy and must be enabled
--    explicitly. One toggle controls start + splits + result from liveresultat.
alter table public.friend_watches
  add column if not exists push_on_live boolean not null default false;

-- 2. Extend the existing per-friend-per-event state row so the live poller can
--    deduplicate notifications and reuse the same row as the Eventor poller.
--    The shared `start_notified_at` column synchronises the start notification
--    between the Eventor reminder and the live "har startat" push so only one
--    start notification is ever delivered.
alter table public.friend_activity_state
  add column if not exists live_competition_id integer,            -- null=unchecked, 0=no live match, >0=matched competition id
  add column if not exists live_class_name text,                   -- runner's class name (from Eventor) used for getFavoriteresult
  add column if not exists notified_split_codes jsonb not null default '[]'::jsonb, -- control codes already pushed
  add column if not exists last_live_status integer,               -- last seen liveresultat status code
  add column if not exists live_result_notified_at timestamptz;    -- set when the live finish/result push has been sent

create index if not exists friend_activity_state_live_comp_idx
  on public.friend_activity_state(event_date, live_competition_id);

comment on column public.friend_watches.push_on_live is 'Live-push: start, mellantider och resultat från liveresultat (default av).';
comment on column public.friend_activity_state.notified_split_codes is 'Kontrollkoder vars mellantid redan pushats, för att undvika dubbletter.';
comment on column public.friend_activity_state.live_result_notified_at is 'Sätts när live-målnotisen skickats; stoppar efterföljande start-/split-pushar.';

-- All notifications default to OFF: users must actively opt in rather than
-- having to discover and turn things off. Only affects column defaults for
-- future rows without explicit values (the app always sends explicit values
-- on every sync, so this is a schema-consistency change, not a behavior one).
alter table public.device_notification_preferences alter column push_on_entry_deadline set default false;
alter table public.device_friend_watches alter column push_on_start set default false;
alter table public.device_friend_watches alter column push_on_result set default false;

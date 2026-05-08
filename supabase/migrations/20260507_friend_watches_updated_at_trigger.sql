-- Only update updated_at when a column actually changes.
create or replace function public.friend_watches_set_updated_at()
returns trigger as $$
begin
  if (
    OLD.friend_name IS DISTINCT FROM NEW.friend_name OR
    OLD.friend_club IS DISTINCT FROM NEW.friend_club OR
    OLD.friend_gender IS DISTINCT FROM NEW.friend_gender OR
    OLD.friend_birth_year IS DISTINCT FROM NEW.friend_birth_year OR
    OLD.push_on_start IS DISTINCT FROM NEW.push_on_start OR
    OLD.push_on_result IS DISTINCT FROM NEW.push_on_result
  ) then
    NEW.updated_at = timezone('utc', now());
  else
    NEW.updated_at = OLD.updated_at;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger friend_watches_updated_at
  before update on public.friend_watches
  for each row
  execute function public.friend_watches_set_updated_at();

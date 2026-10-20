-- Allow additional team display names without changing membership permissions.
-- Run in Supabase SQL Editor; safe to rerun. This does not invite or add users.
begin;
alter table public.team_members
  drop constraint if exists team_members_display_name_check;
alter table public.team_members
  add constraint team_members_display_name_check
  check (char_length(btrim(display_name)) between 1 and 80);
commit;

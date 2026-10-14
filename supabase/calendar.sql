-- Dashboard team calendar. Run once in the Supabase SQL Editor.
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  detail text not null default '',
  event_date date not null,
  project_id uuid references public.projects(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from anon, public;
grant select, insert, update, delete on public.calendar_events to authenticated;

drop policy if exists team_read on public.calendar_events;
drop policy if exists team_insert on public.calendar_events;
drop policy if exists own_update on public.calendar_events;
drop policy if exists own_delete on public.calendar_events;
create policy team_read on public.calendar_events for select to authenticated
  using (public.is_team_member());
create policy team_insert on public.calendar_events for insert to authenticated
  with check (public.is_team_member() and created_by = auth.uid());
create policy own_update on public.calendar_events for update to authenticated
  using (public.is_team_member() and created_by = auth.uid())
  with check (public.is_team_member() and created_by = auth.uid());
create policy own_delete on public.calendar_events for delete to authenticated
  using (public.is_team_member() and created_by = auth.uid());

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='calendar_events') then
    alter publication supabase_realtime add table public.calendar_events;
  end if;
end $$;


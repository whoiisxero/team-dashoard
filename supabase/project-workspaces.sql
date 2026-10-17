-- Run once in Supabase SQL Editor; safe to rerun. Existing data is preserved.
begin;
alter table public.tasks add column if not exists assigned_to uuid
  references public.team_members(user_id) on delete set null;

create table if not exists public.project_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 12000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists project_notes_project_idx on public.project_notes(project_id,created_at desc);
alter table public.project_notes enable row level security;
revoke all on public.project_notes from public,anon,authenticated;
grant select,insert on public.project_notes to authenticated;
grant update(title,body) on public.project_notes to authenticated;
drop policy if exists team_read on public.project_notes;
create policy team_read on public.project_notes for select to authenticated using (public.is_team_member());
drop policy if exists own_insert on public.project_notes;
create policy own_insert on public.project_notes for insert to authenticated
  with check(public.is_team_member() and created_by=auth.uid());
drop policy if exists own_update on public.project_notes;
create policy own_update on public.project_notes for update to authenticated
  using(public.is_team_member() and created_by=auth.uid())
  with check(public.is_team_member() and created_by=auth.uid());
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='project_notes') then
    alter publication supabase_realtime add table public.project_notes;
  end if;
  if to_regprocedure('public.capture_team_notification()') is not null then
    drop trigger if exists notify_team_activity on public.project_notes;
    create trigger notify_team_activity after insert or update or delete on public.project_notes
      for each row execute function public.capture_team_notification();
  end if;
end $$;
commit;

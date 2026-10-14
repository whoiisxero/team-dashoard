-- Run this once in Supabase SQL Editor.
create table if not exists public.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (display_name in ('Quan', 'Tertius')),
  created_at timestamptz not null default now()
);

create or replace function public.is_team_member()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.team_members where user_id = auth.uid());
$$;
revoke all on function public.is_team_member() from public, anon;
grant execute on function public.is_team_member() to authenticated;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  client text not null default '',
  status text not null default 'On track',
  progress integer not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.team_settings (
  id boolean primary key default true check (id),
  monthly_budget numeric(12,2) not null default 700 check (monthly_budget >= 0),
  updated_at timestamptz not null default now()
);
insert into public.team_settings (id, monthly_budget) values (true, 700)
on conflict (id) do nothing;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  project_id uuid references public.projects(id) on delete set null,
  due_date date,
  status text not null default 'To do' check (status in ('To do', 'In progress', 'Done')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric(12,2) not null check (amount >= 0),
  category text not null default 'Other',
  project_id uuid references public.projects(id) on delete set null,
  spent_on date not null default current_date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  detail text not null default '',
  project_id uuid references public.projects(id) on delete set null,
  target_date date,
  progress integer not null default 0 check (progress between 0 and 100),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.discussion_messages (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(body) between 1 and 4000),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  detail text not null default '',
  event_date date not null,
  project_id uuid references public.projects(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.team_members enable row level security;
alter table public.projects enable row level security;
alter table public.team_settings enable row level security;
alter table public.tasks enable row level security;
alter table public.expenses enable row level security;
alter table public.goals enable row level security;
alter table public.discussion_messages enable row level security;
alter table public.calendar_events enable row level security;

-- Replace any older or overly broad policies on the dashboard's tables.
do $
declare p record;
begin
  for p in select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename = any (array['team_members','team_settings','projects','tasks','expenses','goals','discussion_messages','calendar_events'])
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $;

create policy team_read on public.team_members for select to authenticated
  using (public.is_team_member());
create policy team_read on public.team_settings for select to authenticated
  using (public.is_team_member());
create policy team_read on public.projects for select to authenticated
  using (public.is_team_member());
create policy team_read on public.tasks for select to authenticated
  using (public.is_team_member());
create policy team_read on public.expenses for select to authenticated
  using (public.is_team_member());
create policy team_read on public.goals for select to authenticated
  using (public.is_team_member());
create policy team_read on public.discussion_messages for select to authenticated
  using (public.is_team_member());
create policy team_read on public.calendar_events for select to authenticated
  using (public.is_team_member());

create policy team_insert on public.projects for insert to authenticated
  with check (public.is_team_member());
create policy team_update on public.projects for update to authenticated
  using (public.is_team_member()) with check (public.is_team_member());
create policy team_insert on public.tasks for insert to authenticated
  with check (public.is_team_member() and created_by = auth.uid());
create policy team_update on public.tasks for update to authenticated
  using (public.is_team_member()) with check (public.is_team_member());
create policy team_insert on public.expenses for insert to authenticated
  with check (public.is_team_member() and created_by = auth.uid());
create policy own_update on public.expenses for update to authenticated
  using (public.is_team_member() and created_by = auth.uid())
  with check (public.is_team_member() and created_by = auth.uid());
create policy own_delete on public.expenses for delete to authenticated
  using (public.is_team_member() and created_by = auth.uid());
create policy team_insert on public.goals for insert to authenticated
  with check (public.is_team_member() and created_by = auth.uid());
create policy team_update on public.goals for update to authenticated
  using (public.is_team_member()) with check (public.is_team_member());
create policy team_insert on public.discussion_messages for insert to authenticated
  with check (public.is_team_member() and user_id = auth.uid());
create policy own_delete on public.discussion_messages for delete to authenticated
  using (public.is_team_member() and user_id = auth.uid());
create policy team_insert on public.calendar_events for insert to authenticated
  with check (public.is_team_member() and created_by = auth.uid());
create policy own_update on public.calendar_events for update to authenticated
  using (public.is_team_member() and created_by = auth.uid())
  with check (public.is_team_member() and created_by = auth.uid());
create policy own_delete on public.calendar_events for delete to authenticated
  using (public.is_team_member() and created_by = auth.uid());

revoke all on public.team_members, public.team_settings, public.projects, public.tasks,
  public.expenses, public.goals, public.discussion_messages, public.calendar_events from anon;
revoke all on public.team_members, public.team_settings, public.projects, public.tasks,
  public.expenses, public.goals, public.discussion_messages, public.calendar_events from public;
grant select on public.team_members, public.team_settings to authenticated;
grant select, insert, update on public.projects, public.tasks, public.goals to authenticated;
grant select, insert, update, delete on public.expenses, public.discussion_messages, public.calendar_events to authenticated;

insert into public.projects (name, client, status, progress) values
  ('Social media management', 'Marketing · Social', 'On track', 0),
  ('Loden', 'Loden · Client project', 'On track', 0),
  ('Reddington', 'Reddington · Client project', 'On track', 0)
on conflict (name) do nothing;

-- Add missing team tables to Realtime without failing if one is already present.
do $
declare t text;
begin
  foreach t in array array['discussion_messages','tasks','expenses','projects','goals','calendar_events'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $;

alter table public.expenses alter column spent_on set default current_date;


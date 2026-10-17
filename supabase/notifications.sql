-- Run this entire script once in Supabase SQL Editor. Safe to rerun.
-- Captures future changes only. Existing data is left unchanged.
begin;

create table if not exists public.team_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid,
  actor_name text not null,
  source_table text not null,
  source_id text not null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  item_title text not null,
  event_date date,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists team_notifications_recipient_date_idx
  on public.team_notifications (recipient_id, created_at desc, id desc);
create index if not exists team_notifications_unread_idx
  on public.team_notifications (recipient_id) where read_at is null;

alter table public.team_notifications enable row level security;
revoke all on public.team_notifications from public, anon, authenticated;
grant select on public.team_notifications to authenticated;
grant update (read_at) on public.team_notifications to authenticated;
drop policy if exists recipient_read on public.team_notifications;
create policy recipient_read on public.team_notifications for select to authenticated
  using (recipient_id = auth.uid() and public.is_team_member());
drop policy if exists recipient_mark_read on public.team_notifications;
create policy recipient_mark_read on public.team_notifications for update to authenticated
  using (recipient_id = auth.uid() and public.is_team_member())
  with check (recipient_id = auth.uid() and public.is_team_member());

create or replace function public.capture_team_notification()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  item jsonb;
  actor uuid := auth.uid();
  actor_label text;
  title text;
  source text;
  item_date date;
begin
  -- Ignore writes that did not change any column value.
  if TG_OP = 'UPDATE' and to_jsonb(NEW) = to_jsonb(OLD) then return NEW; end if;
  if TG_OP = 'DELETE' then item := to_jsonb(OLD); else item := to_jsonb(NEW); end if;
  if actor is not null then
    select display_name into actor_label from public.team_members where user_id = actor;
    -- Do not generate team activity attributed to an unauthorised account.
    if actor_label is null then return null; end if;
  else
    -- SQL Editor and server-side changes lack an end-user identity.
    actor_label := 'Team admin';
  end if;
  source := coalesce(item->>'id', item->>'user_id', 'settings');
  title := case TG_TABLE_NAME
    when 'projects' then coalesce(item->>'name', 'Project')
    when 'discussion_messages' then 'Team discussion'
    when 'team_settings' then 'Team budget'
    when 'team_members' then coalesce(item->>'display_name', 'Team member')
    else coalesce(item->>'title', 'Team item') end;
  if TG_TABLE_NAME = 'calendar_events' then item_date := (item->>'event_date')::date; end if;
  insert into public.team_notifications
    (recipient_id, actor_id, actor_name, source_table, source_id, action, item_title, event_date)
  select user_id, actor, actor_label, TG_TABLE_NAME, source, TG_OP, left(title, 240), item_date
    from public.team_members
    where actor is null or user_id <> actor;
  -- AFTER trigger return value is ignored.
  return null;
end;
$$;
revoke all on function public.capture_team_notification() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['projects','tasks','expenses','goals','discussion_messages','calendar_events','team_settings','team_members'] loop
    execute format('drop trigger if exists notify_team_activity on public.%I', t);
    execute format('create trigger notify_team_activity after insert or update or delete on public.%I for each row execute function public.capture_team_notification()', t);
  end loop;
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='team_notifications') then
    alter publication supabase_realtime add table public.team_notifications;
  end if;
end;
$$;
commit;

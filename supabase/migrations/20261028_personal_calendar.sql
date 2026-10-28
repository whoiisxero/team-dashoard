-- Private personal events. Run after 20261028_personal_workspaces.sql.
-- These events never create team/project calendar rows or grant project access.
begin;
do $$ begin
  if to_regprocedure('public.has_personal_workspace()') is null then
    raise exception 'Install the private-workspace setup before the personal calendar.';
  end if;
end $$;

-- The UI keeps event saving disabled until this migration has actually run.
create or replace function public.my_dashboard_access()
returns jsonb language sql stable security definer set search_path=''
as $$ select jsonb_build_object('ready',true,'is_admin',coalesce(a.is_admin,false),
  'personal_only',coalesce(a.personal_only,false),'personal_workspace_ready',true,'personal_calendar_ready',true,
  'shared_access',coalesce(a.is_admin or (not a.personal_only and a.shared_access),false),
  'can_create_projects',coalesce(a.is_admin or (not a.personal_only and a.project_mode='all' and a.shared_access and a.editable_project_ids is null),false),
  'project_mode',case when a.personal_only then 'selected' else coalesce(a.project_mode,'selected') end,'access_levels_ready',true,
  'editable_project_ids',case when a.personal_only then '[]'::jsonb when a.is_admin then null else to_jsonb(a.editable_project_ids) end)
  from public.team_members m left join public.member_access a using(user_id) where m.user_id=auth.uid(); $$;

create table if not exists public.personal_calendar_events(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.team_members(user_id) on delete cascade,
  title text not null check(char_length(btrim(title)) between 1 and 160),
  detail text not null default '' check(char_length(detail)<=10000),
  location text not null default '' check(char_length(location)<=300),
  event_date date not null check(isfinite(event_date)),
  event_time time,
  time_zone text not null default 'Africa/Johannesburg' check(public.quest_valid_timezone(time_zone)),
  event_starts_at timestamptz generated always as
    ((event_date+coalesce(event_time,time '09:00')) at time zone time_zone) stored,
  remind_at timestamptz check(remind_at is null or isfinite(remind_at)),
  revision integer not null default 1,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  constraint personal_calendar_events_local_time_check check(
    ((event_date+coalesce(event_time,time '09:00')) at time zone time_zone) at time zone time_zone
      =event_date+coalesce(event_time,time '09:00'))
);
create index if not exists personal_calendar_owner_date_idx
  on public.personal_calendar_events(owner_id,event_date,event_time);
alter table public.personal_calendar_events enable row level security;
revoke all on public.personal_calendar_events from public,anon,authenticated;
grant select,delete on public.personal_calendar_events to authenticated;
drop policy if exists own_personal_events on public.personal_calendar_events;
create policy own_personal_events on public.personal_calendar_events for all to authenticated
using(owner_id=auth.uid() and public.has_personal_workspace())
with check(owner_id=auth.uid() and public.has_personal_workspace());

create or replace function public.can_access_personal_event(event_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.personal_calendar_events e
  where e.id=event_id and e.owner_id=auth.uid() and public.personal_workspace_for(e.owner_id)); $$;
revoke all on function public.can_access_personal_event(uuid) from public,anon,authenticated;
grant execute on function public.can_access_personal_event(uuid) to authenticated;

create or replace function public.quest_save_personal_event(
  event_id uuid,event_title text,event_detail text,event_location text,event_day date,
  event_clock time,zone text,remind_local timestamp,expected_revision integer)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare old_event public.personal_calendar_events; saved public.personal_calendar_events;
  local_start timestamp; instant timestamptz; remind_value timestamptz; begin
  if not public.has_personal_workspace() then raise exception 'Personal workspace access required.'; end if;
  if event_id is null or event_day is null or not isfinite(event_day) or zone is null
    or not public.quest_valid_timezone(zone) then
    raise exception 'Choose a valid event date and time zone.';
  end if;
  local_start:=event_day+coalesce(event_clock,time '09:00');
  instant:=local_start at time zone zone;
  remind_value:=remind_local at time zone zone;
  if instant at time zone zone<>local_start or
    (remind_local is not null and (not isfinite(remind_local) or remind_value at time zone zone<>remind_local)) then
    raise exception 'That local time does not exist in the selected time zone. Choose another time.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(event_id::text,0));
  select * into old_event from public.personal_calendar_events where id=event_id;
  if found then
    if old_event.owner_id<>auth.uid() then raise exception 'This event is not available.'; end if;
    if expected_revision is null and old_event.title=btrim(event_title)
      and old_event.detail=coalesce(event_detail,'') and old_event.location=btrim(coalesce(event_location,''))
      and old_event.event_date=event_day and old_event.event_time is not distinct from event_clock
      and old_event.time_zone=zone and old_event.remind_at is not distinct from remind_value then
      return to_jsonb(old_event);
    end if;
    if expected_revision is distinct from old_event.revision then
      raise exception 'This event changed on another device. Close and reopen it before saving; copy your unsaved changes first.';
    end if;
    update public.personal_calendar_events set title=btrim(event_title),detail=coalesce(event_detail,''),
      location=btrim(coalesce(event_location,'')),event_date=event_day,event_time=event_clock,
      time_zone=zone,remind_at=remind_value,revision=revision+1,updated_at=now()
      where id=event_id returning * into saved;
  else
    if expected_revision is not null then raise exception 'This event was removed. Copy your changes before closing.'; end if;
    insert into public.personal_calendar_events(id,owner_id,title,detail,location,event_date,event_time,time_zone,remind_at)
      values(event_id,auth.uid(),btrim(event_title),coalesce(event_detail,''),btrim(coalesce(event_location,'')),
        event_day,event_clock,zone,remind_value) returning * into saved;
  end if;
  return to_jsonb(saved);
end $$;
revoke all on function public.quest_save_personal_event(uuid,text,text,text,date,time,text,timestamp,integer)
  from public,anon,authenticated;
grant execute on function public.quest_save_personal_event(uuid,text,text,text,date,time,text,timestamp,integer)
  to authenticated;

-- Personal event reminders share the recipient's existing inbox. The FK removes
-- reminders when an event is deleted, including already-read reminders.
alter table public.team_notifications add column if not exists personal_event_id uuid
  references public.personal_calendar_events(id) on delete cascade;
alter table public.team_notifications drop constraint if exists team_notifications_access_scope_check;
alter table public.team_notifications add constraint team_notifications_access_scope_check
  check(access_scope in ('project','shared','admin','private_chat','personal','personal_event'));
drop policy if exists notification_access_guard on public.team_notifications;
create policy notification_access_guard on public.team_notifications as restrictive for all to authenticated
using(case access_scope when 'personal_event' then public.can_access_personal_event(personal_event_id)
  when 'personal' then public.can_access_personal_note(personal_note_id)
  when 'private_chat' then public.can_access_private_chat(private_room_id)
  when 'project' then public.can_access_project(project_id)
  when 'shared' then public.can_access_project(null) else public.access_admin() end)
with check(case access_scope when 'personal_event' then public.can_access_personal_event(personal_event_id)
  when 'personal' then public.can_access_personal_note(personal_note_id)
  when 'private_chat' then public.can_access_private_chat(private_room_id)
  when 'project' then public.can_access_project(project_id)
  when 'shared' then public.can_access_project(null) else public.access_admin() end);

create or replace function public.queue_personal_event_reminders_for(recipient uuid)
returns integer language plpgsql security definer set search_path=''
as $$ declare added integer; begin
  if not public.personal_workspace_for(recipient) then return 0; end if;
  insert into public.notification_preferences(user_id) values(recipient) on conflict do nothing;
  delete from public.team_notifications n where n.recipient_id=recipient and n.access_scope='personal_event'
    and not exists(select 1 from public.personal_calendar_events e where e.id=n.personal_event_id and e.owner_id=recipient
      and n.reminder_key='personal_event:'||e.id::text||':'||extract(epoch from e.remind_at)::text||':'||extract(epoch from e.event_starts_at)::text);
  if not exists(select 1 from public.notification_preferences where user_id=recipient and enabled) then return 0; end if;
  insert into public.team_notifications(recipient_id,actor_name,source_table,source_id,action,item_title,event_date,
    access_scope,personal_event_id,notification_type,reminder_key)
  select recipient,'Quest','personal_calendar_events',e.id::text,'UPDATE',e.title,e.event_date,
    'personal_event',e.id,'reminder','personal_event:'||e.id::text||':'||extract(epoch from e.remind_at)::text||':'||extract(epoch from e.event_starts_at)::text
    from public.personal_calendar_events e where e.owner_id=recipient and e.remind_at<=now()
    on conflict(recipient_id,reminder_key) where reminder_key is not null do nothing;
  get diagnostics added=row_count;return added;
end $$;
revoke all on function public.queue_personal_event_reminders_for(uuid) from public,anon,authenticated;

create or replace function public.refresh_my_reminders()
returns integer language plpgsql security definer set search_path=''
as $$ begin
  if not public.is_team_member() then raise exception 'Team membership required.'; end if;
  return public.queue_quest_reminders_for(auth.uid())+public.queue_personal_reminders_for(auth.uid())
    +public.queue_personal_event_reminders_for(auth.uid());
end $$;
revoke all on function public.refresh_my_reminders() from public,anon,authenticated;
grant execute on function public.refresh_my_reminders() to authenticated;
create or replace function public.queue_due_quest_reminders()
returns integer language plpgsql security definer set search_path=''
as $$ declare recipient uuid; total integer:=0; begin
  for recipient in select user_id from public.notification_preferences where enabled loop
    total:=total+public.queue_quest_reminders_for(recipient)+public.queue_personal_reminders_for(recipient)
      +public.queue_personal_event_reminders_for(recipient);
  end loop;return total;
end $$;
revoke all on function public.queue_due_quest_reminders() from public,anon,authenticated;

insert into public.quest_schema_migrations(version) values('20261028_personal_calendar') on conflict do nothing;
notify pgrst,'reload schema';
commit;

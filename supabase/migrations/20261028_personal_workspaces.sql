-- Private workspaces and independent, invite-only personal conversations.
-- Run after the daily workflow and project editing migrations, as postgres.
begin;
alter table public.member_access add column if not exists personal_only boolean not null default false;

create or replace function public.personal_workspace_for(member uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.member_access a join public.team_members m using(user_id)
  where a.user_id=member and (a.personal_only or a.is_admin)); $$;
create or replace function public.is_personal_only()
returns boolean language sql stable security definer set search_path=''
as $$ select coalesce((select personal_only from public.member_access where user_id=auth.uid()),false); $$;
create or replace function public.has_personal_workspace()
returns boolean language sql stable security definer set search_path=''
as $$ select public.personal_workspace_for(auth.uid()); $$;
revoke all on function public.personal_workspace_for(uuid),public.is_personal_only(),public.has_personal_workspace() from public,anon,authenticated;
grant execute on function public.is_personal_only(),public.has_personal_workspace() to authenticated;

-- A personal-only account cannot gain project/shared access through an older editor.
create or replace function public.shared_access_for(member_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.member_access a join public.team_members m using(user_id)
  where a.user_id=member_id and (a.is_admin or (not a.personal_only and a.shared_access))); $$;
create or replace function public.project_access_for(member_id uuid,project uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.member_access a join public.team_members m using(user_id)
  where a.user_id=member_id and (a.is_admin or (not a.personal_only and exists(select 1 from public.projects p where p.id=project)
    and coalesce((select x.allowed from public.project_member_access x where x.user_id=member_id and x.project_id=project),
      a.project_mode='all' and not (select p.access_restricted from public.projects p where p.id=project))))); $$;
create or replace function public.can_create_project()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.member_access a join public.team_members m using(user_id)
  where a.user_id=auth.uid() and (a.is_admin or (not a.personal_only and a.project_mode='all' and a.shared_access and a.editable_project_ids is null))); $$;
create or replace function public.my_dashboard_access()
returns jsonb language sql stable security definer set search_path=''
as $$ select jsonb_build_object('ready',true,'is_admin',coalesce(a.is_admin,false),
  'personal_only',coalesce(a.personal_only,false),'personal_workspace_ready',true,
  'shared_access',coalesce(a.is_admin or (not a.personal_only and a.shared_access),false),
  'can_create_projects',coalesce(a.is_admin or (not a.personal_only and a.project_mode='all' and a.shared_access and a.editable_project_ids is null),false),
  'project_mode',case when a.personal_only then 'selected' else coalesce(a.project_mode,'selected') end,'access_levels_ready',true,
  'editable_project_ids',case when a.personal_only then '[]'::jsonb when a.is_admin then null else to_jsonb(a.editable_project_ids) end)
  from public.team_members m left join public.member_access a using(user_id) where m.user_id=auth.uid(); $$;
drop policy if exists personal_roster_guard on public.team_members;
create policy personal_roster_guard on public.team_members as restrictive for select to authenticated
using(not public.is_personal_only() or user_id=auth.uid());

-- Personal rooms have no project. Only the invited workspace owner and the
-- administrator who created the room may access them, including through APIs.
alter table public.private_chat_rooms alter column project_id drop not null;
alter table public.private_chat_rooms add column if not exists room_kind text not null default 'project';
alter table public.private_chat_rooms add column if not exists personal_owner_id uuid references public.team_members(user_id) on delete cascade;
alter table public.private_chat_rooms drop constraint if exists private_chat_room_scope_check;
alter table public.private_chat_rooms add constraint private_chat_room_scope_check check(
  (room_kind='project' and project_id is not null and personal_owner_id is null) or
  (room_kind='personal' and project_id is null and personal_owner_id is not null));
create or replace function public.private_chat_access_for(member_id uuid,chat_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.private_chat_rooms r join public.private_chat_members m on m.room_id=r.id
  join public.team_members t on t.user_id=m.user_id join public.member_access a on a.user_id=m.user_id
  where r.id=chat_id and m.user_id=member_id and case r.room_kind when 'personal' then
    public.personal_workspace_for(r.personal_owner_id) and
    (member_id=r.personal_owner_id or (member_id=r.created_by and a.is_admin))
    else not a.personal_only and public.project_access_for(member_id,r.project_id) end); $$;
create or replace function public.can_edit_private_chat(room uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.private_chat_rooms r where r.id=room
  and public.can_access_private_chat(r.id) and (r.room_kind='personal' or public.can_edit_project(r.project_id))); $$;
create or replace function public.private_chat_participants(chat_id uuid)
returns table(user_id uuid,display_name text) language sql stable security definer set search_path=''
as $$ select t.user_id,t.display_name from public.private_chat_members m join public.team_members t using(user_id)
  where m.room_id=chat_id and public.can_access_private_chat(chat_id) order by t.display_name; $$;
revoke all on function public.private_chat_participants(uuid) from public,anon,authenticated;
grant execute on function public.private_chat_participants(uuid) to authenticated;

create table if not exists public.personal_profiles(
  user_id uuid primary key references public.team_members(user_id) on delete cascade,
  preferred_name text not null default '' check(char_length(preferred_name)<=80),
  business_name text not null default '' check(char_length(business_name)<=100),
  welcome_note text not null default 'A quiet space for your ideas and what comes next.' check(char_length(welcome_note)<=400),
  theme text not null default 'cyberpunk' check(theme in ('cyberpunk','green','blue','violet','rose','amber')),
  density text not null default 'comfortable' check(density in ('comfortable','compact')),
  text_size text not null default 'normal' check(text_size in ('normal','large')),
  time_zone text not null default 'Africa/Johannesburg' check(public.quest_valid_timezone(time_zone)),
  setup_complete boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.personal_profiles enable row level security;
revoke all on public.personal_profiles from public,anon,authenticated;
grant select,insert,update on public.personal_profiles to authenticated;
drop policy if exists own_personal_profile on public.personal_profiles;
create policy own_personal_profile on public.personal_profiles for all to authenticated
using(user_id=auth.uid() and public.has_personal_workspace()) with check(user_id=auth.uid() and public.has_personal_workspace());

create table if not exists public.personal_notes(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.team_members(user_id) on delete cascade,
  kind text not null check(kind in ('writing','business')),
  title text not null check(char_length(btrim(title)) between 1 and 180),
  body text not null default '' check(char_length(body)<=100000),
  category text not null default '' check(char_length(category)<=80),
  pinned boolean not null default false,
  status text not null default 'open' check(status in ('open','in_progress','done')),
  due_at timestamptz,remind_at timestamptz,
  time_zone text not null default 'Africa/Johannesburg' check(public.quest_valid_timezone(time_zone)),
  revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check(kind='business' or (due_at is null and remind_at is null))
);
create index if not exists personal_notes_owner_date_idx on public.personal_notes(owner_id,kind,updated_at desc);
alter table public.personal_notes enable row level security;
revoke all on public.personal_notes from public,anon,authenticated;
grant select,delete on public.personal_notes to authenticated;
drop policy if exists own_personal_notes on public.personal_notes;
create policy own_personal_notes on public.personal_notes for all to authenticated
using(owner_id=auth.uid() and public.has_personal_workspace()) with check(owner_id=auth.uid() and public.has_personal_workspace());
create or replace function public.can_access_personal_note(note_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.personal_notes n where n.id=note_id and n.owner_id=auth.uid()
  and public.personal_workspace_for(n.owner_id)); $$;
revoke all on function public.can_access_personal_note(uuid) from public,anon,authenticated;
grant execute on function public.can_access_personal_note(uuid) to authenticated;

-- Explicit save, revision checks, and retry-safe IDs protect writing on two devices.
create or replace function public.quest_save_personal_note(
  note_id uuid,note_kind text,note_title text,note_body text,note_category text,note_pinned boolean,
  note_status text,due_local timestamp,remind_local timestamp,zone text,expected_revision integer)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare old_note public.personal_notes; saved public.personal_notes; due_value timestamptz; remind_value timestamptz; begin
  if not public.has_personal_workspace() then raise exception 'Personal workspace access required.'; end if;
  if note_id is null or not public.quest_valid_timezone(zone) then raise exception 'Choose a valid note and time zone.'; end if;
  due_value:=due_local at time zone zone;remind_value:=remind_local at time zone zone;
  if (due_local is not null and due_value at time zone zone<>due_local) or
    (remind_local is not null and remind_value at time zone zone<>remind_local) then
    raise exception 'That local time does not exist in the selected time zone. Choose another time.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(note_id::text,0));
  select * into old_note from public.personal_notes where id=note_id;
  if found then
    if old_note.owner_id<>auth.uid() then raise exception 'This note is not available.'; end if;
    if old_note.kind<>note_kind then raise exception 'A note cannot change workspace type.'; end if;
    if expected_revision is null and old_note.kind=note_kind and old_note.title=btrim(note_title) and old_note.body=note_body
      and old_note.category=btrim(note_category) and old_note.pinned=note_pinned and old_note.status=note_status
      and old_note.due_at is not distinct from due_value and old_note.remind_at is not distinct from remind_value
      and old_note.time_zone=zone then return to_jsonb(old_note); end if;
    if expected_revision is distinct from old_note.revision then
      raise exception 'This note changed on another device. Close and reopen it before saving; copy your unsaved writing first.';
    end if;
    update public.personal_notes set title=btrim(note_title),body=note_body,category=btrim(note_category),pinned=note_pinned,
      status=note_status,due_at=due_value,remind_at=remind_value,time_zone=zone,revision=revision+1,updated_at=now()
      where id=note_id returning * into saved;
  else
    if expected_revision is not null then raise exception 'This note was removed. Copy your writing before closing.'; end if;
    insert into public.personal_notes(id,owner_id,kind,title,body,category,pinned,status,due_at,remind_at,time_zone)
      values(note_id,auth.uid(),note_kind,btrim(note_title),note_body,btrim(note_category),note_pinned,note_status,due_value,remind_value,zone)
      returning * into saved;
  end if;
  return to_jsonb(saved);
end $$;
revoke all on function public.quest_save_personal_note(uuid,text,text,text,text,boolean,text,timestamp,timestamp,text,integer) from public,anon,authenticated;
grant execute on function public.quest_save_personal_note(uuid,text,text,text,text,boolean,text,timestamp,timestamp,text,integer) to authenticated;

-- Personal work reminders use the existing inbox, not a shared project or chat.
alter table public.team_notifications add column if not exists personal_note_id uuid references public.personal_notes(id) on delete cascade;
alter table public.team_notifications drop constraint if exists team_notifications_access_scope_check;
alter table public.team_notifications add constraint team_notifications_access_scope_check check(access_scope in ('project','shared','admin','private_chat','personal'));
drop policy if exists notification_access_guard on public.team_notifications;
create policy notification_access_guard on public.team_notifications as restrictive for all to authenticated
using(case access_scope when 'personal' then public.can_access_personal_note(personal_note_id)
  when 'private_chat' then public.can_access_private_chat(private_room_id) when 'project' then public.can_access_project(project_id)
  when 'shared' then public.can_access_project(null) else public.access_admin() end)
with check(case access_scope when 'personal' then public.can_access_personal_note(personal_note_id)
  when 'private_chat' then public.can_access_private_chat(private_room_id) when 'project' then public.can_access_project(project_id)
  when 'shared' then public.can_access_project(null) else public.access_admin() end);

create or replace function public.queue_personal_reminders_for(recipient uuid)
returns integer language plpgsql security definer set search_path=''
as $$ declare added integer; begin
  if not public.personal_workspace_for(recipient) then return 0; end if;
  insert into public.notification_preferences(user_id) values(recipient) on conflict do nothing;
  delete from public.team_notifications n where n.recipient_id=recipient and n.access_scope='personal'
    and not exists(select 1 from public.personal_notes p where p.id=n.personal_note_id and p.status<>'done'
      and n.reminder_key='personal:'||p.id::text||':'||extract(epoch from p.remind_at)::text);
  if not exists(select 1 from public.notification_preferences where user_id=recipient and enabled) then return 0; end if;
  insert into public.team_notifications(recipient_id,actor_name,source_table,source_id,action,item_title,access_scope,personal_note_id,notification_type,reminder_key)
  select recipient,'Quest','personal_notes',p.id::text,'UPDATE',p.title,'personal',p.id,'reminder',
    'personal:'||p.id::text||':'||extract(epoch from p.remind_at)::text
    from public.personal_notes p where p.owner_id=recipient and p.kind='business' and p.status<>'done' and p.remind_at<=now()
    on conflict(recipient_id,reminder_key) where reminder_key is not null do nothing;
  get diagnostics added=row_count;return added;
end $$;
create or replace function public.refresh_my_reminders()
returns integer language plpgsql security definer set search_path=''
as $$ begin
  if not public.is_team_member() then raise exception 'Team membership required.'; end if;
  return public.queue_quest_reminders_for(auth.uid())+public.queue_personal_reminders_for(auth.uid());
end $$;
create or replace function public.queue_due_quest_reminders()
returns integer language plpgsql security definer set search_path=''
as $$ declare recipient uuid; total integer:=0; begin
  for recipient in select user_id from public.notification_preferences where enabled loop
    total:=total+public.queue_quest_reminders_for(recipient)+public.queue_personal_reminders_for(recipient);
  end loop;return total;
end $$;
revoke all on function public.queue_personal_reminders_for(uuid) from public,anon,authenticated;

create or replace function public.quest_make_personal_workspace(target uuid)
returns uuid language plpgsql security definer set search_path=''
as $$ declare label text; admin_name text; chat uuid; begin
  if not public.access_admin() then raise exception 'Only the owner can configure private workspaces.'; end if;
  if target=auth.uid() or exists(select 1 from public.member_access where user_id=target and is_admin) then
    raise exception 'Owner access cannot be changed here.';
  end if;
  select display_name into label from public.team_members where user_id=target;
  if label is null then raise exception 'Member not found.'; end if;
  select display_name into admin_name from public.team_members where user_id=auth.uid();
  select id into chat from public.private_chat_rooms where room_key='personal-owner-'||target::text;
  if chat is not null and not exists(select 1 from public.private_chat_rooms where id=chat and room_kind='personal'
      and personal_owner_id=target and created_by=auth.uid()) then raise exception 'This conversation belongs to a different owner.'; end if;
  insert into public.member_access(user_id,personal_only,project_mode,shared_access,editable_project_ids)
    values(target,true,'selected',false,'{}') on conflict(user_id) do update set personal_only=true,project_mode='selected',shared_access=false,editable_project_ids='{}';
  delete from public.project_member_access where user_id=target;
  delete from public.private_chat_members where user_id=target;
  if chat is null then
    insert into public.private_chat_rooms(room_key,name,room_kind,personal_owner_id,created_by)
      values('personal-owner-'||target::text,left(admin_name||' & '||label,100),'personal',target,auth.uid()) returning id into chat;
  end if;
  delete from public.private_chat_members where room_id=chat and user_id not in(target,auth.uid());
  insert into public.private_chat_members(room_id,user_id) values(chat,target),(chat,auth.uid()) on conflict do nothing;
  insert into public.personal_profiles(user_id,preferred_name) values(target,label) on conflict do nothing;
  insert into public.notification_preferences(user_id) values(target) on conflict do nothing;
  return chat;
end $$;
create or replace function public.list_member_access()
returns jsonb language plpgsql stable security definer set search_path=''
as $$ begin
  if not public.access_admin() then raise exception 'Only the team owner can manage access.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',m.display_name,
    'is_admin',coalesce(a.is_admin,false),'personal_only',coalesce(a.personal_only,false),'project_mode',coalesce(a.project_mode,'selected'),
    'shared_access',coalesce(a.shared_access,false),'editable_project_ids',to_jsonb(a.editable_project_ids),
    'project_rules',coalesce((select jsonb_agg(jsonb_build_object('project_id',x.project_id,'allowed',x.allowed))
      from public.project_member_access x where x.user_id=m.user_id),'[]'::jsonb)) order by m.display_name),'[]'::jsonb)
    from public.team_members m left join public.member_access a using(user_id));
end $$;
revoke all on function public.quest_make_personal_workspace(uuid) from public,anon,authenticated;
grant execute on function public.quest_make_personal_workspace(uuid) to authenticated;

insert into public.quest_schema_migrations(version) values('20261028_personal_workspaces') on conflict do nothing;
notify pgrst,'reload schema';
commit;

-- Run after member-access.sql and private-chats.sql, or use the complete setup bundle.
begin;
do $$ begin
  if to_regprocedure('public.can_access_project(uuid)') is null
     or to_regclass('public.private_chat_messages') is null then
    raise exception 'Install project permissions and private chats first, or run the complete daily-workflow setup bundle.';
  end if;
  if to_regclass('storage.objects') is null then
    raise exception 'Supabase Storage is required for project uploads.';
  end if;
end $$;

create table if not exists public.quest_schema_migrations(version text primary key,applied_at timestamptz not null default now());
revoke all on public.quest_schema_migrations from public,anon,authenticated;
alter table public.quest_schema_migrations enable row level security;

create or replace function public.quest_valid_timezone(value text)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from pg_catalog.pg_timezone_names where name=value); $$;
revoke all on function public.quest_valid_timezone(text) from public,anon,authenticated;
grant execute on function public.quest_valid_timezone(text) to authenticated;
alter table public.calendar_events add column if not exists event_time time;
alter table public.calendar_events add column if not exists time_zone text not null default 'Africa/Johannesburg';
alter table public.calendar_events drop constraint if exists calendar_events_timezone_check;
alter table public.calendar_events add constraint calendar_events_timezone_check check(public.quest_valid_timezone(time_zone));
alter table public.calendar_events add column if not exists event_starts_at timestamptz generated always as ((event_date+coalesce(event_time,time '09:00')) at time zone time_zone) stored;
alter table public.calendar_events drop constraint if exists calendar_events_valid_local_time;
alter table public.calendar_events add constraint calendar_events_valid_local_time check(event_time is null or ((event_date+event_time) at time zone time_zone) at time zone time_zone=event_date+event_time);

create table if not exists public.notification_preferences(
  user_id uuid primary key references public.team_members(user_id) on delete cascade,
  enabled boolean not null default true,
  task_days_before integer not null default 1 check(task_days_before between 0 and 14),
  event_hours_before integer not null default 24 check(event_hours_before between 0 and 168),
  time_zone text not null default 'Africa/Johannesburg' check(public.quest_valid_timezone(time_zone))
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from public,anon,authenticated;
grant select,insert,update on public.notification_preferences to authenticated;
drop policy if exists own_preferences on public.notification_preferences;
create policy own_preferences on public.notification_preferences for all to authenticated
using(user_id=auth.uid() and public.is_team_member()) with check(user_id=auth.uid() and public.is_team_member());

alter table public.team_notifications add column if not exists notification_type text not null default 'activity' check(notification_type in ('activity','reminder'));
alter table public.team_notifications add column if not exists reminder_key text;
create unique index if not exists team_notifications_reminder_key_idx on public.team_notifications(recipient_id,reminder_key) where reminder_key is not null;

create or replace function public.queue_quest_reminders_for(recipient uuid)
returns integer language plpgsql security definer set search_path=''
as $$ declare prefs public.notification_preferences; local_day date; inserted integer:=0; added integer; begin
  if not exists(select 1 from public.team_members where user_id=recipient) then return 0; end if;
  insert into public.notification_preferences(user_id) values(recipient) on conflict do nothing;
  select * into prefs from public.notification_preferences where user_id=recipient;
  local_day:=(now() at time zone prefs.time_zone)::date;
  -- Remove obsolete reminders after reassignment, completion or rescheduling.
  delete from public.team_notifications n where n.recipient_id=recipient and n.notification_type='reminder' and (
    (n.source_table='tasks' and not exists(select 1 from public.tasks t where t.id::text=n.source_id and t.assigned_to=recipient and t.status<>'Done' and t.due_date=n.event_date)) or
    (n.source_table='calendar_events' and not exists(select 1 from public.calendar_events e where e.id::text=n.source_id and n.reminder_key='event:'||e.id::text||':'||extract(epoch from ((e.event_date+coalesce(e.event_time,time '09:00')) at time zone e.time_zone))::text))
  );
  if not prefs.enabled then return 0; end if;
  insert into public.team_notifications(recipient_id,actor_name,source_table,source_id,action,item_title,event_date,project_id,access_scope,notification_type,reminder_key)
  select recipient,'Quest','tasks',t.id::text,'UPDATE',left(t.title,240),t.due_date,coalesce(t.project_id,t.access_project_id),
    case when coalesce(t.project_id,t.access_project_id) is null then 'shared' else 'project' end,'reminder','task:'||t.id::text||':'||local_day::text
  from public.tasks t where t.assigned_to=recipient and t.status<>'Done' and t.due_date<=local_day+prefs.task_days_before
    and case when coalesce(t.project_id,t.access_project_id) is null then public.shared_access_for(recipient) else public.project_access_for(recipient,coalesce(t.project_id,t.access_project_id)) end
  on conflict(recipient_id,reminder_key) where reminder_key is not null do nothing;
  get diagnostics added=row_count;inserted:=inserted+added;
  insert into public.team_notifications(recipient_id,actor_name,source_table,source_id,action,item_title,event_date,project_id,access_scope,notification_type,reminder_key)
  select recipient,'Quest','calendar_events',e.id::text,'UPDATE',left(e.title,240),e.event_date,coalesce(e.project_id,e.access_project_id),
    case when coalesce(e.project_id,e.access_project_id) is null then 'shared' else 'project' end,'reminder',
    'event:'||e.id::text||':'||extract(epoch from ((e.event_date+coalesce(e.event_time,time '09:00')) at time zone e.time_zone))::text
  from public.calendar_events e where ((e.event_date+coalesce(e.event_time,time '09:00')) at time zone e.time_zone) between now()-interval '5 minutes' and now()+make_interval(hours=>prefs.event_hours_before)
    and case when coalesce(e.project_id,e.access_project_id) is null then public.shared_access_for(recipient) else public.project_access_for(recipient,coalesce(e.project_id,e.access_project_id)) end
  on conflict(recipient_id,reminder_key) where reminder_key is not null do nothing;
  get diagnostics added=row_count;return inserted+added;
end $$;
revoke all on function public.queue_quest_reminders_for(uuid) from public,anon,authenticated;
create or replace function public.refresh_my_reminders()
returns integer language plpgsql security definer set search_path=''
as $$ begin
  if not public.is_team_member() then raise exception 'Team membership required.'; end if;
  return public.queue_quest_reminders_for(auth.uid());
end $$;
revoke all on function public.refresh_my_reminders() from public,anon,authenticated;
grant execute on function public.refresh_my_reminders() to authenticated;
create or replace function public.queue_due_quest_reminders()
returns integer language plpgsql security definer set search_path=''
as $$ declare recipient uuid; total integer:=0; begin
  for recipient in select user_id from public.notification_preferences where enabled loop
    total:=total+public.queue_quest_reminders_for(recipient);
  end loop;return total;
end $$;
revoke all on function public.queue_due_quest_reminders() from public,anon,authenticated;

-- Storage is private; each object's first two folders identify project and uploader.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('quest-project-files','quest-project-files',false,20971520,array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','application/pdf','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create or replace function public.can_access_quest_file(object_name text)
returns boolean language sql stable security definer set search_path=''
as $$ select case when split_part(object_name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then public.can_access_project(split_part(object_name,'/',1)::uuid) else false end; $$;
revoke all on function public.can_access_quest_file(text) from public,anon,authenticated;
grant execute on function public.can_access_quest_file(text) to authenticated;
drop policy if exists quest_file_read on storage.objects;
create policy quest_file_read on storage.objects for select to authenticated using(bucket_id='quest-project-files' and public.can_access_quest_file(name));
drop policy if exists quest_file_upload on storage.objects;
create policy quest_file_upload on storage.objects for insert to authenticated with check(bucket_id='quest-project-files' and public.can_access_quest_file(name) and split_part(name,'/',2)=auth.uid()::text);
drop policy if exists quest_file_delete on storage.objects;
create policy quest_file_delete on storage.objects for delete to authenticated using(bucket_id='quest-project-files' and public.can_access_quest_file(name) and (split_part(name,'/',2)=auth.uid()::text or public.access_admin()));
-- Restrictive guards also cover any permissive storage policies from other features.
drop policy if exists quest_file_scope_guard on storage.objects;
create policy quest_file_scope_guard on storage.objects as restrictive for all to authenticated
using(bucket_id<>'quest-project-files' or public.can_access_quest_file(name))
with check(bucket_id<>'quest-project-files' or public.can_access_quest_file(name));
drop policy if exists quest_file_write_guard on storage.objects;
create policy quest_file_write_guard on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'quest-project-files' or split_part(name,'/',2)=auth.uid()::text);
drop policy if exists quest_file_update_guard on storage.objects;
create policy quest_file_update_guard on storage.objects as restrictive for update to authenticated
using(bucket_id<>'quest-project-files') with check(bucket_id<>'quest-project-files');
drop policy if exists quest_file_owner_delete_guard on storage.objects;
create policy quest_file_owner_delete_guard on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'quest-project-files' or split_part(name,'/',2)=auth.uid()::text or public.access_admin());

drop policy if exists quest_file_anon_guard on storage.objects;
create policy quest_file_anon_guard on storage.objects as restrictive for all to anon using(bucket_id<>'quest-project-files') with check(bucket_id<>'quest-project-files');

create table if not exists public.project_files(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  name text not null check(char_length(btrim(name)) between 1 and 180),
  object_path text not null unique,
  mime_type text not null,
  size_bytes integer not null check(size_bytes between 1 and 20971520),
  moodboard boolean not null default false,
  created_at timestamptz not null default now(),
  check(split_part(object_path,'/',1)=project_id::text and split_part(object_path,'/',2)=created_by::text and length(split_part(object_path,'/',3))>0),
  check(not moodboard or mime_type in ('image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif'))
);
create index if not exists project_files_project_date_idx on public.project_files(project_id,created_at desc);
alter table public.project_files enable row level security;
revoke all on public.project_files from public,anon,authenticated;
grant select,insert,delete on public.project_files to authenticated;
drop policy if exists accessible_files on public.project_files;
create policy accessible_files on public.project_files for select to authenticated using(public.can_access_project(project_id));
drop policy if exists own_upload on public.project_files;
create policy own_upload on public.project_files for insert to authenticated with check(public.can_access_project(project_id) and created_by=auth.uid());
drop policy if exists own_file_delete on public.project_files;
create policy own_file_delete on public.project_files for delete to authenticated using(public.can_access_project(project_id) and (created_by=auth.uid() or public.access_admin()));
drop policy if exists file_scope_guard on public.project_files;
create policy file_scope_guard on public.project_files as restrictive for all to authenticated using(public.can_access_project(project_id)) with check(public.can_access_project(project_id));

drop policy if exists file_sender_guard on public.project_files;
create policy file_sender_guard on public.project_files as restrictive for insert to authenticated with check(created_by=auth.uid());
drop policy if exists file_delete_guard on public.project_files;
create policy file_delete_guard on public.project_files as restrictive for delete to authenticated using(created_by=auth.uid() or public.access_admin());

create table if not exists public.project_activity(
  id uuid primary key default gen_random_uuid(),project_id uuid,
  actor_id uuid,actor_name text not null,source_table text not null,source_id uuid not null,
  action text not null check(action in ('INSERT','UPDATE','DELETE')),item_title text not null,
  created_at timestamptz not null default now()
);
create index if not exists project_activity_project_date_idx on public.project_activity(project_id,created_at desc);
alter table public.project_activity enable row level security;
revoke all on public.project_activity from public,anon,authenticated;
grant select on public.project_activity to authenticated;
drop policy if exists activity_scope on public.project_activity;
create policy activity_scope on public.project_activity for select to authenticated using(public.can_access_project(project_id));
drop policy if exists activity_scope_guard on public.project_activity;
create policy activity_scope_guard on public.project_activity as restrictive for all to authenticated using(public.can_access_project(project_id));
create or replace function public.capture_quest_project_activity()
returns trigger language plpgsql security definer set search_path=''
as $$ declare item jsonb; actor uuid:=auth.uid(); label text; pid uuid; title text; begin
  if TG_OP='UPDATE' and to_jsonb(NEW)=to_jsonb(OLD) then return null; end if;
  item:=case when TG_OP='DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  if actor is null then label:='Team admin';else select display_name into label from public.team_members where user_id=actor;if label is null then return null;end if;end if;
  pid:=case when TG_TABLE_NAME='projects' then (item->>'id')::uuid else coalesce(item->>'project_id',item->>'access_project_id')::uuid end;
  title:=left(coalesce(item->>'title',item->>'name','Project item'),240);
  insert into public.project_activity(project_id,actor_id,actor_name,source_table,source_id,action,item_title)
  values(pid,actor,label,TG_TABLE_NAME,(item->>'id')::uuid,TG_OP,title);
  if TG_TABLE_NAME='project_files' then
    insert into public.team_notifications(recipient_id,actor_id,actor_name,source_table,source_id,action,item_title,project_id,access_scope)
    select m.user_id,actor,label,'project_files',item->>'id',TG_OP,title,pid,'project' from public.team_members m
    where (actor is null or m.user_id<>actor) and public.project_access_for(m.user_id,pid);
  end if;
  return null;
end $$;
revoke all on function public.capture_quest_project_activity() from public,anon,authenticated;
do $$ declare tab text;begin
  foreach tab in array array['projects','tasks','calendar_events','goals','project_notes','project_files','brand_moodboard_items'] loop
    execute format('drop trigger if exists quest_activity on public.%I',tab);
    execute format('create trigger quest_activity after insert or update or delete on public.%I for each row execute function public.capture_quest_project_activity()',tab);
  end loop;
end $$;

-- Invoker rights keep every source table's RLS, including private-room membership.
create or replace function public.search_quest(search_text text)
returns table(kind text,item_id uuid,project_id uuid,room_id uuid,title text,snippet text,occurred_at timestamptz)
language sql stable security invoker set search_path=''
as $$
  select * from (
    select 'project'::text,p.id,p.id as project_id,null::uuid as room_id,p.name as title,left(p.client,160) as snippet,p.created_at from public.projects p where strpos(lower(p.name||' '||p.client),lower(btrim(search_text)))>0
    union all select 'task',t.id,t.project_id,null,t.title,left(t.status,160),t.created_at from public.tasks t where strpos(lower(t.title),lower(btrim(search_text)))>0
    union all select 'event',e.id,e.project_id,null,e.title,left(e.event_date::text||' '||e.detail,160),e.created_at from public.calendar_events e where strpos(lower(e.title||' '||e.detail),lower(btrim(search_text)))>0
    union all select 'note',n.id,n.project_id,null,n.title,left(n.body,160),n.created_at from public.project_notes n where strpos(lower(n.title||' '||n.body),lower(btrim(search_text)))>0
    union all select 'message',m.id,null,null,'Team chat',left(m.body,160),m.created_at from public.discussion_messages m where strpos(lower(m.body),lower(btrim(search_text)))>0
    union all select 'brand_message',m.id,m.project_id,null,'Brand chat',left(m.body,160),m.created_at from public.brand_messages m where strpos(lower(m.body),lower(btrim(search_text)))>0
    union all select 'private_message',m.id,r.project_id,m.room_id,'Private conversation',left(m.body,160),m.created_at from public.private_chat_messages m join public.private_chat_rooms r on r.id=m.room_id where strpos(lower(m.body),lower(btrim(search_text)))>0
    union all select 'file',f.id,f.project_id,null,f.name,f.mime_type,f.created_at from public.project_files f where strpos(lower(f.name),lower(btrim(search_text)))>0
  ) results where public.is_team_member() and char_length(btrim(search_text)) between 2 and 100
  order by created_at desc,id limit 50;
$$;
revoke all on function public.search_quest(text) from public,anon,authenticated;
grant execute on function public.search_quest(text) to authenticated;

-- Optional background checks when pg_cron is already installed. No email is sent.
insert into public.notification_preferences(user_id) select user_id from public.team_members on conflict do nothing;
do $$ begin
  if to_regnamespace('cron') is not null then
    if to_regprocedure('cron.schedule(text,text,text)') is not null then
      begin
        execute 'select cron.schedule(''quest-in-app-reminders'',''*/5 * * * *'',''select public.queue_due_quest_reminders();'')';
      exception when insufficient_privilege then
        raise notice 'Background reminder scheduling needs administrator setup. Reminders will still be checked when members open Quest.';
      end;
    end if;
  end if;
end $$;

insert into public.quest_schema_migrations(version) values('20261021_daily_workflow') on conflict do nothing;
notify pgrst,'reload schema';
commit;

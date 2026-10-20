-- Project permissions and server-timed presence. Run after the existing studio,
-- project-workspace and notification migrations. Safe to rerun.
begin;
alter table public.projects add column if not exists access_restricted boolean not null default false;

-- Legacy external notification handlers may bypass RLS with a service key.
-- Pause database HTTP hooks until their recipients are permission-aware. This
-- leaves the scoped in-app notification trigger running and stores no secrets.
create table if not exists public.paused_notification_hooks (
  table_name text not null,trigger_name text not null,paused_at timestamptz not null default now(),
  primary key(table_name,trigger_name)
);
alter table public.paused_notification_hooks enable row level security;
revoke all on public.paused_notification_hooks from public,anon,authenticated;
do $$ declare hook record; begin
  for hook in select c.relname as table_name,t.tgname as trigger_name
    from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace join pg_catalog.pg_proc p on p.oid=t.tgfoid
    where n.nspname='public' and not t.tgisinternal and t.tgenabled<>'D'
    and c.relname=any(array['projects','tasks','expenses','goals','calendar_events','project_notes','brand_messages','brand_moodboard_items','discussion_messages','team_settings','team_members','team_notifications'])
    and (p.proname='http_request' or pg_catalog.pg_get_functiondef(p.oid) ~* '(net[.]http_post|notify-team)')
  loop
    execute format('alter table public.%I disable trigger %I',hook.table_name,hook.trigger_name);
    insert into public.paused_notification_hooks(table_name,trigger_name) values(hook.table_name,hook.trigger_name) on conflict do nothing;
  end loop;
end $$;

create table if not exists public.member_access (
  user_id uuid primary key references public.team_members(user_id) on delete cascade,
  is_admin boolean not null default false,
  project_mode text not null default 'selected' check(project_mode in ('all','selected')),
  shared_access boolean not null default false
);
create table if not exists public.project_member_access (
  user_id uuid not null references public.team_members(user_id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  allowed boolean not null,
  primary key(user_id,project_id)
);
-- Access is assigned explicitly by the owner; unknown members fail closed.
insert into public.member_access(user_id)
select user_id from public.team_members on conflict(user_id) do nothing;
alter table public.member_access enable row level security;
alter table public.project_member_access enable row level security;
revoke all on public.member_access,public.project_member_access from public,anon,authenticated;

create or replace function public.access_admin()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.member_access a join public.team_members m using(user_id)
  where a.user_id=auth.uid() and a.is_admin); $$;
create or replace function public.shared_access_for(member_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.member_access a join public.team_members m using(user_id)
  where a.user_id=member_id and (a.is_admin or a.shared_access)); $$;
create or replace function public.project_access_for(member_id uuid,project uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.member_access a join public.team_members m using(user_id)
  where a.user_id=member_id and (a.is_admin or (exists(select 1 from public.projects p where p.id=project)
    and coalesce((select x.allowed from public.project_member_access x where x.user_id=member_id and x.project_id=project),
      a.project_mode='all' and not (select p.access_restricted from public.projects p where p.id=project))))); $$;
create or replace function public.can_access_project(project uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select case when project is null then public.shared_access_for(auth.uid())
  else public.project_access_for(auth.uid(),project) end; $$;
create or replace function public.can_create_project()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.member_access a join public.team_members m using(user_id)
  where a.user_id=auth.uid() and (a.is_admin or (a.project_mode='all' and a.shared_access))); $$;

create or replace function public.my_dashboard_access()
returns jsonb language sql stable security definer set search_path=''
as $$ select jsonb_build_object('ready',true,'is_admin',coalesce(a.is_admin,false),
  'shared_access',coalesce(a.is_admin or a.shared_access,false),
  'can_create_projects',coalesce(a.is_admin or (a.project_mode='all' and a.shared_access),false),
  'project_mode',coalesce(a.project_mode,'selected'))
  from public.team_members m left join public.member_access a using(user_id) where m.user_id=auth.uid(); $$;

create or replace function public.list_member_access()
returns jsonb language plpgsql stable security definer set search_path=''
as $$ begin
  if not public.access_admin() then raise exception 'Only the team owner can manage access.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',m.display_name,
    'is_admin',coalesce(a.is_admin,false),'project_mode',coalesce(a.project_mode,'selected'),
    'shared_access',coalesce(a.shared_access,false),'project_rules',coalesce((
      select jsonb_agg(jsonb_build_object('project_id',x.project_id,'allowed',x.allowed))
      from public.project_member_access x where x.user_id=m.user_id),'[]'::jsonb)) order by m.display_name),'[]'::jsonb)
    from public.team_members m left join public.member_access a using(user_id));
end $$;
create or replace function public.set_member_access(target uuid,mode text,shared boolean,allowed_projects uuid[])
returns void language plpgsql security definer set search_path=''
as $$ begin
  if not public.access_admin() then raise exception 'Only the team owner can manage access.'; end if;
  if target=auth.uid() or exists(select 1 from public.member_access where user_id=target and is_admin) then
    raise exception 'Owner access cannot be changed here.'; end if;
  if not exists(select 1 from public.team_members where user_id=target) then raise exception 'Member not found.'; end if;
  if mode not in ('all','selected') or mode is null or shared is null or allowed_projects is null then
    raise exception 'Choose a valid access mode and project list.'; end if;
  if exists(select 1 from unnest(allowed_projects) id where not exists(select 1 from public.projects p where p.id=id)) then
    raise exception 'A selected project no longer exists. Refresh and try again.'; end if;
  insert into public.member_access(user_id,project_mode,shared_access) values(target,mode,shared)
  on conflict(user_id) do update set project_mode=excluded.project_mode,shared_access=excluded.shared_access;
  delete from public.project_member_access where user_id=target;
  insert into public.project_member_access(user_id,project_id,allowed)
  select target,p.id,p.id=any(allowed_projects) from public.projects p
  where mode='all' or p.id=any(allowed_projects);
end $$;

-- Retain a record's scope if a deleted project would otherwise SET NULL its FK.
-- This prevents private project content from turning into shared team content.
create or replace function public.retain_record_access_scope()
returns trigger language plpgsql set search_path=''
as $$ begin
  if TG_OP='INSERT' then NEW.access_project_id:=NEW.project_id;
  else NEW.access_project_id:=coalesce(NEW.project_id,OLD.access_project_id,OLD.project_id); end if;
  return NEW;
end $$;
revoke all on function public.retain_record_access_scope() from public,anon,authenticated;
-- Restrictive guards are ANDed with every older permissive policy.
do $$ declare t text; begin
  foreach t in array array['tasks','expenses','goals','calendar_events','project_notes','brand_messages','brand_moodboard_items'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table public.%I add column if not exists access_project_id uuid',t);
    execute format('update public.%I set access_project_id=project_id where access_project_id is null and project_id is not null',t);
    execute format('drop trigger if exists retain_record_access_scope on public.%I',t);
    execute format('create trigger retain_record_access_scope before insert or update on public.%I for each row execute function public.retain_record_access_scope()',t);
    execute format('drop policy if exists project_access_guard on public.%I',t);
    execute format('create policy project_access_guard on public.%I as restrictive for all to authenticated using(public.can_access_project(coalesce(project_id,access_project_id))) with check(public.can_access_project(coalesce(project_id,access_project_id)))',t);
  end loop;
end $$;
drop policy if exists project_read_guard on public.projects;
create policy project_read_guard on public.projects as restrictive for select to authenticated using(public.can_access_project(id));
drop policy if exists project_update_guard on public.projects;
create policy project_update_guard on public.projects as restrictive for update to authenticated
  using(public.can_access_project(id)) with check(public.can_access_project(id));
drop policy if exists project_insert_guard on public.projects;
create policy project_insert_guard on public.projects as restrictive for insert to authenticated with check(public.can_create_project());
drop policy if exists project_delete_guard on public.projects;
create policy project_delete_guard on public.projects as restrictive for delete to authenticated using(public.access_admin());
-- Only the owner may change a project's privacy flag, regardless of column grants.
create or replace function public.guard_project_privacy()
returns trigger language plpgsql security definer set search_path=''
as $$ begin
  if auth.uid() is not null and not public.access_admin() and
    ((TG_OP='INSERT' and NEW.access_restricted) or (TG_OP='UPDATE' and NEW.access_restricted is distinct from OLD.access_restricted)) then
    raise exception 'Only the owner can change project privacy.';
  end if;
  return NEW;
end $$;
drop trigger if exists guard_project_privacy on public.projects;
create trigger guard_project_privacy before insert or update on public.projects for each row execute function public.guard_project_privacy();
do $$ declare t text; begin
  foreach t in array array['discussion_messages','team_settings'] loop
    execute format('drop policy if exists shared_access_guard on public.%I',t);
    execute format('create policy shared_access_guard on public.%I as restrictive for all to authenticated using(public.can_access_project(null)) with check(public.can_access_project(null))',t);
  end loop;
end $$;

-- Existing notification snapshots must also respect access, including old inbox rows.
alter table public.team_notifications add column if not exists project_id uuid;
alter table public.team_notifications add column if not exists access_scope text not null default 'admin'
  check(access_scope in ('project','shared','admin'));
do $$ declare t text; begin
  foreach t in array array['projects','tasks','expenses','goals','calendar_events','project_notes','brand_messages','brand_moodboard_items'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('update public.team_notifications n set project_id=%s,access_scope=case when %s is null then ''shared'' else ''project'' end from public.%I x where n.source_table=%L and n.source_id=x.id::text',
      case when t='projects' then 'x.id' else 'coalesce(x.project_id,x.access_project_id)' end,case when t='projects' then 'x.id' else 'coalesce(x.project_id,x.access_project_id)' end,t,t);
  end loop;
end $$;
update public.team_notifications set access_scope='shared' where source_table in ('discussion_messages','team_settings','team_members');
drop policy if exists notification_access_guard on public.team_notifications;
create policy notification_access_guard on public.team_notifications as restrictive for all to authenticated
using(case access_scope when 'project' then public.can_access_project(project_id) when 'shared' then public.can_access_project(null) else public.access_admin() end)
with check(case access_scope when 'project' then public.can_access_project(project_id) when 'shared' then public.can_access_project(null) else public.access_admin() end);
create or replace function public.capture_team_notification()
returns trigger language plpgsql security definer set search_path=''
as $$ declare item jsonb; actor uuid:=auth.uid(); actor_label text; title text; pid uuid; scope text; begin
  if TG_OP='UPDATE' and to_jsonb(NEW)=to_jsonb(OLD) then return NEW; end if;
  item:=case when TG_OP='DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  if actor is null then actor_label:='Team admin'; else
    select display_name into actor_label from public.team_members where user_id=actor;
    if actor_label is null then return null; end if;
  end if;
  pid:=case when TG_TABLE_NAME='projects' then (item->>'id')::uuid else coalesce(item->>'project_id',item->>'access_project_id')::uuid end;
  scope:=case when pid is not null then 'project' else 'shared' end;
  title:=case TG_TABLE_NAME when 'projects' then item->>'name' when 'discussion_messages' then 'Team discussion'
    when 'brand_messages' then 'Brand chat' when 'team_settings' then 'Team budget'
    when 'team_members' then item->>'display_name' else item->>'title' end;
  insert into public.team_notifications(recipient_id,actor_id,actor_name,source_table,source_id,action,item_title,event_date,project_id,access_scope)
  select m.user_id,actor,actor_label,TG_TABLE_NAME,coalesce(item->>'id',item->>'user_id','settings'),TG_OP,
    left(coalesce(title,'Team item'),240),case when TG_TABLE_NAME='calendar_events' then (item->>'event_date')::date end,pid,scope
  from public.team_members m where (actor is null or m.user_id<>actor) and
    case when pid is null then public.shared_access_for(m.user_id) else public.project_access_for(m.user_id,pid) end;
  return null;
end $$;

-- Online means at least one browser has contacted the server in the last 90s.
-- Server timestamps and auth.uid() prevent impersonating another member.
create table if not exists public.member_presence (
  user_id uuid not null references public.team_members(user_id) on delete cascade,
  session_id uuid not null,
  last_seen timestamptz not null default now(),
  primary key(user_id,session_id)
);
alter table public.member_presence enable row level security;
revoke all on public.member_presence from public,anon,authenticated;
create or replace function public.touch_member_presence(session_key uuid)
returns void language plpgsql security definer set search_path=''
as $$ begin
  if not public.is_team_member() or session_key is null then raise exception 'Team access required.'; end if;
  delete from public.member_presence where last_seen<now()-interval '1 day';
  insert into public.member_presence(user_id,session_id,last_seen) values(auth.uid(),session_key,now())
    on conflict(user_id,session_id) do update set last_seen=excluded.last_seen;
end $$;
create or replace function public.leave_member_presence(session_key uuid)
returns void language sql security definer set search_path=''
as $$ delete from public.member_presence where user_id=auth.uid() and session_id=session_key; $$;
create or replace function public.team_online_members()
returns table(user_id uuid,display_name text,online boolean)
language sql stable security definer set search_path=''
as $$ select m.user_id,m.display_name,exists(select 1 from public.member_presence p where p.user_id=m.user_id and p.last_seen>now()-interval '90 seconds')
  from public.team_members m where public.is_team_member() order by m.display_name; $$;

revoke all on function public.access_admin(),public.shared_access_for(uuid),public.project_access_for(uuid,uuid),
 public.can_access_project(uuid),public.can_create_project(),public.my_dashboard_access(),public.list_member_access(),
 public.set_member_access(uuid,text,boolean,uuid[]),public.guard_project_privacy(),public.capture_team_notification(),
 public.touch_member_presence(uuid),public.leave_member_presence(uuid),public.team_online_members() from public,anon,authenticated;
grant execute on function public.access_admin(),public.can_access_project(uuid),public.can_create_project(),
 public.my_dashboard_access(),public.list_member_access(),public.set_member_access(uuid,text,boolean,uuid[]),
 public.touch_member_presence(uuid),public.leave_member_presence(uuid),public.team_online_members() to authenticated;
commit;

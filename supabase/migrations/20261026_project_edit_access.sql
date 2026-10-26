-- Run as postgres after member-access.sql. Existing members retain their access.
begin;
alter table public.member_access add column if not exists editable_project_ids uuid[];
comment on column public.member_access.editable_project_ids is
  'NULL: edit any accessible project. An array: edit only those projects; project read access is still required.';

create or replace function public.can_edit_project(project uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.member_access a join public.team_members m using(user_id)
  where a.user_id=auth.uid() and (a.is_admin or
    (public.can_access_project(project) and (project is null or a.editable_project_ids is null or project=any(a.editable_project_ids))))); $$;
revoke all on function public.can_edit_project(uuid) from public,anon,authenticated;
grant execute on function public.can_edit_project(uuid) to authenticated;

create or replace function public.my_dashboard_access()
returns jsonb language sql stable security definer set search_path=''
as $$ select jsonb_build_object('ready',true,'is_admin',coalesce(a.is_admin,false),
  'shared_access',coalesce(a.is_admin or a.shared_access,false),
  'can_create_projects',coalesce(a.is_admin or (a.project_mode='all' and a.shared_access and a.editable_project_ids is null),false),
  'project_mode',coalesce(a.project_mode,'selected'),'access_levels_ready',true,
  'editable_project_ids',case when a.is_admin then null else to_jsonb(a.editable_project_ids) end)
  from public.team_members m left join public.member_access a using(user_id) where m.user_id=auth.uid(); $$;

create or replace function public.can_create_project()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.member_access a join public.team_members m using(user_id)
  where a.user_id=auth.uid() and (a.is_admin or (a.project_mode='all' and a.shared_access and a.editable_project_ids is null))); $$;

create or replace function public.list_member_access()
returns jsonb language plpgsql stable security definer set search_path=''
as $$ begin
  if not public.access_admin() then raise exception 'Only the team owner can manage access.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',m.display_name,
    'is_admin',coalesce(a.is_admin,false),'project_mode',coalesce(a.project_mode,'selected'),
    'shared_access',coalesce(a.shared_access,false),'editable_project_ids',to_jsonb(a.editable_project_ids),
    'project_rules',coalesce((select jsonb_agg(jsonb_build_object('project_id',x.project_id,'allowed',x.allowed))
      from public.project_member_access x where x.user_id=m.user_id),'[]'::jsonb)) order by m.display_name),'[]'::jsonb)
    from public.team_members m left join public.member_access a using(user_id));
end $$;

-- One transaction for read and edit scopes. Older clients cannot reset edit limits.
create or replace function public.set_member_access_levels(target uuid,mode text,shared boolean,allowed_projects uuid[],editable_projects uuid[])
returns void language plpgsql security definer set search_path=''
as $$ begin
  perform public.set_member_access(target,mode,shared,allowed_projects);
  if editable_projects is not null and exists(select 1 from unnest(editable_projects) p
    where p is null or not public.project_access_for(target,p)) then
    raise exception 'Editing requires viewing access to each selected project.';
  end if;
  update public.member_access set editable_project_ids=editable_projects where user_id=target;
end $$;
revoke all on function public.set_member_access_levels(uuid,text,boolean,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.set_member_access_levels(uuid,text,boolean,uuid[],uuid[]) to authenticated;

-- Restrictive write guards are ANDed with all existing creator/project policies.
-- Both old and new scopes must allow edits when moving an item between projects.
do $write_guards$ declare tab text; scope text; begin
  foreach tab in array array['projects','tasks','expenses','goals','calendar_events','project_notes','brand_messages','brand_moodboard_items','project_files','fragile_catalog_items','fragile_catalog_assets'] loop
    if to_regclass('public.'||tab) is null then continue; end if;
    execute format('alter table public.%I enable row level security',tab);
    scope:=case when tab='projects' then 'id' when exists(select 1 from information_schema.columns
      where table_schema='public' and table_name=tab and column_name='access_project_id')
      then 'coalesce(project_id,access_project_id)' else 'project_id' end;
    execute format('drop policy if exists project_edit_insert_guard on public.%I',tab);
    execute format('drop policy if exists project_edit_update_guard on public.%I',tab);
    execute format('drop policy if exists project_edit_delete_guard on public.%I',tab);
    execute format('create policy project_edit_insert_guard on public.%I as restrictive for insert to authenticated with check(public.%s)',
      tab,case when tab='projects' then 'can_create_project()' else format('can_edit_project(%s)',scope) end);
    execute format('create policy project_edit_update_guard on public.%I as restrictive for update to authenticated using(public.can_edit_project(%s)) with check(public.can_edit_project(%s))',tab,scope,scope);
    execute format('create policy project_edit_delete_guard on public.%I as restrictive for delete to authenticated using(public.can_edit_project(%s))',tab,scope);
  end loop;
end $write_guards$;

-- Invite-only rooms retain their independent membership requirement.
create or replace function public.can_edit_private_chat(room uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.private_chat_rooms r where r.id=room
  and public.can_access_private_chat(r.id) and public.can_edit_project(r.project_id)); $$;
revoke all on function public.can_edit_private_chat(uuid) from public,anon,authenticated;
grant execute on function public.can_edit_private_chat(uuid) to authenticated;
drop policy if exists private_chat_edit_insert_guard on public.private_chat_messages;
create policy private_chat_edit_insert_guard on public.private_chat_messages as restrictive for insert to authenticated with check(public.can_edit_private_chat(room_id));
drop policy if exists private_chat_edit_update_guard on public.private_chat_messages;
create policy private_chat_edit_update_guard on public.private_chat_messages as restrictive for update to authenticated using(public.can_edit_private_chat(room_id)) with check(public.can_edit_private_chat(room_id));
drop policy if exists private_chat_edit_delete_guard on public.private_chat_messages;
create policy private_chat_edit_delete_guard on public.private_chat_messages as restrictive for delete to authenticated using(public.can_edit_private_chat(room_id));

create or replace function public.can_edit_quest_object(bucket text,object_name text)
returns boolean language sql stable security definer set search_path=''
as $$ select case
  when bucket='quest-project-files' then case when split_part(object_name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.can_edit_project(split_part(object_name,'/',1)::uuid) else false end
  when bucket='fragile-assets' then case when split_part(object_name,'/',1)='catalogue' and split_part(object_name,'/',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.can_edit_project(split_part(object_name,'/',2)::uuid) else public.access_admin() end
  else true end; $$;
revoke all on function public.can_edit_quest_object(text,text) from public,anon,authenticated;
grant execute on function public.can_edit_quest_object(text,text) to authenticated;
drop policy if exists quest_object_edit_insert_guard on storage.objects;
create policy quest_object_edit_insert_guard on storage.objects as restrictive for insert to authenticated with check(public.can_edit_quest_object(bucket_id,name));
drop policy if exists quest_object_edit_update_guard on storage.objects;
create policy quest_object_edit_update_guard on storage.objects as restrictive for update to authenticated using(public.can_edit_quest_object(bucket_id,name)) with check(public.can_edit_quest_object(bucket_id,name));
drop policy if exists quest_object_edit_delete_guard on storage.objects;
create policy quest_object_edit_delete_guard on storage.objects as restrictive for delete to authenticated using(public.can_edit_quest_object(bucket_id,name));

notify pgrst,'reload schema';
commit;

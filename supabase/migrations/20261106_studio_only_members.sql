-- Hidden studio members retain their account and work, outside the team directory.
begin;
alter table public.member_access add column if not exists directory_hidden boolean not null default false;
alter table public.member_access add column if not exists studio_only_project_id uuid references public.projects(id);
alter table public.member_access add column if not exists studio_display_name text;
alter table public.private_chat_rooms add column if not exists archived boolean not null default false;
create or replace function public.directory_member_visible(member_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.team_members m left join public.member_access a using(user_id) where m.user_id=member_id and not coalesce(a.directory_hidden,false)); $$;
revoke all on function public.directory_member_visible(uuid) from public,anon,authenticated;
grant execute on function public.directory_member_visible(uuid) to authenticated;
drop policy if exists directory_visibility_guard on public.team_members;
create policy directory_visibility_guard on public.team_members as restrictive for select to authenticated using(public.directory_member_visible(user_id));


create or replace function public.shared_access_for(member_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.member_access a join public.team_members m using(user_id)
  where a.user_id=member_id and (a.is_admin or (not a.personal_only and a.studio_only_project_id is null and a.shared_access))); $$;


create or replace function public.project_access_for(member_id uuid,project uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.member_access a join public.team_members m using(user_id)
  where a.user_id=member_id and (a.is_admin or (not a.personal_only and (a.studio_only_project_id is null or a.studio_only_project_id=project) and exists(select 1 from public.projects p where p.id=project)
    and coalesce((select x.allowed from public.project_member_access x where x.user_id=member_id and x.project_id=project),
      a.project_mode='all' and not (select p.access_restricted from public.projects p where p.id=project))))); $$;


create or replace function public.can_create_project()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.member_access a join public.team_members m using(user_id)
  where a.user_id=auth.uid() and (a.is_admin or (not a.personal_only and a.studio_only_project_id is null and a.project_mode='all' and a.shared_access and a.editable_project_ids is null))); $$;


create or replace function public.my_dashboard_access()
returns jsonb language sql stable security definer set search_path=''
as $$ select jsonb_build_object('ready',true,'is_admin',coalesce(a.is_admin,false),
  'personal_only',coalesce(a.personal_only,false),'personal_workspace_ready',true,
  'studio_only_project_id',a.studio_only_project_id,'directory_hidden',coalesce(a.directory_hidden,false),'shared_access',public.shared_access_for(auth.uid()),
  'can_create_projects',public.can_create_project(),
  'project_mode',case when a.personal_only then 'selected' else coalesce(a.project_mode,'selected') end,'access_levels_ready',true,
  'editable_project_ids',case when a.personal_only then '[]'::jsonb when a.is_admin then null else to_jsonb(a.editable_project_ids) end)
  from public.team_members m left join public.member_access a using(user_id) where m.user_id=auth.uid(); $$;


create or replace function public.list_member_access()
returns jsonb language plpgsql stable security definer set search_path=''
as $$ begin
  if not public.access_admin() then raise exception 'Only the team owner can manage access.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',m.display_name,
    'is_admin',coalesce(a.is_admin,false),'personal_only',coalesce(a.personal_only,false),'project_mode',coalesce(a.project_mode,'selected'),
    'shared_access',coalesce(a.shared_access,false),'editable_project_ids',to_jsonb(a.editable_project_ids),
    'project_rules',coalesce((select jsonb_agg(jsonb_build_object('project_id',x.project_id,'allowed',x.allowed))
      from public.project_member_access x where x.user_id=m.user_id),'[]'::jsonb)) order by m.display_name),'[]'::jsonb)
    from public.team_members m left join public.member_access a using(user_id) where not coalesce(a.directory_hidden,false));
end $$;


create or replace function public.team_online_members()
returns table(user_id uuid,display_name text,online boolean)
language sql stable security definer set search_path=''
as $$ select m.user_id,m.display_name,exists(select 1 from public.member_presence p where p.user_id=m.user_id and p.last_seen>now()-interval '90 seconds')
  from public.team_members m where public.access_admin() and public.directory_member_visible(m.user_id) order by m.display_name; $$;


create or replace function public.private_chat_access_for(member_id uuid,chat_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.private_chat_rooms r join public.private_chat_members m on m.room_id=r.id
 join public.team_members t on t.user_id=m.user_id join public.member_access a on a.user_id=m.user_id
 where r.id=chat_id and not r.archived and a.studio_only_project_id is null and m.user_id=member_id and case r.room_kind
 when 'direct' then member_id=r.personal_owner_id or (member_id=r.created_by and a.is_admin)
 when 'personal' then public.personal_workspace_for(r.personal_owner_id) and
  (member_id=r.personal_owner_id or (member_id=r.created_by and a.is_admin))
 else not a.personal_only and public.project_access_for(member_id,r.project_id) end); $$;


create or replace function public.studio_member_names(target_project uuid)
returns table(user_id uuid,display_name text) language sql stable security definer set search_path=''
as $$ select a.user_id,a.studio_display_name from public.member_access a join public.team_members m using(user_id)
 where public.can_access_project(target_project) and a.studio_only_project_id=target_project and a.directory_hidden and a.studio_display_name is not null; $$;
revoke all on function public.studio_member_names(uuid) from public,anon,authenticated;
grant execute on function public.studio_member_names(uuid) to authenticated;
notify pgrst,'reload schema';
commit;

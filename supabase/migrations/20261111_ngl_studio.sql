-- Project-scoped member names for the NGL studio.
begin;


create or replace function public.ngl_studio_members(target_project uuid)
returns table(user_id uuid,display_name text) language sql stable security definer set search_path=''
as $$ select m.user_id,m.display_name from public.team_members m join public.member_access a using(user_id)
 where public.can_access_project(target_project)
 and exists(select 1 from public.projects p where p.id=target_project and lower(btrim(p.name))='ngl')
 and public.project_access_for(m.user_id,target_project) order by m.display_name; $$;
revoke all on function public.ngl_studio_members(uuid) from public,anon,authenticated;
grant execute on function public.ngl_studio_members(uuid) to authenticated;
notify pgrst,'reload schema';
commit;

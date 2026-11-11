import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export async function prepareNglStudio(){
 const schema=(await Promise.all(['20261106_studio_only_members.sql','20261111_ngl_studio.sql'].map(file=>readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8')))).join('\n').replace(/^(?:begin;|commit;)\s*$/gm,'');
 return `-- Copy the ENTIRE query into a new Supabase query, as postgres.
rollback;
reset role;
begin;
${schema}
do $ngl$
declare member_id uuid; ngl_id uuid; matches integer;
begin
 select count(*) into matches from public.team_members m join public.member_access a using(user_id)
 where lower(btrim(m.display_name))='tertius' and not a.is_admin;
 if matches<>1 then raise exception 'Expected exactly one existing member named Tertius. No NGL changes were saved.'; end if;
 select m.user_id into member_id from public.team_members m join public.member_access a using(user_id)
 where lower(btrim(m.display_name))='tertius' and not a.is_admin;
 if exists(select 1 from public.member_access where user_id=member_id and (personal_only or studio_only_project_id is not null)) then
  raise exception 'Tertius has a restricted personal or studio-only account. Review his access before adding NGL.';
 end if;
 select count(*) into matches from public.projects where lower(btrim(name))='ngl';
 if matches>1 then raise exception 'More than one NGL project was found. No changes were saved.'; end if;
 select id into ngl_id from public.projects where lower(btrim(name))='ngl';
 if ngl_id is null then
  insert into public.projects(name,client,access_restricted) values('NGL','Social media team',true) returning id into ngl_id;
 else
  update public.projects set access_restricted=true where id=ngl_id;
 end if;
 -- Explicit denials prevent an older all-projects setting from exposing this team.
 delete from public.project_member_access where project_member_access.project_id=ngl_id;
 insert into public.project_member_access(user_id,project_id,allowed)
 select a.user_id,ngl_id,a.is_admin or a.user_id=member_id from public.member_access a join public.team_members m using(user_id);
 update public.member_access set editable_project_ids=case when editable_project_ids is null then null
  else array(select distinct x from unnest(editable_project_ids||array[ngl_id]) x) end where user_id=member_id;
end $ngl$;
commit;
select p.name as studio,m.display_name as permitted_member,(a.is_admin or a.editable_project_ids is null or p.id=any(a.editable_project_ids)) as can_edit
from public.projects p join public.team_members m on public.project_access_for(m.user_id,p.id) join public.member_access a using(user_id)
where lower(btrim(p.name))='ngl' order by m.display_name;
-- END NGL STUDIO SETUP
`;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await writeFile(process.argv[2]||'/workspace/outputs/Quest-NGL-Studio.sql',await prepareNglStudio());console.log('Prepared NGL studio setup.');}

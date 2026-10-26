import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
export async function prepareMemberEnrollment({email,userId,displayName=null,editProjects},destination=null){
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))throw new Error('An exact email and account UUID are required.');
  if(!Array.isArray(editProjects)||!editProjects.length||editProjects.some(x=>typeof x!=='string'||!x.trim()))throw new Error('Name the projects this member may edit.');
  const migration=await readFile(new URL('../supabase/migrations/20261026_project_edit_access.sql',import.meta.url),'utf8');
  const sql=`-- Quest member enrollment. Copy this ENTIRE file into a new SQL Editor query.
-- Adds one existing Auth account; preserves every other member and private chat.
rollback;
reset role;
begin;
do $preflight$ begin
  if current_user <> 'postgres' then raise exception 'Choose the postgres role in SQL Editor, then run the complete query.'; end if;
  if not exists(select 1 from auth.users where id=${literal(userId)}::uuid and lower(btrim(email))=${literal(email.toLowerCase())}) then
    raise exception 'The email and account ID do not match an Auth user in this project. Check Authentication > Users.';
  end if;
end $preflight$;
${migration.replace(/^(?:begin;|commit;)\s*$/gm,'')}
do $enroll$ declare member_id uuid:=${literal(userId)}; editable uuid[]; label text; project_name text; project_id uuid; begin
  if exists(select 1 from public.member_access where user_id=member_id and is_admin) then
    raise exception 'This account is an owner; ordinary-member enrollment cannot change it.';
  end if;
  editable:='{}'::uuid[];
  foreach project_name in array array[${editProjects.map(literal).join(',')}] loop
    select id into project_id from public.projects where lower(btrim(name))=lower(btrim(project_name));
    if project_id is null then raise exception 'Project % was not found. No membership changes were saved.',project_name; end if;
    editable:=array_append(editable,project_id);
  end loop;
  select coalesce(${displayName?literal(displayName):'null'},nullif(btrim(raw_user_meta_data->>'display_name'),''),
    nullif(btrim(raw_user_meta_data->>'full_name'),''),nullif(btrim(raw_user_meta_data->>'name'),''),email)
    into label from auth.users where id=member_id;
  insert into public.team_members(user_id,display_name) values(member_id,left(label,80))
    on conflict(user_id) do nothing;
  insert into public.member_access(user_id,is_admin,project_mode,shared_access,editable_project_ids)
    values(member_id,false,'selected',false,editable)
    on conflict(user_id) do update set project_mode='selected',shared_access=false,editable_project_ids=excluded.editable_project_ids;
  delete from public.project_member_access where user_id=member_id;
  -- View all existing projects, including explicitly granted private projects.
  -- Future projects require a new owner assignment.
  insert into public.project_member_access(user_id,project_id,allowed)
    select member_id,id,true from public.projects;
end $enroll$;
notify pgrst,'reload schema';
commit;
select m.display_name,u.email,p.name as project,
  case when p.id=any(a.editable_project_ids) then 'Can edit' else 'View only' end as access
from public.team_members m join auth.users u on u.id=m.user_id
join public.member_access a on a.user_id=m.user_id
join public.project_member_access x on x.user_id=m.user_id and x.allowed
join public.projects p on p.id=x.project_id
where m.user_id=${literal(userId)}::uuid order by p.name;
-- END QUEST MEMBER ENROLLMENT
`;
  if(destination){await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,sql);}
  return sql;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [email,userId,project,destination]=process.argv.slice(2);
  if(!destination)throw new Error('Usage: node scripts/prepare-member-enrollment.mjs EMAIL ACCOUNT_UUID EDIT_PROJECT OUTPUT.sql');
  await prepareMemberEnrollment({email,userId,editProjects:[project]},destination);
  console.log('Prepared the member enrollment SQL. Run it as postgres in the Quest Supabase project.');
}

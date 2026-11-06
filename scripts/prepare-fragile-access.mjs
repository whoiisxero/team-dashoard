import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export async function prepareFragileAccess(){
 const migration=(await readFile(new URL('../supabase/migrations/20261106_studio_only_members.sql',import.meta.url),'utf8')).replace(/^(?:begin;|commit;)\s*$/gm,'');
 return `-- Keep the existing account and Fragile work; hide this member outside Fragile.
rollback;
reset role;
begin;
${migration}
do $scope$ declare target uuid; fragile uuid; matches integer; begin
 select m.user_id into target from public.team_members m where m.user_id='5c9e7be8-1956-47aa-8449-d482851edac9'::uuid;
 if target is null then
  select count(*) into matches from public.team_members m join public.member_access a using(user_id) where lower(btrim(m.display_name))='jen' or (a.directory_hidden and a.studio_display_name='Jen');
  if matches<>1 then raise exception 'The intended member could not be identified uniquely. No changes were saved.'; end if;
  select m.user_id into target from public.team_members m join public.member_access a using(user_id) where lower(btrim(m.display_name))='jen' or (a.directory_hidden and a.studio_display_name='Jen');
 end if;
 if exists(select 1 from public.member_access where user_id=target and is_admin) then raise exception 'Owner accounts cannot be restricted by this setup.'; end if;
 select count(*) into matches from public.projects where lower(btrim(name)) in ('fragile','fragile.');
 if matches<>1 then raise exception 'Expected exactly one Fragile project. No changes were saved.'; end if;
 select id into fragile from public.projects where lower(btrim(name)) in ('fragile','fragile.');
 update public.member_access set directory_hidden=true,studio_only_project_id=fragile,studio_display_name='Jen',personal_only=false,project_mode='selected',shared_access=false,editable_project_ids=array[fragile] where user_id=target;
 if not found then raise exception 'Member permissions are missing. No changes were saved.'; end if;
 delete from public.project_member_access where user_id=target;
 insert into public.project_member_access(user_id,project_id,allowed) values(target,fragile,true);
 update public.team_members set display_name='Fragile collaborator' where user_id=target;
 -- Retire one-to-one chats, keeping their history. Other group members retain their room.
 update public.private_chat_rooms r set archived=true where exists(select 1 from public.private_chat_members m where m.room_id=r.id and m.user_id=target)
 and (select count(*) from public.private_chat_members m where m.room_id=r.id)<=2;
 update public.private_chat_rooms r set name=left(coalesce((select string_agg(t.display_name,' & ' order by t.display_name) from public.private_chat_members m join public.team_members t using(user_id) where m.room_id=r.id and m.user_id<>target),'Private conversation'),100)
 where not r.archived and exists(select 1 from public.private_chat_members m where m.room_id=r.id and m.user_id=target);
 delete from public.private_chat_members where user_id=target;
 delete from public.member_presence where user_id=target;
 update public.team_notifications set actor_name='Fragile collaborator' where actor_id=target;
 update public.team_notifications set item_title='Fragile collaborator' where source_table='team_members' and source_id=target::text;
 update public.project_activity set actor_name='Fragile collaborator' where actor_id=target;
end $scope$;
commit;
select 'Fragile access preserved; directory and other chats hidden' as result;
-- END FRAGILE ACCESS SETUP
`;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await writeFile(process.argv[2]||'/workspace/outputs/Quest-Fragile-Access.sql',await prepareFragileAccess());console.log('Prepared Fragile access setup.');}

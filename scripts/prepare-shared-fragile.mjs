import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export async function prepareSharedFragile(){
 const schema=(await Promise.all(['20261106_studio_only_members.sql','20261112_private_fragile_sharing.sql'].map(file=>readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8')))).join('\n').replace(/^(?:begin;|commit;)\s*$/gm,'');
 return `-- Complete owner-run setup: share My Fragile with the existing collaborator.
rollback;
reset role;
begin;
${schema}
do $share$
declare target uuid; workspace_owner uuid; fragile_id uuid; matches integer;
begin
 select count(*) into matches from public.member_access a join public.team_members m using(user_id) where a.is_admin;
 if matches<>1 then raise exception 'Expected exactly one workspace owner. No changes were saved.'; end if;
 select a.user_id into workspace_owner from public.member_access a join public.team_members m using(user_id) where a.is_admin;
 select id into target from auth.users where id='5c9e7be8-1956-47aa-8449-d482851edac9'::uuid;
 if target is null then raise exception 'The existing Fragile collaborator account was not found. No changes were saved.'; end if;
 if target=workspace_owner or exists(select 1 from public.member_access where user_id=target and is_admin) then raise exception 'Owner access cannot be changed by this setup.'; end if;
 select count(*) into matches from public.projects where lower(btrim(name)) in ('fragile','fragile.');
 if matches<>1 then raise exception 'Expected exactly one Fragile project. No changes were saved.'; end if;
 select id into fragile_id from public.projects where lower(btrim(name)) in ('fragile','fragile.');
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('share-private-fragile-'||workspace_owner::text,0));
 insert into public.team_members(user_id,display_name) values(target,'Fragile collaborator') on conflict(user_id) do update set display_name=excluded.display_name;
 insert into public.member_access(user_id,is_admin,project_mode,shared_access,personal_only,editable_project_ids,directory_hidden,studio_only_project_id,studio_display_name,private_fragile_owner_id,private_fragile_can_edit)
 values(target,false,'selected',false,false,'{}',true,null,null,workspace_owner,true)
 on conflict(user_id) do update set project_mode='selected',shared_access=false,personal_only=false,editable_project_ids='{}',directory_hidden=true,studio_only_project_id=null,studio_display_name=null,private_fragile_owner_id=workspace_owner,private_fragile_can_edit=true;
 delete from public.project_member_access where user_id=target;
 update public.private_chat_rooms r set archived=true where exists(select 1 from public.private_chat_members c where c.room_id=r.id and c.user_id=target)
 and (select count(*) from public.private_chat_members c where c.room_id=r.id)<=2;
 delete from public.private_chat_members where user_id=target;
 delete from public.member_presence where user_id=target;
 update public.team_notifications set actor_name='Fragile collaborator' where actor_id=target;
 update public.team_notifications set item_title='Fragile collaborator' where source_table='team_members' and source_id=target::text;
 update public.project_activity set actor_name='Fragile collaborator' where actor_id=target;
end $share$;
notify pgrst,'reload schema';
commit;
select 'My Fragile' as shared_page,a.private_fragile_can_edit as can_edit,
 (select count(*) from public.project_member_access p where p.user_id=a.user_id and p.allowed) as project_grants
from public.member_access a where a.user_id in(select user_id from public.team_members where user_id='5c9e7be8-1956-47aa-8449-d482851edac9'::uuid);
-- END PRIVATE FRAGILE SHARING SETUP
`;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await writeFile(process.argv[2]||'/workspace/outputs/Quest-Private-Fragile-Sharing.sql',await prepareSharedFragile());console.log('Prepared complete My Fragile sharing setup.');}

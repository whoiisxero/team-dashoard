import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export async function prepareDirectChat(name='Tertius'){
 const quoted="'"+name.trim().replaceAll("'","''")+"'";
 const migration=(await readFile(new URL('../supabase/migrations/20261105_direct_chats.sql',import.meta.url),'utf8')).replace(/^(?:begin;|commit;)\s*$/gm,'');
 return `-- Copy this ENTIRE query into a new Supabase SQL query, as postgres.
rollback;
reset role;
begin;
${migration}
do $chat$ declare admin_id uuid; member_id uuid; chat_id uuid; matches integer; admin_name text; member_name text; begin
 select count(*) into matches from public.member_access a join public.team_members m using(user_id) where a.is_admin;
 if matches<>1 then raise exception 'Expected exactly one team owner. No chat changes were saved.'; end if;
 select a.user_id,m.display_name into admin_id,admin_name from public.member_access a join public.team_members m using(user_id) where a.is_admin;
 select count(*) into matches from public.team_members m join public.member_access a using(user_id) where lower(btrim(m.display_name))=lower(${quoted}) and m.user_id<>admin_id;
 if matches<>1 then raise exception 'Expected exactly one existing member named %. Check Members first. No chat changes were saved.',${quoted}; end if;
 select m.user_id,m.display_name into member_id,member_name from public.team_members m join public.member_access a using(user_id) where lower(btrim(m.display_name))=lower(${quoted}) and m.user_id<>admin_id;
 select id into chat_id from public.private_chat_rooms where room_key='direct-owner-'||member_id::text;
 if chat_id is not null and not exists(select 1 from public.private_chat_rooms where id=chat_id and room_kind='direct' and personal_owner_id=member_id and created_by=admin_id) then
  raise exception 'An existing conversation has different participants. No changes were saved.';
 end if;
 if chat_id is null then
  insert into public.private_chat_rooms(room_key,name,room_kind,project_id,personal_owner_id,created_by)
  values('direct-owner-'||member_id::text,left(admin_name||' & '||member_name,100),'direct',null,member_id,admin_id) returning id into chat_id;
 end if;
 delete from public.private_chat_members where room_id=chat_id and user_id not in(admin_id,member_id);
 insert into public.private_chat_members(room_id,user_id) values(chat_id,admin_id),(chat_id,member_id) on conflict do nothing;
end $chat$;
commit;
select r.name as private_chat,array_agg(m.display_name order by m.display_name) as participants
from public.private_chat_rooms r join public.private_chat_members c on c.room_id=r.id join public.team_members m on m.user_id=c.user_id
where r.room_kind='direct' and r.personal_owner_id in(select user_id from public.team_members where lower(btrim(display_name))=lower(${quoted})) group by r.id;
-- END DIRECT CHAT SETUP
`;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await writeFile(process.argv[2]||'/workspace/outputs/Quest-Tertius-Private-Chat.sql',await prepareDirectChat());console.log('Prepared Tertius private chat setup.');}

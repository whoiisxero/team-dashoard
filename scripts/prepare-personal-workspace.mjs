import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
export async function preparePersonalWorkspace({email,name,ownerId=null},destination=null){
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||!name?.trim()||name.length>80)throw new Error('Supply an email and a display name of up to 80 characters.');
  if(ownerId&&!/^[a-f0-9-]{36}$/i.test(ownerId))throw new Error('Owner ID must be an account UUID.');
  const migration=(await Promise.all(['20261028_personal_workspaces.sql','20261028_personal_calendar.sql','20261030_private_quotes.sql'].map(file=>readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8')))).join('\n');
  const sql=`-- Copy this ENTIRE query into the Quest Supabase SQL Editor. Run as postgres.
-- Private notes remain visible only to their author, including when an owner signs in.
rollback;
reset role;
begin;
${migration.replace(/^(?:begin;|commit;)\s*$/gm,'')}
do $personal_setup$ declare person_id uuid; admin_id uuid; admin_name text; chat_id uuid; begin
  select id into person_id from auth.users where lower(btrim(email))=${quote(email.toLowerCase())};
  if person_id is null then raise exception 'Create or invite ${email.replaceAll("'",'')} in Authentication > Users first.'; end if;
  if exists(select 1 from public.member_access where user_id=person_id and is_admin) then
    raise exception 'This account is an owner and cannot be changed to a personal-only account.';
  end if;
  if (select count(*) from public.member_access where is_admin ${ownerId?'and user_id='+quote(ownerId)+'::uuid':''})<>1 then
    raise exception 'Choose exactly one existing team owner for this private conversation.';
  end if;
  select a.user_id,m.display_name into admin_id,admin_name from public.member_access a join public.team_members m using(user_id)
    where a.is_admin ${ownerId?'and a.user_id='+quote(ownerId)+'::uuid':''};
  insert into public.team_members(user_id,display_name) values(person_id,${quote(name)})
    on conflict(user_id) do update set display_name=excluded.display_name;
  insert into public.member_access(user_id,is_admin,project_mode,shared_access,editable_project_ids,personal_only)
    values(person_id,false,'selected',false,'{}',true)
    on conflict(user_id) do update set project_mode='selected',shared_access=false,editable_project_ids='{}',personal_only=true;
  delete from public.project_member_access where user_id=person_id;
  delete from public.private_chat_members where user_id=person_id;
  select id into chat_id from public.private_chat_rooms where room_key='personal-owner-'||person_id::text;
  if chat_id is not null and not exists(select 1 from public.private_chat_rooms where id=chat_id
    and room_kind='personal' and personal_owner_id=person_id and created_by=admin_id) then
    raise exception 'The private room key already belongs to a different conversation.';
  end if;
  if chat_id is null then
    insert into public.private_chat_rooms(room_key,name,project_id,room_kind,personal_owner_id,created_by)
      values('personal-owner-'||person_id::text,left(admin_name||' & '||${quote(name)},100),null,'personal',person_id,admin_id)
      returning id into chat_id;
  end if;
  delete from public.private_chat_members where room_id=chat_id and user_id not in(person_id,admin_id);
  insert into public.private_chat_members(room_id,user_id) values(chat_id,person_id),(chat_id,admin_id) on conflict do nothing;
  insert into public.personal_profiles(user_id,preferred_name) values(person_id,${quote(name)}) on conflict do nothing;
  insert into public.notification_preferences(user_id) values(person_id) on conflict do nothing;
end $personal_setup$;
notify pgrst,'reload schema';
commit;
select m.display_name,a.personal_only,a.shared_access,
  (select count(*) from public.project_member_access p where p.user_id=m.user_id and p.allowed) as project_grants,
  (select count(*) from public.private_chat_members c where c.user_id=m.user_id) as private_rooms
from public.team_members m join public.member_access a using(user_id) join auth.users u on u.id=m.user_id
where lower(btrim(u.email))=${quote(email.toLowerCase())};
-- END PERSONAL WORKSPACE SETUP
`;
  if(destination){await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,sql);}
  return sql;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [email,name,destination]=process.argv.slice(2);if(!destination)throw new Error('Usage: node scripts/prepare-personal-workspace.mjs EMAIL NAME OUTPUT.sql');
  await preparePersonalWorkspace({email,name},destination);console.log('Prepared the personal-only workspace setup SQL.');
}

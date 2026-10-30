/* Generates a private SQL query locally. No account details are uploaded. */
window.questPersonalEnrollmentSQL=({email,name,business})=>{
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name.trim()||name.length>80||!business.trim()||business.length>100)throw Error('Enter a valid email, welcome name and business name.');
 const q=v=>"'"+v.replaceAll("'","''")+"'";
 return `rollback;
reset role;
begin;
do $enroll$ declare member_id uuid; owner_id uuid; owners integer; begin
 if to_regprocedure('public.quest_make_personal_workspace(uuid)') is null or to_regclass('public.personal_quotes') is null then raise exception 'Run the complete workspace setup query first.'; end if;
 select id into member_id from auth.users where lower(btrim(email))=${q(email.trim().toLowerCase())};
 if member_id is null then raise exception 'Invite or create this email in Authentication > Users first.'; end if;
 select count(*) into owners from public.member_access a join public.team_members m using(user_id) where a.is_admin;
 if owners<>1 then raise exception 'This setup needs exactly one owner. Use Members to select the private chat owner instead.'; end if;
 select a.user_id into owner_id from public.member_access a join public.team_members m using(user_id) where a.is_admin;
 if member_id=owner_id or exists(select 1 from public.member_access where user_id=member_id and is_admin) then raise exception 'An owner account cannot be converted.'; end if;
 insert into public.team_members(user_id,display_name) values(member_id,${q(name.trim())}) on conflict(user_id) do update set display_name=excluded.display_name;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform public.quest_make_personal_workspace(member_id);
 update public.personal_profiles set preferred_name=${q(name.trim())},business_name=${q(business.trim())} where user_id=member_id;
end $enroll$;
commit;
select m.display_name,a.personal_only,a.shared_access,p.business_name,
 (select count(*) from public.private_chat_members c where c.user_id=m.user_id) as private_rooms
from public.team_members m join public.member_access a using(user_id) join public.personal_profiles p using(user_id) join auth.users u on u.id=m.user_id
where lower(btrim(u.email))=${q(email.trim().toLowerCase())};
-- END PRIVATE MEMBER SETUP
`;
};

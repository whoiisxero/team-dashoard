-- Copy this ENTIRE query into a new Supabase SQL Editor query and run as postgres.
-- Creates a separate two-person room. Diary notes and other chats are preserved.
rollback;
reset role;
begin;
do $weed_diary_chat$
declare
  owner_id uuid; person_id uuid; chat_id uuid; matches integer;
  owner_name text; person_name text; existing_room record;
begin
  if to_regprocedure('public.private_chat_access_for(uuid,uuid)') is null
    or not exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='private_chat_rooms' and column_name='room_kind')
  then raise exception 'Finish the existing private-workspace and direct-chat setup first. No changes were saved.';
  end if;
  select count(*) into matches from public.member_access a
    join public.team_members m using(user_id) join auth.users u on u.id=m.user_id where a.is_admin;
  if matches<>1 then raise exception 'Expected exactly one active team owner. No changes were saved.'; end if;
  select a.user_id,m.display_name into owner_id,owner_name from public.member_access a
    join public.team_members m using(user_id) join auth.users u on u.id=m.user_id where a.is_admin;
  select count(*) into matches from public.team_members m join public.member_access a using(user_id)
    join auth.users u on u.id=m.user_id where lower(btrim(m.display_name))='tertius' and m.user_id<>owner_id;
  if matches<>1 then raise exception 'Expected exactly one existing member named Tertius. Check Members first. No changes were saved.'; end if;
  select m.user_id,m.display_name into person_id,person_name from public.team_members m
    join public.member_access a using(user_id) join auth.users u on u.id=m.user_id
    where lower(btrim(m.display_name))='tertius' and m.user_id<>owner_id;
  begin
    insert into public.private_chat_rooms(room_key,name,room_kind,project_id,personal_owner_id,created_by)
      values('weed-diary-owner-'||person_id::text,left('Weed Diary · '||owner_name||' & '||person_name,100),
        'direct',null,person_id,owner_id)
      on conflict(room_key) do nothing;
  exception when check_violation then
    raise exception 'Your database needs the current direct-chat setup. No diary or access changes were saved.';
  end;
  select * into existing_room from public.private_chat_rooms
    where room_key='weed-diary-owner-'||person_id::text for update;
  if existing_room.created_by is distinct from owner_id or existing_room.personal_owner_id is distinct from person_id
    or existing_room.room_kind<>'direct' or existing_room.project_id is not null
    or coalesce((to_jsonb(existing_room)->>'archived')::boolean,false)
  then raise exception 'An existing room has a different owner or scope. No changes were saved.'; end if;
  chat_id:=existing_room.id;
  if exists(select 1 from public.private_chat_members where room_id=chat_id and user_id not in(owner_id,person_id))
    then raise exception 'This room already has another participant. Review it before making changes.'; end if;
  insert into public.private_chat_members(room_id,user_id) values(chat_id,owner_id),(chat_id,person_id)
    on conflict(room_id,user_id) do nothing;
  if not public.private_chat_access_for(owner_id,chat_id) or not public.private_chat_access_for(person_id,chat_id)
    then raise exception 'Current member restrictions do not allow this direct chat. No changes were saved.'; end if;
  if (select count(*) from public.private_chat_members where room_id=chat_id)<>2
    then raise exception 'The room must contain exactly two participants. No changes were saved.'; end if;
end $weed_diary_chat$;
commit;
select r.name as private_chat,array_agg(m.display_name order by m.display_name) as participants,
  count(*) as participant_count
from public.private_chat_rooms r join public.private_chat_members c on c.room_id=r.id
  join public.team_members m on m.user_id=c.user_id
where r.room_key in(select 'weed-diary-owner-'||user_id::text from public.team_members
  where lower(btrim(display_name))='tertius')
group by r.id;
-- END WEED DIARY CHAT SETUP

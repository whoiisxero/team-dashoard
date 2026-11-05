-- Independent owner/member chats without changing either account's projects.
begin;
alter table public.private_chat_rooms drop constraint if exists private_chat_room_scope_check;
alter table public.private_chat_rooms add constraint private_chat_room_scope_check check(
 (room_kind='project' and project_id is not null and personal_owner_id is null) or
 (room_kind in ('personal','direct') and project_id is null and personal_owner_id is not null));
create or replace function public.private_chat_access_for(member_id uuid,chat_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.private_chat_rooms r join public.private_chat_members m on m.room_id=r.id
 join public.team_members t on t.user_id=m.user_id join public.member_access a on a.user_id=m.user_id
 where r.id=chat_id and m.user_id=member_id and case r.room_kind
 when 'direct' then member_id=r.personal_owner_id or (member_id=r.created_by and a.is_admin)
 when 'personal' then public.personal_workspace_for(r.personal_owner_id) and
  (member_id=r.personal_owner_id or (member_id=r.created_by and a.is_admin))
 else not a.personal_only and public.project_access_for(member_id,r.project_id) end); $$;
create or replace function public.can_edit_private_chat(room uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.private_chat_rooms r where r.id=room
 and public.can_access_private_chat(r.id) and (r.room_kind in ('personal','direct') or public.can_edit_project(r.project_id))); $$;
notify pgrst,'reload schema';
commit;

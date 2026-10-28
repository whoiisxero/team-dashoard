-- Invite-only conversations within a project. Run after member-access.sql.
-- Team/project access alone never grants access to a private room.
begin;
create table if not exists public.private_chat_rooms (
  id uuid primary key default gen_random_uuid(),
  room_key text not null unique,
  name text not null check(char_length(btrim(name)) between 1 and 100),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.private_chat_members (
  room_id uuid not null references public.private_chat_rooms(id) on delete cascade,
  user_id uuid not null references public.team_members(user_id) on delete cascade,
  primary key(room_id,user_id)
);
create table if not exists public.private_chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.private_chat_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  body text not null check(char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists private_chat_messages_room_date_idx on public.private_chat_messages(room_id,created_at desc,id desc);
alter table public.private_chat_rooms enable row level security;
alter table public.private_chat_members enable row level security;
alter table public.private_chat_messages enable row level security;
revoke all on public.private_chat_rooms,public.private_chat_members,public.private_chat_messages from public,anon,authenticated;
grant select on public.private_chat_rooms,public.private_chat_members to authenticated;
grant select,insert,delete on public.private_chat_messages to authenticated;

create or replace function public.private_chat_access_for(member_id uuid,chat_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.private_chat_rooms r join public.private_chat_members m on m.room_id=r.id
  join public.team_members t on t.user_id=m.user_id where r.id=chat_id and m.user_id=member_id
  and public.project_access_for(member_id,r.project_id)); $$;
create or replace function public.can_access_private_chat(chat_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select public.private_chat_access_for(auth.uid(),chat_id); $$;
revoke all on function public.private_chat_access_for(uuid,uuid),public.can_access_private_chat(uuid) from public,anon,authenticated;
grant execute on function public.can_access_private_chat(uuid) to authenticated;

drop policy if exists room_read on public.private_chat_rooms;
create policy room_read on public.private_chat_rooms for select to authenticated using(public.can_access_private_chat(id));
drop policy if exists room_access_guard on public.private_chat_rooms;
create policy room_access_guard on public.private_chat_rooms as restrictive for all to authenticated
  using(public.can_access_private_chat(id)) with check(public.can_access_private_chat(id));
drop policy if exists members_read on public.private_chat_members;
create policy members_read on public.private_chat_members for select to authenticated using(public.can_access_private_chat(room_id));
drop policy if exists room_access_guard on public.private_chat_members;
create policy room_access_guard on public.private_chat_members as restrictive for all to authenticated
  using(public.can_access_private_chat(room_id)) with check(public.can_access_private_chat(room_id));
drop policy if exists message_read on public.private_chat_messages;
create policy message_read on public.private_chat_messages for select to authenticated using(public.can_access_private_chat(room_id));
drop policy if exists message_insert on public.private_chat_messages;
create policy message_insert on public.private_chat_messages for insert to authenticated with check(public.can_access_private_chat(room_id) and user_id=auth.uid());
drop policy if exists message_delete on public.private_chat_messages;
create policy message_delete on public.private_chat_messages for delete to authenticated using(public.can_access_private_chat(room_id) and user_id=auth.uid());
drop policy if exists room_access_guard on public.private_chat_messages;
create policy room_access_guard on public.private_chat_messages as restrictive for all to authenticated
  using(public.can_access_private_chat(room_id)) with check(public.can_access_private_chat(room_id));
drop policy if exists message_sender_guard on public.private_chat_messages;
create policy message_sender_guard on public.private_chat_messages as restrictive for insert to authenticated with check(user_id=auth.uid());
drop policy if exists message_delete_guard on public.private_chat_messages;
create policy message_delete_guard on public.private_chat_messages as restrictive for delete to authenticated using(user_id=auth.uid());

-- A private-room notification needs both room membership and project access.
alter table public.team_notifications add column if not exists private_room_id uuid;
alter table public.team_notifications drop constraint if exists team_notifications_access_scope_check;
alter table public.team_notifications add constraint team_notifications_access_scope_check
  check(access_scope in ('project','shared','admin','private_chat','personal','personal_event'));
drop policy if exists notification_access_guard on public.team_notifications;
create policy notification_access_guard on public.team_notifications as restrictive for all to authenticated
using(case access_scope when 'private_chat' then public.can_access_private_chat(private_room_id)
  when 'project' then public.can_access_project(project_id) when 'shared' then public.can_access_project(null) else public.access_admin() end)
with check(case access_scope when 'private_chat' then public.can_access_private_chat(private_room_id)
  when 'project' then public.can_access_project(project_id) when 'shared' then public.can_access_project(null) else public.access_admin() end);
create or replace function public.capture_private_chat_notification()
returns trigger language plpgsql security definer set search_path=''
as $$ declare room public.private_chat_rooms; actor uuid:=auth.uid(); actor_label text; begin
  select * into room from public.private_chat_rooms where id=NEW.room_id;
  select display_name into actor_label from public.team_members where user_id=actor;
  if actor_label is null then return null; end if;
  insert into public.team_notifications(recipient_id,actor_id,actor_name,source_table,source_id,action,item_title,project_id,access_scope,private_room_id)
  select m.user_id,actor,actor_label,'private_chat_messages',NEW.id::text,'INSERT',room.name,room.project_id,'private_chat',room.id
    from public.private_chat_members m where m.room_id=room.id and m.user_id<>actor
    and public.private_chat_access_for(m.user_id,room.id);
  return null;
end $$;
revoke all on function public.capture_private_chat_notification() from public,anon,authenticated;
drop trigger if exists notify_private_chat on public.private_chat_messages;
create trigger notify_private_chat after insert on public.private_chat_messages for each row execute function public.capture_private_chat_notification();
do $$ declare t text; begin
  foreach t in array array['private_chat_rooms','private_chat_members','private_chat_messages'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;
notify pgrst,'reload schema';
commit;

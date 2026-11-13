-- Share only the owner's My Fragile notes; other personal categories remain author-only.
begin;
alter table public.member_access add column if not exists private_fragile_owner_id uuid references public.team_members(user_id);
alter table public.member_access add column if not exists private_fragile_can_edit boolean not null default false;

create or replace function public.is_private_fragile_guest()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.member_access a join public.team_members m using(user_id)
 where a.user_id=auth.uid() and not a.is_admin and a.private_fragile_owner_id is not null); $$;
create or replace function public.my_fragile_workspace_owner()
returns uuid language sql stable security definer set search_path=''
as $$ select case when a.is_admin then a.user_id else a.private_fragile_owner_id end
 from public.member_access a join public.team_members m using(user_id)
 where a.user_id=auth.uid() and (a.is_admin or exists(select 1 from public.member_access o
 join public.team_members t on t.user_id=o.user_id where o.user_id=a.private_fragile_owner_id and o.is_admin)); $$;
create or replace function public.can_read_shared_fragile(note_owner uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select note_owner=public.my_fragile_workspace_owner(); $$;
create or replace function public.can_edit_shared_fragile()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.member_access a join public.team_members m using(user_id)
 where a.user_id=auth.uid() and (a.is_admin or (a.private_fragile_can_edit and a.private_fragile_owner_id=public.my_fragile_workspace_owner()))); $$;
revoke all on function public.is_private_fragile_guest(),public.my_fragile_workspace_owner(),public.can_read_shared_fragile(uuid),public.can_edit_shared_fragile() from public,anon,authenticated;
grant execute on function public.is_private_fragile_guest(),public.my_fragile_workspace_owner(),public.can_read_shared_fragile(uuid),public.can_edit_shared_fragile() to authenticated;

drop policy if exists shared_fragile_notes_read on public.personal_notes;
create policy shared_fragile_notes_read on public.personal_notes for select to authenticated
 using(category='Fragile / Private' and public.can_read_shared_fragile(owner_id));
drop policy if exists private_fragile_note_guard on public.personal_notes;
create policy private_fragile_note_guard on public.personal_notes as restrictive for select to authenticated
 using(not public.is_private_fragile_guest() or (category='Fragile / Private' and public.can_read_shared_fragile(owner_id)));
drop policy if exists private_fragile_roster_guard on public.team_members;
create policy private_fragile_roster_guard on public.team_members as restrictive for select to authenticated
 using(not public.is_private_fragile_guest() or user_id=auth.uid() or user_id=public.my_fragile_workspace_owner());

create or replace function public.shared_access_for(member_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.member_access a join public.team_members m using(user_id)
  where a.user_id=member_id and (a.is_admin or (not a.personal_only and a.private_fragile_owner_id is null and a.studio_only_project_id is null and a.shared_access))); $$;

create or replace function public.project_access_for(member_id uuid,project uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.member_access a join public.team_members m using(user_id)
  where a.user_id=member_id and (a.is_admin or (not a.personal_only and a.private_fragile_owner_id is null and (a.studio_only_project_id is null or a.studio_only_project_id=project) and exists(select 1 from public.projects p where p.id=project)
    and coalesce((select x.allowed from public.project_member_access x where x.user_id=member_id and x.project_id=project),
      a.project_mode='all' and not (select p.access_restricted from public.projects p where p.id=project))))); $$;

create or replace function public.can_create_project()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.member_access a join public.team_members m using(user_id)
  where a.user_id=auth.uid() and (a.is_admin or (not a.personal_only and a.private_fragile_owner_id is null and a.studio_only_project_id is null and a.project_mode='all' and a.shared_access and a.editable_project_ids is null))); $$;

create or replace function public.my_dashboard_access()
returns jsonb language sql stable security definer set search_path=''
as $$ select jsonb_build_object('ready',true,'is_admin',coalesce(a.is_admin,false),
  'personal_only',coalesce(a.personal_only,false),'private_fragile_owner_id',a.private_fragile_owner_id,'private_fragile_can_edit',coalesce(a.private_fragile_can_edit,false),
  'private_fragile_shared',exists(select 1 from public.member_access g join public.team_members t on t.user_id=g.user_id where g.private_fragile_owner_id=m.user_id and not g.is_admin),'personal_workspace_ready',true,
  'studio_only_project_id',a.studio_only_project_id,'directory_hidden',coalesce(a.directory_hidden,false),'shared_access',public.shared_access_for(auth.uid()),
  'can_create_projects',public.can_create_project(),
  'project_mode',case when a.personal_only then 'selected' else coalesce(a.project_mode,'selected') end,'access_levels_ready',true,
  'editable_project_ids',case when a.personal_only then '[]'::jsonb when a.is_admin then null else to_jsonb(a.editable_project_ids) end)
  from public.team_members m left join public.member_access a using(user_id) where m.user_id=auth.uid(); $$;

create or replace function public.private_chat_access_for(member_id uuid,chat_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.private_chat_rooms r join public.private_chat_members m on m.room_id=r.id
 join public.team_members t on t.user_id=m.user_id join public.member_access a on a.user_id=m.user_id
 where r.id=chat_id and not r.archived and a.studio_only_project_id is null and a.private_fragile_owner_id is null and m.user_id=member_id and case r.room_kind
 when 'direct' then member_id=r.personal_owner_id or (member_id=r.created_by and a.is_admin)
 when 'personal' then public.personal_workspace_for(r.personal_owner_id) and
  (member_id=r.personal_owner_id or (member_id=r.created_by and a.is_admin))
 else not a.personal_only and public.project_access_for(member_id,r.project_id) end); $$;

create or replace function public.personal_workspace_for(member uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.member_access a join public.team_members m using(user_id)
 where a.user_id=member and (a.is_admin or (a.personal_only and a.private_fragile_owner_id is null))); $$;

create or replace function public.quest_save_shared_fragile_note(
  note_id uuid,note_kind text,note_title text,note_body text,note_category text,note_pinned boolean,
  note_status text,due_local timestamp,remind_local timestamp,zone text,expected_revision integer)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare old_note public.personal_notes; saved public.personal_notes; due_value timestamptz; remind_value timestamptz; target_owner uuid:=public.my_fragile_workspace_owner(); begin
  if target_owner is null or not public.can_edit_shared_fragile() then raise exception 'Shared Fragile editing access required.'; end if;
  if (note_kind is null or note_kind not in ('writing','business')) or note_category is distinct from 'Fragile / Private' then raise exception 'Only My Fragile notes can be changed here.'; end if;
  if note_id is null or not public.quest_valid_timezone(zone) then raise exception 'Choose a valid note and time zone.'; end if;
  due_value:=due_local at time zone zone;remind_value:=remind_local at time zone zone;
  if (due_local is not null and due_value at time zone zone<>due_local) or
    (remind_local is not null and remind_value at time zone zone<>remind_local) then
    raise exception 'That local time does not exist in the selected time zone. Choose another time.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(note_id::text,0));
  select * into old_note from public.personal_notes where id=note_id;
  if found then
    if old_note.owner_id<>target_owner or old_note.category<>'Fragile / Private' then raise exception 'This note is not available.'; end if;
    if old_note.kind<>note_kind then raise exception 'A note cannot change workspace type.'; end if;
    if expected_revision is null and old_note.kind=note_kind and old_note.title=btrim(note_title) and old_note.body=note_body
      and old_note.category=btrim(note_category) and old_note.pinned=note_pinned and old_note.status=note_status
      and old_note.due_at is not distinct from due_value and old_note.remind_at is not distinct from remind_value
      and old_note.time_zone=zone then return to_jsonb(old_note); end if;
    if expected_revision is distinct from old_note.revision then
      raise exception 'This note changed on another device. Close and reopen it before saving; copy your unsaved writing first.';
    end if;
    update public.personal_notes set title=btrim(note_title),body=note_body,category=btrim(note_category),pinned=note_pinned,
      status=note_status,due_at=due_value,remind_at=remind_value,time_zone=zone,revision=revision+1,updated_at=now()
      where id=note_id returning * into saved;
  else
    if expected_revision is not null then raise exception 'This note was removed. Copy your writing before closing.'; end if;
    insert into public.personal_notes(id,owner_id,kind,title,body,category,pinned,status,due_at,remind_at,time_zone)
      values(note_id,target_owner,note_kind,btrim(note_title),note_body,btrim(note_category),note_pinned,note_status,due_value,remind_value,zone)
      returning * into saved;
  end if;
  return to_jsonb(saved);
end $$;
revoke all on function public.quest_save_shared_fragile_note(uuid,text,text,text,text,boolean,text,timestamp,timestamp,text,integer) from public,anon,authenticated;
grant execute on function public.quest_save_shared_fragile_note(uuid,text,text,text,text,boolean,text,timestamp,timestamp,text,integer) to authenticated;

create or replace function public.quest_delete_shared_fragile_note(note_id uuid,expected_revision integer)
returns boolean language plpgsql security definer set search_path=''
as $$ declare old_note public.personal_notes; target_owner uuid:=public.my_fragile_workspace_owner(); begin
 if target_owner is null or not public.can_edit_shared_fragile() then raise exception 'Shared Fragile editing access required.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(note_id::text,0));
 select * into old_note from public.personal_notes where id=note_id for update;
 if not found then return false; end if;
 if old_note.owner_id<>target_owner or old_note.category<>'Fragile / Private' then raise exception 'This note is not available.'; end if;
 if expected_revision is distinct from old_note.revision then raise exception 'This note changed on another device. Refresh before deleting.'; end if;
 delete from public.personal_notes where id=note_id;
 return true;
end $$;
revoke all on function public.quest_delete_shared_fragile_note(uuid,integer) from public,anon,authenticated;
grant execute on function public.quest_delete_shared_fragile_note(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;

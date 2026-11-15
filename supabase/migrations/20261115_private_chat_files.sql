-- Private Weed Diary chat files. Existing room membership remains authoritative.
begin;
alter table public.private_chat_messages add column if not exists attachments jsonb not null default '[]'::jsonb;

create or replace function public.quest_private_chat_file_room(chat_id uuid)
returns boolean language sql stable security definer set search_path=''
as $file_room$
  select public.can_access_private_chat(chat_id) and exists(
    select 1 from public.private_chat_rooms r where r.id=chat_id and r.room_kind='direct'
      and r.room_key like 'weed-diary-owner-%');
$file_room$;

create or replace function public.quest_valid_private_chat_files(files jsonb,chat_id uuid,author_id uuid,message_id uuid)
returns boolean language plpgsql immutable set search_path=''
as $valid_files$
declare f jsonb; expected_mime text; extension text;
begin
  if files is null or jsonb_typeof(files)<>'array' then return false; end if;
  if jsonb_array_length(files)>4 then return false; end if;
  for f in select value from jsonb_array_elements(files) loop
    if jsonb_typeof(f)<>'object' or not (f ?& array['path','name','mime','size'])
      or f-array['path','name','mime','size']<>'{}'::jsonb then return false; end if;
    if jsonb_typeof(f->'path')<>'string' or jsonb_typeof(f->'name')<>'string'
      or jsonb_typeof(f->'mime')<>'string' or jsonb_typeof(f->'size')<>'number'
      or (f->>'size')!~'^[0-9]+$' then return false; end if;
    if (f->>'size')::numeric not between 1 and 20971520
      or char_length(btrim(f->>'name')) not between 1 and 180
      or (f->>'name') ~ '[[:cntrl:]/\\]' then return false; end if;
    if (f->>'path') !~ ('^'||chat_id::text||'/'||author_id::text||'/'||message_id::text
      ||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif|avif|heic|heif|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$')
      then return false; end if;
    extension:=substring(f->>'path' from '\.([a-z0-9]+)$');
    if lower(f->>'name') !~ ('\.'||case when extension='jpg' then 'jpe?g' else extension end||'$')
      then return false; end if;
    expected_mime:=case extension
      when 'jpg' then 'image/jpeg' when 'png' then 'image/png' when 'webp' then 'image/webp'
      when 'gif' then 'image/gif' when 'avif' then 'image/avif' when 'heic' then 'image/heic'
      when 'heif' then 'image/heif' when 'pdf' then 'application/pdf'
      when 'doc' then 'application/msword'
      when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      when 'xls' then 'application/vnd.ms-excel'
      when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      when 'ppt' then 'application/vnd.ms-powerpoint'
      when 'pptx' then 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      when 'txt' then 'text/plain' when 'csv' then 'text/csv' end;
    if (f->>'mime') is distinct from expected_mime then return false; end if;
  end loop;
  return (select count(*)=count(distinct value->>'path') from jsonb_array_elements(files));
end $valid_files$;

alter table public.private_chat_messages drop constraint if exists private_chat_messages_body_check;
alter table public.private_chat_messages add constraint private_chat_messages_body_check
  check(char_length(body)<=4000 and (char_length(btrim(body))>0 or jsonb_array_length(attachments)>0));
alter table public.private_chat_messages drop constraint if exists private_chat_files_valid;
alter table public.private_chat_messages add constraint private_chat_files_valid
  check(public.quest_valid_private_chat_files(attachments,room_id,user_id,id));

create or replace function public.quest_check_private_chat_files()
returns trigger language plpgsql security definer set search_path=''
as $check_files$
declare f jsonb; meta jsonb;
begin
  if not public.quest_valid_private_chat_files(new.attachments,new.room_id,new.user_id,new.id)
    then raise exception 'Choose up to four supported files, no larger than 20 MB each.' using errcode='23514'; end if;
  if jsonb_array_length(new.attachments)=0 then return new; end if;
  if auth.uid() is distinct from new.user_id or not public.quest_private_chat_file_room(new.room_id)
    then raise exception 'This file conversation is not available to your account.' using errcode='42501'; end if;
  for f in select value from jsonb_array_elements(new.attachments) loop
    select o.metadata into meta from storage.objects o
      where o.bucket_id='quest-private-chat-files' and o.name=f->>'path';
    if not found or coalesce(meta->>'mimetype','')<>f->>'mime'
      or coalesce(meta->>'size','')!~'^[0-9]+$'
      then raise exception 'A file upload is not complete. Retry sending.' using errcode='23514'; end if;
    if (meta->>'size')::numeric<>(f->>'size')::numeric
      then raise exception 'A file size does not match its upload. Retry sending.' using errcode='23514'; end if;
  end loop;
  return new;
end $check_files$;
drop trigger if exists quest_check_private_chat_files on public.private_chat_messages;
create trigger quest_check_private_chat_files before insert or update on public.private_chat_messages
  for each row execute function public.quest_check_private_chat_files();

-- A stable message ID makes retries safe if delivery was not confirmed.
create or replace function public.quest_send_private_chat_files(message_id uuid,chat_id uuid,message_body text,files jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $send_files$
declare saved public.private_chat_messages;
begin
  if not public.quest_private_chat_file_room(chat_id)
    then raise exception 'This file conversation is not available to your account.' using errcode='42501'; end if;
  if files is null or jsonb_typeof(files)<>'array' or jsonb_array_length(files) not between 1 and 4
    then raise exception 'Choose at least one file.' using errcode='23514'; end if;
  select * into saved from public.private_chat_messages where id=message_id;
  if not found then
    insert into public.private_chat_messages(id,room_id,user_id,body,attachments)
      values(message_id,chat_id,auth.uid(),message_body,files) on conflict(id) do nothing returning * into saved;
    if found then return to_jsonb(saved); end if;
    select * into saved from public.private_chat_messages where id=message_id;
  end if;
  if saved.id is null or saved.user_id<>auth.uid() or saved.room_id<>chat_id
    or saved.body is distinct from message_body or saved.attachments is distinct from files
    then raise exception 'This send does not match the original draft.' using errcode='23514'; end if;
  return to_jsonb(saved);
end $send_files$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('quest-private-chat-files','quest-private-chat-files',false,20971520,array[
  'image/jpeg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif','application/pdf',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain','text/csv'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.quest_private_chat_file_access(object_name text,operation text default 'read')
returns boolean language plpgsql stable security definer set search_path=''
as $file_access$
declare chat_id uuid; author_id uuid; message_id uuid; linked boolean;
begin
  if object_name is null or object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif|avif|heic|heif|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$'
    then return false; end if;
  chat_id:=split_part(object_name,'/',1)::uuid;
  author_id:=split_part(object_name,'/',2)::uuid;
  message_id:=split_part(object_name,'/',3)::uuid;
  if not public.quest_private_chat_file_room(chat_id) then return false; end if;
  select exists(select 1 from public.private_chat_messages m where m.id=message_id and m.room_id=chat_id
    and m.user_id=author_id and m.attachments @> jsonb_build_array(jsonb_build_object('path',object_name))) into linked;
  if operation='read' then return linked or author_id=auth.uid(); end if;
  if operation='upload' then return author_id=auth.uid() and not exists(select 1 from public.private_chat_messages where id=message_id); end if;
  if operation='delete' then return author_id=auth.uid() and not linked; end if;
  return false;
end $file_access$;
revoke all on function public.quest_private_chat_file_room(uuid),public.quest_valid_private_chat_files(jsonb,uuid,uuid,uuid),
  public.quest_private_chat_file_access(text,text),public.quest_send_private_chat_files(uuid,uuid,text,jsonb),
  public.quest_check_private_chat_files() from public,anon,authenticated;
grant execute on function public.quest_private_chat_file_room(uuid),public.quest_valid_private_chat_files(jsonb,uuid,uuid,uuid),
  public.quest_private_chat_file_access(text,text),public.quest_send_private_chat_files(uuid,uuid,text,jsonb) to authenticated;

drop policy if exists private_chat_file_read on storage.objects;
create policy private_chat_file_read on storage.objects for select to authenticated
  using(bucket_id='quest-private-chat-files' and public.quest_private_chat_file_access(name));
drop policy if exists private_chat_file_upload on storage.objects;
create policy private_chat_file_upload on storage.objects for insert to authenticated
  with check(bucket_id='quest-private-chat-files' and public.quest_private_chat_file_access(name,'upload'));
drop policy if exists private_chat_file_delete on storage.objects;
create policy private_chat_file_delete on storage.objects for delete to authenticated
  using(bucket_id='quest-private-chat-files' and public.quest_private_chat_file_access(name,'delete'));
-- Restrictive policies keep unrelated permissive storage policies from widening access.
drop policy if exists private_chat_file_read_guard on storage.objects;
create policy private_chat_file_read_guard on storage.objects as restrictive for select to authenticated
  using(bucket_id<>'quest-private-chat-files' or public.quest_private_chat_file_access(name));
drop policy if exists private_chat_file_upload_guard on storage.objects;
create policy private_chat_file_upload_guard on storage.objects as restrictive for insert to authenticated
  with check(bucket_id<>'quest-private-chat-files' or public.quest_private_chat_file_access(name,'upload'));
drop policy if exists private_chat_file_delete_guard on storage.objects;
create policy private_chat_file_delete_guard on storage.objects as restrictive for delete to authenticated
  using(bucket_id<>'quest-private-chat-files' or public.quest_private_chat_file_access(name,'delete'));
drop policy if exists private_chat_file_update_guard on storage.objects;
create policy private_chat_file_update_guard on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'quest-private-chat-files') with check(bucket_id<>'quest-private-chat-files');
drop policy if exists private_chat_file_anon_guard on storage.objects;
create policy private_chat_file_anon_guard on storage.objects as restrictive for all to anon
  using(bucket_id<>'quest-private-chat-files') with check(bucket_id<>'quest-private-chat-files');
notify pgrst,'reload schema';
commit;

-- Dusted conversations. Existing brand messages remain the original posts.
begin;
alter table public.brand_messages add column if not exists parent_id uuid;
alter table public.brand_messages add column if not exists image_paths text[] not null default '{}';
create unique index if not exists brand_messages_id_project_key on public.brand_messages(id,project_id);
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.brand_messages'::regclass and conname='brand_message_parent_project') then
  alter table public.brand_messages add constraint brand_message_parent_project foreign key(parent_id,project_id) references public.brand_messages(id,project_id) on delete cascade;
 end if;
end $$;
create index if not exists brand_messages_parent_date_idx on public.brand_messages(parent_id,created_at,id);
-- Allow an image-only post. Keep the existing 4,000 character text limit.
alter table public.brand_messages drop constraint if exists brand_messages_body_check;
alter table public.brand_messages add constraint brand_messages_body_check check(char_length(body)<=4000 and (char_length(btrim(body))>0 or cardinality(image_paths)>0));
create or replace function public.quest_valid_thread_images(paths text[],project uuid,author uuid)
returns boolean language sql immutable set search_path=''
as $$ select cardinality(paths) between 0 and 4 and not exists(
 select 1 from unnest(paths) p where p is null or p !~ ('^'||project::text||'/'||author::text||'/[0-9a-f-]{36}\.(jpg|png|webp|gif)$')) $$;
alter table public.brand_messages drop constraint if exists brand_message_images_valid;
alter table public.brand_messages add constraint brand_message_images_valid check(public.quest_valid_thread_images(image_paths,project_id,user_id));
create or replace function public.quest_guard_thread_parent()
returns trigger language plpgsql set search_path=''
as $$ begin
 if new.parent_id is not null and not exists(select 1 from public.brand_messages p where p.id=new.parent_id and p.project_id=new.project_id and p.parent_id is null) then
  raise exception 'Reply to an existing post in this project.';
 end if;
 if TG_OP='UPDATE' and (new.project_id,new.user_id,new.parent_id) is distinct from (old.project_id,old.user_id,old.parent_id) then
  raise exception 'A conversation cannot change project, author or parent.';
 end if;
 return new;
end $$;
drop trigger if exists quest_guard_thread_parent on public.brand_messages;
create trigger quest_guard_thread_parent before insert or update on public.brand_messages for each row execute function public.quest_guard_thread_parent();

create table if not exists public.brand_message_likes(
 message_id uuid not null,project_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(message_id,user_id),
 foreign key(message_id,project_id) references public.brand_messages(id,project_id) on delete cascade
);
alter table public.brand_message_likes enable row level security;
revoke all on public.brand_message_likes from public,anon,authenticated;
grant select,insert,delete on public.brand_message_likes to authenticated;
drop policy if exists thread_likes_read on public.brand_message_likes;
create policy thread_likes_read on public.brand_message_likes for select to authenticated using(public.can_access_project(project_id));
drop policy if exists thread_likes_insert on public.brand_message_likes;
create policy thread_likes_insert on public.brand_message_likes for insert to authenticated with check(user_id=auth.uid() and public.can_edit_project(project_id));
drop policy if exists thread_likes_delete on public.brand_message_likes;
create policy thread_likes_delete on public.brand_message_likes for delete to authenticated using(user_id=auth.uid() and public.can_edit_project(project_id));
drop policy if exists thread_likes_scope_guard on public.brand_message_likes;
create policy thread_likes_scope_guard on public.brand_message_likes as restrictive for all to authenticated using(public.can_access_project(project_id)) with check(public.can_access_project(project_id));
drop policy if exists thread_likes_actor_guard on public.brand_message_likes;
create policy thread_likes_actor_guard on public.brand_message_likes as restrictive for insert to authenticated with check(user_id=auth.uid() and public.can_edit_project(project_id));
drop policy if exists thread_likes_delete_guard on public.brand_message_likes;
create policy thread_likes_delete_guard on public.brand_message_likes as restrictive for delete to authenticated using(user_id=auth.uid() and public.can_edit_project(project_id));
-- Security invoker: counts and reactions always obey current message/project RLS.
create or replace function public.quest_thread_stats(message_ids uuid[])
returns table(message_id uuid,like_count bigint,reply_count bigint,liked boolean)
language sql stable security invoker set search_path=''
as $$ select m.id,
 (select count(*) from public.brand_message_likes l where l.message_id=m.id),
 (select count(*) from public.brand_messages r where r.parent_id=m.id),
 exists(select 1 from public.brand_message_likes l where l.message_id=m.id and l.user_id=auth.uid())
 from public.brand_messages m where m.id=any(message_ids) $$;
revoke all on function public.quest_thread_stats(uuid[]) from public,anon,authenticated;
grant execute on function public.quest_thread_stats(uuid[]) to authenticated;

-- Private image bucket. Downloads use authenticated requests, never public URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('quest-thread-images','quest-thread-images',false,8388608,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create or replace function public.quest_thread_image_access(object_name text,editing boolean default false)
returns boolean language sql stable security definer set search_path=''
as $$ select case when object_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif)$'
 and split_part(object_name,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then case when editing then public.can_edit_project(split_part(object_name,'/',1)::uuid) and split_part(object_name,'/',2)=auth.uid()::text
 else public.can_access_project(split_part(object_name,'/',1)::uuid) end else false end $$;
revoke all on function public.quest_thread_image_access(text,boolean) from public,anon,authenticated;
grant execute on function public.quest_thread_image_access(text,boolean) to authenticated;
drop policy if exists thread_image_read on storage.objects;
create policy thread_image_read on storage.objects for select to authenticated using(bucket_id='quest-thread-images' and public.quest_thread_image_access(name));
drop policy if exists thread_image_insert on storage.objects;
create policy thread_image_insert on storage.objects for insert to authenticated with check(bucket_id='quest-thread-images' and public.quest_thread_image_access(name,true));
drop policy if exists thread_image_delete on storage.objects;
create policy thread_image_delete on storage.objects for delete to authenticated using(bucket_id='quest-thread-images' and public.quest_thread_image_access(name,true));
drop policy if exists thread_image_read_guard on storage.objects;
create policy thread_image_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'quest-thread-images' or public.quest_thread_image_access(name));
drop policy if exists thread_image_insert_guard on storage.objects;
create policy thread_image_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'quest-thread-images' or public.quest_thread_image_access(name,true));
drop policy if exists thread_image_delete_guard on storage.objects;
create policy thread_image_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'quest-thread-images' or public.quest_thread_image_access(name,true));
drop policy if exists thread_image_update_guard on storage.objects;
create policy thread_image_update_guard on storage.objects as restrictive for update to authenticated using(bucket_id<>'quest-thread-images') with check(bucket_id<>'quest-thread-images');
drop policy if exists thread_image_anon_guard on storage.objects;
create policy thread_image_anon_guard on storage.objects as restrictive for all to anon using(bucket_id<>'quest-thread-images') with check(bucket_id<>'quest-thread-images');
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='brand_message_likes') then
  alter publication supabase_realtime add table public.brand_message_likes;
 end if;
end $$;
notify pgrst,'reload schema';
commit;

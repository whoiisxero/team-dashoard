-- Order whole conversations by their newest message, including replies.
-- Invoker rights preserve all existing project/message row-level security.
begin;
create or replace function public.quest_thread_feed(target_project uuid,page_limit integer default 21)
returns setof public.brand_messages
language sql stable security invoker set search_path=''
as $$
 select m.* from public.brand_messages m
 where m.project_id=target_project and m.parent_id is null
 order by greatest(m.created_at,coalesce((
   select max(r.created_at) from public.brand_messages r
   where r.parent_id=m.id and r.project_id=m.project_id
 ),m.created_at)) desc,m.created_at desc,m.id desc
 limit least(greatest(coalesce(page_limit,21),1),1000);
$$;
revoke all on function public.quest_thread_feed(uuid,integer) from public,anon,authenticated;
grant execute on function public.quest_thread_feed(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;

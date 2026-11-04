-- In-app conversation alerts; no email or device push delivery.
begin;
-- This restriction also applies to administrators and any older permissive policy.
drop policy if exists notification_recipient_guard on public.team_notifications;
create policy notification_recipient_guard on public.team_notifications as restrictive for all to authenticated
using(recipient_id=auth.uid()) with check(recipient_id=auth.uid());
create or replace function public.capture_brand_message_notification()
returns trigger language plpgsql security definer set search_path=''
as $$ declare actor_label text; preview text; begin
 select display_name into actor_label from public.team_members where user_id=new.user_id;
 if actor_label is null then return null; end if;
 preview:=case when new.parent_id is null then 'Post · ' else 'Reply · ' end
   ||coalesce(nullif(btrim(new.body),''),'Shared photos');
 insert into public.team_notifications(recipient_id,actor_id,actor_name,source_table,source_id,action,item_title,project_id,access_scope)
 select m.user_id,new.user_id,actor_label,'brand_messages',new.id::text,'INSERT',left(preview,240),new.project_id,'project'
 from public.team_members m where m.user_id<>new.user_id and public.project_access_for(m.user_id,new.project_id);
 return null;
end $$;
revoke all on function public.capture_brand_message_notification() from public,anon,authenticated;
-- Replace the existing generic hook so each new post produces one alert per recipient.
drop trigger if exists notify_team_activity on public.brand_messages;
create trigger notify_team_activity after insert on public.brand_messages for each row execute function public.capture_brand_message_notification();
commit;

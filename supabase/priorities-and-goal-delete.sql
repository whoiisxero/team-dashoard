-- Run in Supabase SQL Editor to enable priorities and creator-owned goal deletion.
-- Existing project/task content is preserved. Rerunning reapplies Fragile's priority.
begin;
alter table public.projects add column if not exists priority text not null default 'normal'
  check(priority in ('normal','important','very_important'));
alter table public.projects add column if not exists priority_color text not null default 'amber'
  check(priority_color in ('amber','red','violet','blue'));
alter table public.tasks add column if not exists priority text not null default 'normal'
  check(priority in ('normal','important','very_important'));
alter table public.tasks add column if not exists priority_color text not null default 'amber'
  check(priority_color in ('amber','red','violet','blue'));

grant delete on public.goals to authenticated;
drop policy if exists own_goal_delete on public.goals;
create policy own_goal_delete on public.goals for delete to authenticated
  using(public.is_team_member() and created_by=auth.uid());
-- Also restrict any older permissive "team access" policy still installed.
drop policy if exists goal_delete_owner_guard on public.goals;
create policy goal_delete_owner_guard on public.goals as restrictive for delete to authenticated
  using(public.is_team_member() and created_by=auth.uid());

update public.projects set priority='very_important',priority_color='red'
where lower(btrim(name))='fragile';
commit;

-- This result confirms which Fragile project was updated.
select name,priority,priority_color from public.projects where lower(btrim(name))='fragile';

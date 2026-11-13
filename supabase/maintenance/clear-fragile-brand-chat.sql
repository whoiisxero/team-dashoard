rollback;
reset role;
begin;

delete from public.brand_messages
where project_id=(
  select id from public.projects
  where lower(btrim(name)) in ('fragile','fragile.')
);

delete from public.team_notifications
where source_table='brand_messages'
  and project_id=(
    select id from public.projects
    where lower(btrim(name)) in ('fragile','fragile.')
  );

commit;

select p.name as chat,count(m.id) as messages_remaining
from public.projects p
left join public.brand_messages m on m.project_id=p.id
where lower(btrim(p.name)) in ('fragile','fragile.')
group by p.id,p.name;
-- END CLEAR FRAGILE BRAND CHAT

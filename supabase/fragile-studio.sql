-- Shared Fragile brand chat and moodboard. Run once in Supabase SQL Editor.
-- Safe to rerun; does not move/delete existing project records or team messages.
begin;
create table if not exists public.brand_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  body text not null check(char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create table if not exists public.brand_moodboard_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  kind text not null check(kind in ('image','link','colour','note')),
  title text not null check(char_length(title) between 1 and 160),
  notes text not null default '' check(char_length(notes)<=12000),
  image_url text check(image_url is null or (image_url ~ '^https://' and char_length(image_url)<=2048)),
  colour text check(colour is null or colour ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  check(kind not in ('image','link') or image_url is not null),
  check(kind<>'colour' or colour is not null)
);
create index if not exists brand_messages_project_idx on public.brand_messages(project_id,created_at desc);
create index if not exists brand_moodboard_project_idx on public.brand_moodboard_items(project_id,created_at desc);
alter table public.brand_messages enable row level security;
alter table public.brand_moodboard_items enable row level security;
revoke all on public.brand_messages,public.brand_moodboard_items from public,anon,authenticated;
grant select,insert,delete on public.brand_messages,public.brand_moodboard_items to authenticated;
drop policy if exists team_read on public.brand_messages;
create policy team_read on public.brand_messages for select to authenticated using(public.is_team_member());
drop policy if exists own_insert on public.brand_messages;
create policy own_insert on public.brand_messages for insert to authenticated with check(public.is_team_member() and user_id=auth.uid());
drop policy if exists own_delete on public.brand_messages;
create policy own_delete on public.brand_messages for delete to authenticated using(public.is_team_member() and user_id=auth.uid());
drop policy if exists team_read on public.brand_moodboard_items;
create policy team_read on public.brand_moodboard_items for select to authenticated using(public.is_team_member());
drop policy if exists own_insert on public.brand_moodboard_items;
create policy own_insert on public.brand_moodboard_items for insert to authenticated with check(public.is_team_member() and created_by=auth.uid());
drop policy if exists own_delete on public.brand_moodboard_items;
create policy own_delete on public.brand_moodboard_items for delete to authenticated using(public.is_team_member() and created_by=auth.uid());
do $$ declare t text;begin
  foreach t in array array['brand_messages','brand_moodboard_items'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
    if to_regprocedure('public.capture_team_notification()') is not null then
      execute format('drop trigger if exists notify_team_activity on public.%I',t);
      execute format('create trigger notify_team_activity after insert or update or delete on public.%I for each row execute function public.capture_team_notification()',t);
    end if;
  end loop;
end $$;
commit;

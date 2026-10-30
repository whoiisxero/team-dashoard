-- Private quote documents; account membership and personal-workspace eligibility are required.
begin;
create table if not exists public.personal_quotes (
 id uuid primary key,
 owner_id uuid not null references public.team_members(user_id) on delete cascade,
 reference text not null,
 content jsonb not null,
 total_cents bigint not null check(total_cents>=0),
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_id,reference)
);
alter table public.personal_quotes enable row level security;
revoke all on public.personal_quotes from public,anon,authenticated;
grant select,delete on public.personal_quotes to authenticated;
drop policy if exists private_quotes_owner on public.personal_quotes;
create policy private_quotes_owner on public.personal_quotes for all to authenticated
using(owner_id=auth.uid() and public.has_personal_workspace())
with check(owner_id=auth.uid() and public.has_personal_workspace());
create or replace function public.quest_save_quote(quote_id uuid,content jsonb,expected_revision integer)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare old public.personal_quotes; saved public.personal_quotes; item jsonb; total bigint:=0; qty integer; price integer; k text; begin
 if not public.has_personal_workspace() then raise exception 'Private workspace access required.'; end if;
 if quote_id is null or jsonb_typeof(content) is distinct from 'object' or octet_length(content::text)>50000 then raise exception 'Invalid quote document.'; end if;
 foreach k in array array['business','client','email','contact','notes','valid_until','status'] loop
  if jsonb_typeof(content->k) is distinct from 'string' then raise exception 'Quote field % is required.',k; end if;
 end loop;
 if char_length(btrim(content->>'business')) not between 1 and 160 or char_length(btrim(content->>'client')) not between 1 and 160
 or char_length(content->>'email')>254 or char_length(content->>'contact')>1000 or char_length(content->>'notes')>5000
 or (content->>'status') not in ('draft','sent_manually','accepted','declined','paid','cancelled') then raise exception 'Check the quote details.'; end if;
 if coalesce(content->>'kind','quote') not in ('quote','invoice') then raise exception 'Invalid document type.'; end if;
 if coalesce(content->>'kind','quote')='quote' and content->>'status' in ('paid','cancelled') then raise exception 'Invalid quote status.'; end if;
 if content->>'kind'='invoice' and content->>'status' in ('accepted','declined') then raise exception 'Invalid invoice status.'; end if;
 if content->>'email'<>'' and (content->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid client email.'; end if;
 if content->>'valid_until'<>'' and not isfinite((content->>'valid_until')::date) then raise exception 'Choose a valid expiry date.'; end if;
 if jsonb_typeof(content->'items') is distinct from 'array' or jsonb_array_length(content->'items') not between 1 and 50 then raise exception 'Add between 1 and 50 service lines.'; end if;
 for item in select * from jsonb_array_elements(content->'items') loop
  if jsonb_typeof(item->'description') is distinct from 'string' or char_length(btrim(item->>'description')) not between 1 and 300
  or jsonb_typeof(item->'quantity') is distinct from 'number' or jsonb_typeof(item->'unit_cents') is distinct from 'number'
  or (item->>'quantity') !~ '^[0-9]+$' or (item->>'unit_cents') !~ '^[0-9]+$' then raise exception 'Check service description, quantity and price.'; end if;
  qty:=(item->>'quantity')::integer;price:=(item->>'unit_cents')::integer;
  if qty not between 1 and 10000 or price not between 0 and 100000000 then raise exception 'Service quantity or price is out of range.'; end if;
  total:=total+qty::bigint*price;
 end loop;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(quote_id::text,0));
 select * into old from public.personal_quotes where id=quote_id;
 if found then
  if old.owner_id<>auth.uid() then raise exception 'Quote is not available.'; end if;
  if coalesce(old.content->>'kind','quote')<>coalesce(content->>'kind','quote') then raise exception 'Document type cannot be changed.'; end if;
  if expected_revision is null and old.content=content then return to_jsonb(old); end if;
  if expected_revision is distinct from old.revision then raise exception 'Quote changed on another device. Copy your changes, close and reopen it.'; end if;
  update public.personal_quotes q set content=quest_save_quote.content,total_cents=total,revision=q.revision+1,updated_at=now() where q.id=quote_id returning * into saved;
 else
  if expected_revision is not null then raise exception 'Quote was removed. Copy your changes before closing.'; end if;
  insert into public.personal_quotes(id,owner_id,reference,content,total_cents)
  values(quote_id,auth.uid(),case when content->>'kind'='invoice' then 'INV-' else 'Q-' end||to_char(now() at time zone 'Africa/Johannesburg','YYYYMMDD')||'-'||upper(right(replace(quote_id::text,'-',''),12)),content,total) returning * into saved;
 end if;
 return to_jsonb(saved);
end $$;
revoke all on function public.quest_save_quote(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.quest_save_quote(uuid,jsonb,integer) to authenticated;
insert into public.quest_schema_migrations(version) values('20261030_private_quotes') on conflict do nothing;
notify pgrst,'reload schema';
commit;

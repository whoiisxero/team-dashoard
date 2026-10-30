import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
process.on('uncaughtException',e=>{console.error(e.message,e.where||'',e.position||'');process.exit(1);});
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,cas,other,project]=[1,2,3,10].map(id);
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create publication supabase_realtime;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated;`);
const sql=async file=>readFile(new URL('../supabase/'+file,import.meta.url),'utf8');
await db.exec((await sql('schema.sql')).replaceAll('\r\n','\n').replaceAll('do $\n','do $$$$\n').replaceAll('end $;','end $$$$;'));
for(const file of ['project-workspaces.sql','fragile-studio.sql','notifications.sql','member-access.sql','private-chats.sql',
  'migrations/20261021_daily_workflow.sql','migrations/20261026_project_edit_access.sql',
  'migrations/20261028_personal_workspaces.sql','migrations/20261028_personal_calendar.sql'])await db.exec(await sql(file));
await db.exec(`insert into auth.users values('${owner}','owner@example.test'),('${cas}','personal@example.test'),('${other}','other@example.test');
insert into team_members(user_id,display_name) values('${owner}','Owner'),('${cas}','Cas'),('${other}','Other');
insert into member_access(user_id,is_admin,project_mode,shared_access,personal_only) values
  ('${owner}',true,'all',true,false),('${cas}',false,'selected',false,true),('${other}',false,'all',true,false);
insert into projects(id,name) values('${project}','Team project');
insert into calendar_events(title,event_date,project_id,created_by) values('Team event','2030-01-01','${project}','${owner}');`);
const rows=async(q,args=[])=>(await db.query(q,args)).rows;
const dateOnly=value=>value instanceof Date?value.toISOString().slice(0,10):value;
const actor=async uid=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);if(uid)await db.exec('set role authenticated');};
const call='select quest_save_personal_event($1,$2,$3,$4,$5,$6,$7,$8,$9) e';

await db.exec(await sql('migrations/20261030_private_quotes.sql'));await actor(cas);
const payload={business:'Ki Lifestyle',client:'Client One',email:'client@example.test',contact:'Carol',notes:'Session details',valid_until:'2030-01-30',status:'draft',items:[{description:'Massage',quantity:2,unit_cents:33333},{description:'Lymphatic drainage',quantity:1,unit_cents:120000}]};
const save='select quest_save_quote($1,$2::jsonb,$3) q';
let quote=(await rows(save,[id(80),JSON.stringify(payload),null]))[0].q;
assert.equal(quote.total_cents,186666);assert.equal(quote.revision,1);assert.equal(quote.owner_id,cas);
assert.equal((await rows(save,[id(80),JSON.stringify(payload),null]))[0].q.revision,1);
await assert.rejects(db.exec("insert into personal_quotes(id,owner_id,reference,content,total_cents) values(gen_random_uuid(),auth.uid(),'bypass','{}',0)"),/permission denied/);
const bad={...payload,items:[{description:'bad',quantity:1,unit_cents:-1}]};await assert.rejects(db.query(save,[id(81),JSON.stringify(bad),null]),/description|range/);
const changed={...payload,client:'Updated client',total_cents:1};quote=(await rows(save,[id(80),JSON.stringify(changed),1]))[0].q;assert.equal(quote.total_cents,186666);assert.equal(quote.revision,2);
await assert.rejects(db.query(save,[id(80),JSON.stringify(payload),1]),/changed on another device/);
const invoice={...payload,kind:'invoice',status:'paid'};const invoiceRow=(await rows(save,[id(90),JSON.stringify(invoice),null]))[0].q;assert(invoiceRow.reference.startsWith('INV-'));assert.equal(invoiceRow.total_cents,186666);await assert.rejects(db.query(save,[id(90),JSON.stringify(payload),1]),/Document type/);
await actor(owner);assert.equal((await rows('select * from personal_quotes')).length,0);await assert.rejects(db.query(save,[id(80),JSON.stringify(payload),2]),/not available/);
assert.equal((await rows('delete from personal_quotes returning id')).length,0);
await actor(other);assert.equal((await rows('select * from personal_quotes')).length,0);await assert.rejects(db.query(save,[id(81),JSON.stringify(payload),null]),/workspace access/);
await actor(null);await db.exec(await sql('migrations/20261030_private_quotes.sql'));await db.query('update member_access set personal_only=false where user_id=$1',[cas]);await actor(cas);assert.equal((await rows('select * from personal_quotes')).length,0);await assert.rejects(db.query(save,[id(81),JSON.stringify(payload),null]),/workspace access/);
await actor(null);await db.query('update member_access set personal_only=true where user_id=$1',[cas]);await actor(cas);await db.exec('delete from personal_quotes');await assert.rejects(db.query(save,[id(80),JSON.stringify(payload),2]),/removed/);
await actor(null);
const vm=await import('node:vm');const sandbox={window:{}};vm.runInNewContext(await readFile(new URL('../owner-enrollment.js',import.meta.url),'utf8'),sandbox);
const enroll=sandbox.window.questPersonalEnrollmentSQL({email:'personal@example.test',name:'Carol',business:'Ki Lifestyle'});
await db.exec(enroll);await db.exec(enroll);await actor(cas);assert.equal((await rows('select my_dashboard_access() p'))[0].p.personal_only,true);assert.equal((await rows('select business_name from personal_profiles'))[0].business_name,'Ki Lifestyle');assert.equal((await rows('select preferred_name from personal_profiles'))[0].preferred_name,'Carol');assert.equal((await rows('select * from private_chat_rooms')).length,1);assert.equal((await rows('select * from projects')).length,0);
await db.close();console.log('PASS private quotes: own-only RLS including admin exclusion, exact cents, RPC-only writes, retry IDs, revisions, revocation, deletion and repeat-safe migration.');

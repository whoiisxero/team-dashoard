// PGLITE_MODULE=/tmp/quest-notification-db/node_modules/@electric-sql/pglite/dist/index.js node tests/member-access-db.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
process.on('uncaughtException',error=>{const pos=Number(error.position||0);console.error(error.message,error.position||'',error.where||'',pos?error.query?.slice(pos-120,pos+60):'');process.exit(1);});
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [quan,tertius,josh,stranger]=[1,2,3,4].map(uid);
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create publication supabase_realtime;`);
const sql=async file=>readFile(new URL('../supabase/'+file,import.meta.url),'utf8');
// The original uploaded schema has two pre-existing single-dollar DO delimiters.
await db.exec((await sql('schema.sql')).replaceAll('\r\n','\n').replaceAll('do $\n','do $$$$\n').replaceAll('end $;','end $$$$;'));
await db.exec(await sql('project-workspaces.sql'));await db.exec(await sql('fragile-studio.sql'));await db.exec(await sql('notifications.sql'));
await db.exec(`insert into auth.users values('${quan}'),('${tertius}'),('${josh}'),('${stranger}');
insert into team_members(user_id,display_name) values('${quan}','Quan'),('${tertius}','Tertius'),('${josh}','Josh');
insert into projects(id,name) values('${uid(10)}','Dusted.'),('${uid(11)}','Fragile');`);
const dusted=uid(10),fragile=uid(11);
for(const table of ['tasks','expenses','goals','calendar_events','project_notes','brand_messages','brand_moodboard_items']){
 const author=table==='brand_messages'?'user_id':'created_by';
 const fields=table==='brand_messages'?',body':table==='brand_moodboard_items'?',title,kind':table==='calendar_events'?',title,event_date':table==='expenses'?',title,amount':table==='project_notes'?',title,body':',title';
 const values=table==='brand_messages'?",'Private conversation'":table==='brand_moodboard_items'?",'Private pin','note'":table==='calendar_events'?",'Private date','2026-10-20'":table==='expenses'?",'Private cost',100":table==='project_notes'?",'Private note','Owner brief'":",'Private work'";
 await db.exec(`insert into ${table}(project_id,${author}${fields}) values('${dusted}','${quan}'${values}),('${fragile}','${quan}'${values});`);
}
await db.exec(`insert into tasks(title,created_by) values('Unlinked secret','${quan}');insert into discussion_messages(body,user_id) values('Main team chat','${quan}');`);
await db.exec(`create function public.legacy_notify() returns trigger language plpgsql as $$ begin /* notify-team legacy external delivery */ return NEW; end $$;
create trigger legacy_email after insert on public.tasks for each row execute function public.legacy_notify();`);
await db.exec(await sql('member-access.sql'));await db.exec(await sql('member-access.sql'));
assert.equal((await db.query("select tgenabled from pg_trigger where tgname='legacy_email'")).rows[0].tgenabled,'D');
assert.equal((await db.query('select * from paused_notification_hooks')).rows.length,1);
await db.exec(`update member_access set is_admin=true,project_mode='all',shared_access=true where user_id='${quan}';
update member_access set project_mode='all',shared_access=true where user_id='${tertius}';
update projects set access_restricted=true where id='${dusted}';
insert into project_member_access values('${josh}','${dusted}',true),('${tertius}','${dusted}',false);`);
const actor=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);if(id)await db.exec('set role authenticated');};
const rows=async query=>(await db.query(query)).rows;
for(const member of [tertius,josh]){
 await actor(member);const expected=member===josh?dusted:fragile,forbidden=member===josh?fragile:dusted;
 assert((await rows('select id from projects')).some(p=>p.id===expected));assert(!(await rows('select id from projects')).some(p=>p.id===forbidden));
 for(const table of ['tasks','expenses','goals','calendar_events','project_notes','brand_messages','brand_moodboard_items']){
  assert.equal((await rows(`select * from ${table} where project_id='${expected}'`)).length,1,`${member}: allowed ${table}`);
  assert.equal((await rows(`select * from ${table} where project_id='${forbidden}'`)).length,0,`${member}: forbidden ${table}`);
 }
 assert.equal((await rows(`update tasks set status='Done' where project_id='${forbidden}' returning id`)).length,0);
 await assert.rejects(db.exec(`insert into tasks(project_id,title,created_by) values('${forbidden}','Intrusion','${member}')`),/row-level security/);
 await assert.rejects(db.exec(`insert into brand_messages(project_id,user_id,body) values('${forbidden}','${member}','Intrusion')`),/row-level security/);
 await assert.rejects(db.exec(`select set_member_access('${member}','all',true,'{}')`),/Only the team owner/);
 await assert.rejects(db.exec(`update member_access set is_admin=true where user_id='${member}'`),/permission denied/);
 await assert.rejects(db.exec(`insert into project_member_access values('${member}','${forbidden}',true)`),/permission denied/);
 assert.equal((await rows(`select * from team_notifications where project_id='${forbidden}'`)).length,0,'historical notification guard');
}
await actor(null);await db.exec('create policy owner_only_roster on team_members as restrictive for select to authenticated using(public.access_admin())');
await actor(josh);
assert.equal((await rows('select my_team_profile() as profile'))[0].profile.user_id,josh);
assert.equal((await rows('select * from team_members')).length,0,'A hidden roster must not block the own-profile RPC');
assert.equal((await rows('select * from discussion_messages')).length,0);assert.equal((await rows('select * from team_settings')).length,0);
assert.equal((await rows('select * from tasks where project_id is null')).length,0);
await assert.rejects(db.exec(`insert into discussion_messages(body,user_id) values('Bypass','${josh}')`),/row-level security/);
await assert.rejects(db.exec(`insert into tasks(title,created_by) values('Unscoped','${josh}')`),/row-level security/);
await assert.rejects(db.exec(`insert into projects(name) values('New private project')`),/row-level security/);
await assert.rejects(db.exec(`update projects set access_restricted=false where id='${dusted}'`),/Only the owner/);
await db.exec(`insert into brand_messages(project_id,user_id,body) values('${dusted}','${josh}','Josh private reply')`);
await actor(tertius);assert.equal((await rows('select * from discussion_messages')).length,1);
await db.exec("insert into projects(name) values('Future public project')");
await actor(josh);assert(!(await rows('select name from projects')).some(p=>p.name==='Future public project'));
await actor(quan);await db.exec(`insert into projects(name,access_restricted) values('Future private project',true)`);
assert.equal((await rows('select * from discussion_messages')).length,1);
await db.exec(`insert into brand_messages(project_id,user_id,body) values('${dusted}','${quan}','Quan private reply')`);
await actor(tertius);assert.equal((await rows("select * from projects where name='Future private project'")).length,0);
assert.equal((await rows("select * from team_notifications where source_table='brand_messages' and project_id='"+dusted+"'")).length,0);
await actor(josh);assert((await rows("select * from team_notifications where source_table='brand_messages' and project_id='"+dusted+"'")).length>0);
// Access revocation hides old snapshots immediately, including unread counts.
await actor(quan);await db.exec(`select set_member_access('${josh}','selected',false,'{}')`);
await actor(josh);assert.equal((await rows('select * from projects')).length,0);assert.equal((await rows('select * from team_notifications')).length,0);
await actor(quan);await assert.rejects(db.exec(`select set_member_access('${quan}','selected',false,'{}')`),/Owner access/);
await db.exec(`select set_member_access('${josh}','selected',false,array['${dusted}']::uuid[])`);
// All members can send heartbeats; only the owner can read online status.
await actor(josh);await db.exec(`select touch_member_presence('${uid(40)}');select touch_member_presence('${uid(41)}')`);
assert.equal((await rows('select * from team_online_members()')).length,0);
await assert.rejects(db.exec(`insert into member_presence values('${quan}','${uid(42)}',now())`),/permission denied/);
await actor(tertius);assert.equal((await rows('select * from team_online_members()')).length,0);
await actor(quan);assert((await rows('select * from team_online_members()')).find(m=>m.user_id===josh).online);
await actor(josh);await db.exec(`select leave_member_presence('${uid(40)}')`);
await actor(quan);assert((await rows('select * from team_online_members()')).find(m=>m.user_id===josh).online);
await actor(null);await db.exec(`update member_presence set last_seen=now()-interval '91 seconds'`);
await actor(quan);assert(!(await rows('select * from team_online_members()')).find(m=>m.user_id===josh).online);
await actor(stranger);assert.equal((await rows('select * from team_online_members()')).length,0);
assert.equal((await rows('select my_team_profile() as profile'))[0].profile,null);
await assert.rejects(db.exec(`select touch_member_presence('${uid(43)}')`),/Team access/);
await actor(null);await db.exec('set role anon');await assert.rejects(db.exec('select my_dashboard_access()'),/permission denied/);
// Removing a private project must not expose its SET NULL children as shared.
await actor(null);await db.exec(`delete from projects where id='${dusted}'`);
await actor(tertius);assert(!(await rows('select * from tasks')).some(t=>t.access_project_id===dusted));
await actor(josh);assert(!(await rows('select * from tasks')).some(t=>t.access_project_id===dusted));
await actor(quan);assert((await rows('select * from tasks')).some(t=>t.access_project_id===dusted));
// A new unconfigured member receives neither project access nor owner status.
await actor(null);await db.exec(`insert into team_members(user_id,display_name) values('${stranger}','Quan')`);
await actor(stranger);assert.equal((await rows('select * from projects')).length,0);
assert.equal((await rows('select my_dashboard_access() as access'))[0].access.is_admin,false);
await db.close();console.log('PASS database permissions: Tertius excludes Dusted; Josh only Dusted; direct reads/writes, private chat, historical and future notifications, future projects, escalation attempts, revocation, owner safety, multi-tab presence, TTL and anonymous access.');

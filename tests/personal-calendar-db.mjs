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
const event=[id(30),'Personal appointment','Private preparation text','Local studio','2030-01-01','10:30','Africa/Johannesburg','2020-01-01 09:00',null];
await actor(cas);
assert.equal((await rows('select my_dashboard_access() p'))[0].p.personal_calendar_ready,true);
const created=(await rows(call,event))[0].e;
assert.equal(created.owner_id,cas);assert.equal(created.title,'Personal appointment');assert.equal(created.revision,1);
assert.equal(new Date(created.event_starts_at).toISOString(),'2030-01-01T08:30:00.000Z');
assert.equal(new Date(created.remind_at).toISOString(),'2020-01-01T07:00:00.000Z');
assert.equal((await rows(call,event))[0].e.revision,1,'Retrying a confirmed create does not duplicate or revise the event');
assert.equal((await rows('select * from personal_calendar_events')).length,1);
assert.equal((await rows('select * from calendar_events')).length,0,'No team events become available to Cas');
assert.equal((await rows('select * from projects')).length,0);
await assert.rejects(db.query('insert into personal_calendar_events(owner_id,title,event_date) values($1,$2,$3)',[cas,'Direct bypass','2030-01-02']),/permission denied/);
await assert.rejects(db.query('update personal_calendar_events set title=$1 where id=$2',['Tamper',id(30)]),/permission denied/);
await assert.rejects(db.query('select queue_personal_event_reminders_for($1)',[owner]),/permission denied/);
await assert.rejects(db.exec('select queue_due_quest_reminders()'),/permission denied/);
assert.equal((await rows('select can_access_personal_event($1) ok',[id(30)]))[0].ok,true);

const changed=[...event];changed[1]='Updated appointment';changed[5]='11:45';changed[8]=1;
const updated=(await rows(call,changed))[0].e;assert.equal(updated.revision,2);
assert.equal(new Date(updated.event_starts_at).toISOString(),'2030-01-01T09:45:00.000Z');
await assert.rejects(db.query(call,changed),/changed on another device/);
const differentRetry=[...event];differentRetry[1]='Not the same create';await assert.rejects(db.query(call,differentRetry),/changed on another device/);

const allDay=[id(31),'Private all-day event','','','2030-01-02',null,'Africa/Johannesburg',null,null];
const day=(await rows(call,allDay))[0].e;assert.equal(day.event_time,null);
assert.equal(new Date(day.event_starts_at).toISOString(),'2030-01-02T07:00:00.000Z');
const tokyo=[id(32),'Tokyo call','','Online','2030-01-03','09:00','Asia/Tokyo',null,null];
assert.equal(new Date((await rows(call,tokyo))[0].e.event_starts_at).toISOString(),'2030-01-03T00:00:00.000Z');
const gap=[id(33),'Nonexistent local time','','','2027-03-14','02:30','America/New_York',null,null];
await assert.rejects(db.query(call,gap),/local time does not exist/);
gap[5]='03:30';gap[7]='2027-03-14 02:30';await assert.rejects(db.query(call,gap),/local time does not exist/);
const fold=[id(34),'Repeated local time','','','2026-11-01','01:30','America/New_York',null,null];
assert.equal(new Date((await rows(call,fold))[0].e.event_starts_at).toISOString(),'2026-11-01T06:30:00.000Z');
const invalid=[...event];invalid[0]=id(35);invalid[6]='Not/AZone';await assert.rejects(db.query(call,invalid),/valid event date and time zone/);
invalid[6]='Africa/Johannesburg';invalid[4]=null;await assert.rejects(db.query(call,invalid),/valid event date and time zone/);
const blankTitle=[...allDay];blankTitle[0]=id(36);blankTitle[1]='   ';
await assert.rejects(db.query(call,blankTitle),/check constraint/);
const oversized=[...allDay];oversized[0]=id(37);oversized[3]='x'.repeat(301);
await assert.rejects(db.query(call,oversized),/check constraint/);

assert.equal((await rows('select refresh_my_reminders() n'))[0].n,1);
assert.equal((await rows('select refresh_my_reminders() n'))[0].n,0,'Event reminders deduplicate across refreshes');
let notices=await rows("select * from team_notifications where access_scope='personal_event'");
assert.equal(notices.length,1);assert.equal(notices[0].personal_event_id,id(30));assert.equal(dateOnly(notices[0].event_date),'2030-01-01');
assert.equal(notices[0].source_table,'personal_calendar_events');assert(!JSON.stringify(notices).includes('Private preparation text'));
const oldNotice=notices[0].id;
// Upgrade bundles reapply the earlier workspace migration first. Existing event
// reminders must survive its constraint recreation before this final migration.
await actor(null);await db.exec(await sql('migrations/20261028_personal_workspaces.sql'));
await db.exec(await sql('migrations/20261028_personal_calendar.sql'));await actor(cas);
assert.equal((await rows("select * from team_notifications where access_scope='personal_event'")).length,1);
changed[4]='2030-01-04';changed[8]=2;await db.query(call,changed);
assert.equal((await rows('select refresh_my_reminders() n'))[0].n,1,'Rescheduled events get a fresh reminder');
notices=await rows("select * from team_notifications where access_scope='personal_event'");
assert.equal(notices.length,1);assert.equal(dateOnly(notices[0].event_date),'2030-01-04');assert.notEqual(notices[0].id,oldNotice);

await actor(owner);
assert.equal((await rows('select * from personal_calendar_events')).length,0,'Even the team owner cannot read Cas’s events');
assert.equal((await rows('select can_access_personal_event($1) ok',[id(30)]))[0].ok,false);
assert.equal((await rows("select * from team_notifications where access_scope='personal_event'")).length,0);
await assert.rejects(db.query(call,changed),/not available/);
assert.equal((await rows('delete from personal_calendar_events where id=$1 returning id',[id(30)])).length,0);
assert.equal((await rows('select * from calendar_events')).length,1,'Team calendar remains unchanged');
const own=[id(40),'Owner’s private event','','','2030-02-01','12:00','Africa/Johannesburg',null,null];await db.query(call,own);
await actor(other);assert.equal((await rows('select * from personal_calendar_events')).length,0);
await assert.rejects(db.query(call,[id(41),'No workspace','','','2030-01-01',null,'Africa/Johannesburg',null,null]),/Personal workspace access required/);
await actor(cas);assert.equal((await rows('select * from personal_calendar_events where id=$1',[id(40)])).length,0);

// Turning reminders off prevents new deliveries; removing the reminder removes
// its existing inbox snapshot on the next refresh.
await db.exec('update notification_preferences set enabled=false where user_id=auth.uid()');
changed[4]='2030-01-05';changed[8]=3;await db.query(call,changed);
assert.equal((await rows('select refresh_my_reminders() n'))[0].n,0);
assert.equal((await rows("select * from team_notifications where access_scope='personal_event'")).length,0);
await db.exec('update notification_preferences set enabled=true where user_id=auth.uid()');
assert.equal((await rows('select refresh_my_reminders() n'))[0].n,1);
changed[7]=null;changed[8]=4;await db.query(call,changed);await db.exec('select refresh_my_reminders()');
assert.equal((await rows("select * from team_notifications where access_scope='personal_event'")).length,0);
changed[7]='2020-01-01 09:00';changed[8]=5;await db.query(call,changed);await db.exec('select refresh_my_reminders()');
assert.equal((await rows("select * from team_notifications where access_scope='personal_event'")).length,1);
await db.query('delete from personal_calendar_events where id=$1',[id(30)]);
assert.equal((await rows("select * from team_notifications where access_scope='personal_event'")).length,0,'Deleting an event cascades its reminders');
await assert.rejects(db.query(call,changed),/event was removed/);

// Calendar setup may be rerun and preserves other private data. Old setup bundles
// should be followed by this migration to restore the newest guards/wrappers.
await actor(null);await db.exec(await sql('migrations/20261028_personal_calendar.sql'));
await actor(cas);assert.equal((await rows('select * from personal_calendar_events')).length,3);
const reminderBeforeRevocation=[...allDay];reminderBeforeRevocation[7]='2020-01-01 08:00';reminderBeforeRevocation[8]=1;
await db.query(call,reminderBeforeRevocation);assert.equal((await rows('select refresh_my_reminders() n'))[0].n,1);
await actor(null);await db.query('update member_access set personal_only=false where user_id=$1',[cas]);
await actor(cas);assert.equal((await rows('select * from personal_calendar_events')).length,0,'Revocation hides existing events immediately');
assert.equal((await rows("select * from team_notifications where access_scope='personal_event'")).length,0,'Revocation also hides event reminder snapshots');
assert.equal((await rows('select refresh_my_reminders() n'))[0].n,0,'Revoked workspaces cannot queue personal reminders');
await assert.rejects(db.query(call,allDay),/Personal workspace access required/);
await actor(null);await db.exec('set role anon');await assert.rejects(db.exec('select * from personal_calendar_events'),/permission denied/);
await assert.rejects(db.query(call,allDay),/permission denied/);
await assert.rejects(db.query('select can_access_personal_event($1)',[id(31)]),/permission denied/);
await actor(null);await db.query('update member_access set personal_only=true where user_id=$1',[cas]);
await db.exec(await sql('migrations/20261028_personal_workspaces.sql'));
await db.exec(await sql('migrations/20261028_personal_calendar.sql'));
await actor(cas);assert.equal((await rows('select * from personal_calendar_events')).length,3);
await db.close();console.log('PASS personal calendar DB: private CRUD even from owner, team isolation, retry-safe saves, conflicts, all-day/timezone/DST handling, event reminders and rescheduling cleanup, deletion, revocation, anonymous denial and repeat migrations.');

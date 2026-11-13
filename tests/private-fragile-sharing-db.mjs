import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareSharedFragile} from '../scripts/prepare-shared-fragile.mjs';
process.on('uncaughtException',error=>{console.error(error.message,error.where||'');process.exit(1);});
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,kazz,josh,cas,fragile,dusted,ngl,note,secret,writing,weed,casNote,parent,reply,otherMessage,chat,otherChat]=[1,2,3,4,10,11,12,30,31,32,33,34,40,41,42,50,51].map(id);
const jen='5c9e7be8-1956-47aa-8449-d482851edac9';
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create publication supabase_realtime;
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated;`);
const sql=async file=>readFile(new URL('../supabase/'+file,import.meta.url),'utf8');
await db.exec((await sql('schema.sql')).replaceAll('\r\n','\n').replaceAll('do $\n','do $$$$\n').replaceAll('end $;','end $$$$;'));
for(const file of ['project-workspaces.sql','fragile-studio.sql','notifications.sql','member-access.sql','private-chats.sql','migrations/20261021_daily_workflow.sql','migrations/20261026_project_edit_access.sql','migrations/20261028_personal_workspaces.sql'])await db.exec(await sql(file));

for(const file of ['migrations/20261104_dusted_threads.sql','migrations/20261104_chat_notifications.sql','migrations/20261106_studio_only_members.sql'])await db.exec(await sql(file));
const rows=async(q,args=[])=>(await db.query(q,args)).rows;
const actor=async uid=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);if(uid)await db.exec('set role authenticated');};
await db.exec(`insert into auth.users(id,email) values('${owner}','owner@example.test'),('${jen}','demonjinxxxx@gmail.com'),('${kazz}','kazz@example.test'),('${josh}','josh@example.test'),('${cas}','cas@example.test');
insert into team_members(user_id,display_name) values('${owner}','Quan'),('${jen}','Fragile collaborator'),('${kazz}','Kazz'),('${josh}','Josh'),('${cas}','Cas');
insert into member_access(user_id,is_admin,project_mode,shared_access,personal_only) values('${owner}',true,'all',true,false),('${jen}',false,'selected',false,false),('${kazz}',false,'selected',false,false),('${josh}',false,'selected',false,false),('${cas}',false,'selected',false,true);
insert into projects(id,name,access_restricted) values('${fragile}','Fragile',false),('${dusted}','Dusted.',true),('${ngl}','NGL',true);
update member_access set directory_hidden=true,studio_only_project_id='${fragile}',studio_display_name='Jen',editable_project_ids=array['${fragile}'::uuid] where user_id='${jen}';
insert into project_member_access values('${jen}','${fragile}',true),('${kazz}','${fragile}',true),('${josh}','${dusted}',true);
insert into personal_profiles(user_id,preferred_name) values('${owner}','Quan'),('${cas}','Cas');
insert into personal_notes(id,owner_id,kind,title,body,category) values
 ('${note}','${owner}','business','Fragile private plan','Shared after invitation','Fragile / Private'),
 ('${secret}','${owner}','business','Private business secret','Never share this','Business'),
 ('${writing}','${owner}','writing','Owner personal writing','Never share this either','Writing'),
 ('${weed}','${owner}','writing','Owner private diary','Diary stays private','Weed diary / Private'),
 ('${casNote}','${cas}','business','Cas private Fragile note','Other owner','Fragile / Private');
insert into private_chat_rooms(id,room_key,name,project_id,created_by) values('${chat}','old-jen-room','Previous private conversation','${fragile}','${owner}'),('${otherChat}','other-room','Other private conversation','${dusted}','${owner}');
insert into private_chat_members values('${chat}','${jen}'),('${chat}','${owner}'),('${otherChat}','${josh}'),('${otherChat}','${owner}');
insert into private_chat_messages(room_id,user_id,body) values('${chat}','${owner}','Preserve old private history'),('${otherChat}','${josh}','Other private history');
insert into brand_messages(id,project_id,user_id,body) values('${parent}','${fragile}','${owner}','Old Fragile brand post'),('${otherMessage}','${dusted}','${josh}','Keep Dusted post');
insert into brand_messages(id,project_id,user_id,body,parent_id) values('${reply}','${fragile}','${jen}','Old Fragile reply','${parent}');
insert into brand_message_likes(message_id,project_id,user_id) values('${parent}','${fragile}','${owner}'),('${otherMessage}','${dusted}','${owner}');
insert into brand_moodboard_items(project_id,created_by,kind,title) values('${fragile}','${owner}','note','Keep moodboard reference');
insert into tasks(project_id,created_by,title) values('${fragile}','${owner}','Keep Fragile task');`);
const otherProfiles=await rows('select * from member_access where user_id<>$1 order by user_id',[jen]);
const otherRules=await rows('select * from project_member_access where user_id<>$1 order by user_id,project_id',[jen]);
const noteSnapshots=await rows('select * from personal_notes order by id');
const setup=await prepareSharedFragile();
// Missing project fails atomically, before chat data or membership can change.
await db.query("update projects set name='Other name' where id=$1",[fragile]);await assert.rejects(db.exec(setup),/exactly one Fragile project/);await db.exec('rollback');
assert.equal((await rows('select count(*)::int as n from brand_messages where project_id=$1',[fragile]))[0].n,2);
await db.query("update projects set name='Fragile' where id=$1",[fragile]);await db.exec(setup);await db.exec(await sql('maintenance/clear-fragile-brand-chat.sql'));
assert.equal((await rows('select count(*)::int as n from brand_messages where project_id=$1',[fragile]))[0].n,0);
assert.equal((await rows('select count(*)::int as n from brand_message_likes where project_id=$1',[fragile]))[0].n,0);
assert.equal((await rows("select count(*)::int as n from team_notifications where source_table='brand_messages' and project_id=$1",[fragile]))[0].n,0);
assert.equal((await rows('select count(*)::int as n from brand_messages where project_id=$1',[dusted]))[0].n,1);
assert.equal((await rows('select count(*)::int as n from brand_message_likes where project_id=$1',[dusted]))[0].n,1);
assert.equal((await rows('select count(*)::int as n from private_chat_messages'))[0].n,2);
assert.equal((await rows('select count(*)::int as n from brand_moodboard_items'))[0].n,1);
assert.equal((await rows('select count(*)::int as n from tasks'))[0].n,1);
assert.deepEqual(await rows('select * from personal_notes order by id'),noteSnapshots);
assert.deepEqual(await rows('select * from project_member_access where user_id<>$1 order by user_id,project_id',[jen]),otherRules);
// The migration adds two fields with neutral defaults for unrelated members.
for(const r of otherProfiles){r.private_fragile_owner_id=null;r.private_fragile_can_edit=false;}
assert.deepEqual(await rows('select * from member_access where user_id<>$1 order by user_id',[jen]),otherProfiles);
await actor(jen);const policy=(await rows('select my_dashboard_access() p'))[0].p;
assert.equal(policy.private_fragile_owner_id,owner);assert.equal(policy.private_fragile_can_edit,true);assert.equal(policy.shared_access,false);assert.equal(policy.can_create_projects,false);assert.equal(policy.studio_only_project_id,null);
assert.deepEqual((await rows('select id from personal_notes')).map(r=>r.id),[note]);
assert.deepEqual((await rows('select user_id from team_members')).map(r=>r.user_id),[owner]);
assert.equal((await rows('select * from personal_profiles')).length,0);
for(const table of ['projects','tasks','brand_messages','brand_moodboard_items','discussion_messages','private_chat_rooms','private_chat_messages'])assert.equal((await rows('select * from '+table)).length,0,table);
await assert.rejects(db.query("insert into brand_messages(project_id,user_id,body) values($1,$2,'Denied')",[fragile,jen]),/row-level security/);
const save='select quest_save_shared_fragile_note($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) n';
const args=[note,'business','Updated shared plan','Edited with permission','Fragile / Private',false,'in_progress',null,null,'Africa/Johannesburg',1];
const edited=(await rows(save,args))[0].n;assert.equal(edited.owner_id,owner);assert.equal(edited.revision,2);
await assert.rejects(db.query(save,args),/changed on another device/);
for(const hidden of [secret,writing,weed,casNote])await assert.rejects(db.query(save,[hidden,...args.slice(1)]),/not available/);
await assert.rejects(db.query(save,[id(70),'business','Hidden','Hidden','Business',false,'open',null,null,'Africa/Johannesburg',null]),/Only My Fragile/);
await assert.rejects(db.query('select quest_save_personal_note($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id(71),'business','Other notebook','Private','Business',false,'open',null,null,'Africa/Johannesburg',null]),/Personal workspace/);
assert.equal((await rows('delete from personal_notes where id=$1 returning id',[note])).length,0,'Direct delete remains author-only');
const create=[id(72),'business','Guest contribution','Shared content','Fragile / Private',false,'open','2030-01-01 10:00',null,'Africa/Johannesburg',null];
const created=(await rows(save,create))[0].n;assert.equal(created.owner_id,owner);assert.equal(new Date(created.due_at).toISOString(),'2030-01-01T08:00:00.000Z');
assert.equal((await rows(save,create))[0].n.id,created.id,'Retry preserves note ID');
await assert.rejects(db.query('select quest_delete_shared_fragile_note($1,$2)',[secret,1]),/not available/);
assert.equal((await rows('select quest_delete_shared_fragile_note($1,$2) ok',[created.id,1]))[0].ok,true);
for(const member of [kazz,josh,cas]){await actor(member);assert.equal((await rows('select * from personal_notes where id=$1',[note])).length,0);await assert.rejects(db.query(save,args),/Shared Fragile editing access/);}
await actor(owner);assert.equal((await rows('select private_fragile_shared from (select my_dashboard_access() p) x,jsonb_to_record(x.p) as r(private_fragile_shared boolean)'))[0].private_fragile_shared,true);
assert.equal((await rows('select count(*)::int as n from personal_notes'))[0].n,4);
// Old permission editors cannot broaden a private-Fragile-only guest's reach.
await actor(null);await db.query("update member_access set project_mode='all',shared_access=true,personal_only=true where user_id=$1",[jen]);await db.query('insert into project_member_access values($1,$2,true)',[jen,fragile]);await db.query('insert into private_chat_members values($1,$2)',[otherChat,jen]);
await actor(jen);assert.equal((await rows('select * from projects')).length,0);assert.equal((await rows('select * from private_chat_rooms')).length,0);assert.equal((await rows('select * from personal_profiles')).length,0);assert.equal((await rows('select has_personal_workspace() ok'))[0].ok,false);
// A successful retry must preserve new brand messages posted after the clear-out.
await actor(null);await db.query("insert into brand_messages(project_id,user_id,body) values($1,$2,'Fresh Fragile post')",[fragile,kazz]);await db.exec(setup);assert.equal((await rows('select count(*)::int as n from brand_messages where project_id=$1',[fragile]))[0].n,1);
assert.equal((await rows('select * from personal_notes where id=$1',[note]))[0].body,'Edited with permission');
await db.query('update member_access set private_fragile_can_edit=false where user_id=$1',[jen]);await actor(jen);assert.equal((await rows('select * from personal_notes')).length,1);await assert.rejects(db.query(save,[...args.slice(0,-1),2]),/editing access/);
await actor(null);await db.query('update member_access set private_fragile_owner_id=null,private_fragile_can_edit=false where user_id=$1',[jen]);await actor(jen);assert.equal((await rows('select * from personal_notes')).length,0);await assert.rejects(db.query(save,args),/editing access/);
await actor(null);await db.exec('set role anon');await assert.rejects(db.exec('select * from personal_notes'),/permission denied/);
await actor(null);await db.close();console.log('PASS private My Fragile sharing: category/owner-scoped RLS, guest edits/revisions/retries/deletes, denied private notebooks/projects/chats/roster and legacy editor bypasses, readonly/revoked/anonymous access, scoped standalone brand-chat clear with reply/like/notice cleanup, preserved other data and safe setup failure.');

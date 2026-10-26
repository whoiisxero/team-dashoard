import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareMemberEnrollment} from '../scripts/prepare-member-enrollment.mjs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [quan,tertius,josh,jen]=[1,2,3,4].map(id),member=id(5);
await db.exec(`create role anon;create role authenticated;create schema auth;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create publication supabase_realtime;
create schema storage;create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;
create policy legacy_storage on storage.objects for all to authenticated using(true) with check(true);`);
const sql=async name=>readFile(new URL('../supabase/'+name,import.meta.url),'utf8');
await db.exec((await sql('schema.sql')).replaceAll('\r\n','\n').replaceAll('do $\n','do $$$$\n').replaceAll('end $;','end $$$$;'));
for(const file of ['project-workspaces.sql','fragile-studio.sql','notifications.sql','member-access.sql','private-chats.sql'])await db.exec(await sql(file));
await db.exec(`insert into auth.users(id,email) values('${quan}','quan@example.test'),('${tertius}','tertius@example.test'),('${josh}','josh@example.test'),('${jen}','jen@example.test');
insert into auth.users values('${member}','new.member@example.test','{"name":"New Member"}');
insert into team_members(user_id,display_name) values('${quan}','Quan'),('${tertius}','Tertius'),('${josh}','Josh'),('${jen}','Jen');
insert into member_access(user_id,is_admin,project_mode,shared_access) values('${quan}',true,'all',true),('${tertius}',false,'all',true),('${josh}',false,'selected',false),('${jen}',false,'selected',false);
insert into projects(id,name,access_restricted) values('${id(10)}','Dusted.',true),('${id(11)}','Fragile',false);
insert into project_member_access values('${tertius}','${id(10)}',false),('${josh}','${id(10)}',true),('${jen}','${id(11)}',true);
create table project_files(id uuid primary key default gen_random_uuid(),project_id uuid,created_by uuid,name text);
create table fragile_catalog_items(id uuid primary key default gen_random_uuid(),project_id uuid,created_by uuid,title text);
create table fragile_catalog_assets(id uuid primary key default gen_random_uuid(),project_id uuid,created_by uuid,title text);`);
const rows=async(query,args=[])=>(await db.query(query,args)).rows;
const actor=async uid=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);if(uid)await db.exec('set role authenticated');};
const prior=await rows('select user_id,is_admin,project_mode,shared_access from member_access order by user_id');
const enrollment=await prepareMemberEnrollment({email:'new.member@example.test',userId:member,editProjects:['Reddington']});
await db.exec(enrollment);await db.exec(enrollment);
assert.deepEqual(await rows('select user_id,is_admin,project_mode,shared_access from member_access where user_id<>$1 order by user_id',[member]),prior);
assert.equal((await rows('select display_name from team_members where user_id=$1',[member]))[0].display_name,'New Member');
const project=(await rows("select id from projects where name='Reddington'"))[0].id,viewOnly=id(10);
for(const table of ['projects','tasks','expenses','goals','calendar_events','project_notes','brand_messages','brand_moodboard_items','project_files','fragile_catalog_items','fragile_catalog_assets']){
  // Deliberately broad legacy write policies must still respect the new guards.
  await db.exec(`alter table ${table} enable row level security;grant select,insert,update,delete on ${table} to authenticated;
    create policy legacy_test_all on ${table} for all to authenticated using(public.is_team_member()) with check(public.is_team_member());`);
}
const tables={
  tasks:{title:'Work',created_by:member},expenses:{title:'Cost',amount:1,created_by:member},goals:{title:'Goal',created_by:member},
  calendar_events:{title:'Date',event_date:'2026-10-28',created_by:member},project_notes:{title:'Note',body:'Brief',created_by:member},
  brand_messages:{body:'Hello',user_id:member},brand_moodboard_items:{title:'Reference',kind:'note',created_by:member},
  project_files:{name:'File',created_by:member},fragile_catalog_items:{title:'Design',created_by:member},fragile_catalog_assets:{title:'Image',created_by:member}
};
async function insert(table,fields){return db.query(`insert into ${table}(${Object.keys(fields).join(',')}) values(${Object.keys(fields).map((_,i)=>'$'+(i+1)).join(',')}) returning id`,Object.values(fields));}
for(const [table,fields] of Object.entries(tables))await insert(table,{...fields,project_id:viewOnly});
await actor(member);
const access=(await rows('select my_dashboard_access() a'))[0].a;assert.equal(access.is_admin,false);assert.deepEqual(access.editable_project_ids,[project]);assert.equal(access.shared_access,false);
assert.equal((await rows('select * from projects')).length,(await actor(null),await rows('select * from projects')).length);await actor(member);
assert.equal((await rows('select can_edit_project($1) ok',[project]))[0].ok,true);
assert.equal((await rows('select can_edit_project($1) ok',[viewOnly]))[0].ok,false);
for(const [table,fields] of Object.entries(tables)){
  assert.equal((await rows(`select * from ${table} where project_id=$1`,[viewOnly])).length,1);
  await assert.rejects(insert(table,{...fields,project_id:viewOnly}),/row-level security/);
  const field=Object.keys(fields)[0];assert.equal((await rows(`update ${table} set ${field}=${field} where project_id=$1 returning id`,[viewOnly])).length,0);
  assert.equal((await rows(`delete from ${table} where project_id=$1 returning id`,[viewOnly])).length,0);
  await insert(table,{...fields,project_id:project});
}
assert.equal((await rows('update projects set progress=25 where id=$1 returning id',[project])).length,1);
assert.equal((await rows('update projects set progress=25 where id=$1 returning id',[viewOnly])).length,0);
assert.equal((await rows('update tasks set project_id=$1 where project_id=$2 returning id',[project,viewOnly])).length,0);
await assert.rejects(db.query('update tasks set project_id=$1 where project_id=$2',[viewOnly,project]),/row-level security/);
await assert.rejects(insert('projects',{name:'Unauthorised new project'}),/row-level security/);
await assert.rejects(db.exec(`select set_member_access_levels('${member}','all',true,'{}',null)`),/Only the team owner/);
await assert.rejects(db.exec(`update member_access set editable_project_ids=null where user_id='${member}'`),/permission denied/);
for(const bucket of ['quest-project-files','fragile-assets']){
  const object=pid=>bucket==='quest-project-files'?`${pid}/${member}/file.png`:`catalogue/${pid}/${id(40)}/file.png`;
  await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values($1,$2)',[bucket,object(viewOnly)]),/row-level security/);
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',[bucket,object(project)]);
  await assert.rejects(db.query('update storage.objects set name=$1 where bucket_id=$2',[object(viewOnly),bucket]),/row-level security/);
  await actor(null);await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',[bucket,object(viewOnly)]);await actor(member);
  assert.equal((await rows('select * from storage.objects where bucket_id=$1',[bucket])).length,2);
  assert.equal((await rows('delete from storage.objects where bucket_id=$1 and name=$2 returning id',[bucket,object(viewOnly)])).length,0);
}
await actor(null);await db.exec(`insert into private_chat_rooms(id,room_key,name,project_id,created_by) values('${id(50)}','owner-josh','Owner & Josh','${viewOnly}','${quan}');
insert into private_chat_members values('${id(50)}','${quan}'),('${id(50)}','${josh}');`);
await actor(member);assert.equal((await rows('select * from private_chat_rooms')).length,0,'Viewing projects must not join private rooms');
await actor(null);await db.exec(`insert into private_chat_members values('${id(50)}','${member}')`);await actor(member);
assert.equal((await rows('select * from private_chat_rooms')).length,1);
await assert.rejects(insert('private_chat_messages',{room_id:id(50),user_id:member,body:'Cannot post to a viewed project'}),/row-level security/);
await actor(tertius);assert.equal((await rows('select can_edit_project($1) ok',[id(11)]))[0].ok,true);assert.equal((await rows('select * from projects where id=$1',[viewOnly])).length,0);
await actor(josh);assert.equal((await rows('select * from projects')).length,1);assert.equal((await rows('select can_edit_project($1) ok',[viewOnly]))[0].ok,true);
await actor(jen);assert.equal((await rows('select * from projects')).length,1);assert.equal((await rows('select can_edit_project($1) ok',[id(11)]))[0].ok,true);
await actor(quan);
await assert.rejects(db.query('select set_member_access_levels($1,$2,false,$3,$4)',[member,'selected',[project],[viewOnly]]),/Editing requires viewing/);
assert.deepEqual((await rows('select my_dashboard_access() a'))[0].a.editable_project_ids,null);
await db.query('select set_member_access($1,$2,false,$3)',[member,'selected',[project,viewOnly]]);
await actor(member);assert.equal((await rows('select can_edit_project($1) ok',[viewOnly]))[0].ok,false,'An older permission editor cannot erase edit limits');
await actor(quan);await db.query('select set_member_access_levels($1,$2,false,$3,$4)',[member,'selected',[project,viewOnly],[]]);await actor(member);
assert.equal((await rows('select can_edit_project($1) ok',[project]))[0].ok,false,'Edit revocation takes effect immediately');
await actor(null);
const invalid=await prepareMemberEnrollment({email:'different@example.test',userId:member,editProjects:['Reddington']});await assert.rejects(db.exec(invalid),/email and account ID do not match/);await db.exec('rollback');
const missing=await prepareMemberEnrollment({email:'new.member@example.test',userId:member,editProjects:['Missing project']});await assert.rejects(db.exec(missing),/No membership changes were saved/);await db.exec('rollback');
await db.close();console.log('PASS enrollment and project edit permissions: exact Auth identity, idempotent setup, existing member scopes preserved, Reddington writes, read-only tables/storage, both sides of moves, private-room membership, legacy editors and immediate revocation.');

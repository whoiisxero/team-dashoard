const wf=window.workflowTest={writes:[],objects:new Map(),removed:[],failBackend:false,failUpload:false,failMetadata:false,delaySearch:false,pending:[]};
const R=accessTest.records;
R.notification_preferences=[];
R.tasks=[{id:'jen-due',project_id:'fragile',title:'Needle fitting prep',assigned_to:'jen',created_by:'quan',status:'To do',due_date:'2026-10-22'},{id:'jen-overdue',project_id:'fragile',title:'Needle overdue fabric',assigned_to:'jen',created_by:'quan',status:'To do',due_date:'2026-10-21'},{id:'josh-due',project_id:'dusted',title:'Dusted private task',assigned_to:'josh',created_by:'quan',status:'To do',due_date:'2026-10-22'}];
R.calendar_events=[{id:'fragile-day',title:'All day fitting',detail:'Bring samples',project_id:'fragile',created_by:'quan',event_date:'2026-10-22',time_zone:'Africa/Johannesburg'},
{id:'ny-event',title:'Needle New York call',project_id:'fragile',created_by:'quan',event_date:'2026-10-21',event_time:'19:00:00',time_zone:'America/New_York',detail:'International fitting'},
{id:'tokyo-prior',title:'Tokyo previous day',project_id:'fragile',created_by:'quan',event_date:'2026-10-22',event_time:'01:30:00',time_zone:'Asia/Tokyo',detail:''}];
R.project_files=[{id:'seed-file',project_id:'fragile',created_by:'jen',name:'Needle photo.png',object_path:'fragile/jen/seed-file.png',mime_type:'image/png',size_bytes:90,moodboard:true,created_at:'2026-10-21T10:00:00Z'},
{id:'dusted-file',project_id:'dusted',created_by:'josh',name:'Dusted private brief.pdf',object_path:'dusted/josh/private.pdf',mime_type:'application/pdf',size_bytes:120,moodboard:false,created_at:'2026-10-21T10:00:00Z'}];
R.project_activity=[{id:'f-activity',project_id:'fragile',actor_name:'Quan',source_table:'tasks',source_id:'jen-due',action:'UPDATE',item_title:'Needle fitting prep',created_at:'2026-10-21T12:00:00Z'},
{id:'d-activity',project_id:'dusted',actor_name:'Josh',source_table:'tasks',source_id:'josh-due',action:'INSERT',item_title:'Dusted private task',created_at:'2026-10-21T12:00:00Z'}];
const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));
wf.objects.set('fragile/jen/seed-file.png',new Blob([png],{type:'image/png'}));wf.objects.set('dusted/josh/private.pdf',new Blob(['private pdf'],{type:'application/pdf'}));
const previousFrom=db.from;
db.from=table=>{
 if(!['notification_preferences','project_files','project_activity','tasks'].includes(table))return previousFrom(table);
 let filters=[],single=false,limit=Infinity,insert=null,upsert=null,update=null,deleting=false;
 const q={select:()=>q,eq:(k,v)=>{filters.push(r=>r[k]===v);return q},order:()=>q,limit:n=>{limit=n;return q},maybeSingle:()=>{single=true;return q},insert:v=>{insert=v;return q},upsert:v=>{upsert=v;return q},update:v=>{update=v;return q},delete:()=>{deleting=true;return q},then:(resolve,reject)=>Promise.resolve().then(()=>{
  if(wf.failBackend&&table!=='tasks')return {error:{code:'PGRST205',message:'Not installed'}};
  const records=R[table];const visible=row=>table==='notification_preferences'?row.user_id===user.id:row.project_id?accessible(row.project_id):accessTest.profiles[user.id].shared_access;
  if(insert){if(wf.failMetadata&&table==='project_files')return {error:{message:'Metadata save failed'}};if(!visible(insert)||insert.created_by!==user.id)return {error:{message:'Access denied'}};records.push({...insert,created_at:'2026-10-21T22:30:00Z'});wf.writes.push({table,values:{...insert}});return {error:null};}
  if(upsert){if(upsert.user_id!==user.id)return {error:{message:'Access denied'}};const old=records.find(r=>r.user_id===user.id);if(old)Object.assign(old,upsert);else records.push({...upsert});wf.writes.push({table,values:{...upsert}});return {error:null};}
  const rows=records.filter(visible).filter(row=>filters.every(fn=>fn(row)));
  if(update){for(const row of rows)Object.assign(row,update);return {error:null};}
  if(deleting){const own=rows.filter(row=>row.created_by===user.id||accessTest.profiles[user.id].is_admin);for(const row of own)records.splice(records.indexOf(row),1);return {data:single?own[0]||null:own};}
  return {data:single?rows[0]||null:rows.slice(0,limit).map(r=>({...r})),error:null};
 }).then(resolve,reject)};return q;
};
db.storage={from:()=>({upload:async(path,file,options)=>{if(wf.failUpload)return {error:{message:'Upload failed'}};if(!accessible(path.split('/')[0])||path.split('/')[1]!==user.id)return {error:{message:'Access denied'}};wf.objects.set(path,file);wf.writes.push({storage:'upload',path,options});return {data:{path}};},
 download:async path=>accessible(path.split('/')[0])&&wf.objects.has(path)?{data:wf.objects.get(path)}:{error:{message:'Access denied'}},
 remove:async paths=>{for(const path of paths){if(!accessible(path.split('/')[0])||!(path.split('/')[1]===user.id||accessTest.profiles[user.id].is_admin))return {error:{message:'Access denied'}};wf.objects.delete(path);wf.removed.push(path);}return {data:paths};}})};
const previousRpc=db.rpc;
db.rpc=async(name,args)=>{
 if(name==='refresh_my_reminders')return wf.failBackend?{error:{code:'PGRST202'}}:{data:0};
 if(name!=='search_quest')return previousRpc(name,args);
 if(wf.failBackend)return {error:{code:'PGRST202'}};
 const uid=user.id;
 const all=[{kind:'task',item_id:'jen-due',project_id:'fragile',title:'Needle fitting prep',snippet:'Due today'},
 {kind:'private_message',item_id:'owner-message',project_id:'fragile',room_id:'jen-room',title:'Private conversation',snippet:'Needle invitation only'},
 {kind:'file',item_id:'seed-file',project_id:'fragile',title:'Needle photo.png',snippet:'image/png'},
 {kind:'task',item_id:'josh-due',project_id:'dusted',title:'Dusted private task',snippet:'Hidden work'}];
 const data=all.filter(row=>accessTest.profiles[uid].is_admin||accessTest.rules[uid]?.includes(row.project_id)).filter(row=>row.kind!=='private_message'||roomAllowed(row.room_id,uid));
 if(wf.delaySearch)await new Promise(resolve=>wf.pending.push(resolve));return {data,error:null};
};
wf.release=()=>{wf.delaySearch=false;for(const done of wf.pending.splice(0))done();};
R.team_notifications.push({id:'jen-reminder',recipient_id:'jen',actor_name:'Quest',notification_type:'reminder',source_table:'tasks',source_id:'jen-due',item_title:'Needle fitting prep',project_id:'fragile',access_scope:'project',action:'UPDATE',read_at:null,created_at:'2026-10-21T22:30:00Z'});
await accessTest.switchUser('jen');window.workflowReady=true;

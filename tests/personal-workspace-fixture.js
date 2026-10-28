const ps=accessTest.personal={failSave:false,failRead:false,delay:false,pending:[],writes:[]};
accessTest.profiles.cas={ready:true,is_admin:false,personal_only:true,personal_workspace_ready:true,access_levels_ready:true,project_mode:'selected',shared_access:false,can_create_projects:false,editable_project_ids:[]};
accessTest.profiles.quan.personal_workspace_ready=true;
accessTest.records.team_members.push({user_id:'cas',display_name:'Cas'});accessTest.rules.cas=[];
const P=accessTest.records;
P.personal_profiles=[{user_id:'cas',preferred_name:'Cas',business_name:'Nirvana',welcome_note:'Space to think, write and move forward.',theme:'rose',density:'comfortable',text_size:'normal',time_zone:'Africa/Johannesburg',setup_complete:false}];
P.personal_notes=[{id:'cas-writing',owner_id:'cas',kind:'writing',title:'Private thoughts',body:'Not visible to the owner or team.',category:'Ideas',pinned:true,status:'open',revision:1,time_zone:'Africa/Johannesburg',created_at:'2026-10-28T08:00:00Z',updated_at:'2026-10-28T08:00:00Z'},
{id:'cas-business',owner_id:'cas',kind:'business',title:'Client follow-up',body:'Business preparation',category:'Clients',pinned:false,status:'open',due_at:'2026-10-28T12:00:00Z',remind_at:'2026-10-28T11:00:00Z',revision:1,time_zone:'Africa/Johannesburg',created_at:'2026-10-28T08:00:00Z',updated_at:'2026-10-28T08:00:00Z'}];
P.private_chat_rooms=[{id:'cas-room',name:'Quan & Cas',room_kind:'personal',project_id:null,personal_owner_id:'cas'}, {id:'team-room',name:'Other conversation',room_kind:'project',project_id:'fragile'}];
P.private_chat_members=[{room_id:'cas-room',user_id:'quan'},{room_id:'cas-room',user_id:'cas'},{room_id:'team-room',user_id:'quan'},{room_id:'team-room',user_id:'tertius'}];
P.private_chat_messages=[{id:'cas-hello',room_id:'cas-room',user_id:'quan',body:'Welcome to your space, Cas.',created_at:'2026-10-28T08:00:00Z'},{id:'other-hello',room_id:'team-room',user_id:'tertius',body:'Other chat stays private.',created_at:'2026-10-28T08:00:00Z'}];
const privateAllowed=rid=>P.private_chat_members.some(m=>m.room_id===rid&&m.user_id===user.id);
const personalBaseFrom=db.from;
db.from=table=>{
 if(!['personal_profiles','personal_notes','private_chat_rooms','private_chat_members','private_chat_messages'].includes(table))return personalBaseFrom(table);
 let filters=[],single=false,insert=null,upsert=null,deleting=false,limit=Infinity;
 const q={select:()=>q,eq:(k,v)=>{filters.push(r=>r[k]===v);return q},order:()=>q,limit:n=>{limit=n;return q},maybeSingle:()=>{single=true;return q},insert:v=>{insert=v;return q},upsert:v=>{upsert=v;return q},delete:()=>{deleting=true;return q},then:(resolve,reject)=>Promise.resolve().then(async()=>{
  const uid=user.id;if(ps.failRead&&table.startsWith('personal_'))return {error:{code:'PGRST205'}};
  const records=P[table],visible=r=>table==='personal_profiles'?r.user_id===uid:table==='personal_notes'?r.owner_id===uid:privateAllowed(table==='private_chat_rooms'?r.id:r.room_id);
  if(upsert){if(upsert.user_id!==uid)return {error:{message:'Access denied'}};const old=records.find(r=>r.user_id===uid);if(old)Object.assign(old,upsert);else records.push({...upsert});ps.writes.push({table,values:{...upsert}});return {error:null};}
  if(insert){if(insert.user_id!==uid||!privateAllowed(insert.room_id))return {error:{message:'Access denied'}};records.push({...insert,id:'message-'+records.length,created_at:'2026-10-28T09:00:00Z'});ps.writes.push({table,values:{...insert}});return {error:null};}
  const found=records.filter(visible).filter(r=>filters.every(f=>f(r)));
  if(deleting){for(const r of found)records.splice(records.indexOf(r),1);return {data:single?found[0]||null:found};}
  const result={data:single?found[0]?{...found[0]}:null:found.slice(0,limit).map(r=>({...r})),error:null};
  if(ps.delay&&table==='personal_notes'&&uid==='cas')await new Promise(done=>ps.pending.push(done));return result;
 }).then(resolve,reject)};return q;
};
const personalBaseRpc=db.rpc;
db.rpc=async(name,args={})=>{
 if(name==='private_chat_participants')return {data:privateAllowed(args.chat_id)?P.private_chat_members.filter(m=>m.room_id===args.chat_id).map(m=>({...m,display_name:P.team_members.find(p=>p.user_id===m.user_id).display_name})):[]};
 if(name==='refresh_my_reminders')return {data:0};
 if(name==='quest_save_personal_note'){
  if(ps.failSave)return {error:{message:'Save not confirmed. Keep your writing here and retry.'}};
  const old=P.personal_notes.find(n=>n.id===args.note_id);if(old&&old.owner_id!==user.id)return {error:{message:'Access denied'}};
  if(old&&old.revision!==args.expected_revision)return {error:{message:'This note changed on another device.'}};
  const row={id:args.note_id,owner_id:user.id,kind:args.note_kind,title:args.note_title,body:args.note_body,category:args.note_category,pinned:args.note_pinned,status:args.note_status,due_at:args.due_local?new Date(args.due_local+'+02:00').toISOString():null,remind_at:args.remind_local?new Date(args.remind_local+'+02:00').toISOString():null,time_zone:args.zone,revision:(old?.revision||0)+1,updated_at:'2026-10-28T10:00:00Z',created_at:old?.created_at||'2026-10-28T10:00:00Z'};
  if(old)Object.assign(old,row);else P.personal_notes.push(row);ps.writes.push({rpc:name,args:{...args}});return {data:{...row}};
 }
 return personalBaseRpc(name,args);
};
ps.release=()=>{ps.delay=false;for(const done of ps.pending.splice(0))done();};
await accessTest.switchUser('cas');window.personalReady=true;

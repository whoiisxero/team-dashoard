accessTest.profiles.jen={ready:true,is_admin:false,project_mode:'selected',shared_access:false,can_create_projects:false};
accessTest.rules.jen=['fragile'];accessTest.records.team_members.push({user_id:'jen',display_name:'Jen'});
const rooms=accessTest.records.private_chat_rooms=[{id:'jen-room',name:'Quan & Jen',project_id:'fragile'},{id:'other-room',name:'Other Fragile conversation',project_id:'fragile'}];
accessTest.records.private_chat_members=[{room_id:'jen-room',user_id:'quan'},{room_id:'jen-room',user_id:'jen'},{room_id:'other-room',user_id:'quan'},{room_id:'other-room',user_id:'tertius'}];
accessTest.records.private_chat_messages=[{id:'owner-message',room_id:'jen-room',user_id:'quan',body:'Private collection plan <script>unsafe()</script>',created_at:'2026-10-20T10:00:00Z'},{id:'other-message',room_id:'other-room',user_id:'tertius',body:'Other room only',created_at:'2026-10-20T10:00:00Z'}];
accessTest.pending=[];accessTest.failPrivateRead=false;accessTest.failPrivateWrite=false;accessTest.delayPrivate=false;accessTest.privateHandlers=[];
const roomAllowed=(id,uid)=>{const room=rooms.find(r=>r.id===id);return room&&accessTest.records.private_chat_members.some(m=>m.room_id===id&&m.user_id===uid)&&(accessTest.profiles[uid]?.is_admin||accessTest.rules[uid]?.includes(room.project_id));};
const baseFrom=db.from;
db.from=table=>{if(!table.startsWith('private_chat_')&&table!=='team_notifications')return baseFrom(table);
 let filters=[],head=false,maximum=Infinity,single=false,insert=null,update=null,deleting=false;
 const q={select:(fields,options={})=>{head=!!options.head;return q},eq:(key,value)=>{filters.push(row=>row[key]===value);return q},is:(key,value)=>{filters.push(row=>row[key]===value);return q},in:(key,values)=>{filters.push(row=>values.includes(row[key]));return q},order:()=>q,limit:n=>{maximum=n;return q},maybeSingle:()=>{single=true;return q},insert:values=>{insert=values;return q},update:values=>{update=values;return q},delete:()=>{deleting=true;return q},then:(resolve,reject)=>Promise.resolve().then(async()=>{
  if(accessTest.failPrivateRead&&table.startsWith('private_chat_'))return {error:{code:'PGRST205'}};
  const uid=user.id,records=accessTest.records[table]||[];
  if(insert){if(accessTest.failPrivateWrite)return {error:{message:'Private send denied'}};if(!roomAllowed(insert.room_id,uid)||insert.user_id!==uid)return {error:{message:'Access denied'}};
   const row={...insert,id:'sent-'+accessTest.writes.length,created_at:'2026-10-20T15:00:00Z'};records.push(row);accessTest.writes.push({table,values:{...insert}});
   const room=rooms.find(r=>r.id===row.room_id);for(const m of accessTest.records.private_chat_members.filter(m=>m.room_id===row.room_id&&m.user_id!==uid&&roomAllowed(m.room_id,m.user_id)))accessTest.records.team_notifications.push({id:'notice-'+row.id+'-'+m.user_id,recipient_id:m.user_id,actor_id:uid,actor_name:accessTest.records.team_members.find(m=>m.user_id===uid).display_name,source_table:'private_chat_messages',source_id:row.id,item_title:room.name,project_id:room.project_id,private_room_id:room.id,action:'INSERT',access_scope:'private_chat',read_at:null,created_at:row.created_at});return {error:null};
  }
  let found=records.filter(row=>table==='team_notifications'?row.recipient_id===uid&&(!row.private_room_id||roomAllowed(row.private_room_id,uid)):roomAllowed(table==='private_chat_rooms'?row.id:row.room_id,uid)).filter(row=>filters.every(f=>f(row))).sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')||(b.id||'').localeCompare(a.id||''));
  if(deleting){found=found.filter(row=>row.user_id===uid);for(const row of found)records.splice(records.indexOf(row),1);return {data:single?(found[0]||null):found};}
  if(update){for(const row of found)Object.assign(row,update);return {error:null};}
  const result={data:head?null:single?(found[0]||null):found.slice(0,maximum).map(row=>({...row})),count:found.length,error:null};
  if(accessTest.delayPrivate&&table==='private_chat_messages'&&uid==='jen')await new Promise(resolve=>accessTest.pending.push(resolve));return result;
 }).then(resolve,reject)};return q;
};
db.channel=name=>{const c={on:(type,filter,callback)=>{if(filter.table==='private_chat_messages')accessTest.privateHandlers.push({name,filter,callback});return c},subscribe:()=>c};return c};
accessTest.emitPrivate=()=>{for(const h of accessTest.privateHandlers)h.callback();};
accessTest.release=()=>{accessTest.delayPrivate=false;for(const resolve of accessTest.pending.splice(0))resolve();};
await accessTest.switchUser('jen');

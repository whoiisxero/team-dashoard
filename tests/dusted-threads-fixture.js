projects[0].name='Fragile';projects[1].name='Dusted.';
state.writable=true;state.failPost=false;state.failUpload=false;state.failLoad=false;state.commitThenFail=false;state.uploads=[];state.downloads=[];state.removed=[];state.likes=[];
state.brandMessages=Array.from({length:23},(_,i)=>({id:'post-'+i,project_id:'p2',user_id:i%2?'josh':'quan',body:i?'Dusted idea '+i:'Existing Dusted conversation',created_at:new Date(Date.UTC(2026,10,4,12,30-i)).toISOString(),parent_id:null,image_paths:[]}));
state.brandMessages.push({id:'other-project',project_id:'p1',user_id:'quan',body:'Fragile private idea',created_at:'2026-11-04T14:00:00Z',parent_id:null,image_paths:[]});
roster.push({user_id:'josh',display_name:'Josh'});
const baseFrom=db.from;
db.from=table=>{
 if(!['brand_messages','brand_moodboard_items','brand_message_likes'].includes(table))return baseFrom(table);
 let filters=[],sort=[],start=0,end=1000,inserting=null,deleting=false,single=false;
 const rows=()=>table==='brand_messages'?state.brandMessages:table==='brand_message_likes'?state.likes:[];
 const q={select:()=>q,eq:(key,v)=>{filters.push(r=>r[key]===v);return q;},is:(key,v)=>{filters.push(r=>(r[key]??null)===v);return q;},order:(key,opt={})=>{sort.push([key,opt.ascending!==false]);return q;},range:(a,b)=>{start=a;end=b+1;return q;},limit:n=>{end=n;return q;},maybeSingle:()=>{single=true;return q;},insert:values=>{inserting=values;return q;},delete:()=>{deleting=true;return q;},then:(resolve,reject)=>Promise.resolve().then(()=>{
  if(state.failLoad&&table==='brand_messages'&&!inserting&&!deleting)return {error:{message:'Offline'}};
  if(inserting){if(state.failPost)return {error:{message:'Offline'}};if(rows().some(r=>r.id&&r.id===inserting.id))return {error:{code:'23505'}};
   const row={...inserting,created_at:new Date().toISOString()};rows().push(row);state.writes.push({table,values:row});if(state.commitThenFail&&table==='brand_messages'){state.commitThenFail=false;return {error:{message:'Connection lost after save'}};}return {data:null,error:null};}
  let found=rows().filter(r=>filters.every(f=>f(r))).sort((a,b)=>{for(const [key,asc] of sort){const x=String(a[key]||'').localeCompare(String(b[key]||''));if(x)return asc?x:-x;}return 0;});
  if(deleting){for(const row of found){rows().splice(rows().indexOf(row),1);if(table==='brand_messages'){state.brandMessages=state.brandMessages.filter(r=>r.parent_id!==row.id);state.likes=state.likes.filter(r=>r.message_id!==row.id);}}return {data:single?found[0]||null:found,error:null};}
  return {data:single?found[0]||null:found.slice(start,end).map(r=>({...r})),error:null};
 }).then(resolve,reject)};return q;
};
db.rpc=async(name,args)=>{
 if(name!=='quest_thread_stats')return {data:null,error:null};
 return {data:args.message_ids.filter(id=>state.brandMessages.some(p=>p.id===id)).map(id=>({message_id:id,like_count:state.likes.filter(l=>l.message_id===id).length,reply_count:state.brandMessages.filter(m=>m.parent_id===id).length,liked:state.likes.some(l=>l.message_id===id&&l.user_id===user.id)})),error:null};
};
state.realtime=[];db.channel=()=>{const c={on:(type,filter,fn)=>{state.realtime.push({filter,fn});return c;},subscribe:()=>c};return c;};db.removeChannel=()=>{};
db.storage={from:bucket=>({
 upload:async(path,file,options)=>{if(state.failUpload)return {error:{message:'Upload failed'}};state.uploads.push({bucket,path,name:file.name,options});if(state.deferUpload)return new Promise(resolve=>state.finishUpload=()=>resolve({data:{path},error:null}));return {data:{path},error:null};},
 download:async path=>{state.downloads.push({bucket,path});return {data:new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6av8AAAAASUVORK5CYII='),c=>c.charCodeAt(0))],{type:'image/png'}),error:null};},
 remove:async paths=>{state.removed.push(...paths);return {error:null};}
})};
state.resetThreads=()=>dustedStudio.reset();state.refreshThreads=()=>dustedStudio.activate();render();

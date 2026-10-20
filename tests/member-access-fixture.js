const state=window.accessTest={failAccess:false,failPresence:false,writes:[],online:new Set(['tertius']),profiles:{
quan:{ready:true,is_admin:true,project_mode:'all',shared_access:true,can_create_projects:true},
tertius:{ready:true,is_admin:false,project_mode:'all',shared_access:true,can_create_projects:true},
josh:{ready:true,is_admin:false,project_mode:'selected',shared_access:false,can_create_projects:false}}};
const records={projects:[{id:'dusted',name:'Dusted.',access_restricted:true},{id:'fragile',name:'Fragile'},{id:'loden',name:'Loden'}],
team_members:['quan','tertius','josh'].map(id=>({user_id:id,display_name:id[0].toUpperCase()+id.slice(1)})),
team_settings:[{id:true,monthly_budget:700}],tasks:[],expenses:[],goals:[],discussion_messages:[{id:'teamchat',body:'Main team conversation',user_id:'tertius',created_at:'2026-10-20T10:00:00Z'}],
calendar_events:[{id:'event',title:'Dusted private meeting',event_date:'2026-10-20',project_id:'dusted',created_by:'quan'}],project_notes:[],
brand_messages:[{id:'d1',body:'Dusted owner and Josh only',project_id:'dusted',user_id:'quan',created_at:'2026-10-20T10:00:00Z'},{id:'f1',body:'Fragile private team',project_id:'fragile',user_id:'tertius',created_at:'2026-10-20T10:00:00Z'}],brand_moodboard_items:[],team_notifications:[]};
state.records=records;state.rules={tertius:['fragile','loden'],josh:['dusted']};
const accessible=id=>state.profiles[user.id].is_admin||state.rules[user.id]?.includes(id);
function query(table){let filters=[],single=false,limit=Infinity,head=false,inserting=null;
 const q={select:(fields,options={})=>{head=!!options.head;return q},eq:(key,value)=>{filters.push(row=>row[key]===value);return q},gte:()=>q,is:(key,value)=>{filters.push(row=>row[key]===value);return q},order:()=>q,limit:n=>{limit=n;return q},maybeSingle:()=>{single=true;return q},insert:values=>{inserting=values;return q},then:(resolve,reject)=>Promise.resolve().then(()=>{
 if(inserting){state.writes.push({table,values:inserting});records[table].push({...inserting,id:'posted',created_at:'2026-10-20T10:00:00Z'});return {error:null};}
 let data=(records[table]||[]).filter(row=>table==='projects'?accessible(row.id):table==='team_members'||table==='team_notifications'?true:row.project_id?accessible(row.project_id):state.profiles[user.id].shared_access).filter(row=>filters.every(f=>f(row))).map(row=>({...row}));
 return {data:head?null:single?(data[0]||null):data.slice(0,limit),count:data.length,error:null};}).then(resolve,reject)};return q;
}
db={from:query,channel:()=>{const c={on:()=>c,subscribe:()=>c};return c},removeChannel:()=>{},rpc:async(name,args={})=>{
 if(name==='my_dashboard_access')return state.failAccess?{error:{code:'PGRST202'}}:{data:{...state.profiles[user.id]}};
 if(name==='touch_member_presence'){if(state.failPresence)return {error:{message:'Offline'}};state.online.add(user.id);return {data:null};}
 if(name==='leave_member_presence'){state.online.delete(user.id);return {data:null};}
 if(name==='team_online_members')return {data:records.team_members.map(m=>({...m,online:state.online.has(m.user_id)}))};
 if(name==='list_member_access')return {data:records.team_members.map(m=>({...m,...state.profiles[m.user_id],project_rules:(state.rules[m.user_id]||[]).map(id=>({project_id:id,allowed:true}))}))};
 if(name==='set_member_access'){state.writes.push({rpc:name,args});state.rules[args.target]=args.allowed_projects;Object.assign(state.profiles[args.target],{project_mode:args.mode,shared_access:args.shared});return {data:null};}
 return {error:{message:'Unknown RPC'}};
}};
state.switchUser=async id=>{await teamAccess.leave();showLogin();await enterApp({id});showView('overview');};
state.refresh=()=>refreshAll();state.navigate=id=>showView(id);await state.switchUser('quan');window.ready=true;

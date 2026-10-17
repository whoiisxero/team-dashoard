window.inboxTest={error:null,failWrite:false,handlers:[],data:[],navigations:[]};
const n=inboxTest;
for(let i=0;i<55;i++)n.data.push({id:String(i).padStart(3,'0'),recipient_id:'quan',actor_id:'tertius',actor_name:'Tertius',source_table:i===54?'calendar_events':'tasks',source_id:'event',event_date:'2026-10-18',action:'INSERT',item_title:i===54?'Casting <script>alert(1)</script>':`Task ${i}`,created_at:new Date(Date.UTC(2026,9,17,0,i)).toISOString(),read_at:null});
n.data.push({id:'other',recipient_id:'tertius',actor_name:'Quan',source_table:'projects',source_id:'p',action:'UPDATE',item_title:'Private other inbox',created_at:'2026-10-17T01:00:00Z',read_at:null});
const event={id:'event',title:'Casting',event_date:'2026-10-18',detail:'Bring portfolio',created_by:'tertius'};
function query(table){let filters=[],head=false,maximum=Infinity,update=null,single=false;
 const q={select:(fields,options={})=>{head=!!options.head;return q},eq:(key,value)=>{filters.push(row=>row[key]===value);return q},is:(key,value)=>{filters.push(row=>row[key]===value);return q},in:(key,values)=>{filters.push(row=>values.includes(row[key]));return q},order:()=>q,limit:value=>{maximum=value;return q},update:values=>{update=values;return q},maybeSingle:()=>{single=true;return q},then:(resolve,reject)=>Promise.resolve().then(()=>{
 if(table==='calendar_events')return {data:event,error:null};
 if(n.error)return {data:null,error:{code:n.error},count:null};
 if(update&&n.failWrite)return {error:{message:'Denied'}};
 let result=n.data.filter(row=>filters.every(f=>f(row))).sort((a,b)=>b.created_at.localeCompare(a.created_at));
 if(update){for(const row of result)Object.assign(row,update);return {error:null};}
 return {data:head?null:result.slice(0,maximum).map(row=>({...row})),count:result.length,error:null};
 }).then(resolve,reject)};return q;}
db={from:query,channel:()=>{const c={on:(type,filter,callback)=>{n.handlers.push(callback);return c},subscribe:callback=>{callback('SUBSCRIBED');return c}};return c},removeChannel:()=>{n.handlers=[]}};
user={id:'quan'};calendarEvents=[event];roster=[{user_id:'quan',display_name:'Quan'},{user_id:'tertius',display_name:'Tertius'}];
document.querySelector('#loginScreen').hidden=true;document.querySelector('#appShell').hidden=false;
n.switchUser=id=>{user={id};notificationCenter.start()};n.emit=()=>{for(const h of n.handlers)h()};
notificationCenter.start();showView('notifications');window.ready=true;

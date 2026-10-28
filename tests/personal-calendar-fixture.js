/* Account-scoped calendar transport; real controller and navigation are exercised. */
const cs=accessTest.calendar={failSave:false,delay:false,pending:[],attempts:[],writes:[]};
accessTest.profiles.cas.personal_calendar_ready=true;accessTest.profiles.quan.personal_calendar_ready=true;
P.personal_profiles[0].setup_complete=true;
P.personal_calendar_events=[{id:'cas-event',owner_id:'cas',title:'Private appointment',detail:'Personal preparation',location:'Cape Town',event_date:'2026-10-28',event_time:'10:00:00',time_zone:'Africa/Johannesburg',event_starts_at:'2026-10-28T08:00:00Z',remind_at:null,revision:1,created_at:'2026-10-28T08:00:00Z',updated_at:'2026-10-28T08:00:00Z'},
{id:'quan-event',owner_id:'quan',title:'Owner confidential event',detail:'Owner details',location:'',event_date:'2026-10-28',event_time:null,time_zone:'Africa/Johannesburg',event_starts_at:'2026-10-27T22:00:00Z',remind_at:null,revision:1,created_at:'2026-10-28T08:00:00Z',updated_at:'2026-10-28T08:00:00Z'}];
const calendarBaseFrom=db.from;
db.from=table=>{
 if(table!=='personal_calendar_events')return calendarBaseFrom(table);
 let filters=[],single=false,deleting=false,limit=Infinity;
 const q={select:()=>q,eq:(key,value)=>{filters.push(r=>r[key]===value);return q},order:()=>q,limit:n=>{limit=n;return q},maybeSingle:()=>{single=true;return q},delete:()=>{deleting=true;return q},then:(resolve,reject)=>Promise.resolve().then(async()=>{
  const uid=user.id,found=P.personal_calendar_events.filter(r=>r.owner_id===uid).filter(r=>filters.every(f=>f(r)));
  if(deleting){for(const row of found)P.personal_calendar_events.splice(P.personal_calendar_events.indexOf(row),1);cs.writes.push({delete:found.map(r=>r.id),uid});return {data:single?found[0]||null:found,error:null};}
  const result={data:single?found[0]?{...found[0]}:null:found.slice(0,limit).map(r=>({...r})),error:null};
  if(cs.delay&&uid==='cas')await new Promise(done=>cs.pending.push(done));return result;
 }).then(resolve,reject)};return q;
};
const calendarBaseRpc=db.rpc;
db.rpc=async(name,args={})=>{
 if(name!=='quest_save_personal_event')return calendarBaseRpc(name,args);
 cs.attempts.push({...args});if(cs.failSave)return {error:{message:'Save not confirmed. Your event details are still here; retry.'}};
 const old=P.personal_calendar_events.find(r=>r.id===args.event_id);if(old&&old.owner_id!==user.id)return {error:{message:'Access denied'}};
 if(old&&old.revision!==args.expected_revision)return {error:{message:'This event changed on another device.'}};
 const row={id:args.event_id,owner_id:user.id,title:args.event_title,detail:args.event_detail,location:args.event_location,event_date:args.event_day,event_time:args.event_clock?args.event_clock+':00':null,time_zone:args.zone,event_starts_at:new Date(args.event_day+'T'+(args.event_clock||'00:00')+'+02:00').toISOString(),remind_at:args.remind_local?new Date(args.remind_local+'+02:00').toISOString():null,revision:(old?.revision||0)+1,created_at:old?.created_at||'2026-10-28T10:00:00Z',updated_at:'2026-10-28T10:00:00Z'};
 if(old)Object.assign(old,row);else P.personal_calendar_events.push(row);cs.writes.push({rpc:name,args:{...args}});return {data:{...row},error:null};
};
cs.release=()=>{cs.delay=false;for(const done of cs.pending.splice(0))done();};
await accessTest.refresh();accessTest.navigate('personalCalendar');window.calendarReady=true;

cs.showReminder=async()=>{P.team_notifications.push({id:'cas-event-reminder',recipient_id:'cas',actor_name:'Quest',source_table:'personal_calendar_events',source_id:'cas-event',personal_event_id:'cas-event',action:'UPDATE',item_title:'Private appointment',access_scope:'personal_event',notification_type:'reminder',read_at:'2026-10-28T09:00:00Z',created_at:'2026-10-28T09:00:00Z',event_date:'2026-10-28'});await notificationCenter.refresh();accessTest.navigate('notifications');};

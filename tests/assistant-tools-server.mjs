import assert from 'node:assert/strict';
import {createTranscriptionService,MAX_AUDIO_BYTES} from '../server/transcription-core.mjs';
import {createEventAssistantService} from '../server/event-assistant-core.mjs';
const uid='00000000-0000-4000-8000-000000000001',pid='00000000-0000-4000-8000-000000000010',id='00000000-0000-4000-8000-000000000020';
const token='test-user-token-0123456789012345',url='https://test-project.supabase.co',env={OPENAI_API_KEY:'test-only-private-key'};
let member=true,shared=false,admin=false,denyWrite=false,loseResponse=false,providerError=null,slots={},speech='Q, pull up calendar',rows=[],calls=[],editableProjects=null;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const fakeFetch=async(address,options)=>{
 calls.push({address,options});assert.equal(options.cache,'no-store');
 if(address.startsWith(url)){
  assert.equal(options.headers.Authorization,'Bearer '+token);assert.equal(options.headers.apikey,'public-test-key');
  if(address.endsWith('/auth/v1/user'))return json({id:uid});
  if(address.endsWith('/rpc/my_team_profile'))return json(member?{user_id:uid,display_name:'Jen'}:null);
  if(address.endsWith('/rpc/my_dashboard_access'))return json({ready:member,is_admin:admin,shared_access:shared,editable_project_ids:editableProjects});
  if(address.includes('/projects?'))return json([{id:pid,name:'Fragile'}]);
  if(address.includes('/calendar_events?')){
   if(options.method==='POST'){
    if(denyWrite)return json({message:'private db detail'},403);
    const row=JSON.parse(options.body);assert.equal(row.created_by,uid);assert.equal(row.id,id);
    if(rows.some(r=>r.id===row.id))return json({},409);rows.push(row);
    if(loseResponse){loseResponse=false;throw Error('Lost response after commit');}
    return json([row],201);
   }
   assert(address.includes('created_by=eq.'+uid));return json(rows);
  }
  throw Error('Unexpected workspace query');
 }
 assert.equal(options.headers.Authorization,'Bearer '+env.OPENAI_API_KEY.trim());
 if(providerError)return json({error:providerError.error},providerError.status);
 if(address.endsWith('/audio/transcriptions')){
  assert(options.body instanceof FormData);assert.equal(options.body.get('model'),'gpt-4o-mini-transcribe');assert.equal(options.body.get('file').type,'audio/webm');assert.equal(options.body.get('file').size,3);return json({text:speech});
 }
 assert.equal(address,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert(!options.body.includes(token));const snapshot=JSON.parse(body.input[0].content);assert.equal(snapshot.today,'2026-10-25');assert.equal(snapshot.projects.length,1);return json({output_text:JSON.stringify(slots)});
};
const options={getConfig:async()=>({url,key:'public-test-key'}),env,fetchImpl:fakeFetch,now:()=>Date.parse('2026-10-25T10:00:00Z')};
const audioReq={method:'POST',authorization:'Bearer '+token,audio:new Uint8Array([1,2,3]),type:'audio/webm;codecs=opus'};
let service=createTranscriptionService(options),r=await service({...audioReq,authorization:undefined});assert.equal(r.status,401);assert.equal(calls.length,0);
member=false;r=await service(audioReq);assert.equal(r.status,403);assert(!calls.some(c=>c.address.includes('openai')));member=true;
r=await service({...audioReq,type:'text/html'});assert.equal(r.status,415);r=await service({...audioReq,audio:new Uint8Array(MAX_AUDIO_BYTES+1)});assert.equal(r.status,413);
r=await service(audioReq);assert.equal(r.body.text,speech);assert.match(r.headers['Cache-Control'],/no-store/);
speech='';r=await service(audioReq);assert.equal(r.status,422);
providerError={status:429,error:{code:'insufficient_quota',message:'private key'}};r=await service(audioReq);assert.equal(r.body.code,'ai_billing_required');assert(!JSON.stringify(r).includes('private key'));providerError=null;
service=createTranscriptionService(options);speech='hello';for(let i=0;i<8;i++)assert.equal((await service(audioReq)).status,200);assert.equal((await service(audioReq)).status,429);
service=createEventAssistantService(options);const eventReq={method:'POST',authorization:'Bearer '+token,body:{flow_id:id,message:'Add a fitting',draft:{}}};
calls=[];member=false;r=await service(eventReq);assert.equal(r.status,403);assert(!calls.some(c=>c.address.includes('openai')));member=true;
r=await service({...eventReq,body:{...eventReq.body,flow_id:'invalid'}});assert.equal(r.status,400);
slots={title:'Sample fitting',date:'2026-10-26',time:null,time_zone:'Africa/Johannesburg',location:null,purpose:null,project_id:null};r=await service(eventReq);assert.equal(r.body.state,'need_details');assert.match(r.body.reply,/what time/);assert.match(r.body.reply,/where/);assert.match(r.body.reply,/what it is for/);assert.equal(r.body.draft.project_id,pid);assert.equal(rows.length,0);
slots={...slots,date:'2026-02-30',time:'28:15',time_zone:'Invalid/Zone',location:'Studio',purpose:'Fit samples'};r=await service(eventReq);assert.equal(r.body.state,'need_details');assert.match(r.body.reply,/which date/);assert.match(r.body.reply,/which time zone/);assert.equal(rows.length,0);
slots={...slots,date:'2026-10-26',time:'15:30',time_zone:'Asia/Tokyo',project_id:'inaccessible'};r=await service(eventReq);assert.equal(r.status,403);assert.equal(rows.length,0);
slots.project_id=pid;denyWrite=true;r=await service(eventReq);assert.equal(r.status,403);assert.equal(rows.length,0);denyWrite=false;
slots.cancel=true;r=await service(eventReq);assert.equal(r.body.state,'cancelled');assert.equal(rows.length,0);slots.cancel=false;
loseResponse=true;r=await service(eventReq);assert.equal(r.body.code,'event_save_uncertain');assert.equal(rows.length,1);
const paidCalls=calls.filter(c=>c.address.includes('openai')).length;r=await service(eventReq);assert.equal(r.body.state,'created');assert.equal(rows.length,1);assert.equal(calls.filter(c=>c.address.includes('openai')).length,paidCalls);assert.equal(rows[0].time_zone,'Asia/Tokyo');assert.equal(rows[0].event_time,'15:30');assert.equal(rows[0].detail,'Where: Studio\nPurpose: Fit samples');assert.match(r.headers['Cache-Control'],/no-store/);
rows=[];shared=true;slots={...slots,project_id:null,all_day:true,time:null};r=await service(eventReq);assert.equal(r.body.state,'created');assert.equal(rows[0].project_id,null);assert.equal(rows[0].event_time,null);
rows=[];shared=false;editableProjects=[];calls=[];r=await service(eventReq);assert.equal(r.status,403);assert.equal(r.body.code,'event_view_only');assert(!calls.some(c=>c.address.includes('openai')),'No paid event extraction for view-only accounts');
editableProjects=[pid];calls=[];slots.project_id=pid;r=await service(eventReq);assert.equal(r.body.state,'created');assert.equal(rows[0].project_id,pid);
console.log('PASS voice and event services: membership before paid calls, audio bounds/FormData, safe billing errors/rate limits, required calendar details, valid dates/times/zones, member JWT/RLS writes, project isolation, all-day events, cancel and idempotent recovery after a lost save response. Providers mocked.');

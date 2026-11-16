import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import {createResearchService,workerSignature} from '../server/research-core.mjs';
const uid='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',pid='00000000-0000-4000-8000-000000000010',hidden='00000000-0000-4000-8000-000000000011',jid='00000000-0000-4000-8000-000000000020';
const token='caller-token-never-send-to-worker',supabase='https://test-project.supabase.co',worker='https://private-worker.example.com',secret='test-worker-secret-at-least-thirty-two-characters';
const env={Q_RESEARCH_ENABLED:'true',Q_RESEARCH_WORKER_URL:worker,Q_RESEARCH_WORKER_SECRET:secret};
let policy={ready:true,is_admin:true,personal_workspace_ready:true},member=true,projects=[{id:pid,name:'Fragile'}],job=null,workerFail=false,loseSave=false;
const calls=[],jobs=new Map(),saved={tasks:new Map(),project_notes:new Map(),personal_notes:new Map()};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
const baseJob=()=>({id:jid,owner_id:uid,scope_project_id:pid,question:'Compare public services',urls:['https://example.com/'],status:'done',stage:'Complete',result:'Useful findings <script>untrusted</script>',sources:['https://example.com/services','javascript:alert(1)'],events:[{step:1,url:'https://example.com/services'}],calls:2,input_tokens:1200,output_tokens:300,created_at:1700000000});
const fetchImpl=async(address,options)=>{
 calls.push({address,options});
 if(address.startsWith(supabase)){
  assert.equal(options.headers.Authorization,'Bearer '+token);assert.equal(options.headers.apikey,'public-test-key');assert.equal(options.cache,'no-store');
  const path=address.slice(supabase.length);
  if(path==='/auth/v1/user')return json({id:uid});
  if(path==='/rest/v1/rpc/my_team_profile')return json(member?{user_id:uid,display_name:'Owner'}:null);
  if(path==='/rest/v1/rpc/my_dashboard_access')return json(member?policy:null);
  if(path.startsWith('/rest/v1/projects?'))return json(projects);
  if(path==='/rest/v1/rpc/quest_save_personal_note'){
   const body=JSON.parse(options.body);assert.equal(body.note_kind,'writing');assert.equal(body.note_category,'Research');assert.equal(body.zone,'Africa/Johannesburg');assert.equal(body.expected_revision,null);
   let row=saved.personal_notes.get(body.note_id);
   if(row&&row.body!==body.note_body)return json({error:'revision conflict'},400);
   row={id:body.note_id,owner_id:uid,title:body.note_title,body:body.note_body};saved.personal_notes.set(row.id,row);return json(row);
  }
  const table=path.match(/^\/rest\/v1\/(tasks|project_notes)\?/);
  if(table){
   const rows=saved[table[1]],q=new URL(address).searchParams;
   if(options.method==='POST'){
    const row=JSON.parse(options.body);assert.equal(row.created_by,uid);assert.equal(row.project_id,pid);
    if(rows.has(row.id))return json({error:'already exists'},409);rows.set(row.id,row);
    if(loseSave){loseSave=false;throw Error('Lost acknowledgement after committed insert');}return json([row]);
   }
   return json(rows.has(q.get('id')?.slice(3))?[rows.get(q.get('id').slice(3))]:[]);
  }
  throw Error('Unexpected workspace read: '+path);
 }
 assert(address.startsWith(worker));
 const path=address.slice(worker.length),body=options.body||'',h=options.headers;
 assert.equal(h['x-q-member'],uid);assert.equal(h['x-q-time'],'1700000000');
 const canonical=[h['x-q-time'],h['x-q-nonce'],uid,options.method,path,createHash('sha256').update(body).digest('hex')].join('\n');
 assert.equal(h['x-q-signature'],createHmac('sha256',secret).update(canonical).digest('hex'));
 assert(!JSON.stringify(options).includes(token));assert(!body.includes('private Quest data'));
 if(workerFail)throw Error('Private upstream failure sk-do-not-expose');
 if(path==='/v1/status')return json({configured:true,limits:{calls:6,seconds:180,retention_days:14},usage:{member_runs:1,member_limit:3}});
 if(path==='/v1/latest')return json({id:job?.id||null});
 if(path==='/v1/jobs'&&options.method==='POST'){
  const p=JSON.parse(body);assert.deepEqual(Object.keys(p).sort(),['id','question','scope_project_id','urls']);
  if(jobs.has(p.id))return json({id:p.id});job={...baseJob(),...p,status:'queued'};jobs.set(p.id,job);return json({id:p.id});
 }
 if(path.endsWith('/stop')){job.status='stopping';return json(job);}
 if(path==='/v1/jobs/'+jid)return job?json(job):json({code:'job_not_found'},404);
 throw Error('Unexpected worker call');
};
const make=()=>createResearchService({getConfig:async()=>({url:supabase,key:'public-test-key'}),fetchImpl,env,now:()=>1700000000000});
const invoke=(action,payload={})=>make()({method:['status','job','latest'].includes(action)?'GET':'POST',authorization:'Bearer '+token,query:{action,...payload},body:{action,...payload}});
let r=await make()({method:'POST',body:{action:'start'}});assert.equal(r.status,401);assert.equal(calls.length,0);
r=await make()({method:'DELETE'});assert.equal(r.status,405);
member=false;r=await invoke('status');assert.equal(r.status,403);member=true;
delete env.Q_RESEARCH_ENABLED;r=await invoke('status');assert.equal(r.status,200);assert.equal(r.body.configured,false);assert.equal(r.body.destinations.private_notes,true);env.Q_RESEARCH_ENABLED='true';
policy={ready:true,is_admin:false,editable_project_ids:[]};r=await invoke('status');assert.equal(r.status,403);
env.Q_RESEARCH_MEMBER_IDS=uid;r=await invoke('status');assert.equal(r.status,200);assert.equal(r.body.destinations.private_notes,false);assert.deepEqual(r.body.destinations.projects,[]);
policy.studio_only_project_id=pid;r=await invoke('status');assert.equal(r.status,403);delete policy.studio_only_project_id;
policy.private_fragile_owner_id=other;r=await invoke('status');assert.equal(r.status,403);delete policy.private_fragile_owner_id;
policy={ready:true,personal_only:true,personal_workspace_ready:true};projects=[];r=await invoke('status');assert(r.body.destinations.private_notes);assert.deepEqual(r.body.destinations.projects,[]);
policy={ready:true,is_admin:true,personal_workspace_ready:true};projects=[{id:pid,name:'Fragile'}];
r=await invoke('start',{id:jid,question:'Question',urls:['http://example.com'],scope_project_id:pid});assert.equal(r.status,400);
r=await invoke('start',{id:jid,question:'Question',urls:['https://example.com'],scope_project_id:hidden});assert.equal(r.status,403);
r=await invoke('start',{id:jid,question:'Question',urls:['https://example.com'],scope_project_id:pid,workspace:'private Quest data',apiKey:'never forwarded'});assert.equal(r.status,200);assert.equal(r.body.job.status,'queued');assert(!('owner_id'in r.body.job));
await invoke('start',{id:jid,question:'Question',urls:['https://example.com'],scope_project_id:pid});assert.equal(jobs.size,1);
r=await invoke('save',{id:jid,kind:'task',title:'Action',content:'Reviewed',project_id:pid});assert.equal(r.status,409);
job={...baseJob(),owner_id:other};r=await invoke('job',{id:jid});assert.equal(r.status,404);
job=baseJob();job.status='running';projects=[];r=await invoke('job',{id:jid});assert.equal(r.status,403);assert.equal(job.status,'stopping');assert(!JSON.stringify(r.body).includes('Useful findings'));
projects=[{id:pid,name:'Fragile'}];job=baseJob();r=await invoke('job',{id:jid});assert.equal(r.status,200);assert.deepEqual(r.body.job.sources,['https://example.com/services']);
policy={ready:true,editable_project_ids:[]};r=await invoke('save',{id:jid,kind:'project_note',title:'Note',content:'Reviewed text',project_id:pid});assert.equal(r.status,403);assert.equal(saved.project_notes.size,0);
policy={ready:true,is_admin:true,personal_workspace_ready:true};
const review={id:jid,kind:'project_note',title:'Supplier research',content:'Reviewed finding',project_id:pid};
loseSave=true;r=await invoke('save',review);assert.equal(r.status,503);assert.equal(saved.project_notes.size,1);
r=await invoke('save',review);assert.equal(r.status,200);assert.equal(saved.project_notes.size,1);const row=[...saved.project_notes.values()][0];assert(row.body.includes('https://example.com/services'));assert(!row.body.includes('javascript:'));assert.equal(row.title,review.title);
row.title='Edited in Quest';r=await invoke('save',review);assert.equal(r.status,409);row.title=review.title;
const task={id:jid,kind:'task',title:'Contact supplier',content:'Reviewed',project_id:pid,due_date:'2026-11-18'};
r=await invoke('save',task);assert.equal(r.status,200);r=await invoke('save',task);assert.equal(r.status,200);assert.equal(saved.tasks.size,1);assert.equal([...saved.tasks.values()][0].assigned_to,uid);assert.equal([...saved.tasks.values()][0].status,'To do');
r=await invoke('save',{...task,due_date:'2026-02-31'});assert.equal(r.status,400);
r=await invoke('save',{...review,kind:'private_note',project_id:null});assert.equal(r.status,200);r=await invoke('save',{...review,kind:'private_note',project_id:null});assert.equal(r.status,200);assert.equal(saved.personal_notes.size,1);
workerFail=true;r=await invoke('status');assert.equal(r.status,503);assert(!JSON.stringify(r.body).includes('sk-do-not-expose'));workerFail=false;
env.Q_RESEARCH_WORKER_URL='http://worker.example.com';r=await invoke('status');assert.equal(r.body.configured,false);
assert.equal(workerSignature({secret:'test-shared-secret-01234567890123456789',time:'1700000000',nonce:jid,member:uid,method:'POST',path:'/v1/jobs',body:'{}'}),'643ee223c95c22fd79f0a2f5399dbdd4ab2e9043965f9aa0ec21eb962ea9faed');
console.log('PASS Q Research gateway: current membership/scope/edit rights, owner pilot and allowlist, no private context/JWT sent to worker, HMAC, safe failures, project and private notes, assigned tasks and idempotent saves after lost acknowledgement. Worker/Supabase HTTP fixtures used.');

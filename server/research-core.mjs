/* Q Research gateway. Caller JWT stays here; the browser worker gets public inputs only. */
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {authenticateMember} from './member-session.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ACTIVE=new Set(['queued','running','stopping']);
const response=(status,body)=>({status,headers:{'Cache-Control':'no-store, max-age=0','Content-Type':'application/json'},body});
const fail=(status,code,message)=>Object.assign(new Error(message),{status,code});
const text=(value,max)=>typeof value==='string'&&value.trim()&&value.length<=max?value.trim():null;
function sourceURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&u.hostname.includes('.')&&!u.hostname.endsWith('.')&&value.length<=1500?u.href:null;}catch{return null;}}
function workerConfig(env){
 try{const u=new URL(env.Q_RESEARCH_WORKER_URL),local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||(u.protocol!=='https:'&&!(env.Q_RESEARCH_LOCAL_WORKER==='true'&&local&&u.protocol==='http:'))||String(env.Q_RESEARCH_WORKER_SECRET||'').length<32)return null;return {url:u.origin,secret:env.Q_RESEARCH_WORKER_SECRET};}catch{return null;}
}
export function workerSignature({secret,time,nonce,member,method,path,body=''}){return createHmac('sha256',secret).update([time,nonce,member,method,path,createHash('sha256').update(body).digest('hex')].join('\n')).digest('hex');}
function stableID(value){const bytes=createHash('sha256').update(JSON.stringify(value)).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;const h=bytes.toString('hex');return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');}
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export function createResearchService({getConfig,env=process.env,fetchImpl=globalThis.fetch,now=()=>Date.now()}){
 return async({method,authorization,body={},query={}})=>{
  if(!['GET','POST'].includes(method))return response(405,{code:'method_not_allowed',message:'Use GET or POST.'});
  const auth=await authenticateMember({authorization,getConfig,fetchImpl});if(auth.response)return auth.response;
  const {user,policy,config,headers}=auth;
  const permitted=policy.is_admin===true||String(env.Q_RESEARCH_MEMBER_IDS||'').split(',').map(x=>x.trim().toLowerCase()).filter(x=>UUID.test(x)).includes(user.id.toLowerCase());
  if(!permitted||policy.studio_only_project_id||policy.private_fragile_owner_id)return response(403,{code:'research_access_required',message:'Research is not enabled for this account.'});
  async function workspace(path,options={}){
   let r;try{r=await fetchImpl(config.url+'/rest/v1/'+path,{...options,headers:{...headers,...options.headers},cache:'no-store',signal:AbortSignal.timeout(6500)});}catch{throw fail(503,'workspace_unavailable','Quest could not confirm this action. Your draft is still here; retry it.');}
   if(!r.ok)throw fail(r.status===409?409:r.status===403?403:503,'save_unconfirmed','Quest could not confirm this action. Your access may have changed. Keep your draft and retry.');
   try{return await r.json();}catch{throw fail(503,'save_unconfirmed','The save was not confirmed. Keep your draft and retry.');}
  }
  try{
   const projects=await workspace('projects?select=id,name&order=name.asc');if(!Array.isArray(projects))throw fail(503,'workspace_unavailable','Your project access could not be checked.');
   const editable=projects.filter(p=>policy.is_admin===true||(!policy.personal_only&&(policy.editable_project_ids==null||policy.editable_project_ids.includes(p.id))));
   const privateNotes=!!((policy.is_admin||policy.personal_only)&&policy.personal_workspace_ready);
   const destinations={private_notes:privateNotes,projects:editable.map(p=>({id:p.id,name:p.name}))};
   const settings=workerConfig(env),configured=env.Q_RESEARCH_ENABLED==='true'&&!!settings;
   const action=method==='GET'?(query.action||'status'):body?.action;
   if(!['status','start','job','latest','stop','save'].includes(action)||(method==='GET'&&!['status','job','latest'].includes(action))||(method==='POST'&&!['start','stop','save'].includes(action)))throw fail(400,'invalid_request','Choose a valid research action.');
   if(!configured){if(action==='status')return response(200,{configured:false,destinations,message:'Research is built but needs the private browser worker connected by the owner.'});throw fail(503,'research_not_configured','Research needs owner setup. Your question has not been sent.');}
   async function worker(path,payload,verb='POST'){
    const raw=payload==null?'':JSON.stringify(payload),time=String(Math.floor(now()/1000)),nonce=randomUUID();
    const signature=workerSignature({secret:settings.secret,time,nonce,member:user.id,method:verb,path,body:raw});
    let r;try{r=await fetchImpl(settings.url+path,{method:verb,headers:{'Content-Type':'application/json','x-q-member':user.id,'x-q-time':time,'x-q-nonce':nonce,'x-q-signature':signature},...(verb==='GET'?{}:{body:raw}),signal:AbortSignal.timeout(12000),cache:'no-store'});}catch{throw fail(503,'research_connection','Q could not confirm the worker response. Retry this same request to check it safely.');}
    let data;try{data=await r.json();}catch{throw fail(502,'research_connection','The research worker returned an unreadable response. Retry to check your run.');}
    if(!r.ok){const messages={quota_reached:'Today’s research limit has been reached. Try again after midnight in Johannesburg.',active_job:'You already have research in progress. Open your latest run.',queue_full:'The research queue is full. Please retry later.',invalid_sources:'Choose up to three public HTTPS websites. Private addresses and sign-in pages are not supported.',job_not_found:'This research is unavailable or has expired.',id_conflict:'This request was already used for a different question. Start a new run.',worker_not_configured:'The research worker needs owner setup.'};const code=Object.hasOwn(messages,data.code)?data.code:'research_connection';throw fail([400,403,404,409,429,503].includes(r.status)?r.status:502,code,messages[code]||'The research worker could not confirm this request. Please retry.');}
    return data;
   }
   async function checkedJob(id){
    if(!UUID.test(id||''))throw fail(400,'invalid_request','Choose a valid research run.');
    const job=await worker('/v1/jobs/'+id,null,'GET');
    if(job.owner_id!==user.id||!UUID.test(job.id||''))throw fail(404,'job_not_found','This research is unavailable.');
    if(job.scope_project_id&&!projects.some(p=>p.id===job.scope_project_id)){
     if(ACTIVE.has(job.status))try{await worker('/v1/jobs/'+id+'/stop',{});}catch{}
     throw fail(403,'scope_revoked','Your access to this research project has changed. Its results are no longer available.');
    }
    return job;
   }
   const safeJob=job=>({id:job.id,scope_project_id:job.scope_project_id||null,question:String(job.question||'').slice(0,2000),urls:(job.urls||[]).filter(x=>sourceURL(x)).slice(0,3),status:job.status,stage:String(job.stage||'').slice(0,200),result:String(job.result||'').slice(0,16000),message:String(job.message||'').slice(0,300),sources:(job.sources||[]).filter(x=>sourceURL(x)).slice(0,30),calls:Number(job.calls)||0,input_tokens:Number(job.input_tokens)||0,output_tokens:Number(job.output_tokens)||0,events:(job.events||[]).slice(-12).map(e=>({step:Number(e.step)||0,url:sourceURL(e.url)||''})),created_at:job.created_at});
   if(action==='status'){const status=await worker('/v1/status',null,'GET');return response(200,{configured:status.configured===true,limits:status.limits,usage:status.usage,destinations});}
   if(action==='start'){
    if(!UUID.test(body.id||'')||!text(body.question,2000)||!Array.isArray(body.urls)||body.urls.length<1||body.urls.length>3||body.urls.some(x=>typeof x!=='string'||!sourceURL(x)))throw fail(400,'invalid_request','Enter a question and one to three public HTTPS source URLs.');
    const scope=body.scope_project_id||null;if(scope&&!projects.some(p=>p.id===scope))throw fail(403,'scope_revoked','That project is no longer available.');
    const result=await worker('/v1/jobs',{id:body.id,question:body.question.trim(),urls:[...new Set(body.urls.map(sourceURL))],scope_project_id:scope});
    return response(200,{job:safeJob(await checkedJob(result.id))});
   }
   if(action==='latest'){
    const latest=await worker('/v1/latest',null,'GET');if(!latest.id)return response(200,{job:null});
    return response(200,{job:safeJob(await checkedJob(latest.id))});
   }
   const job=await checkedJob(method==='GET'?query.id:body.id);
   if(action==='job')return response(200,{job:safeJob(job)});
   if(action==='stop'){await worker('/v1/jobs/'+job.id+'/stop',{});return response(200,{job:safeJob(await checkedJob(job.id))});}
   // Saving always needs an explicit, reviewed client request and current destination access.
   if(!['done','partial'].includes(job.status)||!job.result)throw fail(409,'research_not_ready','Wait for research findings before saving.');
   const title=text(body.title,160),kind=body.kind,projectId=body.project_id||null;
   if(!title||!['private_note','project_note','task'].includes(kind)||!text(body.content,6000))throw fail(400,'invalid_review','Review a title and the research text before saving.');
   if(kind==='private_note'?!privateNotes:!editable.some(p=>p.id===projectId))throw fail(403,'destination_revoked','You no longer have permission to save in that destination.');
   const due=body.due_date||null;if(due&&!validDate(due))throw fail(400,'invalid_review','Choose a valid due date.');
   const sources=[...new Set((job.sources||[]).filter(x=>sourceURL(x)))].slice(0,8).map(x=>x.slice(0,500));
   const content=body.content.trim()+'\n\nQ Research · '+job.id+'\nQuestion: '+String(job.question).slice(0,500)+'\nVisited sources:\n'+(sources.join('\n')||'No source URLs recorded. Verify these findings before relying on them.');
   const id=stableID([user.id,job.id,kind,kind==='private_note'?null:projectId,title,kind==='task'?null:content,kind==='task'?due:null]);
   let saved;
   if(kind==='private_note'){
    saved=await workspace('rpc/quest_save_personal_note',{method:'POST',body:JSON.stringify({note_id:id,note_kind:'writing',note_title:title,note_body:content,note_category:'Research',note_pinned:false,note_status:'open',due_local:null,remind_local:null,zone:'Africa/Johannesburg',expected_revision:null})});
    if(saved?.id!==id||saved.owner_id!==user.id)throw fail(503,'save_unconfirmed','The note save was not confirmed. Keep your draft and retry.');
   }else{
    const table=kind==='task'?'tasks':'project_notes',row={id,title,project_id:projectId,created_by:user.id,...(kind==='task'?{status:'To do',due_date:due,assigned_to:user.id}:{body:content})};
    const matches=await workspace(table+'?select=*&id=eq.'+id);
    if(matches.length){saved=matches[0];if(Object.keys(row).some(k=>saved[k]!==row[k]))throw fail(409,'save_conflict','This saved item has changed. Open it in Quest before creating another copy.');}
    else{
     try{const rows=await workspace(table+'?select=*',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(row)});saved=rows[0];}
     catch(error){if(error.status!==409)throw error;const rows=await workspace(table+'?select=*&id=eq.'+id);saved=rows[0];if(!saved||Object.keys(row).some(k=>saved[k]!==row[k]))throw fail(409,'save_conflict','This saved item has changed. Check Quest before creating another copy.');}
    }
    if(saved?.id!==id)throw fail(503,'save_unconfirmed','The save was not confirmed. Keep your draft and retry.');
   }
   return response(200,{saved:{id,kind,project_id:kind==='private_note'?null:projectId,title}});
  }catch(error){return response(error.status||503,{code:error.code||'research_unavailable',message:error.code?error.message:'Research could not finish this request. Your draft is still here; retry.'});}
 };
}

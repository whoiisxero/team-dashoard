/* Review-only simulated transport. Never imported by index.html or the production build. */
if(!crypto.randomUUID)crypto.randomUUID=()=>{const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const s=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');return [s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');};
const preview={job:null,runs:0,saves:new Map(),hold:false,failStart:false,failSave:false,calls:[],uid:'00000000-0000-4000-8000-000000000001'};window.qResearchPreview=preview;
const project={id:'00000000-0000-4000-8000-000000000010',name:'Sample project'};
const data={user:{id:preview.uid},member:{display_name:'Quan'},projects:[project],tasks:[],calendarEvents:[],policy:{ready:true,is_admin:true,shared_access:true,personal_workspace_ready:true},db:{auth:{getSession:async()=>({data:{session:{access_token:'local-preview-session-0123456789'}}})}},canEditProject:()=>true};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
function evolve(){const j=preview.job;if(!j||preview.hold||!['queued','running','stopping'].includes(j.status))return;if(j.status==='stopping'){j.status='cancelled';j.stage='Cancelled';j.message='Preview run stopped.';return;}const elapsed=Date.now()-j.created_at*1000;j.status='running';j.stage=elapsed<1800?'Opening sample sources':'Reading public page text';j.calls=elapsed<1800?0:1;j.events=elapsed<1800?[]:[{step:1,url:j.urls[0]}];if(elapsed>3500){j.status='done';j.stage='Preview complete';j.calls=2;j.input_tokens=1200;j.output_tokens=230;j.sources=j.urls;j.result='This is a simulated research result so you can try Q’s workflow. No websites were visited.\n\nWith the browser service connected, Q reads your selected public websites and returns a summary with source links.\n\nReview the note text, choose a destination, and save. You can also turn one finding into a task. Preview saves stay in this page and clear when you reload.';}}
window.fetch=async(address,options={})=>{
 const value=String(address),u=new URL(value,'https://preview.invalid'),body=options.body?JSON.parse(options.body):{},action=body.action||u.searchParams.get('action');preview.calls.push({action,body});
 if(u.pathname==='/api/assistant')return response(options.method==='POST'?{reply:'This is a local preview. Open the Research tab to try the new workflow.',actions:[]}:{configured:true});
 if(u.pathname!=='/api/research')throw Error('The preview does not connect to external services.');
 if(!data.policy.is_admin)return response({code:'research_access_required',message:'Research is not enabled for this account.'},403);
 evolve();
 if(action==='status')return response({configured:true,destinations:{private_notes:true,projects:[project]},limits:{calls:6,seconds:180,retention_days:14},usage:{member_runs:preview.runs,member_limit:3}});
 if(action==='start'){
  if(!preview.job||preview.job.id!==body.id){preview.runs++;preview.job={id:body.id,question:body.question,urls:body.urls,scope_project_id:body.scope_project_id,status:'queued',stage:'Waiting for browser',sources:[],events:[],calls:0,input_tokens:0,output_tokens:0,result:'',message:'',created_at:Date.now()/1000};}
  if(preview.failStart){preview.failStart=false;throw Error('Simulated lost acknowledgement');}return response({job:structuredClone(preview.job)});
 }
 if(action==='latest'||action==='job')return response({job:preview.job?structuredClone(preview.job):null});
 if(action==='stop'){preview.job.status='stopping';preview.job.stage='Stopping browser…';return response({job:structuredClone(preview.job)});}
 if(action==='save'){
  const id=JSON.stringify(body);if(!preview.saves.has(id))preview.saves.set(id,{id:crypto.randomUUID(),kind:body.kind,title:body.title,project_id:body.project_id});
  if(preview.failSave){preview.failSave=false;throw Error('Simulated lost save acknowledgement');}return response({saved:preview.saves.get(id)});
 }
 return response({code:'invalid_request',message:'Unknown preview action.'},400);
};
const assistant=createQuestAssistant({getData:()=>data,navigate:()=>{},canView:()=>true,openEntry:()=>{},toast:()=>{},refreshWorkspace:()=>{},onResearchSaved:record=>{document.querySelector('.preview-help').textContent='Preview '+(record.kind==='task'?'task':'note')+' saved: '+record.title+' · no live Quest data changed.';},showCalendar:()=>{}});assistant.sync();
const previewNotice=document.createElement('small');previewNotice.className='preview-inline-notice';previewNotice.textContent='PREVIEW · Simulated research and saves';document.getElementById('qaTitle').parentElement.append(previewNotice);
function openResearch(){document.getElementById('qaOpen').click();if(document.getElementById('qaResearchTab').hidden)return;document.getElementById('qaResearchTab').click();if(!document.getElementById('qrQuestion').value){document.getElementById('qrQuestion').value='Compare services from these public websites';document.getElementById('qrURLs').value='https://example.com/';}}
document.getElementById('previewOpen').onclick=openResearch;openResearch();window.qResearchPreview.data=data;window.qResearchPreview.sync=()=>assistant.sync();

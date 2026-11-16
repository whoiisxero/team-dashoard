/* Public research UI. Results and drafts stay in memory and clear when access changes. */
window.createAssistantResearch=({panel,getData,getToken,onEnter=()=>{},onSaved=()=>{},reposition=()=>{}})=>{
 const node=(tag,value='',cls='')=>{const n=document.createElement(tag);n.textContent=value;if(cls)n.className=cls;return n;},$=id=>document.getElementById(id);
 const chat=node('div','','qa-chat-view');chat.id='qaChatView';chat.setAttribute('role','tabpanel');chat.setAttribute('aria-labelledby','qaChatTab');
 for(const child of [...panel.children].slice(1))chat.append(child);
 const tabs=node('div','','qa-mode-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Q mode');
 tabs.innerHTML='<button type="button" id="qaChatTab" role="tab" aria-selected="true" aria-controls="qaChatView">Chat</button><button type="button" id="qaResearchTab" role="tab" aria-selected="false" aria-controls="qaResearchView" tabindex="-1" hidden>Research <span>↗</span></button>';
 const view=node('div','','qr-view');view.id='qaResearchView';view.hidden=true;view.setAttribute('role','tabpanel');view.setAttribute('aria-labelledby','qaResearchTab');
 view.innerHTML=`<div class="qr-intro"><span class="qr-eyebrow">Q / Research</span><h3>Follow the sources.</h3><p>Explore public websites, then review what belongs in your work.</p></div>
 <p id="qrSetup" class="qr-notice" hidden>Research needs the private browser service connected by the owner. You can prepare a question here. <a href="/setup-guide.html#q-research" target="_blank" rel="noopener noreferrer">Open Research setup</a></p>
 <form id="qrForm"><label>What would you like to find out?<textarea class="input" id="qrQuestion" maxlength="2000" rows="3" required placeholder="Compare these suppliers and summarise their services…"></textarea></label>
 <label>Websites to read<textarea class="input" id="qrURLs" maxlength="4503" rows="3" required placeholder="https://example.com\nOne public HTTPS link per line"></textarea></label>
 <label>Related project<select class="input" id="qrScope"><option value="">No project · only you can see this run</option></select></label>
 <p class="qr-hint">Uses only this question and these public websites. Your Quest chats, notes and files stay out of the browser. Selecting a project does not share the run.</p>
 <div class="qr-actions"><button class="button primary" type="submit" id="qrStart">Start research</button><button class="button" type="button" id="qrRetryStart" hidden>Check this request</button></div></form>
 <p id="qrLimits" class="qr-hint"></p><p id="qrStatus" class="qr-status" role="status" aria-live="polite"></p>
 <div class="qr-actions"><button class="button" type="button" id="qrRetry" hidden>Retry connection</button><button class="button" type="button" id="qrLatest">Latest run</button></div>
 <section id="qrRun" class="qr-run" hidden aria-label="Research progress"><div class="qr-run-head"><div><span id="qrBadge" class="qr-badge"></span><h4 id="qrRunQuestion"></h4></div><button class="button" type="button" id="qrStop" hidden>Stop</button></div><p id="qrStage" role="status"></p><ol id="qrEvents" class="qr-events"></ol><p id="qrUsage" class="qr-hint"></p>
 <section id="qrFindings" hidden><h4>Findings</h4><p class="qr-hint">AI findings can miss details. Check the sources before using them.</p><div id="qrResult" class="qr-result"></div><h4>Visited sources</h4><ul id="qrSources" class="qr-sources"></ul><div class="qr-actions"><button class="button" type="button" id="qrDownload">Download report</button><button class="button" type="button" id="qrReviewNote">Review & save note</button><button class="button" type="button" id="qrReviewTask">Review a task</button></div></section></section>
 <form id="qrReview" class="qr-review" hidden><div class="qr-eyebrow">Review before saving</div><h4 id="qrReviewHeading"></h4><label>Title<input class="input" id="qrTitle" maxlength="160" required></label><label>Save to<select class="input" id="qrDestination" required></select></label><label id="qrContentLabel">Note text<textarea class="input" id="qrContent" maxlength="6000" rows="7" required></textarea></label><label id="qrDueLabel" hidden>Due date (optional)<input class="input" type="date" id="qrDue"></label><p id="qrPrivacy" class="qr-hint"></p><div class="qr-actions"><button class="button primary" id="qrSave" type="submit">Save reviewed note</button><button class="button" id="qrCancelReview" type="button">Cancel</button></div><p id="qrSaveStatus" role="status"></p></form>`;
 panel.append(tabs,chat,view);
 let key='',epoch=0,controller=new AbortController(),opened=false,mode='chat',checking=false,config=null,job=null,pending=null,busy=false,saveBusy=false,reviewKind=null,pollTimer=null,savedReview=null,uncertainSave=false;
 const active=()=>job&&['queued','running','stopping'].includes(job.status);
 const eligible=()=>{const p=getData().policy;return !!(getData().user?.id&&p&&!p.studio_only_project_id&&!p.private_fragile_owner_id);};
 const scopeKey=()=>{const d=getData();return JSON.stringify([d.user?.id,d.projects?.map(p=>p.id).sort(),d.policy]);};
 const valid=version=>version===epoch&&scopeKey()===key&&eligible();
 const url=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
 function link(value){const a=node('a',value);a.href=value;a.target='_blank';a.rel='noopener noreferrer';return a;}
 function status(value){$('qrStatus').textContent=value;}
 async function api(action,payload=null){
  const version=epoch,token=await getToken();if(!valid(version)||!token)throw Object.assign(Error('Please sign in again.'),{code:'sign_in_required',status:401});
  const read=['status','latest','job'].includes(action),query=new URLSearchParams({action,...(action==='job'?{id:payload.id}:{})});
  const timeout=new AbortController(),cancel=()=>timeout.abort();controller.signal.addEventListener('abort',cancel,{once:true});const timer=setTimeout(cancel,22000);
  try{
   const response=await fetch('/api/research'+(read?'?'+query:''),{method:read?'GET':'POST',headers:{Authorization:'Bearer '+token,...(read?{}:{'Content-Type':'application/json'})},...(read?{}:{body:JSON.stringify({action,...payload})}),credentials:'same-origin',cache:'no-store',signal:timeout.signal});
   const result=await response.json();if(!valid(version))throw Object.assign(Error('Access changed.'),{stale:true});
   if(!response.ok)throw Object.assign(Error(result.message||'Research could not confirm this request.'),{code:result.code,status:response.status});return result;
  }catch(error){if(!valid(version))throw Object.assign(error,{stale:true});throw error;}
  finally{clearTimeout(timer);controller.signal.removeEventListener('abort',cancel);}
 }
 function controls(){
  const locked=busy||!!pending||!!active();
  for(const id of ['qrQuestion','qrURLs','qrScope'])$(id).disabled=locked;
  $('qrStart').disabled=!config?.configured||locked||navigator.onLine===false;
  $('qrStart').textContent=busy?'Sending…':active()?'Research in progress':'Start research';
  $('qrRetryStart').hidden=!pending||busy;$('qrRetryStart').disabled=busy;
  $('qrLatest').disabled=busy||saveBusy||!config?.configured||!!pending;
  $('qrStop').hidden=!active();$('qrStop').disabled=busy||job?.status==='stopping';$('qrStop').textContent=job?.status==='stopping'?'Stopping…':'Stop';
  $('qrForm').toggleAttribute('data-app-saving',busy||!!pending);
  $('qrReviewNote').disabled=!config||(!config.destinations.private_notes&&!config.destinations.projects.length);
  $('qrReviewTask').disabled=!config?.destinations.projects.length;
  $('qrSave').disabled=saveBusy;$('qrCancelReview').disabled=saveBusy||uncertainSave;
  for(const id of ['qrTitle','qrDestination','qrContent','qrDue'])$(id).disabled=saveBusy||uncertainSave;
  $('qrSave').textContent=saveBusy?'Saving…':uncertainSave?'Retry this save':reviewKind==='task'?'Create reviewed task':'Save reviewed note';
  $('qrRetry').hidden=!!pending||!eligible();
 }
 function reset(){
  controller.abort();controller=new AbortController();clearTimeout(pollTimer);pollTimer=null;epoch++;config=null;job=null;pending=null;checking=false;busy=false;saveBusy=false;savedReview=null;uncertainSave=false;reviewKind=null;key='';
  $('qrForm').reset();$('qrReview').reset();for(const form of [$('qrForm'),$('qrReview')]){delete form.dataset.appDirty;delete form.dataset.appSaving;}
  $('qrReview').hidden=true;$('qrRun').hidden=true;$('qrEvents').replaceChildren();$('qrSources').replaceChildren();$('qrResult').textContent='';$('qrRunQuestion').textContent='';$('qrSaveStatus').textContent='';status('');$('qrLimits').textContent='';$('qaResearchTab').hidden=true;setMode('chat');
 }
 function sync(){
  const next=scopeKey();if(!eligible()){if(key)reset();return;}
  if(key!==next){reset();key=next;populateScope();$('qaResearchTab').hidden=!getData().policy.is_admin;if(opened)void check();}
 }
 function populateScope(){
  const selected=$('qrScope').value;$('qrScope').replaceChildren(new Option('No project · only you can see this run',''));
  for(const p of getData().projects||[])$('qrScope').add(new Option(p.name,p.id));if([...$('qrScope').options].some(o=>o.value===selected))$('qrScope').value=selected;
 }
 function setMode(next){
  mode=next;chat.hidden=next!=='chat';view.hidden=next!=='research';panel.classList.toggle('qa-research-active',next==='research');
  for(const name of ['chat','research']){const tab=$(name==='chat'?'qaChatTab':'qaResearchTab'),selected=name===next;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
  if(next==='research'){onEnter();if(!config&&!checking&&key)void check();schedule();}else{clearTimeout(pollTimer);pollTimer=null;}reposition();
 }
 function show(question=''){sync();if(!eligible()||$('qaResearchTab').hidden)return false;setMode('research');if(question&&!pending&&!active()){$('qrQuestion').value=question.slice(0,2000);$('qrForm').dataset.appDirty='true';}$('qrQuestion').focus({preventScroll:true});return true;}
 async function check(){
  if(checking||!eligible()||!key)return;checking=true;const version=epoch;status('Checking research connection…');
  try{
   const result=await api('status');if(!valid(version))return;config=result;$('qaResearchTab').hidden=false;$('qrSetup').hidden=!!result.configured;
   const usage=result.usage,limits=result.limits;
   $('qrLimits').textContent=usage&&limits?`${Math.max(0,usage.member_limit-usage.member_runs)} of ${usage.member_limit} runs left today · up to ${limits.calls} AI calls and ${limits.seconds} seconds per run. Resets at midnight in Johannesburg. Reports kept ${limits.retention_days} days.`:'';
   status(result.configured?'Ready when you are.':result.message||'Research needs owner setup. Your question has not been sent.');
   if(result.configured&&!job&&!pending)await latest();
  }catch(error){if(!error.stale){if(error.status===401||error.status===403)revoke(error);else status(error.message||'Could not check the connection. Retry when ready.');}}
  finally{if(valid(version)){checking=false;controls();}}
 }
 function revoke(error){const message=error.message;reset();key=scopeKey();status(message);$('qaResearchTab').hidden=!getData().policy?.is_admin;}
 function errorState(error){if(error.stale)return;if([401,403].includes(error.status)){revoke(error);return;}status(error.message||'Connection lost. Your question is still here. Retry to check your run.');controls();}
 async function latest(){
  const version=epoch;
  try{const result=await api('latest');if(valid(version)){job=result.job;render();if(!job)status('No previous research yet.');}}
  catch(error){errorState(error);}
 }
 function schedule(){clearTimeout(pollTimer);pollTimer=null;if(opened&&mode==='research'&&active()&&!busy&&!saveBusy)pollTimer=setTimeout(poll,1800);}
 async function poll(){
  if(!job)return;const id=job.id,version=epoch;
  try{const result=await api('job',{id});if(valid(version)&&job?.id===id){job=result.job;render();}}
  catch(error){errorState(error);/* Retry is explicit after a lost connection. */}
 }
 function render(){
  $('qrRun').hidden=!job;if(!job){controls();return;}
  const labels={queued:'Queued',running:'Researching',stopping:'Stopping',cancelled:'Cancelled',done:'Complete',partial:'Partial findings',failed:'Could not finish'};
  $('qrBadge').textContent=labels[job.status]||'Research';$('qrBadge').dataset.state=job.status;$('qrRunQuestion').textContent=job.question;$('qrStage').textContent=job.stage;
  status(job.message||(['done','partial'].includes(job.status)?'Review the findings and sources before saving.':job.status==='cancelled'?'Research stopped.':'Research runs only on the public websites you selected.'));
  $('qrEvents').replaceChildren();for(const event of (job.events||[]).slice(-4)){const li=node('li','Step '+event.step+' · ');const source=url(event.url);if(source)li.append(link(source));else li.append(node('span','Reading page'));$('qrEvents').append(li);}
  $('qrUsage').textContent=`${job.calls||0} AI calls · ${job.input_tokens||0} input / ${job.output_tokens||0} output tokens`;
  $('qrFindings').hidden=!job.result;$('qrResult').textContent=job.result||'';$('qrSources').replaceChildren();
  for(const value of job.sources||[]){const source=url(value);if(source){const li=node('li');li.append(link(source));$('qrSources').append(li);}}
  if(!$('qrSources').children.length)$('qrSources').append(node('li','No visited URLs recorded. Verify the findings before using them.'));
  for(const id of ['qrReviewNote','qrReviewTask'])$(id).hidden=!['done','partial'].includes(job.status);
  controls();schedule();
 }
 async function start(){
  if(busy||active()||!config?.configured)return;
  if(!pending){
   if(!$('qrForm').reportValidity())return;
   const urls=$('qrURLs').value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);if(!urls.length||urls.length>3||urls.some(v=>!url(v)||new URL(v).port&&!['443'].includes(new URL(v).port))){status('Enter one to three public HTTPS links, one per line.');return;}
   pending={id:crypto.randomUUID(),question:$('qrQuestion').value.trim(),urls,scope_project_id:$('qrScope').value||null};
  }
  const version=epoch;busy=true;controls();status('Sending your request…');
  try{
   const result=await api('start',pending);if(!valid(version))return;job=result.job;pending=null;delete $('qrForm').dataset.appDirty;$('qrReview').hidden=true;render();
  }catch(error){if(!error.stale){if(error.status&&error.status<500){pending=null;if(error.code==='active_job')await latest();}errorState(error);}}
  finally{if(valid(version)){busy=false;controls();schedule();}}
 }
 async function stop(){
  if(!active()||busy)return;const id=job.id,version=epoch;busy=true;controls();status('Requesting Stop…');
  try{const result=await api('stop',{id});if(valid(version)&&job?.id===id){job=result.job;render();}}
  catch(error){errorState(error);}
  finally{if(valid(version)){busy=false;controls();schedule();}}
 }
 function review(kind){
  if(!job?.result||!config||saveBusy||uncertainSave)return;
  reviewKind=kind;savedReview=null;$('qrReview').hidden=false;$('qrReviewHeading').textContent=kind==='task'?'Turn a finding into a task':'Keep the useful findings';
  $('qrDestination').replaceChildren();if(kind!=='task'&&config.destinations.private_notes)$('qrDestination').add(new Option('My private notebook','private_note'));
  for(const project of config.destinations.projects)$('qrDestination').add(new Option(project.name,project.id));
  if(job.scope_project_id&&config.destinations.projects.some(p=>p.id===job.scope_project_id))$('qrDestination').value=job.scope_project_id;
  $('qrTitle').value=job.question.slice(0,160);$('qrContent').value=job.result.slice(0,6000);$('qrContent').required=kind!=='task';$('qrContentLabel').hidden=kind==='task';$('qrDueLabel').hidden=kind!=='task';$('qrDue').value='';$('qrSaveStatus').textContent='';$('qrReview').dataset.appDirty='true';privacy();controls();$('qrTitle').focus({preventScroll:true});$('qrReview').scrollIntoView({block:'nearest'});
 }
 function privacy(){const personal=$('qrDestination').value==='private_note';$('qrPrivacy').textContent=reviewKind==='task'?'Creates a To do task assigned to you in this project. Only the title and optional due date are saved; download or save the full findings separately.':personal?'Private to your account. Visited source links are added to the note.':'Shared with people who can access this project. Visited source links are added to the note.';}
 async function save(){
  if(saveBusy||!job||!$('qrReview').reportValidity())return;
  if(!savedReview){const destination=$('qrDestination').value;savedReview={id:job.id,kind:reviewKind==='task'?'task':destination==='private_note'?'private_note':'project_note',project_id:destination==='private_note'?null:destination,title:$('qrTitle').value.trim(),content:reviewKind==='task'?job.result.slice(0,6000):$('qrContent').value,due_date:reviewKind==='task'?$('qrDue').value||null:null};}
  const version=epoch;saveBusy=true;$('qrReview').dataset.appSaving='true';controls();$('qrSaveStatus').textContent='Saving your reviewed '+(reviewKind==='task'?'task':'note')+'…';
  try{
   const result=await api('save',savedReview);if(!valid(version))return;
   delete $('qrReview').dataset.appDirty;delete $('qrReview').dataset.appSaving;uncertainSave=false;savedReview=null;$('qrReview').hidden=true;status(result.saved.kind==='task'?'Task saved to Quest.':'Note saved to Quest.');
   Promise.resolve(onSaved(result.saved)).catch(()=>status('Saved to Quest. Refresh the destination to see it.'));
  }catch(error){
   if(!error.stale){if([401,403].includes(error.status)){revoke(error);return;}
    uncertainSave=!error.status||error.status>=500;if(!uncertainSave)savedReview=null;
    $('qrSaveStatus').textContent=uncertainSave?'The save was not confirmed. Retry this same save to check it without adding a duplicate.':error.message||'The save could not be confirmed. Your draft is still here.';
   }
  }finally{if(valid(version)){saveBusy=false;delete $('qrReview').dataset.appSaving;controls();}}
 }
 $('qaChatTab').onclick=()=>setMode('chat');$('qaResearchTab').onclick=()=>setMode('research');
 tabs.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)&&!$('qaResearchTab').hidden){event.preventDefault();setMode(event.key==='Home'?'chat':event.key==='End'?'research':mode==='chat'?'research':'chat');$(mode==='chat'?'qaChatTab':'qaResearchTab').focus();}});
 $('qrForm').onsubmit=event=>{event.preventDefault();void start();};$('qrRetryStart').onclick=()=>void start();
 $('qrRetry').onclick=()=>{if(pending)void start();else if(job)void poll();else void check();};$('qrLatest').onclick=()=>void latest();$('qrStop').onclick=()=>void stop();
 $('qrReviewNote').onclick=()=>review('note');$('qrReviewTask').onclick=()=>review('task');$('qrDestination').onchange=privacy;
 $('qrReview').onsubmit=event=>{event.preventDefault();void save();};$('qrCancelReview').onclick=()=>{if(saveBusy||uncertainSave)return;$('qrReview').hidden=true;delete $('qrReview').dataset.appDirty;};
 for(const form of [$('qrForm'),$('qrReview')])form.addEventListener('input',()=>form.dataset.appDirty='true');
 $('qrDownload').onclick=()=>{if(!job?.result)return;const report=['Q Research',job.question,'Status: '+job.status,'',job.result,'','Visited sources',...(job.sources||[]),'',job.message||''].join('\n'),href=URL.createObjectURL(new Blob([report],{type:'text/plain;charset=utf-8'})),a=node('a');a.href=href;a.download='Quest-Research-'+job.id.slice(0,8)+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);};
 window.addEventListener('offline',()=>{if(!key)return;clearTimeout(pollTimer);status('You’re offline. Drafts remain here. A submitted run may still be working; reconnect and check it.');controls();});
 window.addEventListener('online',()=>{if(key&&opened){status('Connection restored. Check your run or retry the same request.');controls();}});
 return {sync,reset,show,onOpen(){opened=true;sync();if(eligible())void check();schedule();},onClose(){opened=false;clearTimeout(pollTimer);}};
};

/* Shared task states use the existing database values and project permissions. */
window.QuestTaskStatus=(()=>{
 const states=[['To do','Pending','pending'],['In progress','In progress','working'],['Done','Completed','completed']];
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let options=null,epoch=0;const pending=new Map();
 const definition=value=>states.find(s=>s[0]===value)||states[0];
 const label=value=>definition(value)[1];
 const badgeHTML=task=>`<span class="task-state task-state-${definition(task.status)[2]}">${label(task.status)}</span>`;
 function controlHTML(task){
  const data=options?.getData();const editable=!!data?.user&&data.canEditProject(task.project_id||task.access_project_id);
  return badgeHTML(task)+(editable?`<label class="task-state-control"><span>Status</span><select data-task-status="${escape(task.id)}" aria-label="Status for ${escape(task.title)}" ${pending.has(task.id)?'disabled':''}>${states.map(([value,name])=>`<option value="${value}" ${task.status===value?'selected':''}>${name}</option>`).join('')}</select></label>`:'');
 }
 function control(task){const wrap=document.createElement('div');wrap.className='task-state-tools';wrap.innerHTML=controlHTML(task);return wrap;}
 function sync(){
  const data=options?.getData();if(!data)return;
  for(const select of document.querySelectorAll('[data-task-status]')){
   const task=data.tasks.find(t=>t.id===select.dataset.taskStatus),saving=pending.has(task?.id);
   select.disabled=!task||!data.user||!data.canEditProject(task.project_id||task.access_project_id)||saving;
   if(task)select.value=pending.get(task.id)?.status||task.status;
   select.setAttribute('aria-busy',String(saving));
  }
  for(const button of document.querySelectorAll('[data-complete]')){const task=data.tasks.find(t=>t.id===button.dataset.complete);button.disabled=!task||!data.user||!data.canEditProject(task.project_id||task.access_project_id)||pending.has(task.id);}
 }
 async function set(id,status){
  if(!states.some(s=>s[0]===status)||pending.has(id)||!options)return;
  const data=options.getData(),task=data.tasks.find(t=>t.id===id),uid=data.user?.id,token=epoch;
  if(!uid||!task||!data.canEditProject(task.project_id||task.access_project_id)){options.toast('This project is view only.');sync();return;}
  if(task.status===status){sync();return;}
  const previous=task.status;pending.set(id,{status});sync();let saved=false;
  try{
   const {data:updated,error}=await options.request(data.db.from('tasks').update({status}).eq('id',id).eq('status',previous).select('id,status').maybeSingle());
   if(error)throw error;if(!updated)throw new Error('This task changed or your access changed. Refresh Quest before retrying.');
   if(token!==epoch||options.getData().user?.id!==uid)return;
   saved=true;task.status=status;options.toast('Task '+label(status).toLowerCase());
   await options.refresh();
  }catch(error){if(token===epoch&&options.getData().user?.id===uid)options.toast(saved?'Status saved. Refresh Quest to reload the latest tasks.':error?.message||'Could not save status. Please retry.');}
  finally{if(token===epoch&&options.getData().user?.id===uid){pending.delete(id);sync();}}
 }
 document.addEventListener('change',event=>{const select=event.target.closest?.('[data-task-status]');if(select)void set(select.dataset.taskStatus,select.value);});
 return {label,badgeHTML,controlHTML,control,sync,set,configure:value=>{options=value;},reset:()=>{epoch++;pending.clear();}};
})();

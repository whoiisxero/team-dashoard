/* Database permissions are authoritative; these checks keep the UI in sync. */
window.createTeamAccess = ({getData, refresh, toast, request:runRequest=async value=>value}) => {
  const $=id=>document.getElementById(id);
  let policy=null,epoch=0,profiles=[],saving=false,presenceTimer=null,presenceOwner=null;
  let sessionKey=null,presenceBusy=false,accessRequest=0;
  const node=(tag,value,cls='')=>{const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;};
  const workspaceSetup=node('p','','hint');workspaceSetup.id='memberWorkspaceSetup';
  const workspaceSetupText=node('span',''),workspaceSetupLink=node('a','Open owner setup');workspaceSetupLink.href='/setup-guide.html';workspaceSetupLink.target='_blank';workspaceSetupLink.rel='noopener noreferrer';workspaceSetup.append(workspaceSetupText,workspaceSetupLink);$('memberAccessControls').prepend(workspaceSetup);
  const normal=name=>name.trim().toLowerCase().replace(/\.$/,'');
  function canEdit(project=null) {
    if(!policy)return false;
    if(policy.is_admin)return true;
    if(policy.personal_only)return false;
    if(!project)return !!policy.shared_access;
    if(!getData().projects.some(p=>p.id===project))return false;
    return policy.editable_project_ids==null||policy.editable_project_ids.includes(project);
  }
  function canView(view) {
    if(view==='overview')return true;
    if(!policy)return false;
    if(['kiMassage','kiLymphatic','kiMyofascial','kiFrequency','kiBodyRecovery','kiSports'].includes(view))return !!(policy.is_admin||policy.personal_only)&&/^ki\s+lifestyle/i.test(getData().businessName||'');
    if(['personalHome','personalSetup','writing','business','personalCalendar','quotes','invoices','businessStudio','questPreview'].includes(view))return !!(policy.is_admin||policy.personal_only);
    if(policy.personal_only)return ['notifications','privateChat'].includes(view);
    if(view==='members')return !!policy.is_admin;
    if(view==='discussions')return policy.shared_access;
    if(['fragile','loden','dusted'].includes(view))return getData().projects.some(p=>normal(p.name)===view)||policy.is_admin;
    return true;
  }
  function apply() {
    for(const button of document.querySelectorAll('[data-view]'))button.hidden=!canView(button.dataset.view);
    if(policy?.personal_only)for(const button of document.querySelectorAll('.sidebar [data-view="personalHome"]'))button.hidden=true;
    for(const label of document.querySelectorAll('.sidebar .nav-label'))if(label.textContent==='Projects')label.parentElement.hidden=!!policy?.personal_only;
    $('fragileShortcut').hidden=!canView('fragile');$('fragileShortcutStatus').hidden=true;
    for(const button of document.querySelectorAll('[data-add="project"]'))button.hidden=!policy?.can_create_projects;
    const writable=canEdit()||getData().projects.some(p=>canEdit(p.id));
    for(const button of document.querySelectorAll('[data-add]:not([data-add="project"])'))button.hidden=!writable;
    for(const button of document.querySelectorAll('[data-complete],[data-priority-kind]')){
      const id=button.dataset.complete||button.dataset.priorityId;
      const project=button.dataset.priorityKind==='project'?getData().projects.find(p=>p.id===id):getData().tasks?.find(t=>t.id===id);
      if(project)button.hidden=!canEdit(button.dataset.priorityKind==='project'?project.id:project.project_id||project.access_project_id);
    }
    for(const id of ['budgetSpent','recentMessages'])$(id)?.closest('.card')?.toggleAttribute('hidden',!policy?.shared_access);
    $('budgetNote').textContent=policy?.shared_access?$('budgetNote').textContent:'Your accessible projects';
    $('remainingStat')?.closest('.stat')?.toggleAttribute('hidden',!policy?.shared_access);
    $('budgetSubtitle')?.parentElement?.toggleAttribute('hidden',!policy?.shared_access);
    $('teamAccessNotice').hidden=!!policy;
    $('memberAccessControls').hidden=!policy?.is_admin;
    workspaceSetupText.textContent=policy?.personal_workspace_ready?'Private workspace features are installed. Use the owner setup page for calendar updates. ':'Private notes and personal-only workspaces need the latest database setup. ';
    $('members').hidden=!policy?.is_admin;
    $('memberCount')?.closest('.stat')?.toggleAttribute('hidden',!policy?.is_admin);
    $('memberCount')?.closest('.stats')?.classList.toggle('without-team-summary',!policy?.is_admin);
    if(!policy?.is_admin){$('memberCount').textContent='';$('memberNames').textContent='';}
    if(!policy?.is_admin){profiles=[];$('memberAccessList').replaceChildren();renderOnline();}
  }
  async function load() {
    const request=++accessRequest,current=epoch,uid=getData().user?.id;
    if(!uid)return false;
    try {
      const result=await runRequest(getData().db.rpc('my_dashboard_access'),'Member permission check timed out. Check your connection and retry.');
      if(current!==epoch||request!==accessRequest||getData().user?.id!==uid)return false;
      if(result.error||!result.data?.ready)throw result.error||new Error('Membership access is unavailable.');
      policy=result.data;apply();return true;
    } catch {
      if(current===epoch&&request===accessRequest){policy=null;apply();$('teamAccessNotice').textContent='Member permissions need setup or could not be checked. Only Home is available. Ask the owner to run the member access setup, then refresh.';}
      return false;
    }
  }
  function renderOnline(rows=null) {
    const root=$('onlineMemberList');root.replaceChildren();
    if(!rows){$('membersOnlineCount').textContent='—';$('membersOnlineLabel').textContent='Checking online status';return;}
    const online=rows.filter(m=>m.online).length;
    $('membersOnlineCount').textContent=online;$('membersOnlineLabel').textContent=`${online} online`;
    for(const member of rows){const item=node('div','','online-member');const dot=node('span','','presence-dot'+(member.online?' online':''));dot.setAttribute('aria-hidden','true');item.append(dot,node('strong',member.display_name),node('span',member.online?'Online':'Offline','presence-label'));root.append(item);}
    $('memberPresenceStatus').textContent='Online status updates about every 30 seconds. A disconnected member goes offline within 90 seconds.';
  }
  async function presenceTick() {
    if(presenceBusy||!presenceOwner||getData().user?.id!==presenceOwner)return;
    const current=epoch,uid=presenceOwner;presenceBusy=true;
    try {
      const touch=await getData().db.rpc('touch_member_presence',{session_key:sessionKey});if(touch.error)throw touch.error;
      if(current!==epoch||getData().user?.id!==uid||!policy?.is_admin)return;
      const result=await getData().db.rpc('team_online_members');if(result.error)throw result.error;
      if(current===epoch&&getData().user?.id===uid&&policy?.is_admin)renderOnline(result.data||[]);
    } catch {
      if(current===epoch){renderOnline();$('membersOnlineLabel').textContent='Status unavailable';$('memberPresenceStatus').textContent='Online status is unavailable. Reconnecting automatically…';}
    } finally {if(current===epoch)presenceBusy=false;}
  }
  function start() {
    const uid=getData().user?.id;if(!uid||presenceOwner===uid)return;
    presenceOwner=uid;
    if(crypto.randomUUID)sessionKey=crypto.randomUUID();else{const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');sessionKey=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
    void presenceTick();
    presenceTimer=setInterval(()=>{void presenceTick();if(!document.hidden)void refresh();},30000);
  }
  async function leave() {
    const uid=presenceOwner,key=sessionKey;presenceOwner=null;
    if(presenceTimer)clearInterval(presenceTimer);presenceTimer=null;
    if(uid&&getData().user?.id===uid)try{await getData().db.rpc('leave_member_presence',{session_key:key});}catch{}
  }
  async function loadMembers() {
    if(!policy?.is_admin)return;void presenceTick();
    const current=epoch,uid=getData().user?.id;
    $('memberAccessStatus').textContent='Loading access settings…';
    try{const result=await getData().db.rpc('list_member_access');if(current!==epoch||getData().user?.id!==uid||!policy?.is_admin)return;
      if(result.error)throw result.error;profiles=result.data||[];renderControls();$('memberAccessStatus').textContent='Project access also applies to its tasks, events, notes, chat, moodboard and notifications.';
    }catch{if(current===epoch)$('memberAccessStatus').textContent='Could not load permissions. Press Refresh to retry.';}
  }
  function renderControls() {
    const root=$('memberAccessList');root.replaceChildren();
    for(const member of profiles){const form=document.createElement('form');form.className='member-access-card';form.dataset.memberId=member.user_id;
      form.append(node('h3',member.display_name));if(member.is_admin){form.append(node('p','Owner · full access'));root.append(form);continue;}
      if(member.personal_only){form.append(node('p','Personal workspace only · no team projects or shared chats. Writing and business notes stay private to this member.'));root.append(form);continue;}
      if(policy.personal_workspace_ready){const personal=node('button','Create personal-only workspace','button');personal.type='button';personal.onclick=async()=>{
        if(!confirm(`Make ${member.display_name} personal-only? This removes their project access and other private-chat invitations, and creates a conversation with you.`))return;
        personal.disabled=true;const generation=epoch;try{const r=await getData().db.rpc('quest_make_personal_workspace',{target:member.user_id});if(r.error)throw r.error;if(generation!==epoch)return;toast('Private workspace created');await loadMembers();await refresh();}
        catch(error){if(generation===epoch)$('memberAccessStatus').textContent=error?.message||'Could not create this workspace.';}finally{if(generation===epoch)personal.disabled=false;}
      };form.append(personal);}
      const label=node('label','Project access');const mode=document.createElement('select');mode.className='input';mode.name='mode';
      for(const [value,text] of [['selected','Selected projects only'],['all','All projects, with exceptions']]){const option=node('option',text);option.value=value;mode.append(option);}mode.value=member.project_mode;label.append(mode);form.append(label);
      const group=node('fieldset','');group.append(node('legend','Allow access to'));
      for(const project of getData().projects){const rule=member.project_rules.find(x=>x.project_id===project.id);const row=node('label','','member-project-choice');const check=document.createElement('input');check.type='checkbox';check.name='project';check.value=project.id;check.checked=rule?.allowed??(member.project_mode==='all'&&!project.access_restricted);row.append(check,node('span',project.name));group.append(row);}form.append(group);
      let editMode;
      if(policy.access_levels_ready){
        const editLabel=node('label','Editing access');editMode=document.createElement('select');editMode.className='input';editMode.name='edit_mode';
        for(const [value,text] of [['all','Edit all accessible projects'],['selected','Edit selected projects; view the others']]){const option=node('option',text);option.value=value;editMode.append(option);}
        editMode.value=member.editable_project_ids==null?'all':'selected';editLabel.append(editMode);form.append(editLabel);
        const editGroup=node('fieldset','');editGroup.append(node('legend','Can edit'));
        for(const project of getData().projects){const row=node('label','','member-project-choice'),check=document.createElement('input');check.type='checkbox';check.name='editable_project';check.value=project.id;check.checked=member.editable_project_ids?.includes(project.id)||false;row.append(check,node('span',project.name));editGroup.append(row);}
        const syncEdits=()=>{editGroup.hidden=editMode.value!=='selected';const allowed=new Set([...group.querySelectorAll('input:checked')].map(x=>x.value));for(const check of editGroup.querySelectorAll('input')){check.disabled=!allowed.has(check.value);if(check.disabled)check.checked=false;}};
        editMode.onchange=syncEdits;group.onchange=syncEdits;syncEdits();form.append(editGroup);
      }
      const sharedRow=node('label','','member-project-choice'),shared=document.createElement('input');shared.type='checkbox';shared.name='shared';shared.checked=member.shared_access;sharedRow.append(shared,node('span','General team chat, team budget and items without a project'));form.append(sharedRow);
      form.append(node('p','Private projects require an explicit selection. In “all projects” mode, future public projects are included.','hint'));
      const save=node('button','Save access','button primary');save.type='submit';form.append(save);root.append(form);
      form.onsubmit=async event=>{event.preventDefault();if(saving)return;saving=true;const current=epoch;save.disabled=true;
        try{const args={target:member.user_id,mode:mode.value,shared:shared.checked,allowed_projects:[...form.querySelectorAll('[name=project]:checked')].map(x=>x.value)};
          if(editMode)args.editable_projects=editMode.value==='all'?null:[...form.querySelectorAll('[name=editable_project]:checked:not(:disabled)')].map(x=>x.value);
          const result=await getData().db.rpc(editMode?'set_member_access_levels':'set_member_access',args);if(result.error)throw result.error;
          if(current!==epoch)return;toast(`Access updated for ${member.display_name}`);await loadMembers();await refresh();
        }catch(error){if(current===epoch)$('memberAccessStatus').textContent=error?.message||'Could not save access. Please retry.';}
        finally{if(current===epoch){saving=false;save.disabled=false;}}
      };
    }
  }
  function reset() {
    epoch++;accessRequest++;policy=null;profiles=[];saving=false;presenceBusy=false;presenceOwner=null;sessionKey=null;
    if(presenceTimer)clearInterval(presenceTimer);presenceTimer=null;
    $('memberAccessList').replaceChildren();$('memberAccessControls').hidden=true;renderOnline();
  }
  $('membersRefresh').onclick=()=>void loadMembers();
  window.addEventListener('online',()=>{void presenceTick();void refresh();});
  window.addEventListener('focus',()=>void presenceTick());
  return {load,apply,canView,canEdit,start,leave,reset,loadMembers,get policy(){return policy;}};
};

/* Database permissions are authoritative; these checks keep the UI in sync. */
window.createTeamAccess = ({getData, refresh, toast}) => {
  const $=id=>document.getElementById(id);
  let policy=null,epoch=0,profiles=[],saving=false,presenceTimer=null,presenceOwner=null;
  let sessionKey=null,presenceBusy=false,accessRequest=0;
  const node=(tag,value,cls='')=>{const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;};
  const normal=name=>name.trim().toLowerCase().replace(/\.$/,'');
  function canView(view) {
    if(['overview','members'].includes(view))return true;
    if(!policy)return false;
    if(view==='discussions')return policy.shared_access;
    if(['fragile','dusted'].includes(view))return getData().projects.some(p=>normal(p.name)===view)||policy.is_admin;
    return true;
  }
  function apply() {
    for(const button of document.querySelectorAll('[data-view]'))button.hidden=!canView(button.dataset.view);
    $('fragileShortcut').hidden=!canView('fragile');$('fragileShortcutStatus').hidden=true;
    for(const button of document.querySelectorAll('[data-add="project"]'))button.hidden=!policy?.can_create_projects;
    for(const id of ['budgetSpent','recentMessages'])$(id)?.closest('.card')?.toggleAttribute('hidden',!policy?.shared_access);
    $('budgetNote').textContent=policy?.shared_access?$('budgetNote').textContent:'Your accessible projects';
    $('remainingStat')?.closest('.stat')?.toggleAttribute('hidden',!policy?.shared_access);
    $('budgetSubtitle')?.parentElement?.toggleAttribute('hidden',!policy?.shared_access);
    $('teamAccessNotice').hidden=!!policy;
    $('memberAccessControls').hidden=!policy?.is_admin;
    $('dustedPrivateChatShortcut').hidden=!policy||!getData().projects.some(p=>normal(p.name)==='dusted');
  }
  async function load() {
    const request=++accessRequest,current=epoch,uid=getData().user?.id;
    if(!uid)return false;
    try {
      const result=await getData().db.rpc('my_dashboard_access');
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
      const result=await getData().db.rpc('team_online_members');if(result.error)throw result.error;
      if(current===epoch&&getData().user?.id===uid)renderOnline(result.data||[]);
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
    void presenceTick();if(!policy?.is_admin)return;
    const current=epoch,uid=getData().user?.id;
    $('memberAccessStatus').textContent='Loading access settings…';
    try{const result=await getData().db.rpc('list_member_access');if(current!==epoch||getData().user?.id!==uid)return;
      if(result.error)throw result.error;profiles=result.data||[];renderControls();$('memberAccessStatus').textContent='Project access also applies to its tasks, events, notes, chat, moodboard and notifications.';
    }catch{if(current===epoch)$('memberAccessStatus').textContent='Could not load permissions. Press Refresh to retry.';}
  }
  function renderControls() {
    const root=$('memberAccessList');root.replaceChildren();
    for(const member of profiles){const form=document.createElement('form');form.className='member-access-card';form.dataset.memberId=member.user_id;
      form.append(node('h3',member.display_name));if(member.is_admin){form.append(node('p','Owner · full access'));root.append(form);continue;}
      const label=node('label','Project access');const mode=document.createElement('select');mode.className='input';mode.name='mode';
      for(const [value,text] of [['selected','Selected projects only'],['all','All projects, with exceptions']]){const option=node('option',text);option.value=value;mode.append(option);}mode.value=member.project_mode;label.append(mode);form.append(label);
      const group=node('fieldset','');group.append(node('legend','Allow access to'));
      for(const project of getData().projects){const rule=member.project_rules.find(x=>x.project_id===project.id);const row=node('label','','member-project-choice');const check=document.createElement('input');check.type='checkbox';check.name='project';check.value=project.id;check.checked=rule?.allowed??(member.project_mode==='all'&&!project.access_restricted);row.append(check,node('span',project.name));group.append(row);}form.append(group);
      const sharedRow=node('label','','member-project-choice'),shared=document.createElement('input');shared.type='checkbox';shared.name='shared';shared.checked=member.shared_access;sharedRow.append(shared,node('span','General team chat, team budget and items without a project'));form.append(sharedRow);
      form.append(node('p','Private projects require an explicit selection. In “all projects” mode, future public projects are included.','hint'));
      const save=node('button','Save access','button primary');save.type='submit';form.append(save);root.append(form);
      form.onsubmit=async event=>{event.preventDefault();if(saving)return;saving=true;const current=epoch;save.disabled=true;
        try{const result=await getData().db.rpc('set_member_access',{target:member.user_id,mode:mode.value,shared:shared.checked,allowed_projects:[...form.querySelectorAll('[name=project]:checked')].map(x=>x.value)});if(result.error)throw result.error;
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
  return {load,apply,canView,start,leave,reset,loadMembers,get policy(){return policy;}};
};

/* Per-recipient activity inbox. Database triggers create trusted actor snapshots. */
window.createNotificationCenter = ({getClient, getUser, getProjects=()=>[], openPrivateChat=()=>{}, openPersonalNote=()=>{}, openPersonalEvent=()=>{}, navigate, openEvent, toast}) => {
  const $ = id => document.getElementById(id);
  const destinations = {project_files:'files',brand_messages:'fragile',brand_moodboard_items:'fragile',project_notes:'projects',projects:'projects',tasks:'tasks',expenses:'expenses',goals:'goals',discussion_messages:'discussions',calendar_events:'calendar',team_settings:'expenses',team_members:'dashboard'};
  const labels = {personal_calendar_events:'personal event',project_files:'project file',private_chat_messages:'private message',brand_messages:'brand message',brand_moodboard_items:'moodboard pin',project_notes:'project note',projects:'project',tasks:'task',expenses:'expense',goals:'goal',discussion_messages:'message',calendar_events:'event',team_settings:'budget',team_members:'team member'};
  let session = 0, owner = null, channel = null, poll = null, rows = [], limit = 50, unread = 0;
  let fetching = false, refreshAgain = false, online = false, busy = false;
  const pendingMessages=new Set();let selectedCategory='all',unreadOnly=false,undoBatch=null,revision=0,recoveryRevision=0,recoveredRevision=-1;
  const categoryBar=document.createElement('div');categoryBar.className='notification-categories';categoryBar.id='notificationCategories';categoryBar.setAttribute('role','group');categoryBar.setAttribute('aria-label','Filter notifications by source');
  const categoryHint=document.createElement('p');categoryHint.className='notification-status';categoryHint.id='notificationCategoryHint';
  $('notificationList').before(categoryBar,categoryHint);
  const unreadToggle=document.createElement('button');unreadToggle.type='button';unreadToggle.className='button';unreadToggle.id='notificationsUnreadOnly';unreadToggle.textContent='Unread only';unreadToggle.setAttribute('aria-pressed','false');$('notificationsMarkAll').after(unreadToggle);
  const undoBar=document.createElement('div');undoBar.className='notification-undo';undoBar.id='notificationsUndoBar';undoBar.hidden=true;const undoText=document.createElement('p'),undoButton=document.createElement('button');undoButton.type='button';undoButton.className='button';undoButton.id='notificationsUndo';undoButton.textContent='Undo mark all as read';undoBar.append(undoText,undoButton);$('notificationsMarkAll').closest('.notifications-tools').after(undoBar);
  function recovery(metadata){
    const batches=new Map();for(const row of metadata||[])if(row.read_at){const stamp=row.read_at;const group=batches.get(stamp)||{stamp,count:0};group.count++;batches.set(stamp,group);}
    const known=undoBatch?.known&&Array.from(batches.values()).find(g=>Date.parse(g.stamp)===Date.parse(undoBatch.stamp));
    undoBatch=known?{...known,known:true}:Array.from(batches.values()).filter(g=>g.count>1).sort((a,b)=>Date.parse(b.stamp)-Date.parse(a.stamp))[0]||null;
  }
  const origins={discussion_messages:'Team chat',private_chat_messages:'Private chats',tasks:'Tasks',calendar_events:'Calendar',personal_calendar_events:'My calendar',personal_notes:'Business & notes',brand_messages:'Brand chats',brand_moodboard_items:'Moodboards',project_files:'Files',project_notes:'Project notes',projects:'Projects',expenses:'Expenses',team_settings:'Budget',goals:'Goals',team_members:'Team updates'};
  function category(row){
    if(row.source_table==='private_chat_messages')return {key:'private_chats',name:'Private chats'};
    const project=getProjects().find(p=>p.id===row.project_id);
    if(project)return {key:'project:'+project.id,name:project.name};
    return {key:row.source_table||'other',name:origins[row.source_table]||'Other updates'};
  }
  const status = text => { $('notificationStatus').textContent=text; };
  function badge() {
    for (const id of ['notificationBadge','notificationNavBadge']) {
      $(id).textContent=unread>99?'99+':String(unread);$(id).hidden=!unread;
    }
    $('notificationBell').setAttribute('aria-label',`Notifications${unread?`, ${unread} unread`:''}`);
    $('notificationsMarkAll').disabled=!online||busy||unread===0;undoButton.disabled=!online||busy;unreadToggle.disabled=busy;unreadToggle.setAttribute('aria-pressed',String(unreadOnly));undoBar.hidden=!undoBatch;undoText.textContent=undoBatch?'Restore notifications marked together on '+new Date(undoBatch.stamp).toLocaleString()+'.':'';
  }
  function text(element, value) {element.textContent=value;return element;}
  function render() {
    const list=$('notificationList');list.replaceChildren();categoryBar.replaceChildren();
    const groups=new Map();for(const row of rows){const source=category(row);if(!groups.has(source.key))groups.set(source.key,{...source,rows:[]});groups.get(source.key).rows.push(row);}
    if(selectedCategory!=='all'&&!groups.has(selectedCategory))selectedCategory='all';
    for(const source of [{key:'all',name:'All sources'},...groups.values()]){
      const filter=document.createElement('button');filter.type='button';filter.className='button';filter.dataset.notificationCategory=source.key;filter.textContent=source.name;filter.setAttribute('aria-pressed',String(source.key===selectedCategory));
      filter.onclick=()=>{selectedCategory=source.key;render();Array.from(categoryBar.querySelectorAll('button')).find(b=>b.dataset.notificationCategory===source.key)?.focus({preventScroll:true});};categoryBar.append(filter);
    }
    categoryBar.hidden=!rows.length;categoryHint.hidden=!rows.length;categoryHint.textContent=`Categories cover the latest ${rows.length} loaded updates.${rows.length>=limit?' Load older updates for earlier activity.':''}`;
    for(const group of groups.values()){
      if(selectedCategory!=='all'&&selectedCategory!==group.key)continue;
      const section=document.createElement('section');section.className='notification-group';section.dataset.notificationCategory=group.key;
      const header=document.createElement('header'),heading=text(document.createElement('h2'),group.name),count=group.rows.filter(r=>!r.read_at).length;
      header.append(heading,text(document.createElement('small'),`${group.rows.length} update${group.rows.length===1?'':'s'} · ${count} unread`));section.append(header);
      const groupList=document.createElement('div');groupList.className='notification-group-list';
      for (const row of group.rows) {
        const article=document.createElement('article');article.className=`notification-item${row.read_at?'':' unread'}`;
        const open=document.createElement('button');open.type='button';open.className='notification-open';
        const source=text(document.createElement('small'),(origins[row.source_table]||'Update')+(row.notification_type==='reminder'?' · Reminder':''));source.className='notification-source';open.append(source);
        const verb=row.action==='INSERT'?(['discussion_messages','private_chat_messages','brand_messages'].includes(row.source_table)?'sent':'added'):row.action==='DELETE'?'removed':'updated';
        open.append(text(document.createElement('strong'),row.notification_type==='reminder'?`Reminder · ${row.source_table==='personal_notes'?'your business item':labels[row.source_table]||'your work'}`:`${row.actor_name} ${verb} ${labels[row.source_table]||'an item'}`));
        const project=getProjects().find(p=>p.id===row.project_id);
        open.append(text(document.createElement('span'),row.source_table==='brand_messages'?(project?project.name+' · ':'')+row.item_title:row.item_title));
        const time=document.createElement('time');time.dateTime=row.created_at;time.textContent=new Date(row.created_at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});open.append(time);
        open.onclick=()=>void openNotification(row);article.append(open);
        const mark=text(document.createElement('button'),row.read_at?'Mark unread':'Mark as read');mark.type='button';mark.className='button';mark.disabled=busy;
        mark.onclick=()=>void (row.read_at?markUnread(row):markOne(row.id));article.append(mark);
        groupList.append(article);
      }
      section.append(groupList);list.append(section);
    }
    $('notificationEmpty').hidden=!online||rows.length>0;$('notificationEmpty').textContent=unreadOnly?'No unread notifications. Switch off Unread only to see your read updates.':'No notifications yet. New team changes will appear here.';
    $('notificationsMore').hidden=!online||rows.length<limit;
    $('notificationsMarkAll').title='Mark all your notifications as read, across every category.';
    badge();
  }
  async function refresh() {
    if (!owner||!getUser()||getUser().id!==owner) return;
    if(fetching||busy){refreshAgain=true;return;}
    const current=session,version=revision,recoveryVersion=recoveryRevision,recipient=owner,client=getClient();fetching=true;
    try {
      let itemQuery=client.from('team_notifications').select('*').eq('recipient_id',recipient);if(unreadOnly)itemQuery=itemQuery.is('read_at',null);
      const [items,count,history]=await Promise.all([
        itemQuery.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(limit),
        client.from('team_notifications').select('id',{count:'exact',head:true}).eq('recipient_id',recipient).is('read_at',null),
        recoveryVersion===recoveredRevision?Promise.resolve({skipped:true}):client.from('team_notifications').select('id,read_at').eq('recipient_id',recipient).order('read_at',{ascending:false,nullsFirst:false}).limit(1000)
      ]);
      if(current!==session)return;if(version!==revision){refreshAgain=true;return;}
      if(items.error||count.error)throw items.error||count.error;
      rows=(items.data||[]).map(row=>window.QuestDirectory?.notification(row)||row);unread=count.count||0;online=true;if(!history.skipped&&!history.error&&recoveryVersion===recoveryRevision){recovery(history.data);recoveredRevision=recoveryVersion;}
      status('Team updates and your reminders. Your own activity changes are excluded.');render();
      const incoming=rows.find(row=>pendingMessages.has(row.id)&&row.recipient_id===recipient&&!row.read_at&&['brand_messages','discussion_messages','private_chat_messages'].includes(row.source_table));pendingMessages.clear();if(incoming)toast('New message from '+incoming.actor_name);
    } catch(error) {
      if(current!==session)return;
      online=false;
      const missing=error?.code==='42P01'||error?.code==='PGRST205';
      status(missing?'Notifications need database setup. Run supabase/notifications.sql in Supabase SQL Editor, then press Refresh.':'Could not refresh notifications. Press Refresh to try again.');
      // Keep previously fetched rows, but never label a failed request as an empty inbox.
      $('notificationEmpty').hidden=true;badge();
    } finally {
      if(current===session){fetching=false;if(refreshAgain){refreshAgain=false;void refresh();}}
    }
  }
  async function writeRead(ids=null) {
    if(!owner||getUser()?.id!==owner||busy)return false;
    const current=session,recipient=owner,stamp=new Date().toISOString();busy=true;revision++;recoveryRevision++;render();
    try {
      let query=getClient().from('team_notifications').update({read_at:stamp}).eq('recipient_id',recipient).is('read_at',null);
      if(ids)query=query.in('id',ids);else query=query.lte('created_at',stamp);
      const {error}=await query;if(error)throw error;
      if(current!==session||getUser()?.id!==recipient)return false;
      if(!ids){undoBatch={stamp,known:true};toast('Marked as read. Use Undo to restore unread notifications.');}
      return true;
    }catch {if(current===session)toast('Could not mark notifications as read. Please try again.');return false;}
    finally{if(current===session){busy=false;badge();void refresh();}}
  }
  async function restoreUnread(batch,row=null){
    if(!owner||getUser()?.id!==owner||busy||!batch)return;
    const current=session,recipient=owner;busy=true;revision++;recoveryRevision++;render();
    try{
      let query=getClient().from('team_notifications').update({read_at:null},{count:'exact'}).eq('recipient_id',recipient).eq('read_at',batch.stamp);
      if(row)query=query.eq('id',row.id);
      const {error,count}=await query;if(error)throw error;
      if(current!==session||getUser()?.id!==recipient)return;
      if(!row)undoBatch=null;
      toast(count===0?'These notifications changed on another device. Refresh to see their current state.':row?'Notification marked unread.':'Notifications restored to unread.');
    }catch{if(current===session)toast('Could not restore unread notifications. Please retry.');}
    finally{if(current===session){busy=false;badge();void refresh();}}
  }
  const markUnread=row=>restoreUnread({stamp:row.read_at},row);
  async function markOne(id){await writeRead([id]);}
  async function openNotification(row) {
    if(busy)return;const current=session;
    if(!row.read_at)await writeRead([row.id]);
    if(current!==session)return;
    if(row.source_table==='personal_notes'){navigate('business');openPersonalNote(row.personal_note_id||row.source_id);return;}
    if(row.source_table==='personal_calendar_events'){navigate('personalCalendar');openPersonalEvent(row.personal_event_id||row.source_id);return;}
    if(row.source_table==='private_chat_messages'){
      if(row.private_room_id)await openPrivateChat(row.private_room_id);
      else toast('This private chat is no longer available.');
      return;
    }
    let target=destinations[row.source_table];if(!target)return;
    if(['brand_messages','brand_moodboard_items'].includes(row.source_table)){
      const project=getProjects().find(p=>p.id===row.project_id);
      if(!project){toast('This project is no longer available.');return;}
      const brand=project.name.trim().toLowerCase().replace(/\.$/,'');target=['fragile','loden','dusted','ngl'].includes(brand)?brand:'projects';
    }
    navigate(target);
    if(['brand_messages','brand_moodboard_items'].includes(row.source_table)&&['fragile','loden','dusted','ngl'].includes(target))document.querySelector(`#${target} [data-studio-tab="${row.source_table==='brand_messages'?'chat':'board'}"]`)?.click();
    if(row.action==='DELETE'){toast('This item was removed.');return;}
    if(row.source_table==='calendar_events')openEvent(row.source_id,row.event_date);
  }
  function stop() {
    pendingMessages.clear();selectedCategory='all';unreadOnly=false;undoBatch=null;revision++;recoveryRevision++;recoveredRevision=-1;session++;owner=null;rows=[];limit=50;unread=0;online=false;busy=false;fetching=false;refreshAgain=false;
    if(poll)clearInterval(poll);poll=null;
    if(channel){getClient()?.removeChannel(channel);channel=null;}
    status('Sign in to see team updates.');render();
  }
  function start() {
    const id=getUser()?.id;if(!id)return;
    if(owner===id){void refresh();return;}
    stop();owner=id;const current=session;
    channel=getClient().channel(`team-inbox-${id}`).on('postgres_changes',{
      event:'*',schema:'public',table:'team_notifications',filter:`recipient_id=eq.${id}`
    },payload=>{if(current!==session)return;if(['UPDATE','DELETE'].includes(payload?.eventType))recoveryRevision++;if(payload?.eventType==='INSERT'&&payload.new?.recipient_id===id)pendingMessages.add(payload.new.id);void refresh();}).subscribe(state=>{
      if(current===session&&state==='SUBSCRIBED')void refresh();
    });
    poll=setInterval(()=>{if(!document.hidden)void refresh();},30000);
    status('Loading notifications…');void refresh();
  }
  $('notificationsRefresh').onclick=()=>{recoveryRevision++;void refresh();};
  $('notificationsMarkAll').onclick=()=>void writeRead();
  undoButton.onclick=()=>void restoreUnread(undoBatch);
  unreadToggle.onclick=()=>{unreadOnly=!unreadOnly;limit=50;revision++;badge();void refresh();};
  $('notificationsMore').onclick=()=>{limit+=50;void refresh();};
  window.addEventListener('focus',()=>void refresh());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
  render();return {start,stop,refresh};
};

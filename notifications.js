/* Per-recipient activity inbox. Database triggers create trusted actor snapshots. */
window.createNotificationCenter = ({getClient, getUser, navigate, openEvent, toast}) => {
  const $ = id => document.getElementById(id);
  const destinations = {project_notes:'projects',projects:'projects',tasks:'tasks',expenses:'expenses',goals:'dashboard',discussion_messages:'discussions',calendar_events:'calendar',team_settings:'expenses',team_members:'dashboard'};
  const labels = {project_notes:'project note',projects:'project',tasks:'task',expenses:'expense',goals:'goal',discussion_messages:'message',calendar_events:'event',team_settings:'budget',team_members:'team member'};
  let session = 0, owner = null, channel = null, poll = null, rows = [], limit = 50, unread = 0;
  let fetching = false, refreshAgain = false, online = false, busy = false;
  const status = text => { $('notificationStatus').textContent=text; };
  function badge() {
    for (const id of ['notificationBadge','notificationNavBadge']) {
      $(id).textContent=unread>99?'99+':String(unread);$(id).hidden=!unread;
    }
    $('notificationBell').setAttribute('aria-label',`Notifications${unread?`, ${unread} unread`:''}`);
    $('notificationsMarkAll').disabled=!online||busy||unread===0;
  }
  function text(element, value) {element.textContent=value;return element;}
  function render() {
    const list=$('notificationList');list.replaceChildren();
    for (const row of rows) {
      const article=document.createElement('article');article.className=`notification-item${row.read_at?'':' unread'}`;
      const open=document.createElement('button');open.type='button';open.className='notification-open';
      const verb=row.action==='INSERT'?(row.source_table==='discussion_messages'?'sent':'added'):row.action==='DELETE'?'removed':'updated';
      open.append(text(document.createElement('strong'),`${row.actor_name} ${verb} ${labels[row.source_table]||'an item'}`));
      open.append(text(document.createElement('span'),row.item_title));
      const time=document.createElement('time');time.dateTime=row.created_at;time.textContent=new Date(row.created_at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});open.append(time);
      open.onclick=()=>void openNotification(row);article.append(open);
      if (!row.read_at) {
        const mark=text(document.createElement('button'),'Mark as read');mark.type='button';mark.className='button';
        mark.onclick=()=>void markOne(row.id);article.append(mark);
      }
      list.append(article);
    }
    $('notificationEmpty').hidden=!online||rows.length>0;
    $('notificationsMore').hidden=!online||rows.length<limit;
    badge();
  }
  async function refresh() {
    if (!owner||!getUser()||getUser().id!==owner) return;
    if(fetching){refreshAgain=true;return;}
    const current=session,recipient=owner,client=getClient();fetching=true;
    try {
      const [items,count]=await Promise.all([
        client.from('team_notifications').select('*').eq('recipient_id',recipient).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(limit),
        client.from('team_notifications').select('id',{count:'exact',head:true}).eq('recipient_id',recipient).is('read_at',null)
      ]);
      if(current!==session)return;
      if(items.error||count.error)throw items.error||count.error;
      rows=items.data||[];unread=count.count||0;online=true;
      status('Updates from other team members. Your own changes are excluded.');render();
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
    if(!owner||busy)return false;
    const current=session;busy=true;badge();
    try {
      let query=getClient().from('team_notifications').update({read_at:new Date().toISOString()}).eq('recipient_id',owner).is('read_at',null);
      if(ids)query=query.in('id',ids);
      const {error}=await query;if(error)throw error;
      if(current!==session)return false;
      return true;
    }catch {if(current===session)toast('Could not mark notifications as read. Please try again.');return false;}
    finally{if(current===session){busy=false;badge();void refresh();}}
  }
  async function markOne(id){await writeRead([id]);}
  async function openNotification(row) {
    if(busy)return;const current=session;
    if(!row.read_at)await writeRead([row.id]);
    if(current!==session)return;
    const target=destinations[row.source_table];if(!target)return;
    navigate(target);
    if(row.action==='DELETE'){toast('This item was removed.');return;}
    if(row.source_table==='calendar_events')openEvent(row.source_id,row.event_date);
  }
  function stop() {
    session++;owner=null;rows=[];limit=50;unread=0;online=false;busy=false;fetching=false;refreshAgain=false;
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
    },()=>{if(current===session)void refresh();}).subscribe(state=>{
      if(current===session&&state==='SUBSCRIBED')void refresh();
    });
    poll=setInterval(()=>{if(!document.hidden)void refresh();},30000);
    status('Loading notifications…');void refresh();
  }
  $('notificationsRefresh').onclick=()=>void refresh();
  $('notificationsMarkAll').onclick=()=>void writeRead();
  $('notificationsMore').onclick=()=>{limit+=50;void refresh();};
  window.addEventListener('focus',()=>void refresh());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
  render();return {start,stop,refresh};
};

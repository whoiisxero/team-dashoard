/* Personal events are stored separately from team calendars and project data. */
window.createPersonalCalendar=({getData,navigate,toast,refreshInbox=()=>{}})=>{
  const $=id=>document.getElementById(id);
  const node=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
  const eligible=()=>!!(getData().policy?.is_admin||getData().policy?.personal_only);
  const ready=()=>eligible()&&!!getData().policy?.personal_calendar_ready;
  const zone=()=>getData().timeZone||'Africa/Johannesburg';
  const uuid=()=>crypto.randomUUID?.()||'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
  const dateKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const zonedToday=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone(),year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(v=>[v.type,v.value]));return `${p.year}-${p.month}-${p.day}`;};
  const asDay=value=>new Date(value+'T12:00:00');
  const dayLabel=value=>asDay(value).toLocaleDateString('en-ZA',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  let owner=null,calendarReady=false,epoch=0,request=0,events=[],busy=false,loading=false;
  let selected=zonedToday(),month=new Date(asDay(selected).getFullYear(),asDay(selected).getMonth(),1,12),editing=null,eventId=null;
  const current=(generation,uid)=>generation===epoch&&getData().user?.id===uid&&ready();
  const view=node('section','','view personal-view personal-calendar');view.id='personalCalendar';
  view.innerHTML=`<div class="title-row"><div><div class="eyebrow">Your space / Private to you</div><h1>My calendar</h1><p>Plan your own events, appointments and reminders.</p></div><button class="button primary" id="personalCalendarAdd" type="button">Add event</button></div><div class="personal-calendar-toolbar"><div class="actions"><button class="button" id="personalCalendarPrevious" type="button" aria-label="Previous calendar month">‹</button><button class="button" id="personalCalendarToday" type="button">Today</button><button class="button" id="personalCalendarNext" type="button" aria-label="Next calendar month">›</button></div><h2 id="personalCalendarMonth" aria-live="polite"></h2><button class="button" id="personalCalendarRefresh" type="button">Refresh</button></div><p class="personal-status" id="personalCalendarStatus" role="status">Loading your private calendar…</p><div class="personal-calendar-grid" id="personalCalendarGrid" aria-label="Choose an event date"></div><section class="card personal-calendar-day"><div class="personal-calendar-day-heading"><h2 id="personalCalendarDayTitle"></h2><button class="button" id="personalCalendarDayAdd" type="button">Add event for this day</button></div><div id="personalCalendarDayEvents"></div></section>`;
  document.querySelector('.content').append(view);
  const nav=node('button','My calendar');nav.type='button';nav.dataset.view='personalCalendar';window.QuestNavigation?.decorate(nav,'personalCalendar');
  const sidebarNav=document.querySelector('.sidebar .nav');sidebarNav.insertBefore(nav,sidebarNav.querySelector('[data-view=personalSetup]')||sidebarNav.querySelector('[data-view=dashboard]'));
  const dialog=node('dialog','','dialog personal-calendar-dialog');dialog.id='personalCalendarDialog';
  dialog.innerHTML=`<form id="personalCalendarForm"><div class="eyebrow">Private to your account</div><h2 id="personalCalendarHeading">New personal event</h2><div class="field"><label for="personalEventTitle">Event</label><input class="input" id="personalEventTitle" maxlength="160" required></div><div class="personal-columns"><label>Date<input class="input" id="personalEventDate" type="date" required></label><label class="personal-calendar-checkbox"><input id="personalEventAllDay" type="checkbox" checked> All day</label><label>Time<input class="input" id="personalEventTime" type="time" disabled></label><label>Time zone<input class="input" id="personalEventZone" list="questTimeZones" value="Africa/Johannesburg" required></label></div><label>Location<input class="input" id="personalEventLocation" maxlength="300" placeholder="Optional location or meeting link"></label><label>Notes<textarea class="input" id="personalEventDetail" rows="6" maxlength="10000" placeholder="Details, preparation or anything to remember…"></textarea></label><label>Remind me<input class="input" id="personalEventReminder" type="datetime-local"></label><p class="hint">The date, time and reminder use the selected time zone. Reminders appear in your private Notifications inbox while Quest is open. Phone push is not enabled.</p><p class="personal-status" id="personalCalendarSaveStatus" role="status"></p><div class="dialog-actions"><button class="button" id="personalCalendarCancel" type="button">Close</button><button class="button primary" id="personalCalendarSave" type="submit">Save event</button></div></form>`;
  document.body.append(dialog);const form=$('personalCalendarForm');
  function setStatus(message){$('personalCalendarStatus').textContent=message;}
  function localInput(value,timeZone){if(!value)return '';const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(v=>[v.type,v.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}
  function lockForm(value){for(const input of form.querySelectorAll('input,textarea,button'))input.disabled=value;$('personalEventTime').disabled=value||$('personalEventAllDay').checked;}
  function syncAllDay(){const allDay=$('personalEventAllDay').checked;$('personalEventTime').disabled=busy||allDay;$('personalEventTime').required=!allDay;}
  $('personalEventAllDay').onchange=syncAllDay;
  function render(){
    const available=ready();$('personalCalendarAdd').disabled=!available;$('personalCalendarDayAdd').disabled=!available;
    $('personalCalendarMonth').textContent=month.toLocaleDateString('en-ZA',{month:'long',year:'numeric'});
    const grid=$('personalCalendarGrid');grid.replaceChildren();
    for(const label of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']){const heading=node('span',label,'personal-calendar-weekday');heading.setAttribute('aria-hidden','true');grid.append(heading);}
    const first=new Date(month);first.setDate(1-(first.getDay()+6)%7);const today=zonedToday();
    for(let i=0;i<42;i++){
      const day=new Date(first);day.setDate(first.getDate()+i);const value=dateKey(day),button=node('button','','personal-calendar-date');button.type='button';button.dataset.personalDate=value;
      button.classList.toggle('outside',day.getMonth()!==month.getMonth());button.setAttribute('aria-pressed',String(value===selected));if(value===today)button.setAttribute('aria-current','date');
      const count=events.filter(e=>e.event_date===value).length;button.setAttribute('aria-label',dayLabel(value)+(count?`, ${count} event${count===1?'':'s'}`:''));
      button.append(node('span',String(day.getDate())));if(count){const dot=node('span',String(count),'personal-calendar-date-count');dot.setAttribute('aria-hidden','true');button.append(dot);}
      button.onclick=()=>{selected=value;if(day.getMonth()!==month.getMonth()||day.getFullYear()!==month.getFullYear())month=new Date(day.getFullYear(),day.getMonth(),1,12);render();};grid.append(button);
    }
    $('personalCalendarDayTitle').textContent=dayLabel(selected);const root=$('personalCalendarDayEvents');root.replaceChildren();
    const entries=events.filter(e=>e.event_date===selected).sort((a,b)=>(a.event_time||'').localeCompare(b.event_time||'')||a.title.localeCompare(b.title));
    for(const event of entries){
      const item=node('article','','personal-calendar-item'),open=node('button','','personal-calendar-open');open.type='button';open.dataset.personalEvent=event.id;
      open.append(node('strong',event.title),node('small',(event.event_time?event.event_time.slice(0,5):'All day')+' · '+event.time_zone));
      if(event.location)open.append(node('span',event.location));if(event.detail)open.append(node('p',event.detail,'personal-calendar-notes'));
      if(event.remind_at)open.append(node('small','Reminder: '+new Intl.DateTimeFormat('en-ZA',{timeZone:event.time_zone,dateStyle:'medium',timeStyle:'short'}).format(new Date(event.remind_at))));
      open.onclick=()=>edit(event);const remove=node('button','Delete','button');remove.type='button';remove.onclick=()=>void removeEvent(event);item.append(open,remove);root.append(item);
    }
    if(!entries.length)root.append(node('p',available?'Nothing planned for this day. Add a personal event when you’re ready.':'Your private calendar needs the latest workspace setup before events can be saved.','empty'));
  }
  async function refresh(){
    if(!eligible()||!getData().user)return;
    if(!ready()){events=[];setStatus('Your private calendar needs the latest owner setup. Ask the owner to run the complete query from the setup page, then sign out and back in.');render();return;}
    const generation=epoch,uid=getData().user.id,version=++request;loading=true;setStatus('Loading your private events…');
    try{const result=await getData().db.from('personal_calendar_events').select('*').eq('owner_id',uid).order('event_date',{ascending:false}).limit(500);
      if(!current(generation,uid)||version!==request)return;if(result.error)throw result.error;events=(result.data||[]).filter(e=>e.owner_id===uid);render();setStatus('Private to your account · latest 500 events');
    }catch(error){if(current(generation,uid)&&version===request){events=[];render();setStatus(['PGRST205','42P01'].includes(error?.code)?'Your private calendar needs the latest workspace setup from the owner.':error?.message||'Could not load events. Refresh to retry.');}}
    finally{if(generation===epoch&&version===request)loading=false;}
  }
  function edit(event=null){
    if(!ready()||!owner||event&&event.owner_id!==owner)return;
    editing=event;eventId=event?.id||uuid();form.reset();delete form.dataset.appDirty;delete form.dataset.appSaving;busy=false;lockForm(false);
    $('personalCalendarHeading').textContent=event?'Edit personal event':'New personal event';$('personalEventTitle').value=event?.title||'';$('personalEventDate').value=event?.event_date||selected;
    $('personalEventAllDay').checked=!event?.event_time;$('personalEventTime').value=event?.event_time?.slice(0,5)||'';$('personalEventZone').value=event?.time_zone||zone();
    $('personalEventLocation').value=event?.location||'';$('personalEventDetail').value=event?.detail||'';$('personalEventReminder').value=localInput(event?.remind_at,event?.time_zone||zone());
    $('personalCalendarSaveStatus').textContent=event?'Saved event · your changes stay private':'Not saved yet';syncAllDay();dialog.showModal();
  }
  $('personalCalendarAdd').onclick=()=>edit();$('personalCalendarDayAdd').onclick=()=>edit();$('personalCalendarRefresh').onclick=()=>void refresh();
  $('personalCalendarPrevious').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1,12);render();};
  $('personalCalendarNext').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1,12);render();};
  $('personalCalendarToday').onclick=()=>{selected=zonedToday();const d=asDay(selected);month=new Date(d.getFullYear(),d.getMonth(),1,12);render();};
  form.addEventListener('input',()=>{form.dataset.appDirty='true';$('personalCalendarSaveStatus').textContent='Unsaved changes';});
  function close(){if(busy)return;if(form.dataset.appDirty&&!confirm('Close without saving your event changes?'))return;dialog.close();}
  $('personalCalendarCancel').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||!ready()||!owner)return;const generation=epoch,uid=owner,timeZone=$('personalEventZone').value.trim();
    try{new Intl.DateTimeFormat('en',{timeZone});}catch{$('personalCalendarSaveStatus').textContent='Choose a valid time zone.';return;}
    const args={event_id:eventId,event_title:$('personalEventTitle').value.trim(),event_detail:$('personalEventDetail').value,event_location:$('personalEventLocation').value.trim(),event_day:$('personalEventDate').value,event_clock:$('personalEventAllDay').checked?null:$('personalEventTime').value||null,zone:timeZone,remind_local:$('personalEventReminder').value||null,expected_revision:editing?.revision??null};
    if(!args.event_title||!args.event_day){$('personalCalendarSaveStatus').textContent='Enter an event title and date.';return;}
    if(!$('personalEventAllDay').checked&&!args.event_clock){$('personalCalendarSaveStatus').textContent='Choose a time or mark the event as all day.';return;}
    busy=true;form.dataset.appSaving='true';lockForm(true);$('personalCalendarSaveStatus').textContent='Saving…';
    try{const result=await getData().db.rpc('quest_save_personal_event',args);if(!current(generation,uid))return;if(result.error)throw result.error;if(!result.data?.id||result.data.owner_id!==uid)throw new Error('The save was not confirmed. Keep this event here and retry.');
      const saved=result.data;events=[saved,...events.filter(e=>e.id!==saved.id)];selected=saved.event_date;const d=asDay(selected);month=new Date(d.getFullYear(),d.getMonth(),1,12);delete form.dataset.appDirty;dialog.close();render();setStatus('Personal event saved.');toast(editing?'Personal event updated':'Personal event saved');
      void Promise.resolve(getData().db.rpc('refresh_my_reminders')).then(()=>{if(current(generation,uid))refreshInbox();}).catch(()=>{});
    }catch(error){if(current(generation,uid))$('personalCalendarSaveStatus').textContent=error?.message||'Could not save. Your event details are still here; retry.';}
    finally{if(generation===epoch){busy=false;delete form.dataset.appSaving;lockForm(false);syncAllDay();}}
  };
  async function removeEvent(event){
    if(!ready()||event.owner_id!==owner||!confirm(`Delete “${event.title}”? This cannot be undone.`))return;const generation=epoch,uid=owner;
    try{const result=await getData().db.from('personal_calendar_events').delete().eq('id',event.id).eq('owner_id',uid).select('id').maybeSingle();if(!current(generation,uid))return;if(result.error)throw result.error;if(!result.data)throw new Error('This event was not removed. Refresh and retry.');events=events.filter(e=>e.id!==event.id);render();toast('Personal event deleted');refreshInbox();}
    catch(error){if(current(generation,uid))setStatus(error?.message||'Could not delete this event.');}
  }
  function reset(){epoch++;request++;owner=null;calendarReady=false;events=[];editing=null;eventId=null;busy=false;loading=false;dialog.close();form.reset();delete form.dataset.appDirty;delete form.dataset.appSaving;lockForm(false);selected=zonedToday();const d=asDay(selected);month=new Date(d.getFullYear(),d.getMonth(),1,12);$('personalCalendarSaveStatus').textContent='';$('personalCalendarDayEvents').replaceChildren();setStatus('Sign in to open your private calendar.');render();}
  function sync(){const uid=getData().user?.id;if(!uid||!eligible()){if(owner)reset();return;}if(owner!==uid||calendarReady!==ready()){reset();owner=uid;calendarReady=ready();void refresh();}else if(!ready()){events=[];dialog.close();render();setStatus('Your private calendar needs the latest owner setup. Ask the owner to run the complete query from the setup page, then sign out and back in.');}}
  function activate(id){if(id!=='personalCalendar')return;sync();if(!loading)void refresh();}
  async function openEvent(id){if(!ready())return;sync();let event=events.find(e=>e.id===id);if(!event){await refresh();event=events.find(e=>e.id===id);}if(event&&event.owner_id===getData().user?.id){selected=event.event_date;const d=asDay(selected);month=new Date(d.getFullYear(),d.getMonth(),1,12);navigate('personalCalendar');edit(event);}else setStatus('This personal event is no longer available.');}
  render();return {sync,activate,reset,refresh,openEvent};
};

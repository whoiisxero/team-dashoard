/* A dedicated route over the signed-in owner's private notes; no data migration. */
window.createWeedDiary=({getData,openEntry,removeEntry,navigate,getRooms=()=>[],openChat=()=>{}})=>{
 const $=id=>document.getElementById(id),element=(tag,value='',className='')=>{const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node;};
 const category='Weed diary / Private';
 const phrases=['weed diary','weed dairy','weed journal','weed log','cannabis diary','cannabis journal','cannabis log','smoking diary'];
 const filters=['category.ilike.*weed*','category.ilike.*cannabis*',...phrases.map(text=>'title.ilike.*'+text.replaceAll(' ','*')+'*'),...['weed diary','weed dairy','cannabis diary'].map(text=>'body.ilike.*'+text+'*')].join(',');
 const isDiary=note=>/\b(?:weed|cannabis)\b/i.test(note.category||'')||phrases.some(text=>[note.title,note.body].some(value=>String(value||'').toLowerCase().includes(text)));
 const allowed=()=>!!(getData().user?.id&&getData().policy?.is_admin);
 const chatRoom=()=>getRooms().find(room=>room.room_kind==='direct'&&room.room_key?.startsWith('weed-diary-owner-')&&(room.personal_owner_id===getData().user?.id||room.created_by===getData().user?.id&&getData().policy?.is_admin));
 const pageAllowed=()=>allowed()||!!chatRoom();
 const ready=()=>allowed()&&!!getData().policy?.personal_workspace_ready;
 let owner=null,epoch=0,request=0,limit=50,rows=[],loaded=false,loading=false,more=false,tab='entries',opening=false;
 const current=(token,uid)=>token===epoch&&owner===uid&&getData().user?.id===uid&&ready();
 const view=element('section','','view personal-view weed-diary');view.id='weedDiary';
 view.innerHTML='<header class="personal-hero weed-diary-hero"><div class="eyebrow" id="weedDiaryScope">Your diary / Private entries & invited chat</div><h1>Weed diary</h1><p id="weedDiaryDescription">Your entries are private to you. The chat is shared only with you and Tertius.</p><div class="actions" id="weedDiaryEntryActions"><button class="button primary" id="weedDiaryNew" type="button">New diary entry</button><button class="button" id="weedDiaryNotes" type="button">Open my notes</button><button class="button" type="button" data-view="fragilePersonal">Back to my studio</button></div></header><nav class="weed-diary-tabs" role="tablist" aria-label="Weed diary sections"><button type="button" role="tab" id="weedDiaryEntriesTab" aria-controls="weedDiaryEntries" aria-selected="true" data-diary-tab="entries">My entries</button><button type="button" role="tab" id="weedDiaryChatTab" aria-controls="weedDiaryChatPanel" aria-selected="false" data-diary-tab="chat">Chat · Quan &amp; Tertius</button></nav><section id="weedDiaryEntries" role="tabpanel" aria-labelledby="weedDiaryEntriesTab"><div class="weed-diary-toolbar"><label class="weed-diary-search">Find an entry<input class="input" type="search" id="weedDiarySearch" placeholder="Search your diary" autocomplete="off"></label><button class="button" type="button" id="weedDiaryRefresh">Refresh</button></div><p class="personal-status" id="weedDiaryStatus" role="status"></p><p class="hint" id="weedDiaryCount"></p><div class="personal-note-grid" id="weedDiaryList"></div><button class="button" type="button" id="weedDiaryMore" hidden>Load older entries</button></section><section id="weedDiaryChatPanel" class="weed-diary-chat-panel" role="tabpanel" aria-labelledby="weedDiaryChatTab" hidden><p class="personal-status" id="weedDiaryChatState" role="status"></p><a class="button" id="weedDiaryChatSetup" href="/setup-guide.html#weed-diary-chat" target="_blank" rel="noopener noreferrer" hidden>Set up private diary chat</a><div id="weedDiaryChatMount" class="weed-diary-chat-mount"></div></section>';
 document.querySelector('.content').append(view);
 const studioLink=element('button','Weed diary','button');studioLink.type='button';studioLink.dataset.view='weedDiary';document.querySelector('#fragilePersonal .personal-hero .actions')?.append(studioLink);
 const nav=element('button','Weed diary');nav.type='button';nav.dataset.view='weedDiary';window.QuestNavigation?.decorate(nav,'weedDiary');document.querySelector('.sidebar .nav').append(nav);
 function state(message,setup=false){const status=$('weedDiaryStatus');status.replaceChildren(element('span',message));if(setup){const link=element('a',' Open owner setup');link.href='/setup-guide.html';link.target='_blank';link.rel='noopener noreferrer';status.append(link);}}
 function render(){const search=$('weedDiarySearch').value.trim().toLowerCase(),list=$('weedDiaryList');list.replaceChildren();
  const shown=rows.filter(note=>[note.title,note.body,note.category].join(' ').toLowerCase().includes(search));
  for(const note of shown){const card=element('article','','card personal-note-card weed-diary-entry');card.dataset.noteId=note.id;const date=new Date(note.updated_at||note.created_at),label=Number.isFinite(date.getTime())?date.toLocaleDateString('en-GB',{timeZone:'Africa/Johannesburg',day:'numeric',month:'short',year:'numeric'}):'';
   if(label){const time=element('time',label);time.dateTime=note.updated_at||note.created_at;card.append(time);}card.append(element('h2',note.title));if(note.body)card.append(element('p',note.body.slice(0,400)+(note.body.length>400?'…':''),'personal-excerpt'));
   if(note.category!==category)card.append(element('small','Existing private note · '+(note.category||'Uncategorised')));
   const actions=element('div','','actions');for(const [label,handler] of [['Open entry',()=>openEntry(note)],['Delete',()=>removeEntry(note)]]){const button=element('button',label,'button');button.type='button';button.onclick=handler;actions.append(button);}card.append(actions);list.append(card);
  }
  if(loaded&&!shown.length)list.append(element('p',search?'No matching diary entries. Try another search.':'No diary entries were found in the matching private notes. You can create an entry here or look in your notes; existing notes have not been changed.','empty'));
  $('weedDiaryCount').textContent=loaded?`${shown.length} entr${shown.length===1?'y':'ies'} shown${more?' · Load older entries for more history':''}`:'';
  $('weedDiaryMore').hidden=!more;$('weedDiaryMore').disabled=loading;$('weedDiaryNew').disabled=!ready();$('weedDiaryRefresh').disabled=loading;
 }
 async function refresh(){sync();if(!allowed())return;if(!ready()){rows=[];loaded=false;more=false;render();state('Your private workspace needs setup before diary entries can be loaded.',true);return;}
  const token=epoch,uid=owner,version=++request;loading=true;state('Looking for your private diary entries…');render();
  try{const result=await getData().db.from('personal_notes').select('*').eq('owner_id',uid).or(filters).order('updated_at',{ascending:false}).order('id',{ascending:false}).limit(limit+1);
   if(!current(token,uid)||version!==request)return;if(result.error)throw result.error;
   const found=(result.data||[]).filter(note=>note.owner_id===uid);more=found.length>limit;rows=window.QuestDirectory.rows(found.slice(0,limit).filter(isDiary));loaded=true;
   state('Private to your account. Existing diary notes are shown here without moving or rewriting their saved contents.');
  }catch(error){if(current(token,uid)&&version===request){rows=[];loaded=false;more=false;state(['PGRST205','42P01','42883'].includes(error?.code)?'Your private workspace needs setup.': 'Could not load your diary. Press Refresh to retry. Your saved entries have not been changed.',['PGRST205','42P01','42883'].includes(error?.code));}}
  finally{if(current(token,uid)&&version===request){loading=false;render();}}
 }
 function reset(){epoch++;request++;owner=null;opening=false;tab='entries';limit=50;rows=[];loaded=false;loading=false;more=false;$('weedDiarySearch').value='';state('');$('weedDiaryChatMount').hidden=true;render();}
 function panels(){
  const mine=allowed(),room=chatRoom();
  $('weedDiaryEntryActions').hidden=!mine;$('weedDiaryEntriesTab').hidden=!mine;
  if(!mine)tab='chat';
  $('weedDiaryEntries').hidden=tab!=='entries'||!mine;$('weedDiaryChatPanel').hidden=tab!=='chat';
  $('weedDiaryEntriesTab').setAttribute('aria-selected',String(tab==='entries'&&mine));
  $('weedDiaryChatTab').setAttribute('aria-selected',String(tab==='chat'));
  $('weedDiaryChatMount').hidden=!room;$('weedDiaryChatSetup').hidden=!!room||!mine;
  $('weedDiaryScope').textContent=mine?'Your diary / Private entries & invited chat':'Weed diary / Private conversation';
  $('weedDiaryDescription').textContent=mine?'Your entries are private to you. The chat is shared only with you and Tertius.':'A private conversation for Quan and Tertius.';
  $('weedDiaryChatState').textContent=room?'Only the two invited participants can see this conversation.':mine?'The private chat needs its one-time owner setup. Your diary entries remain private.':'This conversation is unavailable.';
 }
 function sync(){
  const uid=getData().user?.id;
  if(!uid||!pageAllowed()){
   if(owner)reset();nav.hidden=true;studioLink.hidden=true;
   if(view.classList.contains('active'))navigate('overview');return;
  }
  if(owner!==uid){reset();owner=uid;tab=allowed()?'entries':'chat';}
  nav.hidden=false;studioLink.hidden=!allowed();panels();window.QuestNavigation?.refreshSections();
 }
 async function openConversation(){
  sync();const room=chatRoom(),uid=getData().user?.id;if(!room||opening&&$('weedDiaryChatMount').querySelector('#privateChatForm'))return;
  const token=epoch;opening=true;
  try{await openChat(room.id,{host:$('weedDiaryChatMount'),view:'weedDiary'});}
  finally{if(token===epoch&&uid===getData().user?.id)opening=false;}
 }
 function setTab(value){
  if(value==='entries'&&!allowed())return;tab=value==='chat'?'chat':'entries';panels();
  if(tab==='chat')void openConversation();else void refresh();
 }
 for(const button of view.querySelectorAll('[data-diary-tab]'))button.onclick=()=>setTab(button.dataset.diaryTab);
 view.querySelector('.weed-diary-tabs').onkeydown=event=>{
  if(!allowed()||!['ArrowLeft','ArrowRight'].includes(event.key))return;
  event.preventDefault();setTab(tab==='entries'?'chat':'entries');$(tab==='entries'?'weedDiaryEntriesTab':'weedDiaryChatTab').focus();
 };
 window.addEventListener('quest:private-access-changed',()=>{sync();if(view.classList.contains('active')&&tab==='chat')void openConversation();});

 $('weedDiaryNew').onclick=()=>{if(ready())openEntry(null);};$('weedDiaryNotes').onclick=()=>navigate('writing');$('weedDiarySearch').oninput=render;$('weedDiaryRefresh').onclick=()=>void refresh();$('weedDiaryMore').onclick=()=>{limit+=50;void refresh();};
 window.addEventListener('quest:personal-notes-changed',event=>{if(event.detail?.userId===owner&&view.classList.contains('active'))void refresh();});
 render();return {activate(){sync();if(!pageAllowed())return;if(tab==='chat')void openConversation();else void refresh();},sync,reset};
};

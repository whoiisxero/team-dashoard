/* Shared sidebar appearance; page permissions and navigation stay with the app. */
window.QuestNavigation=(()=>{
 const pages={
  ngl:['💎','#f397d4','NGL'],
  formStudio:['🧩','#67e8f9','Form Studio ↗'],
  globe:['🌐','#38bdf8','Globe'],
  questPreview:['✨','#67e8f9','Explore Quest'],
  overview:['🏡','#7dd3fc','Home'],myDay:['☀️','#fcd34d','My day'],dashboard:['🧭','#a5b4fc','Dashboard'],
  projects:['🗂️','#c4b5fd','Projects'],tasks:['✅','#86efac','Tasks'],notifications:['🔔','#f9a8d4','Notifications'],
  members:['👥','#67e8f9','Members'],events:['🎟️','#fdba74','Events'],calendar:['🗓️','#fda4af','Calendar'],
  expenses:['💸','#a3e635','Expenses'],goals:['🎯','#f0abfc','Goals'],discussions:['💬','#6ee7b7','Team chat room'],
  files:['📎','#93c5fd','Files'],search:['🔎','#fde68a','Search'],activity:['📜','#5eead4','Activity'],
  trading:['📈','#38bdf8','Trading view'],fragilePersonal:['🪶','#c4a0ff','My Fragile'],fragile:['🦋','#e9a8ff','Fragile'],loden:['L','#b4ff39','Loden'],dusted:['🍬','#fb923c','Dusted.'],
  install:['📲','#cbd5e1','Install Quest']
  ,invoices:['💳','#f4c182','Invoices'],quotes:['🧾','#d8bc81','Quotes'],businessStudio:['🌿','#95cbb1','Business workspace'],personalCalendar:['🗓️','#67e8f9','My calendar'],personalHome:['🌙','#c4b5fd','My workspace'],personalSetup:['🎛️','#f9a8d4','My settings'],writing:['✒️','#93c5fd','Notes'],business:['📒','#fcd34d','Business & work']
 };
 const hash=text=>Array.from(String(text)).reduce((value,letter)=>(Math.imul(value,31)+letter.codePointAt(0))>>>0,0);
 const sectionDefinitions=[
  ['work','Work',['myDay','dashboard','projects','goals','files','activity','notifications','discussions']],
  ['studios','Studios',['fragilePersonal','ngl']],
  ['business','Business',['businessStudio','writing','quotes','invoices','expenses']],
  ['tools','Tools',['search','trading','globe','questPreview']],
  ['settings','Settings',['personalSetup','members']]
 ];
 const sections=new Map(),preferenceKey='quest-sidebar-sections-v2';
 let sectionHost=null,quickNav=null,archive=null,projectDetails=null,api={},account=null,refreshQueued=false;
 let dialog=null,query=null,results=null,searchButton=null,selected=0,matches=[],restoreFocus=null;
 const normal=text=>String(text||'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const canonical=view=>['overview','personalHome'].includes(view)?'overview':['calendar','events','personalCalendar'].includes(view)?'calendar':view==='business'?'writing':view;
 function visibleInSection(button,root){
  for(let el=button;el&&el!==root;el=el.parentElement)if(el.hidden)return false;
  return true;
 }
 function permitted(button){
  if(!button?.isConnected||button.disabled||!visibleInSection(button,document.getElementById('sidebar')))return false;
  return !button.dataset.view||!api.canView||api.canView(button.dataset.view);
 }
 function saveSections(){try{localStorage.setItem(preferenceKey,JSON.stringify(Object.fromEntries([...sections].map(([id,s])=>[id,s.open]))));}catch{}}
 function closeFinder(restore=true){
  if(!dialog)return;if(dialog.open)dialog.close();query.value='';results.replaceChildren();matches=[];selected=0;
  if(restore&&restoreFocus?.isConnected)restoreFocus.focus({preventScroll:true});restoreFocus=null;
 }
 function reset(){closeFinder(false);account=null;}
 function activeView(){return document.querySelector('.view.active')?.dataset.route||document.querySelector('.view.active')?.id||'overview';}
 function markActive(view=activeView()){
  const current=canonical(view);
  for(const button of document.querySelectorAll('.sidebar .nav [data-view]')){
   const active=canonical(button.dataset.view)===current;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  }
  for(const [id,section] of sections)section.classList.toggle('has-current',view==='privateChat'?id==='work':view==='fragile'?id==='studios':!!section.querySelector('[aria-current=page]'));
  for(const nav of document.querySelectorAll('[data-navigation-tabs]'))for(const button of nav.querySelectorAll('[data-view]')){button.classList.toggle('active',button.dataset.view===view);button.setAttribute('aria-pressed',String(button.dataset.view===view));}
 }
 function refreshSections(){
  if(!sectionHost)return;
  const uid=api.getUserId?.()||null;if(uid!==account){closeFinder(false);account=uid;}
  const policy=api.getPolicy?.();
  const personal=document.querySelector('#sidebar [data-view=personalCalendar]');
  if(personal){const target=policy?.personal_only?quickNav:archive;if(personal.parentElement!==target)target.append(personal);const label=policy?.personal_only?'Calendar':'My calendar';if(personal.querySelector('.nav-title')?.textContent!==label)decorate(personal,'personalCalendar',label);}
  for(const nav of document.querySelectorAll('[data-navigation-tabs=home]'))if(nav.hidden!==!policy?.is_admin)nav.hidden=!policy?.is_admin;
  if(projectDetails){const empty=![...projectDetails.querySelectorAll('button')].some(b=>visibleInSection(b,projectDetails));if(projectDetails.hidden!==empty)projectDetails.hidden=empty;}
  for(const section of sections.values()){const empty=![...section.querySelectorAll('button')].some(b=>visibleInSection(b,section));if(section.hidden!==empty)section.hidden=empty;}
  if(searchButton)searchButton.disabled=!uid||!policy;
  markActive();if(dialog?.open)renderFinder();
 }
 function addTabs(ids,links,kind){
  for(const id of ids){const view=document.getElementById(id);if(!view)continue;const nav=document.createElement('nav');nav.className='quest-page-tabs';nav.dataset.navigationTabs=kind;nav.setAttribute('aria-label',kind==='notes'?'Note categories':kind==='calendar'?'Calendar views':'Home views');
   for(const [route,title] of links){const button=document.createElement('button');button.type='button';button.className='button';button.dataset.view=route;button.textContent=title;nav.append(button);}view.prepend(nav);
  }
 }
 function catalog(){
  const list=[],seen=new Set();
  for(const button of document.querySelectorAll('.sidebar .nav button')){
   if(!permitted(button))continue;
   const view=button.dataset.view,project=button.dataset.project,room=button.dataset.privateChat;
   const label=button.querySelector('.nav-title')?.textContent.trim()||button.textContent.trim();
   if(project&&['fragile','loden','dusted'].includes(normal(label))){const shortcut=normal(label)==='fragile'?document.getElementById('fragileShortcut'):document.querySelector('.sidebar [data-view="'+normal(label)+'"]');if(permitted(shortcut))continue;}
   const key=view?'view:'+view:project?'project:'+project:room?'chat:'+room:button.id;if(!key||seen.has(key))continue;seen.add(key);
   const group=button.closest('.sidebar-section')?.querySelector('summary')?.textContent||'Quick access';
   const synonyms={ngl:'ngl social media team content creative studio',fragilePersonal:'fragile private personal notes plans',overview:'home globe welcome',tasks:'tasks todos assigned work',calendar:'calendar events schedule agenda',personalCalendar:'calendar my personal appointments',writing:'notes personal notebook writing ideas',businessStudio:'business workspace studio',discussions:'team chat room messages',formStudioShortcut:'form development studio forms'};
   list.push({key,label,group,terms:normal(label+' '+group+' '+(synonyms[view||button.id]||'')),button});
  }
  for(const [view,label,group,aliases] of [['business','Business notes','Notes','work reminders deadlines'],['events','Calendar agenda','Calendar','events schedule'],['personalCalendar','My calendar','Calendar','personal appointments'],['personalHome','My workspace','Home','private home notebook']]){
   if(api.canView?.(view)&&!seen.has('view:'+view))list.push({key:'view:'+view,label,group,terms:normal(label+' '+aliases),view});
  }
  return list;
 }
 function choose(entry){
  if(!entry)return;
  const fresh=catalog().find(item=>item.key===entry.key);if(!fresh)return renderFinder();
  closeFinder(false);if(fresh.button&&permitted(fresh.button))fresh.button.click();else if(fresh.view&&api.canView?.(fresh.view))api.navigate?.(fresh.view);
 }
 function selectResult(index){
  selected=matches.length?(index+matches.length)%matches.length:0;
  for(const [i,button] of [...results.children].entries()){button.classList.toggle('selected',i===selected);button.setAttribute('aria-selected',String(i===selected));}
  if(matches.length){query.setAttribute('aria-activedescendant','questPageResult'+selected);results.children[selected]?.scrollIntoView({block:'nearest'});}else query.removeAttribute('aria-activedescendant');
 }
 function renderFinder(){
  const words=normal(query.value).split(' ').filter(Boolean);matches=catalog().filter(entry=>words.every(word=>entry.terms.includes(word))).slice(0,40);results.replaceChildren();
  for(const [i,entry] of matches.entries()){
   const button=document.createElement('button');button.type='button';button.id='questPageResult'+i;button.className='quest-page-result';button.tabIndex=-1;button.setAttribute('role','option');
   const icon=entry.button?.querySelector('.nav-emoji')?.cloneNode(true)||document.createElement('span');if(!icon.textContent){icon.textContent=pages[entry.view]?.[0]||'↗';icon.className='nav-emoji';icon.setAttribute('aria-hidden','true');}
   button.style.setProperty('--nav-colour',entry.button?.style.getPropertyValue('--nav-colour')||pages[entry.view]?.[1]||'#7dd3fc');
   const title=document.createElement('span');title.textContent=entry.label;const path=document.createElement('small');path.textContent=entry.group;button.append(icon,title,path);button.onclick=()=>choose(entry);results.append(button);
  }
  document.getElementById('questPageEmpty').hidden=!!matches.length;selectResult(0);
 }
 function openFinder(){
  if(!dialog||document.getElementById('appShell').hidden||searchButton.disabled||document.querySelector('dialog[open]:not(#questPageFinder)'))return;
  restoreFocus=document.activeElement;query.value='';renderFinder();dialog.showModal();query.focus();
 }
 function createFinder(sidebar,before){
  searchButton=document.createElement('button');searchButton.id='questPageSearch';searchButton.type='button';searchButton.className='sidebar-page-search';searchButton.setAttribute('aria-label','Find a page');searchButton.innerHTML='<span aria-hidden="true">⌕</span><span>Find a page…</span><kbd>Ctrl K</kbd>';searchButton.onclick=openFinder;sidebar.insertBefore(searchButton,before);
  dialog=document.createElement('dialog');dialog.id='questPageFinder';dialog.className='quest-page-finder';dialog.setAttribute('aria-labelledby','questPageFinderTitle');dialog.innerHTML='<header><div><div class="eyebrow">Quest / Jump to</div><h2 id="questPageFinderTitle">Find a page</h2></div><button type="button" class="button" id="questPageFinderClose" aria-label="Close page search">✕</button></header><input id="questPageQuery" class="input" type="search" placeholder="Search pages, projects and chats…" aria-label="Search accessible pages" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="questPageResults" autocomplete="off"><div id="questPageResults" role="listbox" aria-label="Accessible pages"></div><p id="questPageEmpty" hidden>No matching pages in your workspace.</p><footer>↑ ↓ to choose <span>Enter to open</span><span>Esc to close</span></footer>';document.body.append(dialog);
  query=document.getElementById('questPageQuery');results=document.getElementById('questPageResults');query.oninput=renderFinder;document.getElementById('questPageFinderClose').onclick=()=>closeFinder();
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeFinder();});
  dialog.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp','Enter','Escape'].includes(event.key)){event.preventDefault();event.stopPropagation();if(event.key==='Escape')closeFinder();else if(event.key==='Enter')choose(matches[selected]);else selectResult(selected+(event.key==='ArrowDown'?1:-1));}});
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!event.altKey){event.preventDefault();if(dialog.open)query.focus();else openFinder();}});
 }
 function organize(options={}){
  if(sectionHost)return;api=options;
  const sidebar=document.getElementById('sidebar'),source=sidebar?.querySelector('.nav');if(!source)return;
  sidebar.classList.add('sidebar-upgraded');
  const original=source.parentElement,brandNav=document.getElementById('fragileShortcut')?.parentElement,projectNav=document.getElementById('projectNav'),oldProjects=projectNav?.parentElement;
  const logo=sidebar.querySelector(':scope>.logo'),brand=document.createElement('div');brand.className='sidebar-brand';sidebar.insertBefore(brand,logo);brand.append(logo);const wordmark=document.createElement('div');wordmark.innerHTML='<strong>QUEST<span>.</span></strong><small>Your workspace</small>';brand.append(wordmark);
  createFinder(sidebar,original);
  const quick=document.createElement('nav');quick.className='nav sidebar-quick';quick.setAttribute('aria-label','Quick access');quickNav=quick;sidebar.insertBefore(quick,original);
  archive=document.createElement('div');archive.hidden=true;archive.id='questNavArchive';sidebar.append(archive);
  const buttons=[...source.querySelectorAll('button')];
  for(const id of ['overview','tasks','calendar']){const button=buttons.find(b=>b.dataset.view===id);if(button)quick.append(button);}
  for(const id of ['personalHome','business','events','personalCalendar']){const button=buttons.find(b=>b.dataset.view===id);if(button)archive.append(button);}
  let saved={};try{const value=JSON.parse(localStorage.getItem(preferenceKey)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))saved=value;}catch{}
  sectionHost=document.createElement('div');sectionHost.className='sidebar-sections';sectionHost.setAttribute('aria-label','Workspace navigation sections');sidebar.insertBefore(sectionHost,original);
  for(const [id,title,views] of sectionDefinitions){const section=document.createElement('details');section.className='sidebar-section';section.dataset.navSection=id;section.open=saved[id]===true;
   const summary=document.createElement('summary');summary.className='sidebar-section-heading';summary.textContent=title;const body=document.createElement('div');body.className='sidebar-section-body';const nav=document.createElement('nav');nav.className='nav';nav.setAttribute('aria-label',title);body.append(nav);section.append(summary,body);sectionHost.append(section);sections.set(id,section);section.addEventListener('toggle',saveSections);
   for(const view of views){const button=buttons.find(b=>b.dataset.view===view);if(button)nav.append(button);}
  }
  if(brandNav)sections.get('studios').querySelector('.sidebar-section-body').append(brandNav);
  if(projectNav){projectDetails=document.createElement('details');projectDetails.className='sidebar-project-shortcuts';const summary=document.createElement('summary');summary.textContent='Project shortcuts';projectDetails.append(summary,projectNav);sections.get('work').querySelector('.sidebar-section-body').append(projectDetails);oldProjects.remove();}
  const chats=document.getElementById('privateChatNavSection');if(chats)sections.get('work').querySelector('.sidebar-section-body').append(chats);
  const install=document.getElementById('appInstallMenu');if(install)sections.get('settings').querySelector('.nav').append(install);
  sections.get('tools').querySelector('.nav').append(...source.children);original.remove();
  addTabs(['writing','business'],[['writing','Personal'],['business','Business']],'notes');
  addTabs(['calendar','events','personalCalendar'],[['calendar','Calendar'],['events','Agenda'],['personalCalendar','My calendar']],'calendar');
  addTabs(['overview','personalHome'],[['overview','Home'],['personalHome','My workspace']],'home');
  for(const id of ['writing','business']){const heading=document.querySelector('#'+id+' .title-row h1');if(heading)heading.textContent='Notes';}
  new MutationObserver(()=>{if(refreshQueued)return;refreshQueued=true;queueMicrotask(()=>{refreshQueued=false;refreshSections();});}).observe(sidebar,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  refreshSections();
 }
 function reveal(view){
  if(!sectionHost)return;const current=canonical(view);let section=sections.get(view==='privateChat'||view==='projectWorkspace'?'work':view==='fragile'?'studios':null);
  if(!section){const button=[...sectionHost.querySelectorAll('[data-view]')].find(b=>canonical(b.dataset.view)===current&&!b.hidden);section=button?.closest('.sidebar-section');}
  refreshSections();if(section&&!section.hidden)section.open=true;if(view==='projectWorkspace'&&projectDetails)projectDetails.open=true;markActive(view);
 }
 function appearance(kind,name,id){
  if(pages[kind])return ['businessStudio','personalCalendar'].includes(kind)&&name?[...pages[kind].slice(0,2),name]:pages[kind];
  const normal=String(name||'').trim().toLowerCase().replace(/\.$/,'');
  if(kind==='project'&&['fragile','loden','dusted'].includes(normal))return [...pages[normal].slice(0,2),name];

  const value=hash(id||name),icons=kind==='room'?['💌','🔐','🗨️','📨','🤝','🫶']:['🪡','🎨','🧩','🛠️','🌱','📦','🚀','💎'];
  return [icons[value%icons.length],`hsl(${value%360} 78% 76%)`,name||'Project'];
 }
 function decorate(button,kind,name,id){
  const [emoji,colour,label]=appearance(kind,name,id),badges=[...button.children].filter(node=>node.matches('.count,.online-nav-count'));
  const icon=document.createElement('span');icon.className='nav-emoji'+(kind==='loden'||String(name||'').trim().toLowerCase()==='loden'?' loden-nav-mark':'');icon.textContent=emoji;icon.setAttribute('aria-hidden','true');
  const title=document.createElement('span');title.className='nav-title';title.textContent=label;if(String(label).trim().toLowerCase()==='fragile')title.classList.add('fragile-wordmark');
  button.classList.add('quest-nav-item');button.style.setProperty('--nav-colour',colour);button.replaceChildren(icon,title,...badges);return button;
 }
 function init(){
  for(const button of document.querySelectorAll('.sidebar .nav button[data-view]'))decorate(button,button.dataset.view);
  const fragile=document.getElementById('fragileShortcut');if(fragile)decorate(fragile,'fragile');
  const install=document.getElementById('appInstallMenu');if(install)decorate(install,'install');
  const formStudio=document.getElementById('formStudioShortcut');if(formStudio)decorate(formStudio,'formStudio');
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
 return {decorate,organize,refreshSections,reveal,reset,openFinder};
})();

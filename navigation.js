/* Shared sidebar appearance; page permissions and navigation stay with the app. */
window.QuestNavigation=(()=>{
 const pages={
  globe:['🌐','#38bdf8','Globe'],
  questPreview:['✨','#67e8f9','Explore Quest'],
  overview:['🏡','#7dd3fc','Home'],myDay:['☀️','#fcd34d','My day'],dashboard:['🧭','#a5b4fc','Dashboard'],
  projects:['🗂️','#c4b5fd','Projects'],tasks:['✅','#86efac','Tasks'],notifications:['🔔','#f9a8d4','Notifications'],
  members:['👥','#67e8f9','Members'],events:['🎟️','#fdba74','Events'],calendar:['🗓️','#fda4af','Calendar'],
  expenses:['💸','#a3e635','Expenses'],goals:['🎯','#f0abfc','Goals'],discussions:['💬','#6ee7b7','Team chat room'],
  files:['📎','#93c5fd','Files'],search:['🔎','#fde68a','Search'],activity:['📜','#5eead4','Activity'],
  trading:['📈','#38bdf8','Trading view'],fragile:['🦋','#e9a8ff','Fragile'],loden:['L','#b4ff39','Loden'],dusted:['🍬','#fb923c','Dusted.'],
  install:['📲','#cbd5e1','Install Quest']
  ,invoices:['💳','#f4c182','Invoices'],quotes:['🧾','#d8bc81','Quotes'],businessStudio:['🌿','#95cbb1','Business workspace'],personalCalendar:['🗓️','#67e8f9','My calendar'],personalHome:['🌙','#c4b5fd','My workspace'],personalSetup:['🎛️','#f9a8d4','My settings'],writing:['✒️','#93c5fd','Writing & notes'],business:['📒','#fcd34d','Business & work']
 };
 const hash=text=>Array.from(String(text)).reduce((value,letter)=>(Math.imul(value,31)+letter.codePointAt(0))>>>0,0);
 const sectionDefinitions=[
  ['daily','Daily',['overview','personalHome','dashboard','myDay','notifications']],
  ['planning','Planning',['tasks','goals','calendar','events','personalCalendar']],
  ['business','Business',['businessStudio','writing','business','quotes','invoices','expenses']],
  ['studios','Studios',['loden','dusted']],
  ['projects','Projects',['projects']],
  ['conversations','Conversations',['discussions']],
  ['tools','Tools & discovery',['search','files','activity','trading','globe','questPreview']],
  ['settings','Settings & admin',['personalSetup','members']]
 ];
 const sections=new Map(),preferenceKey='quest-sidebar-sections-v1';
 let sectionHost=null,refreshQueued=false;
 function visibleInSection(button,section){
  for(let el=button;el&&el!==section;el=el.parentElement)if(el.hidden)return false;
  return true;
 }
 function refreshSections(){
  for(const section of sections.values()){
   const empty=![...section.querySelectorAll('button')].some(button=>visibleInSection(button,section));
   if(section.hidden!==empty)section.hidden=empty;
  }
 }
 function saveSections(){
  // Only fixed section IDs and expansion preferences are stored, never account data.
  try{localStorage.setItem(preferenceKey,JSON.stringify(Object.fromEntries([...sections].map(([id,section])=>[id,section.open]))));}catch{}
 }
 function organize(){
  if(sectionHost)return;
  const sidebar=document.getElementById('sidebar'),source=sidebar?.querySelector('.nav');if(!source)return;
  const originalGroup=source.parentElement,brandNav=document.getElementById('fragileShortcut')?.parentElement;
  const projectNav=document.getElementById('projectNav'),oldProjectGroup=projectNav?.parentElement;
  let saved={};try{const value=JSON.parse(localStorage.getItem(preferenceKey)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))saved=value;}catch{}
  sectionHost=document.createElement('div');sectionHost.className='sidebar-sections';sectionHost.setAttribute('aria-label','Workspace navigation sections');sidebar.insertBefore(sectionHost,originalGroup);
  for(const [id,title] of sectionDefinitions){
   const section=document.createElement('details');section.className='sidebar-section';section.dataset.navSection=id;section.open=typeof saved[id]==='boolean'?saved[id]:true;
   const summary=document.createElement('summary');summary.className='sidebar-section-heading';summary.textContent=title;
   const body=document.createElement('div');body.className='sidebar-section-body';
   const nav=document.createElement('nav');nav.className='nav';nav.setAttribute('aria-label',title);body.append(nav);section.append(summary,body);sectionHost.append(section);sections.set(id,section);
   section.addEventListener('toggle',saveSections);
  }
  for(const [id,,views] of sectionDefinitions){
   const nav=sections.get(id).querySelector('.nav');
   for(const view of views){const button=[...source.querySelectorAll('button[data-view]')].find(b=>b.dataset.view===view);if(button)nav.append(button);}
  }
  // Keep dynamic lists and the existing button nodes so badges, handlers and access checks survive.
  if(brandNav)sections.get('studios').querySelector('.sidebar-section-body').prepend(brandNav);
  if(projectNav){sections.get('projects').querySelector('.sidebar-section-body').append(projectNav);oldProjectGroup.remove();}
  const chats=document.getElementById('privateChatNavSection');if(chats)sections.get('conversations').querySelector('.sidebar-section-body').append(chats);
  const install=document.getElementById('appInstallMenu');if(install)sections.get('settings').querySelector('.nav').append(install);
  // Preserve future or unknown shortcuts in the tools section instead of dropping them.
  sections.get('tools').querySelector('.nav').append(...source.children);originalGroup.remove();
  new MutationObserver(()=>{if(refreshQueued)return;refreshQueued=true;queueMicrotask(()=>{refreshQueued=false;refreshSections();});}).observe(sectionHost,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  refreshSections();
 }
 function reveal(view){
  if(!sectionHost)return;
  const special={privateChat:'conversations',projectWorkspace:'projects',fragile:'studios'};
  let section=sections.get(special[view]);
  if(!section){let button=[...sectionHost.querySelectorAll('[data-view]')].find(b=>b.dataset.view===view&&!b.hidden);if(!button&&view==='personalHome')button=sectionHost.querySelector('[data-view=overview]');section=button?.closest('.sidebar-section');}
  refreshSections();if(section&&!section.hidden)section.open=true;
 }
 function appearance(kind,name,id){
  if(pages[kind])return pages[kind];
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
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
 return {decorate,organize,refreshSections,reveal};
})();

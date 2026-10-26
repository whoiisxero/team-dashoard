/* Shared sidebar appearance; page permissions and navigation stay with the app. */
window.QuestNavigation=(()=>{
 const pages={
  overview:['🏡','#7dd3fc','Home'],myDay:['☀️','#fcd34d','My day'],dashboard:['🧭','#a5b4fc','Dashboard'],
  projects:['🗂️','#c4b5fd','Projects'],tasks:['✅','#86efac','Tasks'],notifications:['🔔','#f9a8d4','Notifications'],
  members:['👥','#67e8f9','Members'],events:['🎟️','#fdba74','Events'],calendar:['🗓️','#fda4af','Calendar'],
  expenses:['💸','#a3e635','Expenses'],goals:['🎯','#f0abfc','Goals'],discussions:['💬','#6ee7b7','Team chat room'],
  files:['📎','#93c5fd','Files'],search:['🔎','#fde68a','Search'],activity:['📜','#5eead4','Activity'],
  trading:['📈','#38bdf8','Trading view'],fragile:['🦋','#e9a8ff','Fragile'],loden:['L','#b4ff39','Loden'],dusted:['🍬','#fb923c','Dusted.'],
  install:['📲','#cbd5e1','Install Quest']
 };
 const hash=text=>Array.from(String(text)).reduce((value,letter)=>(Math.imul(value,31)+letter.codePointAt(0))>>>0,0);
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
 return {decorate};
})();

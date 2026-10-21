/* Installation and connection UX. Private data and drafts are never written to caches. */
(() => {
  const RELEASE='__QUEST_RELEASE__',$=id=>document.getElementById(id);
  let prompt=null,registration=null,reloadRequested=false,waitingTimer=null;
  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  function hasUnsentWork(){
    if(document.querySelector('dialog[open]:not(#appInstallDialog)'))return true;
    if(document.querySelector('[data-app-saving="true"]'))return true;
    return ['messageText','privateChatText','fragileChatText','dustedChatText'].some(id=>$(id)?.value.trim())||
      (!$('#loginScreen')?.hidden&&['email','password','resetEmail','newPassword','confirmPassword'].some(id=>$(id)?.offsetParent&&$(id).value));
  }
  function renderInstall(){
    const installed=standalone();$('appInstallNative').hidden=installed||!prompt;
    $('appInstallTitle').textContent=installed?'Quest is installed':'Install Quest';
    $('appInstallIntro').textContent=installed?'You’re using Quest in its own app window.':'Keep your team workspace one tap away with a Quest icon on your home screen.';
    $('appInstallSteps').hidden=installed;
    const lines=ios()?['Open Quest in Safari.','Tap Share, then choose Add to Home Screen.','Tap Add. Open Quest from its new home-screen icon.']:
      ['Open Quest in Chrome, Edge or another browser that supports installation.','Choose Install app or Add to Home Screen from the browser menu or address bar.','Confirm, then open Quest from its new icon.'];
    $('appInstallSteps').replaceChildren(...lines.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
    $('appRelease').textContent=`Quest · ${/^[a-f0-9]{16}$/.test(RELEASE)?RELEASE:'development'}`;
  }
  function openInstall(){window.dispatchEvent(new Event('quest:close-navigation'));renderInstall();if(!$('appInstallDialog').open)$('appInstallDialog').showModal();}
  for(const id of ['appInstallMenu','appInstallLogin'])$(id)?.addEventListener('click',openInstall);
  $('appInstallClose').onclick=()=>$('appInstallDialog').close();
  $('appInstallNative').onclick=async()=>{
    if(!prompt)return;const event=prompt;prompt=null;
    try{await event.prompt();await event.userChoice;}catch{}
    renderInstall();
  };
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;renderInstall();});
  window.addEventListener('appinstalled',()=>{prompt=null;renderInstall();$('appInstallIntro').textContent='Quest is installed. Look for its icon on your home screen or app launcher.';});
  function connection(){
    const offline=navigator.onLine===false;$('appConnection').hidden=!offline;
    $('appConnectionText').textContent='You’re offline. New changes can’t be sent yet. Keep this page open to keep your unsent work.';
  }
  $('appReconnect').onclick=()=>{connection();window.dispatchEvent(new Event('quest:reconnect'));};
  window.addEventListener('offline',connection);window.addEventListener('online',connection);
  document.addEventListener('submit',event=>{
    if(navigator.onLine!==false)return;
    event.preventDefault();event.stopImmediatePropagation();connection();$('appConnection').scrollIntoView({block:'nearest'});
  },true);
  function updateState(){
    if(!registration?.waiting){$('appUpdate').hidden=true;if(waitingTimer)clearInterval(waitingTimer);waitingTimer=null;return;}
    const busy=hasUnsentWork();$('appUpdate').hidden=false;$('appUpdateNow').disabled=busy||navigator.onLine===false;
    $('appUpdateText').textContent=busy?'A Quest update is ready. Finish or clear your unsent work to update.':'A Quest update is ready. Update when you’re ready.';
  }
  function watchWaiting(){
    if(!registration?.waiting)return;updateState();
    if(!waitingTimer)waitingTimer=setInterval(updateState,1000);
  }
  $('appUpdateNow').onclick=()=>{
    if(!registration?.waiting||hasUnsentWork()||navigator.onLine===false)return updateState();
    reloadRequested=true;registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});
  };
  async function checkUpdate(){if(navigator.onLine===false||!registration)return;try{await registration.update();watchWaiting();}catch{}}
  document.addEventListener('input',updateState);document.addEventListener('change',updateState);
  window.addEventListener('online',()=>void checkUpdate());
  window.addEventListener('focus',()=>void checkUpdate());
  if('serviceWorker' in navigator&&window.isSecureContext){
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloadRequested)location.reload();else updateState();});
    navigator.serviceWorker.register('/service-worker.js',{updateViaCache:'none'}).then(result=>{
      registration=result;watchWaiting();registration.addEventListener('updatefound',()=>{
        const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)watchWaiting();});
      });
    }).catch(()=>{});
  }
  connection();window.QuestApp={openInstall,hasUnsentWork,release:RELEASE};
})();

/* On-demand measurements from this browser to Cloudflare; no account data is sent. */
window.createQuestConnectionSpeed=({getData})=>{
 const $=id=>document.getElementById(id),ENDPOINT='https://speed.cloudflare.com',DOWNLOAD_BYTES=8000000,UPLOAD_BYTES=2000000;
 const panel=document.createElement('section');panel.id='connectionSpeed';panel.className='card connection-speed';panel.hidden=true;panel.setAttribute('aria-labelledby','connectionSpeedTitle');
 panel.innerHTML=`<header class="connection-speed-heading"><div><div class="eyebrow">Your connection</div><h2 id="connectionSpeedTitle">Internet speed</h2></div><span id="connectionSpeedBadge" class="connection-speed-badge">Ready</span></header><dl class="connection-speed-metrics"><div><dt>↓ Download</dt><dd><strong id="connectionDownload">—</strong><small>Mbps</small></dd></div><div><dt>↑ Upload</dt><dd><strong id="connectionUpload">—</strong><small>Mbps</small></dd></div><div><dt>↔ Latency</dt><dd><strong id="connectionLatency">—</strong><small>ms</small></dd></div></dl><progress id="connectionSpeedProgress" max="3" value="0" aria-label="Speed test stages completed" hidden></progress><p id="connectionSpeedStatus" class="connection-speed-status" role="status" aria-live="polite">Run a quick test from this device.</p><div class="connection-speed-actions"><button type="button" class="button primary" id="connectionSpeedStart">Test speed</button><button type="button" class="button" id="connectionSpeedCancel" hidden>Stop</button><a href="https://speed.cloudflare.com/" target="_blank" rel="noopener noreferrer" class="connection-speed-link">Full test ↗</a></div><p class="connection-speed-note">Uses about 10 MB per test. Quick estimates to Cloudflare; latency is an HTTP round trip. Wi-Fi, VPNs and other traffic affect results.</p>`;
 const globe=document.querySelector('.world-layout'),info=globe?.querySelector('.world-info');
 if(!globe||!info)return {sync:()=>{},reset:()=>{}};
 const stack=document.createElement('div');stack.className='world-sidepanels';info.before(stack);stack.append(panel,info);
 let owner=null,epoch=0,busy=false,controller=null,completed=null;
 const eligible=()=>!!getData().user?.id&&!!getData().policy?.is_admin;
 const active=()=>!document.hidden&&!$('appShell').hidden&&!!panel.closest('.view.active');
 const current=(generation,uid)=>generation===epoch&&eligible()&&getData().user.id===uid;
 const format=value=>Number.isFinite(value)?new Intl.NumberFormat('en-ZA',{maximumFractionDigits:value<10?1:0}).format(value):'—';
 function status(badge,message){$('connectionSpeedBadge').textContent=badge;$('connectionSpeedStatus').textContent=message;panel.dataset.state=badge.toLowerCase();}
 function controls(){ $('connectionSpeedStart').disabled=busy;$('connectionSpeedStart').textContent=completed?'Test again':'Test speed';$('connectionSpeedCancel').hidden=!busy;$('connectionSpeedProgress').hidden=!busy; }
 function clear(){for(const id of ['connectionDownload','connectionUpload','connectionLatency'])$(id).textContent='—';$('connectionSpeedProgress').value=0;completed=null;}
 function stop(message='Test stopped. Tap Test speed when you’re ready.') {epoch++;controller?.abort();controller=null;busy=false;clear();status(navigator.onLine===false?'Offline':'Stopped',message);controls();}
 function reset(){stop();owner=null;panel.hidden=true;status('Ready','Run a quick test from this device.');}
 function sync(){const uid=eligible()?getData().user.id:null;if(owner!==uid){reset();owner=uid;}panel.hidden=!uid;if(busy&&!active())stop('Test stopped when you left this page.');}
 function url(path,bytes){const value=new URL(path,ENDPOINT);if(bytes!==undefined)value.searchParams.set('bytes',String(bytes));value.searchParams.set('cacheBust',crypto.randomUUID?.()||String(Date.now())+Math.random().toString(16).slice(2));return value.href;}
 async function consume(response,limit,expected=null){
  if(!response.ok||!response.body)throw new Error('Speed-test service unavailable. Try again or open Full test.');
  const reader=response.body.getReader();let bytes=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limit){await reader.cancel();throw new Error('The speed-test response was larger than expected.');}}}finally{reader.releaseLock();}
  if(expected!==null&&bytes!==expected)throw new Error('The transfer was incomplete. Try the test again.');
  return bytes;
 }
 async function request(path,{bytes,body,signal,limit=65536,expected=null}={}){
  if(signal?.aborted)throw new DOMException('Test stopped','AbortError');
  const response=await fetch(url(path,bytes),{method:body?'POST':'GET',body,signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',mode:'cors'});
  return consume(response,limit,expected);
 }
 async function run(){
  if(busy||!eligible()||!active())return;
  if(navigator.onLine===false){status('Offline','You’re offline. Reconnect, then test again.');return;}
  const uid=getData().user.id,generation=++epoch,abort=new AbortController();controller=abort;busy=true;clear();controls();
  let timeout=null;
  const phase=async work=>{timeout=setTimeout(()=>abort.abort(),20000);try{return await work();}finally{clearTimeout(timeout);timeout=null;}};
  try{
   status('Testing','Checking latency…');
   // Warm the connection before reporting the median of three round trips.
   await phase(()=>request('/__down',{bytes:0,signal:abort.signal,expected:0}));
   const timings=[];
   for(let i=0;i<3;i++){const start=performance.now();await phase(()=>request('/__down',{bytes:0,signal:abort.signal,expected:0}));timings.push(performance.now()-start);}
   if(!current(generation,uid))return;
   $('connectionLatency').textContent=format(timings.sort((a,b)=>a-b)[1]);$('connectionSpeedProgress').value=1;
   status('Testing','Measuring download…');
   let start=performance.now();const received=await phase(()=>request('/__down',{bytes:DOWNLOAD_BYTES,signal:abort.signal,limit:DOWNLOAD_BYTES,expected:DOWNLOAD_BYTES}));
   const downSeconds=(performance.now()-start)/1000;
   if(!current(generation,uid))return;if(downSeconds<=0)throw new Error('The timing could not be measured. Please retry.');
   $('connectionDownload').textContent=format(received*8/downSeconds/1000000);$('connectionSpeedProgress').value=2;
   status('Testing','Measuring upload…');
   const payload=new Uint8Array(UPLOAD_BYTES);for(let i=0;i<payload.length;i+=65536)crypto.getRandomValues(payload.subarray(i,Math.min(i+65536,payload.length)));
   // A simple content type avoids including a CORS preflight in the upload timing.
   const body=new Blob([payload],{type:'text/plain'});start=performance.now();
   await phase(()=>request('/__up',{body,signal:abort.signal}));
   const upSeconds=(performance.now()-start)/1000;
   if(!current(generation,uid))return;if(upSeconds<=0)throw new Error('The timing could not be measured. Please retry.');
   $('connectionUpload').textContent=format(UPLOAD_BYTES*8/upSeconds/1000000);$('connectionSpeedProgress').value=3;
   completed=new Date();status('Complete','Last tested '+completed.toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'})+' · this device.');
  }catch(error){
   if(!current(generation,uid))return;
   const message=navigator.onLine===false?'Connection lost. Reconnect and test again.':abort.signal.aborted?'Test timed out. Try again or open Full test.':error instanceof TypeError?'Couldn’t reach the test service. Try again or open Full test.':error.message||'The test could not finish. Please retry.';
   // Partial results are not presented as a completed connection test.
   clear();status(navigator.onLine===false?'Offline':'Unavailable',message);
  }finally{clearTimeout(timeout);if(current(generation,uid)){busy=false;controller=null;controls();}}
 }
 $('connectionSpeedStart').onclick=()=>void run();$('connectionSpeedCancel').onclick=()=>stop();
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&busy)stop('Test stopped while this tab was in the background.');});
 window.addEventListener('offline',()=>{if(!eligible())return;if(busy)stop('Connection lost. Reconnect and test again.');else status('Offline','You’re offline. Reconnect to run a new test.');});
 window.addEventListener('online',()=>{if(eligible()&&!busy){if(completed)status('Complete','Back online. Last tested '+completed.toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'})+' · this device.');else status('Ready','You’re connected. Tap Test speed to check this device.');}});
 return {sync,reset};
};

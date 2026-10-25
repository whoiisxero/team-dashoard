"""Real fake-device MediaRecorder; provider responses and workspace are fixtures."""
from pathlib import Path
import json,mimetypes,time
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';","const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture='\n'.join((root/'tests'/n).read_text() for n in ['member-access-fixture.js','private-chats-fixture.js','daily-workflow-fixture.js']).replace('</script','<\\/script')
fixture+="\ndb.auth={getSession:async()=>({data:{session:{access_token:'test-session-'+user.id+'-01234567890123456789'}}})};window.qaTestReady=true;"
html=html.replace('</script></body>',fixture+'</script></body>')
headers={h['key']:h['value'] for h in json.loads((root/'vercel.json').read_text())['headers'][0]['headers']}
origin='http://localhost:18763'
state={'transcript':'Q, pull up calendar','audio':[],'events':[],'pending':[],'hold':False,'fail_event':False}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
 context=browser.new_context(viewport={'width':1280,'height':900},permissions=['microphone'],timezone_id='Africa/Johannesburg');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script("""window.speechTest={spoken:[],cancelled:0};Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{voiceURI:'test-voice',name:'Test English',lang:'en-ZA'}],addEventListener:()=>{},cancel:()=>speechTest.cancelled++,speak:u=>{speechTest.spoken.push(u.text);setTimeout(()=>u.onstart?.(),0);setTimeout(()=>u.onend?.(),50);}}});
 const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.micTest={streams:[],hold:false,pending:[]};navigator.mediaDevices.getUserMedia=async opts=>{const stream=await get(opts);micTest.streams.push(stream);if(micTest.hold)await new Promise(r=>micTest.pending.push(r));return stream;};""")
 def route(r):
  url=r.request.url
  if url==origin+'/':return r.fulfill(body=html,content_type='text/html',headers=headers)
  if url==origin+'/api/assistant':return r.fulfill(json={'configured':True} if r.request.method=='GET' else {'reply':'I can help plan your day.','actions':[]})
  if url==origin+'/api/transcribe':
   state['audio'].append({'headers':r.request.headers,'bytes':len(r.request.post_data_buffer or b'')})
   if state['hold']:state['pending'].append(r);return
   return r.fulfill(json={'text':state['transcript']})
  if url==origin+'/api/event-assistant':
   body=r.request.post_data_json;state['events'].append(body)
   if state['fail_event']:return r.fulfill(status=503,json={'code':'event_save_uncertain','message':'Retry here; Q will check for an existing event.'})
   if 'tomorrow' not in body['message'].lower():return r.fulfill(json={'state':'need_details','draft':{'title':'Sample fitting'},'reply':'Which date and time, where, and what is it for?'})
   event={'id':body['flow_id'],'title':'Sample fitting','event_date':'2026-10-26','event_time':'15:30','time_zone':'Africa/Johannesburg','project_id':'fragile','created_by':'jen','detail':'Where: Cape Town studio\nPurpose: Check samples'}
   page.evaluate('(event)=>{if(!accessTest.records.calendar_events.some(e=>e.id===event.id))accessTest.records.calendar_events.push(event)}',event)
   return r.fulfill(json={'state':'created','event':event,'reply':'Added Sample fitting for tomorrow at 15:30 in the Cape Town studio.'})
  if url.startswith(origin+'/'):
   path=root/url.removeprefix(origin+'/').split('?')[0]
   if path.name in ['home.js','d3.min.js']:return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 def wait(expression):
  deadline=time.monotonic()+12
  while time.monotonic()<deadline:
   if page.evaluate(expression):return
   page.wait_for_timeout(30)
  raise AssertionError('Timed out: '+expression+'; '+str(errors)+'; '+str(page.locator('#qaStatus').all_text_contents()))
 page.route('**/*',route);page.goto(origin+'/');wait('window.qaTestReady&&!document.querySelector("#questAssistant").hidden')
 assert page.evaluate('isSecureContext');assert page.evaluate('document.featurePolicy.allowsFeature("microphone")')
 def ask(text):
  if page.locator('#qaPanel').is_hidden():page.locator('#qaOpen').click()
  page.locator('#qaInput').fill(text);page.locator('#qaSend').click()
 def record(text):
  state['transcript']=text;page.locator('#qaMic').click();wait('document.querySelector("#qaMic").getAttribute("aria-pressed")==="true"');page.wait_for_timeout(400);page.locator('#qaMic').click()
 # Whole-screen two-axis placement, keyboard and persisted public placement.
 box=page.locator('#qaCharacter').bounding_box();page.mouse.move(box['x']+60,box['y']+80);page.mouse.down();page.mouse.move(box['x']-250,box['y']-230,steps=12);page.mouse.up();placed=page.locator('#questAssistant').bounding_box();assert placed['x']<box['x']-200 and placed['y']<box['y']-200;assert page.locator('#qaPanel').is_hidden()
 page.locator('#qaCharacter').focus();page.keyboard.press('ArrowUp');assert page.locator('#questAssistant').bounding_box()['y']<placed['y'];assert page.evaluate('JSON.parse(localStorage.getItem("quest-assistant-position")).y<1')
 page.locator('#qaOpen').click();box=page.locator('#qaPanel').bounding_box();assert box['y']>=0 and box['y']+box['height']<=900;page.locator('#qaDock').click();assert page.evaluate('localStorage.getItem("quest-assistant-position")===null')
 # Voice defaults to reviewed input; real MediaRecorder produces bytes, no model question sent automatically.
 record('Q, pull up calendar');wait('document.querySelector("#qaInput").value==="Q, pull up calendar"');assert page.locator('#qaPanel').is_visible();assert page.evaluate('micTest.streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))');assert state['audio'][-1]['bytes']>0;assert state['audio'][-1]['headers']['content-type']=='application/octet-stream';assert state['audio'][-1]['headers']['x-audio-type'].startswith('audio/');assert state['audio'][-1]['headers']['authorization'].startswith('Bearer test-session-jen')
 page.locator('#qaSend').click();assert page.locator('#calendar').evaluate('(e)=>e.classList.contains("active")');assert page.locator('#qaPanel').is_hidden()
 # Navigation is immediate and keeps restricted pages closed.
 ask('Q, pull up the Dusted page');assert 'not available' in page.locator('#qaMessages').inner_text();ask('Queue. Take me to the calendar page.');assert page.locator('#qaPanel').is_hidden()
 # Explicit event flow asks then saves without opening the form or clicking Save.
 ask('Q add event');assert page.locator('#qaEventFlow').is_visible();assert not state['events'];ask('Sample fitting');wait('document.querySelector("#qaMessages").textContent.includes("Which date and time")');assert state['events'][-1]['draft']=={}
 state['fail_event']=True;ask('Tomorrow at 15:30 at the Cape Town studio to check samples');wait('!document.querySelector("#qaRecovery").hidden');flow=state['events'][-1]['flow_id'];assert state['events'][-1]['draft']['title']=='Sample fitting';state['fail_event']=False;page.locator('#qaRetry').click();wait('document.querySelector("#qaPanel").hidden');assert state['events'][-1]['flow_id']==flow;assert page.locator('#entryDialog').is_hidden();assert 'Sample fitting' in page.locator('#calendar').inner_text()
 page.evaluate("accessTest.navigate('events')");assert 'Sample fitting' in page.locator('#allEvents').inner_text();assert 'Sample fitting' in page.locator('#chatEvents').inner_text()
 ask('Add event');ask('cancel event');assert page.locator('#qaEventFlow').is_hidden()
 # Hands-free turn: real capture + simulated speech/silence analysis. Only the
 # first Mic click is needed; both follow-up and final save are automatic.
 page.evaluate("""()=>{window.realAudioContext=window.AudioContext;window.AudioContext=class {constructor(){this.started=performance.now();}createMediaStreamSource(){return {connect:()=>{}};}createAnalyser(){return {fftSize:1024,getByteTimeDomainData:array=>array.fill(performance.now()-this.started<500?150:128)};}close(){return Promise.resolve();}};}""")
 page.locator('#qaHandsFree').check();state['transcript']='Add event for Sample fitting';before=len(state['events']);page.locator('#qaMic').click()
 wait('document.querySelector("#qaInput").value==="" && document.querySelector("#qaEventFlow").hidden===false && speechTest.spoken.some(s=>s.includes("Which date and time"))')
 wait('document.querySelector("#qaMic").getAttribute("aria-pressed")==="true"')
 assert len(state['events'])==before+1
 state['transcript']='Tomorrow at 15:30 at the Cape Town studio to check samples';wait('document.querySelector("#qaPanel").hidden')
 assert len(state['events'])==before+2;assert page.evaluate('micTest.streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))')
 page.locator('#qaOpen').click();page.evaluate('()=>{window.AudioContext=window.realAudioContext;}')
 # Stop/cancel and late permission grants cannot leave a live microphone.
 page.locator('#qaHandsFree').uncheck();page.locator('#qaInput').fill('Preserve typed draft');page.locator('#qaMic').click();wait('document.querySelector("#qaMic").getAttribute("aria-pressed")==="true"');page.locator('#qaVoiceCancel').click();assert page.locator('#qaInput').input_value()=='Preserve typed draft'
 page.evaluate('micTest.hold=true');page.locator('#qaMic').click();wait('micTest.pending.length>0');page.locator('#qaClose').click();page.evaluate('micTest.pending.splice(0).forEach(done=>done());micTest.hold=false');wait('micTest.streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))')
 # Permission denial preserves typed input and offers recording recovery.
 page.locator('#qaOpen').click();page.evaluate("()=>{window.realGetUserMedia=navigator.mediaDevices.getUserMedia;navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Blocked','NotAllowedError')};}")
 page.locator('#qaMic').click();wait('document.querySelector("#qaStatus").textContent.includes("permission was blocked")');assert page.locator('#qaRetry').inner_text()=='Record again';assert page.locator('#qaInput').input_value()=='Preserve typed draft';page.evaluate('()=>{navigator.mediaDevices.getUserMedia=window.realGetUserMedia;}')
 # A late transcript never crosses an account boundary.
 page.locator('#qaOpen').click();page.locator('#qaInput').fill('');state['hold']=True;record('Private old account');wait('document.querySelector("#qaMic").textContent.includes("Transcribing")');page.evaluate("accessTest.switchUser('josh')");wait('document.querySelector("#userName").textContent==="Josh"')
 for pending in state['pending']:
  try:pending.fulfill(json={'text':'Private old account'})
  except Exception:pass
 assert page.locator('#qaInput').input_value()=='';assert 'Private old account' not in page.locator('#qaMessages').inner_text()
 page.set_viewport_size({'width':320,'height':740});page.locator('#qaOpen').click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path='/tmp/quest-q-voice-phone.png',animations='disabled');assert not errors,errors
 browser.close()
print('PASS Q voice/navigation/calendar browser: real fake-device recording, secure same-origin mic policy, reviewed input, hands-free follow-up/read-aloud, microphone teardown and late-grant isolation; two-axis drag, immediate permitted navigation, automatic event save/retry, Calendar/Events/chat feed refresh, cancellation and mobile fit. Providers/workspace are fixtures.')

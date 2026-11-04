"""Local companion behavior, distraction boundaries and account isolation."""
from pathlib import Path
import datetime,mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';","const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture='\n'.join((root/'tests'/n).read_text() for n in ['member-access-fixture.js','private-chats-fixture.js','daily-workflow-fixture.js']).replace('</script','<\\/script')
fixture+="\ndb.auth={getSession:async()=>({data:{session:{access_token:'test-session-'+user.id+'-01234567890123456789'}}})};window.qaTestReady=true;"
html=html.replace('</script></body>',fixture+'</script></body>')
calls=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']);page=browser.new_page(viewport={'width':1280,'height':1000},timezone_id='Africa/Johannesburg');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.clock.install(time=datetime.datetime(2026,10,22,10,tzinfo=datetime.timezone.utc))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if '/api/' in url:calls.append(r.request.method);return r.fulfill(json={'configured':False})
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/').split('?')[0]
   if path.name in ['home.js','d3.min.js']:return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.qaTestReady&&!document.querySelector("#questAssistant").hidden');page.clock.run_for(3000)
 assert not calls
 assert page.locator('#qaCharacter .qa-orb-shell').count()==1;assert page.locator('#qaCharacter .qa-head,#qaCharacter .qa-eyes,#qaCharacter .qa-arm-right').count()==0
 assert page.locator('#qaCharacter').bounding_box()['height']<=120
 page.locator('#qaOpen').click();page.wait_for_function('document.querySelector("#qaMode").textContent==="Workspace helper"')
 assert page.locator('#qaPlay').is_hidden();assert page.locator('#qaDance').is_hidden();assert page.locator('#qaPlayMenu').is_hidden()
 assert page.locator('.qa-icon .qa-orb-shell').count()==1;assert page.locator('#qaRestore .qa-orb-shell').count()==1
 assert page.locator('#qaMic').is_visible();assert page.locator('#qaSpeak').is_visible();assert page.locator('#qaHandsFree').is_visible()
 # State animation has no character expressions and can be disabled persistently.
 page.evaluate('document.querySelector("#questAssistant").classList.add("is-thinking")');assert page.locator('#qaCharacter .qa-orb-ring').evaluate('(n)=>getComputedStyle(n).animationDuration')=='1.6s'
 page.evaluate('document.querySelector("#questAssistant").classList.remove("is-thinking");document.querySelector("#questAssistant").classList.add("is-listening")');assert page.locator('#qaCharacter .qa-orb-shell').evaluate('(n)=>getComputedStyle(n).animationDuration')=='1.8s'
 page.evaluate('document.querySelector("#questAssistant").classList.remove("is-listening")')
 page.locator('#qaPlayful').uncheck();assert page.evaluate('localStorage.getItem("quest-assistant-orb-motion")==="false"');assert page.locator('#qaCharacter .qa-orb-ring').evaluate('(n)=>getComputedStyle(n).animationName')=='none'
 page.reload();page.wait_for_function('window.qaTestReady&&!document.querySelector("#questAssistant").hidden');page.locator('#qaOpen').click();assert not page.locator('#qaPlayful').is_checked()
 page.locator('#qaPlayful').check();page.locator('#qaClose').click();page.clock.run_for(301000);assert page.locator('#qaReaction').count()==0;assert page.locator('#qaPanel').is_hidden();assert not any(m=='POST' for m in calls)
 page.screenshot(path='/tmp/quest-q-orb-desktop.png',animations='disabled')
 page.locator('#qaCharacter').focus();before=page.locator('#questAssistant').bounding_box();page.keyboard.press('ArrowLeft');assert page.locator('#questAssistant').bounding_box()['x']<before['x']
 page.locator('#qaMinimise').click();assert page.locator('#qaRestore').is_visible();page.locator('#qaRestore').click();assert page.locator('#qaCharacter').is_visible()
 page.emulate_media(reduced_motion='reduce');assert page.locator('#qaCharacter .qa-orb-shell').evaluate('(n)=>getComputedStyle(n).animationName')=='none'
 page.evaluate("accessTest.switchUser('josh')");page.wait_for_function('document.querySelector("#userName").textContent==="Josh"');assert page.locator('#qaPanel').is_hidden();assert 'Jen' not in page.locator('#qaMessages').inner_text()
 page.set_viewport_size({'width':320,'height':740});page.locator('#qaOpen').click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');box=page.locator('#qaSend').bounding_box();assert box['y']+box['height']<=740
 ids=page.locator('#questAssistant [id],#qaPanel [id]').evaluate_all('(nodes)=>nodes.map(n=>n.id)');assert len(ids)==len(set(ids));page.screenshot(path='/tmp/quest-q-orb-phone.png',animations='disabled')
 assert not errors,errors;assert not any(m=='POST' for m in calls);browser.close()
print('PASS professional Q orb: no anime or ambient chatter, shared orb icons, compact layout, thinking/listening states, persistent motion preference, voice controls, drag/minimise, account privacy, reduced motion and phone layout.')

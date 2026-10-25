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
 # Cursor attention is bounded and resets when typing starts.
 page.mouse.move(10,100);page.clock.run_for(50);assert float(page.locator('#questAssistant').evaluate('(el)=>el.style.getPropertyValue("--qa-look-x").replace("px","")'))<0
 page.locator('#qaOpen').click();page.wait_for_function('document.querySelector("#qaMode").textContent==="Workspace helper"');assert page.locator('#questAssistant').evaluate('(el)=>el.style.getPropertyValue("--qa-look-x")===""')
 # Explicit play actions and typed/voice-transcribed commands need no paid call.
 page.locator('#qaPlay').click();assert page.locator('#qaPlayMenu').is_visible();page.locator('[data-qa-play=highfive]').click();assert page.locator('#qaPlayMenu').is_hidden();assert page.locator('#questAssistant').get_attribute('data-mood')=='highfive';assert 'High five!' in page.locator('#qaMessages').inner_text()
 assert page.locator('#qaCharacter .qa-arm-right').evaluate('(el)=>getComputedStyle(el).animationName')=='qa-highfive'
 page.locator('#qaDance').click();assert page.locator('#questAssistant').evaluate('(el)=>el.classList.contains("is-dancing")')
 page.locator('#qaPlay').click();page.locator('[data-qa-play=spin]').click();assert not page.locator('#questAssistant').evaluate('(el)=>el.classList.contains("is-dancing")');assert page.locator('#questAssistant').get_attribute('data-mood')=='spin'
 page.locator('#qaInput').fill('Q, stretch');page.locator('#qaSend').click();page.clock.run_for(30);assert page.locator('#questAssistant').get_attribute('data-mood')=='stretch'
 page.locator('#qaInput').fill('Thanks Q');page.locator('#qaSend').click();assert 'Anytime.' in page.locator('#qaMessages').inner_text();assert not any(method=='POST' for method in calls)
 # Celebration is triggered by a confirmed task completion, not a form draft.
 page.locator('#qaClose').click();page.evaluate("accessTest.navigate('myDay')");page.locator('#myDayDue [data-complete]').click();page.wait_for_function('document.querySelector("#myDayDue").textContent.includes("No tasks due today")');assert 'Another task done' in page.locator('#qaReaction').inner_text();assert page.locator('#questAssistant').get_attribute('data-mood')=='happy'
 assert 'Needle' not in page.locator('#qaReaction').inner_text();page.screenshot(path='/tmp/quest-q-celebration.png',animations='disabled')
 # Typing elsewhere hides hints; the long-idle stretch does not steal focus.
 page.locator('#qaReaction').click();assert page.locator('#qaPanel').is_visible();assert page.locator('#qaReaction').is_hidden();page.locator('#qaClose').click();page.evaluate("accessTest.navigate('search')");page.locator('#workflowSearchText').fill('Working draft');page.clock.run_for(120000);assert page.locator('#qaReaction').is_hidden();assert page.locator('#workflowSearchText').input_value()=='Working draft'
 page.locator('#workflowSearchText').blur();page.clock.run_for(300000);assert page.locator('#qaPanel').is_hidden()
 # A return greeting is local, silent, and clears across a role/account switch.
 page.evaluate('window.realHidden=Object.getOwnPropertyDescriptor(Document.prototype,"hidden");Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"));');page.clock.run_for(301000)
 page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,get:()=>false});document.dispatchEvent(new Event("visibilitychange"));');assert 'Welcome back' in page.locator('#qaReaction').inner_text()
 page.evaluate("accessTest.switchUser('josh')");page.wait_for_function('document.querySelector("#userName").textContent==="Josh"');assert page.locator('#qaReaction').is_hidden();assert not page.locator('#questAssistant').get_attribute('data-mood');assert 'Jen' not in page.locator('#qaMessages').inner_text()
 # Quiet preference persists; manual play remains available. Reduced motion wins.
 page.locator('#qaOpen').click();page.locator('#qaPlayful').uncheck();assert page.evaluate('localStorage.getItem("quest-assistant-playful")==="false"');page.locator('#qaClose').click();page.mouse.move(10,100);page.clock.run_for(400000);assert page.locator('#qaReaction').is_hidden();assert page.locator('#questAssistant').evaluate('(el)=>el.style.getPropertyValue("--qa-look-x")===""')
 page.reload();page.wait_for_function('window.qaTestReady&&!document.querySelector("#questAssistant").hidden');page.locator('#qaOpen').click();assert not page.locator('#qaPlayful').is_checked();page.locator('#qaPlay').click();page.locator('[data-qa-play=highfive]').click();assert page.locator('#questAssistant').get_attribute('data-mood')=='highfive'
 page.emulate_media(reduced_motion='reduce');page.locator('#qaPlay').click();page.locator('[data-qa-play=spin]').click();assert page.locator('#qaCharacter .qa-body').evaluate('(el)=>getComputedStyle(el).animationName')=='none'
 page.set_viewport_size({'width':320,'height':740});page.locator('#qaPlay').click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');box=page.locator('#qaSend').bounding_box();assert box['y']+box['height']<=740;page.locator('[data-qa-play=highfive]').click();figure=page.locator('.qa-play-figure').last.bounding_box();log=page.locator('#qaMessages').bounding_box();assert figure['y']>=log['y'] and figure['y']+figure['height']<=log['y']+log['height'];ids=page.locator('#questAssistant [id],#qaPanel [id]').evaluate_all('(nodes)=>nodes.map(n=>n.id)');assert len(ids)==len(set(ids));page.screenshot(path='/tmp/quest-q-play-phone.png',animations='disabled')
 assert not errors,errors;assert not any(method=='POST' for method in calls);browser.close()
print('PASS Q personality: local high-five/spin/stretch, cursor attention, confirmed task celebrations, quiet while typing, return greeting, role reset, persistent quiet preference, no paid calls, reduced motion and mobile play controls.')

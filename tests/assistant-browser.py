"""Q's figure, dances and workspace/AI interactions with scoped fixtures."""
from pathlib import Path
import datetime,mimetypes,json
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';","const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture='\n'.join((root/'tests'/name).read_text() for name in ['member-access-fixture.js','private-chats-fixture.js','daily-workflow-fixture.js']).replace('</script','<\\/script')
fixture+="\ndb.auth={getSession:async()=>({data:{session:{access_token:'test-session-'+user.id+'-01234567890123456789'}}})};window.qaTestReady=true;"
html=html.replace('</script></body>',fixture+'</script></body>')
state={'enabled':True,'fail':False,'hold':False,'pending':[],'calls':[],'issue':None}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']);context=browser.new_context(viewport={'width':1280,'height':1000},timezone_id='Africa/Johannesburg');page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.clock.install(time=datetime.datetime(2026,10,22,10,tzinfo=datetime.timezone.utc))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url=='http://dashboard.test/api/assistant':
   state['calls'].append({'method':r.request.method,'headers':r.request.headers,'body':r.request.post_data_json if r.request.method=='POST' else None})
   if r.request.method=='GET':return r.fulfill(json={'configured':state['enabled']})
   if state['hold']:state['pending'].append(r);return
   if state['issue']:return r.fulfill(status=503,json=state['issue'])
   if not state['enabled']:return r.fulfill(status=503,json={'code':'assistant_not_configured','message':'AI chat needs setup by the dashboard owner.'})
   if state['fail']:return r.fulfill(status=502,json={'message':'AI could not answer right now.'})
   return r.fulfill(json={'reply':'Let’s prepare a fitting task. <script>unsafe()</script>','actions':[{'type':'draft_task','project_id':'fragile','title':'Prepare fitting samples','date':'2026-10-23','notes':None}]})
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/')
   if path.name in ['home.js','d3.min.js']:return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.qaTestReady&&!document.querySelector("#questAssistant").hidden')
 assert page.locator('#qaCharacter svg').is_visible();assert page.locator('#qaPanel').is_hidden();assert not state['calls']
 assert page.locator('.qa-icon svg').count()==1 and page.locator('#qaRestore svg').count()==1
 ids=page.locator('#questAssistant [id],#qaPanel [id]').evaluate_all('(items)=>items.map(item=>item.id)');assert len(ids)==len(set(ids))
 page.screenshot(path='/tmp/quest-q-avatar.png',full_page=False,animations='disabled')
 page.locator('#qaOpen').click();page.wait_for_function('document.querySelector("#qaMode").textContent==="AI chat configured"')
 page.locator('#qaMyDay').click();assert 'assigned task' in page.locator('#qaMessages').inner_text();assert 'Dusted private task' not in page.locator('#qaMessages').inner_text()
 page.locator('#qaDance').click();assert page.locator('#questAssistant').evaluate('(el)=>el.classList.contains("is-dancing")')
 assert page.locator('#qaCharacter .qa-arm-right').evaluate('(el)=>getComputedStyle(el).animationName')=='qa-dance-right'
 page.locator('#qaDance').click()
 page.locator('#qaInput').fill('Help me prepare for tomorrow');page.locator('#qaSend').click();page.wait_for_function('document.querySelector("#qaMessages").textContent.includes("fitting task")')
 assert page.locator('#qaMessages script').count()==0;assert '<script>unsafe()</script>' in page.locator('#qaMessages').inner_text()
 post=next(c for c in state['calls'] if c['method']=='POST');assert post['headers']['authorization'].startswith('Bearer test-session-jen');assert set(post['body'])=={'message','history'}
 assert not page.evaluate('workflowTest.writes.some(w=>w.table==="tasks")')
 page.locator('#qaMessages').get_by_role('button',name='Review task').click();assert page.locator('#entryDialog').is_visible();assert page.locator('#field-title').input_value()=='Prepare fitting samples';assert page.locator('#field-project_id').input_value()=='fragile';assert page.locator('#field-due_date').input_value()=='2026-10-23';page.locator('#cancelDialog').click()
 page.locator('#qaOpen').click();state['fail']=True;page.locator('#qaInput').fill('Keep my question');page.locator('#qaSend').click();page.wait_for_function('document.querySelector("#qaStatus").textContent.includes("could not answer")');assert page.locator('#qaInput').input_value()=='Keep my question';state['fail']=False
 page.locator('#qaInput').fill('open members');page.locator('#qaSend').click();assert 'not available to your account' in page.locator('#qaMessages').inner_text()
 state['enabled']=False;page.locator('#qaInput').fill('Can we plan the week?');page.locator('#qaSend').click();page.wait_for_function('document.querySelector("#qaMode").textContent==="Workspace helper"');assert 'needs setup' in page.locator('#qaStatus').inner_text();assert page.locator('#qaInput').input_value()=='Can we plan the week?'
 page.locator('#qaInput').fill('');page.locator('#qaClose').click()
 box=page.locator('#qaCharacter').bounding_box();start=box['x'];page.mouse.move(start+box['width']/2,box['y']+80);page.mouse.down();page.mouse.move(start-200,box['y']+80,steps=12);page.mouse.up();assert page.locator('#questAssistant').bounding_box()['x']<start;assert page.locator('#qaPanel').is_hidden()
 page.locator('#qaMinimise').click();assert page.locator('#qaCharacter').is_hidden();assert page.locator('#qaRestore').is_visible()
 page.set_viewport_size({'width':320,'height':740});page.locator('#qaRestore').click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.locator('#qaOpen').click();box=page.locator('#qaPanel').bounding_box();assert box['x']>=0 and box['x']+box['width']<=320 and box['y']+box['height']<=741
 page.locator('#qaDance').click();assert page.locator('#qaPanel').is_hidden();assert page.locator('#questAssistant').evaluate('(el)=>el.classList.contains("is-dancing")');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.locator('#qaOpen').click();page.locator('#qaSpeak').check();state['enabled']=True;state['hold']=True;page.locator('#qaInput').fill('Old Fragile private question');page.locator('#qaSend').click();page.wait_for_function('document.querySelector("#qaSend").disabled')
 page.evaluate("accessTest.switchUser('josh')");page.wait_for_function('document.querySelector("#userName").textContent==="Josh"');assert page.locator('#qaPanel').is_hidden();assert 'Old Fragile private' not in page.locator('#qaMessages').inner_text();assert not page.locator('#qaSpeak').is_checked()
 for pending in state['pending']:
  try:pending.fulfill(json={'reply':'Old private reply','actions':[]})
  except Exception:pass
 state['hold']=False;page.locator('#qaOpen').click();assert 'Old private reply' not in page.locator('#qaMessages').inner_text();assert page.locator('#qaInput').input_value()==''
 page.screenshot(path='/tmp/quest-q-chat-phone.png',animations='disabled')
 page.locator('#qaInput').fill('Keep this keyboard draft');page.evaluate("document.documentElement.style.setProperty('--quest-viewport-height','300px')");page.wait_for_function('document.querySelector("#qaPanel").classList.contains("is-compact")');box=page.locator('#qaSend').bounding_box();assert box['y']+box['height']<=301;assert page.locator('#qaInput').input_value()=='Keep this keyboard draft';page.evaluate("dispatchEvent(new Event('resize'))")
 page.locator('#qaInput').fill('My offline question');context.set_offline(True);page.locator('#qaSend').click();assert page.locator('#qaInput').input_value()=='My offline question';assert 'offline' in page.locator('#qaStatus').inner_text();context.set_offline(False)
 # Billing failures give the owner a safe, fixed billing link and preserve the
 # question. Retrying after credits are added sends the same question once.
 page.evaluate("accessTest.switchUser('quan')");page.locator('#qaOpen').click();state['issue']={'code':'ai_billing_required','message':'OpenAI API credits or a usage limit need attention. Check API billing, then retry.','help':'billing'}
 page.locator('#qaInput').fill('Help me plan tomorrow');page.locator('#qaSend').click();page.wait_for_function('document.querySelector("#qaMode").textContent==="AI setup needs attention"')
 assert page.locator('#qaHelp').is_visible();assert page.locator('#qaHelp').get_attribute('href')=='https://platform.openai.com/settings/organization/billing/overview'
 assert page.locator('#qaInput').input_value()=='Help me plan tomorrow'
 page.evaluate("document.documentElement.style.setProperty('--quest-viewport-height','300px')");page.wait_for_function('document.querySelector("#qaPanel").classList.contains("is-compact")')
 box=page.locator('#qaRetry').bounding_box();assert box['y']+box['height']<=301;box=page.locator('#qaSend').bounding_box();assert box['y']+box['height']<=301
 page.screenshot(path='/tmp/quest-q-billing-phone.png',animations='disabled')
 state['issue']=None;page.locator('#qaRetry').click();page.wait_for_function('document.querySelector("#qaMode").textContent==="AI chat connected"')
 assert page.locator('#qaMessages [data-role=user]').count()==1;assert page.locator('#qaInput').input_value()=='';assert page.locator('#qaRecovery').is_hidden();page.evaluate("dispatchEvent(new Event('resize'))")
 page.evaluate("accessTest.switchUser('josh')");page.locator('#qaOpen').click();state['issue']={'code':'ai_billing_required','message':'Ask the dashboard owner to check API billing.','help':'billing'}
 page.locator('#qaInput').fill('Help with my work');page.locator('#qaSend').click();page.wait_for_function('document.querySelector("#qaRecovery").hidden===false');assert page.locator('#qaHelp').is_hidden()
 page.locator('#qaClose').click()
 page.emulate_media(reduced_motion='reduce');assert page.locator('#qaCharacter .qa-body').evaluate('(el)=>getComputedStyle(el).animationName')=='none'
 assert not errors,errors
 browser.close()
print('PASS Q assistant: original chibi figure and portraits, dance/drag/minimise, mobile and keyboard layout, scoped shortcuts and AI drafts, safe rendering, actionable owner-only billing help, preserved/retried questions, honest connection state, offline/account isolation and reduced motion. AI replies are fixtures.')

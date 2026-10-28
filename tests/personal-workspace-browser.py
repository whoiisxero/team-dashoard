"""Cas’s actual private workspace UI with account-scoped mock transport."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture=(root/'tests/member-access-fixture.js').read_text()+(root/'tests/personal-workspace-fixture.js').read_text()
html=html.replace('</script></body>',fixture.replace('</script','<\\/script')+'</script></body>')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1280,'height':1000},timezone_id='Africa/Johannesburg');errors=[]
 page.on('pageerror',lambda e:(errors.append(str(e)),print('Browser error:',str(e))))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/')
   if path.name in ('home.js','d3.min.js'):return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.personalReady&&document.querySelector("#personalSetup").classList.contains("active")')
 for view in ['projects','tasks','dashboard','discussions','calendar','expenses','goals','members','files','search','activity','trading']:
  assert page.locator('.sidebar [data-view='+view+']').is_hidden(),view
  page.evaluate('(v)=>accessTest.navigate(v)',view)
  assert not page.locator('#'+view).evaluate('(el)=>el.classList.contains("active")'),view
 assert page.locator('#fragileShortcut').is_hidden();assert page.locator('#lodenShortcut').is_hidden();assert page.locator('#dustedShortcut').is_hidden()
 page.locator('#personalPreferredName').fill('Cas');page.locator('#personalBusinessName').fill('Nirvana');page.locator('#personalWelcomeText').fill('A space for my ideas.');page.locator('#personalTheme').select_option('violet');page.locator('#personalTextSize').select_option('large');page.locator('#personalSetupSave').click()
 page.wait_for_function('document.querySelector("#personalHome").classList.contains("active")')
 assert page.locator('#personalWelcome').inner_text()=='Welcome back, Cas'
 assert page.evaluate('document.documentElement.dataset.theme')=='violet'
 assert page.locator('#personalWelcomeNote').inner_text()=='A space for my ideas.'
 assert page.locator('#personalWritingCount').inner_text()=='1'
 page.wait_for_function('document.querySelectorAll("#privateChatNav button").length===1')
 assert page.locator('#privateChatNav .nav-title').text_content()=='Quan & Cas'
 page.locator('#personalChatButton').click();page.wait_for_function('document.querySelector("#privateChatMessages").textContent.includes("Welcome to your space")')
 assert 'Quan' in page.locator('#privateChatParticipants').inner_text();assert page.locator('#privateChatSend').is_enabled()
 page.locator('#privateChatText').fill('Hello Quan, this is my private chat.');page.locator('#privateChatSend').click()
 page.wait_for_function('accessTest.personal.writes.some(w=>w.table==="private_chat_messages")')
 page.locator('.sidebar [data-view=writing]').click();assert 'Private thoughts' in page.locator('#writingList').inner_text()
 page.locator('#writingNew').click();page.locator('#personalNoteTitle').fill('New writing');page.locator('#personalNoteBody').fill('My personal writing <script>never run</script>');page.evaluate('accessTest.personal.failSave=true');page.locator('#personalNoteSave').click()
 page.wait_for_function('document.querySelector("#personalNoteState").textContent.includes("Save not confirmed")')
 assert page.locator('#personalNoteBody').input_value().startswith('My personal writing')
 page.evaluate('accessTest.personal.failSave=false');page.locator('#personalNoteSave').click();page.wait_for_function('!document.querySelector("#personalNoteDialog").open')
 assert '<script>never run</script>' in page.locator('#writingList').inner_text()
 assert page.locator('#writingList script').count()==0
 page.locator('.sidebar [data-view=business]').click();page.locator('#businessNew').click();page.locator('#personalNoteTitle').fill('Follow up');page.locator('#personalNoteBody').fill('Prepare a business update');page.locator('#personalNoteDue').fill('2026-10-30T10:00');page.locator('#personalNoteReminder').fill('2026-10-30T09:00');page.locator('#personalNoteSave').click()
 page.wait_for_function('!document.querySelector("#personalNoteDialog").open')
 args=page.evaluate('accessTest.personal.writes.filter(w=>w.rpc==="quest_save_personal_note").at(-1).args')
 assert args['note_kind']=='business' and args['zone']=='Africa/Johannesburg' and args['remind_local']=='2026-10-30T09:00'
 assert 'Follow up' in page.locator('#businessList').inner_text()
 page.locator('#businessSearch').fill('Client');assert 'Follow up' not in page.locator('#businessList').inner_text();page.locator('#businessSearch').fill('')
 page.evaluate("accessTest.navigate('overview')");assert page.locator('#personalHome').is_visible()
 page.set_viewport_size({'width':390,'height':844});page.wait_for_function('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/quest-cas-home.png',full_page=True)
 page.evaluate("accessTest.personal.delay=true;accessTest.navigate('writing')")
 page.wait_for_function('accessTest.personal.pending.length>0')
 page.evaluate("accessTest.switchUser('tertius')");page.wait_for_function('document.querySelector("#userName").textContent==="Tertius"')
 page.evaluate('accessTest.personal.release()')
 assert page.locator('#writingList').inner_text()==''
 assert page.locator('.sidebar [data-view=writing]').is_hidden()
 assert not page.evaluate('document.body.classList.contains("personal-large")')
 assert not errors,errors
 b.close();print('PASS Cas browser: personalised onboarding, private home, excluded team/project views, owner-only room, writing and retry recovery, business reminders, escaped text, mobile layout and stale-account isolation.')

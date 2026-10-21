"""Actual dashboard with scoped transport fixtures; no live accounts or writes."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture=(root/'tests/member-access-fixture.js').read_text()
html=html.replace('</script></body>',fixture+'</script></body>')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1280,'height':1000});errors=[];page.on('pageerror',lambda e:(errors.append(str(e)),print('Browser error:',str(e))))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/')
   if path.name in ('home.js','d3.min.js'):return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.ready')
 page.locator('.sidebar [data-view=members]').click();page.wait_for_function('document.querySelectorAll(".member-access-card").length===3')
 assert page.locator('.online-member').count()==3
 assert 'Online' in page.locator('.online-member').filter(has_text='Quan').inner_text()
 assert page.locator('#membersOnlineCount').inner_text()=='2'
 # Existing projects without the new RPC can still use the original own-row check.
 page.evaluate("accessTest.profileRpcMissing=true;accessTest.switchUser('quan')")
 page.wait_for_function('!document.querySelector("#appShell").hidden')
 page.evaluate('accessTest.profileRpcMissing=false')
 page.locator('.sidebar [data-view=members]').click();page.wait_for_function('document.querySelectorAll(".member-access-card").length===3')
 owner=page.locator('[data-member-id=quan]');assert owner.locator('select').count()==0
 t=page.locator('[data-member-id=tertius]');assert not t.locator('[value=dusted]').is_checked()
 t.locator('select').select_option('selected');t.locator('[name=shared]').uncheck();t.get_by_role('button',name='Save access').click()
 page.wait_for_function('accessTest.writes.some(w=>w.rpc==="set_member_access")')
 saved=page.evaluate('accessTest.writes.find(w=>w.rpc==="set_member_access").args')
 assert saved=={'target':'tertius','mode':'selected','shared':False,'allowed_projects':['fragile','loden']}

 page.evaluate("accessTest.profiles.tertius.shared_access=true;accessTest.switchUser('tertius')")
 page.wait_for_function('document.querySelector("#dustedShortcut").hidden')
 assert page.locator('#dustedPrivateChatShortcut').is_hidden()
 assert page.locator('#fragileShortcut').is_visible()
 page.evaluate("accessTest.navigate('dusted')")
 assert not page.locator('#dusted').evaluate('(el)=>el.classList.contains("active")')
 page.locator('.sidebar [data-view=projects]').click()
 assert 'Dusted.' not in page.locator('#allProjects').inner_text()
 assert page.locator('.sidebar [data-view=members]').is_hidden()
 page.evaluate("accessTest.navigate('members')")
 assert page.locator('#members').is_hidden()
 assert page.locator('#memberAccessList').inner_text()==''
 assert page.locator('#onlineMemberList').inner_text()==''

 # Own-profile lookup still signs in when the general roster is hidden by RLS.
 page.evaluate("accessTest.hideRoster=true;accessTest.switchUser('josh')");page.wait_for_function('!document.querySelector("#dustedPrivateChatShortcut").hidden')
 assert page.locator('#userName').inner_text()=='Josh'
 assert page.locator('#appShell').is_visible()
 page.evaluate('accessTest.hideRoster=false;accessTest.refresh()')
 assert page.locator('#fragileShortcut').is_hidden()
 assert page.locator('.sidebar [data-view=members]').is_hidden()
 assert page.locator('.sidebar [data-view=discussions]').is_hidden()
 page.locator('.sidebar [data-view=projects]').click()
 assert page.locator('#allProjects .project-card').count()==1
 assert 'Dusted.' in page.locator('#allProjects').inner_text()
 page.locator('#dustedPrivateChatShortcut').click();page.wait_for_function('document.querySelector("#dustedMessages").textContent.includes("Dusted owner")')
 assert page.locator('#dustedChatPanel .fragile-toolbar h2').inner_text()=='Dusted. team chat'
 assert 'Fragile private team' not in page.locator('#dustedMessages').inner_text()
 page.locator('#dustedChatText').fill('Josh private message');page.locator('#dustedChatSend').click()
 page.wait_for_function('accessTest.writes.some(w=>w.table==="brand_messages")')
 assert page.evaluate('accessTest.writes.find(w=>w.table==="brand_messages").values')=={'body':'Josh private message','user_id':'josh','project_id':'dusted'}
 page.locator('.sidebar [data-view=calendar]').click();page.locator('#calendar [data-add=calendar]').click()
 assert page.locator('#field-project_id').input_value()=='dusted'
 assert page.locator('#field-project_id option').count()==1
 assert page.locator('#field-project_id').get_attribute('required') is not None
 page.locator('#cancelDialog').click()
 page.locator('.sidebar [data-view=dashboard]').click()
 assert page.locator('#recentMessages').is_hidden();assert page.locator('#budgetSpent').is_hidden()
 page.locator('#dustedPrivateChatShortcut').click();page.wait_for_function('document.querySelector("#dustedMessages").textContent.includes("Josh private message")')
 # Revocation clears open private views/cached chat and closes dialogs.
 page.evaluate("accessTest.rules.josh=[];accessTest.refresh()")
 page.wait_for_function('document.querySelector("#overview").classList.contains("active")')
 assert page.locator('#dustedMessages').inner_text()==''
 assert page.locator('#dustedPrivateChatShortcut').is_hidden()
 page.evaluate('accessTest.failAccess=true;accessTest.refresh()')
 page.wait_for_function('!document.querySelector("#teamAccessNotice").hidden')
 assert page.locator('.sidebar [data-view=projects]').is_hidden()
 assert page.locator('.sidebar [data-view=members]').is_hidden()
 assert page.evaluate('accessTest.presenceReads.every(id=>id==="quan")')
 assert page.evaluate('accessTest.heartbeats.includes("tertius")&&accessTest.heartbeats.includes("josh")')
 page.evaluate("accessTest.failAccess=false;accessTest.switchUser('quan')")
 page.wait_for_function('!document.querySelector(".sidebar [data-view=members]").hidden')
 page.locator('.sidebar [data-view=members]').click()
 page.evaluate('accessTest.failPresence=true');page.locator('#membersRefresh').click()
 page.wait_for_function('document.querySelector("#membersOnlineLabel").textContent==="Status unavailable"')
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/quest-members.png',full_page=True)
 assert not errors,errors
 b.close();print('PASS browser: owner-only Members page, direct navigation blocked, no non-owner presence reads, working member heartbeats, permissions editor, project scopes, private chat, revocation, setup errors and mobile layout.')

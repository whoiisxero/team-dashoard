"""Exercise the actual inbox UI with a simulated Supabase transport."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
html=html.replace('</script></body>',(root/'tests/notifications-fixture.js').read_text().replace('</script', '<\\/script')+'</script></body>')
from full_access_fixture import full_access_fixture
html=full_access_fixture(html)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1280,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/')
   if path.name in ('home.js','d3.min.js'):return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.ready&&document.querySelector("#notificationBadge").textContent==="55"')
 assert page.locator('.notification-item').count()==50
 assert 'Private other inbox' not in page.locator('#notificationList').inner_text()
 assert page.locator('.notification-item').first.locator('span').inner_text()=='Casting <script>alert(1)</script>'
 page.locator('#notificationsMore').click();page.wait_for_function('document.querySelectorAll(".notification-item").length===55')
 page.locator('.notification-item .button').first.click();page.wait_for_function('document.querySelector("#notificationBadge").textContent==="54"')
 page.locator('.notification-open').first.click();page.locator('#entryDialog').wait_for(state='visible')
 assert page.locator('#field-detail').input_value()=='Bring portfolio'
 assert page.locator('#field-detail').is_disabled();page.locator('#cancelDialog').click()
 page.locator('#notificationBell').click();page.locator('#notificationsMarkAll').click();page.wait_for_function('document.querySelector("#notificationBadge").hidden')
 # Re-fetching preserves read state. New remote activity is shown on realtime refresh.
 page.locator('#notificationsRefresh').click();assert page.locator('.notification-item.unread').count()==0
 page.evaluate("inboxTest.data.push({...inboxTest.data[0],id:'new',item_title:'Changed event',created_at:'2026-10-18T12:00:00Z',read_at:null});inboxTest.emit()")
 page.wait_for_function('document.querySelector("#notificationBadge").textContent==="1"')
 page.evaluate('inboxTest.failWrite=true');page.locator('.notification-item .button').first.click();page.wait_for_function('document.querySelector("#toast").textContent.includes("Could not mark")')
 assert page.locator('#notificationBadge').inner_text()=='1'
 page.evaluate("inboxTest.error='PGRST205'");page.locator('#notificationsRefresh').click();page.wait_for_function('document.querySelector("#notificationStatus").textContent.includes("database setup")');assert page.locator('#notificationEmpty').is_hidden()
 page.evaluate("inboxTest.error=null;inboxTest.failWrite=false;inboxTest.switchUser('tertius')")
 page.wait_for_function('document.querySelectorAll(".notification-item").length===1')
 assert page.locator('#notificationList').inner_text().find('Private other inbox')>=0
 assert 'Casting' not in page.locator('#notificationList').inner_text()
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/quest-notifications.png',full_page=True)
 assert not errors,errors
 b.close();print('PASS inbox: unread counts, paging, escaping, mark one/all, read persistence, event linking/notes, realtime refresh, failed writes, missing migration state, account isolation and mobile layout.')

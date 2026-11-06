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
 page=b.new_page(viewport={'width':1280,'height':900});errors=[];page.on('pageerror',lambda e:(errors.append(str(e)),print('Browser error:',e,flush=True)))
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
 # Restore the previous bulk action after restarting the inbox, without restoring earlier reads.
 page.evaluate('inboxTest.restart()');page.wait_for_function('!document.querySelector("#notificationsUndoBar").hidden')
 page.evaluate('inboxTest.failWrite=true');page.locator('#notificationsUndo').click();page.wait_for_function('document.querySelector("#toast").textContent.includes("Could not restore")');assert page.locator('#notificationBadge').is_hidden()
 page.evaluate('inboxTest.failWrite=false');page.locator('#notificationsUndo').click();page.wait_for_function('document.querySelector("#notificationBadge").textContent==="54"');assert page.evaluate('inboxTest.data.find(r=>r.id==="054").read_at')
 page.locator('#notificationsMarkAll').click();page.wait_for_function('document.querySelector("#notificationBadge").hidden')
 # Re-fetching preserves read state. New remote activity is shown on realtime refresh.
 page.locator('#notificationsRefresh').click();assert page.locator('.notification-item.unread').count()==0
 page.evaluate("const row={...inboxTest.data[0],id:'new',source_table:'brand_messages',actor_name:'Josh',item_title:'Post · Dusted launch',created_at:'2026-10-18T12:00:00Z',read_at:null};inboxTest.data.push(row);inboxTest.emit({eventType:'INSERT',new:row})")
 page.wait_for_function('document.querySelector("#notificationBadge").textContent==="1"');page.wait_for_function('document.querySelector("#toast").textContent==="New message from Josh"');assert 'Dusted launch' in page.locator('#notificationList').inner_text()
 # Undo must leave a message arriving afterwards unread, and never alter the other inbox.
 page.locator('#notificationsUndo').click();page.wait_for_function('document.querySelector("#notificationBadge").textContent==="55"');assert page.evaluate('inboxTest.data.find(r=>r.id==="new").read_at') is None;assert page.evaluate('inboxTest.data.find(r=>r.id==="other").read_at') is None
 page.locator('#notificationsMarkAll').click();page.wait_for_function('document.querySelector("#notificationBadge").hidden');page.locator('.notification-item').filter(has_text='Dusted launch').get_by_role('button',name='Mark unread',exact=True).click();page.wait_for_function('document.querySelector("#notificationBadge").textContent==="1"')
 page.evaluate('inboxTest.failWrite=true');page.locator('.notification-item .button').first.click();page.wait_for_function('document.querySelector("#toast").textContent.includes("Could not mark")')
 assert page.locator('#notificationBadge').inner_text()=='1'
 page.evaluate("inboxTest.error='PGRST205'");page.locator('#notificationsRefresh').click();page.wait_for_function('document.querySelector("#notificationStatus").textContent.includes("database setup")');assert page.locator('#notificationEmpty').is_hidden()
 page.evaluate("inboxTest.error=null;inboxTest.failWrite=false;inboxTest.switchUser('tertius')")
 page.wait_for_function('document.querySelectorAll(".notification-item").length===1')
 assert page.locator('#notificationList').inner_text().find('Private other inbox')>=0
 assert 'Casting' not in page.locator('#notificationList').inner_text()
 assert page.locator('#notificationsUndoBar').is_hidden()
 page.evaluate('inboxTest.seedCategories()');page.wait_for_function('document.querySelectorAll(".notification-item").length===6')
 assert page.locator('.notification-group h2').all_text_contents()==['Dusted.','Fragile','Private chats','Team chat','My calendar']
 assert 'Other account secret' not in page.locator('#notificationList').inner_text()
 page.locator('#notificationCategories').get_by_role('button',name='Dusted.',exact=True).click();assert page.locator('.notification-item').count()==2;assert 'Tasks' in page.locator('.notification-source').all_text_contents();assert page.locator('#notificationBadge').inner_text()=='6';assert page.locator('.notification-item.unread').count()==2
 page.locator('.notification-item .button').first.click();page.wait_for_function('document.querySelector("#notificationBadge").textContent==="5"');assert page.locator('.notification-group>header small').inner_text()=='2 updates · 1 unread'
 page.locator('#notificationCategories').get_by_role('button',name='Private chats',exact=True).click();assert page.locator('.notification-item').count()==1;assert 'Private conversation' in page.locator('#notificationList').inner_text()
 page.evaluate("inboxTest.switchUser('tertius')");page.wait_for_function('document.querySelectorAll(".notification-item").length===1');assert 'Dusted.' not in page.locator('#notificationCategories').inner_text();assert page.locator('#notificationCategories button').first.get_attribute('aria-pressed')=='true'
 page.evaluate('inboxTest.seedCategories()');page.wait_for_function('document.querySelectorAll(".notification-item").length===6')
 # Unread filtering is applied before pagination: an old unread item cannot be hidden by recent reads.
 page.evaluate("inboxTest.data=Array.from({length:60},(_,i)=>({id:'read-'+i,recipient_id:'quan',actor_name:'Josh',source_table:'tasks',source_id:'s',action:'INSERT',item_title:'Recent read update',created_at:new Date(Date.UTC(2026,9,30,0,i)).toISOString(),read_at:'2026-11-01T00:00:00Z'}));inboxTest.data.push({id:'old-unread',recipient_id:'quan',actor_name:'Josh',source_table:'discussion_messages',source_id:'s',action:'INSERT',item_title:'Old unread message',created_at:'2000-01-01T00:00:00Z',read_at:null});inboxTest.restart()")
 page.wait_for_function('document.querySelectorAll(".notification-item").length===50');assert 'Old unread message' not in page.locator('#notificationList').inner_text();page.locator('#notificationsUnreadOnly').click();page.wait_for_function('document.querySelectorAll(".notification-item").length===1');assert 'Old unread message' in page.locator('#notificationList').inner_text()
 page.locator('.notification-item').get_by_role('button',name='Mark as read',exact=True).click();page.wait_for_function('!document.querySelector("#notificationEmpty").hidden');assert page.locator('#notificationBadge').is_hidden();assert 'No unread notifications' in page.locator('#notificationEmpty').inner_text()
 page.locator('#notificationsUnreadOnly').click();page.evaluate('inboxTest.seedCategories()');page.wait_for_function('document.querySelectorAll(".notification-item").length===6')
 # Old actor/room snapshots and new popups use neutral labels, without deleting updates.
 page.evaluate("""inboxTest.data=[
 {id:'retired-actor',actor_id:'5c9e7be8-1956-47aa-8449-d482851edac9',actor_name:'Jen',project_id:'fragile',source_table:'brand_messages',item_title:'Jen’s collection plans'},
 {id:'retired-room',actor_id:'quan',actor_name:'Quan',source_table:'private_chat_messages',item_title:'Quan & Jen'},
 {id:'retired-name',actor_id:'old-account',actor_name:'Jen',source_table:'brand_moodboard_items',item_title:'Moodboard reference'},
 {id:'different-name',actor_id:'jennifer',actor_name:'Jennifer',source_table:'tasks',item_title:'Jensen review'}
 ].map((r,i)=>({recipient_id:'quan',source_id:'source',action:'INSERT',created_at:new Date(Date.UTC(2099,0,10-i)).toISOString(),read_at:null,...r}));inboxTest.restart()""")
 page.wait_for_function('document.querySelectorAll(".notification-item").length===4');assert page.locator('#notificationBadge').inner_text()=='4'
 assert 'Fragile collaborator sent brand message' in page.locator('#notificationList').inner_text();assert 'Fragile collaborator’s collection plans' in page.locator('#notificationList').inner_text();assert 'Private conversation' in page.locator('#notificationList').inner_text();assert 'Quan & Jen' not in page.locator('#notificationList').inner_text();assert 'Jen added' not in page.locator('#notificationList').inner_text();assert 'Jennifer added task' in page.locator('#notificationList').inner_text();assert 'Jensen review' in page.locator('#notificationList').inner_text()
 assert page.evaluate('inboxTest.data.find(r=>r.id==="retired-actor").actor_name')=='Jen'
 page.locator('.notification-item').filter(has_text='collection plans').get_by_role('button',name='Mark as read',exact=True).click();page.wait_for_function('document.querySelector("#notificationBadge").textContent==="3"');assert page.evaluate('inboxTest.data.find(r=>r.id==="retired-actor").read_at')
 page.evaluate("const row={...inboxTest.data[0],id:'retired-live',actor_name:'Old account label',item_title:'Jen replied',created_at:'2099-02-01T00:00:00Z',read_at:null};inboxTest.data.push(row);inboxTest.emit({eventType:'INSERT',new:row})")
 page.wait_for_function('document.querySelector("#toast").textContent==="New message from Fragile collaborator"');assert 'Old account label' not in page.locator('#notificationList').inner_text();assert 'Fragile collaborator replied' in page.locator('#notificationList').inner_text();assert page.locator('#notificationBadge').inner_text()=='4'
 page.set_viewport_size({'width':390,'height':844});page.wait_for_function('document.querySelector("#sidebar").getBoundingClientRect().right<=0');page.wait_for_function('!document.querySelector("#toast").classList.contains("show")');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/quest-notifications.png',full_page=True)
 assert not errors,errors
 b.close();print('PASS inbox: neutral retired actor/room names in old updates and realtime popups, preserved notifications/read state, bulk undo and recovery, per-item unread restore, failed restore, new-message preservation, unread pagination, source groups and filters, per-category unread counts, account reset privacy, unread totals, paging, escaping, mark one/all, read persistence, event linking/notes, realtime refresh, failed writes, missing migration state, account isolation and mobile layout.')

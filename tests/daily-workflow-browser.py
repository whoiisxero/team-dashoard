"""Daily tools with scoped transport fixtures and phone file selection."""
from pathlib import Path
import mimetypes,datetime,base64
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';","const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture='\n'.join((root/'tests'/name).read_text() for name in ['member-access-fixture.js','private-chats-fixture.js','daily-workflow-fixture.js']).replace('</script','<\\/script')
html=html.replace('</script></body>',fixture+'</script></body>')
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']);page=b.new_page(viewport={'width':1280,'height':1000},timezone_id='Africa/Johannesburg');errors=[];page.on('pageerror',lambda e:(errors.append(str(e)),print('Browser error:',e)))
 page.clock.install(time=datetime.datetime(2026,10,21,22,30,tzinfo=datetime.timezone.utc))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/')
   if path.name in ['home.js','d3.min.js']:return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.workflowReady&&document.querySelectorAll("#privateChatNav button").length===1')
 page.locator('.sidebar [data-view=myDay]').click()
 assert '22 October 2026' in page.locator('#myDayDate').inner_text();assert 'Africa/Johannesburg' in page.locator('#myDayDate').inner_text()
 assert 'Needle fitting prep' in page.locator('#myDayDue').inner_text();assert 'Needle overdue fabric' in page.locator('#myDayOverdue').inner_text()
 assert 'Needle New York call' in page.locator('#myDayEvents').inner_text();assert 'Tokyo previous day' not in page.locator('#myDayEvents').inner_text()
 assert 'Dusted private' not in page.locator('#myDayAssigned').inner_text()
 page.locator('#myDayDue [data-complete]').click();page.wait_for_function('document.querySelector("#myDayDue").textContent.includes("No tasks due today")')
 page.locator('.sidebar [data-view=notifications]').click();page.wait_for_function('document.querySelector("#notificationList").textContent.includes("Reminder")')
 assert 'Reminder · task' in page.locator('#notificationList').inner_text()
 page.locator('#remindersEnabled').uncheck();page.locator('#reminderTimeZone').fill('America/New_York');page.locator('#reminderSave').click()
 page.wait_for_function('workflowTest.writes.some(w=>w.table==="notification_preferences")')
 prefs=page.evaluate('workflowTest.writes.find(w=>w.table==="notification_preferences").values');assert prefs['user_id']=='jen' and not prefs['enabled'] and prefs['time_zone']=='America/New_York'
 page.locator('.sidebar [data-view=files]').click();page.wait_for_function('document.querySelectorAll("#filesList .workflow-file").length===1')
 assert 'Needle photo.png' in page.locator('#filesList').inner_text();assert 'Dusted private' not in page.locator('#filesList').inner_text()
 page.locator('#filesList').get_by_role('button',name='Preview').click();page.wait_for_function('document.querySelector("#filesList img")?.complete')
 page.locator('#filesUpload').click();page.locator('#fileUploadInput').set_input_files({'name':'Phone reference.png','mimeType':'image/png','buffer':png});page.locator('#fileUploadMoodboard').check();page.locator('#fileUploadSave').click();page.locator('#fileUploadDialog').wait_for(state='hidden')
 assert page.evaluate('workflowTest.writes.find(w=>w.table==="project_files").values.moodboard')
 assert page.evaluate('workflowTest.writes.find(w=>w.storage==="upload").options.cacheControl')=='0'
 page.locator('#fragileShortcut').click();page.locator('#fragile [data-studio-tab=board]').click();page.wait_for_function('document.querySelector("#fragileUploadedReferences").textContent.includes("Phone reference.png")')
 page.locator('#fragileUploadReference').click();page.locator('#fileUploadInput').set_input_files({'name':'Retry.png','mimeType':'image/png','buffer':png});page.evaluate('workflowTest.failMetadata=true');page.locator('#fileUploadSave').click();page.wait_for_function('document.querySelector("#fileUploadError").textContent.includes("Metadata save failed")')
 assert page.evaluate('workflowTest.removed.length')==1;assert page.locator('#fileUploadDialog').is_visible();assert page.locator('#fileUploadInput').input_value()
 page.evaluate('workflowTest.failMetadata=false');page.locator('#fileUploadSave').click();page.locator('#fileUploadDialog').wait_for(state='hidden')
 page.locator('.sidebar [data-view=search]').click();page.locator('#workflowSearchText').fill('Needle');page.locator('#workflowSearchForm button').click();page.wait_for_function('document.querySelectorAll("#workflowSearchResults .workflow-item").length===3')
 assert 'Dusted private' not in page.locator('#workflowSearchResults').inner_text();assert 'Private conversation' in page.locator('#workflowSearchResults').inner_text()
 page.locator('.sidebar [data-view=activity]').click();page.wait_for_function('document.querySelector("#activityList").textContent.includes("Quan updated")')
 assert 'Dusted private' not in page.locator('#activityList').inner_text()
 # Slow search responses cannot cross an account boundary.
 page.locator('.sidebar [data-view=search]').click();page.evaluate('workflowTest.delaySearch=true');page.locator('#workflowSearchText').fill('Needle');page.locator('#workflowSearchForm button').click();page.wait_for_function('workflowTest.pending.length>0')
 page.evaluate("accessTest.switchUser('josh')");page.wait_for_function('document.querySelector("#userName").textContent==="Josh"');page.evaluate('workflowTest.release()')
 assert page.locator('#workflowSearchResults').inner_text()==''
 page.locator('.sidebar [data-view=files]').click();page.wait_for_function('document.querySelector("#filesList").textContent.includes("Dusted private brief")')
 assert 'Phone reference' not in page.locator('#filesList').inner_text();assert page.locator('.sidebar [data-view=members]').is_hidden()
 # Setup errors are visible and never pretend that an empty dataset is success.
 page.evaluate('workflowTest.failBackend=true');page.locator('#filesRefresh').click();page.wait_for_function('document.querySelector("#filesStatus").textContent.includes("being set up")')
 assert page.locator('#filesList').inner_text()==''
 page.evaluate("workflowTest.failBackend=false;accessTest.switchUser('jen')");page.wait_for_function('document.querySelector("#userName").textContent==="Jen"')
 page.set_viewport_size({'width':390,'height':844});page.locator('#menuButton').click();page.locator('.sidebar [data-view=myDay]').click()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path='/tmp/quest-my-day-phone.png',full_page=True,animations='disabled')
 page.locator('#menuButton').click();page.locator('#signOut').scroll_into_view_if_needed();assert page.locator('#signOut').is_visible();page.locator('.sidebar [data-view=files]').click();page.locator('#filesUpload').click()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path='/tmp/quest-upload-phone.png',full_page=True,animations='disabled');page.locator('#fileUploadCancel').click()
 assert not errors,errors
 b.close();print('PASS daily workflow browser: My day in Johannesburg, cross-zone events, assigned/overdue tasks, reminders/preferences, scoped files, phone/moodboard uploads, preview, failed-metadata cleanup/retry, scoped search/activity, stale-account responses, setup errors and mobile navigation.')

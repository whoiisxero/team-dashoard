"""Private calendar CRUD, failure recovery, permissions and mobile layout."""
from pathlib import Path
from datetime import datetime, timezone
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture=''.join((root/'tests'/name).read_text() for name in ['member-access-fixture.js','personal-workspace-fixture.js','personal-calendar-fixture.js'])
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
 page.clock.set_fixed_time(datetime(2026,10,28,10,0,tzinfo=timezone.utc))
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.calendarReady&&document.querySelector("#personalCalendar").classList.contains("active")')
 page.wait_for_function('document.querySelector("#personalCalendarStatus").textContent.includes("Private to your account")')
 assert page.locator('.sidebar [data-view=personalCalendar]').is_visible()
 assert page.locator('.sidebar [data-view=writing]').is_visible()
 assert page.locator('.sidebar [data-view=business]').is_visible()
 assert page.locator('.sidebar [data-view=calendar]').is_hidden()
 # Click a concrete date and open the event form for that day.
 page.locator('[data-personal-date="2026-10-28"]').click()
 assert 'Private appointment' in page.locator('#personalCalendarDayEvents').inner_text()
 assert 'Owner confidential' not in page.locator('#personalCalendarDayEvents').inner_text()
 page.locator('[data-personal-date="2026-10-29"]').click();page.locator('#personalCalendarDayAdd').click()
 assert page.locator('#personalEventDate').input_value()=='2026-10-29'
 page.locator('#personalEventTitle').fill('Lunch <img src=x onerror=alert(1)>');page.locator('#personalEventLocation').fill('Nirvana, Cape Town');page.locator('#personalEventDetail').fill('Bring notes <script>never execute</script>')
 page.locator('#personalEventAllDay').uncheck();page.locator('#personalEventTime').fill('14:30');page.locator('#personalEventReminder').fill('2026-10-29T13:30')
 page.evaluate('accessTest.calendar.failSave=true');page.locator('#personalCalendarSave').click()
 page.wait_for_function('document.querySelector("#personalCalendarSaveStatus").textContent.includes("Save not confirmed")')
 assert page.locator('#personalEventLocation').input_value()=='Nirvana, Cape Town'
 first_id=page.evaluate('accessTest.calendar.attempts.at(-1).event_id')
 page.evaluate('accessTest.calendar.failSave=false');page.locator('#personalCalendarSave').click();page.wait_for_function('!document.querySelector("#personalCalendarDialog").open')
 args=page.evaluate('accessTest.calendar.writes.at(-1).args')
 assert args['event_id']==first_id and args['event_day']=='2026-10-29' and args['event_clock']=='14:30'
 assert args['zone']=='Africa/Johannesburg' and args['remind_local']=='2026-10-29T13:30'
 assert '<img src=x onerror=alert(1)>' in page.locator('#personalCalendarDayEvents').inner_text()
 assert '<script>never execute</script>' in page.locator('#personalCalendarDayEvents').inner_text()
 assert page.locator('#personalCalendarDayEvents img,#personalCalendarDayEvents script').count()==0
 # Edit the saved row and verify optimistic revision and all-day conversion.
 page.locator('[data-personal-event="'+first_id+'"]').click();page.locator('#personalEventTitle').fill('Updated lunch');page.locator('#personalEventAllDay').check();page.locator('#personalCalendarSave').click()
 page.wait_for_function('!document.querySelector("#personalCalendarDialog").open')
 updated=page.evaluate('accessTest.calendar.writes.at(-1).args')
 assert updated['expected_revision']==1 and updated['event_clock'] is None
 assert 'All day' in page.locator('#personalCalendarDayEvents').inner_text()
 page.once('dialog',lambda d:d.accept());page.locator('#personalCalendarDayEvents button',has_text='Delete').click()
 page.wait_for_function('(id)=>!accessTest.records.personal_calendar_events.some(e=>e.id===id)',arg=first_id)
 assert 'Updated lunch' not in page.locator('#personalCalendarDayEvents').inner_text()
 # Personal-event reminders route through the existing inbox to the private editor.
 page.evaluate('accessTest.calendar.showReminder()')
 page.wait_for_function('document.querySelector("#notificationList").textContent.includes("Private appointment")')
 page.locator('#notificationList .notification-open').click()
 page.wait_for_function('document.querySelector("#personalCalendarDialog").open')
 assert page.locator('#personalCalendar').is_visible()
 assert page.locator('#personalEventTitle').input_value()=='Private appointment'
 page.locator('#personalCalendarCancel').click()
 # Real mobile dimensions, including form inputs when a keyboard would appear.
 page.set_viewport_size({'width':390,'height':844});page.wait_for_function('document.documentElement.scrollWidth<=innerWidth')
 page.wait_for_function('document.querySelector("#sidebar").getBoundingClientRect().right<=1')
 page.screenshot(path='/tmp/quest-cas-calendar-mobile.png',full_page=True)
 page.locator('#personalCalendarAdd').click();page.locator('#personalEventTitle').fill('Mobile event')
 assert page.locator('#personalCalendarDialog').evaluate('(e)=>e.getBoundingClientRect().width<=innerWidth')
 page.once('dialog',lambda d:d.accept());page.locator('#personalCalendarCancel').click()
 # A missing migration leaves a visible setup message and prevents a misleading save.
 page.evaluate("accessTest.profiles.cas.personal_calendar_ready=false;accessTest.refresh()")
 page.wait_for_function('document.querySelector("#personalCalendarAdd").disabled')
 assert 'setup' in page.locator('#personalCalendarStatus').inner_text().lower()
 # Account switching clears both in-flight responses and private display contents.
 page.evaluate("accessTest.profiles.cas.personal_calendar_ready=true;accessTest.refresh()")
 page.wait_for_function('!document.querySelector("#personalCalendarAdd").disabled')
 page.evaluate("accessTest.calendar.delay=true;accessTest.navigate('personalCalendar')")
 page.wait_for_function('accessTest.calendar.pending.length>0')
 page.evaluate("accessTest.switchUser('tertius')");page.wait_for_function('document.querySelector("#userName").textContent==="Tertius"')
 page.evaluate('accessTest.calendar.release()')
 assert page.locator('.sidebar [data-view=personalCalendar]').is_hidden()
 assert page.locator('#personalCalendarDayEvents').inner_text().find('Private appointment')==-1
 page.evaluate("accessTest.navigate('personalCalendar')")
 assert not page.locator('#personalCalendar').evaluate('(e)=>e.classList.contains("active")')
 assert not errors,errors
 b.close();print('PASS personal calendar browser: private event CRUD, clicked date, time/location/notes/reminder, stable retry ID, revision, escaped text, mobile form, readiness and stale-account isolation.')

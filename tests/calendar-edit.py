"""Browser regression check using a simulated database; no remote writes."""
from pathlib import Path
from playwright.sync_api import sync_playwright
html=(Path(__file__).resolve().parents[1]/'index.html').read_text()
html=html.replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
html=html.replace('</script></body>', '''
window.testState={fail:false,zero:false,writes:[]};
user={id:'owner'};projects=[{id:'project',name:'Loden'}];
calendarEvents=[{id:'event',created_by:'owner',title:'Casting',event_date:'2026-10-17',project_id:'project',detail:'Bring portfolio\\nArrive early'},{id:'other',created_by:'other',title:'Other member event',event_date:'2026-10-17',detail:'Shared notes'}];
Object.defineProperty(testState,'events',{get:()=>calendarEvents});monthCursor=new Date(2026,9,1);refreshAll=async()=>render();
db={from:table=>({update:values=>{const q={eq:()=>q,select:()=>q,maybeSingle:async()=>{testState.writes.push({table,values});if(testState.fail)return {error:{message:'Access denied'}};if(testState.zero)return {data:null};Object.assign(calendarEvents[0],values);return {data:{id:'event'}}}};return q},insert:async values=>{testState.writes.push({table,values});calendarEvents.push({...values,id:'new'});return {error:null}}})};
document.querySelector('#loginScreen').hidden=true;document.querySelector('#appShell').hidden=false;showView('calendar');window.ready=true;
</script></body>''')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(timezone_id='Africa/Johannesburg');page.clock.install(time=__import__('datetime').datetime(2026,10,17,23,30,tzinfo=__import__('datetime').timezone.utc));errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  if r.request.url=='http://dashboard.test/':r.fulfill(body=html,content_type='text/html')
  elif r.request.url.endswith('/project-workspace.js'):r.fulfill(body=(Path(__file__).resolve().parents[1]/'project-workspace.js').read_text(),content_type='application/javascript')
  else:r.fulfill(body='',content_type='application/javascript' if r.request.url.endswith('.js') else 'text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.ready')
 page.locator('[data-edit-event="event"]').click()
 assert page.locator('#field-detail').input_value()=='Bring portfolio\nArrive early'
 page.locator('#field-title').fill('Updated casting');page.locator('#field-event_date').fill('2026-10-18')
 page.locator('#field-detail').fill('New notes\n<script>not code</script>');page.locator('#field-project_id').select_option('')
 page.locator('#entryForm [type=submit]').click();page.wait_for_function('!document.querySelector("#entryDialog").open')
 assert page.evaluate('testState.writes[0].values.project_id') is None
 assert page.locator('[data-edit-event="event"]').inner_text()=='Updated casting'
 page.locator('[data-edit-event="event"]').click();assert 'New notes\n<script>' in page.locator('#field-detail').input_value()
 page.locator('#field-detail').fill('');page.locator('#entryForm [type=submit]').click();page.wait_for_function('!document.querySelector("#entryDialog").open')
 assert page.evaluate('testState.events[0].detail')==''
 page.locator('[data-edit-event="event"]').click();page.locator('#field-title').fill('Unsaved');page.locator('#cancelDialog').click()
 page.locator('[data-edit-event="event"]').click();assert page.locator('#field-title').input_value()=='Updated casting'
 page.evaluate('testState.fail=true');page.locator('#field-detail').fill('Keep on failure');page.locator('#entryForm [type=submit]').click()
 assert page.locator('#entryError').inner_text()=='Access denied';assert page.locator('#field-detail').input_value()=='Keep on failure'
 page.evaluate('testState.fail=false;testState.zero=true');page.locator('#entryForm [type=submit]').click()
 assert 'could not be updated' in page.locator('#entryError').inner_text();page.locator('#cancelDialog').click()
 page.locator('[data-edit-event="other"]').click();assert page.locator('#field-detail').is_disabled();assert page.locator('#entryForm [type=submit]').is_hidden();page.locator('#cancelDialog').click()
 page.locator('.nav [data-view=projects]').click()
 project=page.locator('#allProjects [data-open-project=project]')
 project.click();page.locator('[data-workspace-add=calendar]').click();assert page.locator('#field-project_id').input_value()=='project'
 assert page.locator('#field-event_date').input_value()=='2026-10-18'
 assert page.locator('#field-detail').input_value()==''
 page.locator('#field-title').fill('Loden casting');page.locator('#field-detail').fill('Project event notes')
 page.locator('#entryForm [type=submit]').click();page.wait_for_function('!document.querySelector("#entryDialog").open')
 assert page.evaluate('testState.events.at(-1).project_id')=='project'
 page.locator('.workspace-back').click();project.focus();page.keyboard.press('Enter');assert page.locator('#projectWorkspace').is_visible()
 page.locator('.workspace-back').click();project.focus();page.keyboard.press('Space');assert page.locator('#projectWorkspace').is_visible()
 page.locator('.nav [data-view=calendar]').click()
 page.locator('[data-add=calendar]').click();assert page.locator('#field-event_date').input_value()=='2026-10-18';assert page.locator('#field-title').input_value()=='';assert page.locator('#field-detail').input_value()==''
 page.locator('#field-title').fill('New event');page.locator('#field-detail').fill('New shared notes');page.locator('#entryForm [type=submit]').click();page.wait_for_function('!document.querySelector("#entryDialog").open')
 assert page.evaluate('testState.events.at(-1).detail')=='New shared notes'
 page.locator('.nav [data-view=overview]').click()
 page.locator('#colourButton').click()
 assert page.locator('#layoutColour').is_visible()
 original=page.locator('.button.primary').first.evaluate('(el)=>getComputedStyle(el).backgroundColor')
 for colour in ['blue','violet','rose','amber']:
  page.locator('#layoutColour').select_option(colour)
  assert page.evaluate('document.documentElement.dataset.theme')==colour
  assert page.locator('.button.primary').first.evaluate('(el)=>getComputedStyle(el).backgroundColor')!=original
 page.reload();page.wait_for_function('window.ready')
 assert page.evaluate('document.documentElement.dataset.theme')=='amber'
 assert page.locator('#layoutColour').input_value()=='amber'
 page.evaluate("document.querySelector('.nav [data-view=overview]').click()")
 page.locator('#colourButton').click()
 page.locator('#layoutColour').select_option('green')
 assert page.locator('.button.primary').first.evaluate('(el)=>getComputedStyle(el).backgroundColor')==original
 page.set_viewport_size({'width':390,'height':844})
 assert page.locator('#layoutColour').is_visible()
 assert not errors,errors
 browser.close();print('PASS: editing, notes round-trip/clearing, dates, project clearing, cancel, errors, zero-row updates, creator access, new event defaults to actual local date despite browsed month; five colour themes, persistence, reset and mobile picker.')

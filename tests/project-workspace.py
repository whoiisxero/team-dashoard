"""Browser integration checks for project-specific workflows; no remote writes."""
from pathlib import Path
import mimetypes,datetime
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
html=html.replace('</script></body>',(root/'tests/workspace-fixture.js').read_text()+'</script></body>')
from full_access_fixture import full_access_fixture
html=full_access_fixture(html)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1280,'height':900},timezone_id='Africa/Johannesburg');page.clock.install(time=datetime.datetime(2026,10,17,10,tzinfo=datetime.timezone.utc));errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/')
   if path.name in ('home.js','d3.min.js'):return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.ready')
 page.locator('#allProjects [data-open-project=p1]').click();page.wait_for_function('!document.querySelector("#workspaceAddNote").disabled')
 assert page.locator('#workspaceTitle').inner_text()=='Loden'
 assert page.locator('#workspaceStatus').inner_text()=='On hold'
 assert 'Loden casting' in page.locator('#workspaceEvents').inner_text();assert 'Other project audition' not in page.locator('#workspaceEvents').inner_text()
 assert 'Assigned to Tertius' in page.locator('#workspaceTasks').inner_text();assert 'Other project task' not in page.locator('#workspaceTasks').inner_text()
 assert '$40' in page.locator('#workspaceExpenseTotal').inner_text();assert '$999' not in page.locator('#workspaceExpenses').inner_text()
 assert page.locator('#workspaceNotes button').count()==1
 page.locator('[data-workspace-add=calendar]').click();assert page.locator('#field-project_id').input_value()=='p1';assert page.locator('#field-event_date').input_value()=='2026-10-17'
 page.locator('#field-title').fill('Team planning');page.locator('#field-detail').fill('Agenda');page.locator('#entryForm [type=submit]').click();page.wait_for_function('!document.querySelector("#entryDialog").open')
 assert 'Team planning' in page.locator('#workspaceEvents').inner_text()
 page.locator('[data-workspace-add=task]').click();page.locator('#field-title').fill('Call client');page.locator('#field-assigned_to').select_option('tertius');assert page.locator('#field-project_id').input_value()=='p1'
 page.locator('#entryForm [type=submit]').click();page.wait_for_function('!document.querySelector("#entryDialog").open');assert 'Call client' in page.locator('#workspaceTasks').inner_text()
 assert page.evaluate('workspaceTest.writes.at(-1).values.assigned_to')=='tertius'
 page.locator('#workspaceTasks [data-complete=t1]').click();page.wait_for_function('!document.querySelector("#workspaceTasks [data-complete=t1]")')
 page.locator('[data-workspace-add=expense]').click();assert page.locator('#field-project_id').input_value()=='p1';page.locator('#field-title').fill('Lunch');page.locator('#field-amount').fill('20');page.locator('#entryForm [type=submit]').click();page.wait_for_function('!document.querySelector("#entryDialog").open');assert '$60' in page.locator('#workspaceExpenseTotal').inner_text()
 page.locator('#workspaceAddNote').click();page.locator('#projectNoteTitle').fill('New brief');page.locator('#projectNoteBody').fill('Line one\n<script>Text, not code</script>')
 page.evaluate('workspaceTest.fail=true');page.locator('#projectNoteSave').click();page.wait_for_function('document.querySelector("#projectNoteError").textContent==="Save denied"');assert 'Line one' in page.locator('#projectNoteBody').input_value()
 page.evaluate('workspaceTest.fail=false');page.locator('#projectNoteSave').click();page.wait_for_function('!document.querySelector("#projectNoteDialog").open');assert '<script>Text, not code</script>' in page.locator('#workspaceNotes').inner_text()
 page.locator('#workspaceNotes .workspace-row').filter(has_text='New brief').get_by_role('button',name='Edit note').click();page.locator('#projectNoteBody').fill('Edited notes');page.locator('#projectNoteSave').click();page.wait_for_function('!document.querySelector("#projectNoteDialog").open');assert 'Edited notes' in page.locator('#workspaceNotes').inner_text()
 page.locator('.workspace-back').click();page.locator('#allProjects [data-open-project=p2]').click();page.wait_for_function('document.querySelector("#workspaceNotes").textContent.includes("Reddington brief")')
 assert 'Loden brief' not in page.locator('#workspaceNotes').inner_text();assert 'Team planning' not in page.locator('#workspaceEvents').inner_text();assert page.locator('#workspaceNotes button').count()==0
 page.evaluate("workspaceTest.notesError='PGRST205'");page.locator('#workspaceRetryNotes').click();page.wait_for_function('document.querySelector("#workspaceNoteStatus").textContent.includes("need setup")');assert page.locator('#workspaceAddNote').is_disabled()
 page.locator('[data-workspace-add=calendar]').click();assert page.locator('#field-project_id').input_value()=='p2';page.locator('#cancelDialog').click()
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/quest-project-workspace.png',full_page=True)
 assert not errors,errors
 b.close();print('PASS workspace: project filtering, events/date/notes, assigned tasks and completion, expenses/totals, standalone note creation/editing, failed save recovery, creator-only editing, missing setup, project switching and mobile layout.')

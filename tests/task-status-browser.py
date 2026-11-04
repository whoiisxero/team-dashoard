"""Task transitions through the actual dashboard with scoped, persisted transport fixtures."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture='\n'.join((root/'tests'/name).read_text() for name in ['member-access-fixture.js','task-status-fixture.js'])
html=html.replace('</script></body>',fixture+'</script></body>')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']);page=b.new_page(viewport={'width':1440,'height':1050});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/')
   if path.name in ('home.js','d3.min.js'):return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.taskStatusReady');page.locator('.sidebar [data-view=tasks]').click()
 assert page.locator('#taskBoard h3').all_text_contents()==['Pending · 2','In progress · 1','Completed · 1']
 page.locator('#taskBoard [data-task-status=pending-task]').select_option('In progress');page.wait_for_function('document.querySelector("#taskBoard [data-task-status=pending-task]").closest(".kanban-col").dataset.taskState==="In progress"')
 assert page.locator('#taskStatusSummary').inner_text()=='1 pending · 2 in progress'
 page.evaluate('accessTest.refresh()');page.wait_for_function('document.querySelector("#taskBoard [data-task-status=pending-task]").value==="In progress"')
 # Failed writes and stale concurrent updates do not falsely change the board.
 page.evaluate('taskTest.fail=true');page.locator('#taskBoard [data-task-status=pending-task]').select_option('Done');page.wait_for_function('document.querySelector("#toast").textContent==="Status save failed"');assert page.locator('#taskBoard [data-task-status=pending-task]').input_value()=='In progress'
 page.evaluate('taskTest.fail=false;taskTest.noRows=true');page.locator('#taskBoard [data-task-status=pending-task]').select_option('Done');page.wait_for_function('document.querySelector("#toast").textContent.includes("This task changed")');assert page.locator('#taskBoard [data-task-status=pending-task]').input_value()=='In progress'
 page.evaluate('taskTest.noRows=false');page.locator('#taskBoard [data-task-status=pending-task]').select_option('Done');page.wait_for_function('document.querySelector("#taskBoard [data-task-status=pending-task]").closest(".kanban-col").dataset.taskState==="Done"')
 page.locator('#taskBoard [data-task-status=pending-task]').select_option('To do');page.wait_for_function('document.querySelector("#taskBoard [data-task-status=pending-task]").closest(".kanban-col").dataset.taskState==="To do"')
 # Dashboard and brand workstation expose the same state and controls.
 page.locator('.sidebar [data-view=dashboard]').click();assert page.locator('#overviewTasks [data-task-status=pending-task]').input_value()=='To do'
 page.locator('#lodenShortcut').click();assert page.locator('#lodenTasks [data-task-status=pending-task]').input_value()=='To do';page.locator('#lodenTasks [data-task-status=pending-task]').select_option('In progress');page.wait_for_function('document.querySelector("#lodenTasks").textContent.includes("In progress")')
 # Standard project workspace and My day show the current status too.
 page.evaluate("taskTest.openProject('loden')");assert page.locator('#workspaceTasks [data-task-status=pending-task]').input_value()=='In progress'
 page.locator('.sidebar [data-view=myDay]').click();assert page.locator('#myDayAssigned [data-task-status=pending-task]').input_value()=='In progress'
 # New tasks can start in any existing database status.
 page.locator('.sidebar [data-view=tasks]').click();page.locator('#tasks [data-add=task]').click();page.locator('#field-title').fill('Already underway');page.locator('#field-project_id').select_option('loden');page.locator('#field-status').select_option('In progress');page.locator('#entryDialog [type=submit]').click();page.wait_for_function('document.querySelector("#entryDialog").open===false');assert page.locator('#taskBoard [data-task-status=new-task]').input_value()=='In progress'
 page.screenshot(path='/tmp/quest-task-status-desktop.png',full_page=True)
 # Scoped member sees badges for view-only projects and can change writable tasks only.
 page.evaluate("accessTest.switchUser('editor')");page.wait_for_function('document.querySelector("#userName").textContent==="Editor"');page.locator('.sidebar [data-view=tasks]').click();assert page.locator('#taskBoard [data-task-status=dusted-task]').count()==0;assert 'Dusted launch' in page.locator('#taskBoard').inner_text();assert 'Design samples' not in page.locator('#taskBoard').inner_text()
 before=page.evaluate('taskTest.writes.length');page.evaluate("QuestTaskStatus.set('dusted-task','In progress')");assert page.evaluate('taskTest.writes.length')==before
 page.locator('#taskBoard [data-task-status=pending-task]').select_option('To do');page.wait_for_function('document.querySelector("#taskBoard [data-task-status=pending-task]").value==="To do"')
 page.set_viewport_size({'width':390,'height':844});page.wait_for_function('document.querySelector("#sidebar").getBoundingClientRect().right<=0');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path='/tmp/quest-task-status-phone.png',full_page=True)
 # A late write must not update the new account's controls or display a success toast.
 page.evaluate('taskTest.defer=true');page.locator('#taskBoard [data-task-status=pending-task]').select_option('In progress');page.wait_for_function('typeof taskTest.finish==="function"');page.evaluate("accessTest.switchUser('josh')");page.wait_for_function('document.querySelector("#userName").textContent==="Josh"');page.evaluate('taskTest.finish()');page.locator('#menuButton').click();page.locator('.sidebar [data-view=tasks]').click();assert page.locator('#taskBoard [data-task-status=pending-task]').count()==0;assert page.locator('#taskBoard [data-task-status=dusted-task]').input_value()=='To do'
 assert not errors,errors;b.close()
print('PASS tasks: pending/in progress/completed transitions, reopen, persistence, failed and concurrent writes, new task status, dashboard/workstation/workspace/My day consistency, read-only access, account isolation and phone layout.')

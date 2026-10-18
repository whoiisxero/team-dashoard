"""Project/task priorities and Team chat room labels, with simulated storage."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture=(root/'tests/workspace-fixture.js').read_text()+"\nprojects[0].name='Fragile';projects[0].priority='very_important';projects[0].priority_color='red';render();"
html=html.replace('</script></body>',fixture+'</script></body>')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page(viewport={'width':1280,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/')
   if path.name in ('home.js','d3.min.js'):return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.ready')
 card=page.locator('#allProjects [data-project-id=p1]');assert 'Very important' in card.inner_text();assert 'priority-marked' in card.get_attribute('class')
 card.locator('[data-priority-kind=project]').click();assert page.locator('#priorityLevel').input_value()=='very_important'
 assert page.locator('#projectWorkspace').is_hidden()
 page.locator('#priorityLevel').select_option('important');page.locator('#priorityColour').select_option('violet');page.locator('#priorityCancel').click();assert 'Very important' in card.inner_text()
 card.locator('[data-priority-kind=project]').click();page.locator('#priorityLevel').select_option('important');page.locator('#priorityColour').select_option('violet');page.locator('#prioritySave').click();page.wait_for_function('!document.querySelector("#priorityDialog").open')
 assert 'Important' in card.inner_text();assert card.evaluate('(el)=>el.style.getPropertyValue("--priority-accent")')=='#c7a5ff';assert 'On hold' in card.inner_text()
 page.locator('#fragileShortcut').click();assert page.locator('#fragile').is_visible();page.locator('#fragileProjectWorkspace').click();page.wait_for_function('document.querySelector("#workspacePriorityBadge").textContent.includes("Important")')
 page.locator('#workspaceTasks [data-priority-id=t1]').click();page.locator('#priorityLevel').select_option('very_important');page.locator('#priorityColour').select_option('blue')
 page.evaluate('workspaceTest.fail=true');page.locator('#prioritySave').click();page.wait_for_function('document.querySelector("#priorityError").textContent==="Save denied"')
 assert page.locator('#priorityLevel').input_value()=='very_important';page.evaluate('workspaceTest.fail=false');page.locator('#prioritySave').click();page.wait_for_function('!document.querySelector("#priorityDialog").open')
 assert 'Very important' in page.locator('#workspaceTasks').inner_text()
 page.locator('.nav [data-view=tasks]').click();task=page.locator('#taskBoard .kanban-item').filter(has_text='Prepare brief');assert 'Very important' in task.inner_text();assert 'priority-marked' in task.get_attribute('class')
 task.locator('[data-priority-id=t1]').click();page.locator('#priorityLevel').select_option('normal');page.locator('#prioritySave').click();page.wait_for_function('!document.querySelector("#priorityDialog").open');assert 'priority-marked' not in task.get_attribute('class')
 page.locator('.nav [data-view=discussions]').click();assert page.locator('#discussions h1').inner_text()=='Team chat room';assert 'team-chat-room' in page.locator('#discussions').inner_text()
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 b.close();print('PASS priorities: Fragile badge, colours, preserved project status, separate card/priority actions, workspace and task-board updates, cancel, failed-save retry, normal reset, Team chat room labels and mobile layout.')

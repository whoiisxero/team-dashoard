"""Real Quest UI with explicit read/edit scopes and mocked Supabase transport."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture=(root/'tests/member-access-fixture.js').read_text()+r'''
accessTest.profiles.quan.access_levels_ready=true;
accessTest.profiles.newmember={ready:true,is_admin:false,shared_access:false,can_create_projects:false,project_mode:'selected',access_levels_ready:true,editable_project_ids:['loden']};
accessTest.records.team_members.push({user_id:'newmember',display_name:'New member'});
accessTest.rules.newmember=['dusted','fragile','loden'];
accessTest.records.projects.find(p=>p.id==='loden').name='Reddington';
accessTest.records.tasks=[{id:'viewtask',project_id:'dusted',title:'View task',status:'To do',created_by:'newmember'},{id:'edittask',project_id:'loden',title:'Edit task',status:'To do',created_by:'newmember'}];
accessTest.records.calendar_events[0].created_by='newmember';
const previousRpc=db.rpc;db.rpc=async(name,args)=>{
 if(name==='set_member_access_levels'){
  accessTest.writes.push({rpc:name,args});accessTest.rules[args.target]=args.allowed_projects;
  Object.assign(accessTest.profiles[args.target],{project_mode:args.mode,shared_access:args.shared,editable_project_ids:args.editable_projects});return {data:null};
 }
 return previousRpc(name,args);
};
await accessTest.switchUser('newmember');window.editAccessReady=true;
'''
html=html.replace('</script></body>',fixture+'</script></body>')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1280,'height':1000});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/')
   if path.name in ('home.js','d3.min.js'):return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.editAccessReady')
 page.locator('.sidebar [data-view=projects]').click()
 assert page.locator('#allProjects .project-card').count()==3
 assert page.locator('#allProjects [data-project-id=dusted]').inner_text().count('View only')==1
 assert page.locator('#allProjects [data-project-id=loden] [data-priority-kind]').is_visible()
 assert page.locator('#allProjects [data-project-id=dusted] [data-priority-kind]').is_hidden()
 assert page.locator('.sidebar [data-view=members]').is_hidden()
 page.locator('.sidebar [data-view=tasks]').click()
 assert page.locator('#taskBoard [data-complete=viewtask]').is_hidden()
 assert page.locator('#taskBoard [data-complete=edittask]').is_visible()
 page.locator('#tasks [data-add=task]').click()
 assert page.locator('#field-project_id option').all_text_contents()==['Reddington']
 page.locator('#cancelDialog').click()
 page.locator('#dustedShortcut').click();page.locator('#dusted [data-studio-tab=chat]').click()
 page.wait_for_function('document.querySelector("#dustedMessages").textContent.includes("Dusted owner")')
 assert page.locator('#dustedChatText').is_disabled();assert page.locator('#dustedChatSend').is_disabled()
 assert page.locator('#dusted [data-brand-add]').first.is_disabled()
 page.locator('#dusted [data-studio-tab=board]').click();assert page.locator('#dustedAddPin').is_disabled()
 assert page.locator('#dustedUploadReference').is_disabled()
 page.locator('.sidebar [data-view=events]').click();page.locator('#allEvents [data-edit-event]').click()
 assert page.locator('#entryDialog [type=submit]').is_hidden()
 assert page.locator('#field-title').is_disabled();assert page.locator('#field-project_id').input_value()=='dusted'
 page.locator('#cancelDialog').click()
 page.locator('.sidebar [data-project=loden]').click()
 page.wait_for_function('document.querySelector("#workspaceAddNote").disabled===false')
 assert 'View only' not in page.locator('#workspaceClient').inner_text()
 page.locator('#workspaceAddNote').click();page.locator('#projectNoteTitle').fill('Reddington brief');page.locator('#projectNoteBody').fill('New member can contribute here.');page.locator('#projectNoteSave').click()
 page.wait_for_function('accessTest.writes.some(w=>w.table==="project_notes")')
 assert page.evaluate('accessTest.writes.find(w=>w.table==="project_notes").values.project_id')=='loden'
 page.evaluate("accessTest.profiles.newmember.editable_project_ids=[];accessTest.refresh()")
 page.wait_for_function('document.querySelector("#workspaceAddNote").disabled')
 assert page.locator('#workspacePriorityButton').is_hidden()
 assert page.locator('#projectNoteDialog').is_hidden()
 page.locator('.sidebar [data-view=tasks]').click();assert page.locator('#tasks [data-add=task]').is_hidden()
 page.evaluate("accessTest.switchUser('quan')");page.wait_for_function('!document.querySelector(".sidebar [data-view=members]").hidden')
 page.locator('.sidebar [data-view=members]').click();page.wait_for_function('document.querySelector("[data-member-id=newmember]")')
 form=page.locator('[data-member-id=newmember]')
 form.locator('[name=edit_mode]').select_option('selected');form.locator('[name=editable_project][value=loden]').check()
 form.get_by_role('button',name='Save access').click()
 page.wait_for_function('accessTest.writes.some(w=>w.rpc==="set_member_access_levels")')
 saved=page.evaluate('accessTest.writes.find(w=>w.rpc==="set_member_access_levels").args')
 assert saved['editable_projects']==['loden'];assert set(saved['allowed_projects'])=={'loden','dusted','fragile'}
 assert not errors,errors
 b.close();print('PASS read/edit UI: scoped project controls, writable-only selectors, read-only own events, brand chat/moodboard/uploads, Reddington notes, downgrade and owner editing scopes.')

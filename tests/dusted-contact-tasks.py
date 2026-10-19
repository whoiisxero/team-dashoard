"""Brand workstation, discussion and moodboard checks with simulated storage."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture=(root/'tests/workspace-fixture.js').read_text()+'''
projects[0].name='Fragile';projects[1].name='Dusted.';state.setDustedName=name=>{projects[1].name=name;render()};const baseFrom=db.from;
state.brandMessages=[{id:'bm1',project_id:'p1',user_id:'tertius',body:'Brand direction',created_at:'2026-10-18T10:00:00Z'},{id:'bm2',project_id:'p2',user_id:'tertius',body:'Other brand chat',created_at:'2026-10-18T10:00:00Z'}];
state.pins=[{id:'pin1',project_id:'p1',created_by:'tertius',title:'Warm rust',notes:'Fabric palette',kind:'colour',colour:'#a64b32',created_at:'2026-10-18T10:00:00Z'},{id:'pin2',project_id:'p2',created_by:'tertius',title:'Other brand pin',kind:'note',created_at:'2026-10-18T10:00:00Z'}];state.brandError=null;state.failBrand=false;state.setProjectName=name=>{projects[0].name=name;render()};
db.from=table=>{if(!table.startsWith('brand_'))return baseFrom(table);let filters=[],inserting=null,deleting=false,single=false,limit=Infinity;const rows=()=>table==='brand_messages'?state.brandMessages:state.pins;const q={select:()=>q,eq:(key,value)=>{filters.push(row=>row[key]===value);return q},order:()=>q,limit:n=>{limit=n;return q},insert:values=>{inserting=values;return q},delete:()=>{deleting=true;return q},maybeSingle:()=>{single=true;return q},then:(resolve,reject)=>Promise.resolve().then(()=>{if(state.brandError)return {error:{code:state.brandError}};if((inserting||deleting)&&state.failBrand)return {error:{message:'Brand save denied'}};if(inserting){rows().push({...inserting,id:'new-'+state.writes.length,created_at:new Date().toISOString()});state.writes.push({table,values:inserting});return {error:null}}let found=rows().filter(row=>filters.every(f=>f(row))).sort((a,b)=>b.created_at.localeCompare(a.created_at));if(deleting){for(const row of found)rows().splice(rows().indexOf(row),1);return {data:single?found[0]:found,error:null}}return {data:found.slice(0,limit).map(row=>({...row})),error:null}}).then(resolve,reject)};return q;};render();
'''
html=html.replace('</script></body>',fixture+'</script></body>')

html=html.replace('</script></body>', """
refreshAll=async()=>{render();if(document.querySelector('#dusted').classList.contains('active'))dustedStudio.activate();void projectWorkspace.loadNotes()};
const contactFrom=db.from;state.contactCalls=[];state.failContactNotes=false;state.failContactLead=null;
db.from=table=>{const q=contactFrom(table);if(!['tasks','project_notes','projects'].includes(table))return q;q.upsert=async(values,options)=>{state.contactCalls.push({table,values:{...values},options});await new Promise(resolve=>setTimeout(resolve,2));if(table==='project_notes'&&state.failContactNotes)return {error:{code:'PGRST205'}};if(table==='tasks'&&values.title.includes(state.failContactLead||'!never!'))return {error:{message:'Contact task save denied'}};const rows=table==='tasks'?tasks:table==='projects'?projects:state.notes;if(!rows.some(row=>row.id===values.id))rows.push({...values,created_at:new Date().toISOString()});return {error:null}};return q};
</script></body>""")
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page(viewport={'width':1280,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/')
   if path.name in ('home.js','d3.min.js'):return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.ready');page.locator('#dustedShortcut').click();page.locator('#dusted [data-studio-tab=work]').click()
 assert page.locator('.dusted-contact-task').count()==19
 page.locator('#dustedOpenContactNotes').click();page.wait_for_function('document.querySelector("#dustedSheetsStatus").textContent.includes("0 saved contact sheets")')
 assert 'No contact sheets have been saved' in page.locator('#dustedSavedSheetList').inner_text()
 page.locator('#dustedLinksTab').click();assert page.locator('.dusted-contact-link-row').count()==19
 assert page.locator('#dustedAllContactLinks a[href="https://www.instagram.com/"]').count()==1
 assert page.locator('#dustedAllContactLinks a[href="https://www.tiktok.com/"]').count()==1
 assert page.locator('#dustedAllContactLinks a[href="https://wpa.org.za/"]').count()==1
 page.locator('#dustedSheetsSearch').fill('running-club');assert page.locator('.dusted-contact-link-row').count()==1
 page.locator('#dustedSheetsClose').click()

 page.locator('[data-lead-key=origin] summary').click();assert 'https://originroasting.co.za/' in page.locator('[data-lead-key=origin] pre').inner_text();assert 'not verified' in page.locator('[data-lead-key=origin] pre').inner_text()
 page.evaluate('workspaceTest.failContactNotes=true');page.locator('#dustedSaveContactTasks').click();page.wait_for_function('!document.querySelector("#dustedSaveContactTasks").disabled');assert 'Project notes setup is missing' in page.locator('#dustedContactSaveStatus').inner_text()
 assert page.evaluate('workspaceTest.contactCalls.filter(x=>x.table==="tasks").length')==0
 page.evaluate("workspaceTest.failContactNotes=false;workspaceTest.failContactLead='Origin Coffee'");page.locator('#dustedSaveContactTasks').click();page.wait_for_function('document.querySelector("#dustedContactSaveStatus").textContent.includes("Contact task save denied")')
 assert '2 tasks saved so far' in page.locator('#dustedContactSaveStatus').inner_text()
 page.evaluate('workspaceTest.failContactLead=null');page.locator('#dustedSaveContactTasks').click();page.locator('#dustedSaveContactTasks').dispatch_event('click');page.wait_for_function('document.querySelector("#dustedContactSaveStatus").textContent.includes("17 contact tasks saved")')
 assert page.evaluate('workspaceTest.notes.filter(n=>n.project_id==="p2"&&n.title.startsWith("Contact sheet")).length')==19
 assert page.locator('.dusted-contact-task').filter(has_text='Saved task').count()==19
 page.evaluate("workspaceTest.notes.push({id:'hidden-contact',project_id:'p1',title:'Contact sheet · Other brand only',body:'Hidden contact details'})")
 page.locator('#dustedOpenContactNotes').click();page.wait_for_function('document.querySelector("#dustedSheetsStatus").textContent.includes("19 saved contact sheets")')
 assert page.locator('.dusted-saved-sheet').count()==19
 assert 'Other brand only' not in page.locator('#dustedSavedSheetList').inner_text()
 assert page.locator('#dustedSavedSheetList a[href="https://originroasting.co.za/"]').count()==1
 assert page.locator('#dustedSavedSheetList a[href="https://www.instagram.com/"]').count()==1
 assert page.locator('#dustedSavedSheetList a[href="https://www.tiktok.com/"]').count()==1
 for href in page.locator('#dustedSavedSheetList a').all():
  assert href.get_attribute('rel')=='noopener noreferrer'
 page.evaluate("workspaceTest.notes.find(n=>n.title==='Contact sheet · Origin Coffee Roasting').body='<script>unsafe()</script> https://example.com/contact' ")
 page.locator('#dustedSheetsRefresh').click();page.wait_for_function('document.querySelector("#dustedSavedSheetList").textContent.includes("<script>unsafe()")')
 assert page.locator('#dustedSavedSheetList script').count()==0
 assert page.locator('#dustedSavedSheetList a[href="https://example.com/contact"]').count()==1
 page.locator('#dustedSheetsSearch').fill('Origin Coffee');assert page.locator('.dusted-saved-sheet').count()==1
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.set_viewport_size({'width':1280,'height':1000})
 page.locator('#dustedSheetsClose').click()

 assert page.evaluate('workspaceTest.contactCalls.filter(x=>x.table==="tasks"&&!x.values.title.includes("Origin Coffee")).every(x=>x.values.project_id==="p2"&&x.values.created_by==="quan"&&x.values.due_date==="2026-10-20")')
 assert 'Loden casting' not in page.locator('#dustedWorkContactGrid').inner_text()
 page.evaluate('workspaceTest.notes.find(n=>n.title==="Contact sheet · Origin Coffee Roasting").body="Owner added a verified phone"')
 page.locator('#dustedSaveContactTasks').click();page.wait_for_function('document.querySelector("#dustedContactSaveStatus").textContent.includes("0 contact tasks saved; 19 existing tasks kept")')
 assert page.evaluate('workspaceTest.notes.filter(n=>n.project_id==="p2"&&n.title.startsWith("Contact sheet")).length')==19
 assert page.evaluate('workspaceTest.notes.find(n=>n.title==="Contact sheet · Origin Coffee Roasting").body')=='Owner added a verified phone'
 page.locator('#dustedWorkContactFilter').select_option('club');assert page.locator('.dusted-contact-task').count()==7
 page.evaluate("workspaceTest.setDustedName('Unrelated project')");page.locator('#dustedShortcut').click();page.locator('#dusted [data-studio-tab=work]').click()
 assert 'Connect Dusted.' in page.locator('#dustedSaveContactTasks').inner_text()
 page.locator('#dustedCreateProject').click();page.wait_for_function('document.querySelector("#dustedContactSaveStatus").textContent.includes("19 contact tasks saved")')
 assert page.evaluate('workspaceTest.contactCalls.filter(x=>x.table==="projects").length')==1
 page.wait_for_function('!document.querySelector("#dustedSaveContactTasks").disabled')
 assert page.locator('#dustedConnectActions').is_hidden()
 page.locator('#dustedSaveContactTasks').click();page.wait_for_function('document.querySelector("#dustedContactSaveStatus").textContent.includes("0 contact tasks saved; 19 existing tasks kept")')
 assert page.evaluate('workspaceTest.contactCalls.filter(x=>x.table==="projects").length')==1

 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/dusted-contact-workstation.png',full_page=True)
 assert not errors,errors
 b.close();print('PASS contact task import: 16 organisation tasks plus club research and two creator-outreach tasks, source details, project/creator/deadline scope, missing notes setup, partial failure/retry, repeat import and double-click protection, preserved contact notes, filters and mobile layout.')

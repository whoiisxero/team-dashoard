"""Goal creation and blank-start checks with a simulated database."""
from pathlib import Path
import datetime,mimetypes
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture='''
window.goalTest={fail:false,loadFail:false,failDelete:false,deletes:[],rows:[{id:'old',title:'Historical goal',created_at:'2026-10-01T00:00:00Z'}],writes:[]};
user={id:'quan'};projects=[{id:'p1',name:'Loden'}];
db={from:table=>{let cutoff='',filters=[],deleting=false,single=false;const q={select:()=>q,gte:(key,value)=>{cutoff=value;return q},eq:(key,value)=>{filters.push(row=>row[key]===value);return q},delete:()=>{deleting=true;return q},maybeSingle:()=>{single=true;return q},order:()=>q,then:(resolve,reject)=>Promise.resolve().then(()=>{if(goalTest.loadFail)return {error:{message:'Read failed'}};const rows=goalTest.rows.filter(g=>g.created_at>=cutoff&&filters.every(f=>f(g)));if(deleting){if(goalTest.failDelete)return {error:{message:'Delete denied'}};for(const row of rows){goalTest.rows.splice(goalTest.rows.indexOf(row),1);goalTest.deletes.push(row.id);}return {data:single?(rows[0]||null):rows,error:null}}return {data:rows,error:null}}).then(resolve,reject),insert:async values=>{if(goalTest.fail)return {error:{message:'Save denied'}};goalTest.writes.push({table,values});goalTest.rows.push({...values,id:'new-'+goalTest.writes.length,created_at:new Date().toISOString()});return {error:null}}};return q}};
refreshAll=async()=>{render();await loadGoals()};document.querySelector('#loginScreen').hidden=true;document.querySelector('#appShell').hidden=false;showView('goals');window.ready=true;
'''
html=html.replace('</script></body>',fixture+'</script></body>')
from full_access_fixture import full_access_fixture
html=full_access_fixture(html)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page(timezone_id='Africa/Johannesburg');page.clock.install(time=datetime.datetime(2026,10,18,12,tzinfo=datetime.timezone.utc));errors=[];page.on('pageerror',lambda e:(errors.append(str(e)),print('Browser error:',e)))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/')
   if path.name in ('home.js','d3.min.js'):return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.ready')
 assert 'No goals yet' in page.locator('#goalGrid').inner_text();assert 'Historical goal' not in page.locator('#goalGrid').inner_text()
 page.locator('[data-add=goal]').click();assert page.locator('#dialogTitle').inner_text()=='Create goal'
 page.locator('#field-title').fill('Book a campaign');page.locator('#field-detail').fill('Prepare portfolio\nMeet client');page.locator('#field-project_id').select_option('p1');page.locator('#field-target_date').fill('2026-11-01')
 page.evaluate('goalTest.fail=true');page.locator('#entryForm [type=submit]').click();page.wait_for_function('document.querySelector("#entryError").textContent==="Save denied"');assert page.locator('#field-title').input_value()=='Book a campaign'
 page.evaluate('goalTest.fail=false');page.locator('#entryForm [type=submit]').click();page.wait_for_function('!document.querySelector("#entryDialog").open');page.wait_for_function('document.querySelectorAll("#goalGrid .goal-card").length===1')
 assert 'Book a campaign' in page.locator('#goalGrid').inner_text();assert 'Loden' in page.locator('#goalGrid').inner_text();assert '0% complete' in page.locator('#goalGrid').inner_text()
 assert page.evaluate('goalTest.writes[0].table')=='goals';assert page.evaluate('goalTest.writes[0].values.created_by')=='quan';assert page.evaluate('goalTest.writes[0].values.progress')==0
 page.locator('[data-add=goal]').click();assert page.locator('#field-title').input_value()=='';page.locator('#field-title').fill('Do not save');page.locator('#cancelDialog').click();assert page.evaluate('goalTest.writes.length')==1
 page.locator('[data-add=goal]').click();page.locator('#field-title').fill('Simple goal');page.locator('#entryForm [type=submit]').click();page.wait_for_function('!document.querySelector("#entryDialog").open');assert page.evaluate('goalTest.writes[1].values.target_date') is None
 page.evaluate("goalTest.rows.push({id:'other',title:'Other member goal',created_by:'tertius',created_at:new Date().toISOString()})")
 page.locator('.nav [data-view=goals]').click();page.wait_for_function('document.querySelectorAll("#goalGrid .goal-card").length===3')
 assert page.locator('.goal-delete').count()==2
 target=page.locator('#goalGrid .goal-card').filter(has_text='Book a campaign').locator('.goal-delete')
 page.once('dialog',lambda d:d.dismiss());target.click();assert page.evaluate('goalTest.deletes.length')==0
 page.evaluate('goalTest.failDelete=true');page.once('dialog',lambda d:d.accept());target.click();page.wait_for_function('document.querySelector("#goalsStatus").textContent==="Delete denied"');assert target.is_visible()
 page.evaluate('goalTest.failDelete=false');page.once('dialog',lambda d:d.accept());target.click();page.wait_for_function('!document.querySelector("#goalGrid").textContent.includes("Book a campaign")');assert page.evaluate('goalTest.deletes.length')==1
 assert 'Other member goal' in page.locator('#goalGrid').inner_text()
 page.set_viewport_size({'width':390,'height':844});assert page.locator('[data-add=goal]').is_visible();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.evaluate('goalTest.loadFail=true');page.locator('#menuButton').click();page.locator('.nav [data-view=goals]').click();page.wait_for_function('document.querySelector("#goalsStatus").textContent.includes("Could not load")')
 assert not errors,errors
 b.close();print('PASS goals: empty start, create form, notes/project/date, correct table/owner/progress, optional fields, failed-save retry, cancellation, read errors and mobile button.')

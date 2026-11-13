"""Invited My Fragile guest: page-only routes, scoped notes and account isolation."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';","const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture='\n'.join((root/'tests'/n).read_text() for n in ['member-access-fixture.js','personal-workspace-fixture.js'])+'''
accessTest.records.team_members.push({user_id:'jen',display_name:'Fragile collaborator'});
accessTest.profiles.jen={ready:true,is_admin:false,project_mode:'selected',shared_access:false,personal_only:false,personal_workspace_ready:true,private_fragile_owner_id:'quan',private_fragile_can_edit:true,editable_project_ids:[],directory_hidden:true};
accessTest.rules.jen=[];accessTest.hiddenMembers=['jen'];accessTest.profiles.quan.private_fragile_shared=true;
P.personal_notes.push({id:'shared-plan',owner_id:'quan',kind:'business',category:'Fragile / Private',title:'Fragile shared plan',body:'Shared work <script>text only</script>',status:'open',pinned:false,revision:1,time_zone:'Africa/Johannesburg',updated_at:'2026-11-12T10:00:00Z'},
{id:'owner-secret',owner_id:'quan',kind:'business',category:'Business',title:'Private owner business',body:'Never show to collaborator',status:'open',revision:1,time_zone:'Africa/Johannesburg',updated_at:'2026-11-12T10:00:00Z'},
{id:'owner-diary',owner_id:'quan',kind:'writing',category:'Weed diary / Private',title:'Private owner diary',body:'Never show to collaborator',status:'open',revision:1,time_zone:'Africa/Johannesburg',updated_at:'2026-11-12T10:00:00Z'});
await accessTest.switchUser('jen');window.sharedFragileReady=true;
'''
html=html.replace('</script></body>',fixture.replace('</script','<\\/script')+'</script></body>')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']);page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:(errors.append(str(e)),print(e,flush=True)))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/').split('?')[0]
   if path.name in ['home.js','d3.min.js']:return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.sharedFragileReady');page.wait_for_function('document.querySelector("#fragilePersonalList").textContent.includes("Fragile shared plan")')
 assert page.locator('#fragilePersonal').is_visible();assert 'invited' in page.locator('#fragilePersonalDescription').inner_text();assert page.locator('#fragilePersonalList script').count()==0
 assert page.locator('#writingList').inner_text()=='';assert page.locator('#businessList').inner_text()=='';assert 'Private owner' not in page.locator('#fragilePersonal').inner_text();assert page.locator('.sidebar [data-view=members]').is_hidden();assert page.locator('.sidebar [data-view=fragile]').is_hidden();assert page.locator('.sidebar [data-view=writing]').is_hidden();assert page.locator('.sidebar [data-view=personalSetup]').is_hidden();assert page.locator('.sidebar [data-view=ngl]').is_hidden()
 reads=page.evaluate('accessTest.personal.reads.filter(r=>r.uid==="jen")');assert all(r['table']!='personal_profiles' for r in reads);assert any(['owner_id','quan'] in r['eq'] and ['category','Fragile / Private'] in r['eq'] for r in reads if r['table']=='personal_notes')
 page.evaluate("accessTest.navigate('fragile')");assert page.locator('#fragilePersonal').is_visible();page.evaluate("accessTest.navigate('writing')");assert page.locator('#fragilePersonal').is_visible()
 page.locator('#fragilePersonalList').get_by_role('button',name='Open',exact=True).click();assert 'Shared only within My Fragile' in page.locator('#personalNotePrivacy').text_content();assert page.locator('#personalNoteCategory').get_attribute('readonly') is not None;page.locator('#personalNoteBody').fill('Collaborator update');page.locator('#personalNoteStatus').select_option('in_progress');page.evaluate('accessTest.personal.failSave=true');page.locator('#personalNoteSave').click();page.wait_for_function('document.querySelector("#personalNoteState").textContent.includes("Save not confirmed")');assert page.locator('#personalNoteBody').input_value()=='Collaborator update'
 page.evaluate('accessTest.personal.failSave=false');page.locator('#personalNoteSave').click();page.wait_for_function('!document.querySelector("#personalNoteDialog").open');assert page.evaluate('accessTest.personal.writes.at(-1).rpc')=='quest_save_shared_fragile_note';assert page.evaluate('accessTest.records.personal_notes.find(n=>n.id==="shared-plan").owner_id')=='quan';assert page.locator('#fragilePersonalWorking').inner_text()=='1'
 page.locator('#fragilePersonalNew').click();page.locator('#personalNoteTitle').fill('Shared next step');page.locator('#personalNoteBody').fill('New shared content');page.locator('#personalNoteSave').click();page.wait_for_function('document.querySelector("#fragilePersonalList").textContent.includes("Shared next step")');assert page.evaluate('accessTest.records.personal_notes.find(n=>n.title==="Shared next step").owner_id')=='quan'
 page.once('dialog',lambda d:d.accept());page.locator('#fragilePersonalList article').filter(has_text='Shared next step').get_by_role('button',name='Delete',exact=True).click();page.wait_for_function('!document.querySelector("#fragilePersonalList").textContent.includes("Shared next step")');assert page.evaluate('accessTest.personal.writes.at(-1).rpc')=='quest_delete_shared_fragile_note'
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.evaluate('scrollTo(0,0)');page.screenshot(path='/tmp/quest-shared-fragile-phone.png',full_page=True);page.set_viewport_size({'width':1440,'height':1000})
 page.evaluate("accessTest.profiles.jen.private_fragile_can_edit=false;accessTest.refresh()");page.wait_for_function('document.querySelector("#fragilePersonalNew").disabled');page.wait_for_function('document.querySelector("#fragilePersonalList").textContent.includes("Collaborator update")');page.locator('#fragilePersonalList').get_by_role('button',name='Open',exact=True).click();assert page.locator('#personalNoteSave').is_hidden();assert page.locator('#personalNoteBody').is_disabled();page.locator('#personalNoteCancel').click()
 page.evaluate("accessTest.switchUser('quan')");page.wait_for_function('document.querySelector("#userName").textContent==="Quan"');page.locator('.sidebar [data-view=fragilePersonal]').click();page.wait_for_function('document.querySelector("#fragilePersonalList").textContent.includes("Collaborator update")');assert 'invited' in page.locator('#fragilePersonalDescription').inner_text();assert 'Private owner business' not in page.locator('#fragilePersonal').inner_text()
 page.evaluate("accessTest.navigate('business')");page.wait_for_function('document.querySelector("#businessList").textContent.includes("Private owner business")');assert 'Fragile shared plan' not in page.locator('#businessList').inner_text()
 # A delayed shared-note response must not survive scope revocation.
 page.evaluate("accessTest.profiles.jen.private_fragile_can_edit=true;accessTest.personal.delayFragile=true;accessTest.switchUser('jen')");page.wait_for_function('accessTest.personal.pending.length>0');page.evaluate("accessTest.profiles.jen.private_fragile_owner_id=null;accessTest.refresh()");page.wait_for_function('document.querySelector("#fragilePersonal").classList.contains("active")===false');page.evaluate('accessTest.personal.release()');page.wait_for_timeout(100);assert page.locator('#fragilePersonalList').inner_text()=='';assert page.locator('.sidebar [data-view=fragilePersonal]').is_hidden()
 page.evaluate("accessTest.switchUser('cas')");page.wait_for_function('document.querySelector("#userName").textContent==="Cas"');assert page.locator('.sidebar [data-view=fragilePersonal]').is_hidden();assert 'Collaborator update' not in page.locator('#personalHome').inner_text()
 assert not errors,errors;browser.close()
print('PASS shared My Fragile browser: guest-only landing/navigation, server-scoped note reads, no private notebook/profile requests, safe text, shared save/retry/create/delete, owner view, readonly controls, phone fit, stale-response and account-change privacy.')

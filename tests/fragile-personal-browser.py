"""Owner-only Fragile notebook and presentation filtering before/after SQL cleanup."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture='\n'.join((root/'tests'/name).read_text() for name in ['member-access-fixture.js','personal-workspace-fixture.js'])+'''
// A stale server still returns the retired directory entry; the UI must omit it.
accessTest.records.team_members.push({user_id:'jen',display_name:'Jen'});accessTest.profiles.jen={ready:true,is_admin:false,shared_access:false,project_mode:'selected'};accessTest.rules.jen=['fragile'];accessTest.online.add('jen');
await accessTest.switchUser('quan');window.fragilePersonalReady=true;
'''
html=html.replace('</script></body>',fixture.replace('</script','<\\/script')+'</script></body>')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']);page=b.new_page(viewport={'width':1280,'height':1000});errors=[];page.on('pageerror',lambda e:(errors.append(str(e)),print(e,flush=True)))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/').split('?')[0]
   if path.name in ('home.js','d3.min.js'):return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.fragilePersonalReady');page.locator('.sidebar [data-view=members]').click();page.wait_for_function('document.querySelectorAll(".member-access-card").length===4')
 assert 'Jen' not in page.locator('#onlineMemberList').inner_text();assert 'Jen' not in page.locator('#memberAccessList').inner_text();assert 'Jen' not in page.locator('#memberNames').inner_text()
 page.locator('.sidebar [data-view=fragilePersonal]').click();page.wait_for_function('!document.querySelector("#fragilePersonalNew").disabled');assert page.locator('#crumb').text_content()=='My Fragile';assert 'Private thoughts' not in page.locator('#fragilePersonal').inner_text()
 page.locator('#fragilePersonalNew').click();assert page.locator('#personalNoteHeading').inner_text()=='New Fragile note';assert page.locator('#personalNoteCategory').input_value()=='Fragile / Private';assert page.locator('#personalNoteCategory').get_attribute('readonly') is not None
 page.locator('#personalNoteTitle').fill('Next Fragile collection');page.locator('#personalNoteBody').fill('My private launch plan <script>text only</script>');page.locator('#personalNoteStatus').select_option('in_progress');page.evaluate('accessTest.personal.failSave=true');page.locator('#personalNoteSave').click();page.wait_for_function('document.querySelector("#personalNoteState").textContent.includes("Save not confirmed")');assert 'launch plan' in page.locator('#personalNoteBody').input_value()
 page.evaluate('accessTest.personal.failSave=false');page.locator('#personalNoteSave').click();page.wait_for_function('!document.querySelector("#personalNoteDialog").open');assert 'Next Fragile collection' in page.locator('#fragilePersonalList').inner_text();assert page.locator('#fragilePersonalWorking').inner_text()=='1';assert page.locator('#fragilePersonalList script').count()==0
 assert page.evaluate('accessTest.personal.writes.at(-1).args.note_category')=='Fragile / Private';assert page.evaluate('accessTest.records.personal_notes.find(n=>n.title==="Next Fragile collection").owner_id')=='quan'
 page.locator('#fragilePersonalRefresh').click();page.wait_for_function('document.querySelector("#fragilePersonalList").textContent.includes("Next Fragile collection")')
 page.locator('#fragilePersonalList').get_by_role('button',name='Open',exact=True).click();page.locator('#personalNoteStatus').select_option('done');page.locator('#personalNoteSave').click();page.wait_for_function('document.querySelector("#fragilePersonalDone").textContent==="1"')
 page.locator('#fragilePersonalSearch').fill('not found');assert 'Next Fragile collection' not in page.locator('#fragilePersonalList').inner_text();page.locator('#fragilePersonalSearch').fill('');page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path='/tmp/quest-my-fragile-phone.png',full_page=True)
 page.evaluate("accessTest.switchUser('cas')");page.wait_for_function('document.querySelector("#userName").textContent==="Cas"');assert page.locator('.sidebar [data-view=fragilePersonal]').is_hidden();assert page.locator('#fragilePersonalList').inner_text()=='';page.evaluate("accessTest.navigate('fragilePersonal')");assert not page.locator('#fragilePersonal').is_visible()
 assert not errors,errors;b.close()
print('PASS My Fragile: stale directory/presence entry omitted, owner-only navigation and private records, save/retry, status counts, refresh, safe text, search, phone layout and account reset.')

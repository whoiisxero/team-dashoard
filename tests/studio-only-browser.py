"""Hidden studio member: scoped identity, directory exclusion, no separate chats."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture='\n'.join((root/'tests'/name).read_text() for name in ['member-access-fixture.js','private-chats-fixture.js'])+'''
accessTest.hiddenMembers=['jen'];Object.assign(accessTest.records.team_members.find(m=>m.user_id==='jen'),{display_name:'Fragile collaborator'});
Object.assign(accessTest.profiles.jen,{studio_only_project_id:'fragile',directory_hidden:true,editable_project_ids:['fragile'],shared_access:false});rooms.find(r=>r.id==='jen-room').archived=true;
accessTest.records.brand_messages.push({id:'studio-message',project_id:'fragile',user_id:'jen',body:'Studio update',created_at:'2026-11-06T10:00:00Z'});
const studioRpc=db.rpc;db.rpc=async(name,args)=>name==='studio_member_names'?{data:args.target_project==='fragile'&&accessible('fragile')?[{user_id:'jen',display_name:'Jen'}]:[]}:studioRpc(name,args);
await accessTest.switchUser('quan');window.studioReady=true;
'''
html=html.replace('</script></body>',fixture.replace('</script','<\\/script')+'</script></body>')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']);page=b.new_page(viewport={'width':1280,'height':1000});errors=[];page.on('pageerror',lambda e:(errors.append(str(e)),print(e,flush=True)))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/').split('?')[0]
   if path.name in ['home.js','d3.min.js']:return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.studioReady')
 page.locator('.sidebar [data-view=members]').click();page.wait_for_function('document.querySelectorAll(".member-access-card").length===3');assert 'Jen' not in page.locator('#members').inner_text();assert page.locator('[data-private-chat=jen-room]').count()==0
 page.locator('.sidebar [data-view=dashboard]').click();assert 'Jen' not in page.locator('#dashboard').inner_text()
 page.locator('#fragileShortcut').click();page.locator('#fragile [data-studio-tab=chat]').click();page.wait_for_function('document.querySelector("#fragileMessages").textContent.includes("Fragile collaborator")');assert 'Studio update' in page.locator('#fragileMessages').inner_text()
 page.locator('#fragile [data-studio-tab=work]').click();page.locator('#fragile [data-brand-add=task]').click();assert 'Fragile collaborator' in page.locator('#field-assigned_to').inner_text();assert 'Jen' not in page.locator('#field-assigned_to').inner_text();page.locator('#cancelDialog').click()
 page.evaluate("accessTest.switchUser('jen')");page.wait_for_function('document.querySelector("#userName").textContent==="Fragile collaborator"');assert page.locator('#fragile').is_visible();assert page.locator('.sidebar [data-view=tasks]').is_hidden();assert page.locator('.sidebar [data-view=discussions]').is_hidden();assert page.locator('[data-private-chat=jen-room]').count()==0
 page.evaluate("accessTest.navigate('privateChat')");assert page.locator('#fragile').is_visible();page.evaluate("accessTest.navigate('members')");assert page.locator('#fragile').is_visible()
 page.locator('#fragile [data-studio-tab=chat]').click();page.wait_for_function('!document.querySelector("#fragileChatSend").disabled');page.locator('#fragileChatText').fill('Working in Fragile');page.locator('#fragileChatSend').click();page.wait_for_function('document.querySelector("#fragileMessages").textContent.includes("Working in Fragile")')
 assert not errors,errors;b.close()
print('PASS studio-only member: no directory/presence/private chat entry, scoped name inside Fragile, task assignment, Fragile landing, blocked other routes and working brand conversation.')

"""An owner/member direct chat remains usable without shared/project editing rights."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture='\n'.join((root/'tests'/name).read_text() for name in ['member-access-fixture.js','private-chats-fixture.js'])+'''
rooms.push({id:'tertius-room',name:'Quan & Tertius',project_id:null,room_kind:'direct',personal_owner_id:'tertius',created_by:'quan'});
accessTest.records.private_chat_members.push({room_id:'tertius-room',user_id:'quan'},{room_id:'tertius-room',user_id:'tertius'});
accessTest.records.private_chat_messages.push({id:'tertius-hello',room_id:'tertius-room',user_id:'quan',body:'Our private conversation',created_at:'2026-11-05T10:00:00Z'});
Object.assign(accessTest.profiles.tertius,{shared_access:false,editable_project_ids:[],personal_workspace_ready:true});accessTest.profiles.quan.personal_workspace_ready=true;
const participantRpc=db.rpc;db.rpc=async(name,args)=>name==='private_chat_participants'?{data:roomAllowed(args.chat_id,user.id)?accessTest.records.private_chat_members.filter(m=>m.room_id===args.chat_id).map(m=>accessTest.records.team_members.find(t=>t.user_id===m.user_id)):[]}:participantRpc(name,args);
await accessTest.switchUser('tertius');window.directChatReady=true;
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
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.directChatReady');page.wait_for_function('document.querySelector("[data-private-chat=tertius-room]")')
 page.locator('[data-private-chat=tertius-room]').click();page.wait_for_function('!document.querySelector("#privateChatSend").disabled');assert page.locator('#privateChatTitle').inner_text()=='Quan & Tertius';assert 'Private conversation' in page.locator('#privateChatParticipants').inner_text();assert 'Project' not in page.locator('#privateChatParticipants').inner_text()
 page.locator('#privateChatText').fill('Hello Quan');page.locator('#privateChatSend').click();page.wait_for_function('document.querySelector("#privateChatMessages").textContent.includes("Hello Quan")')
 page.evaluate("accessTest.switchUser('quan')");page.wait_for_function('document.querySelector("[data-private-chat=tertius-room]")');page.locator('[data-private-chat=tertius-room]').click();page.wait_for_function('document.querySelector("#privateChatMessages").textContent.includes("Hello Quan")')
 page.evaluate("accessTest.switchUser('josh')");page.wait_for_function('document.querySelector("#userName").textContent==="Josh"');assert page.locator('[data-private-chat=tertius-room]').count()==0;assert 'Hello Quan' not in page.locator('#privateChatMessages').inner_text()
 assert not errors,errors;b.close()
print('PASS direct chat: owner and Tertius only, no project dependency, writable without shared/project editing, participants, send, owner history and other-member exclusion.')

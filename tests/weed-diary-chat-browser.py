"""A separate owner/Tertius chat embedded in the diary; owner entries stay private."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
out=Path('/tmp')
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';","const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture='\n'.join((root/'tests'/name).read_text() for name in ['member-access-fixture.js','personal-workspace-fixture.js','private-chats-fixture.js'])+'''
const diaryRoom={id:'diary-room',room_key:'weed-diary-owner-tertius',name:'Weed Diary · Quan & Tertius',room_kind:'direct',project_id:null,personal_owner_id:'tertius',created_by:'quan'};
rooms.push(diaryRoom,{id:'general-room',room_key:'direct-owner-tertius',name:'Quan & Tertius',room_kind:'direct',project_id:null,personal_owner_id:'tertius',created_by:'quan'});
accessTest.records.private_chat_members.push({room_id:'diary-room',user_id:'quan'},{room_id:'diary-room',user_id:'tertius'},{room_id:'general-room',user_id:'quan'},{room_id:'general-room',user_id:'tertius'});
accessTest.records.private_chat_messages.push({id:'diary-first',room_id:'diary-room',user_id:'quan',body:'Our diary conversation',created_at:'2026-11-15T10:00:00Z'},{id:'general-first',room_id:'general-room',user_id:'tertius',body:'GENERAL_DM_ONLY',created_at:'2026-11-15T09:00:00Z'});
P.personal_notes.push({id:'private-diary',owner_id:'quan',kind:'writing',title:'Weed diary · Private entry',body:'PRIVATE_QUAN_DIARY',category:'Weed diary / Private',status:'open',pinned:false,revision:1,time_zone:'Africa/Johannesburg',updated_at:'2026-11-15T08:00:00Z'});
Object.assign(accessTest.profiles.tertius,{shared_access:false,editable_project_ids:[],personal_workspace_ready:false});
accessTest.profiles.quan.personal_workspace_ready=true;
accessTest.refreshRooms=()=>privateChats.refreshRooms();accessTest.enter=id=>enterApp({id});
accessTest.personal.reads=[];
const readAuditFrom=db.from;db.from=table=>{if(table==='personal_notes')accessTest.personal.reads.push({uid:user?.id,table});return readAuditFrom(table);};
await accessTest.switchUser('quan');await privateChats.refreshRooms();window.weedChatReady=true;
'''
html=html.replace('</script></body>',fixture.replace('</script','<\\/script')+'</script></body>')
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1366,'height':1000})
 page.on('pageerror',lambda e:(errors.append(str(e)),print(e,flush=True)))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/').split('?')[0]
   if path.name in ['home.js','d3.min.js']:return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.weedChatReady')
 page.locator('.sidebar [data-view=weedDiary]').click()
 page.wait_for_function('document.querySelector("#weedDiaryList").textContent.includes("PRIVATE_QUAN_DIARY")')
 page.locator('#weedDiaryChatTab').click()
 page.wait_for_function('!document.querySelector("#privateChatSend").disabled')
 assert page.locator('#weedDiaryChatMount #privateChatForm').is_visible()
 assert page.locator('#weedDiaryEntries').is_hidden()
 assert page.locator('#privateChatTitle').text_content()=='Weed Diary · Quan & Tertius'
 assert 'Our diary conversation' in page.locator('#privateChatMessages').inner_text()
 assert 'GENERAL_DM_ONLY' not in page.locator('#privateChatMessages').inner_text()
 assert page.locator('#privateChatForm').count()==1
 # Failed sends keep the draft; successful retry is saved into the diary room.
 page.locator('#privateChatText').fill('Diary chat message')
 page.evaluate('accessTest.failPrivateWrite=true');page.locator('#privateChatSend').click()
 page.wait_for_function('document.querySelector("#privateChatStatus").textContent.includes("denied")')
 assert page.locator('#privateChatText').input_value()=='Diary chat message'
 page.evaluate('accessTest.failPrivateWrite=false');page.locator('#privateChatSend').click()
 page.wait_for_function('document.querySelector("#privateChatText").value===""')
 assert page.evaluate('accessTest.writes.at(-1).values.room_id')=='diary-room'
 # Realtime replies refresh the embedded chat through the same private engine.
 page.evaluate("accessTest.records.private_chat_messages.push({id:'diary-realtime',room_id:'diary-room',user_id:'tertius',body:'Realtime reply',created_at:'2026-11-15T12:00:00Z'});accessTest.emitPrivate()")
 page.wait_for_function('document.querySelector("#privateChatMessages").textContent.includes("Realtime reply")')
 # Moving between the diary and its normal private-room view preserves a draft.
 page.locator('#privateChatText').fill('Unsent diary draft')
 page.locator('.sidebar [data-private-chat=diary-room]').click()
 assert page.locator('#privateChat').is_visible()
 assert page.locator('#privateChatText').input_value()=='Unsent diary draft'
 page.locator('.sidebar [data-view=weedDiary]').click();page.locator('#weedDiaryChatTab').click()
 page.wait_for_function('document.querySelector("#weedDiaryChatMount #privateChatForm")')
 assert page.locator('#privateChatText').input_value()=='Unsent diary draft'
 page.locator('#privateChatText').fill('')
 page.locator('#weedDiaryEntriesTab').click()
 assert page.locator('#weedDiaryEntries').is_visible()
 assert 'PRIVATE_QUAN_DIARY' in page.locator('#weedDiaryList').inner_text()
 page.locator('#weedDiaryChatTab').click()
 page.evaluate('scrollTo(0,0)');page.screenshot(path=str(out/'Quest-Weed-Diary-Chat-Owner.png'))
 # The invited member can use the chat without private-workspace or project edit grants.
 page.evaluate('accessTest.personal.reads=[];accessTest.switchUser("tertius")')
 page.wait_for_function('document.querySelector("#userName").textContent==="Tertius"')
 page.wait_for_function('!document.querySelector(".sidebar [data-view=weedDiary]").hidden')
 page.evaluate('history.replaceState(null,"","/?view=weedDiary");accessTest.enter("tertius")')
 page.wait_for_function('document.querySelector("#weedDiary").classList.contains("active")')
 page.wait_for_function('!document.querySelector("#privateChatSend").disabled')
 assert page.evaluate('new URLSearchParams(location.search).has("view")') is False
 assert page.locator('#weedDiaryChatMount #privateChatForm').is_visible()
 assert page.locator('#weedDiaryEntriesTab').is_hidden()
 assert page.locator('#weedDiaryEntryActions').is_hidden()
 assert page.locator('#weedDiaryList').inner_text()==''
 assert 'PRIVATE_QUAN_DIARY' not in page.locator('#weedDiary').inner_text()
 assert page.evaluate('accessTest.personal.reads.filter(r=>r.uid==="tertius").length')==0
 page.locator('#privateChatText').fill('<img src=x onerror=alert(1)>');page.locator('#privateChatSend').click()
 page.wait_for_function('document.querySelector("#privateChatMessages").textContent.includes("onerror")')
 assert page.locator('#privateChatMessages img').count()==0
 assert page.locator('#privateChatMessages [data-private-message-id=diary-first] button').count()==0
 own=page.locator('#privateChatMessages article').filter(has_text='<img src=x onerror=alert(1)>')
 page.once('dialog',lambda d:d.accept());own.get_by_role('button',name='Delete',exact=True).click()
 page.wait_for_function('!document.querySelector("#privateChatMessages").textContent.includes("onerror")')
 page.set_viewport_size({'width':390,'height':844})
 page.wait_for_function('document.querySelector("#sidebar").getBoundingClientRect().right<=0')
 page.evaluate('scrollTo(0,0)');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(out/'Quest-Weed-Diary-Chat-Phone.png'))
 # Outsiders and personal clients cannot discover this page or its messages.
 page.evaluate('accessTest.switchUser("josh")');page.wait_for_function('document.querySelector("#userName").textContent==="Josh"')
 assert page.locator('.sidebar [data-view=weedDiary]').is_hidden()
 assert 'Diary chat message' not in page.locator('#privateChatMessages').inner_text()
 page.evaluate('accessTest.navigate("weedDiary")');assert page.locator('#weedDiary').is_hidden()
 page.evaluate('accessTest.switchUser("cas")');page.wait_for_function('document.querySelector("#userName").textContent==="Cas"')
 assert page.locator('.sidebar [data-view=weedDiary]').is_hidden()
 # Current membership is authoritative after revocation and reopening.
 page.evaluate('accessTest.switchUser("tertius")');page.wait_for_function('!document.querySelector(".sidebar [data-view=weedDiary]").hidden')
 page.evaluate('accessTest.navigate("weedDiary")');page.wait_for_function('!document.querySelector("#privateChatSend").disabled')
 page.evaluate('accessTest.records.private_chat_members=accessTest.records.private_chat_members.filter(m=>!(m.room_id==="diary-room"&&m.user_id==="tertius"));accessTest.refreshRooms()')
 page.wait_for_function('document.querySelector(".sidebar [data-view=weedDiary]").hidden')
 assert page.locator('#privateChatMessages').inner_text()==''
 page.evaluate('accessTest.navigate("weedDiary")');assert page.locator('#weedDiary').is_hidden()
 # The owner sees honest setup guidance if the room has not been created.
 page.evaluate('accessTest.records.private_chat_rooms.splice(accessTest.records.private_chat_rooms.findIndex(r=>r.id==="diary-room"),1);accessTest.switchUser("quan")')
 page.wait_for_function('document.querySelector("#userName").textContent==="Quan"')
 page.evaluate('accessTest.navigate("weedDiary")');page.locator('#weedDiaryChatTab').click()
 assert page.locator('#weedDiaryChatSetup').is_visible()
 assert 'one-time owner setup' in page.locator('#weedDiaryChatState').inner_text()
 assert page.locator('#weedDiaryChatMount').is_hidden()
 assert page.evaluate('accessTest.records.private_chat_messages.some(m=>m.body==="GENERAL_DM_ONLY")')
 # The public setup page copies the complete tested query with its closing sentinel.
 setup=browser.new_page()
 setup.on('pageerror',lambda e:errors.append(str(e)))
 setup.add_init_script('Object.defineProperty(navigator,"clipboard",{value:{writeText:async text=>{window.copiedDiarySql=text;}}})')
 def guide_route(r):
  path=r.request.url.removeprefix('http://dashboard.test/').split('?')[0]
  file=root/'setup-guide.html' if path=='setup-guide.html' else root/'dist'/path
  return r.fulfill(body=file.read_bytes() if file.is_file() else b'',content_type=mimetypes.guess_type(file)[0] or 'text/plain')
 setup.route('http://dashboard.test/**',guide_route);setup.goto('http://dashboard.test/setup-guide.html#weed-diary-chat')
 setup.wait_for_function('!document.querySelector("#copyWeedDiaryChat").disabled')
 setup.locator('#copyWeedDiaryChat').click()
 assert setup.evaluate('window.copiedDiarySql')==(root/'supabase/maintenance/weed-diary-chat.sql').read_text()
 assert setup.evaluate('window.copiedDiarySql.trim().endsWith("-- END WEED DIARY CHAT SETUP")')
 assert not errors,errors
 browser.close()
print('PASS Weed Diary chat: shared embedded/private engine, preserved separate DM and drafts, private send/retry/realtime/delete, Tertius chat-only view without note reads, escaped text, excluded clients/members, revocation and missing-room setup, owner entries preserved and phone fit.')

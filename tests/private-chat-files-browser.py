"""Private attachment uploads, uncertain sends, downloads and account transitions."""
from pathlib import Path
import base64,mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';","const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture='\n'.join((root/'tests'/name).read_text() for name in ['member-access-fixture.js','personal-workspace-fixture.js','private-chats-fixture.js','private-chat-files-fixture.js'])
html=html.replace('</script></body>',fixture.replace('</script','<\\/script')+'</script></body>')
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
photo={'name':'Our diary photo.png','mimeType':'image/png','buffer':png}
pdf={'name':'Diary reference.pdf','mimeType':'application/pdf','buffer':b'%PDF-1.4\nQuest private diary reference\n%%EOF'}
errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1366,'height':1000},accept_downloads=True)
 page.on('pageerror',lambda e:(errors.append(str(e)),print(e,flush=True)))
 page.add_init_script('''window.fileURLs=new Set();const makeURL=URL.createObjectURL.bind(URL),revokeURL=URL.revokeObjectURL.bind(URL);URL.createObjectURL=blob=>{const url=makeURL(blob);fileURLs.add(url);return url;};URL.revokeObjectURL=url=>{fileURLs.delete(url);revokeURL(url);};''')
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/').split('?')[0]
   if path.name in ['home.js','d3.min.js']:return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.fileChatReady&&!document.querySelector("#privateChatSend").disabled')
 picker=page.locator('#privateChatFilePicker')
 assert page.locator('#privateChatAttach').is_visible()
 # Unsupported, empty, oversized or excessive selections do not start uploads.
 for invalid in [[{'name':'script.svg','mimeType':'image/svg+xml','buffer':b'<svg></svg>'}],[{'name':'empty.pdf','mimeType':'application/pdf','buffer':b''}],[pdf]*5]:
  picker.set_input_files(invalid);assert page.locator('.private-file-draft').count()==0
 assert page.evaluate('fileTest.uploads.length')==0
 picker.set_input_files({'name':'too-big.pdf','mimeType':'application/pdf','buffer':b'x'*(20*1024*1024+1)})
 assert '20 MB' in page.locator('#privateChatFileStatus').inner_text()
 assert page.locator('.private-file-draft').count()==0
 # A failed upload keeps both text and selections for a retry.
 picker.set_input_files([photo,pdf]);page.locator('#privateChatText').fill('Our photo and reference')
 page.evaluate('fileTest.failUpload=true');page.locator('#privateChatSend').click()
 page.wait_for_function('document.querySelector("#privateChatFileStatus").textContent.includes("Could not send")')
 assert page.locator('.private-file-draft').count()==2
 assert page.locator('#privateChatText').input_value()=='Our photo and reference'
 assert page.evaluate('fileTest.rpc.length')==0
 page.locator('#privateChatSend').click();page.wait_for_function('document.querySelectorAll(".private-file-draft").length===0')
 page.wait_for_function('document.querySelectorAll("#privateChatMessages .private-file-card").length===2')
 page.wait_for_function('document.querySelector("#privateChatMessages .private-file-open img").naturalWidth>0')
 assert page.evaluate('fileTest.uploads.every(u=>u.bucket==="quest-private-chat-files"&&!u.options.upsert&&u.options.cacheControl==="0")')
 with page.expect_download() as event:page.get_by_role('button',name='Download Diary reference.pdf',exact=True).click()
 download=event.value;assert download.suggested_filename=='Diary reference.pdf';assert Path(download.path()).read_bytes()==pdf['buffer']
 page.get_by_role('button',name='Open image Our diary photo.png').click();page.wait_for_function('document.querySelector(".private-file-viewer").open')
 assert page.locator('.private-file-viewer img').get_attribute('src').startswith('blob:')
 page.get_by_role('button',name='Close image',exact=True).click()
 page.screenshot(path='/tmp/Quest-Weed-Diary-Uploads-Desktop.png',full_page=True)
 # Uncertain upload and send acknowledgements reuse the same object/message IDs.
 picker.set_input_files({'name':'Retry.pdf','mimeType':'application/pdf','buffer':pdf['buffer']})
 assert page.locator('#privateChatText').input_value()==''
 assert page.evaluate('QuestApp.hasUnsentWork()'),'File-only drafts must block an app update'
 page.evaluate('fileTest.loseUploadAck=true;fileTest.loseSendAck=true')
 page.locator('#privateChatSend').click();page.wait_for_function('document.querySelector("#privateChatFileStatus").textContent.includes("Could not send")')
 page.locator('#privateChatSend').click();page.wait_for_function('document.querySelector("#privateChatFileStatus").textContent.includes("not confirmed")')
 assert page.locator('#privateChatText').is_disabled()
 assert page.locator('#privateChatSend').inner_text()=='Retry send'
 before=page.evaluate('accessTest.records.private_chat_messages.filter(m=>m.attachments?.some(f=>f.name==="Retry.pdf")).length');assert before==1
 page.locator('#privateChatSend').click();page.wait_for_function('document.querySelectorAll(".private-file-draft").length===0')
 assert page.evaluate('accessTest.records.private_chat_messages.filter(m=>m.attachments?.some(f=>f.name==="Retry.pdf")).length')==1
 assert page.evaluate('fileTest.uploads.at(-1).path===fileTest.uploads.at(-2).path')
 assert page.evaluate('fileTest.rpc.at(-1).message_id===fileTest.rpc.at(-2).message_id')
 # Safe filename rendering, removal, separate normal chat and draft continuity.
 picker.set_input_files({'name':'<img onerror=alert(1)>.pdf','mimeType':'application/pdf','buffer':pdf['buffer']})
 assert page.locator('#privateChatFileDrafts img').count()==0
 page.locator('#privateChatFileDrafts button').click();assert page.locator('.private-file-draft').count()==0
 picker.set_input_files(pdf)
 page.evaluate('accessTest.navigate("overview")');assert page.evaluate('QuestApp.hasUnsentWork()')
 page.evaluate('accessTest.navigate("weedDiary")');page.locator('#weedDiaryChatTab').click()
 page.locator('.sidebar [data-private-chat=diary-room]').click();assert page.locator('.private-file-draft').count()==1
 page.locator('.sidebar [data-view=weedDiary]').click();page.locator('#weedDiaryChatTab').click()
 assert page.locator('.private-file-draft').count()==1
 page.locator('#privateChatFileDrafts button').click()
 page.locator('.sidebar [data-private-chat=general-room]').click();assert page.locator('#privateChatFiles').is_hidden()
 # Tertius receives the attachment message in his own inbox and can download it.
 page.evaluate('accessTest.switchUser("tertius")');page.wait_for_function('document.querySelector("#userName").textContent==="Tertius"')
 page.locator('.sidebar [data-view=weedDiary]').click();page.wait_for_function('!document.querySelector("#privateChatSend").disabled')
 assert page.locator('#weedDiaryEntriesTab').is_hidden()
 assert page.evaluate('accessTest.records.team_notifications.filter(n=>n.private_room_id==="diary-room"&&n.recipient_id==="tertius").length')==2
 with page.expect_download() as event:page.get_by_role('button',name='Download Diary reference.pdf',exact=True).click()
 assert Path(event.value.path()).read_bytes()==pdf['buffer']
 picker.set_input_files({'name':'Tertius notes.txt','mimeType':'text/plain','buffer':b'My private diary chat notes'})
 page.locator('#privateChatSend').click();page.wait_for_function('document.querySelector("#privateChatMessages").textContent.includes("Tertius notes.txt")')
 assert page.evaluate('accessTest.writes.at(-1).values.user_id')=='tertius'
 # Deleting one's message removes its files after removing the message.
 post=page.locator('#privateChatMessages article').filter(has_text='Tertius notes.txt')
 page.once('dialog',lambda d:d.accept());post.get_by_role('button',name='Delete',exact=True).click()
 page.wait_for_function('!document.querySelector("#privateChatMessages").textContent.includes("Tertius notes.txt")')
 assert page.evaluate('fileTest.removals.some(r=>r.uid==="tertius")')
 page.set_viewport_size({'width':390,'height':844})
 page.wait_for_function('document.querySelector("#sidebar").getBoundingClientRect().right<=0')
 page.evaluate('scrollTo(0,0)');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/Quest-Weed-Diary-Uploads-Phone.png',full_page=True)
 # Missing backend setup is explicit and preserves the selected files.
 picker.set_input_files(pdf);page.evaluate('fileTest.missingSetup=true');page.locator('#privateChatSend').click()
 page.wait_for_function('!document.querySelector("#privateChatUploadSetup").hidden')
 assert page.locator('.private-file-draft').count()==1
 page.evaluate('fileTest.missingSetup=false');page.locator('#privateChatFileDrafts button').click()
 # A slow download cannot recreate a private preview after switching accounts.
 page.evaluate('fileTest.delayDownloads=true;accessTest.switchUser("quan")')
 page.wait_for_function('document.querySelector("#userName").textContent==="Quan"')
 page.evaluate('accessTest.navigate("weedDiary")');page.locator('#weedDiaryChatTab').click()
 page.locator('#privateChatMessages .private-file-open').first.scroll_into_view_if_needed()
 page.wait_for_function('fileTest.pending.length>0')
 page.evaluate('accessTest.switchUser("josh")');page.wait_for_function('document.querySelector("#userName").textContent==="Josh"')
 page.evaluate('fileTest.release()');assert page.locator('#privateChatMessages').inner_text()==''
 assert page.locator('#privateChatFiles').is_hidden();page.wait_for_function('fileURLs.size===0')
 # Membership revocation clears loaded blobs, drafts and attachment controls.
 page.evaluate('accessTest.switchUser("tertius")');page.wait_for_function('document.querySelector("#userName").textContent==="Tertius"')
 page.evaluate('accessTest.navigate("weedDiary")');page.wait_for_function('!document.querySelector("#privateChatSend").disabled')
 picker.set_input_files(photo)
 page.evaluate('accessTest.records.private_chat_members=accessTest.records.private_chat_members.filter(m=>!(m.room_id==="diary-room"&&m.user_id==="tertius"));fileTest.refresh()')
 page.wait_for_function('document.querySelector(".sidebar [data-view=weedDiary]").hidden')
 assert page.locator('#privateChatMessages').inner_text()=='';assert page.locator('.private-file-draft').count()==0
 page.wait_for_function('fileURLs.size===0')
 # The setup copier delivers the full combined room-and-upload transaction.
 setup=browser.new_page();setup.add_init_script('Object.defineProperty(navigator,"clipboard",{value:{writeText:async text=>{window.copiedUploadSql=text;}}})')
 def setup_route(r):
  path=r.request.url.removeprefix('http://dashboard.test/').split('?')[0]
  file=root/'setup-guide.html' if path=='setup-guide.html' else root/'dist'/path
  return r.fulfill(body=file.read_bytes() if file.is_file() else b'',content_type=mimetypes.guess_type(file)[0] or 'text/plain')
 setup.route('http://dashboard.test/**',setup_route);setup.goto('http://dashboard.test/setup-guide.html#weed-diary-uploads')
 setup.wait_for_function('!document.querySelector("#copyWeedDiaryUploads").disabled');setup.locator('#copyWeedDiaryUploads').click()
 assert setup.evaluate('window.copiedUploadSql')==(root/'dist/setup/weed-diary-uploads.sql').read_text()
 assert setup.evaluate('window.copiedUploadSql.trim().endsWith("-- END WEED DIARY UPLOADS SETUP")')
 assert not errors,errors
 browser.close()
print('PASS private chat uploads: image/document and file-only sends, previews/download bytes, limits and safe names, upload retries, lost-ack idempotence, draft continuity, member notifications, own deletion, mobile fit, missing setup, stale-download/account/revocation cleanup and whole-query copying.')

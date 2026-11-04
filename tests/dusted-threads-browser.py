"""Real Dusted UI with simulated database/storage; database RLS has its own test."""
from pathlib import Path
import mimetypes,base64
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
from full_access_fixture import full_access_fixture
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture=(root/'tests/workspace-fixture.js').read_text()+(root/'tests/dusted-threads-fixture.js').read_text()
html=full_access_fixture(html.replace('</script></body>',fixture+'</script></body>')).replace('canEdit:()=>true','canEdit:()=>window.workspaceTest?.writable!==false')
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6av8AAAAASUVORK5CYII=')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']);page=b.new_page(viewport={'width':1440,'height':1050});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/')
   if path.name in ('home.js','d3.min.js'):return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.add_init_script("if(!crypto.randomUUID)crypto.randomUUID=()=> '00000000-0000-4000-8000-'+String(Math.floor(Math.random()*1e12)).padStart(12,'0')")
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.ready');page.locator('#dustedShortcut').click();page.locator('#dusted [data-studio-tab=chat]').click();page.wait_for_function('!document.querySelector("#dustedChatSend").disabled')
 assert page.locator('#dustedMessages>.thread-post').count()==20
 assert 'Existing Dusted conversation' in page.locator('#dustedMessages').inner_text()
 assert 'Fragile private idea' not in page.locator('#dustedMessages').inner_text()
 page.get_by_role('button',name='Load older posts',exact=True).click();page.wait_for_function('document.querySelectorAll("#dustedMessages>.thread-post").length===23')
 assert 'brand_message_likes' in page.evaluate('workspaceTest.realtime.map(x=>x.filter.table)')
 assert not page.locator('.thread-starters details').count();assert not page.locator('#dustedBrandQuestionList').is_visible()
 page.locator('#dustedChatText').fill('Our next launch idea');page.evaluate('workspaceTest.failPost=true');page.locator('#dustedChatSend').click();page.wait_for_function('document.querySelector("#dustedChatStatus").textContent.includes("Could not post")');assert page.locator('#dustedChatText').input_value()=='Our next launch idea'
 page.evaluate('workspaceTest.failPost=false;workspaceTest.commitThenFail=true');page.locator('#dustedChatSend').click();page.wait_for_function('document.querySelector("#dustedChatStatus").textContent.includes("Could not post")');page.locator('#dustedChatSend').click();page.wait_for_function('document.querySelector("#dustedChatText").value===""');assert page.evaluate('workspaceTest.brandMessages.filter(p=>p.body==="Our next launch idea").length')==1
 post=page.locator('#dustedMessages>.thread-post').first
 post.get_by_role('button',name='Like post',exact=True).click();page.wait_for_function('document.querySelector("#dustedMessages button[aria-pressed=true]")');assert len(page.evaluate('workspaceTest.likes'))==1
 post.get_by_role('button',name='Unlike post',exact=True).click();page.wait_for_function('workspaceTest.likes.length===0')
 assert post.locator('.thread-inline-reply').count()==1;post.locator('.thread-inline-reply textarea').fill('Love the direction');post.locator('.thread-inline-reply button').click();page.wait_for_function('document.querySelector(".thread-conversation")?.textContent.includes("Love the direction")');assert page.evaluate('workspaceTest.writes.at(-1).values.parent_id')
 assert page.locator('#dustedMessages>.thread-post').filter(has_text='Love the direction').count()==1
 reply=page.locator('.thread-reply').first;reply.locator('.thread-inline-reply textarea').fill('Following up here');page.evaluate('workspaceTest.failPost=true');reply.locator('.thread-inline-reply button').click();page.wait_for_function('document.querySelector(".thread-inline-error")?.textContent.includes("Could not send") || [...document.querySelectorAll(".thread-inline-error")].some(n=>n.textContent.includes("Could not send"))');assert page.locator('.thread-reply').first.locator('textarea').input_value()=='Following up here';page.evaluate('workspaceTest.failPost=false');page.locator('.thread-reply').first.locator('.thread-inline-reply button').click();page.wait_for_function('document.querySelector(".thread-conversation").textContent.includes("Following up here")')
 # Image-only posts, upload failure, and authenticated blob viewing.
 page.locator('#dustedThreadImages').set_input_files({'name':'launch.png','mimeType':'image/png','buffer':png});assert page.locator('#dustedThreadPreviews img').count()==1
 page.evaluate('workspaceTest.failUpload=true');page.locator('#dustedChatSend').click();page.wait_for_function('document.querySelector("#dustedChatStatus").textContent.includes("Could not post")');assert page.locator('#dustedThreadPreviews img').count()==1
 page.evaluate('workspaceTest.failUpload=false');page.locator('#dustedChatSend').click();page.wait_for_function('document.querySelector("#dustedThreadPreviews").childElementCount===0');page.wait_for_function('document.querySelector("#dustedMessages .thread-image img[data-loaded=true]")')
 assert page.evaluate('workspaceTest.uploads.at(-1).bucket')=='quest-thread-images';assert page.evaluate('workspaceTest.uploads.at(-1).options.upsert')==False
 page.locator('#dustedMessages .thread-image-open').first.click();assert page.locator('.thread-image-dialog').is_visible();assert page.locator('.thread-image-dialog img').get_attribute('src').startswith('blob:');page.get_by_role('button',name='Close image',exact=True).click()
 # Malicious markup stays text. Existing questions still populate the composer.
 page.locator('#dustedChatText').fill('<img src=x onerror=alert(1)>');page.locator('#dustedChatSend').click();page.wait_for_function('document.querySelector("#dustedChatText").value===""');assert page.locator('#dustedMessages>.thread-post').first.locator('.thread-body').inner_text()=='<img src=x onerror=alert(1)>';assert page.locator('#dustedMessages>.thread-post').first.locator('img').count()==0
 page.once('dialog',lambda d:d.accept());page.locator('#dustedMessages>.thread-post').first.get_by_role('button',name='Delete',exact=True).click();page.wait_for_function('!document.querySelector("#dustedMessages").textContent.includes("onerror")')
 page.locator('.thread-starters summary').click();page.locator('#dustedBrandQuestionList button').first.click();assert 'ideal customer' in page.locator('#dustedChatText').input_value();page.locator('#dustedChatText').fill('');page.locator('.thread-starters summary').click()
 # Read-only state blocks posting, reactions and deletion.
 page.evaluate('workspaceTest.writable=false;workspaceTest.refreshThreads()');page.wait_for_function('document.querySelector("#dustedChatStatus").textContent.includes("view only")');assert page.locator('#dustedChatSend').is_disabled();assert page.locator('#dustedThreadImages').is_disabled();assert page.locator('#dustedMessages .thread-delete').count()==0
 page.evaluate('workspaceTest.writable=true;workspaceTest.refreshThreads()');page.wait_for_function('!document.querySelector("#dustedChatSend").disabled')
 page.screenshot(path='/tmp/quest-dusted-conversations-desktop.png',full_page=True)
 page.set_viewport_size({'width':390,'height':844});page.locator('#dustedChatForm').scroll_into_view_if_needed();assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
 page.screenshot(path='/tmp/quest-dusted-conversations-phone.png',full_page=True)
 # Reset clears private feed, drafts, image URLs and the viewer.
 page.locator('#dustedChatText').fill('Unsent private note');page.locator('#dustedThreadImages').set_input_files({'name':'draft.png','mimeType':'image/png','buffer':png});page.evaluate('workspaceTest.deferUpload=true');page.locator('#dustedChatSend').click();page.wait_for_function('typeof workspaceTest.finishUpload==="function"');before=page.evaluate('workspaceTest.writes.length');page.evaluate('workspaceTest.resetThreads();workspaceTest.finishUpload()');assert page.locator('#dustedMessages').inner_text()=='';assert page.locator('#dustedChatText').input_value()=='';assert page.locator('#dustedThreadPreviews img').count()==0;assert page.locator('#dustedChatSend').is_disabled();page.wait_for_function('document.querySelector("#dustedChatForm").dataset.appSaving==="false"');assert page.evaluate('workspaceTest.writes.length')==before
 assert not errors,errors;b.close()
print('PASS Dusted conversations: preserved posts, paging, replies, likes, image upload/viewing, failed/ambiguous retries, safe text, read-only permissions, reset privacy and phone layout.')

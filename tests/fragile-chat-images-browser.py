"""Fragile's existing brand chat: private photo posts, safe retries and account isolation."""
from pathlib import Path
import base64, mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
from full_access_fixture import full_access_fixture

root = Path(__file__).resolve().parents[1]
out = Path('/workspace/outputs')
png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6av8AAAAASUVORK5CYII=')
html = (root/'index.html').read_text().replace(
    "import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';",
    "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture = (root/'tests/workspace-fixture.js').read_text() + (root/'tests/dusted-threads-fixture.js').read_text() + '''
state.brandMessages.push({id:'old-fragile',project_id:'p1',user_id:'tertius',body:'Existing Fragile direction',created_at:'2026-11-01T10:00:00Z',image_paths:[]});
const photoStorage = db.storage;
db.storage={from:bucket=>{const base=photoStorage.from(bucket);return {...base,
 download:async path=>{
  if(state.failDownload)return {error:{message:'Download unavailable'}};
  const response=await base.download(path);
  if(state.delayDownload)await new Promise(resolve=>state.finishDownload=resolve);
  return response;
 },
 upload:async(...args)=>state.missingBucket?{error:{message:'Bucket not found'}}:base.upload(...args)
};}};
state.refreshFragile=()=>fragileStudio.activate();
state.resetFragile=()=>fragileStudio.reset();
state.switchFragileUser=id=>{fragileStudio.reset();user={id};fragileStudio.activate();};
render();
'''
html = full_access_fixture(html.replace('</script></body>',fixture+'</script></body>')).replace(
    'canEdit:()=>true','canEdit:()=>window.workspaceTest?.writable!==false')
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1366,'height':1000})
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script("""if(!crypto.randomUUID){let i=0;crypto.randomUUID=()=> '00000000-0000-4000-8000-'+String(++i).padStart(12,'0');}window.testCreatedImageUrls=[];const make=URL.createObjectURL.bind(URL);URL.createObjectURL=value=>{const url=make(value);window.testCreatedImageUrls.push(url);return url;};window.testRevokedImages=[];const base=URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL=url=>{window.testRevokedImages.push(url);base(url)};""")
    def route(r):
        url=r.request.url
        if url=='http://dashboard.test/': return r.fulfill(body=html,content_type='text/html')
        if url.startswith('http://dashboard.test/'):
            path=root/url.removeprefix('http://dashboard.test/').split('?')[0]
            if path.name in ['home.js','d3.min.js']: return r.fulfill(body='',content_type='application/javascript')
            return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
        return r.fulfill(body='',content_type='text/css')
    page.route('**/*',route)
    page.goto('http://dashboard.test/')
    page.wait_for_function('window.ready')
    page.locator('#fragileShortcut').click()
    page.locator('#fragile [data-studio-tab=chat]').click()
    page.wait_for_function('!document.querySelector("#fragileChatSend").disabled')
    assert 'Existing Fragile direction' in page.locator('#fragileMessages').inner_text()
    assert 'Dusted idea' not in page.locator('#fragileMessages').inner_text()
    assert page.locator('#fragileChatAttach').is_enabled()
    assert page.locator('#fragileMessages .thread-actions').count()==0
    assert page.locator('#lodenChatAttach').count()==0
    pick=page.locator('#fragileChatImages')
    photo=lambda name='reference.png': {'name':name,'mimeType':'image/png','buffer':png}
    # File validation is atomic; selecting a photo does not upload or post it.
    pick.set_input_files({'name':'unsafe.svg','mimeType':'image/svg+xml','buffer':b'<svg/>'})
    assert 'JPG, PNG' in page.locator('#fragileChatStatus').inner_text()
    assert page.locator('#fragileChatPreviews img').count()==0
    pick.set_input_files({'name':'huge.png','mimeType':'image/png','buffer':bytes(8*1024*1024+1)})
    assert '8 MB' in page.locator('#fragileChatStatus').inner_text()
    pick.set_input_files([photo(str(i)+'.png') for i in range(5)])
    assert 'up to 4' in page.locator('#fragileChatStatus').inner_text()
    pick.set_input_files([photo('front.png'),photo('back.png')])
    assert page.locator('#fragileChatPreviews img').count()==2
    assert page.evaluate('workspaceTest.uploads.length')==0
    assert page.locator('#fragileChatForm').get_attribute('data-app-dirty')=='true'
    page.get_by_role('button',name='Remove back.png',exact=True).click()
    assert page.locator('#fragileChatPreviews img').count()==1
    assert page.evaluate('testRevokedImages.length')>0
    # Upload failure keeps text and selected photos. Retry posts one durable image message.
    page.locator('#fragileChatText').fill('Collection reference')
    page.evaluate('workspaceTest.failUpload=true')
    page.locator('#fragileChatSend').click()
    page.wait_for_function('document.querySelector("#fragileChatStatus").textContent.includes("Could not post")')
    assert page.locator('#fragileChatText').input_value()=='Collection reference'
    assert page.locator('#fragileChatPreviews img').count()==1
    page.evaluate('workspaceTest.failUpload=false;workspaceTest.commitThenFail=true')
    page.locator('#fragileChatSend').click()
    page.wait_for_function('document.querySelector("#fragileChatStatus").textContent.includes("Could not post")')
    assert page.locator('#fragileChatPreviews img').count()==1
    uploads=page.evaluate('workspaceTest.uploads.length')
    page.locator('#fragileChatSend').click()
    page.wait_for_function('document.querySelector("#fragileChatText").value===""')
    assert page.evaluate('workspaceTest.uploads.length')==uploads
    assert page.evaluate('workspaceTest.brandMessages.filter(m=>m.body==="Collection reference").length')==1
    post=page.locator('#fragileMessages article').filter(has_text='Collection reference')
    post.scroll_into_view_if_needed()
    page.wait_for_function('document.querySelector("#fragileMessages .brand-chat-image-open img")?.getAttribute("src")?.startsWith("blob:")')
    record=page.evaluate('workspaceTest.uploads.at(-1)')
    assert record['bucket']=='quest-thread-images' and record['path'].startswith('p1/quan/')
    assert record['options']=={'contentType':'image/png','cacheControl':'0','upsert':False}
    assert page.evaluate('workspaceTest.downloads.at(-1).bucket')=='quest-thread-images'
    post.locator('.brand-chat-image-open').click()
    assert page.locator('#fragileChatImageDialog').is_visible()
    assert page.locator('#fragileChatImageDialog img').get_attribute('src').startswith('blob:')
    page.get_by_role('button',name='Close image',exact=True).click()
    assert page.locator('#fragileChatForm').get_attribute('data-app-dirty')=='false'
    # Image-only messages use the same post, permissions and existing text layout.
    pick.set_input_files(photo('photo-only.png'));page.locator('#fragileChatSend').click()
    page.wait_for_function('document.querySelector("#fragileChatPreviews").childElementCount===0')
    assert page.evaluate('workspaceTest.brandMessages.filter(m=>m.project_id==="p1"&&m.body===""&&m.image_paths?.length===1).length')==1
    # Remove the author's message and its own stored photo; keep other conversations.
    image_path=page.evaluate('workspaceTest.brandMessages.find(m=>m.body==="Collection reference").image_paths[0]')
    page.once('dialog',lambda d:d.accept())
    post.get_by_role('button',name='Delete',exact=True).click()
    page.wait_for_function('!document.querySelector("#fragileMessages").textContent.includes("Collection reference")')
    assert image_path in page.evaluate('workspaceTest.removed')
    assert 'Existing Fragile direction' in page.locator('#fragileMessages').inner_text()
    # Downloads fail visibly and can be retried; a denied feed discards cached images.
    page.evaluate('workspaceTest.failDownload=true;workspaceTest.resetFragile();workspaceTest.refreshFragile()')
    page.locator('#fragile [data-studio-tab=chat]').click()
    page.wait_for_function('document.querySelector("#fragileMessages .brand-chat-image-state")?.textContent.includes("Retry photo")')
    page.evaluate('workspaceTest.failDownload=false')
    page.get_by_role('button',name='Retry photo',exact=True).first.click()
    page.wait_for_function('document.querySelector("#fragileMessages .brand-chat-image-open img")?.getAttribute("src")?.startsWith("blob:")')
    page.evaluate('workspaceTest.writable=false;workspaceTest.refreshFragile()')
    page.wait_for_function('document.querySelector("#fragileChatAttach").disabled')
    assert page.locator('#fragileChatSend').is_disabled()
    assert page.locator('#fragileMessages').get_by_role('button',name='Delete',exact=True).count()==0
    page.wait_for_function('!document.querySelector("#fragileMessages .brand-chat-image-open").disabled')
    page.evaluate('workspaceTest.writable=true;workspaceTest.refreshFragile()')
    page.wait_for_function('!document.querySelector("#fragileChatAttach").disabled')
    # Malformed cross-project paths are never downloaded, even if transport returns bad metadata.
    before=page.evaluate('workspaceTest.downloads.length')
    page.evaluate("""workspaceTest.brandMessages.push({id:'bad-path',project_id:'p1',user_id:'quan',body:'Bad reference',created_at:new Date().toISOString(),image_paths:['p2/quan/00000000-0000-4000-8000-000000000001.png']});workspaceTest.refreshFragile()""")
    page.wait_for_function('document.querySelector("#fragileMessages").textContent.includes("Bad reference")')
    assert not any(d['path'].startswith('p2/') for d in page.evaluate('workspaceTest.downloads.slice('+str(before)+')'))
    page.screenshot(path=str(out/'Fragile-Chat-Images-Desktop.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    page.wait_for_function('document.querySelector(\"#sidebar\").getBoundingClientRect().right<=0')
    page.locator('#fragileChatForm').scroll_into_view_if_needed()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(out/'Fragile-Chat-Images-Mobile.png'))
    page.evaluate('workspaceTest.failLoad=true;workspaceTest.refreshFragile()')
    page.wait_for_function('document.querySelector("#fragileChatSend").disabled')
    assert page.locator('#fragileMessages .brand-chat-gallery').count()==0
    page.evaluate('workspaceTest.failLoad=false;workspaceTest.refreshFragile()')
    page.wait_for_function('!document.querySelector("#fragileChatSend").disabled')
    # Missing storage produces an owner setup link and preserves the unsent attachment.
    pick.set_input_files(photo('setup.png'));page.evaluate('workspaceTest.missingBucket=true')
    page.locator('#fragileChatSend').click()
    page.wait_for_function('document.querySelector("#fragileChatStatus").textContent.includes("storage setup")')
    assert page.locator('#fragileChatStatus a').get_attribute('href')=='/setup-guide.html#dusted-threads'
    assert page.locator('#fragileChatPreviews img').count()==1
    page.evaluate('workspaceTest.missingBucket=false;workspaceTest.resetFragile();workspaceTest.refreshFragile()')
    page.locator('#fragile [data-studio-tab=chat]').click()
    page.wait_for_function('!document.querySelector("#fragileChatSend").disabled')
    # A pending upload finishing after an account change must never post to the new account.
    pick.set_input_files(photo('unsent.png'));page.locator('#fragileChatText').fill('Unsent private caption')
    page.evaluate('workspaceTest.deferUpload=true')
    page.locator('#fragileChatSend').click()
    page.wait_for_function('typeof workspaceTest.finishUpload==="function"')
    assert page.locator('#fragileChatAttach').is_disabled()
    count=page.evaluate('workspaceTest.writes.length')
    page.evaluate('workspaceTest.switchFragileUser("tertius");workspaceTest.finishUpload()')
    page.wait_for_timeout(100)
    assert page.locator('#fragileChatPreviews img').count()==0
    assert page.locator('#fragileChatText').input_value()==''
    assert page.evaluate('workspaceTest.writes.length')==count
    # A private download finishing after reset cannot recreate a blob URL or old photo.
    page.evaluate('workspaceTest.deferUpload=false;workspaceTest.delayDownload=true;workspaceTest.resetFragile();workspaceTest.refreshFragile()')
    page.locator('#fragile [data-studio-tab=chat]').click()
    page.locator('#fragileMessages .brand-chat-photo').first.scroll_into_view_if_needed()
    page.wait_for_function('typeof workspaceTest.finishDownload==="function"')
    made=page.evaluate('testCreatedImageUrls.length')
    page.evaluate('workspaceTest.resetFragile();workspaceTest.finishDownload()')
    page.wait_for_timeout(100)
    assert page.evaluate('testCreatedImageUrls.length')==made
    assert page.locator('#fragileMessages').inner_text()==''
    assert page.locator('#fragileChatImageDialog').is_hidden()
    assert not errors,errors
    browser.close()
print('PASS Fragile chat images: previews/limits/removal, private uploads/downloads, image-only posts, duplicate-safe retries, own-message cleanup, download retry, read-only and denied-feed states, cross-project path checks, missing-storage guidance, stale upload/account reset, and phone layout.')

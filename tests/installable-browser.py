"""Built app over real HTTP: installation UX, worker privacy, offline and updates."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse
from threading import Thread
import json, re, subprocess
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
from PIL import Image

root=Path(__file__).resolve().parents[1]
subprocess.run(['node','scripts/build.mjs'],cwd=root,check=True)
dist=root/'dist';release=json.loads((dist/'version.json').read_text())['release']
manifest=json.loads((dist/'manifest.webmanifest').read_text())
assert manifest['display']=='standalone' and manifest['scope']=='/'
for icon in manifest['icons']:
 assert Image.open(dist/icon['src'].lstrip('/')).size==tuple(map(int,icon['sizes'].split('x')))
fixture=((root/'tests/member-access-fixture.js').read_text()+(root/'tests/private-chats-fixture.js').read_text()).replace('</script','<\\/script')
html=(dist/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';","const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
html=html.replace('</script></body>',fixture+'</script></body>')
assert 'src="./team-access.js"' not in html
assert '/static/team-access.' in html
assert "url('/assets/fonts/" in next(dist.glob('static/fragile.*.css')).read_text()
state={'update':False}
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(dist),**kwargs)
 def log_message(self,*args):pass
 def do_GET(self):
  path=urlparse(self.path).path
  if path in ['/','/index.html']:
   body=html.encode();kind='text/html'
  elif path=='/api/private':body=b'PRIVATE_RESPONSE_MUST_NOT_BE_CACHED';kind='application/json'
  elif path=='/service-worker.js':
   value=(dist/'service-worker.js').read_text()
   if state['update']:value=value.replace("const RELEASE='"+release+"'","const RELEASE='"+release+"-next'")
   body=value.encode();kind='application/javascript'
  else:return super().do_GET()
  self.send_response(200);self.send_header('Content-Type',kind);self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
  context=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,service_workers='allow')
  context.route('https://**/*',lambda r:r.fulfill(body='',content_type='text/css'))
  page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto(base);page.wait_for_function('window.ready&&window.QuestApp');page.evaluate('navigator.serviceWorker.ready');page.wait_for_function('navigator.serviceWorker.controller!==null')
  page.locator('#menuButton').click();page.locator('#appInstallMenu').click()
  assert page.locator('#appInstallDialog').is_visible();assert release in page.locator('#appRelease').inner_text()
  assert 'Install app' in page.locator('#appInstallSteps').inner_text()
  page.evaluate("window.fakePrompt=false;const e=new Event('beforeinstallprompt');e.prompt=async()=>{window.fakePrompt=true};e.userChoice=Promise.resolve({outcome:'accepted'});dispatchEvent(e)")
  page.locator('#appInstallNative').click();assert page.evaluate('window.fakePrompt')
  page.locator('#appInstallClose').click()
  # Typed private messages survive offline requests and a worker update.
  page.locator('#menuButton').click();page.locator('#privateChatNav button').click();page.wait_for_function('!document.querySelector("#privateChatSend").disabled')
  page.locator('#privateChatText').fill('Unsent private draft')
  context.set_offline(True);page.locator('#appConnection').wait_for(state='visible');page.locator('#privateChatSend').click()
  assert page.locator('#privateChatText').input_value()=='Unsent private draft'
  assert page.evaluate('accessTest.writes.length')==0
  context.set_offline(False);page.locator('#appConnection').wait_for(state='hidden')
  assert page.locator('#privateChatText').input_value()=='Unsent private draft'
  page.evaluate("fetch('/api/private').then(r=>r.text())")
  cached=page.evaluate("(async()=>{const out=[];for(const key of await caches.keys())for(const request of await (await caches.open(key)).keys())out.push(request.url);return out})()")
  assert cached and all(urlparse(url).path.startswith(('/static/','/icons/')) or urlparse(url).path in ['/offline.html','/favicon.svg'] for url in cached)
  assert not any('/api/private' in url or '/index.html' in url or 'supabase' in url for url in cached)
  state['update']=True;page.evaluate('navigator.serviceWorker.getRegistration().then(r=>r.update())')
  page.locator('#appUpdate').wait_for(state='visible');assert page.locator('#appUpdateNow').is_disabled()
  assert page.locator('#privateChatText').input_value()=='Unsent private draft'
  page.locator('#privateChatText').fill('');page.wait_for_function('!document.querySelector("#appUpdateNow").disabled')
  page.locator('#appUpdateNow').click();page.wait_for_function('window.ready&&window.QuestApp');page.evaluate('navigator.serviceWorker.ready')
  # Access revoked while offline is rechecked and cleared on reconnect.
  page.locator('#menuButton').click();page.locator('#privateChatNav button').click();page.wait_for_function('!document.querySelector("#privateChatSend").disabled')
  page.locator('#privateChatText').fill('Must clear on revocation');context.set_offline(True)
  page.evaluate('accessTest.rules.jen=[]');context.set_offline(False)
  page.wait_for_function('document.querySelector("#fragileShortcut").hidden')
  assert page.locator('#privateChatText').input_value()==''
  context.set_offline(True)
  assert page.evaluate("fetch('/api/private').then(()=>false,()=>true)")
  offline=context.new_page();offline.goto(base+'/?source=installed')
  assert offline.get_by_role('heading',name='You’re offline.').is_visible()
  assert 'Keep our private' not in offline.locator('body').inner_text()
  assert offline.locator('#appShell').count()==0
  offline.screenshot(path='/tmp/quest-offline-phone.png',full_page=True)
  context.set_offline(False);offline.get_by_role('link',name='Try again').click();offline.wait_for_function('window.ready')
  assert offline.locator('#appShell').is_visible()
  assert not errors,errors
  # iPhone instructions are available even when no native install prompt exists.
  ios=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')
  ios.route('https://**/*',lambda r:r.fulfill(body='',content_type='text/css'))
  phone=ios.new_page();phone.goto(base);phone.wait_for_function('window.ready&&window.QuestApp');phone.evaluate('QuestApp.openInstall()')
  assert 'Safari' in phone.locator('#appInstallSteps').inner_text();assert 'Share' in phone.locator('#appInstallSteps').inner_text()
  phone.screenshot(path='/tmp/quest-install-phone.png',full_page=True)
  assert phone.evaluate('document.documentElement.scrollWidth<=innerWidth')
  b.close()
 print('PASS installable build: manifest/icons, hashed assets, Android/desktop prompt, iPhone help, real service worker, private-cache exclusion, offline launch/API failure, draft-safe updates, reconnect and permission revocation. Phone layouts emulated; real-device installation still needs manual checking.')
finally:server.shutdown();server.server_close()

"""Mobile sign-in recovery with the real Home page and scoped member fixtures."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM

root=Path(__file__).resolve().parents[1]
source=(root/'index.html').read_text()
import_line="import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';"
html=source.replace(import_line,"const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture=(root/'tests/member-access-fixture.js').read_text()+(root/'tests/private-chats-fixture.js').read_text()+'''
const startup=window.startupTest={reads:[],failTable:null,denyRoster:false,stallProjects:false,stallAccess:false,failRender:false};
const startupFrom=db.from;db.from=table=>{
  startup.reads.push(table);const q=startupFrom(table),then=q.then;
  q.then=(resolve,reject)=>{
    if(table===startup.failTable)return Promise.reject(new Error('Connection interrupted')).then(resolve,reject);
    if(table==='team_members'&&startup.denyRoster)return Promise.resolve({data:null,error:{message:'Roster denied'}}).then(resolve,reject);
    if(table==='projects'&&startup.stallProjects)return new Promise(()=>{}).then(resolve,reject);
    return then(resolve,reject);
  };return q;
};
const startupRpc=db.rpc;db.rpc=(name,args)=>name==='my_dashboard_access'&&startup.stallAccess?new Promise(()=>{}):startupRpc(name,args);
const startupRender=render;render=()=>{if(startup.failRender)throw new Error('Rendering interrupted');return startupRender();};
startup.open=async id=>{showLogin();startup.reads=[];await enterApp({id});};
window.startupReady=true;
'''
html=html.replace('</script></body>',fixture.replace('</script','<\\/script')+'</script></body>')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 # Keep timeout checks fast without changing production timeouts.
 page.add_init_script('const originalTimeout=window.setTimeout;window.setTimeout=(f,delay,...args)=>originalTimeout(f,delay===15000?150:delay,...args)')
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.startupReady')
 page.wait_for_function('document.querySelector("#countrySelect").options.length>200')
 assert page.locator('#appShell').is_visible();assert page.locator('#overview').is_visible()
 page.wait_for_function('document.querySelector("#homeWelcome").textContent.includes("Jen")')
 assert page.locator('#members').is_hidden();assert page.locator('#dustedShortcut').is_hidden()
 # A previous owner's Members view and a denied roster must never strand Jen.
 page.evaluate("startupTest.open('quan')");page.evaluate("accessTest.navigate('members')")
 page.evaluate("startupTest.denyRoster=true;startupTest.open('jen')")
 assert page.locator('#appShell').is_visible();assert page.locator('#overview').is_visible();assert page.locator('#members').is_hidden()
 assert 'member names' in page.locator('#dashboardLoadStatus').inner_text()
 assert page.evaluate('accessTest.records.projects.filter(p=>document.querySelector("#allProjects").textContent.includes(p.name)).map(p=>p.id)')==['fragile']
 assert page.evaluate('!startupTest.reads.includes("discussion_messages")&&!startupTest.reads.includes("team_settings")')
 page.evaluate('startupTest.denyRoster=false');page.locator('#dashboardLoadRetry').click();page.locator('#dashboardLoadNotice').wait_for(state='hidden')
 # Failed requests show a persistent retry, clear stale data, and recover.
 page.evaluate("startupTest.failTable='calendar_events';startupTest.open('jen')")
 assert page.locator('#overview').is_visible();assert 'Connection interrupted' in page.locator('#dashboardLoadStatus').inner_text()
 assert page.locator('#projectNav').inner_text()==''
 page.evaluate('startupTest.failTable=null');page.locator('#dashboardLoadRetry').click();page.locator('#dashboardLoadNotice').wait_for(state='hidden')
 # A hung data fetch and hung permissions fetch both have bounded recovery.
 page.evaluate("startupTest.stallProjects=true;startupTest.open('jen')")
 assert 'timed out' in page.locator('#dashboardLoadStatus').inner_text();assert page.locator('#overview').is_visible()
 page.evaluate('startupTest.stallProjects=false;startupTest.stallAccess=true');page.locator('#dashboardLoadRetry').click()
 page.wait_for_function('document.querySelector("#dashboardLoadStatus").textContent.includes("permissions could not be loaded")')
 assert page.locator('#overview').is_visible();assert page.locator('#fragileShortcut').is_hidden()
 page.evaluate('startupTest.stallAccess=false');page.locator('#dashboardLoadRetry').click();page.locator('#dashboardLoadNotice').wait_for(state='hidden')
 # Unexpected startup exceptions return to a usable sign-in form.
 page.evaluate("startupTest.failRender=true;startupTest.open('jen')")
 assert page.locator('#loginScreen').is_visible();assert page.locator('#loginForm').is_visible()
 assert 'Rendering interrupted' in page.locator('#loginError').inner_text()
 page.evaluate("startupTest.failRender=false;startupTest.open('jen')")
 assert page.locator('#appShell').is_visible();assert page.locator('#overview').is_visible()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/quest-jen-mobile-startup.png',full_page=True)
 assert not errors,errors
 # A saved-session failure must show an error instead of stopping initialization silently.
 html=source.replace(import_line,"const createClient=()=>({auth:{getSession:async()=>{throw new Error('Session unavailable')},onAuthStateChange:()=>{}}});")
 page.reload();page.wait_for_function('document.querySelector("#loginError").textContent.includes("Session unavailable")')
 assert page.locator('#loginForm').is_visible()
 assert not errors,errors
 b.close()
 print('PASS mobile startup: real Home/globe, restricted Jen scope, owner-to-Jen transition, denied roster, failed/hung requests, retry recovery, session failure, and visible sign-in after rendering errors.')

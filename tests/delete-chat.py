"""Delete-message UI checks using a simulated Supabase transport."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture='''
window.chatTest={fail:false,zero:false,deletes:0,rows:[{id:'mine',user_id:'quan',body:'My message',created_at:'2026-10-18T10:00:00Z'},{id:'other',user_id:'tertius',body:'Team reply',created_at:'2026-10-18T11:00:00Z'}],remove:deleteMessage};
user={id:'quan'};roster=[{user_id:'quan',display_name:'Quan'},{user_id:'tertius',display_name:'Tertius'}];messages=chatTest.rows.map(r=>({...r}));
db={from:table=>{let filters=[],deleting=false,single=false;const q={select:()=>q,eq:(key,value)=>{filters.push(row=>row[key]===value);return q},delete:()=>{deleting=true;return q},order:()=>q,limit:()=>q,maybeSingle:()=>{single=true;return q},then:(resolve,reject)=>Promise.resolve().then(()=>{if(deleting){chatTest.deletes++;if(chatTest.fail)return {error:{message:'Delete denied'}};if(chatTest.zero)return {data:null};const found=chatTest.rows.filter(row=>filters.every(f=>f(row)));chatTest.rows=chatTest.rows.filter(row=>!found.includes(row));return {data:single?(found[0]||null):found,error:null}}return {data:[...chatTest.rows].reverse(),error:null}}).then(resolve,reject)};return q}};
document.querySelector('#loginScreen').hidden=true;document.querySelector('#appShell').hidden=false;showView('discussions');window.ready=true;
'''
html=html.replace('</script></body>',fixture+'</script></body>')
from full_access_fixture import full_access_fixture
html=full_access_fixture(html)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/')
   if path.name in ('home.js','d3.min.js'):return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.ready')
 assert page.locator('#messages [data-delete-message=mine]').count()==1
 assert page.locator('#messages [data-delete-message=other]').count()==0
 page.evaluate("chatTest.remove('other')");assert page.evaluate('chatTest.deletes')==0
 page.once('dialog',lambda d:d.dismiss());page.locator('#messages [data-delete-message=mine]').click();assert page.evaluate('chatTest.deletes')==0
 page.evaluate('chatTest.fail=true');page.once('dialog',lambda d:d.accept());page.locator('#messages [data-delete-message=mine]').click();page.wait_for_function('document.querySelector("#toast").textContent==="Delete denied"');assert 'My message' in page.locator('#messages').inner_text()
 page.evaluate('chatTest.fail=false;chatTest.zero=true');page.once('dialog',lambda d:d.accept());page.locator('#messages [data-delete-message=mine]').click();page.wait_for_function('document.querySelector("#toast").textContent.includes("Message not deleted")');assert 'My message' in page.locator('#messages').inner_text()
 page.evaluate('chatTest.zero=false');page.once('dialog',lambda d:d.accept());page.locator('#messages [data-delete-message=mine]').click();page.wait_for_function('!document.querySelector("#messages [data-message-id=mine]")')
 assert 'Team reply' in page.locator('#messages').inner_text();assert 'My message' not in page.locator('#recentMessages').inner_text()
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 b.close();print('PASS chat deletion: own messages only, confirmation/cancel, failed and zero-row deletes retained, retry succeeds, chat/overview updated, other messages preserved and mobile layout.')

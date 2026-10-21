"""Brand workstation, discussion and moodboard checks with simulated storage."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture=(root/'tests/workspace-fixture.js').read_text()+'''
projects[0].name='Fragile';const baseFrom=db.from;
state.brandMessages=[{id:'bm1',project_id:'p1',user_id:'tertius',body:'Brand direction',created_at:'2026-10-18T10:00:00Z'},{id:'bm2',project_id:'p2',user_id:'tertius',body:'Other brand chat',created_at:'2026-10-18T10:00:00Z'}];
state.pins=[{id:'pin1',project_id:'p1',created_by:'tertius',title:'Warm rust',notes:'Fabric palette',kind:'colour',colour:'#a64b32',created_at:'2026-10-18T10:00:00Z'},{id:'pin2',project_id:'p2',created_by:'tertius',title:'Other brand pin',kind:'note',created_at:'2026-10-18T10:00:00Z'}];state.brandError=null;state.failBrand=false;state.setProjectName=name=>{projects[0].name=name;render()};
db.from=table=>{if(!table.startsWith('brand_'))return baseFrom(table);let filters=[],inserting=null,deleting=false,single=false,limit=Infinity;const rows=()=>table==='brand_messages'?state.brandMessages:state.pins;const q={select:()=>q,eq:(key,value)=>{filters.push(row=>row[key]===value);return q},order:()=>q,limit:n=>{limit=n;return q},insert:values=>{inserting=values;return q},delete:()=>{deleting=true;return q},maybeSingle:()=>{single=true;return q},then:(resolve,reject)=>Promise.resolve().then(()=>{if(state.brandError)return {error:{code:state.brandError}};if((inserting||deleting)&&state.failBrand)return {error:{message:'Brand save denied'}};if(inserting){rows().push({...inserting,id:'new-'+state.writes.length,created_at:new Date().toISOString()});state.writes.push({table,values:inserting});return {error:null}}let found=rows().filter(row=>filters.every(f=>f(row))).sort((a,b)=>b.created_at.localeCompare(a.created_at));if(deleting){for(const row of found)rows().splice(rows().indexOf(row),1);return {data:single?found[0]:found,error:null}}return {data:found.slice(0,limit).map(row=>({...row})),error:null}}).then(resolve,reject)};return q;};render();
'''
html=html.replace('</script></body>',fixture+'</script></body>')
from full_access_fixture import full_access_fixture
html=full_access_fixture(html)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']);page=b.new_page(viewport={'width':1280,'height':950});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/')
   if path.name in ('home.js','d3.min.js'):return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  if url=='https://images.example.com/pin.svg':return r.fulfill(body='<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#a64b32"/></svg>',content_type='image/svg+xml')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.ready');page.locator('#fragileShortcut').click()
 page.wait_for_function('!document.querySelector("#fragileAddPin").disabled');assert page.locator('#fragile').is_visible()
 assert page.locator('#fragile h1').inner_text()=='Fragile';assert 'FragileGothic' in page.locator('#fragile h1').evaluate('(el)=>getComputedStyle(el).fontFamily')
 assert 'Loden casting' in page.locator('#fragileEvents').inner_text();assert 'Other project audition' not in page.locator('#fragileEvents').inner_text()
 page.locator('#fragile [data-brand-add=calendar]').click();assert page.locator('#field-project_id').input_value()=='p1';page.locator('#cancelDialog').click()
 page.locator('#fragile [data-studio-tab=chat]').click();assert 'Brand direction' in page.locator('#fragileMessages').inner_text();assert 'Other brand chat' not in page.locator('#fragileMessages').inner_text();assert page.locator('#fragileMessages button').count()==0
 page.locator('#fragileChatText').fill('Collection ideas\nUse rust and black');page.evaluate('workspaceTest.failBrand=true');page.locator('#fragileChatSend').click();page.wait_for_function('document.querySelector("#fragileChatStatus").textContent==="Brand save denied"');assert 'Collection ideas' in page.locator('#fragileChatText').input_value()
 page.evaluate('workspaceTest.failBrand=false');page.locator('#fragileChatSend').click();page.wait_for_function('document.querySelector("#fragileMessages").textContent.includes("Collection ideas")');assert page.evaluate('workspaceTest.writes.at(-1).values.project_id')=='p1'
 page.once('dialog',lambda d:d.dismiss());page.locator('#fragileMessages button').click();assert 'Collection ideas' in page.locator('#fragileMessages').inner_text()
 page.once('dialog',lambda d:d.accept());page.locator('#fragileMessages button').click();page.wait_for_function('!document.querySelector("#fragileMessages").textContent.includes("Collection ideas")')
 page.locator('#fragile [data-studio-tab=board]').click();assert 'Warm rust' in page.locator('#fragileBoard').inner_text();assert 'Other brand pin' not in page.locator('#fragileBoard').inner_text()
 page.locator('#fragileAddPin').click();page.locator('#fragilePinTitle').fill('Campaign image');page.locator('#fragilePinUrl').fill('http://images.example.com/pin.svg');page.locator('#fragilePinSave').click();assert 'HTTPS' in page.locator('#fragilePinError').inner_text()
 page.locator('#fragilePinUrl').fill('https://images.example.com/pin.svg');page.locator('#fragilePinNotes').fill('Image direction');page.locator('#fragilePinSave').click();page.wait_for_function('!document.querySelector("#fragilePinDialog").open');assert page.locator('#fragileBoard img').count()==1;assert page.locator('#fragileBoard a').first.get_attribute('rel')=='noopener noreferrer'
 page.locator('#fragileAddPin').click();page.locator('#fragilePinKind').select_option('colour');page.locator('#fragilePinTitle').fill('Accent orange');page.locator('#fragilePinColour').fill('#ff9658');page.locator('#fragilePinSave').click();page.wait_for_function('!document.querySelector("#fragilePinDialog").open');assert 'Accent orange' in page.locator('#fragileBoard').inner_text()
 page.locator('#fragileAddPin').click();page.locator('#fragilePinKind').select_option('note');page.locator('#fragilePinTitle').fill('A written idea');page.locator('#fragilePinNotes').fill('<script>Safe text</script>');page.locator('#fragilePinSave').click();page.wait_for_function('!document.querySelector("#fragilePinDialog").open');assert '<script>Safe text</script>' in page.locator('#fragileBoard').inner_text()
 page.screenshot(path='/tmp/fragile-moodboard.png',full_page=True)
 page.once('dialog',lambda d:d.accept());page.locator('.fragile-pin').filter(has_text='A written idea').get_by_role('button',name='Remove pin').click();page.wait_for_function('!document.querySelector("#fragileBoard").textContent.includes("A written idea")')
 page.evaluate("workspaceTest.brandError='PGRST205'");page.locator('#fragileBoardPanel [data-brand-refresh]').click();page.wait_for_function('document.querySelector("#fragileBoardStatus").textContent.includes("need setup")');assert page.locator('#fragileAddPin').is_disabled()
 page.locator('#fragile [data-studio-tab=work]').click();page.locator('#fragileProjectWorkspace').click();assert page.locator('#projectWorkspace').is_visible();assert page.locator('#workspaceTitle').inner_text()=='Fragile'
 page.locator('#fragileShortcut').click();page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path='/tmp/fragile-workstation.png',full_page=True)
 page.set_viewport_size({'width':1280,'height':950});page.evaluate("workspaceTest.setProjectName('Unrelated brand')")
 assert page.locator('#fragileShortcut').is_enabled();page.locator('#fragileShortcut').click()
 assert page.locator('#fragile').is_visible();assert page.locator('#fragileConnectActions').is_visible()
 assert 'Loden casting' not in page.locator('#fragileEvents').inner_text()
 page.locator('#fragileCreateProject').click();assert page.locator('#field-name').input_value()=='Fragile';assert page.locator('#field-client').input_value()=='Clothing brand';page.locator('#cancelDialog').click()
 page.evaluate("workspaceTest.brandError=null;workspaceTest.setProjectName('Fragile')");page.locator('#fragileShortcut').click();page.wait_for_function('!document.querySelector("#fragileAddPin").disabled');assert page.locator('#fragileConnectActions').is_hidden()
 assert not errors,errors
 b.close();print('PASS Fragile: dedicated page and gothic font, scoped project work, event creation, brand-only chat, own deletion, failed-save recovery, image/colour/idea pins, HTTPS validation, escaped text, owner pin removal, setup state, project linking, mobile layout and missing-project sidebar recovery.')

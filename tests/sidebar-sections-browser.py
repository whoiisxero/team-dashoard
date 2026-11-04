"""Compact Quest sidebar: accessible page finder, permission filtering and native navigation."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';","const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture=(root/'tests/member-access-fixture.js').read_text()+"\ndb.auth={signOut:async()=>({error:null})};window.navigationReady=true;"
html=html.replace('</script></body>',fixture.replace('</script','<\\/script')+'</script></body>')
studio_url='https://form-development-studio-j7m4.whoisxerro.chatgpt.site/'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']);page=b.new_page(viewport={'width':1366,'height':900});errors=[]
 page.add_init_script('window.questTestCompactNavigation=true');page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/')
   if path.name in ['home.js','d3.min.js']:return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.context.route(studio_url+'**',lambda r:r.fulfill(body='<h1>Form Studio</h1>',content_type='text/html'))
 page.goto('http://dashboard.test/');page.wait_for_function('window.navigationReady')
 def find(text):
  page.keyboard.press('Control+k');page.locator('#questPageQuery').fill(text)
  page.wait_for_function('document.querySelector("#questPageFinder").open')
 def open_result(text):
  find(text);page.keyboard.press('Enter')
 assert page.locator('.sidebar-section').count()==5
 assert page.locator('.sidebar-section[open]').count()==0
 assert page.locator('.sidebar-quick [data-view]').evaluate_all('(buttons)=>buttons.filter(b=>!b.hidden).map(b=>b.dataset.view)')==['overview','tasks','calendar']
 assert page.locator('#sidebar .nav .nav-title').filter(has_text='My workspace').count()==0
 assert page.locator('.sidebar [data-view=events]').is_hidden()
 # Finder searches collapsed groups and opens their page with the current item highlighted.
 open_result('members');assert page.locator('#members').is_visible()
 assert page.locator('[data-nav-section=settings]').evaluate('(s)=>s.open')
 assert page.locator('.sidebar [data-view=members]').get_attribute('aria-current')=='page'
 page.locator('[data-nav-section=settings] summary').click()
 page.wait_for_function('JSON.parse(localStorage.getItem("quest-sidebar-sections-v2")).settings===false')
 page.reload();page.wait_for_function('window.navigationReady');assert not page.locator('[data-nav-section=settings]').evaluate('(s)=>s.open')
 # Search includes the page's old names, and the consolidated Notes tabs still use private data views.
 open_result('writing');assert page.locator('#writing').is_visible()
 assert page.locator('#writing h1').text_content()=='Notes'
 page.locator('#writing [data-view=business]').click();assert page.locator('#business').is_visible()
 assert page.locator('.sidebar [data-view=writing]').get_attribute('aria-current')=='page'
 page.locator('.sidebar-quick [data-view=calendar]').click();page.locator('#calendar [data-view=events]').click()
 assert page.locator('#events').is_visible();assert page.locator('.sidebar-quick [data-view=calendar]').get_attribute('aria-current')=='page'
 page.locator('#events [data-view=personalCalendar]').click();assert page.locator('#personalCalendar').is_visible()
 page.locator('.sidebar-quick [data-view=overview]').click();page.locator('#overview [data-navigation-tabs=home] [data-view=personalHome]').click()
 assert page.locator('#personalHome').is_visible();assert page.locator('.sidebar-quick [data-view=overview]').get_attribute('aria-current')=='page'
 # Native keyboard selection and a real external shortcut retain browser isolation.
 find('form development')
 with page.context.expect_page() as popup:page.keyboard.press('Enter')
 target=popup.value;target.wait_for_load_state('domcontentloaded');assert target.url==studio_url
 assert target.evaluate('window.opener===null&&document.referrer===""');target.close()
 # A global palette must close and forget its rows when switching accounts.
 find('members');assert 'Members' in page.locator('#questPageResults').text_content()
 page.evaluate("accessTest.switchUser('josh')");page.wait_for_function('document.querySelector("#userName").textContent==="Josh"')
 assert not page.locator('#questPageFinder').evaluate('(d)=>d.open')
 assert page.locator('#questPageResults').text_content()==''
 for text in ['members','fragile','loden','form studio','personal notes']:
  find(text);assert page.locator('#questPageResults [role=option]').count()==0,text;page.keyboard.press('Escape')
 find('dusted');assert page.locator('#questPageResults [role=option]').count()==1
 page.keyboard.press('Enter');assert page.locator('#dusted').is_visible()
 # Private clients get their own Calendar pin and no team or project entries.
 page.evaluate("accessTest.profiles.cas={ready:true,is_admin:false,personal_only:true,personal_workspace_ready:false,shared_access:false,editable_project_ids:[]};accessTest.records.team_members.push({user_id:'cas',display_name:'Cas'});accessTest.rules.cas=[];accessTest.switchUser('cas')")
 page.wait_for_function('document.querySelector("#userName").textContent==="Cas"')
 assert page.locator('.sidebar-quick [data-view=calendar]').is_hidden()
 assert page.locator('.sidebar-quick [data-view=personalCalendar]').is_visible()
 assert page.locator('.sidebar-quick [data-view=tasks]').is_hidden()
 for text in ['dusted','fragile','members','team chat','form studio']:
  find(text);assert page.locator('#questPageResults [role=option]').count()==0,text;page.keyboard.press('Escape')
 open_result('my calendar');assert page.locator('#personalCalendar').is_visible()
 # Expanded desktop menus still scroll independently, with pinned controls on screen.
 page.evaluate("accessTest.switchUser('quan')");page.wait_for_function('document.querySelector("#userName").textContent==="Quan"')
 page.evaluate('accessTest.expandNavigation()');menu=page.locator('.sidebar-sections')
 assert menu.evaluate('(s)=>s.scrollHeight>s.clientHeight')
 logo=page.locator('.sidebar-brand .logo').bounding_box();footer=page.locator('.sidebar-bottom').bounding_box();pins=page.locator('.sidebar-quick').bounding_box()
 menu.hover();page.mouse.wheel(0,650);page.wait_for_function('document.querySelector(".sidebar-sections").scrollTop>100')
 assert page.evaluate('scrollY')==0
 assert page.locator('.sidebar-brand .logo').bounding_box()==logo and page.locator('.sidebar-bottom').bounding_box()==footer and page.locator('.sidebar-quick').bounding_box()==pins
 page.evaluate("for(const group of document.querySelectorAll('.sidebar-section'))group.open=false;document.querySelector('.sidebar-sections').scrollTop=0;accessTest.navigate('overview')")
 page.screenshot(path='/tmp/quest-sidebar-refresh-desktop.png')
 page.set_viewport_size({'width':390,'height':844});page.locator('#menuButton').click()
 page.wait_for_function('document.querySelector("#sidebar").getBoundingClientRect().left>=-0.5')
 assert page.locator('#sidebar').evaluate('(s)=>getComputedStyle(s).position')=='fixed'
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/quest-sidebar-refresh-phone.png')
 page.locator('#questPageSearch').click();page.locator('#questPageQuery').fill('tasks');page.keyboard.press('Enter')
 assert page.locator('#tasks').is_visible() and page.locator('#menuButton').get_attribute('aria-expanded')=='false'
 assert page.evaluate('accessTest.writes.length')==0
 assert not errors,errors
 b.close();print('PASS compact sidebar: pinned essentials, collapsed groups/persistence, Ctrl+K/aliases/keyboard, Notes and Calendar tabs, current-page highlighting, isolated external shortcut, member/private-client filtering, account-switch clearing, independent scroll and mobile search.')

"""Real sidebar grouping, remembered expansion and account-scoped visibility."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM

root = Path(__file__).resolve().parents[1]
html = (root/'index.html').read_text().replace(
    "import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';",
    "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture = ''.join((root/'tests'/name).read_text() for name in [
    'member-access-fixture.js','personal-workspace-fixture.js','private-quotes-fixture.js'])
fixture += "\naccessTest.refreshRooms=()=>privateChats.refreshRooms();await accessTest.switchUser('quan');window.sidebarReady=true;"
html = html.replace('</script></body>', fixture.replace('</script','<\\/script')+'</script></body>')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1366,'height':1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    def route(r):
        url = r.request.url
        if url == 'http://dashboard.test/':
            return r.fulfill(body=html,content_type='text/html')
        if url.startswith('http://dashboard.test/'):
            path = root/url.removeprefix('http://dashboard.test/')
            if path.name in ['home.js','d3.min.js']:
                return r.fulfill(body='',content_type='application/javascript')
            return r.fulfill(body=path.read_bytes() if path.is_file() else b'',
                             content_type=mimetypes.guess_type(path)[0] or 'text/plain')
        return r.fulfill(body='',content_type='text/css')
    page.route('**/*', route)
    page.goto('http://dashboard.test/')
    page.wait_for_function('window.sidebarReady')
    assert page.locator('.sidebar-section').count() == 8
    # On desktop only the menu scrolls; the page, logo and account controls stay put.
    menu=page.locator('.sidebar-sections')
    assert menu.evaluate('(s)=>s.scrollHeight>s.clientHeight')
    assert page.locator('#sidebar').evaluate('(s)=>Math.abs(s.getBoundingClientRect().height-innerHeight)<1')
    logo=page.locator('#sidebar>.logo').bounding_box()
    footer=page.locator('.sidebar-bottom').bounding_box()
    assert footer['y']+footer['height']<=1000
    menu.hover();page.mouse.wheel(0,650)
    page.wait_for_function('document.querySelector(".sidebar-sections").scrollTop>100')
    assert page.evaluate('scrollY')==0
    assert page.locator('#sidebar>.logo').bounding_box()==logo
    assert page.locator('.sidebar-bottom').bounding_box()==footer
    page.evaluate('document.querySelector(".sidebar-sections").scrollTop=1e6')
    page.mouse.wheel(0,500)
    assert page.evaluate('scrollY')==0
    # Long main content can scroll without moving the menu or the pinned sidebar.
    page.evaluate("const filler=document.createElement('div');filler.id='scrollTestFiller';filler.style.height='1800px';document.querySelector('.main').append(filler);window.scrollTo(0,700)")
    page.wait_for_function('scrollY===700')
    assert page.locator('#sidebar').evaluate('(s)=>Math.abs(s.getBoundingClientRect().top)<1')
    assert page.locator('#sidebar>.logo').bounding_box()==logo
    assert page.locator('.sidebar-bottom').bounding_box()==footer
    page.evaluate('document.querySelector("#scrollTestFiller").remove();window.scrollTo(0,0);document.querySelector(".sidebar-sections").scrollTop=0')
    expected = {'overview':'daily','dashboard':'daily','myDay':'daily','notifications':'daily',
                'tasks':'planning','calendar':'planning','events':'planning','goals':'planning',
                'quotes':'business','invoices':'business','expenses':'business','writing':'business',
                'projects':'projects','dusted':'studios','discussions':'conversations',
                'trading':'tools','search':'tools','files':'tools','activity':'tools',
                'members':'settings','personalSetup':'settings'}
    for view, section in expected.items():
        assert page.locator('.sidebar .nav [data-view='+view+']').evaluate('(b)=>b.closest("details").dataset.navSection') == section, view
    for element in ['projectCount','notificationNavBadge','membersOnlineCount','fragileShortcut','projectNav','privateChatNav','appInstallMenu']:
        assert page.locator('#'+element).count() == 1, element
    assert page.locator('#fragileShortcut').evaluate('(b)=>b.closest("details").dataset.navSection') == 'studios'
    assert page.locator('#projectNav').evaluate('(b)=>b.closest("details").dataset.navSection') == 'projects'
    assert page.locator('#privateChatNav').evaluate('(b)=>b.closest("details").dataset.navSection') == 'conversations'
    business = page.locator('[data-nav-section=business]')
    business.locator('summary').click()
    assert not business.evaluate('(s)=>s.open')
    assert page.locator('.sidebar [data-view=quotes]').is_hidden()
    page.wait_for_function('JSON.parse(localStorage.getItem("quest-sidebar-sections-v1")).business===false')
    page.reload();page.wait_for_function('window.sidebarReady')
    assert not business.evaluate('(s)=>s.open')
    # Assistant/deep navigation opens the containing section without bypassing page permissions.
    page.evaluate("accessTest.navigate('quotes')")
    assert business.evaluate('(s)=>s.open')
    assert page.locator('#quotes').is_visible()
    business.locator('summary').focus();page.keyboard.press('Enter')
    assert not business.evaluate('(s)=>s.open')
    page.evaluate("document.querySelector('[data-nav-section=settings]').open=false;accessTest.navigate('members')")
    assert page.locator('[data-nav-section=settings]').evaluate('(s)=>s.open')
    assert page.locator('#members').is_visible()
    page.evaluate("document.querySelector('[data-nav-section=studios]').open=false;accessTest.navigate('fragile')")
    assert page.locator('[data-nav-section=studios]').evaluate('(s)=>s.open')
    assert page.locator('#fragile').is_visible()
    page.evaluate("accessTest.switchUser('josh')")
    page.wait_for_function('document.querySelector("#userName").textContent==="Josh"')
    page.wait_for_function('document.querySelector(".sidebar [data-view=businessStudio]").hidden')
    assert page.locator('[data-nav-section=business]').evaluate('(s)=>[...s.querySelectorAll("button")].filter(b=>!b.hidden).map(b=>b.dataset.view)') == ['expenses']
    assert page.locator('#fragileShortcut').is_hidden()
    assert page.locator('#lodenShortcut').is_hidden()
    assert page.locator('#dustedShortcut').is_visible()
    assert page.locator('.sidebar [data-view=members]').is_hidden()
    page.evaluate("accessTest.switchUser('cas')")
    page.wait_for_function('document.querySelector("#personalWelcome").textContent==="Welcome back, Carol"')
    page.wait_for_function('document.querySelector("[data-nav-section=studios]").hidden&&document.querySelector("[data-nav-section=projects]").hidden')
    assert page.locator('.sidebar [data-view=members]').is_hidden()
    assert page.locator('.sidebar [data-view=discussions]').is_hidden()
    # A room arriving or disappearing asynchronously updates its section header.
    page.evaluate("window.savedRooms=accessTest.records.private_chat_rooms;accessTest.records.private_chat_rooms=[];accessTest.refreshRooms()")
    page.wait_for_function('document.querySelector("[data-nav-section=conversations]").hidden')
    page.evaluate("accessTest.records.private_chat_rooms=savedRooms;accessTest.refreshRooms()")
    page.wait_for_function('!document.querySelector("[data-nav-section=conversations]").hidden')
    # The install action remains functional after moving into Settings & admin.
    page.evaluate("document.querySelector('[data-nav-section=settings]').open=true")
    page.locator('#appInstallMenu').click()
    assert page.locator('#appInstallDialog').is_visible()
    page.locator('#appInstallClose').click()
    # Owner view on phone: sections fit and selecting a route closes the drawer.
    page.evaluate("accessTest.switchUser('quan')")
    page.wait_for_function('document.querySelector("#userName").textContent==="Quan"')
    page.evaluate("for(const s of document.querySelectorAll('.sidebar-section'))s.open=['daily','planning','studios'].includes(s.dataset.navSection)")
    page.screenshot(path='/tmp/quest-sidebar-sections-desktop.png',full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    page.locator('#menuButton').click()
    page.wait_for_function('document.querySelector("#sidebar").getBoundingClientRect().left>=-0.5')
    assert page.locator('#sidebar').evaluate('(s)=>getComputedStyle(s).position')=='fixed'
    assert menu.evaluate('(s)=>getComputedStyle(s).overflowY')=='visible'
    assert page.locator('#sidebar').evaluate('(s)=>s.scrollWidth<=s.clientWidth')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path='/tmp/quest-sidebar-sections-phone.png')
    page.locator('.sidebar [data-view=tasks]').click()
    assert page.locator('#tasks').is_visible()
    assert page.locator('#menuButton').get_attribute('aria-expanded') == 'false'
    assert not errors, errors
    browser.close()
    print('PASS sidebar: independent desktop menu scrolling, pinned logo/account controls, page scrolling, grouped routes/badges, collapse/persistence, permissions/private rooms, installation and unchanged phone drawer.')

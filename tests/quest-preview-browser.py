"""Exercise the real tour and existing private-account route guards using mock transport."""
from pathlib import Path
import mimetypes
import json
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM

root = Path(__file__).resolve().parents[1]
html = (root / 'index.html').read_text().replace(
    "import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';",
    "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture = ''.join((root / 'tests' / name).read_text() for name in [
    'member-access-fixture.js', 'personal-workspace-fixture.js', 'private-quotes-fixture.js'])
fixture += '''
// Deliberately seed live account data with unique markers to detect accidental reuse.
accessTest.records.projects.push({id:'secret-project',name:'REAL_PROJECT_SECRET'});
accessTest.records.team_members.push({user_id:'secret-member',display_name:'REAL_MEMBER_SECRET'});
accessTest.records.discussion_messages.push({id:'secret-message',body:'REAL_CHAT_SECRET'});
window.previewReady=true;
'''
html = html.replace('</script></body>', fixture.replace('</script', '<\\/script') + '</script></body>')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1366, 'height': 1000})
    errors, public_requests = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))

    def route(r):
        url = r.request.url
        if url.startswith('https://open.er-api.com/'):
            public_requests.append(r.request.headers)
            return r.fulfill(json={'result':'success','base_code':'ZAR','time_last_update_unix':1792195200,'rates':{'ZAR':1,'USD':0.05}})
        if url.startswith('https://api.coingecko.com/'):
            public_requests.append(r.request.headers)
            rows = [{'id':coin,'name':name,'symbol':ticker,'market_cap_rank':rank,'current_price':price,'last_updated':'2026-10-30T10:00:00Z'}
                    for coin,name,ticker,rank,price in [('bitcoin','Bitcoin','btc',1,100000),('ethereum','Ethereum','eth',2,5000),('tether','Tether','usdt',3,1),('binancecoin','BNB','bnb',4,500),('usd-coin','USDC','usdc',5,1)]]
            return r.fulfill(json=rows)
        if url.startswith('https://s3.tradingview.com/'):
            public_requests.append(r.request.headers)
            kind = 'chart' if 'advanced-chart' in url else 'quotes'
            script = """(()=>{const script=document.currentScript;if(!script?.parentElement?.isConnected)return;const config=JSON.parse(script.textContent);(window.marketWidgetTests||=[]).push({kind:KIND,config});const frame=document.createElement('iframe');frame.src='about:blank';script.parentElement.querySelector('.tradingview-widget-container__widget').append(frame);})();""".replace('KIND', json.dumps(kind))
            return r.fulfill(body=script, content_type='application/javascript')
        if url == 'http://dashboard.test/':
            return r.fulfill(body=html, content_type='text/html')
        if url.startswith('http://dashboard.test/'):
            path = root / url.removeprefix('http://dashboard.test/')
            return r.fulfill(body=path.read_bytes() if path.is_file() else b'',
                             content_type=mimetypes.guess_type(path)[0] or 'text/plain')
        return r.fulfill(body='', content_type='text/css')

    page.route('**/*', route)
    page.goto('http://dashboard.test/')
    page.wait_for_function('window.previewReady')
    assert page.locator('#personalWelcome').text_content() == 'Welcome back, Carol'
    page.locator('.sidebar [data-view=questPreview]').click()
    assert page.locator('#questPreview').is_visible()
    assert page.locator('#crumb').text_content() == 'Explore Quest'
    assert 'fictional demo content' in page.locator('#questPreview').inner_text()
    assert page.locator('#questPreview [data-project], #questPreview [data-add], #questPreview [data-view], #questPreview a').count() == 0
    assert page.locator('#questPreviewOverview button:disabled').count() == 3
    for secret in ['REAL_PROJECT_SECRET', 'REAL_MEMBER_SECRET', 'REAL_CHAT_SECRET', 'Josh', 'Richard', 'Dusted', 'Fragile', 'Loden']:
        assert secret not in page.locator('#questPreview').text_content(), secret
    before = page.evaluate('({team:accessTest.writes.length,private:accessTest.personal.writes.length,quotes:accessTest.quotes.attempts.length})')
    page.locator('[data-preview-tab=planner]').click()
    assert page.locator('#questPreviewPlanner').is_visible()
    assert page.locator('#questPreviewOverview').is_hidden()
    assert page.locator('[data-preview-tab=planner]').get_attribute('aria-pressed') == 'true'
    assert '09:00' in page.locator('#questPreviewPlanner').inner_text()
    # Keyboard use follows normal button behavior.
    page.locator('[data-preview-tab=tools]').focus()
    page.keyboard.press('Enter')
    assert page.locator('#questPreviewTools').is_visible()
    assert page.locator('#questPreviewPlanner').is_hidden()
    assert 'Moodboards & references' in page.locator('#questPreviewTools').inner_text()
    assert page.evaluate('({team:accessTest.writes.length,private:accessTest.personal.writes.length,quotes:accessTest.quotes.attempts.length})') == before
    for view in ['dashboard', 'projects', 'members', 'discussions', 'fragile', 'loden', 'dusted']:
        page.evaluate('(view)=>accessTest.navigate(view)', view)
        assert page.locator('#questPreview').is_visible(), view
    # Tour remains usable on narrow phones without horizontal overflow.
    for width in [320, 390, 768]:
        page.set_viewport_size({'width': width, 'height': 844})
        for tab in ['overview', 'planner', 'tools']:
            page.locator('[data-preview-tab='+tab+']').click()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), (width, tab)
    page.screenshot(path='/tmp/quest-explore-mobile.png', full_page=True)
    page.set_viewport_size({'width': 1366, 'height': 1000})
    page.evaluate("accessTest.navigate('overview')")
    assert page.locator('#personalHome').is_visible()
    page.locator('.sidebar [data-view=businessStudio]').click()
    assert page.locator('#businessStudioTitle').text_content() == 'Ki Lifestyle'
    # Public tools do not redirect Home away from Carol's private dashboard.
    page.locator('.sidebar [data-view=globe]').click()
    assert page.locator('#overview').is_visible()
    assert page.locator('#crumb').text_content() == 'Globe'
    assert page.locator('.sidebar [data-view=globe]').evaluate('(b)=>b.classList.contains("active")')
    page.wait_for_function('document.querySelector("#countrySelect").options.length>200')
    page.locator('#countrySelect').select_option('USA')
    page.wait_for_function('document.querySelector("#countryRates").textContent.includes("1 USD = R20")')
    assert page.locator('#countryZone option').count() > 1
    page.locator('#countryZone').select_option('America/New_York')
    assert page.locator('#countryClock').text_content()
    page.locator('#globeSize').click()
    assert page.locator('#globeSize').get_attribute('aria-pressed') == 'true'
    page.locator('.sidebar [data-view=trading]').click()
    page.wait_for_function('document.querySelectorAll(".trading-coin").length===5&&window.marketWidgetTests?.length===2')
    page.locator('[data-market=gold]').click()
    page.wait_for_function('marketWidgetTests.filter(x=>x.kind==="chart").at(-1).config.symbol==="OANDA:XAUUSD"')
    page.locator('[data-interval="1"]').click()
    page.wait_for_function('marketWidgetTests.filter(x=>x.kind==="chart").at(-1).config.interval==="1"')
    page.locator('[data-interval="60"]').click()
    page.wait_for_function('marketWidgetTests.filter(x=>x.kind==="chart").at(-1).config.interval==="60"')
    for forbidden in ['projects', 'members', 'discussions', 'dusted', 'fragile', 'loden']:
        page.evaluate('(view)=>accessTest.navigate(view)', forbidden)
        assert page.locator('#trading').is_visible(), forbidden
    assert public_requests and all('authorization' not in headers and 'apikey' not in headers for headers in public_requests)
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.evaluate("accessTest.navigate('globe')")
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.set_viewport_size({'width':1366,'height':1000})
    page.locator('.sidebar .nav [data-view=overview]').click()
    assert page.locator('#personalHome').is_visible()
    assert page.locator('#crumb').text_content() == 'My workspace'
    assert page.evaluate('({team:accessTest.writes.length,private:accessTest.personal.writes.length,quotes:accessTest.quotes.attempts.length})') == before
    # Switching away from a personal account removes the tour entry and resets its local tab.
    page.evaluate("accessTest.switchUser('tertius')")
    page.wait_for_function('document.querySelector("#userName").textContent==="Tertius"')
    assert page.locator('.sidebar [data-view=questPreview]').is_hidden()
    page.evaluate("accessTest.navigate('questPreview')")
    assert page.locator('#questPreview').is_hidden()
    page.evaluate("accessTest.switchUser('quan')")
    page.wait_for_function('document.querySelector("#userName").textContent==="Quan"')
    page.locator('.sidebar [data-view=questPreview]').click()
    assert page.locator('#questPreviewOverview').is_visible()
    assert not errors, errors
    browser.close()
    print('PASS Explore Quest and public tools: fictional content, locked cards, keyboard tabs, globe/countries/rates, Trading view and minute/hour charts, no credentials sent to public providers, no writes, private route guards, phone widths, private Home and account-switch reset. Public providers mocked.')

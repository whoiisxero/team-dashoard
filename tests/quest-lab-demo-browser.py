"""Quest Lab: offline interactions, honest simulation, lifecycle and scoped member access."""
from pathlib import Path
import json
import mimetypes
import os
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM

root = Path(__file__).resolve().parents[1]
output = Path(os.environ.get('QUEST_LAB_OUTPUT','/workspace/outputs'))
errors, external = [], []

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1120}, device_scale_factor=1)
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    demo_url = 'http://dashboard.test/quest-lab-demo/'
    demo_html = (output/'Quest-Lab-Demo.html').read_text()
    page.route(demo_url, lambda r: r.fulfill(body=demo_html, content_type='text/html'))
    page.on('request', lambda r: external.append(r.url) if r.url != demo_url else None)
    page.goto(demo_url)
    page.wait_for_function('() => window.questLabDemo?.snapshot().frames > 2')
    snap = lambda: page.evaluate('questLabDemo.snapshot()')
    assert snap()['galaxy']['nodes'] == 760
    assert snap()['galaxy']['edges'] > 1500
    assert 'DEMO · SAMPLE DATA' in page.inner_text('body')
    assert page.locator('#ql-universe').is_visible()
    # Pause stops both camera and animation frames; pointer and keyboard navigation still work.
    page.locator('#ql-universe [data-action=motion]').click()
    before = snap()
    page.wait_for_timeout(180)
    assert snap()['frames'] == before['frames'] and not snap()['animating']
    canvas = page.locator('[data-canvas=galaxy]')
    box = canvas.bounding_box()
    page.mouse.move(box['x'] + box['width']*.5, box['y'] + box['height']*.5)
    page.mouse.down()
    page.mouse.move(box['x'] + box['width']*.65, box['y'] + box['height']*.6, steps=8)
    page.mouse.up()
    assert abs(snap()['galaxy']['yaw']-before['galaxy']['yaw']) > .1
    page.locator('[data-action=galaxy-in]').click()
    assert snap()['galaxy']['zoom'] > 1
    # Sample picker + direct picking illuminate a neighborhood.
    page.locator('[data-control=node]').select_option('47')
    assert snap()['galaxy']['selected'] == 47
    assert 'direct connections' in page.locator('[data-read=focus-description]').inner_text()
    page.locator('[data-action=clear-node]').click()
    assert snap()['galaxy']['selected'] is None
    pos = snap()['galaxy']['positions'][2]
    canvas.click(position={'x': pos['x'], 'y': pos['y']})
    assert snap()['galaxy']['selected'] is not None
    page.locator('[data-control=layout]').select_option('spiral')
    assert snap()['galaxy']['layout'] == 'spiral'
    page.locator('[data-control=layout]').select_option('sphere')
    assert snap()['galaxy']['layout'] == 'sphere'
    page.locator('[data-cluster="2"]').click()
    assert snap()['galaxy']['filter'] == 2
    assert int(page.locator('[data-read=visible-nodes]').inner_text().replace(',','')) == 190
    page.locator('[data-control=density]').select_option('light')
    assert snap()['galaxy']['nodes'] == 360 and snap()['galaxy']['filter'] is None
    page.locator('[data-control=density]').select_option('balanced')
    page.locator('[data-control=layout]').select_option('orbit')
    page.locator('[data-action=galaxy-reset]').click()
    canvas.focus()
    page.keyboard.press('ArrowRight')
    assert snap()['galaxy']['yaw'] > .46
    page.keyboard.press('Home')
    assert snap()['galaxy']['yaw'] == .46
    page.locator('[data-control=node]').select_option('188')
    page.locator('[data-action=clear-node]').click()
    page.locator('[data-action=galaxy-reset]').click()
    page.mouse.move(10,10)
    page.screenshot(path=str(output/'Quest-Lab-Galaxy-Desktop.png'), full_page=True)

    # Synthetic market paths, actual derived quantiles and interval/time navigation.
    page.locator('[data-tab=forecast]').click()
    f = snap()['forecast']
    assert f['paths'] == 100 and f['candles'] == 180
    assert all(q['low'] <= q['median'] <= q['high'] for q in f['quantiles'])
    assert int(page.locator('[data-read=up-count]').inner_text()) == f['up']
    assert int(page.locator('[data-read=down-count]').inner_text()) == 100-f['up']
    assert 'NO AI MODEL' in page.locator('#ql-forecast').inner_text()
    assert 'not a measured confidence' in page.locator('#ql-forecast').inner_text()
    chart = page.locator('[data-canvas=forecast]')
    chart.hover(position={'x': 200, 'y': 220})
    assert 'SAST' in page.locator('[data-read=crosshair]').inner_text()
    cb = chart.bounding_box()
    page.mouse.move(cb['x']+200, cb['y']+200); page.mouse.down()
    page.mouse.move(cb['x']+380, cb['y']+200, steps=7); page.mouse.up()
    assert snap()['forecast']['pan'] > 0
    page.locator('[data-action=forecast-in]').click()
    assert snap()['forecast']['span'] < 56
    page.locator('[data-action=forecast-reset]').click()
    assert snap()['forecast']['pan'] == 0 and snap()['forecast']['span'] == 56
    page.locator('[data-control=interval]').select_option('5')
    f = snap()['forecast']
    assert f['interval'] == 5 and f['lastCandle']-f['firstCandle'] == 179*5*60000
    assert 'SAST' in page.locator('[data-read=horizon-date]').inner_text()
    page.locator('[data-control=asset]').select_option('eth')
    assert snap()['forecast']['anchor'] == 2840
    old = snap()['forecast']['quantiles'][-1]
    page.locator('[data-action=scenario]').click()
    assert snap()['forecast']['seed'] == 2 and snap()['forecast']['quantiles'][-1] != old
    page.locator('[data-control=asset]').select_option('btc')
    page.locator('[data-control=interval]').select_option('60')
    page.mouse.move(10, 10)
    page.screenshot(path=str(output/'Quest-Lab-Forecast-Desktop.png'), full_page=True)
    # Every menu market must generate finite ordered paths and update its labels/units.
    asset_select=page.locator('[data-control=asset]')
    options=asset_select.locator('option').evaluate_all('(options)=>options.map(o=>({id:o.value,label:o.textContent,group:o.parentElement.label}))')
    assert len(options)==18 and len({o['id'] for o in options})==18
    assert {o['group'] for o in options}=={'Stocks','Crypto','Metals','Energy'}
    assert next(o for o in options if o['id']=='nvda')['label']=='NVIDIA · NVDA'
    for option in options:
        asset_select.select_option(option['id'])
        market=snap()['forecast']
        assert market['asset']==option['id'] and market['paths']==100 and market['candles']==180
        assert all(0<q['low']<=q['median']<=q['high'] for q in market['quantiles'])
        assert market['symbol'] in page.locator('[data-read=chart-title]').inner_text()
        assert market['unit'] in page.locator('[data-read=quote-unit]').inner_text()
        assert market['unit'] in page.locator('[data-read=median-title]').text_content()
        assert market['name'] in chart.get_attribute('aria-label')
        assert 'SIMULATION' in page.locator('#ql-forecast').inner_text()
        assert 'NaN' not in page.locator('#ql-forecast').inner_text()
        median=page.locator('[data-read=median-big]').inner_text()
        assert ('.' in median and len(median.rsplit('.',1)[1])==market['decimals']) if market['decimals'] else '.' not in median
    # Stock prices retain cents; low-priced assets retain distinct scenario values.
    asset_select.select_option('nvda')
    assert snap()['forecast']['anchor']==145 and snap()['forecast']['unit']=='USD / share'
    assert page.locator('[data-read=anchor]').inner_text()=='145.00 USD'
    for selected_interval in ['1','60','240']:
        page.locator('[data-control=interval]').select_option(selected_interval)
        assert snap()['forecast']['interval']==int(selected_interval)
    page.locator('[data-control=interval]').select_option('60')
    page.mouse.move(10,10)
    page.screenshot(path=str(output/'Quest-Forecast-NVIDIA-Desktop.png'),full_page=True)
    for low_price in ['xrp','copper']:
        asset_select.select_option(low_price)
        page.locator('[data-control=interval]').select_option('1')
        assert page.locator('[data-read=p90]').inner_text()!=page.locator('[data-read=p10]').inner_text()
    asset_select.select_option('btc')
    page.locator('[data-control=interval]').select_option('60')
    # Canvas actually contains many lit pixels, not an empty placeholder.
    for selector in ['[data-canvas=forecast]']:
        assert page.locator(selector).evaluate("""c => {
          const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0;
          for(let i=0;i<d.length;i+=40)if(d[i]>60||d[i+1]>90||d[i+2]>100)n++; return n>500;
        }""")
    page.locator('#ql-forecast [data-action=motion]').click()
    page.wait_for_function('() => questLabDemo.snapshot().animating')
    page.evaluate('questLabDemo.setVisible(false)')
    hidden = snap()['frames']; page.wait_for_timeout(120)
    assert snap()['frames'] == hidden and not snap()['animating']
    page.evaluate('questLabDemo.setVisible(true)')
    page.wait_for_function('() => questLabDemo.snapshot().frames > '+str(hidden))
    page.evaluate('questLabDemo.reset()')
    assert snap()['tab'] == 'universe' and snap()['galaxy']['selected'] is None
    assert not snap()['visible'] and not snap()['animating']

    # Actual small touch viewport, reduced motion and pointer interactions.
    phone = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, reduced_motion='reduce')
    mobile = phone.new_page()
    mobile.on('pageerror', lambda e: errors.append(str(e)))
    mobile.route(demo_url, lambda r: r.fulfill(body=demo_html, content_type='text/html'))
    phone.set_offline(True)
    mobile.goto(demo_url)
    mobile.wait_for_function('() => window.questLabDemo')
    assert mobile.evaluate('questLabDemo.snapshot().paused && !questLabDemo.snapshot().animating')
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert mobile.evaluate('questLabDemo.snapshot().galaxy.nodes') == 320
    mobile.locator('[data-control=node]').select_option('80')
    mobile.screenshot(path=str(output/'Quest-Lab-Galaxy-Mobile.png'), full_page=True)
    mobile.locator('[data-tab=forecast]').tap()
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
    mobile.locator('[data-control=interval]').select_option('1')
    assert mobile.evaluate('questLabDemo.snapshot().forecast.interval') == 1
    mobile.screenshot(path=str(output/'Quest-Lab-Forecast-Mobile.png'), full_page=True)
    mobile.locator('[data-control=asset]').select_option('nvda')
    assert 'NVIDIA' in mobile.locator('[data-read=chart-title]').inner_text()
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
    mobile.screenshot(path=str(output/'Quest-Forecast-NVIDIA-Mobile.png'),full_page=True)
    # Keyboard-accessible tab navigation.
    mobile.locator('[data-tab=forecast]').focus(); mobile.keyboard.press('ArrowLeft')
    assert mobile.evaluate('questLabDemo.snapshot().tab') == 'universe'
    assert external == [], external
    phone.close()

    # In-app permission and lifecycle checks, using existing local access fixtures.
    html = (root/'index.html').read_text().replace(
        "import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';",
        "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
    fixture = (root/'tests/member-access-fixture.js').read_text() + """
    db.auth={getSession:async()=>({data:{session:{access_token:'test-session-'+user.id}}})};
    accessTest.lab=questLab;accessTest.enter=enterApp;window.questLabAppReady=true;
    """
    html = html.replace('</script></body>', fixture.replace('</script','<\\/script')+'</script></body>')
    app = context.new_page()
    app.on('pageerror', lambda e: errors.append(str(e)))
    trading_denied = set()
    trading_requests = []
    def route(r):
        url = r.request.url
        if url == 'http://dashboard.test/api/trading-access':
            actor = r.request.headers.get('authorization','').removeprefix('Bearer test-session-')
            trading_requests.append(actor)
            return r.fulfill(json={'allowed':actor in ('josh','tertius') and actor not in trading_denied},headers={'Cache-Control':'no-store'})
        if url == 'http://dashboard.test/':
            return r.fulfill(body=html, content_type='text/html')
        if url.startswith('http://dashboard.test/'):
            path = root/url.removeprefix('http://dashboard.test/').split('?')[0]
            return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
        return r.fulfill(body='',content_type='text/css')
    app.route('**/*',route)
    app.goto('http://dashboard.test/')
    app.wait_for_function('() => window.questLabAppReady')
    app.wait_for_function('() => document.querySelector("#countrySelect").options.length>200')
    assert app.locator('#questHomeLab').is_visible()
    assert app.locator('#questHomeLab .ql-main-title').inner_text() == 'Quest Lab'
    assert app.locator('#worldGlobe').is_visible() and app.locator('#connectionSpeed').is_visible()
    assert app.locator('#overview h1').count() == 1
    app.locator('#questHomeLab .ql-main-title').scroll_into_view_if_needed()
    app.wait_for_function("() => accessTest.lab.snapshot().frames > 1")
    assert app.evaluate('accessTest.lab.snapshot().location') == 'home'
    # The complete demo works from Home; full-page mode reuses it without duplicate IDs or reset.
    app.locator('#questHomeLab [data-tab=forecast]').click()
    app.locator('#questHomeLab [data-control=interval]').select_option('15')
    app.locator('#questHomeLab [data-action=scenario]').click()
    scenario = app.evaluate('accessTest.lab.snapshot().forecast')
    app.locator('#questHomeLab [data-lab-open=page]').click()
    assert app.locator('#questLab').is_visible()
    assert app.evaluate('accessTest.lab.snapshot().location') == 'page'
    assert app.evaluate('accessTest.lab.snapshot().tab') == 'forecast'
    assert app.evaluate('accessTest.lab.snapshot().forecast.seed') == scenario['seed']
    assert app.evaluate('accessTest.lab.snapshot().forecast.interval') == 15
    assert app.locator('[data-canvas=galaxy]').count() == 1
    assert app.locator('[data-canvas=forecast]').count() == 1
    app.locator('#questLab [data-lab-open=home]').click()
    assert app.evaluate('accessTest.lab.snapshot().location') == 'home'
    assert app.locator('#questHomeLab #ql-forecast').is_visible()
    assert app.evaluate('accessTest.lab.snapshot().forecast.quantiles') == scenario['quantiles']
    app.locator('#questHomeLab [data-tab=universe]').click()
    assert app.evaluate('document.documentElement.scrollWidth <= innerWidth')
    app.screenshot(path=str(output/'Quest-Home-Lab-Desktop.png'), full_page=True)
    app.locator('#questHomeLab').screenshot(path=str(output/'Quest-Home-Lab-Panel.png'))
    app.locator('#questHomeLab [data-lab-open=page]').click()
    app.wait_for_function("() => accessTest.lab.snapshot().animating")
    app.screenshot(path=str(output/'Quest-Lab-In-Quest-Desktop.png'), full_page=True)
    assert app.locator('.sidebar [data-view=questLab]').get_attribute('hidden') is None
    # The requested My workspace screen embeds the same surface immediately below its welcome.
    app.evaluate("accessTest.navigate('personalHome')")
    assert app.locator('#questWorkspaceLab').is_visible()
    assert app.evaluate('accessTest.lab.snapshot().location') == 'workspace'
    assert app.locator('#personalHome .personal-hero + #questWorkspaceLab').count() == 1
    assert app.locator('#questWorkspaceLab .ql-main-title').inner_text() == 'Quest Lab'
    app.locator('#questWorkspaceLab [data-tab=forecast]').click()
    app.locator('#questWorkspaceLab [data-control=interval]').select_option('5')
    app.locator('#questWorkspaceLab [data-action=scenario]').click()
    app.locator('#questWorkspaceLab [data-control=asset]').select_option('nvda')
    workspace_seed = app.evaluate('accessTest.lab.snapshot().forecast.seed')
    app.locator('#questWorkspaceLab [data-lab-open=page]').click()
    assert app.locator('#questLab [data-lab-open=home]').inner_text() == '← Back to My workspace'
    app.locator('#questLab [data-lab-open=home]').click()
    assert app.locator('#personalHome').is_visible()
    assert app.evaluate('accessTest.lab.snapshot().location') == 'workspace'
    assert app.evaluate('accessTest.lab.snapshot().forecast.seed') == workspace_seed
    assert app.evaluate('accessTest.lab.snapshot().forecast.interval') == 5
    assert app.evaluate('accessTest.lab.snapshot().forecast.asset') == 'nvda'
    assert app.locator('[data-canvas=galaxy]').count() == 1
    app.locator('#questWorkspaceLab [data-tab=universe]').click()
    app.locator('#questWorkspaceLab .ql-main-title').scroll_into_view_if_needed()
    app.screenshot(path=str(output/'Quest-Workspace-Lab-Desktop.png'))
    app.locator('#questWorkspaceLab').screenshot(path=str(output/'Quest-Workspace-Lab-Panel.png'))
    app.set_viewport_size({'width':390,'height':844})
    app.locator('#questWorkspaceLab .ql-main-title').scroll_into_view_if_needed()
    assert app.evaluate('document.documentElement.scrollWidth <= innerWidth')
    app.screenshot(path=str(output/'Quest-Workspace-Lab-Mobile.png'))
    app.set_viewport_size({'width':1440,'height':1120})
    # A direct workspace link is applied after sign-in; the return state remains permission checked.
    app.evaluate("history.replaceState(null,'','/?view=personalHome'); accessTest.enter({id:'quan'})")
    app.wait_for_function("() => document.querySelector('#personalHome').classList.contains('active')")
    assert app.locator('#questWorkspaceLab').is_visible()
    assert app.evaluate("new URLSearchParams(location.search).has('view')") is False
    # Stop the expensive scene on other pages and when it is scrolled out of view.
    app.evaluate("accessTest.navigate('tasks')")
    before = app.evaluate('accessTest.lab.snapshot().frames')
    app.wait_for_timeout(150)
    assert app.evaluate('accessTest.lab.snapshot().frames') == before
    assert not app.evaluate('accessTest.lab.snapshot().animating')
    app.evaluate("accessTest.navigate('overview')")
    app.set_viewport_size({'width':390,'height':844})
    app.locator('#questHomeLab .ql-main-title').scroll_into_view_if_needed()
    assert app.locator('#questHomeLab').is_visible()
    assert app.evaluate('document.documentElement.scrollWidth <= innerWidth')
    app.screenshot(path=str(output/'Quest-Home-Lab-Mobile.png'), full_page=True)
    app.evaluate('scrollTo(0,0)')
    app.wait_for_function("() => !accessTest.lab.snapshot().animating")
    app.set_viewport_size({'width':1440,'height':1120})
    app.evaluate("accessTest.navigate('questLab'); accessTest.switchUser('josh')")
    app.wait_for_function('() => document.querySelector("#userName").textContent==="Josh"')
    app.wait_for_function('() => !document.querySelector("#questHomeLab").hidden')
    app.locator('#questHomeLab .ql-main-title').scroll_into_view_if_needed()
    assert app.locator('#questHomeLab').is_visible()
    assert app.locator('.sidebar [data-view=questLab]').is_visible()
    assert app.locator('#questHomeLab .ql-main-title').inner_text() == 'Trading view'
    assert app.evaluate('accessTest.lab.snapshot().tab') == 'forecast'
    assert app.evaluate('Boolean(document.querySelector("#worldGlobe").compareDocumentPosition(document.querySelector("#questHomeLab")) & Node.DOCUMENT_POSITION_FOLLOWING)')
    assert 'SIMULATION' in app.locator('#questHomeLab').inner_text().upper()
    assert app.locator('#questWorkspaceLab').is_hidden()
    assert app.locator('.sidebar [data-view=members]').is_hidden()
    assert app.locator('#onlineMemberList').inner_text() == ''
    assert app.locator('#fragileShortcut').is_hidden()
    assert app.locator('#dustedShortcut').is_visible()
    app.evaluate("accessTest.navigate('personalHome')")
    assert not app.locator('#personalHome').evaluate('(el)=>el.classList.contains("active")')
    app.locator('#questHomeLab [data-lab-open=page]').click()
    assert app.locator('#questLab').is_visible()
    app.locator('#questLab [data-lab-open=charts]').click()
    assert app.locator('#trading').is_visible()
    app.evaluate("accessTest.navigate('overview')")
    previous = app.evaluate('accessTest.lab.snapshot().forecast')
    app.evaluate('accessTest.refresh()')
    app.wait_for_function('() => !document.querySelector("#questHomeLab").hidden')
    assert app.evaluate('accessTest.lab.snapshot().forecast') == previous
    # A failed/revoked permission check removes the section and exits its full-page view.
    trading_denied.add('josh')
    app.evaluate("accessTest.navigate('questLab');accessTest.refresh()")
    app.wait_for_function('() => document.querySelector("#questHomeLab").hidden')
    assert app.locator('#overview').is_visible()
    assert app.locator('#questLab').is_hidden()
    assert app.locator('[data-canvas=galaxy]').count() == 0
    trading_denied.clear()
    app.evaluate("accessTest.switchUser('tertius')")
    app.wait_for_function('() => document.querySelector("#userName").textContent==="Tertius"')
    app.wait_for_function('() => !document.querySelector("#questHomeLab").hidden')
    app.locator('#questHomeLab .ql-main-title').scroll_into_view_if_needed()
    assert app.evaluate('accessTest.lab.snapshot().tab') == 'forecast'
    assert app.locator('#fragileShortcut').is_visible()
    assert app.locator('#dustedShortcut').is_hidden()
    assert app.locator('.sidebar [data-view=members]').is_hidden()
    assert app.locator('#questWorkspaceLab').is_hidden()
    app.set_viewport_size({'width':390,'height':844})
    assert app.evaluate('document.documentElement.scrollWidth <= innerWidth')
    app.screenshot(path=str(output/'Quest-Tertius-Home-Trading.png'), full_page=True)
    app.evaluate("accessTest.profiles.richard={ready:true,is_admin:false,shared_access:false};accessTest.records.team_members.push({user_id:'richard',display_name:'Richard'});accessTest.rules.richard=[];accessTest.switchUser('richard')")
    app.wait_for_function('() => document.querySelector("#userName").textContent==="Richard"')
    assert app.locator('#questHomeLab').is_hidden()
    app.evaluate("accessTest.profiles.cas={ready:true,is_admin:false,personal_only:true,shared_access:false,editable_project_ids:[]};accessTest.records.team_members.push({user_id:'cas',display_name:'Cas'});accessTest.rules.cas=[];accessTest.switchUser('cas')")
    app.wait_for_function('() => document.querySelector("#userName").textContent==="Cas"')
    assert app.locator('.sidebar [data-view=questLab]').is_hidden()
    assert app.locator('#questHomeLab').is_hidden()
    assert app.locator('#questWorkspaceLab').is_hidden()
    assert 'josh' in trading_requests and 'tertius' in trading_requests and 'richard' in trading_requests
    assert 'cas' not in trading_requests
    assert app.evaluate('accessTest.writes.length') == 0
    assert not errors, errors
    report = {'result':'PASS','offline':True,'external_requests':external,'console_errors':errors,
              'checks':['galaxy orbit/zoom/select/filter/forms/detail','18 grouped markets / NVIDIA / price precision / quote units','simulation quantiles/intervals/assets/seeds','historical chart drag/zoom/crosshair','pause/reduced motion/hidden page lifecycle','390px touch layout','owner Home / My workspace embedding and full-page continuity','workspace sign-in deep link','one renderer / offscreen and off-route pause','Tertius and Josh Home trading under the globe / market charts / scoped API capability','refresh and revoked capability / other members and private workspace excluded / account reset']}
    (output/'Quest-Lab-Test-Results.json').write_text(json.dumps(report,indent=2))
    browser.close()
    print(json.dumps(report,indent=2))

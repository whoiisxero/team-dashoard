"""Phone reflow and available-height changes, using the real app and controllers."""
from pathlib import Path
import datetime, mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM

root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';","const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture='\n'.join((root/'tests'/name).read_text() for name in ['member-access-fixture.js','private-chats-fixture.js','daily-workflow-fixture.js']).replace('</script','<\\/script')
html=html.replace('</script></body>',fixture+'\nwindow.mobileTestShowLogin=()=>showLogin();</script></body>')

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,timezone_id='Africa/Johannesburg',reduced_motion='reduce')
    page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.clock.install(time=datetime.datetime(2026,10,22,10,tzinfo=datetime.timezone.utc))

    def route(request):
        url=request.request.url
        if url=='http://dashboard.test/':return request.fulfill(body=html,content_type='text/html')
        if url.startswith('http://dashboard.test/'):
            path=root/url.removeprefix('http://dashboard.test/').split('?')[0]
            return request.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
        if 'open.er-api.com' in url:return request.fulfill(json={'result':'success','base_code':'ZAR','rates':{'ZAR':1,'USD':.06},'time_last_update_unix':1792598400})
        return request.fulfill(body='',content_type='text/css')

    page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.workflowReady&&window.QuestApp')
    page.evaluate("""async()=>{
        accessTest.records.expenses=[{id:'phone-expense',title:'Brand photography reference '+ 'long-reference-'.repeat(12),project_id:'fragile',amount:1250.50,category:'Marketing',created_by:'quan',spent_on:'2026-10-22'}];
        accessTest.records.tasks.push({id:'phone-task',title:'phone-task-with-a-very-long-unbroken-reference-'.repeat(5),project_id:'fragile',assigned_to:'quan',created_by:'quan',status:'To do',due_date:'2026-10-22'});
        await accessTest.switchUser('quan');
    }""")

    def check_width(width, label):
        result=page.evaluate("""()=>({width:innerWidth,root:document.documentElement.scrollWidth,clipped:[...document.querySelectorAll('.view.active *,.topbar *')].filter(el=>{
            if(el.closest('thead,.dusted-art,.logo'))return false;
            const box=el.getBoundingClientRect();return box.width>0&&box.height>0&&(box.left< -1||box.right>innerWidth+1);
        }).slice(0,6).map(el=>({tag:el.tagName,id:el.id,cls:String(el.className),right:el.getBoundingClientRect().right}))})""")
        assert abs(result['width']-width)<=1 and result['root']<=width+1,(label,result)
        assert not result['clipped'],(label,result)

    views=['overview','myDay','dashboard','projects','tasks','calendar','events','expenses','goals','notifications','files','search','activity','discussions','members','fragile','dusted']
    for width,height in [(320,740),(360,800),(390,844),(430,932),(844,390)]:
        page.set_viewport_size({'width':width,'height':height})
        page.wait_for_function('(height)=>document.documentElement.style.getPropertyValue("--quest-viewport-height")===height+"px"',arg=height)
        for view in views:
            page.evaluate('(view)=>accessTest.navigate(view)',view)
            check_width(width,f'{width}x{height}: {view}')
            if view=='calendar':
                assert page.locator('#calendarGrid').evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
                days=page.locator('.calendar-weekday').evaluate_all('(items)=>items.map(el=>el.getBoundingClientRect().right)')
                assert len(days)==7 and max(days)<=width
            if view=='expenses' and width<=680:
                assert page.locator('#expenseRows tr').count()==1
                assert page.locator('#expenseRows [data-label=Amount]').inner_text()=='$1,250.5'
                assert page.locator('#expenseRows td').count()==6
                assert page.locator('#expenseRows tr').evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
        # Every brand tab is visible without a horizontal swipe, including the
        # proposal's formerly clipped columns and the contact-task workstation.
        if width<=680:
            for brand in ['fragile','dusted']:
                page.evaluate('(view)=>accessTest.navigate(view)',brand)
                tabs=page.locator(f'#{brand} [data-studio-tab]')
                for index in range(tabs.count()):
                    tabs.nth(index).click()
                    check_width(width,f'{width}: {brand} tab {index}')
        # A short landscape screen can still reach the account controls.
        page.locator('#menuButton').click()
        sidebar=page.locator('#sidebar').bounding_box()
        assert sidebar['x']>=0 and sidebar['width']<=width and sidebar['height']<=height
        page.locator('#signOut').scroll_into_view_if_needed()
        signout=page.locator('#signOut').bounding_box();assert signout['y']>=0 and signout['y']+signout['height']<=height+1
        page.locator('#sidebarBackdrop').click(position={'x':width-8,'y':20})

    for width,height in [(320,740),(390,844),(844,390)]:
        page.set_viewport_size({'width':width,'height':height});page.evaluate("accessTest.navigate('calendar')")
        page.locator('#calendar [data-add=calendar]').click()
        dialog=page.locator('#entryDialog');dialog.wait_for(state='visible')
        page.wait_for_function('(height)=>document.documentElement.style.getPropertyValue("--quest-viewport-height")===height+"px"',arg=height)
        box=dialog.bounding_box();assert box['x']>=0 and box['x']+box['width']<=width+1
        assert box['y']>=0 and box['y']+box['height']<=height+1
        assert dialog.evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
        page.locator('#field-event_date').click()
        assert page.locator('.quest-date-picker').evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
        page.locator('.date-picker-foot').get_by_role('button',name='Close',exact=True).click()
        page.locator('#field-detail').fill('Keep these event notes while the keyboard is open.')
        assert page.locator('#field-detail').evaluate('(el)=>parseFloat(getComputedStyle(el).fontSize)')>=16
        page.locator('#cancelDialog').click()

    # Model the visual viewport shrinking under a keyboard. Keep the actual
    # layout viewport tall to catch modals centred behind the keyboard.
    page.set_viewport_size({'width':390,'height':844});page.evaluate("accessTest.navigate('calendar')")
    page.locator('#calendar [data-add=calendar]').click();page.locator('#field-detail').fill('A draft must survive resizing')
    page.evaluate("""()=>{window.savedVisualViewport=visualViewport;Object.defineProperty(window,'visualViewport',{configurable:true,value:{height:320,offsetTop:0,scale:1}});dispatchEvent(new Event('resize'));}""")
    page.wait_for_function('document.documentElement.style.getPropertyValue("--quest-viewport-height")==="320px"')
    box=page.locator('#entryDialog').bounding_box();assert box['y']>=0 and box['y']+box['height']<=321
    page.locator('#cancelDialog').scroll_into_view_if_needed();box=page.locator('#cancelDialog').bounding_box();assert box['y']+box['height']<=321
    assert page.locator('#field-detail').input_value()=='A draft must survive resizing'
    page.evaluate("visualViewport.scale=2;visualViewport.height=160;dispatchEvent(new Event('resize'))")
    page.wait_for_timeout(40);assert page.evaluate('document.documentElement.style.getPropertyValue("--quest-viewport-height")')=='320px'
    page.evaluate("Object.defineProperty(window,'visualViewport',{configurable:true,value:savedVisualViewport});dispatchEvent(new Event('resize'))")
    page.locator('#cancelDialog').click()

    page.evaluate("accessTest.navigate('dusted')");page.locator('#dusted [data-studio-tab=proposal]').click()
    page.screenshot(path='/tmp/quest-mobile-dusted.png',animations='disabled')
    page.evaluate("accessTest.navigate('calendar')");page.screenshot(path='/tmp/quest-mobile-calendar.png',animations='disabled')
    page.locator('#calendar [data-add=calendar]').click();page.screenshot(path='/tmp/quest-mobile-event.png',animations='disabled');page.locator('#cancelDialog').click()
    page.evaluate("accessTest.navigate('expenses')");page.screenshot(path='/tmp/quest-mobile-expenses.png',animations='disabled')

    page.evaluate('mobileTestShowLogin()');page.locator('#email').fill('member@example.com')
    assert page.locator('#email').evaluate('(el)=>parseFloat(getComputedStyle(el).fontSize)')>=16
    assert page.locator('#password').evaluate('(el)=>parseFloat(getComputedStyle(el).fontSize)')>=16
    assert page.locator('#loginScreen').evaluate('(el)=>el.scrollWidth<=innerWidth')
    assert 'maximum-scale' not in page.locator('meta[name=viewport]').get_attribute('content')
    # Desktop navigation and the finance table retain their existing layout.
    page.set_viewport_size({'width':1440,'height':1000});page.evaluate("accessTest.switchUser('quan')")
    assert page.locator('#menuButton').is_hidden()
    assert page.locator('#sidebar').bounding_box()['x']==0
    page.evaluate("accessTest.navigate('expenses')")
    assert page.locator('.expenses-table tbody').evaluate('(el)=>getComputedStyle(el).display')=='table-row-group'
    assert not errors,errors
    browser.close()
print('PASS mobile layouts: 320–430 px phones and landscape, all main views and brand tabs, seven-column calendar, labelled expense cards, long content, reachable menu controls, date picker, readable inputs, draft-preserving keyboard-height changes, pinch zoom and desktop layout. Viewports/keyboard changes emulated.')

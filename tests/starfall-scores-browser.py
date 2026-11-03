"""Complete real, deterministic flights and verify private browser score history."""
from pathlib import Path
import datetime
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM

root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace(
    "import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';",
    "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture=(root/'tests/member-access-fixture.js').read_text()+(root/'tests/personal-workspace-fixture.js').read_text()+'''
accessTest.records.personal_profiles.find(p=>p.user_id==='cas').setup_complete=true;
await accessTest.switchUser('quan');db.auth={signOut:async()=>({error:null})};window.scoresReady=true;
'''
html=html.replace('</script></body>',fixture.replace('</script','<\\/script')+'</script></body>')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1366,'height':1000})
    page.clock.install(time=datetime.datetime(2026,11,3,10,0,tzinfo=datetime.timezone.utc))
    page.add_init_script("Math.random=()=>0.5;try{if(!localStorage.getItem('quest-starfall-best:quan'))localStorage.setItem('quest-starfall-best:quan','9000');}catch{}")
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    def route(r):
        url=r.request.url
        if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
        if url.startswith('http://dashboard.test/'):
            path=root/url.removeprefix('http://dashboard.test/')
            if path.name in ['home.js','d3.min.js']:return r.fulfill(body='',content_type='application/javascript')
            return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
        return r.fulfill(body='',content_type='text/css')
    page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.scoresReady')
    def state(expected):
        page.wait_for_function('(state)=>document.querySelector("#questStarfall").dataset.state===state',arg=expected)
    def history(uid='quan'):
        return page.evaluate('(uid)=>JSON.parse(localStorage.getItem("quest-starfall-history-v1:"+uid)||"[]")',uid)

    assert int(page.locator('#starfallBest').text_content())==9000
    assert page.locator('#starfallLogRows tr').count()==0
    # Fire at real enemies, then pause/resume the same flight before losing its shields.
    page.locator('#starfallStart').click();state('playing')
    page.keyboard.down('Space');page.clock.run_for(5000);page.keyboard.up('Space')
    assert int(page.locator('#starfallScore').text_content())>0
    page.keyboard.press('KeyP');state('paused');page.clock.run_for(5000)
    assert history()==[]
    page.locator('#starfallStart').click();state('playing');page.clock.run_for(30000);state('over')
    first=history();assert len(first)==1
    assert first[0]['score']==int(page.locator('#starfallScore').text_content())
    assert first[0]['score']>0 and first[0]['duration_seconds']>0 and first[0]['sector']>=1
    assert page.locator('#starfallLogRows tr').count()==1
    assert page.locator('#starfallLogRows time small').text_content().startswith('12:')
    assert page.locator('#starfallLogRows time').get_attribute('datetime')==first[0]['ended_at']
    page.evaluate('accessTest.refresh()');assert len(history())==1
    page.reload();page.wait_for_function('window.scoresReady')
    assert page.locator('#starfallLogRows tr').count()==1
    assert history()[0]['id']==first[0]['id']
    assert int(page.locator('#starfallBest').text_content())==9000
    # Merge flights completed in another tab, remove duplicates and retain only 20.
    page.evaluate('''()=>{const key='quest-starfall-history-v1:quan',old=JSON.parse(localStorage.getItem(key));const rows=Array.from({length:25},(_,i)=>({id:'other-tab-'+i,score:100+i,sector:1,duration_seconds:20,ended_at:new Date(Date.UTC(2026,10,2,8,i)).toISOString()}));localStorage.setItem(key,JSON.stringify([...old,...rows,rows[0]]));}''')
    page.locator('#starfallStart').click();page.clock.run_for(25000);state('over')
    saved=history();assert len(saved)==20 and len({r['id'] for r in saved})==20
    assert saved[0]['id']!=first[0]['id'] and any(r['id']==first[0]['id'] for r in saved)
    assert page.locator('#starfallLogRows tr').count()==20
    assert page.locator('#starfallLogCount').text_content()=='20 flights'
    # Storage failures retain the new score for this visit and disclose the limit.
    page.evaluate("()=>{window.realScoreSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(String(key).startsWith('quest-starfall-history-v1:'))throw new DOMException('Full','QuotaExceededError');return realScoreSet.call(this,key,value)};}")
    page.locator('#starfallStart').click();page.clock.run_for(25000);state('over')
    assert 'storage is unavailable' in page.locator('#starfallLogStatus').text_content()
    assert history()[0]['id']==saved[0]['id']
    assert page.locator('#starfallLogRows tr').count()==20
    page.evaluate('()=>{Storage.prototype.setItem=realScoreSet;}')
    # Another member never sees this account's log. Bad storage cannot become markup.
    page.evaluate("localStorage.setItem('quest-starfall-history-v1:cas','not json');accessTest.switchUser('cas')")
    page.wait_for_function('document.querySelector("#userName").textContent==="Cas"')
    assert page.locator('#starfallLogRows tr').count()==0
    assert 'storage is unavailable' in page.locator('#starfallLogStatus').text_content()
    page.evaluate("accessTest.switchUser('quan')")
    page.wait_for_function('document.querySelector("#userName").textContent==="Quan"')
    page.evaluate('''()=>{localStorage.setItem('quest-starfall-history-v1:cas',JSON.stringify([{id:'cas-flight',score:777,sector:2,duration_seconds:35,ended_at:'2026-11-03T09:00:00Z',injection:'<script>throw Error(1)</script>'},{id:'bad',score:'<script>',sector:1,duration_seconds:0,ended_at:'bad date'}]));return accessTest.switchUser('cas');}''')
    page.wait_for_function('document.querySelector("#userName").textContent==="Cas"')
    assert page.locator('#starfallLogRows tr').count()==1
    assert page.locator('#starfallLogRows td').nth(1).text_content()=='777'
    assert page.locator('#starfallLogRows script').count()==0
    for width in [320,390]:
        page.set_viewport_size({'width':width,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.locator('#questStarfall').screenshot(path='/tmp/quest-starfall-score-log-phone.png')
    page.evaluate("accessTest.switchUser('quan')")
    page.wait_for_function('document.querySelector("#userName").textContent==="Quan"')
    assert page.locator('#starfallLogRows tr').count()==20
    assert page.evaluate('accessTest.writes.length===0&&accessTest.personal.writes.length===0')
    page.set_viewport_size({'width':1366,'height':1000})
    page.locator('#signOut').click();page.locator('#loginScreen').wait_for(state='visible')
    assert page.locator('#starfallLogRows tr').count()==0
    assert len(history())==20
    assert not errors,errors
    browser.close();print('PASS STARFALL scores: real scored flights, completion-only logging, pause/resume, single entry per run, reloads, legacy best, cross-tab merge, 20-run retention, blocked storage, account/signout isolation, validated text and mobile layout. No cloud writes.')

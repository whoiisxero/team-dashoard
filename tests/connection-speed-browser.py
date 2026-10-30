"""Deterministic browser transfer sizes/timings; no actual speed-test data usage."""
from pathlib import Path
import mimetypes
import json
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM

root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace(
    "import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';",
    "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture=(root/'tests/member-access-fixture.js').read_text()+r'''
window.speedTestState={mode:'success',requests:[],now:1000,probes:0,pending:[]};
const realFetch=window.fetch.bind(window),ss=window.speedTestState;
Object.defineProperty(performance,'now',{configurable:true,value:()=>ss.now});
window.fetch=async(address,options={})=>{
 const url=new URL(String(address),location.href);if(url.origin!=='https://speed.cloudflare.com')return realFetch(address,options);
 ss.requests.push({url:url.href,method:options.method,credentials:options.credentials,cache:options.cache,referrerPolicy:options.referrerPolicy,headers:options.headers||{},size:options.body?.size||0});
 if(ss.mode==='pending')await new Promise((resolve,reject)=>{ss.pending.push(resolve);options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});
 if(ss.mode==='late')await new Promise(resolve=>ss.pending.push(resolve));
 const bytes=Number(url.searchParams.get('bytes')||0);
 if(url.pathname==='/__down'&&bytes===0){ss.now+=[35,40,60,50][ss.probes++%4];return new Response(new Uint8Array(0));}
 if(url.pathname==='/__down'){
  ss.now+=1000;if(ss.mode==='fail')return new Response('Unavailable',{status:503});
  return new Response(new Uint8Array(ss.mode==='truncated'?100:ss.mode==='oversize'?bytes+1:bytes));
 }
 ss.now+=500;return new Response('{}');
};
window.speedReady=true;
'''
html=html.replace('</script></body>',fixture.replace('</script','<\\/script')+'</script></body>')
csp=next(h['value'] for entry in json.loads((root/'vercel.json').read_text())['headers'] for h in entry['headers'] if h['key']=='Content-Security-Policy')
assert "connect-src 'self' https://speed.cloudflare.com " in csp
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    def route(r):
        url=r.request.url
        if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html',headers={'Content-Security-Policy':csp})
        if url.startswith('http://dashboard.test/'):
            path=root/url.removeprefix('http://dashboard.test/')
            return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
        return r.fulfill(body='',content_type='text/css')
    page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.speedReady')
    assert page.locator('#connectionSpeed').is_visible()
    assert page.evaluate('speedTestState.requests.length')==0
    assert page.locator('#connectionDownload').text_content()=='—'
    assert '10 MB' in page.locator('#connectionSpeed').text_content()
    page.locator('#connectionSpeedStart').click();page.wait_for_function('document.querySelector("#connectionSpeedBadge").textContent==="Complete"')
    assert page.locator('#connectionDownload').text_content()=='64'
    assert page.locator('#connectionUpload').text_content()=='32'
    assert page.locator('#connectionLatency').text_content()=='50'
    requests=page.evaluate('speedTestState.requests')
    assert len(requests)==6
    assert sum(r['size'] for r in requests)==2000000
    assert sum(int(r['url'].split('bytes=')[1].split('&')[0]) for r in requests if 'bytes=' in r['url'])==8000000
    assert len(set(r['url'] for r in requests))==len(requests)
    assert all(r['credentials']=='omit' and r['cache']=='no-store' and r['referrerPolicy']=='no-referrer' and not r['headers'] for r in requests)
    page.wait_for_function('document.querySelector("#countrySelect").options.length>200')
    page.screenshot(path='/tmp/quest-internet-speed-desktop.png',full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path='/tmp/quest-internet-speed-phone.png',full_page=True)
    page.set_viewport_size({'width':1440,'height':1000})
    for failure in ['fail','truncated','oversize']:
        page.evaluate('(mode)=>{speedTestState.mode=mode;speedTestState.probes=0}',failure)
        page.locator('#connectionSpeedStart').click()
        page.wait_for_function('document.querySelector("#connectionSpeedBadge").textContent==="Unavailable"')
        assert page.locator('#connectionDownload').text_content()=='—'
        assert page.locator('#connectionUpload').text_content()=='—'
        assert page.locator('#connectionLatency').text_content()=='—'
    page.evaluate('speedTestState.mode="pending";speedTestState.requests=[]')
    page.locator('#connectionSpeedStart').click();page.wait_for_function('speedTestState.requests.length===1')
    assert page.locator('#connectionSpeedStart').is_disabled()
    page.locator('#connectionSpeedCancel').click()
    assert page.locator('#connectionSpeedBadge').text_content()=='Stopped'
    assert page.evaluate('speedTestState.requests.length')==1
    assert page.locator('#connectionSpeedStart').is_enabled()
    page.locator('#connectionSpeedStart').click();page.wait_for_function('speedTestState.requests.length===2')
    page.evaluate("accessTest.navigate('tasks')")
    assert page.locator('#connectionSpeedBadge').text_content()=='Stopped'
    # A late result from a cancelled test must not leak into the next account.
    page.evaluate("accessTest.navigate('overview');speedTestState.mode='late'")
    page.locator('#connectionSpeedStart').click();page.wait_for_function('speedTestState.requests.length===3')
    page.evaluate("accessTest.switchUser('josh')")
    page.wait_for_function('document.querySelector("#userName").textContent==="Josh"')
    page.evaluate('for(const finish of speedTestState.pending.splice(0))finish()')
    assert page.locator('#connectionSpeed').is_hidden()
    assert page.locator('#connectionDownload').text_content()=='—'
    assert page.evaluate('speedTestState.requests.length')==3
    page.evaluate("accessTest.switchUser('quan')")
    page.wait_for_function('document.querySelector("#userName").textContent==="Quan"')
    assert page.locator('#connectionSpeedBadge').text_content()=='Ready'
    # An offline click never consumes test data.
    page.context.set_offline(True);page.locator('#connectionSpeedStart').click()
    assert page.locator('#connectionSpeedBadge').text_content()=='Offline'
    assert page.evaluate('speedTestState.requests.length')==3
    page.context.set_offline(False)
    assert page.evaluate('accessTest.writes.length')==0
    assert not errors,errors
    browser.close();print('PASS internet speed: no automatic traffic, actual byte/timing calculations, median latency, transfer caps, partial/oversize failures, stop/navigation cancellation, stale-account isolation, offline and phone layout. Provider mocked.')

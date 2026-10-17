"""Offline browser checks for the home globe with deterministic exchange rates."""
from pathlib import Path
import json, datetime, mimetypes
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
html=html.replace('</script></body>', "document.querySelector('#loginScreen').hidden=true;document.querySelector('#appShell').hidden=false;document.querySelector('#userName').textContent='Quan';window.ready=true;</script></body>")
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(timezone_id='Africa/Johannesburg',viewport={'width':1280,'height':900})
 page.clock.install(time=datetime.datetime(2026,10,17,23,30,tzinfo=datetime.timezone.utc))
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));state={'fail':False}
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('https://open.er-api.com/'):
   return r.fulfill(status=503 if state['fail'] else 200,content_type='application/json',body=json.dumps({'result':'success','base_code':'ZAR','time_last_update_unix':1792195200,'rates':{'ZAR':1,'USD':.05,'GBP':.04,'EUR':.045}}))
  if url.startswith('http://dashboard.test/'):
   path=root/url.split('http://dashboard.test/')[1]
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('document.querySelector("#countrySelect").options.length>200')
 before=page.locator('#worldGlobe').evaluate('(el)=>el.toDataURL()');page.clock.run_for(1600);after=page.locator('#worldGlobe').evaluate('(el)=>el.toDataURL()');assert before!=after
 assert page.locator('#overview').is_visible();assert page.locator('#dashboard').is_hidden()
 assert '18' in page.locator('#homeDate').inner_text()
 page.locator('#countrySelect').select_option('USA');page.wait_for_function('document.querySelector("#countryRates").textContent.includes("R1 = 0.05 USD")')
 assert '1 USD = R20' in page.locator('#countryRates').inner_text()
 assert page.locator('#countryZone option').count()>1
 page.locator('#countryZone').select_option('America/New_York');assert '19:30' in page.locator('#countryClock').inner_text()
 assert '17' in page.locator('#countryDate').inner_text()
 page.locator('#countrySelect').select_option('ZAF');assert '01:30' in page.locator('#countryClock').inner_text();assert 'R1 = 1 ZAR' in page.locator('#countryRates').inner_text()
 # Hit-testing the centered South Africa polygon, not a dropdown-only globe.
 page.locator('#countrySelect').select_option('USA');page.locator('#countrySelect').select_option('ZAF')
 box=page.locator('#worldGlobe').bounding_box();page.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2)
 assert page.locator('#countryName').inner_text()=='South Africa'
 page.locator('#globeSpin').click();assert page.locator('#globeSpin').inner_text()=='Pause rotation';page.locator('#globeSpin').click()
 page.locator('.nav [data-view=dashboard]').click();assert page.locator('#dashboard').is_visible()
 page.locator('.nav [data-view=overview]').click();page.wait_for_timeout(1100);assert 'Quan' in page.locator('#homeWelcome').inner_text()
 page.screenshot(path='/tmp/quest-home.png',full_page=True)
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 # An unavailable rate must not fabricate a conversion.
 state['fail']=True;page.reload();page.wait_for_function('document.querySelector("#countrySelect").options.length>200');page.locator('#countrySelect').select_option('USA');page.locator('#retryRates').wait_for(state='visible');assert 'unavailable' in page.locator('#countryRates').inner_text()
 state['fail']=False;page.locator('#retryRates').click();page.wait_for_function('document.querySelector("#countryRates").textContent.includes("R1 = 0.05 USD")')
 assert not errors,errors
 b.close();print('PASS: home/date/welcome, country polygons and selection, live timezone dates, multi-zone selection, rand conversions both directions, rotation controls, dashboard navigation, mobile layout, rate failures and retry; no JavaScript errors. Rates simulated.')

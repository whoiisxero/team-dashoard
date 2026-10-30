from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';","const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture=''.join((root/'tests'/name).read_text() for name in ['member-access-fixture.js','personal-workspace-fixture.js','private-quotes-fixture.js'])
html=html.replace('</script></body>',fixture.replace('</script','<\\/script')+'</script></body>')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']);page=b.new_page(viewport={'width':1280,'height':1000});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/')
   if path.name in ['home.js','d3.min.js']:return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.quotesReady')
 assert page.locator('#personalWelcome').text_content()=='Welcome back, Carol'
 page.locator('.sidebar [data-view=businessStudio]').click();assert page.locator('#businessStudioTitle').text_content()=='Ki Lifestyle'
 assert 'Lymphatic drainage' in page.locator('#businessServiceList').text_content()
 for view in ['kiMassage','kiLymphatic','kiMyofascial','kiFrequency','kiBodyRecovery','kiSports']:
  page.locator('#businessServiceList [data-view='+view+']').click();assert page.locator('#'+view).is_visible();page.locator('#'+view+' [data-view=businessStudio]').click()
 page.locator('#businessServiceList [data-view=kiMassage]').click();page.locator('[data-ki-note=kiMassage]').click();page.locator('#personalNoteBody').fill('Massage options and session pricing');page.locator('#personalNoteSave').click();page.wait_for_function('!document.querySelector("#personalNoteDialog").open')
 assert page.evaluate('accessTest.records.personal_notes.some(n=>n.title==="Massage"&&n.category==="Ki Lifestyle services")')
 page.locator('#kiMassage [data-view=businessStudio]').click()
 assert page.locator('.sidebar [data-view=projects]').is_hidden()
 page.locator('.sidebar [data-view=quotes]').click();page.wait_for_function('!document.querySelector("#quoteNew").disabled');page.locator('#quoteNew').click()
 assert page.locator('#quoteBusiness').input_value()=='Ki Lifestyle'
 page.locator('#quoteClient').fill('Client <script>bad</script>');page.locator('#quoteEmail').fill('client@example.test');page.locator('#quoteContact').fill('Carol’s business contact');page.locator('#quotePreset').select_option('Massage')
 assert page.locator('.quote-line').count()==1
 page.locator('[data-price]').fill('333.33');page.locator('[data-quantity]').fill('2');page.locator('#quoteNotes').fill('Duration and payment terms')
 page.evaluate('accessTest.quotes.failSave=true');page.locator('#quoteSave').click();page.wait_for_function('document.querySelector("#quoteSaveStatus").textContent.includes("not confirmed")')
 first=page.evaluate('accessTest.quotes.attempts.at(-1).quote_id');assert page.locator('#quoteClient').input_value().startswith('Client')
 page.evaluate('accessTest.quotes.failSave=false');page.locator('#quoteSave').click();page.wait_for_function('!document.querySelector("#quoteDialog").open')
 assert page.evaluate('accessTest.quotes.attempts.at(-1).quote_id')==first
 assert page.evaluate('accessTest.records.personal_quotes[0].total_cents')==66666
 assert page.locator('#quoteList script').count()==0
 page.locator('#quoteList button',has_text='Email draft').click();assert page.evaluate('accessTest.records.personal_quotes[0].content.status')=='draft'
 with page.expect_popup() as pop:page.locator('#quoteList button',has_text='Print / save PDF').click()
 printed=pop.value;printed.wait_for_load_state();assert 'Ki Lifestyle' in printed.locator('body').inner_text();assert '<script>bad</script>' in printed.locator('body').inner_text();assert printed.locator('script').count()==0;printed.close()
 page.locator('#quoteList button',has_text='Open / edit').click();page.locator('#quoteClient').fill('Updated client');page.locator('#quoteSave').click();page.wait_for_function('!document.querySelector("#quoteDialog").open');assert page.evaluate('accessTest.quotes.attempts.at(-1).expected_revision')==1
 page.locator('.sidebar [data-view=invoices]').click();assert page.locator('#invoices').is_visible();assert page.locator('#quoteList').inner_text().find('Updated client')==-1
 page.locator('#quoteNew').click();page.locator('#quoteClient').fill('Invoice client');page.locator('[data-description]').fill('Sports recovery session');page.locator('[data-price]').fill('500.00');page.locator('#quoteSave').click();page.wait_for_function('!document.querySelector("#quoteDialog").open');assert page.evaluate('accessTest.records.personal_quotes.some(r=>r.content.kind==="invoice"&&r.total_cents===50000)')
 page.set_viewport_size({'width':390,'height':844});page.wait_for_function('document.documentElement.scrollWidth<=innerWidth');page.locator('#quoteNew').click();assert page.locator('#quoteDialog').evaluate('(d)=>d.getBoundingClientRect().width<=innerWidth');page.locator('#quoteClose').click()
 page.evaluate("accessTest.quotes.delay=true;accessTest.navigate('quotes')");page.wait_for_function('accessTest.quotes.pending.length>0');page.evaluate("accessTest.switchUser('tertius')");page.wait_for_function('document.querySelector("#userName").textContent==="Tertius"');page.evaluate('for(const done of accessTest.quotes.pending.splice(0))done()');assert page.locator('#quoteList').inner_text()=='';assert page.locator('.sidebar [data-view=quotes]').is_hidden();assert page.locator('.sidebar [data-view=businessStudio]').is_hidden()
 assert not errors,errors
 b.close();print('PASS Ki Lifestyle: Carol welcome, private studio/services, saved quotes, cents, retry ID, edit revision, email draft status, escaped printable quote, mobile and account-switch isolation.')

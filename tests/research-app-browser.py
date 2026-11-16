"""Research within Quest's actual index.html, using scoped workspace/API fixtures."""
from pathlib import Path
import json,mimetypes,tempfile
from urllib.parse import urlsplit,parse_qs
from playwright.sync_api import sync_playwright,expect
from browser_config import CHROMIUM

root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';","const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture='\n'.join((root/'tests'/name).read_text() for name in ['member-access-fixture.js','private-chats-fixture.js','daily-workflow-fixture.js']).replace('</script','<\\/script')
fixture+="\nfor(const [i,p] of accessTest.records.projects.entries())Object.assign(p,{status:'On track',client:'Sample project',progress:[40,65,25][i]});await accessTest.switchUser('quan');db.auth={getSession:async()=>({data:{session:{access_token:'test-research-caller-token-'+user.id}}})};window.researchAppReady=true;"
html=html.replace('</script></body>',fixture+'</script></body>')
state={'job':None,'calls':[],'saves':[],'deny':False,'configured':False}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']);page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  address=r.request.url
  if address=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if address.startswith('http://dashboard.test/api/research'):
   body=r.request.post_data_json if r.request.method=='POST' else {};action=body.get('action') or parse_qs(urlsplit(address).query).get('action',['status'])[0]
   state['calls'].append({'action':action,'body':body,'headers':r.request.headers})
   if state['deny']:return r.fulfill(status=403,json={'code':'scope_revoked','message':'Your access to this research project has changed.'})
   if action=='status':return r.fulfill(json={'configured':state['configured'],'destinations':{'private_notes':False,'projects':[{'id':'fragile','name':'Fragile'}]},'limits':{'calls':6,'seconds':180,'retention_days':14},'usage':{'member_runs':0,'member_limit':3}})
   if action in ('job','latest'):return r.fulfill(json={'job':state['job']})
   if action=='start':
    state['job']={'id':body['id'],'question':body['question'],'urls':body['urls'],'scope_project_id':body['scope_project_id'],'status':'running','stage':'Reading public sources','result':'','sources':[],'events':[],'calls':1};return r.fulfill(json={'job':state['job']})
   if action=='save':state['saves'].append(body);return r.fulfill(json={'saved':{'id':'saved-project-note','kind':body['kind'],'project_id':body['project_id'],'title':body['title']}})
   return r.fulfill(status=400,json={'message':'Unexpected test action'})
  if address=='http://dashboard.test/api/assistant':return r.fulfill(json={'configured':True})
  if address.startswith('http://dashboard.test/'):
   path=root/address.removeprefix('http://dashboard.test/')
   if path.name in ['home.js','d3.min.js']:return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.researchAppReady')
 page.evaluate("accessTest.navigate('dashboard')");nav=page.locator('.sidebar .nav').all_inner_texts()
 page.locator('#qaOpen').click();expect(page.locator('#qaResearchTab')).to_be_visible();page.locator('#qaResearchTab').click()
 expect(page.locator('#qrSetup')).to_be_visible();expect(page.locator('#qrStart')).to_be_disabled()
 assert page.locator('#qrSetup a').get_attribute('href')=='/setup-guide.html#q-research'
 state['configured']=True;page.locator('#qrRetry').click();expect(page.locator('#qrStart')).to_be_enabled()
 assert page.locator('.sidebar .nav').all_inner_texts()==nav,'Q Research must not rebuild or replace the app navigation'
 assert not page.locator('.sidebar [data-view=discussions]').is_visible(),'The removed general Team chat must stay removed'
 page.locator('#qrQuestion').fill('Compare public supplier services');page.locator('#qrURLs').fill('https://example.com/');page.locator('#qrScope').select_option('fragile')
 output=Path('/workspace/outputs') if Path('/workspace/outputs').is_dir() else Path(tempfile.gettempdir())
 page.screenshot(path=str(output/'Quest-Q-Research-in-App.png'),animations='disabled')
 page.locator('#qrStart').click();expect(page.locator('#qrBadge')).to_have_text('Researching')
 request=next(c for c in state['calls'] if c['action']=='start');assert request['headers']['authorization'].endswith('quan')
 assert set(request['body'])=={'action','id','question','urls','scope_project_id'} and not state['saves']
 state['job'].update(status='done',stage='Complete',result='A cited public finding.',sources=['https://example.com/'])
 expect(page.locator('#qrBadge')).to_have_text('Complete',timeout=10000);page.locator('#qrReviewNote').click()
 expect(page.locator('#qrPrivacy')).to_contain_text('Shared with people who can access this project')
 page.locator('#qrTitle').fill('Reviewed supplier finding');page.locator('#qrSave').click();expect(page.locator('#qrReview')).to_be_hidden()
 assert len(state['saves'])==1 and state['saves'][0]['kind']=='project_note' and state['saves'][0]['project_id']=='fragile'
 expect(page.locator('#qrStatus')).to_contain_text('Note saved')
 state['deny']=True;page.locator('#qaClose').click();page.locator('#qaOpen').click();expect(page.locator('#qrResult')).to_have_text('')
 assert page.locator('#qrQuestion').input_value()==''
 assert not errors,errors
 browser.close()
print('PASS Q Research in actual Quest app: existing sidebar and removed Team chat preserved, signed-in token used only for same-origin gateway, public-only start payload, reviewed project save/refresh, and revoked scope clears loaded results. Workspace/worker HTTP fixtures used.')

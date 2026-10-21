"""Brand workstation, discussion and moodboard checks with simulated storage."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture=(root/'tests/workspace-fixture.js').read_text()+'''
projects[0].name='Fragile';projects[1].name='Dusted.';state.setDustedName=name=>{projects[1].name=name;render()};const baseFrom=db.from;
state.brandMessages=[{id:'bm1',project_id:'p1',user_id:'tertius',body:'Brand direction',created_at:'2026-10-18T10:00:00Z'},{id:'bm2',project_id:'p2',user_id:'tertius',body:'Other brand chat',created_at:'2026-10-18T10:00:00Z'}];
state.pins=[{id:'pin1',project_id:'p1',created_by:'tertius',title:'Warm rust',notes:'Fabric palette',kind:'colour',colour:'#a64b32',created_at:'2026-10-18T10:00:00Z'},{id:'pin2',project_id:'p2',created_by:'tertius',title:'Other brand pin',kind:'note',created_at:'2026-10-18T10:00:00Z'}];state.brandError=null;state.failBrand=false;state.setProjectName=name=>{projects[0].name=name;render()};
db.from=table=>{if(!table.startsWith('brand_'))return baseFrom(table);let filters=[],inserting=null,deleting=false,single=false,limit=Infinity;const rows=()=>table==='brand_messages'?state.brandMessages:state.pins;const q={select:()=>q,eq:(key,value)=>{filters.push(row=>row[key]===value);return q},order:()=>q,limit:n=>{limit=n;return q},insert:values=>{inserting=values;return q},delete:()=>{deleting=true;return q},maybeSingle:()=>{single=true;return q},then:(resolve,reject)=>Promise.resolve().then(()=>{if(state.brandError)return {error:{code:state.brandError}};if((inserting||deleting)&&state.failBrand)return {error:{message:'Brand save denied'}};if(inserting){rows().push({...inserting,id:'new-'+state.writes.length,created_at:new Date().toISOString()});state.writes.push({table,values:inserting});return {error:null}}let found=rows().filter(row=>filters.every(f=>f(row))).sort((a,b)=>b.created_at.localeCompare(a.created_at));if(deleting){for(const row of found)rows().splice(rows().indexOf(row),1);return {data:single?found[0]:found,error:null}}return {data:found.slice(0,limit).map(row=>({...row})),error:null}}).then(resolve,reject)};return q;};render();
'''
html=html.replace('</script></body>',fixture+'</script></body>')
from full_access_fixture import full_access_fixture
html=full_access_fixture(html)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox']);page=b.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/')
   if path.name in ('home.js','d3.min.js'):return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.ready');page.locator('#dustedShortcut').click()
 assert page.locator('#dusted').is_visible();assert page.locator('#dustedProposalPanel').is_visible()
 assert page.locator('#dusted h1').text_content()=='Dusted.'
 assert 'FragileGothic' not in page.locator('#dusted h1').evaluate('(el)=>getComputedStyle(el).fontFamily')
 assert page.locator('#dusted .dusted-social').get_attribute('href')=='https://www.instagram.com/dusted.cpt/'
 assert 'non-thc' not in page.locator('#dustedProposalPanel').inner_text().lower()
 assert 'Instagram Reels' in page.locator('#dustedProposalPanel').inner_text()
 assert 'YouTube Shorts' in page.locator('#dustedProposalPanel').inner_text()
 for costing in ['R250','R30','12%']:
  assert costing not in page.locator('#dusted').inner_text()
 assert page.locator('#dustedBoxCount').count()==0
 assert page.locator('.dusted-flavours h4').all_text_contents()==['Soft Raspberry','Dusty Rose','Summer Blueberry','Sunset Orange']
 page.screenshot(path='/tmp/dusted-desktop.png',full_page=True)
 page.evaluate("document.body.classList.add('dusted-print')")
 Path('/workspace/outputs').mkdir(exist_ok=True)
 page.pdf(path='/workspace/outputs/Dusted-Promotion-Proposal.pdf',format='A4',print_background=True,margin={'top':'12mm','bottom':'12mm','left':'12mm','right':'12mm'})
 page.evaluate("document.body.classList.remove('dusted-print')")
 page.locator('#dusted [data-studio-tab=work]').click();page.wait_for_function('!document.querySelector("#dustedAddPin").disabled')
 assert 'Other project audition' in page.locator('#dustedEvents').inner_text();assert 'Loden casting' not in page.locator('#dustedEvents').inner_text()
 assert page.locator('#dustedWorkContactGrid .dusted-contact-task').count()==19
 assert 'Find and verify Greater Cape Town running clubs' in page.locator('#dustedWorkContactGrid').inner_text()
 card=page.locator('#dustedWorkContactGrid [data-lead-key=origin]');card.get_by_role('button',name='Prepare task').click()
 assert page.locator('#field-title').input_value().startswith('Contact Origin Coffee Roasting')
 assert page.locator('#field-project_id').input_value()=='p2';assert page.locator('#field-due_date').input_value()=='2026-10-20';page.locator('#cancelDialog').click()
 page.locator('#dustedWorkContactFilter').select_option('club');assert page.locator('#dustedWorkContactGrid .dusted-contact-task').count()==7
 page.locator('#dustedWorkContactFilter').select_option('creator');assert page.locator('#dustedWorkContactGrid .dusted-contact-task').count()==2
 page.locator('[data-lead-key=instagram-creators]').get_by_role('button',name='Prepare task').click();assert 'Instagram' in page.locator('#field-title').input_value();assert page.locator('#field-project_id').input_value()=='p2';page.locator('#cancelDialog').click()
 page.locator('#dustedWorkContactFilter').select_option('all')
 page.locator('#dusted [data-brand-add=calendar]').click();assert page.locator('#field-project_id').input_value()=='p2';page.locator('#cancelDialog').click()
 page.locator('#dusted [data-studio-tab=chat]').click();assert page.locator('#dustedBrandQuestionList li').count()==12
 page.locator('#dustedBrandQuestionList button').first.click();assert 'ideal customer' in page.locator('#dustedChatText').input_value()
 assert 'Other brand chat' in page.locator('#dustedMessages').inner_text();assert 'Brand direction' not in page.locator('#dustedMessages').inner_text()
 page.locator('#dustedChatText').fill('Dusted tasting feedback');page.locator('#dustedChatSend').click();page.wait_for_function('document.querySelector("#dustedMessages").textContent.includes("Dusted tasting feedback")');assert page.evaluate('workspaceTest.writes.at(-1).values.project_id')=='p2'
 page.locator('#dusted [data-studio-tab=board]').click();assert 'Other brand pin' in page.locator('#dustedBoard').inner_text();assert 'Warm rust' not in page.locator('#dustedBoard').inner_text()
 page.locator('#dustedAddPin').click();page.locator('#dustedPinKind').select_option('note');page.locator('#dustedPinTitle').fill('Elegant gifting');page.locator('#dustedPinNotes').fill('Cream, espresso and soft gold');page.locator('#dustedPinSave').click();page.wait_for_function('!document.querySelector("#dustedPinDialog").open');assert 'Elegant gifting' in page.locator('#dustedBoard').inner_text();assert page.evaluate('workspaceTest.writes.at(-1).values.project_id')=='p2'
 page.locator('#fragileShortcut').click();page.locator('#fragile [data-studio-tab=board]').click();page.wait_for_function('!document.querySelector("#fragileAddPin").disabled');assert 'Elegant gifting' not in page.locator('#fragileBoard').inner_text()
 page.locator('#dustedShortcut').click();page.locator('#dusted [data-studio-tab=outreach]').click()
 assert 'Dusted. owner review' in page.locator('#dustedReviewBrief').input_value()
 assert 'May I send' in page.locator('#dustedEmailSubject').input_value()
 assert page.locator('.dusted-lead-card').count()==16
 assert page.locator('.dusted-contact-table tbody tr').count()==16
 page.locator('#dustedLeadArea').select_option('seaboard');assert 'Newlands' not in page.locator('#dustedLeadGrid').inner_text()
 page.locator('#dustedLeadType').select_option('club');assert page.locator('.dusted-lead-card').count()==1
 assert 'Atlantic Athletic Club' in page.locator('#dustedLeadGrid').inner_text()
 page.locator('.dusted-lead-card').get_by_role('button',name='Prepare introduction').click()
 assert 'Atlantic Athletic Club' in page.locator('#dustedEmailSubject').input_value()
 page.locator('.dusted-lead-card').get_by_role('button',name='＋ Add contact task').click()
 assert 'Contact Atlantic Athletic Club' in page.locator('#field-title').input_value()
 assert page.locator('#field-project_id').input_value()=='p2';page.locator('#cancelDialog').click()
 page.locator('#dustedLeadArea').select_option('all');page.locator('#dustedLeadType').select_option('restaurant')
 assert page.locator('.dusted-lead-card').count()==3
 link=page.locator('.dusted-lead-card a').filter(has_text='Find official contact').first
 assert link.get_attribute('href').startswith('https://www.google.com/search?q=')
 assert link.get_attribute('rel')=='noopener noreferrer'
 page.locator('#dustedLeadType').select_option('all')

 for channel in ['shop','market','gym','club','restaurant']:
  page.locator('#dustedTemplate').select_option(channel)
  assert 'non-THC Turkish delight' in page.locator('#dustedEmailBody').input_value()
  assert 'R250' not in page.locator('#dustedEmailBody').input_value()
 page.locator('#dustedTemplate').select_option('club')
 page.locator('#dustedEmailBody').fill('A personalised running club idea')
 page.locator('#dustedTemplate').select_option('shop');page.locator('#dustedTemplate').select_option('club')
 assert page.locator('#dustedEmailBody').input_value()=='A personalised running club idea'
 page.locator('#dustedResetDraft').click();assert 'non-THC Turkish delight' in page.locator('#dustedEmailBody').input_value()
 page.locator('#dustedCopyDraft').click();assert page.locator('#dustedDraftStatus').inner_text()
 page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>window.copiedDraft=value}})")
 page.locator('#dustedCopyDraft').click();page.wait_for_function('window.copiedDraft?.startsWith("Subject:")')
 assert 'non-THC Turkish delight' in page.evaluate('window.copiedDraft')
 page.locator('#dusted [data-dusted-task=content]').click();assert 'YouTube Shorts' in page.locator('#field-title').input_value();assert page.locator('#field-project_id').input_value()=='p2';page.locator('#cancelDialog').click()

 page.locator('#dustedReviewBrief').fill('Owner meeting questions')
 page.locator('#dusted [data-studio-tab=proposal]').click();page.locator('#dusted [data-studio-tab=outreach]').click()
 assert page.locator('#dustedReviewBrief').input_value()=='Owner meeting questions'
 page.locator('#dustedCopyBrief').click();assert page.locator('#dustedCopyStatus').inner_text()
 page.locator('#dustedOutreachPanel [data-dusted-task=identity]').click();assert page.locator('#field-project_id').input_value()=='p2';assert 'Dusted.' in page.locator('#field-title').input_value();page.locator('#cancelDialog').click()
 page.locator('#dusted [data-dusted-notes]').first.click();assert page.locator('#workspaceTitle').inner_text()=='Dusted.'
 page.locator('#dustedShortcut').click()
 page.locator('#dusted [data-studio-tab=work]').click();page.locator('#dustedProjectWorkspace').click();assert page.locator('#workspaceTitle').inner_text()=='Dusted.'
 page.locator('.workspace-back').click();page.locator('#allProjects [data-open-project=p2]').click();assert page.locator('#dusted').is_visible()
 page.set_viewport_size({'width':390,'height':844})
 for tab in ['proposal','outreach','work','chat','board']:
  page.locator('#dusted [data-studio-tab='+tab+']').click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),tab
 page.locator('#dusted [data-studio-tab=proposal]').click();page.screenshot(path='/tmp/dusted-mobile.png',full_page=True)
 page.set_viewport_size({'width':1440,'height':1000});page.evaluate("workspaceTest.setDustedName('Different brand')");page.locator('#dustedShortcut').click();page.locator('#dusted [data-studio-tab=work]').click();assert page.locator('#dustedConnectActions').is_visible();assert 'Other project audition' not in page.locator('#dustedEvents').inner_text()
 assert page.locator('#dustedCreateProject').is_enabled();assert 'Connect Dusted.' in page.locator('#dustedCreateProject').inner_text()
 assert not errors,errors
 b.close();print('PASS Dusted: isolated studio/chat/moodboard, project and event links, distinct type, proposal and PDF, non-THC scope, Reels/Shorts plan, cost-free personal promotion plan, outreach draft editing/copy, owner meeting brief and campaign tasks, mobile layout and missing-project recovery.')

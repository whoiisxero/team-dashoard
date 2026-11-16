"""Real Q modules in the downloadable preview; simulated research transport is labelled."""
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright,expect
from browser_config import CHROMIUM

preview=Path(sys.argv[1] if len(sys.argv)>1 else Path(__file__).resolve().parents[1]/'dist-review/Quest-Research-Preview.html')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':1024},accept_downloads=True,reduced_motion='reduce')
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('http://quest-preview.test/',lambda route:route.fulfill(body=preview.read_bytes(),content_type='text/html'))
 page.goto('http://quest-preview.test/')
 expect(page.locator('#qrStart')).to_be_enabled()
 expect(page.locator('#qaResearchView')).to_be_visible();expect(page.locator('#qaChatView')).to_be_hidden()
 assert 'Simulated' in page.locator('.preview-banner').inner_text()
 assert page.locator('#qaResearchTab').get_attribute('aria-selected')=='true'
 ids=page.locator('#qaPanel [id]').evaluate_all('(items)=>items.map(item=>item.id)');assert len(ids)==len(set(ids))
 page.screenshot(path='/workspace/outputs/Quest-Research-Desktop.png',animations='disabled')
 # Stop must wait for confirmed cancellation, not announce immediate success.
 page.evaluate('qResearchPreview.hold=true');page.locator('#qrStart').click()
 expect(page.locator('#qrBadge')).to_have_text('Queued');assert page.locator('#qrQuestion').is_disabled()
 page.locator('#qrStop').click();expect(page.locator('#qrBadge')).to_have_text('Stopping');assert page.locator('#qrStop').is_disabled()
 page.evaluate('qResearchPreview.hold=false');expect(page.locator('#qrBadge')).to_have_text('Cancelled',timeout=10000)
 # Lost start response: preserve the immutable request and retry its same UUID.
 page.evaluate('qResearchPreview.failStart=true;qResearchPreview.hold=true');page.locator('#qrStart').click();expect(page.locator('#qrRetryStart')).to_be_visible()
 first=page.evaluate('qResearchPreview.job.id');assert page.locator('#qrQuestion').is_disabled()
 page.locator('#qrRetryStart').click();expect(page.locator('#qrRetryStart')).to_be_hidden()
 assert page.evaluate('qResearchPreview.job.id')==first and page.evaluate('qResearchPreview.runs')==2
 page.evaluate("qResearchPreview.hold=false;qResearchPreview.job.created_at=Date.now()/1000-5")
 expect(page.locator('#qrBadge')).to_have_text('Complete',timeout=10000)
 page.evaluate("qResearchPreview.job.result='Useful findings <script>window.unsafe=true</script>';qResearchPreview.job.sources=['https://example.com/','javascript:alert(1)']")
 page.locator('#qrRetry').click();expect(page.locator('#qrResult')).to_contain_text('<script>')
 assert page.locator('#qrResult script').count()==0 and not page.evaluate('window.unsafe||false')
 assert page.locator('#qrSources a').count()==1
 # Review is explicit; losing a save acknowledgement cannot create another copy.
 page.locator('#qrReviewNote').click();expect(page.locator('#qrReview')).to_be_visible()
 assert page.evaluate('qResearchPreview.saves.size')==0
 page.locator('#qrTitle').fill('Supplier research');page.locator('#qrContent').fill('Reviewed useful finding')
 assert 'Private to your account' in page.locator('#qrPrivacy').inner_text()
 page.evaluate('qResearchPreview.failSave=true');page.locator('#qrSave').click();expect(page.locator('#qrSave')).to_have_text('Retry this save')
 assert page.locator('#qrTitle').is_disabled() and page.locator('#qrCancelReview').is_disabled()
 page.locator('#qrSave').click();expect(page.locator('#qrReview')).to_be_hidden();assert page.evaluate('qResearchPreview.saves.size')==1
 assert 'Note saved' in page.locator('#qrStatus').inner_text()
 page.locator('#qrReviewTask').click();expect(page.locator('#qrDueLabel')).to_be_visible()
 assert 'Only the title' in page.locator('#qrPrivacy').inner_text()
 page.locator('#qrTitle').fill('Contact sample supplier');page.locator('#qrDue').fill('2026-11-18');page.locator('#qrSave').click();expect(page.locator('#qrReview')).to_be_hidden()
 assert page.evaluate('qResearchPreview.saves.size')==2
 with page.expect_download() as item:page.locator('#qrDownload').click()
 assert item.value.suggested_filename.startswith('Quest-Research-')
 # Closing Q preserves unsent writing; it does not cancel submitted browser work.
 page.locator('#qrQuestion').fill('Keep my research draft');page.locator('#qaClose').click();page.locator('#previewOpen').click()
 expect(page.locator('#qrQuestion')).to_have_value('Keep my research draft')
 page.locator('#qaChatTab').click();page.locator('#qaInput').fill('open research');page.locator('#qaSend').click();expect(page.locator('#qaResearchView')).to_be_visible()
 # Phone, narrow width and keyboard space all fit with scrollable content.
 page.set_viewport_size({'width':390,'height':844});box=page.locator('#qaPanel').bounding_box();assert box['x']>=0 and box['x']+box['width']<=391
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.locator('#qaResearchView').evaluate('(element)=>element.scrollTop=0');page.screenshot(path='/workspace/outputs/Quest-Research-Phone.png',animations='disabled')
 page.set_viewport_size({'width':320,'height':680});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.evaluate("document.documentElement.style.setProperty('--quest-viewport-height','300px')")
 expect(page.locator('#qrQuestion')).to_have_value('Keep my research draft')
 box=page.locator('#qaPanel').bounding_box();assert box['y']+box['height']<=301
 page.evaluate("document.documentElement.style.removeProperty('--quest-viewport-height')")
 context.set_offline(True);expect(page.locator('#qrStatus')).to_contain_text('offline');assert page.locator('#qrStart').is_disabled();context.set_offline(False)
 # Account/access changes purge drafts and results; an unauthorised account cannot open the tab.
 page.evaluate("qResearchPreview.data.user={id:'00000000-0000-4000-8000-000000000002'};qResearchPreview.data.policy={ready:true,is_admin:false};qResearchPreview.sync()")
 expect(page.locator('#qaPanel')).to_be_hidden();page.locator('#previewOpen').click();expect(page.locator('#qaResearchTab')).to_be_hidden()
 assert page.locator('#qrQuestion').input_value()=='' and page.locator('#qrResult').inner_text()==''
 assert not errors,errors
 browser.close()
print('PASS Q Research UI: real Q modules, mode tabs, progress, confirmed Stop, same-ID retries, explicit reviewed saves and lost acknowledgement retry, safe text/links, report download, retained drafts, offline recovery, narrow/phone/keyboard fit and account revocation. Simulated worker transport; no paid calls or live saves.')

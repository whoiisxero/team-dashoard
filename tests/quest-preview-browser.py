"""Exercise the real tour and existing private-account route guards using mock transport."""
from pathlib import Path
import mimetypes
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
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))

    def route(r):
        url = r.request.url
        if url == 'http://dashboard.test/':
            return r.fulfill(body=html, content_type='text/html')
        if url.startswith('http://dashboard.test/'):
            path = root / url.removeprefix('http://dashboard.test/')
            if path.name in ['home.js', 'd3.min.js']:
                return r.fulfill(body='', content_type='application/javascript')
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
    print('PASS Explore Quest: fictional content isolation, locked cards, keyboard tabs, no writes, existing private-account route guards, phone widths, Ki Lifestyle return and account-switch reset.')

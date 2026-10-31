"""Quest home game behavior with account transport mocked; no live data writes."""
from pathlib import Path
import mimetypes
import os
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM

root = Path(__file__).resolve().parents[1]
screenshots = Path(os.environ.get('QUEST_TEST_SCREENSHOTS', '/tmp'))
screenshots.mkdir(parents=True, exist_ok=True)
html = (root / 'index.html').read_text().replace(
    "import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';",
    "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture = ((root / 'tests/member-access-fixture.js').read_text()
           + (root / 'tests/personal-workspace-fixture.js').read_text() + '''
accessTest.records.personal_profiles.find(p=>p.user_id==='cas').setup_complete=true;
await accessTest.switchUser('quan');
db.auth={signOut:async()=>({error:null})};
window.starfallTestReady=true;
''')
html = html.replace('</script></body>', fixture.replace('</script', '<\\/script') + '</script></body>')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROMIUM, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, has_touch=True)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def route(request):
        url = request.request.url
        if url == 'http://dashboard.test/':
            return request.fulfill(body=html, content_type='text/html')
        if url.startswith('http://dashboard.test/'):
            path = root / url.removeprefix('http://dashboard.test/')
            return request.fulfill(body=path.read_bytes() if path.is_file() else b'',
                                   content_type=mimetypes.guess_type(path)[0] or 'text/plain')
        return request.fulfill(body='', content_type='text/css')

    page.route('**/*', route)
    page.goto('http://dashboard.test/')
    page.wait_for_function('window.starfallTestReady')
    game = page.locator('#questStarfall')
    canvas = page.locator('#starfallCanvas')

    def state(expected):
        page.wait_for_function('(s)=>document.querySelector("#questStarfall").dataset.state===s', arg=expected)

    def last_on_home(home):
        assert game.evaluate('(el,id)=>el.parentElement.id===id&&el.parentElement.lastElementChild===el', home)
        assert game.is_visible()
        assert page.locator('#questStarfall').count() == 1

    # Read the fighter's bright green silhouette in the lower canvas, independent
    # of its JavaScript position or velocity implementation.
    def fighter_x():
        return canvas.evaluate('''el=>{
            const ctx=el.getContext('2d'),w=el.width,h=el.height,data=ctx.getImageData(0,0,w,h).data;
            let total=0,count=0;
            for(let y=Math.floor(h*.5);y<h;y++)for(let x=0;x<w;x++){
                const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2];
                if(g>185&&g>r*1.15&&g>b*1.02){total+=x;count++;}
            }
            if(!count)throw new Error('Fighter silhouette missing');
            return total/count*el.getBoundingClientRect().width/w;
        }''')

    def laser_pixels():
        return canvas.evaluate("""el=>{
            const w=el.width,h=el.height,data=el.getContext('2d').getImageData(0,0,w,h).data;
            let count=0;
            for(let y=0;y<h*.65;y++)for(let x=0;x<w;x++){
                const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2];
                if(g>185&&g>r*1.1&&g>b*1.02)count++;
            }
            return count;
        }""")

    last_on_home('overview')
    state('ready')
    game.screenshot(path=str(screenshots / 'quest-starfall-desktop.png'))
    page.locator('#starfallStart').click()
    state('playing')
    assert canvas.evaluate('(el)=>document.activeElement===el')
    page.wait_for_timeout(1100)  # Initial spawn shield blinks the fighter.
    before = fighter_x()
    page.keyboard.down('ArrowRight')
    page.wait_for_timeout(180)
    page.keyboard.up('ArrowRight')
    after = fighter_x()
    assert after > before + 20, (before, after, game.get_attribute('data-state'), canvas.evaluate('(el)=>document.activeElement.id'))

    # Holding Space creates visible player laser shots above the fighter.
    page.keyboard.down('Space')
    page.wait_for_timeout(250)
    page.keyboard.up('Space')
    assert laser_pixels() > 3

    # Navigation and focus loss stop the current flight and clear held movement.
    page.keyboard.down('ArrowRight')
    page.evaluate("accessTest.navigate('tasks')")
    page.keyboard.up('ArrowRight')
    state('paused')
    assert game.is_hidden()
    page.evaluate("accessTest.navigate('overview')")
    last_on_home('overview')
    page.locator('#starfallStart').click()
    state('playing')
    canvas.evaluate('(el)=>el.blur()')
    state('paused')
    page.locator('#starfallStart').click()
    state('playing')
    page.keyboard.press('KeyP')
    state('paused')
    page.locator('#starfallStart').click()
    state('playing')
    page.keyboard.press('Escape')
    state('paused')
    assert page.locator('#starfallStart').evaluate('(el)=>document.activeElement===el')

    # The rest of Quest keeps normal text editing and arrow/space behavior.
    page.evaluate("accessTest.navigate('discussions')")
    composer = page.locator('#messageText')
    composer.fill('abcd')
    composer.press('ArrowLeft')
    composer.press('Space')
    composer.press('p')
    assert composer.input_value() == 'abc pd'
    state('paused')
    assert page.evaluate('accessTest.writes.length') == 0
    composer.fill('')

    # Switching accounts resets the flight and places the same panel after the
    # personal workspace's existing content, including its moved globe.
    page.evaluate("accessTest.switchUser('cas')")
    page.wait_for_function('document.querySelector("#userName").textContent==="Cas"&&document.querySelector("#personalHome").classList.contains("active")')
    state('ready')
    last_on_home('personalHome')
    assert int(page.locator('#starfallScore').inner_text()) == 0
    for mobile_width in [320, 390]:
        page.set_viewport_size({'width': mobile_width, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), mobile_width
    for key in ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight', 'Space']:
        assert page.locator(f'[data-starfall-key="{key}"]').is_visible(), key
    assert page.locator('.qa-dock').is_visible()
    page.locator('#starfallStart').click()
    state('playing')
    assert page.locator('.qa-dock').is_hidden()
    left = page.locator('[data-starfall-key="ArrowLeft"]')
    left.scroll_into_view_if_needed()
    page.wait_for_timeout(1100)  # Spawn shield blink also applies to touch play.
    before = fighter_x()
    box = left.bounding_box()
    page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
    page.mouse.down()
    page.wait_for_timeout(150)
    page.mouse.up()
    after = fighter_x()
    assert after < before - 10, (before, after)
    fire = page.locator('[data-starfall-key="Space"]')
    fire.scroll_into_view_if_needed()
    # The floating assistant must leave the controls unobstructed during play.
    assert fire.evaluate("""el=>{
        const box=el.getBoundingClientRect(),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
        return hit===el||el.contains(hit);
    }""")
    box = fire.bounding_box()
    page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
    page.mouse.down()
    page.wait_for_timeout(250)
    page.mouse.up()
    assert laser_pixels() > 3
    state('playing')
    game.screenshot(path=str(screenshots / 'quest-starfall-phone-playing.png'))
    page.locator('#starfallPause').click()
    state('paused')
    assert page.locator('.qa-dock').is_visible()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    game.screenshot(path=str(screenshots / 'quest-starfall-phone.png'))
    assert page.evaluate('accessTest.writes.length===0&&accessTest.personal.writes.length===0')
    page.evaluate("accessTest.switchUser('quan')")
    page.wait_for_function('document.querySelector("#userName").textContent==="Quan"')
    last_on_home('overview')
    state('ready')
    page.set_viewport_size({'width':1440,'height':1000})
    page.locator('#starfallStart').click()
    state('playing')
    page.locator('#signOut').click()
    page.locator('#loginScreen').wait_for(state='visible')
    assert game.is_hidden()
    state('ready')
    assert int(page.locator('#starfallScore').inner_text())==0
    assert not errors, errors
    browser.close()
    print('PASS STARFALL: bottom placement on both homes, launch, visible fighter movement, navigation/focus/Escape pause, keyboard isolation, account/signout reset, mobile controls/layout and assistant obstruction/restoration; no app data writes.')

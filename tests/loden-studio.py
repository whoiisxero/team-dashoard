"""Exercise the shared studio contract against Loden's independent UI and records."""
from pathlib import Path
source=(Path(__file__).with_name('fragile-studio.py')).read_text()
# The shared controller must provide the same workflows for either project.
source=source.replace('fragile','loden').replace('Fragile','Loden')
source=source.replace("'LodenGothic'", "'Orbitron'").replace("=='Clothing brand'", "=='Creative project'")
source=source.replace("page.locator('#loden h1').inner_text()", "page.locator('#loden h1').text_content()").replace('.loden-pin','.fragile-pin')
source=source.replace("assert not errors,errors", '''
 assert page.locator('#lodenShortcut .nav-emoji').inner_text()=='L'
 assert page.locator('#fragileShortcut').evaluate('(el)=>el.nextElementSibling.nextElementSibling.id')=='lodenShortcut'
 page.locator('.sidebar [data-view=projects]').click()
 page.locator('#allProjects [data-open-project=p1]').click()
 assert page.locator('#loden').is_visible()
 page.set_viewport_size({'width':320,'height':740})
 page.wait_for_function('document.querySelector("#sidebar").getBoundingClientRect().right<=1')
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/quest-loden-phone.png',full_page=True)
 page.set_viewport_size({'width':1280,'height':950})
 page.screenshot(path='/tmp/quest-loden-desktop.png',full_page=True)
 assert not errors,errors''')
exec(compile(source,str(Path(__file__)), 'exec'))

"""Password recovery request/confirmation, Auth races and bounded failure handling."""
from pathlib import Path
from urllib.parse import urlparse
import mimetypes
from playwright.sync_api import sync_playwright
from browser_config import CHROMIUM

root=Path(__file__).resolve().parents[1]
source=(root/'index.html').read_text()
import_line="import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';"
mock=r'''
const createClient=()=>{
 const s=window.resetTest={requests:[],updates:[],entries:[],signouts:0,delivery:'ok',save:'ok',pendingSave:null,callback:null};
 const scenario=new URLSearchParams(location.search).get('case')||'request';
 const recovery={user:{id:'josh',email:'josh@example.test'}},existing={user:{id:'owner',email:'owner@example.test'}};
 s.emit=(event,session=recovery)=>s.callback?.(event,session);
 const auth={
  onAuthStateChange:callback=>{s.callback=callback;
   if(scenario==='cold')queueMicrotask(()=>{s.emit('PASSWORD_RECOVERY');s.emit('INITIAL_SESSION');});
   if(scenario==='event-only')queueMicrotask(()=>{s.emit('INITIAL_SESSION');s.emit('PASSWORD_RECOVERY');});
   if(scenario==='slow'){setTimeout(()=>s.emit('PASSWORD_RECOVERY'),5);setTimeout(()=>s.emit('INITIAL_SESSION',null),10);}
   if(scenario==='expired')queueMicrotask(()=>s.emit('INITIAL_SESSION',existing));
   return {data:{subscription:{unsubscribe(){}}}};
  },
  getSession:async()=>{
   if(scenario==='slow'){await new Promise(done=>setTimeout(done,45));return {data:{session:null}};}
   if(scenario==='session-error')throw Error('Recovery session could not be checked');
   return {data:{session:scenario==='expired'?existing:['cold','event-only'].includes(scenario)?recovery:null}};
  },
  resetPasswordForEmail:async(email,options)=>{s.requests.push({email,options});
   if(s.delivery==='hang')return new Promise(()=>{});
   if(s.delivery==='error')return {error:{code:'over_email_send_rate_limit',message:'Email rate limit exceeded'}};
   return {data:{},error:null};
  },
  updateUser:async values=>{s.updates.push(values);s.emit('USER_UPDATED');
   if(s.save==='hang')return new Promise(()=>{});
   if(s.save==='error')return {error:{message:'The reset session has expired'}};
   if(s.save==='unconfirmed')return {data:{},error:null};
   if(s.save==='pending')return new Promise(done=>{s.pendingSave=()=>{s.emit('SIGNED_IN');done({data:{user:recovery.user},error:null});};});
   return {data:{user:recovery.user},error:null};
  },
  signOut:async()=>{s.signouts++;s.emit('SIGNED_OUT',null);return {error:null};}
 };
 return {auth,removeChannel:()=>{}};
};
'''
html=source.replace(import_line,mock)
# Observe the entry boundary without introducing project APIs into Auth-focused tests.
html=html.replace("if(config.supabaseUrl&&!config.supabaseUrl.includes('YOUR_PROJECT')", "enterApp=async authUser=>{resetTest.entries.push(authUser.id);document.querySelector('#appShell').hidden=false;document.querySelector('#loginScreen').hidden=true;};\nif(config.supabaseUrl&&!config.supabaseUrl.includes('YOUR_PROJECT')")
html=html.replace('</script></body>',"window.resetReady=true;</script></body>")

with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=CHROMIUM,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1280,'height':1000})
 errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.add_init_script('const realTimeout=window.setTimeout;window.setTimeout=(fn,delay,...args)=>realTimeout(fn,delay===15000?100:delay,...args)')
 def route(r):
  url=r.request.url;parsed=urlparse(url)
  if parsed.netloc=='dashboard.test' and parsed.path=='/':return r.fulfill(body=html,content_type='text/html')
  if parsed.netloc=='dashboard.test':
   path=root/parsed.path.lstrip('/')
   if path.name in ('home.js','d3.min.js'):return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route)
 def open_page(scenario='request',fragment='',reset=False):
  page.goto('http://dashboard.test/?case='+scenario+('&reset=1' if reset else '')+fragment)
  page.wait_for_function('window.resetReady===true')
 def fill_password(value='a-new-test-password'):
  page.locator('#newPassword').fill(value);page.locator('#confirmPassword').fill(value)
 # The real Forgot password form passes the account and current trusted origin.
 open_page();page.locator('#email').fill('josh@example.test');page.locator('#showReset').click()
 assert page.locator('#resetEmail').input_value()=='josh@example.test'
 page.locator('#resetRequestForm button[type=submit]').click()
 page.wait_for_function('resetTest.requests.length===1')
 request=page.evaluate('resetTest.requests[0]')
 assert request=={'email':'josh@example.test','options':{'redirectTo':'http://dashboard.test/?reset=1'}}
 assert 'If that email belongs' in page.locator('#resetRequestMessage').inner_text()
 page.evaluate("resetTest.delivery='error'");page.locator('#resetRequestForm button[type=submit]').click()
 page.wait_for_function('document.querySelector("#resetRequestMessage").textContent.includes("rate limit")')
 assert 'Supabase email delivery settings' in page.locator('#resetRequestMessage').inner_text()
 assert page.locator('#resetRequestForm button[type=submit]').is_enabled()
 page.evaluate("resetTest.delivery='hang'");page.locator('#resetRequestForm button[type=submit]').click()
 page.wait_for_function('document.querySelector("#resetRequestMessage").textContent.includes("not confirmed")')
 assert page.locator('#resetRequestForm button[type=submit]').is_enabled()
 assert 'Check your inbox before retrying' in page.locator('#resetRequestMessage').inner_text()
 # Recovery events cannot open the dashboard before the password is confirmed.
 for scenario in ['cold','slow','event-only']:
  open_page(scenario,reset=scenario!='event-only')
  assert page.locator('#newPasswordForm').is_visible(),scenario
  assert page.locator('#appShell').is_hidden(),scenario
  assert page.evaluate('resetTest.entries')==[],scenario
  assert page.locator('#newPasswordForm button[type=submit]').is_enabled(),scenario
  assert 'josh@example.test' in page.locator('#newPasswordAccount').inner_text()
 # An expired link must not reuse an unrelated saved account's session.
 open_page('expired','#error=access_denied&error_code=otp_expired&error_description=Link%20expired',True)
 assert page.locator('#newPasswordForm').is_visible()
 assert page.locator('#newPasswordForm button[type=submit]').is_disabled()
 assert 'expired' in page.locator('#newPasswordMessage').inner_text()
 assert page.evaluate('resetTest.entries')==[]
 page.locator('#newPasswordRequest').click();assert page.locator('#resetRequestForm').is_visible()
 page.wait_for_function('resetTest.signouts===1')
 open_page('session-error',reset=True)
 assert page.locator('#newPasswordForm').is_visible()
 assert 'could not be checked' in page.locator('#newPasswordMessage').inner_text()
 assert page.locator('#newPasswordRequest').is_visible()
 # Save errors/timeouts retain the typed password and provide a retry path.
 open_page('cold',reset=True);fill_password();page.evaluate("resetTest.save='error'")
 page.locator('#newPasswordForm button[type=submit]').click()
 page.wait_for_function('document.querySelector("#newPasswordMessage").textContent.includes("expired")')
 assert page.locator('#newPassword').input_value()=='a-new-test-password'
 assert page.locator('#appShell').is_hidden()
 page.evaluate("resetTest.save='hang'");page.locator('#newPasswordForm button[type=submit]').click()
 page.wait_for_function('document.querySelector("#newPasswordMessage").textContent.includes("not confirmed")')
 assert page.locator('#newPasswordForm button[type=submit]').is_enabled()
 assert page.evaluate('resetTest.entries')==[]
 page.evaluate("resetTest.save='unconfirmed'");page.locator('#newPasswordForm button[type=submit]').click()
 page.wait_for_function('document.querySelector("#newPasswordMessage").textContent.includes("not confirmed")')
 assert page.locator('#appShell').is_hidden()
 # A USER_UPDATED/SIGNED_IN race still waits for the updateUser result.
 page.evaluate("resetTest.save='pending'");page.locator('#newPasswordForm button[type=submit]').click()
 page.wait_for_function('resetTest.pendingSave!==null')
 assert page.evaluate('resetTest.entries')==[]
 assert page.locator('#newPasswordForm button[type=submit]').is_disabled()
 page.evaluate('resetTest.pendingSave()')
 page.wait_for_function('resetTest.entries.length===1')
 assert page.evaluate('resetTest.entries')==['josh']
 assert page.locator('#newPassword').input_value()==''
 assert page.locator('#confirmPassword').input_value()==''
 assert page.url=='http://dashboard.test/'
 # Leaving recovery invalidates a late save and suppresses its Auth event.
 open_page('cold',reset=True);fill_password();page.evaluate("resetTest.save='pending'")
 page.locator('#newPasswordForm button[type=submit]').click();page.wait_for_function('resetTest.pendingSave!==null')
 page.locator('#newPasswordBack').click();assert page.locator('#loginForm').is_visible()
 page.evaluate('resetTest.pendingSave()')
 page.wait_for_function('resetTest.signouts===1')
 assert page.evaluate('resetTest.entries')==[]
 assert page.locator('#loginForm').is_visible()
 assert page.locator('#newPassword').input_value()==''
 assert page.locator('#confirmPassword').input_value()==''
 page.evaluate("resetTest.emit('PASSWORD_RECOVERY')")
 assert page.locator('#loginForm').is_visible()
 assert page.locator('#newPasswordForm').is_hidden()
 assert page.evaluate('resetTest.entries')==[]
 assert not errors,errors
 browser.close();print('PASS password recovery: trusted reset redirect, request errors/timeouts, recovery event races, expired-link path, update errors/timeouts, confirmation-only entry, cleared passwords and stale-save cancellation. Auth and delivery are mocked.')

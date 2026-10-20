"""Actual dashboard with scoped transport fixtures; no live accounts or writes."""
from pathlib import Path
import mimetypes
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text().replace("import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';", "const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});")
fixture=r'''
const state=window.accessTest={failAccess:false,failPresence:false,writes:[],online:new Set(['tertius']),profiles:{
quan:{ready:true,is_admin:true,project_mode:'all',shared_access:true,can_create_projects:true},
tertius:{ready:true,is_admin:false,project_mode:'all',shared_access:true,can_create_projects:true},
josh:{ready:true,is_admin:false,project_mode:'selected',shared_access:false,can_create_projects:false}}};
const records={projects:[{id:'dusted',name:'Dusted.',access_restricted:true},{id:'fragile',name:'Fragile'},{id:'loden',name:'Loden'}],
team_members:['quan','tertius','josh'].map(id=>({user_id:id,display_name:id[0].toUpperCase()+id.slice(1)})),
team_settings:[{id:true,monthly_budget:700}],tasks:[],expenses:[],goals:[],discussion_messages:[{id:'teamchat',body:'Main team conversation',user_id:'tertius',created_at:'2026-10-20T10:00:00Z'}],
calendar_events:[{id:'event',title:'Dusted private meeting',event_date:'2026-10-20',project_id:'dusted',created_by:'quan'}],project_notes:[],
brand_messages:[{id:'d1',body:'Dusted owner and Josh only',project_id:'dusted',user_id:'quan',created_at:'2026-10-20T10:00:00Z'},{id:'f1',body:'Fragile private team',project_id:'fragile',user_id:'tertius',created_at:'2026-10-20T10:00:00Z'}],brand_moodboard_items:[],team_notifications:[]};
state.records=records;state.rules={tertius:['fragile','loden'],josh:['dusted']};
const accessible=id=>state.profiles[user.id].is_admin||state.rules[user.id]?.includes(id);
function query(table){let filters=[],single=false,limit=Infinity,head=false,inserting=null;
 const q={select:(fields,options={})=>{head=!!options.head;return q},eq:(key,value)=>{filters.push(row=>row[key]===value);return q},gte:()=>q,is:(key,value)=>{filters.push(row=>row[key]===value);return q},order:()=>q,limit:n=>{limit=n;return q},maybeSingle:()=>{single=true;return q},insert:values=>{inserting=values;return q},then:(resolve,reject)=>Promise.resolve().then(()=>{
 if(inserting){state.writes.push({table,values:inserting});records[table].push({...inserting,id:'posted',created_at:'2026-10-20T10:00:00Z'});return {error:null};}
 let data=(records[table]||[]).filter(row=>table==='projects'?accessible(row.id):table==='team_members'||table==='team_notifications'?true:row.project_id?accessible(row.project_id):state.profiles[user.id].shared_access).filter(row=>filters.every(f=>f(row))).map(row=>({...row}));
 return {data:head?null:single?(data[0]||null):data.slice(0,limit),count:data.length,error:null};}).then(resolve,reject)};return q;
}
db={from:query,channel:()=>{const c={on:()=>c,subscribe:()=>c};return c},removeChannel:()=>{},rpc:async(name,args={})=>{
 if(name==='my_dashboard_access')return state.failAccess?{error:{code:'PGRST202'}}:{data:{...state.profiles[user.id]}};
 if(name==='touch_member_presence'){if(state.failPresence)return {error:{message:'Offline'}};state.online.add(user.id);return {data:null};}
 if(name==='leave_member_presence'){state.online.delete(user.id);return {data:null};}
 if(name==='team_online_members')return {data:records.team_members.map(m=>({...m,online:state.online.has(m.user_id)}))};
 if(name==='list_member_access')return {data:records.team_members.map(m=>({...m,...state.profiles[m.user_id],project_rules:(state.rules[m.user_id]||[]).map(id=>({project_id:id,allowed:true}))}))};
 if(name==='set_member_access'){state.writes.push({rpc:name,args});state.rules[args.target]=args.allowed_projects;Object.assign(state.profiles[args.target],{project_mode:args.mode,shared_access:args.shared});return {data:null};}
 return {error:{message:'Unknown RPC'}};
}};
state.switchUser=async id=>{await teamAccess.leave();showLogin();await enterApp({id});showView('overview');};
state.refresh=()=>refreshAll();state.navigate=id=>showView(id);await state.switchUser('quan');window.ready=true;
'''
html=html.replace('</script></body>',fixture+'</script></body>')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1280,'height':1000});errors=[];page.on('pageerror',lambda e:(errors.append(str(e)),print('Browser error:',str(e))))
 def route(r):
  url=r.request.url
  if url=='http://dashboard.test/':return r.fulfill(body=html,content_type='text/html')
  if url.startswith('http://dashboard.test/'):
   path=root/url.removeprefix('http://dashboard.test/')
   if path.name in ('home.js','d3.min.js'):return r.fulfill(body='',content_type='application/javascript')
   return r.fulfill(body=path.read_bytes() if path.is_file() else b'',content_type=mimetypes.guess_type(path)[0] or 'text/plain')
  return r.fulfill(body='',content_type='text/css')
 page.route('**/*',route);page.goto('http://dashboard.test/');page.wait_for_function('window.ready')
 page.locator('.sidebar [data-view=members]').click();page.wait_for_function('document.querySelectorAll(".member-access-card").length===3')
 assert page.locator('.online-member').count()==3
 assert 'Online' in page.locator('.online-member').filter(has_text='Quan').inner_text()
 assert page.locator('#membersOnlineCount').inner_text()=='2'
 owner=page.locator('[data-member-id=quan]');assert owner.locator('select').count()==0
 t=page.locator('[data-member-id=tertius]');assert not t.locator('[value=dusted]').is_checked()
 t.locator('select').select_option('selected');t.locator('[name=shared]').uncheck();t.get_by_role('button',name='Save access').click()
 page.wait_for_function('accessTest.writes.some(w=>w.rpc==="set_member_access")')
 saved=page.evaluate('accessTest.writes.find(w=>w.rpc==="set_member_access").args')
 assert saved=={'target':'tertius','mode':'selected','shared':False,'allowed_projects':['fragile','loden']}

 page.evaluate("accessTest.profiles.tertius.shared_access=true;accessTest.switchUser('tertius')")
 page.wait_for_function('document.querySelector("#dustedShortcut").hidden')
 assert page.locator('#dustedPrivateChatShortcut').is_hidden()
 assert page.locator('#fragileShortcut').is_visible()
 page.evaluate("accessTest.navigate('dusted')")
 assert not page.locator('#dusted').evaluate('(el)=>el.classList.contains("active")')
 page.locator('.sidebar [data-view=projects]').click()
 assert 'Dusted.' not in page.locator('#allProjects').inner_text()
 page.locator('.sidebar [data-view=members]').click();assert page.locator('#memberAccessControls').is_hidden()

 page.evaluate("accessTest.switchUser('josh')");page.wait_for_function('!document.querySelector("#dustedPrivateChatShortcut").hidden')
 assert page.locator('#fragileShortcut').is_hidden()
 assert page.locator('.sidebar [data-view=discussions]').is_hidden()
 page.locator('.sidebar [data-view=projects]').click()
 assert page.locator('#allProjects .project-card').count()==1
 assert 'Dusted.' in page.locator('#allProjects').inner_text()
 page.locator('#dustedPrivateChatShortcut').click();page.wait_for_function('document.querySelector("#dustedMessages").textContent.includes("Dusted owner")')
 assert page.locator('#dustedChatPanel .fragile-toolbar h2').inner_text()=='Dusted. team chat'
 assert 'Fragile private team' not in page.locator('#dustedMessages').inner_text()
 page.locator('#dustedChatText').fill('Josh private message');page.locator('#dustedChatSend').click()
 page.wait_for_function('accessTest.writes.some(w=>w.table==="brand_messages")')
 assert page.evaluate('accessTest.writes.find(w=>w.table==="brand_messages").values')=={'body':'Josh private message','user_id':'josh','project_id':'dusted'}
 page.locator('.sidebar [data-view=calendar]').click();page.locator('#calendar [data-add=calendar]').click()
 assert page.locator('#field-project_id').input_value()=='dusted'
 assert page.locator('#field-project_id option').count()==1
 assert page.locator('#field-project_id').get_attribute('required') is not None
 page.locator('#cancelDialog').click()
 page.locator('.sidebar [data-view=dashboard]').click()
 assert page.locator('#recentMessages').is_hidden();assert page.locator('#budgetSpent').is_hidden()
 page.locator('#dustedPrivateChatShortcut').click();page.wait_for_function('document.querySelector("#dustedMessages").textContent.includes("Josh private message")')
 # Revocation clears open private views/cached chat and closes dialogs.
 page.evaluate("accessTest.rules.josh=[];accessTest.refresh()")
 page.wait_for_function('document.querySelector("#overview").classList.contains("active")')
 assert page.locator('#dustedMessages').inner_text()==''
 assert page.locator('#dustedPrivateChatShortcut').is_hidden()
 page.evaluate('accessTest.failAccess=true;accessTest.refresh()')
 page.wait_for_function('!document.querySelector("#teamAccessNotice").hidden')
 assert page.locator('.sidebar [data-view=projects]').is_hidden()
 page.locator('.sidebar [data-view=members]').click()
 page.evaluate('accessTest.failPresence=true');page.locator('#membersRefresh').click()
 page.wait_for_function('document.querySelector("#membersOnlineLabel").textContent==="Status unavailable"')
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/quest-members.png',full_page=True)
 assert not errors,errors
 b.close();print('PASS browser: online roster, owner-only permissions editor, role-specific navigation, Dusted private chat, scoped event selection, hidden shared budget/chat, revocation, fail-closed setup, connection errors and mobile layout.')

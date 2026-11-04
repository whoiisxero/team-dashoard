"""Legacy feature tests use an owner session; permission integration has its own suite."""
def full_access_fixture(html):
    fixture='''<script>try{if(!localStorage.getItem('quest-sidebar-sections-v2'))localStorage.setItem('quest-sidebar-sections-v2',JSON.stringify({work:true,studios:true,business:true,tools:true,settings:true}));}catch{}window.createTeamAccess=()=>({policy:{ready:true,is_admin:true,project_mode:'all',shared_access:true,can_create_projects:true},load:async()=>true,apply:()=>{},canView:()=>true,canEdit:()=>true,start:()=>{},leave:async()=>{},reset:()=>{},loadMembers:async()=>{}});</script>'''
    return html.replace('<script src="./team-access.js"></script>',fixture)

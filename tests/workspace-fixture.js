window.workspaceTest={notesError:null,fail:false,writes:[],notes:[{id:'n1',project_id:'p1',title:'Loden brief',body:'Prepare portfolio',created_by:'quan',created_at:'2026-10-17T10:00:00Z'},{id:'n2',project_id:'p1',title:'Shared idea',body:'Tertius notes',created_by:'tertius',created_at:'2026-10-17T09:00:00Z'},{id:'n3',project_id:'p2',title:'Reddington brief',body:'Other project notes',created_by:'tertius',created_at:'2026-10-17T08:00:00Z'}]};
const state=workspaceTest;user={id:'quan'};roster=[{user_id:'quan',display_name:'Quan'},{user_id:'tertius',display_name:'Tertius'}];
projects=[{id:'p1',name:'Loden',client:'Client one',status:'On hold',progress:10},{id:'p2',name:'Reddington',status:'On track',progress:50}];
calendarEvents=[{id:'ev1',project_id:'p1',title:'Loden casting',detail:'Bring a portfolio',event_date:'2026-10-18',created_by:'quan'},{id:'ev2',project_id:'p2',title:'Other project audition',event_date:'2026-10-18',created_by:'tertius'}];
tasks=[{id:'t1',project_id:'p1',title:'Prepare brief',status:'To do',assigned_to:'tertius',due_date:'2026-10-19',created_by:'quan'},{id:'t2',project_id:'p2',title:'Other project task',status:'Done',created_by:'tertius'}];
expenses=[{id:'e1',project_id:'p1',title:'Transport',amount:40,category:'Travel',spent_on:'2026-10-17',created_by:'quan'},{id:'e2',project_id:'p2',title:'Other project cost',amount:999,spent_on:'2026-10-17',created_by:'tertius'}];
function query(table){let filters=[],update=null,insert=null,single=false;const collection=()=>table==='project_notes'?state.notes:table==='tasks'?tasks:table==='calendar_events'?calendarEvents:expenses;
 const q={select:()=>q,eq:(key,value)=>{filters.push(row=>row[key]===value);return q},order:()=>q,maybeSingle:()=>{single=true;return q},update:values=>{update=values;return q},insert:values=>{insert=values;return q},then:(resolve,reject)=>Promise.resolve().then(()=>{
 if(table==='project_notes'&&state.notesError)return {error:{code:state.notesError}};
 if((update||insert)&&state.fail)return {error:{message:'Save denied'}};
 if(insert){const row={...insert,id:'new-'+state.writes.length,created_at:'2026-10-17T12:00:00Z'};collection().push(row);state.writes.push({table,values:{...insert}});return {error:null};}
 const rows=collection().filter(r=>filters.every(f=>f(r)));
 if(update){for(const row of rows)Object.assign(row,update);state.writes.push({table,values:{...update}});return {data:single?(rows[0]||null):rows,error:null};}
 return {data:single?(rows[0]||null):rows.map(r=>({...r})),error:null};}).then(resolve,reject)};return q;}
db={from:query};refreshAll=async()=>{render();void projectWorkspace.loadNotes()};document.querySelector('#loginScreen').hidden=true;document.querySelector('#appShell').hidden=false;showView('projects');window.ready=true;

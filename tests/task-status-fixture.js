accessTest.records.tasks=[
 {id:'pending-task',project_id:'loden',title:'Plan launch',status:'To do',assigned_to:'quan',created_by:'quan'},
 {id:'working-task',project_id:'fragile',title:'Design samples',status:'In progress',assigned_to:'tertius',created_by:'quan'},
 {id:'done-task',project_id:'loden',title:'Approve brief',status:'Done',created_by:'quan'},
 {id:'dusted-task',project_id:'dusted',title:'Dusted launch',status:'To do',created_by:'quan'}
];
accessTest.profiles.editor={ready:true,is_admin:false,project_mode:'selected',shared_access:false,access_levels_ready:true,editable_project_ids:['loden']};
accessTest.rules.editor=['loden','dusted'];accessTest.records.team_members.push({user_id:'editor',display_name:'Editor'});
const taskTest=window.taskTest={writes:[],fail:false,noRows:false,defer:false};const originalFrom=db.from;
db.from=table=>{
 if(table!=='tasks')return originalFrom(table);
 let filters=[],update=null,insert=null,single=false;const actor=user.id;
 const q={select:()=>q,eq:(key,value)=>{filters.push(r=>r[key]===value);return q;},order:()=>q,limit:()=>q,maybeSingle:()=>{single=true;return q;},update:values=>{update=values;return q;},insert:values=>{insert=values;return q;},then:(resolve,reject)=>{
  const run=()=>{
   const profile=accessTest.profiles[actor],visible=row=>profile.is_admin||accessTest.rules[actor]?.includes(row.project_id),editable=row=>visible(row)&&(profile.is_admin||profile.editable_project_ids==null||profile.editable_project_ids.includes(row.project_id));
   if(update){taskTest.writes.push({actor,update});if(taskTest.fail)return {error:{message:'Status save failed'}};const found=accessTest.records.tasks.filter(visible).filter(r=>filters.every(f=>f(r))).filter(editable);if(taskTest.noRows)return {data:null,error:null};for(const row of found)Object.assign(row,update);return {data:single?found[0]||null:found,error:null};}
   if(insert){const row={...insert,id:'new-task',status:insert.status||'To do'};if(!editable(row))return {error:{message:'Denied'}};accessTest.records.tasks.push(row);return {error:null};}
   return {data:accessTest.records.tasks.filter(visible).filter(r=>filters.every(f=>f(r))).map(r=>({...r})),error:null};
  };
  return (update&&taskTest.defer?new Promise(resolve=>taskTest.finish=()=>resolve(run())):Promise.resolve().then(run)).then(resolve,reject);
 }};return q;
};
taskTest.openProject=id=>projectWorkspace.open(id);await accessTest.refresh();window.taskStatusReady=true;

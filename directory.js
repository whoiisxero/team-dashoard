/* Presentation cleanup for the explicitly retired directory identity.
   Database studio-only rules remain authoritative for access and communication. */
window.QuestDirectory=(()=>{
 let scoped=[];
 const hidden=member=>!!member&&(member.directory_hidden||member.user_id==='5c9e7be8-1956-47aa-8449-d482851edac9'||String(member.display_name||'').trim().toLowerCase()==='jen');
 const visible=members=>(members||[]).filter(member=>!hidden(member));
 const alias='Fragile collaborator';
 const text=value=>String(value??'').replace(/\bJen\b/gi,alias);
 const fields=['display_name','actor_name','item_title','name','title','body','detail','notes','client','description','snippet','priority_reason','category','collection','location'];
 // Apply the same display rule to historical snapshots and current project data.
 // IDs, permissions, storage paths, dates and the original database records stay intact.
 function record(row){
  if(!row)return row;
  const shown={...row};for(const key of fields)if(typeof row[key]==='string')shown[key]=text(row[key]);
  if('display_name' in row&&hidden(row))shown.display_name=alias;
  const retired=hidden({user_id:row.actor_id,display_name:row.actor_name});
  if(retired)shown.actor_name=alias;
  if(row.source_table==='private_chat_messages'&&shown.item_title!==row.item_title)shown.item_title='Private conversation';
  return shown;
 }
 const rows=values=>(values||[]).map(record);
 return {visible,hidden,text,record,rows,notification:record,capture(members){scoped=rows((members||[]).filter(hidden));return rows(visible(members));},get fragilePeople(){return scoped.map(m=>({...m}));},reset(){scoped=[];}};
})();

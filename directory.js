/* Presentation cleanup for the explicitly retired directory identity.
   Database studio-only rules remain authoritative for access and communication. */
window.QuestDirectory=(()=>{
 let scoped=[];
 const hidden=member=>!!member&&(member.directory_hidden||member.user_id==='5c9e7be8-1956-47aa-8449-d482851edac9'||String(member.display_name||'').trim().toLowerCase()==='jen');
 const visible=members=>(members||[]).filter(member=>!hidden(member));
 // Old notifications keep actor and room-name snapshots, independent of the roster.
 // Change only their presentation; retain notification IDs, links and read state.
 function notification(row){
  const retired=hidden({user_id:row.actor_id,display_name:row.actor_name});
  const title=String(row.item_title||'').replace(/\bJen\b/gi,'Fragile collaborator');
  return {...row,actor_name:retired?'Fragile collaborator':row.actor_name,item_title:row.source_table==='private_chat_messages'&&title!==row.item_title?'Private conversation':title};
 }
 return {visible,hidden,notification,capture(members){scoped=(members||[]).filter(hidden);return visible(members);},get fragilePeople(){return scoped.map(m=>({...m}));},reset(){scoped=[];}};
})();

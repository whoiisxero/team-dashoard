/* Presentation cleanup for the explicitly retired directory identity.
   Database studio-only rules remain authoritative for access and communication. */
window.QuestDirectory=(()=>{
 let scoped=[];
 const hidden=member=>!!member&&(member.directory_hidden||member.user_id==='5c9e7be8-1956-47aa-8449-d482851edac9'||String(member.display_name||'').trim().toLowerCase()==='jen');
 const visible=members=>(members||[]).filter(member=>!hidden(member));
 return {visible,hidden,capture(members){scoped=(members||[]).filter(hidden);return visible(members);},get fragilePeople(){return scoped.map(m=>({...m}));},reset(){scoped=[];}};
})();

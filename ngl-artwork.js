/* Original NGL artwork stays in the project's private file storage. */
window.createNglArtwork=({getData,view,toast})=>{
 const $=id=>view.querySelector('#nglArtwork'+id),form=$('Form'),image=$('Image'),placeholder=$('Placeholder');
 const BUCKET='quest-project-files',TYPES=['image/jpeg','image/png','image/webp'];
 let scope='',epoch=0,request=0,pickRequest=0,poll=null,savedUrl='',savedPath='',draftUrl='',draft=null,busy=false,failed=false;
 const snapshot=()=>{const data=getData(),project=data.projects.find(p=>p.name.trim().toLowerCase()==='ngl');
  return {data,uid:data.user?.id,pid:project?.id,ready:!!data.policy?.ready,
   editable:!!data.policy&&(project?(data.canEditProject?.(project.id)??false):!!data.policy.is_admin)};};
 const keyOf=ctx=>[ctx.uid,ctx.pid,ctx.ready,ctx.editable].join('|');
 const current=(generation,key)=>generation===epoch&&key===keyOf(snapshot());
 function show(){const url=draftUrl||savedUrl;image.hidden=!url;placeholder.hidden=!!url;if(url)image.src=url;else image.removeAttribute('src');}
 function controls(){const ctx=snapshot();$('Choose').hidden=!ctx.editable;$('Choose').disabled=busy;$('File').disabled=busy||!ctx.editable;
  $('Choose').textContent=savedUrl?'Change logo':'Add NGL logo';$('Save').hidden=!draft;$('Save').disabled=busy||!ctx.pid||!ctx.editable;
  $('Save').textContent=busy?'Saving logo…':'Save logo';$('Cancel').hidden=!draft;$('Cancel').disabled=busy;$('Retry').hidden=!failed||!!draft;
  if(draft)form.dataset.appDirty='true';else delete form.dataset.appDirty;if(busy)form.dataset.appSaving='true';else delete form.dataset.appSaving;}
 function reset(){epoch++;request++;scope='';if(poll)clearInterval(poll);poll=null;for(const url of [savedUrl,draftUrl])if(url)URL.revokeObjectURL(url);
  savedUrl='';savedPath='';draftUrl='';draft=null;busy=false;failed=false;form.reset();show();$('Status').textContent='JPG, PNG or WebP · up to 10 MB.';controls();}
 function sync(){const key=keyOf(snapshot());if(scope!==key){reset();scope=key;}controls();}
 async function load(){sync();const ctx=snapshot(),generation=epoch,key=scope,read=++request;if(!ctx.uid||!ctx.pid||!ctx.ready||busy||draft)return;
  try{const result=await ctx.data.db.from('project_files').select('id,project_id,object_path,mime_type').eq('project_id',ctx.pid)
    .like('object_path',ctx.pid+'/%/ngl-artwork/%').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle();
   if(!current(generation,key)||read!==request)return;if(result.error)throw result.error;const file=result.data;
   if(!file){if(savedUrl)URL.revokeObjectURL(savedUrl);savedUrl='';savedPath='';show();failed=false;$('Status').textContent='Add your NGL logo. JPG, PNG or WebP · up to 10 MB.';return;}
   if(!TYPES.includes(file.mime_type))throw Error('This logo format cannot be displayed. Choose a JPG, PNG or WebP image.');
   if(file.object_path!==savedPath||!savedUrl){const download=await ctx.data.db.storage.from(BUCKET).download(file.object_path);
    if(!current(generation,key)||read!==request)return;if(download.error)throw download.error;
    const blob=new Blob([download.data],{type:file.mime_type}),url=URL.createObjectURL(blob),probe=new Image();probe.src=url;
    try{await probe.decode();}catch{URL.revokeObjectURL(url);throw Error('The logo could not be displayed. Choose another image or retry.');}
    if(!current(generation,key)||read!==request){URL.revokeObjectURL(url);return;}
    if(savedUrl)URL.revokeObjectURL(savedUrl);savedUrl=url;savedPath=file.object_path;show();}
   failed=false;if(!draft)$('Status').textContent='NGL logo · visible only to people with studio access.';
  }catch(error){if(current(generation,key)&&read===request){failed=true;if(savedUrl)URL.revokeObjectURL(savedUrl);savedUrl='';savedPath='';show();
    if(!draft)$('Status').textContent=navigator.onLine===false?'You’re offline. Reconnect and retry the logo.':'Could not load the logo. Retry, or add your original image.';}}
  finally{if(current(generation,key))controls();}
 }
 $('Choose').onclick=()=>{sync();if(snapshot().editable&&!busy)$('File').click();};
 $('File').onchange=async()=>{sync();const file=$('File').files[0],ctx=snapshot(),generation=epoch,key=scope,pick=++pickRequest;$('File').value='';if(!file||!ctx.editable||busy)return;request++;
  if(!TYPES.includes(file.type)||file.size<1||file.size>10*1024*1024){$('Status').textContent='Choose a JPG, PNG or WebP image up to 10 MB.';return;}
  const url=URL.createObjectURL(file),probe=new Image();probe.src=url;
  try{await probe.decode();}catch{URL.revokeObjectURL(url);if(current(generation,key))$('Status').textContent='This file could not be opened as an image. Choose another JPG, PNG or WebP.';return;}
  if(!current(generation,key)||pick!==pickRequest){URL.revokeObjectURL(url);return;}request++;if(draftUrl)URL.revokeObjectURL(draftUrl);draft=file;draftUrl=url;show();
  $('Status').textContent=ctx.pid?'Logo preview — not saved yet. Save to share it with the NGL studio.':'Logo preview — not saved yet. Connect NGL before saving.';controls();
 };
 $('Cancel').onclick=()=>{if(busy)return;if(draftUrl)URL.revokeObjectURL(draftUrl);draftUrl='';draft=null;show();$('Status').textContent=savedUrl?'Saved NGL logo restored.':'JPG, PNG or WebP · up to 10 MB.';controls();};
 $('Retry').onclick=()=>void load();
 form.onsubmit=async event=>{event.preventDefault();sync();const ctx=snapshot(),generation=epoch,key=scope,file=draft;
  if(busy||!file||!ctx.uid||!ctx.pid||!ctx.editable)return;if(navigator.onLine===false){$('Status').textContent='You’re offline. Your logo preview is still here; reconnect and save.';return;}
  busy=true;failed=false;controls();$('Status').textContent='Saving NGL logo…';const id=crypto.randomUUID(),extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type],path=`${ctx.pid}/${ctx.uid}/ngl-artwork/${id}.${extension}`;
  let uploaded=false,stored=false;
  try{const upload=await ctx.data.db.storage.from(BUCKET).upload(path,file,{contentType:file.type,cacheControl:'0',upsert:false});if(upload.error)throw upload.error;uploaded=true;
   if(!current(generation,key))throw Error('Your account or NGL access changed.');
   const result=await ctx.data.db.from('project_files').insert({id,project_id:ctx.pid,created_by:ctx.uid,name:'NGL studio logo',object_path:path,mime_type:file.type,size_bytes:file.size,moodboard:false});
   if(result.error)throw result.error;stored=true;if(!current(generation,key))return;
   if(savedUrl)URL.revokeObjectURL(savedUrl);savedUrl=draftUrl;savedPath=path;draftUrl='';draft=null;show();$('Status').textContent='Logo saved to NGL. Your original artwork is unchanged.';toast?.('NGL logo saved');
   window.dispatchEvent(new CustomEvent('quest:project-files-changed'));
  }catch(error){if(uploaded&&!stored)try{await ctx.data.db.storage.from(BUCKET).remove([path]);}catch{}
   if(current(generation,key))$('Status').textContent='Logo not saved. '+(error?.message||'Please retry.')+' Your preview is still here.';
  }finally{if(current(generation,key)){busy=false;controls();}}
 };
 function activate(){sync();void load();if(!poll)poll=setInterval(()=>{if(view.classList.contains('active')&&!document.hidden&&navigator.onLine!==false)void load();},30000);}
 window.addEventListener('quest:project-files-changed',()=>{if(view.classList.contains('active'))void load();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&view.classList.contains('active'))void load();});
 return {activate,sync,reset};
};

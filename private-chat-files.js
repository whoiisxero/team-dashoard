/* Authenticated private downloads; files, previews and drafts stay in memory. */
window.createPrivateChatFiles=({getContext,onChange})=>{
 const $=id=>document.getElementById(id),el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
 const bucket='quest-private-chat-files',maxSize=20*1024*1024;
 const formats={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',avif:'image/avif',heic:'image/heic',heif:'image/heif',pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',txt:'text/plain',csv:'text/csv'};
 const previewable=mime=>/^image\/(jpeg|png|webp|gif|avif)$/.test(mime),sizeLabel=bytes=>bytes<1048576?Math.ceil(bytes/1024)+' KB':(bytes/1048576).toFixed(1)+' MB';
 const button=(label,handler,cls='button')=>{const b=el('button',label,cls);b.type='button';b.onclick=handler;return b;};
 const controls=el('section','','private-file-controls');controls.id='privateChatFiles';controls.hidden=true;
 const pick=el('input');pick.type='file';pick.multiple=true;pick.accept=Object.keys(formats).map(ext=>'.'+ext).join(',');pick.id='privateChatFilePicker';pick.className='private-file-picker';pick.tabIndex=-1;pick.setAttribute('aria-label','Choose images or documents');
 const add=button('📎 Add images or documents',()=>pick.click());add.id='privateChatAttach';
 const help=el('p','Up to 4 files · 20 MB each · Photos, PDF, Word, Excel, PowerPoint, TXT or CSV.','hint');
 const list=el('div','','private-file-drafts');list.id='privateChatFileDrafts';
 const status=el('p','','private-file-status');status.id='privateChatFileStatus';status.setAttribute('role','status');
 const setup=el('a','Open upload setup','button');setup.id='privateChatUploadSetup';setup.href='/setup-guide.html#weed-diary-uploads';setup.target='_blank';setup.rel='noopener noreferrer';setup.hidden=true;
 controls.append(add,pick,help,list,status,setup);$('privateChatForm').before(controls);
 const viewer=el('dialog','','private-file-viewer'),viewerTitle=el('h2'),large=el('img');viewer.append(button('Close image',()=>viewer.close()),viewerTitle,large);document.body.append(viewer);
 let scope=null,epoch=0,files=[],attempt=null,viewerURL=null,paths=new Set();const urls=new Map(),loading=new Map(),transient=new Set();
 const enabled=()=>{const c=getContext();return !!c.user?.id&&c.room?.room_kind==='direct'&&c.room.room_key?.startsWith('weed-diary-owner-');};
 const locked=()=>!!attempt?.submitted;
 const current=(token,c)=>token===epoch&&c.user?.id===getContext().user?.id&&c.room?.id===getContext().room?.id&&enabled();
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);void loadPreview(entry.target);}},{rootMargin:'200px'}):null;
 function closeViewer(){if(viewer.open)viewer.close();if(viewerURL)URL.revokeObjectURL(viewerURL);viewerURL=null;large.removeAttribute('src');}
 viewer.addEventListener('close',()=>{if(!viewer.open){if(viewerURL)URL.revokeObjectURL(viewerURL);viewerURL=null;large.removeAttribute('src');}});
 function cleanup(draft){if(!draft||draft.submitted||!draft.files.some(f=>f.uploaded))return;const c=getContext();if(c.user?.id!==draft.uid)return;void c.db?.storage?.from(bucket).remove(draft.files.filter(f=>f.uploaded).map(f=>f.path)).catch(()=>{});}
 function clearDraft(removeUploads=true){if(removeUploads)cleanup(attempt);for(const f of files)if(f.url)URL.revokeObjectURL(f.url);files=[];attempt=null;pick.value='';status.textContent='';setup.hidden=true;}
 function reset(){epoch++;clearDraft();scope=null;observer?.disconnect();for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();loading.clear();paths.clear();for(const url of transient)URL.revokeObjectURL(url);transient.clear();closeViewer();list.replaceChildren();controls.hidden=true;}
 function sync(messages){const c=getContext(),key=c.user?.id+':'+c.room?.id;if(scope!==key){reset();scope=key;}
  controls.hidden=!enabled();const blocked=!c.ready||c.sending||!c.writable||locked();add.disabled=blocked;pick.disabled=blocked;
  $('privateChatText').required=!files.length;$('privateChatText').disabled=!c.ready||c.sending||!c.writable||locked();
  $('privateChatSend').textContent=c.sending?(files.length?'Sending files…':'Sending…'):locked()?'Retry send':'Send';
  list.replaceChildren();for(const f of files){const row=el('div','','private-file-draft');if(f.url){const image=el('img');image.src=f.url;image.alt=f.name;row.append(image);}else row.append(el('span','📄','private-file-symbol'));
   const name=el('span',f.name+' · '+sizeLabel(f.file.size));row.append(name);const remove=button('Remove',()=>{cleanup(attempt);attempt=null;if(f.url)URL.revokeObjectURL(f.url);files=files.filter(item=>item!==f);status.textContent='';setup.hidden=true;onChange();});remove.setAttribute('aria-label','Remove '+f.name);remove.disabled=blocked;row.append(remove);list.append(row);}
  observer?.disconnect();const next=new Set(messages.flatMap(safeFiles).map(f=>f.path));for(const [path,url] of urls)if(!next.has(path)){URL.revokeObjectURL(url);urls.delete(path);}paths=next;
  if(viewer.open&&!paths.has(viewer.dataset.path))closeViewer();
 }
 pick.onchange=()=>{const chosen=[...pick.files];pick.value='';if(!enabled()||locked()||getContext().sending)return;
  if(files.length+chosen.length>4){status.textContent='Choose up to 4 files per message.';return;}
  const prepared=[];for(const file of chosen){let ext=file.name.split('.').pop().toLowerCase();const mime=formats[ext];if(!mime||!file.size||file.size>maxSize){status.textContent='Choose supported photos or documents, from 1 byte to 20 MB each.';return;}if(ext==='jpeg')ext='jpg';const name=file.name.replace(/[\x00-\x1f\x7f/\\]/g,'_').trim().slice(0,180)||'File.'+ext;prepared.push({file,ext,mime,name});}
  cleanup(attempt);attempt=null;for(const f of prepared){f.url=previewable(f.mime)?URL.createObjectURL(f.file):null;files.push(f);}status.textContent='Selected files are not sent yet.';setup.hidden=true;onChange();
 };
 function safeFiles(message){return (Array.isArray(message.attachments)?message.attachments:[]).slice(0,4).filter(f=>f&&typeof f.path==='string'&&f.path.startsWith(message.room_id+'/'+message.user_id+'/'+message.id+'/')&&/\/[0-9a-f-]{36}\.[a-z0-9]+$/.test(f.path)&&typeof f.name==='string'&&f.name.length<=180&&Object.values(formats).includes(f.mime)&&Number.isInteger(f.size)&&f.size>0&&f.size<=maxSize);}
 async function authenticatedBlob(file,c,token){const result=await c.db.storage.from(bucket).download(file.path);if(result.error)throw result.error;if(!current(token,c)||!paths.has(file.path))return null;if(!(result.data instanceof Blob))throw Error('File unavailable');return new Blob([result.data],{type:file.mime});}
 async function loadPreview(wrap){const file=wrap.file,c=getContext(),token=epoch;if(!current(token,c)||!paths.has(file.path)||!wrap.isConnected)return;
  try{if(!urls.has(file.path)){if(!loading.has(file.path))loading.set(file.path,authenticatedBlob(file,c,token).then(blob=>{if(blob&&current(token,c)&&paths.has(file.path)){const url=URL.createObjectURL(blob);urls.set(file.path,url);return url;}}).finally(()=>loading.delete(file.path)));await loading.get(file.path);}
   if(!current(token,c)||!wrap.isConnected||!urls.has(file.path))return;const image=wrap.querySelector('img');image.src=urls.get(file.path);wrap.querySelector('.private-file-load')?.remove();
  }catch{if(current(token,c)&&wrap.isConnected){wrap.querySelector('.private-file-load')?.remove();wrap.append(button('Retry image',()=>void loadPreview(wrap),'button private-file-load'));}}
 }
 async function download(file,feedback,showImage=false){const c=getContext(),token=epoch;feedback.textContent='Checking file access…';
  try{const blob=await authenticatedBlob(file,c,token);if(!blob)return;const url=URL.createObjectURL(blob);
   if(showImage){closeViewer();viewerURL=url;viewer.dataset.path=file.path;viewerTitle.textContent=file.name;large.alt=file.name;large.src=url;viewer.showModal();}
   else{transient.add(url);const link=el('a');link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();setTimeout(()=>{URL.revokeObjectURL(url);transient.delete(url);},1000);}feedback.textContent='';
  }catch{if(current(token,c)&&feedback.isConnected)feedback.textContent='File unavailable. Check your connection or access, then retry.';}
 }
 function decorate(post,message){const shared=safeFiles(message);if(!shared.length)return;const gallery=el('div','','private-file-gallery');
  for(const file of shared){const card=el('section','','private-file-card'),feedback=el('p','','private-file-status');feedback.setAttribute('role','status');
   if(previewable(file.mime)){const wrap=el('div','','private-file-image');wrap.file=file;const image=el('img');image.alt=file.name;image.loading='lazy';image.onerror=()=>{wrap.querySelector('.private-file-load')?.remove();wrap.append(el('span','Preview unavailable. Use Download.','private-file-load'));};
    const open=button('',()=>void download(file,feedback,true),'private-file-open');open.setAttribute('aria-label','Open image '+file.name);open.append(image);wrap.append(open);if(urls.has(file.path))image.src=urls.get(file.path);else{wrap.append(el('span','Loading image…','private-file-load'));if(observer)observer.observe(wrap);else setTimeout(()=>void loadPreview(wrap),0);}card.append(wrap);}
   card.append(el('strong',file.name),el('small',sizeLabel(file.size)),button('Download '+file.name,()=>void download(file,feedback)),feedback);gallery.append(card);
  }post.append(gallery);
 }
 async function send(body){const c=getContext(),token=epoch;if(!enabled()||!files.length)throw Error('Choose a file first.');
  if(!attempt||!attempt.submitted&&attempt.body!==body){cleanup(attempt);const id=crypto.randomUUID();attempt={id,uid:c.user.id,room:c.room.id,body,submitted:false,files:files.map(f=>({...f,path:c.room.id+'/'+c.user.id+'/'+id+'/'+crypto.randomUUID()+'.'+f.ext,uploaded:false}))};}
  const draft=attempt;
  try{for(const [i,f] of draft.files.entries()){if(f.uploaded)continue;status.textContent='Uploading '+(i+1)+' of '+draft.files.length+'…';
    let result=await c.db.storage.from(bucket).upload(f.path,f.file,{contentType:f.mime,cacheControl:'0',upsert:false});
    if(result.error&&String(result.error.statusCode||result.error.status)==='409'){const check=await c.db.storage.from(bucket).download(f.path);if(!check.error&&check.data?.size===f.file.size)result={error:null};}
    if(result.error)throw result.error;f.uploaded=true;if(!current(token,c))return;}
   if(!current(token,c))return;draft.submitted=true;status.textContent='Files uploaded. Confirming the message…';
   const result=await c.db.rpc('quest_send_private_chat_files',{message_id:draft.id,chat_id:draft.room,message_body:draft.body,files:draft.files.map(f=>({path:f.path,name:f.name,mime:f.mime,size:f.file.size}))});
   if(result.error)throw result.error;if(result.data?.id!==draft.id)throw Error('Delivery was not confirmed. Retry Send to check the same message.');
   if(current(token,c))clearDraft(false);
  }catch(error){if(current(token,c)){if(error?.code)draft.submitted=false;const needsSetup=['PGRST202','42883','PGRST204','42703'].includes(error?.code)||/bucket.*not found/i.test(error?.message||'');setup.hidden=!needsSetup;status.textContent=needsSetup?'Uploads need their one-time setup. Your text and selected files are still here.':draft.submitted?'Delivery was not confirmed. Retry Send to check the same message; your draft is kept here.':'Could not send your files. Your text and files are still here; retry when connected.';}throw error;}
 }
 async function deleted(message){const shared=safeFiles(message),c=getContext();if(!shared.length)return;try{const result=await c.db.storage.from(bucket).remove(shared.map(f=>f.path));if(result.error)throw result.error;}catch{if(c.user?.id===getContext().user?.id)onChange();}}
 return {sync,decorate,send,deleted,reset,hasFiles:()=>enabled()&&files.length>0,locked};
};

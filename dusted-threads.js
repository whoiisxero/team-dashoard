/* Dusted's private conversation feed. No posts, drafts or images enter offline storage. */
window.createDustedThreads=({getData,getProjectId,toast})=>{
 const $=id=>document.getElementById(id),panel=$('dustedChatPanel'),form=$('dustedChatForm'),text=$('dustedChatText'),send=$('dustedChatSend'),feed=$('dustedMessages'),status=$('dustedChatStatus');
 const bucket='quest-thread-images',types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
 let epoch=0,request=0,ready=false,busy=false,posts=[],stats=new Map(),replies=new Map(),expanded=new Map(),files=[],limit=20,hasMore=false,target=null,attempt=null;
 const working=new Set(),images=new Map(),replyDrafts=new Map();let observer=null;
 const el=(tag,value='',cls='')=>{const n=document.createElement(tag);n.textContent=value;if(cls)n.className=cls;return n;};
 const button=(label,fn,cls='thread-action')=>{const n=el('button',label,cls);n.type='button';n.onclick=fn;return n;};
 const context=()=>{const d=getData();return {db:d.db,user:d.user,project:getProjectId()};};
 const writable=()=>{const c=context();return !!c.user&&!!c.project&&(getData().canEditProject?.(c.project)??false);};
 const person=id=>getData().roster?.find(m=>m.user_id===id)?.display_name||(id===context().user?.id?'You':'Team member');
 const current=(token,c)=>token===epoch&&context().user?.id===c.user?.id&&context().project===c.project;
 panel.classList.add('dusted-threads');panel.querySelector('h2').textContent='Dusted. conversations';
 panel.querySelector('.hint').textContent='Ideas, images and conversations. Only people with Dusted access can see this feed.';
 text.required=false;text.placeholder='What’s happening with Dusted?';text.setAttribute('aria-label','Dusted post or reply');
 const replyBar=el('div','','thread-reply-banner');replyBar.hidden=true;form.prepend(replyBar);
 const preview=el('div','','thread-previews');preview.id='dustedThreadPreviews';
 const picker=el('input');picker.type='file';picker.multiple=true;picker.accept=Object.keys(types).join(',');picker.id='dustedThreadImages';picker.className='thread-file-input';picker.setAttribute('aria-label','Attach images to your Dusted post');
 const attach=el('label','＋ Photos','button thread-attach');attach.htmlFor=picker.id;
 const actions=el('div','','thread-composer-actions'),help=el('small','Up to 4 images · JPG, PNG, WebP or GIF · 8 MB each');
 actions.append(attach,picker,help,send);form.append(preview,actions);form.classList.add('thread-composer');
 const more=button('Load older posts',()=>{limit+=20;void refresh();},'button thread-load-more');more.hidden=true;feed.after(more);
 const viewer=el('dialog','','thread-image-dialog'),close=button('Close image',()=>viewer.close(),'button'),large=el('img');large.alt='Dusted conversation image';viewer.append(close,large);document.body.append(viewer);viewer.onclick=e=>{if(e.target===viewer)viewer.close();};viewer.addEventListener('close',()=>large.removeAttribute('src'));
 // Keep the prepared discussion questions available without burying the feed.
 const questions=panel.querySelector('.dusted-brand-questions');if(questions){const details=el('details','','thread-starters');details.append(el('summary','Need a conversation starter?'),questions);panel.append(details);}
 function controls(){form.dataset.appDirty=String(files.length>0||!!text.value.trim());form.dataset.appSaving=String(busy);const can=ready&&writable()&&!busy;text.disabled=!can;picker.disabled=!can;attach.setAttribute('aria-disabled',String(!can));send.disabled=!can;send.textContent=busy?'Posting…':target?'Post reply':'Post';for(const b of preview.querySelectorAll('button'))b.disabled=busy;}
 function draftPreview(){preview.replaceChildren();for(const [i,file] of files.entries()){const wrap=el('div','','thread-preview'),image=el('img');image.src=file.url;image.alt=file.file.name;wrap.append(image,button('Remove '+file.file.name,()=>{URL.revokeObjectURL(file.url);files.splice(i,1);attempt=null;draftPreview();},'thread-remove-image'));preview.append(wrap);}controls();}
 function replyTo(post){if(!ready||!writable()||busy)return;target=post;replyBar.replaceChildren(el('span','Replying to '+person(post.user_id)),button('Cancel reply',()=>{target=null;replyBar.hidden=true;controls();}));replyBar.hidden=false;controls();text.focus();form.scrollIntoView({behavior:'smooth',block:'center'});}
 picker.onchange=async()=>{
  const selected=Array.from(picker.files||[]);picker.value='';if(busy||!ready||!writable())return;
  if(files.length+selected.length>4){status.textContent='Choose up to 4 images per post.';return;}
  if(selected.some(f=>!types[f.type]||!f.size||f.size>8*1024*1024)){status.textContent='Use JPG, PNG, WebP or GIF images, no larger than 8 MB each.';return;}
  for(const file of selected)files.push({file,url:URL.createObjectURL(file)});attempt=null;draftPreview();status.textContent='Images selected. Press Post to share them.';
 };
 function imageNode(path,index){
  const wrap=el('div','','thread-image'),image=el('img');image.alt='Shared image '+(index+1);image.loading='lazy';const open=button('',()=>{if(image.dataset.loaded){large.src=image.src;viewer.dataset.path=path;viewer.showModal();}},'thread-image-open');open.setAttribute('aria-label','Open shared image '+(index+1));open.append(image);wrap.append(open);wrap.dataset.imagePath=path;
  if(images.has(path)){image.src=images.get(path);image.dataset.loaded='true';}
  else {wrap.append(el('span','Loading image…','thread-image-status'));observer?.observe(wrap);}
  image.onerror=()=>{wrap.querySelector('.thread-image-status')?.remove();wrap.append(el('span','Image unavailable. Refresh to retry.','thread-image-status'));};return wrap;
 }
 async function loadImage(wrap){
  observer?.unobserve(wrap);const path=wrap.dataset.imagePath,c=context(),token=epoch;
  if(!ready||!c.user||!c.project)return;
  try{const {data,error}=await c.db.storage.from(bucket).download(path);if(error)throw error;if(!current(token,c)||!ready)return;
   if(!images.has(path))images.set(path,URL.createObjectURL(data));if(!wrap.isConnected)return;const img=wrap.querySelector('img');img.src=images.get(path);img.dataset.loaded='true';wrap.querySelector('.thread-image-status')?.remove();
  }catch{if(!current(token,c)||!wrap.isConnected)return;wrap.querySelector('.thread-image-status')?.remove();wrap.append(button('Retry image',()=>{wrap.querySelector('.thread-action')?.remove();void loadImage(wrap);}));}
 }
 function row(post,isReply=false){
  const card=el('article','',isReply?'thread-post thread-reply':'thread-post');card.dataset.threadId=post.id;
  const avatar=el('span',person(post.user_id).slice(0,1).toUpperCase(),'thread-avatar');avatar.setAttribute('aria-hidden','true');
  const content=el('div','','thread-content'),meta=el('div','','thread-meta'),date=el('time',new Date(post.created_at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}));date.dateTime=post.created_at;date.title=new Date(post.created_at).toLocaleString();meta.append(el('span',isReply?'↳ Reply':'Main post','thread-kind'),el('strong',person(post.user_id)),date);
  if(post.user_id===context().user?.id&&writable()){const remove=button('Delete',()=>void removePost(post),'thread-delete');remove.disabled=busy||working.has(post.id);meta.append(remove);}
  content.append(meta);if(post.body)content.append(el('p',post.body,'thread-body'));
  if(post.image_paths?.length){const gallery=el('div','','thread-gallery');gallery.dataset.count=post.image_paths.length;post.image_paths.forEach((path,i)=>gallery.append(imageNode(path,i)));content.append(gallery);}
  const s=stats.get(post.id)||{},foot=el('div','','thread-actions'),like=button((s.liked?'♥':'♡')+' '+(s.like_count||0),()=>void toggleLike(post));like.setAttribute('aria-label',(s.liked?'Unlike':'Like')+' post');like.setAttribute('aria-pressed',String(!!s.liked));like.disabled=!ready||!writable()||working.has(post.id);foot.append(like);
  if(!isReply){const count=Number(s.reply_count||0),toggle=button((expanded.has(post.id)?'Hide thread · ':'Show thread · ')+count+(count===1?' reply':' replies'),()=>{if(expanded.has(post.id))expanded.delete(post.id);else expanded.set(post.id,20);void refresh();});toggle.setAttribute('aria-expanded',String(expanded.has(post.id)));foot.append(toggle);if(writable()){const reply=button('Reply',()=>Array.from(card.querySelectorAll('[data-reply-for]')).find(input=>input.dataset.replyFor===post.id)?.focus());reply.disabled=!ready||busy;foot.append(reply);}}
  content.append(foot);card.append(avatar,content);
  if(!isReply&&expanded.has(post.id)){const conversation=el('section','','thread-conversation');conversation.setAttribute('aria-label','Replies to '+person(post.user_id));const heading=el('div','','thread-conversation-heading');heading.append(el('strong','↳ Conversation thread'),el('small','Replies to the main post above'));conversation.append(heading);const list=replies.get(post.id)||[];for(const reply of list)conversation.append(row(reply,true));if(!list.length)conversation.append(el('p','No replies yet. Start the conversation.','hint'));if(list.length<Number(s.reply_count||0))conversation.append(button('Load more replies',()=>{expanded.set(post.id,(expanded.get(post.id)||20)+20);void refresh();},'button'));content.append(conversation);}
  if(writable())content.append(inlineReply(post));
  return card;
 }
 function inlineReply(post){
  const draft=replyDrafts.get(post.id)||{body:'',id:null,error:''};
  const form=el('form','','thread-inline-reply'),input=el('textarea'),submit=el('button','Reply','button'),error=el('p',draft.error,'thread-inline-error');
  input.placeholder='Reply to '+person(post.user_id)+'…';input.setAttribute('aria-label','Reply to '+person(post.user_id));input.dataset.replyFor=post.id;input.maxLength=4000;input.rows=2;input.value=draft.body;input.disabled=!ready||busy;submit.type='submit';submit.disabled=!ready||busy||!draft.body.trim();error.setAttribute('role','status');form.dataset.appDirty=String(!!draft.body.trim());form.dataset.appSaving=String(!!draft.sending);
  input.oninput=()=>{draft.body=input.value;draft.id=null;draft.error='';replyDrafts.set(post.id,draft);submit.disabled=!ready||busy||!draft.body.trim();form.dataset.appDirty=String(!!draft.body.trim());error.textContent='';};
  form.onsubmit=async event=>{
   event.preventDefault();if(!ready||!writable()||busy||!draft.body.trim())return;
   const c=context(),token=epoch;draft.id ||= crypto.randomUUID();draft.sending=true;replyDrafts.set(post.id,draft);busy=true;render();
   try{
    const payload={id:draft.id,project_id:c.project,user_id:c.user.id,body:draft.body.trim(),parent_id:post.parent_id||post.id,image_paths:[]};
    const result=await c.db.from('brand_messages').insert(payload);
    if(result.error){if(result.error.code!=='23505')throw result.error;const saved=await c.db.from('brand_messages').select('id').eq('project_id',c.project).eq('id',draft.id).eq('user_id',c.user.id).maybeSingle();if(saved.error||!saved.data)throw result.error;}
    if(!current(token,c))return;replyDrafts.delete(post.id);expanded.set(payload.parent_id,Math.max(20,Number(stats.get(payload.parent_id)?.reply_count||0)+1));await refresh();toast('Reply posted');
   }catch{if(current(token,c))draft.error='Could not send. Your reply is still here. Please retry.';}
   finally{if(current(token,c)){busy=false;draft.sending=false;render();}}
  };
  const label=el('label',post.parent_id?'Reply to '+person(post.user_id)+' in this thread':'Reply to this main post','thread-reply-label');label.htmlFor='thread-reply-'+post.id;input.id=label.htmlFor;form.append(label,input,submit,error);return form;
 }
 function render(){
  const focused=document.activeElement,focusKey=focused?.dataset.replyFor,selection=focusKey?[focused.selectionStart,focused.selectionEnd]:null;
  observer?.disconnect();observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting)void loadImage(e.target);},{rootMargin:'200px'});
  feed.replaceChildren();for(const post of posts)feed.append(row(post));if(ready&&!posts.length)feed.append(el('p','Start the first conversation. Share an idea or a photo.','empty'));more.hidden=!hasMore;more.disabled=busy||!ready;controls();
  if(focusKey){const input=Array.from(feed.querySelectorAll('[data-reply-for]')).find(n=>n.dataset.replyFor===focusKey);if(input&&!input.disabled){input.focus({preventScroll:true});input.setSelectionRange(...selection);}}
 }
 function clearImages(){observer?.disconnect();for(const url of images.values())URL.revokeObjectURL(url);images.clear();if(viewer.open)viewer.close();large.removeAttribute('src');}
 function setupError(error){return ['42703','42P01','PGRST202','PGRST204','PGRST205'].includes(error?.code);}
 async function refresh(){
  const c=context();if(!c.user||!c.project)return;const token=epoch,req=++request;
  try{
   const result=await c.db.from('brand_messages').select('*').eq('project_id',c.project).is('parent_id',null).order('created_at',{ascending:false}).order('id',{ascending:false}).range(0,limit);
   if(result.error)throw result.error;if(!current(token,c)||req!==request)return;const roots=(result.data||[]).slice(0,limit),loaded=new Map();
   await Promise.all(roots.filter(p=>expanded.has(p.id)).map(async p=>{const r=await c.db.from('brand_messages').select('*').eq('project_id',c.project).eq('parent_id',p.id).order('created_at',{ascending:true}).order('id',{ascending:true}).range(0,expanded.get(p.id)-1);if(r.error)throw r.error;loaded.set(p.id,r.data||[]);}));
   const ids=[...roots,...Array.from(loaded.values()).flat()].map(p=>p.id),counts=ids.length?await c.db.rpc('quest_thread_stats',{message_ids:ids}):{data:[]};if(counts.error)throw counts.error;
   if(!current(token,c)||req!==request)return;posts=roots;replies=loaded;stats=new Map((counts.data||[]).map(s=>[s.message_id,s]));hasMore=(result.data||[]).length>limit;ready=true;
   const paths=new Set([...posts,...Array.from(replies.values()).flat()].flatMap(p=>p.image_paths||[]));for(const [path,url] of images)if(!paths.has(path)){URL.revokeObjectURL(url);images.delete(path);}if(viewer.open&&!paths.has(viewer.dataset.path))viewer.close();
   if(target&&!posts.some(p=>p.id===target.id)){target=null;replyBar.hidden=true;}
   status.replaceChildren(el('span',writable()?'Private Dusted feed · newest conversations first':'Private Dusted feed · view only'));render();
  }catch(error){if(!current(token,c)||req!==request)return;ready=false;clearImages();posts=[];replies.clear();stats.clear();render();
   status.textContent=setupError(error)?'Dusted conversations need a one-time database update. ':'Could not load conversations. Your unsent post is still here. ';
   if(setupError(error)){const link=el('a','Open Dusted setup');link.href='/setup-guide.html#dusted-threads';link.target='_blank';link.rel='noopener';status.append(link);}else status.append(button('Retry',()=>void refresh()));
  }
 }
 async function toggleLike(post){
  if(!ready||!writable()||working.has(post.id))return;const c=context(),token=epoch,liked=stats.get(post.id)?.liked;working.add(post.id);render();
  try{const q=c.db.from('brand_message_likes');const r=liked?await q.delete().eq('project_id',c.project).eq('message_id',post.id).eq('user_id',c.user.id):await q.insert({message_id:post.id,project_id:c.project,user_id:c.user.id});if(r.error&&r.error.code!=='23505')throw r.error;if(current(token,c))await refresh();}
  catch{if(current(token,c))status.textContent='Could not save your reaction. Please retry.';}
  finally{if(current(token,c)){working.delete(post.id);render();}}
 }
 async function removePost(post){
  if(!ready||!writable()||working.has(post.id)||busy||post.user_id!==context().user?.id)return;
  if(!confirm(post.parent_id?'Delete your reply?':'Delete your post and its replies? This cannot be undone.'))return;
  const c=context(),token=epoch;working.add(post.id);render();
  try{const r=await c.db.from('brand_messages').delete().eq('id',post.id).eq('project_id',c.project).eq('user_id',c.user.id).select('id').maybeSingle();if(r.error||!r.data)throw r.error||Error();
   // Files cannot be made public. Remove this author's uploaded attachments too.
   if(post.image_paths?.length)await c.db.storage.from(bucket).remove(post.image_paths);
   if(current(token,c)){toast('Post deleted');await refresh();}
  }catch{if(current(token,c))status.textContent='Could not confirm deletion. Refresh before retrying.';}
  finally{if(current(token,c)){working.delete(post.id);render();}}
 }
 text.addEventListener('input',()=>{if(!busy)attempt=null;form.dataset.appDirty=String(files.length>0||!!text.value.trim());});
 form.onsubmit=async e=>{
  e.preventDefault();const body=text.value.trim(),c=context(),token=epoch;if(!ready||!writable()||busy||(!body&&!files.length))return;
  if(!attempt||attempt.body!==body||attempt.parent_id!==(target?.id||null))attempt={id:crypto.randomUUID(),body,parent_id:target?.id||null,uploads:[],files:[...files]};
  const draft=attempt;busy=true;controls();status.textContent='Posting…';
  try{
   for(let i=draft.uploads.length;i<draft.files.length;i++){
    if(!current(token,c))return;const file=draft.files[i].file,path=c.project+'/'+c.user.id+'/'+crypto.randomUUID()+'.'+types[file.type];
    const r=await c.db.storage.from(bucket).upload(path,file,{contentType:file.type,cacheControl:'0',upsert:false});if(r.error)throw r.error;draft.uploads.push(path);
   }
   if(!current(token,c))return;
   const payload={id:draft.id,project_id:c.project,user_id:c.user.id,body:draft.body,parent_id:draft.parent_id,image_paths:draft.uploads};
   const r=await c.db.from('brand_messages').insert(payload);
   if(r.error){if(r.error.code!=='23505')throw r.error;const existing=await c.db.from('brand_messages').select('id').eq('project_id',c.project).eq('id',draft.id).eq('user_id',c.user.id).maybeSingle();if(existing.error||!existing.data)throw r.error;}
   if(!current(token,c))return;if(draft.parent_id)expanded.set(draft.parent_id,Math.max(20,Number(stats.get(draft.parent_id)?.reply_count||0)+1));
   text.value='';for(const file of files)URL.revokeObjectURL(file.url);files=[];attempt=null;target=null;replyBar.hidden=true;draftPreview();await refresh();toast('Posted to Dusted');
  }catch(error){if(current(token,c))status.textContent=setupError(error)?'Run the Dusted conversations setup, then retry. Your post and images are still here.':'Could not post. Your text and images are still here. Retry when connected.';}
  finally{if(current(token,c)){busy=false;controls();}}
 };
 function reset(){epoch++;request++;ready=false;busy=false;posts=[];stats.clear();replies.clear();expanded.clear();working.clear();replyDrafts.clear();limit=20;hasMore=false;target=null;attempt=null;text.value='';replyBar.hidden=true;for(const file of files)URL.revokeObjectURL(file.url);files=[];picker.value='';clearImages();draftPreview();status.textContent='Connect the Dusted project to start a conversation.';render();}
 reset();return {refresh,reset};
};

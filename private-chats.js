/* Invite-only rooms. Database policies enforce both membership and project access. */
window.createPrivateChats=({getData,navigate,toast})=>{
  const $=id=>document.getElementById(id);
  const el=(tag,text='',cls='')=>{const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;return node;};
  let owner=null,epoch=0,roomsRequest=0,messagesRequest=0,selection=0,rooms=[],selected=null,messages=[],members=[];
  let ready=false,sending=false,channel=null,poll=null;const deleting=new Set();
  const person=id=>getData().roster.find(m=>m.user_id===id)?.display_name||'Team member';
  const current=(session,uid,id)=>session===epoch&&getData().user?.id===uid&&(!id||id===selected);
  function renderNav(){const root=$('privateChatNav');root.replaceChildren();$('privateChatNavSection').hidden=!rooms.length;
    for(const room of rooms){const button=el('button',room.name);button.type='button';button.dataset.privateChat=room.id;button.classList.toggle('active',selected===room.id&&$('privateChat').classList.contains('active'));button.onclick=()=>void open(room.id);root.append(button);}}
  function render(){const room=rooms.find(r=>r.id===selected);$('privateChatTitle').textContent=room?.name||'Private chat';
    const project=getData().projects.find(p=>p.id===room?.project_id);
    $('privateChatParticipants').textContent=room?`${project?.name||'Project'} · ${members.map(m=>person(m.user_id)).join(' & ')||'Checking participants…'}`:'Choose a conversation from Private chats.';
    $('privateChatSend').disabled=!ready||sending;$('privateChatText').disabled=!ready||sending;
    const root=$('privateChatMessages');root.replaceChildren();
    for(const message of messages){const post=el('article','','post');post.dataset.privateMessageId=message.id;const head=el('div','','post-head');head.append(el('b',person(message.user_id)));
      const time=el('time',new Date(message.created_at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}));time.dateTime=message.created_at;head.append(time);
      if(message.user_id===getData().user?.id){const remove=el('button',deleting.has(message.id)?'Deleting…':'Delete','button');remove.type='button';remove.disabled=deleting.has(message.id);remove.onclick=()=>void removeMessage(message.id);head.append(remove);}
      post.append(head,el('div',message.body,'post-body private-message-body'));root.append(post);}
    if(ready&&!messages.length)root.append(el('p','No messages yet. Start your private conversation.','empty'));renderNav();
  }
  function clearSelected(){selection++;messagesRequest++;selected=null;messages=[];members=[];ready=false;sending=false;deleting.clear();$('privateChatText').value='';
    if(channel)getData().db?.removeChannel(channel);channel=null;render();}
  async function loadMessages(){const uid=getData().user?.id,id=selected;if(!uid||!id)return;const session=epoch,request=++messagesRequest;
    try{const [items,participants]=await Promise.all([
      getData().db.from('private_chat_messages').select('*').eq('room_id',id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100),
      getData().db.from('private_chat_members').select('room_id,user_id').eq('room_id',id)
    ]);if(!current(session,uid,id)||request!==messagesRequest)return;if(items.error||participants.error)throw items.error||participants.error;
      if(!(participants.data||[]).some(m=>m.user_id===uid)){clearSelected();$('privateChatStatus').textContent='This conversation is no longer available to your account.';navigate('overview');return;}
      messages=(items.data||[]).reverse();members=participants.data||[];ready=true;$('privateChatStatus').textContent='Only invited participants can read this conversation · latest 100 messages.';render();
    }catch{if(current(session,uid,id)&&request===messagesRequest){ready=false;messages=[];members=[];render();$('privateChatStatus').textContent='Could not load this conversation. Press Refresh to retry. Your unsent message is still here.';}}
  }
  async function refreshRooms(){if(navigator.onLine===false)return;const uid=getData().user?.id;if(!uid)return;if(owner!==uid){reset();owner=uid;}
    const session=epoch,request=++roomsRequest;
    try{const result=await getData().db.from('private_chat_rooms').select('id,name,project_id').order('created_at');if(!current(session,uid)||request!==roomsRequest)return;if(result.error)throw result.error;
      const oldRoomIds=rooms.map(room=>room.id).sort().join(',');rooms=(result.data||[]).filter(room=>room.id&&room.name&&getData().projects.some(p=>p.id===room.project_id));renderNav();if(oldRoomIds!==rooms.map(room=>room.id).sort().join(','))window.dispatchEvent(new Event('quest:private-access-changed'));
      if(selected&&!rooms.some(r=>r.id===selected)){clearSelected();$('privateChatStatus').textContent='This conversation is no longer available to your account.';if($('privateChat').classList.contains('active'))navigate('overview');}
      else if(selected&&$('privateChat').classList.contains('active'))await loadMessages();
      if(!poll)poll=setInterval(()=>{if(!document.hidden)void refreshRooms();},30000);
    }catch{if(current(session,uid)&&request===roomsRequest){rooms=[];clearSelected();window.dispatchEvent(new Event('quest:private-access-changed'));$('privateChatStatus').textContent='Private chats could not be loaded. Ask the owner to finish setup, or press Refresh to retry.';}}
  }
  async function open(id){if(!rooms.some(r=>r.id===id))await refreshRooms();if(!rooms.some(r=>r.id===id)){toast('This private chat is not available to your account.');return;}
    if(selected!==id){clearSelected();selected=id;$('privateChatStatus').textContent='Loading your private conversation…';render();const session=epoch;
      if(getData().db.channel){channel=getData().db.channel(`private-chat-${id}`).on('postgres_changes',{event:'*',schema:'public',table:'private_chat_messages',filter:`room_id=eq.${id}`},()=>{if(session===epoch&&selected===id)void loadMessages();}).subscribe();}}
    navigate('privateChat');await loadMessages();
  }
  $('privateChatForm').onsubmit=async event=>{event.preventDefault();const body=$('privateChatText').value.trim(),uid=getData().user?.id,id=selected,session=epoch,version=selection;
    if(!body||body.length>4000||!uid||!id||!ready||sending)return;sending=true;render();
    try{const {error}=await getData().db.from('private_chat_messages').insert({room_id:id,user_id:uid,body});if(error)throw error;
      if(!current(session,uid,id)||version!==selection)return;$('privateChatText').value='';await loadMessages();
    }catch(error){if(current(session,uid,id)&&version===selection)$('privateChatStatus').textContent=error?.message||'Could not send. Your message is still here; please try again.';}
    finally{if(current(session,uid,id)&&version===selection){sending=false;render();}}
  };
  async function removeMessage(id){const record=messages.find(m=>m.id===id),uid=getData().user?.id,room=selected,session=epoch,version=selection;
    if(!uid||record?.user_id!==uid||deleting.has(id)||!confirm('Delete this private message? This cannot be undone.'))return;deleting.add(id);render();
    try{const result=await getData().db.from('private_chat_messages').delete().eq('id',id).eq('room_id',room).eq('user_id',uid).select('id').maybeSingle();if(result.error)throw result.error;if(!result.data)throw new Error('Message could not be deleted. Refresh to check your access.');
      if(current(session,uid,room)&&version===selection){toast('Message deleted');await loadMessages();}
    }catch(error){if(current(session,uid,room)&&version===selection)$('privateChatStatus').textContent=error?.message||'Could not delete this message. Please retry.';}
    finally{if(current(session,uid,room)&&version===selection){deleting.delete(id);render();}}
  }
  function reset(){epoch++;roomsRequest++;owner=null;rooms=[];if(poll)clearInterval(poll);poll=null;clearSelected();$('privateChatStatus').textContent='Private conversations are visible only to invited participants.';}
  $('privateChatRefresh').onclick=()=>void refreshRooms();
  window.addEventListener('focus',()=>{if(owner)void refreshRooms();});
  render();return {refreshRooms,open,reset,hasRoom:id=>rooms.some(room=>room.id===id)};
};

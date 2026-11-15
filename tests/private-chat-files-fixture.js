const fileRoom={id:'diary-room',room_key:'weed-diary-owner-tertius',name:'Weed Diary · Quan & Tertius',room_kind:'direct',project_id:null,personal_owner_id:'tertius',created_by:'quan'};
rooms.push(fileRoom,{id:'general-room',room_key:'direct-owner-tertius',name:'Quan & Tertius',room_kind:'direct',project_id:null,personal_owner_id:'tertius',created_by:'quan'});
accessTest.records.private_chat_members.push({room_id:'diary-room',user_id:'quan'},{room_id:'diary-room',user_id:'tertius'},{room_id:'general-room',user_id:'quan'},{room_id:'general-room',user_id:'tertius'});
accessTest.profiles.quan.personal_workspace_ready=true;
Object.assign(accessTest.profiles.tertius,{shared_access:false,editable_project_ids:[],personal_workspace_ready:false});
const fileTest=window.fileTest={uploads:[],downloads:[],removals:[],rpc:[],stored:new Map(),delayDownloads:false,pending:[],failUpload:false,loseUploadAck:false,loseSendAck:false,missingSetup:false};
fileTest.release=()=>{fileTest.delayDownloads=false;for(const resolve of fileTest.pending.splice(0))resolve();};
fileTest.refresh=()=>privateChats.refreshRooms();
const fileAllowed=(path,uid)=>{const [room,author]=path.split('/');return roomAllowed(room,uid)&&(author===uid||accessTest.records.private_chat_messages.some(m=>m.room_id===room&&m.attachments?.some(a=>a.path===path)));};
db.storage={from:bucket=>({
 upload:async(path,file,options)=>{
  fileTest.uploads.push({path,uid:user.id,bucket,options});if(fileTest.missingSetup)return {error:{message:'Bucket not found',statusCode:'404'}};
  if(!roomAllowed(path.split('/')[0],user.id)||path.split('/')[1]!==user.id)return {error:{message:'Access denied',statusCode:'403'}};
  if(fileTest.failUpload){fileTest.failUpload=false;return {error:{message:'Upload failed',statusCode:'500'}};}
  if(fileTest.stored.has(path))return {error:{message:'Already exists',statusCode:'409'}};
  fileTest.stored.set(path,new Blob([file],{type:options.contentType}));
  if(fileTest.loseUploadAck){fileTest.loseUploadAck=false;return {error:{message:'Network connection lost',statusCode:'0'}};}
  return {data:{path},error:null};
 },
 download:async path=>{const uid=user.id;fileTest.downloads.push({path,uid,bucket});const allowed=fileAllowed(path,uid),data=fileTest.stored.get(path);if(fileTest.delayDownloads)await new Promise(resolve=>fileTest.pending.push(resolve));return allowed&&data?{data,error:null}:{error:{message:'File access denied',statusCode:'403'}};},
 remove:async paths=>{fileTest.removals.push({paths,uid:user.id});for(const path of paths){if(!fileAllowed(path,user.id)||path.split('/')[1]!==user.id||accessTest.records.private_chat_messages.some(m=>m.attachments?.some(f=>f.path===path)))return {error:{message:'Access denied'}};}for(const path of paths)fileTest.stored.delete(path);return {data:paths,error:null};}
})};
const fileBaseRpc=db.rpc;
db.rpc=async(name,args)=>{
 if(name!=='quest_send_private_chat_files')return fileBaseRpc(name,args);
 fileTest.rpc.push({...args,uid:user.id});if(fileTest.missingSetup)return {error:{code:'PGRST202',message:'Function not found'}};
 if(!roomAllowed(args.chat_id,user.id))return {error:{code:'42501',message:'Access denied'}};
 let saved=accessTest.records.private_chat_messages.find(m=>m.id===args.message_id);
 if(saved){if(saved.body!==args.message_body||JSON.stringify(saved.attachments)!==JSON.stringify(args.files))return {error:{code:'23514',message:'Draft mismatch'}};return {data:{...saved},error:null};}
 if(args.files.some(f=>!fileTest.stored.has(f.path)))return {error:{code:'23514',message:'File not uploaded'}};
 saved={id:args.message_id,room_id:args.chat_id,user_id:user.id,body:args.message_body,attachments:args.files,created_at:'2026-11-15T14:00:00Z'};
 accessTest.records.private_chat_messages.push(saved);accessTest.writes.push({table:'private_chat_messages',values:{...saved}});
 for(const member of accessTest.records.private_chat_members.filter(m=>m.room_id===args.chat_id&&m.user_id!==user.id&&roomAllowed(m.room_id,m.user_id)))accessTest.records.team_notifications.push({id:'file-notice-'+saved.id,recipient_id:member.user_id,actor_id:user.id,actor_name:member.user_id==='quan'?'Tertius':'Quan',source_table:'private_chat_messages',source_id:saved.id,private_room_id:args.chat_id,item_title:fileRoom.name,access_scope:'private_chat',action:'INSERT',read_at:null,created_at:saved.created_at});
 if(fileTest.loseSendAck){fileTest.loseSendAck=false;return {error:{message:'Network connection lost'}};}return {data:{...saved},error:null};
};
await accessTest.switchUser('quan');await privateChats.refreshRooms();accessTest.navigate('weedDiary');document.getElementById('weedDiaryChatTab').click();window.fileChatReady=true;

/* Local companion reactions. No AI requests, microphone use or private storage. */
window.createAssistantPersonality=({dock,panel,getData,onOpen})=>{
 const $=id=>document.getElementById(id),reduced=matchMedia('(prefers-reduced-motion:reduce)'),pointer=matchMedia('(hover:hover) and (pointer:fine)');
 const bubble=document.createElement('button');bubble.id='qaReaction';bubble.className='qa-reaction';bubble.type='button';bubble.hidden=true;bubble.setAttribute('aria-label','Open Q');document.body.append(bubble);bubble.onclick=onOpen;
 const live=document.createElement('span');live.className='qa-reaction-live';live.setAttribute('role','status');live.setAttribute('aria-live','polite');document.body.append(live);
 let uid=null,enabled=true,knownTasks=new Map(),moodTimer=null,bubbleTimer=null,idleTimer=null,frame=null,gazeFrame=null,point=null,awayAt=null,lastActivity=Date.now(),lastAmbient=0,lastHover=0,wasDragging=false;
 try{enabled=localStorage.getItem('quest-assistant-playful')!=='false';}catch{}
 $('qaPlayful').checked=enabled;
 const active=()=>uid&&getData().user?.id===uid&&getData().policy&&!document.hidden&&!dock.hidden;
 const occupied=()=>!!document.activeElement?.closest('input,textarea,select,[contenteditable]:not([contenteditable=false])')||!!document.querySelector('dialog[open],.sidebar.open')||dock.classList.contains('is-thinking')||dock.classList.contains('is-listening')||dock.classList.contains('is-transcribing')||dock.classList.contains('is-speaking');
 const available=()=>active()&&(!window.visualViewport||Math.abs(window.visualViewport.scale-1)<.01)&&!occupied()&&!dock.classList.contains('is-minimised')&&!dock.classList.contains('is-viewport-small')&&!dock.classList.contains('is-dragging');
 function neutral(){clearTimeout(moodTimer);moodTimer=null;delete dock.dataset.mood;delete panel.dataset.mood;}
 function centerEyes(){dock.style.removeProperty('--qa-look-x');dock.style.removeProperty('--qa-look-y');}
 function hideBubble(){clearTimeout(bubbleTimer);bubbleTimer=null;bubble.hidden=true;live.textContent='';if(frame!==null)cancelAnimationFrame(frame);frame=null;}
 function placeBubble(){
  if(bubble.hidden)return;
  if(!available()||!panel.hidden){hideBubble();return;}
  const view=window.visualViewport,top=view?.offsetTop||0,left=view?.offsetLeft||0,width=view?.width||innerWidth,height=view?.height||innerHeight,box=dock.getBoundingClientRect(),tip=bubble.getBoundingClientRect();
  bubble.style.left=Math.max(left+10,Math.min(box.left+box.width/2-tip.width/2,left+width-tip.width-10))+'px';
  const y=box.top-tip.height-8;const fallback=box.bottom+8;
  bubble.style.top=Math.max(top+10,Math.min(y>=top+10?y:fallback,top+height-tip.height-10))+'px';
  frame=requestAnimationFrame(placeBubble);
 }
 function say(text,{announce=false}={}){if(!available()||!panel.hidden)return;hideBubble();bubble.textContent=text;bubble.hidden=false;if(announce)live.textContent=text;placeBubble();bubbleTimer=setTimeout(hideBubble,5000);}
 function pose(mood,duration=2300){if(!active())return;neutral();dock.dataset.mood=mood;panel.dataset.mood=mood;moodTimer=setTimeout(neutral,duration);}
 function react(kind,{automatic=false,text}={}){
  if(!active()||automatic&&(!enabled||!available()||dock.classList.contains('is-dancing')))return false;
  const moves={highfive:['highfive','High five! We’ve got this. ✋'],spin:['spin','One happy spin, coming up! ✨'],stretch:['stretch','A tiny stretch. Shoulders down, deep breath.'],happy:['happy','Nice work! One step forward. ✨'],wave:['wave','Hey! Ready when you are.'],sleepy:['sleepy','Taking a little stretch. I’m here when you need me.']};
  const move=moves[kind]||moves.happy;pose(move[0]);say(text||move[1],{announce:!automatic});return true;
 }
 function celebrate(text='Another task done. Nice work! ✨'){return react('happy',{automatic:true,text});}
 function queueIdle(){if(idleTimer||!uid)return;idleTimer=setTimeout(()=>{idleTimer=null;if(enabled&&available()&&panel.hidden&&!reduced.matches&&Date.now()-lastActivity>=90000&&Date.now()-lastAmbient>=300000){lastAmbient=Date.now();react('sleepy',{automatic:true});}queueIdle();},30000);}
 function sync(){
  const data=getData();if(!data.user||!data.policy){reset();return;}
  if(uid!==data.user.id){reset();uid=data.user.id;lastActivity=Date.now();}
  const mine=data.tasks.filter(task=>task.assigned_to===uid||task.created_by===uid);const finished=mine.some(task=>task.status==='Done'&&knownTasks.has(task.id)&&knownTasks.get(task.id)!=='Done');knownTasks=new Map(mine.map(task=>[task.id,task.status]));
  if(finished)celebrate();queueIdle();
 }
 function reset(){uid=null;knownTasks.clear();neutral();hideBubble();centerEyes();clearTimeout(idleTimer);idleTimer=null;awayAt=null;wasDragging=false;point=null;if(gazeFrame!==null)cancelAnimationFrame(gazeFrame);gazeFrame=null;lastAmbient=0;}
 const activity=()=>{lastActivity=Date.now();};
 document.addEventListener('pointerdown',activity,{passive:true});document.addEventListener('keydown',activity);
 document.addEventListener('focusin',()=>{if(occupied()){hideBubble();centerEyes();}});
 document.addEventListener('pointermove',event=>{
  activity();if(!enabled||!pointer.matches||reduced.matches||!available()||!panel.hidden||dock.classList.contains('is-dancing'))return;
  point={x:event.clientX,y:event.clientY};if(gazeFrame!==null)return;gazeFrame=requestAnimationFrame(()=>{gazeFrame=null;if(!enabled||reduced.matches||!point||!available()||!panel.hidden)return;const box=$('qaCharacter').getBoundingClientRect();dock.style.setProperty('--qa-look-x',Math.max(-3,Math.min(3,(point.x-box.left-box.width/2)/100))+'px');dock.style.setProperty('--qa-look-y',Math.max(-2,Math.min(2,(point.y-box.top-box.height*.38)/120))+'px');});
 },{passive:true});
 document.documentElement.addEventListener('pointerleave',centerEyes);
 $('qaCharacter').addEventListener('pointerenter',()=>{if(enabled&&available()&&!reduced.matches&&Date.now()-lastHover>30000){lastHover=Date.now();react('wave',{automatic:true});}});
 new MutationObserver(()=>{
  const dragging=dock.classList.contains('is-dragging');if(dragging&&!wasDragging){hideBubble();centerEyes();if(enabled)pose('surprised',60000);}else if(!dragging&&wasDragging){neutral();if(enabled)react('wave',{automatic:true,text:'Nice spot! I’ll stay right here.'});}wasDragging=dragging;
  if(!available()||!panel.hidden){hideBubble();centerEyes();if(dock.matches('.is-thinking,.is-listening,.is-transcribing,.is-speaking,.is-dancing'))neutral();}
 }).observe(dock,{attributes:true,attributeFilter:['class','hidden']});
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden){awayAt=uid?Date.now():null;neutral();hideBubble();centerEyes();return;}
  if(awayAt&&Date.now()-awayAt>=300000&&enabled){lastAmbient=Date.now();react('wave',{automatic:true,text:'Welcome back! Ready when you are.'});}awayAt=null;activity();
 });
 $('qaPlayful').onchange=()=>{enabled=$('qaPlayful').checked;try{localStorage.setItem('quest-assistant-playful',String(enabled));}catch{}dock.classList.remove('is-waving');neutral();hideBubble();centerEyes();};
 reduced.addEventListener('change',()=>{neutral();hideBubble();centerEyes();});
 return {sync,reset,react,celebrate,hideBubble,get enabled(){return enabled;},tap(){if(enabled&&active()&&!occupied())pose('happy',1400);}};
};

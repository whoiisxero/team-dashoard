/* Public UI placement only; no messages or member data are persisted. */
window.createAssistantMotion=({dock,character,mini,panel,isActive})=>{
 const KEY='quest-assistant-position';
 let position=null,drag=null,skipClick=null,frame=null;
 try{const value=JSON.parse(localStorage.getItem(KEY)||'null');if(value&&[value.x,value.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))position={x:value.x,y:value.y};}catch{}
 function bounds(){const viewport=window.visualViewport;return {left:viewport?.offsetLeft||0,top:viewport?.offsetTop||0,width:viewport?.width||innerWidth,height:viewport?.height||innerHeight};}
 function limits(){const view=bounds(),box=dock.getBoundingClientRect(),gap=18;return {x:view.left+gap,y:view.top+gap,maxX:Math.max(view.left+gap,view.left+view.width-box.width-gap),maxY:Math.max(view.top+gap,view.top+view.height-box.height-gap)};}
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
 function positionPanel(){
  if(panel.hidden)return;
  if(matchMedia('(max-width:680px),(max-height:650px)').matches){for(const name of ['left','top','right','bottom'])panel.style.removeProperty(name);return;}
  const view=bounds(),box=dock.getBoundingClientRect(),dialog=panel.getBoundingClientRect();
  const x=box.left>view.left+view.width/2?box.left-dialog.width-14:box.right+14;
  panel.style.left=clamp(x,view.left+12,Math.max(view.left+12,view.left+view.width-dialog.width-12))+'px';
  panel.style.top=clamp(box.bottom-dialog.height,view.top+12,Math.max(view.top+12,view.top+view.height-dialog.height-12))+'px';
  panel.style.right='auto';panel.style.bottom='auto';
 }
 function sync(){
  if(!isActive()||dock.hidden||window.visualViewport?.scale!==undefined&&window.visualViewport.scale!==1)return;
  const view=bounds(),small=matchMedia('(max-width:680px),(max-height:650px)').matches?186:246;
  dock.classList.toggle('is-viewport-small',view.height<small+36);
  const range=limits(),desired=position||{x:1,y:1};
  dock.classList.add('is-placed');dock.style.setProperty('--qa-left',range.x+desired.x*(range.maxX-range.x)+'px');dock.style.setProperty('--qa-top',range.y+desired.y*(range.maxY-range.y)+'px');
  positionPanel();
 }
 function move(x,y){const range=limits();const left=clamp(x,range.x,range.maxX),top=clamp(y,range.y,range.maxY);position={x:range.maxX===range.x?0:(left-range.x)/(range.maxX-range.x),y:range.maxY===range.y?0:(top-range.y)/(range.maxY-range.y)};dock.classList.add('is-placed');dock.style.setProperty('--qa-left',left+'px');dock.style.setProperty('--qa-top',top+'px');positionPanel();}
 function save(){try{if(position)localStorage.setItem(KEY,JSON.stringify(position));else localStorage.removeItem(KEY);}catch{}}
 function resetPosition(){position=null;save();sync();}
 function finish(event){if(!drag||event&&event.pointerId!==drag.pointerId)return;if(drag.moved&&event?.type!=='pointercancel'){skipClick=drag.target;setTimeout(()=>skipClick=null,0);save();}drag=null;dock.classList.remove('is-dragging');}
 for(const target of [character,mini]){
  target.addEventListener('pointerdown',event=>{if(!isActive()||!event.isPrimary||event.button!==0)return;skipClick=null;const box=dock.getBoundingClientRect();drag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,left:box.left,top:box.top,moved:false,target};target.setPointerCapture(event.pointerId);});
  target.addEventListener('pointermove',event=>{if(!drag||drag.target!==target||event.pointerId!==drag.pointerId)return;const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;if(Math.hypot(dx,dy)>7)drag.moved=true;if(drag.moved){dock.classList.add('is-dragging');move(drag.left+dx,drag.top+dy);}});
  target.addEventListener('pointerup',finish);target.addEventListener('pointercancel',finish);target.addEventListener('lostpointercapture',finish);
  target.addEventListener('keydown',event=>{if(event.key==='Home'){event.preventDefault();resetPosition();return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const box=dock.getBoundingClientRect(),step=event.shiftKey?60:24;move(box.left+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),box.top+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0));save();});
 }
 const schedule=()=>{if(frame!==null)return;frame=requestAnimationFrame(()=>{frame=null;sync();});};
 window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
 return {sync,positionPanel,resetPosition,consumeClick(target){if(skipClick!==target)return false;skipClick=null;return true;},cancelDrag(){if(drag){try{drag.target.releasePointerCapture(drag.pointerId);}catch{}drag=null;}skipClick=null;dock.classList.remove('is-dragging');}};
};

/* A browser-local arcade break. Inputs belong to the focused fighter, never Quest forms. */
window.createQuestStarfall=({getData})=>{
  const panel=document.createElement('section');
  panel.id='questStarfall';panel.className='card starfall-panel';panel.hidden=true;
  panel.setAttribute('aria-labelledby','starfallTitle');
  panel.innerHTML=`<header class="starfall-heading"><div><div class="eyebrow">Take a break / Arcade</div><h2 id="starfallTitle">✦ STARFALL</h2><p>One pilot. Endless space.</p></div><dl class="starfall-stats"><div><dt>Score</dt><dd id="starfallScore">00000</dd></div><div><dt>Your best</dt><dd id="starfallBest">00000</dd></div></dl></header><div class="starfall-arena"><canvas id="starfallCanvas" tabindex="0" aria-label="Space fighter. Arrow keys move, Space fires, P pauses. Escape leaves the game." aria-describedby="starfallInstructions"></canvas><div class="starfall-hud"><span id="starfallWave">SECTOR 01</span><span id="starfallShield">SHIELD ▰ ▰ ▰</span></div><div class="starfall-overlay" id="starfallOverlay"><div class="starfall-eyebrow" id="starfallStatus">FIGHTER READY</div><h3 id="starfallHeading">Into the unknown.</h3><p id="starfallMessage">Clear enemy waves and see how far you can go.</p><button type="button" class="button primary" id="starfallStart">Launch fighter ↗</button></div></div><footer class="starfall-footer"><p id="starfallInstructions"><kbd>← ↑ ↓ →</kbd> Move <kbd>Space</kbd> Fire <kbd>P</kbd> Pause <kbd>Esc</kbd> Leave</p><div class="actions"><button type="button" class="button" id="starfallPause" disabled>Pause</button><button type="button" class="button" id="starfallSound" aria-pressed="false">Sound off</button></div></footer><div class="starfall-touch" aria-label="Touch game controls"><button type="button" class="button" data-starfall-key="ArrowLeft" aria-label="Move fighter left">←</button><button type="button" class="button" data-starfall-key="ArrowUp" aria-label="Move fighter up">↑</button><button type="button" class="button" data-starfall-key="ArrowDown" aria-label="Move fighter down">↓</button><button type="button" class="button" data-starfall-key="ArrowRight" aria-label="Move fighter right">→</button><button type="button" class="button primary" data-starfall-key="Space">Fire</button></div><p class="starfall-note" id="starfallNotice" role="status">Click Launch fighter to play. The game pauses when you leave it.</p>`;
  const $=id=>panel.querySelector('#'+id),canvas=$('starfallCanvas'),ctx=canvas.getContext('2d');
  document.getElementById('overview').append(panel);
  if(!ctx){$('starfallNotice').textContent='This browser does not support the game canvas.';$('starfallStart').disabled=true;return {sync(){panel.hidden=!getData().user;},reset(){panel.hidden=true;}};}
  let owner=null,state='ready',width=800,height=420,frame=0,last=0,time=0;
  let ship={x:400,y:336,hp:3},keys={},bullets=[],enemies=[],shots=[],particles=[];
  let score=0,best=0,wave=1,kills=0,spawn=0,cool=0,inv=0,sound=false,audio=null;
  const stars=Array.from({length:130},()=>({x:Math.random(),y:Math.random(),size:.3+Math.random()*1.8}));
  const active=()=>!!owner&&!panel.hidden&&!document.hidden&&!document.getElementById('appShell').hidden&&!!panel.closest('.view.active');
  const bestKey=()=>`quest-starfall-best:${owner}`;
  function setState(value){state=value;panel.dataset.state=value;$('starfallPause').disabled=value!=='playing';document.body.classList.toggle('quest-starfall-playing',value==='playing');}
  function hud(){
    $('starfallScore').textContent=String(score).padStart(5,'0');
    $('starfallBest').textContent=String(best).padStart(5,'0');
    $('starfallWave').textContent='SECTOR '+String(wave).padStart(2,'0');
    $('starfallShield').textContent='SHIELD '+'▰ '.repeat(ship.hp)+'▱ '.repeat(3-ship.hp);
  }
  function overlay(status,heading,message,button){
    $('starfallStatus').textContent=status;$('starfallHeading').textContent=heading;
    $('starfallMessage').textContent=message;$('starfallStart').textContent=button;
    $('starfallOverlay').hidden=false;
  }
  function stopFrame(){cancelAnimationFrame(frame);frame=0;keys={};}
  function rememberBest(){
    if(score<=best)return;best=score;
    if(owner)try{localStorage.setItem(bestKey(),String(best));}catch{}
    hud();
  }
  function pause(message='Your fighter is waiting. Resume when you’re ready.'){
    keys={};if(state!=='playing')return;
    stopFrame();rememberBest();setState('paused');
    overlay('FLIGHT ON HOLD','Take a breather.',message,'Resume flight ↗');
    $('starfallNotice').textContent='Game paused. Resume flight to continue.';draw();
  }
  function beginFrame(){stopFrame();last=performance.now();frame=requestAnimationFrame(loop);}
  function launch(){
    if(!active())return;
    if(state==='paused'){
      setState('playing');$('starfallOverlay').hidden=true;canvas.focus({preventScroll:true});beginFrame();
    }else{
      resize();ship={x:width/2,y:height*.8,hp:3};
      bullets=[];enemies=[];shots=[];particles=[];score=0;wave=1;kills=0;spawn=.7;cool=0;inv=1;
      hud();setState('playing');$('starfallOverlay').hidden=true;canvas.focus({preventScroll:true});beginFrame();
    }
    $('starfallNotice').textContent='Flight active. Arrow keys move, hold Space to fire. P pauses; Escape leaves the game.';
  }
  function reset(){
    stopFrame();owner=null;score=0;best=0;wave=1;kills=0;time=0;inv=0;
    ship={x:width/2,y:height*.8,hp:3};bullets=[];enemies=[];shots=[];particles=[];
    sound=false;void audio?.close().catch(()=>{});audio=null;
    $('starfallSound').textContent='Sound off';$('starfallSound').setAttribute('aria-pressed','false');
    setState('ready');hud();overlay('FIGHTER READY','Into the unknown.','Clear enemy waves and see how far you can go.','Launch fighter ↗');
    $('starfallNotice').textContent='Click Launch fighter to play. The game pauses when you leave it.';panel.hidden=true;
  }
  function sync(){
    const uid=getData().user?.id||null;
    if(owner!==uid){
      reset();owner=uid;
      if(uid)try{const value=Number(localStorage.getItem(bestKey()));best=Number.isSafeInteger(value)&&value>0?value:0;}catch{}
      hud();
    }
    const view=document.querySelector('.view.active');
    const host=view&&['overview','personalHome'].includes(view.id)?view:null;
    if(state==='playing'&&(!host||!active()))pause('Flight paused when you left Home.');
    if(host&&host.lastElementChild!==panel)host.append(panel);
    panel.hidden=!uid;
    if(host&&uid)resize();
  }
  function resize(){
    const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const oldWidth=width,oldHeight=height;
    width=rect.width;height=rect.height;
    const ratio=Math.min(devicePixelRatio||1,2);
    if(canvas.width===Math.round(width*ratio)&&canvas.height===Math.round(height*ratio))return;
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
    ship.x=Math.max(26,Math.min(width-26,ship.x/oldWidth*width));ship.y=Math.max(65,Math.min(height-36,ship.y/oldHeight*height));
    for(const item of [...enemies,...bullets,...shots,...particles]){item.x=item.x/oldWidth*width;item.y=item.y/oldHeight*height;}
    draw();
  }
  function beep(frequency,duration){
    if(!sound||!active())return;
    try{
      audio??=new AudioContext();void audio.resume();
      const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.connect(gain);gain.connect(audio.destination);
      oscillator.frequency.setValueAtTime(frequency,audio.currentTime);oscillator.frequency.exponentialRampToValueAtTime(frequency*.4,audio.currentTime+duration);
      gain.gain.setValueAtTime(.035,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
      oscillator.start();oscillator.stop(audio.currentTime+duration);
    }catch{}
  }
  function burst(x,y,color){
    for(let i=0;i<22;i++){const angle=Math.random()*Math.PI*2,speed=30+Math.random()*150;particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:.5+Math.random()*.4,color});}
  }
  function hit(){
    if(inv>0||state!=='playing')return;
    ship.hp--;inv=1.6;burst(ship.x,ship.y,'#8af5d4');beep(90,.3);hud();
    if(ship.hp===0){
      stopFrame();rememberBest();setState('over');
      overlay('SIGNAL LOST','A brave last stand.',`You scored ${score} points and reached sector ${wave}. Ready for another run?`,'Fly again ↗');
      $('starfallNotice').textContent=`Flight complete. ${score} points. Choose Fly again for another run.`;
    }
  }
  function update(dt){
    time+=dt;inv-=dt;cool-=dt;spawn-=dt;
    for(const star of stars){star.y+=dt*star.size*.035;if(star.y>1){star.y=0;star.x=Math.random();}}
    const dx=(keys.ArrowRight?1:0)-(keys.ArrowLeft?1:0),dy=(keys.ArrowDown?1:0)-(keys.ArrowUp?1:0),length=Math.hypot(dx,dy)||1;
    ship.x=Math.max(26,Math.min(width-26,ship.x+dx/length*340*dt));ship.y=Math.max(65,Math.min(height-36,ship.y+dy/length*340*dt));
    if(keys.Space&&cool<=0){bullets.push({x:ship.x-8,y:ship.y-19},{x:ship.x+8,y:ship.y-19});cool=.17;beep(800,.07);}
    if(spawn<=0){enemies.push({x:35+Math.random()*(width-70),y:-35,speed:65+wave*13,phase:Math.random()*6,fire:1+Math.random()*2});spawn=Math.max(.3,1.05-wave*.065);}
    for(const bullet of bullets)bullet.y-=640*dt;
    for(const enemy of enemies){
      enemy.y+=enemy.speed*dt;enemy.x+=Math.sin(time*2+enemy.phase)*35*dt;enemy.fire-=dt;
      if(enemy.fire<0){const angle=Math.atan2(ship.y-enemy.y,ship.x-enemy.x);shots.push({x:enemy.x,y:enemy.y,vx:Math.cos(angle)*(150+wave*8),vy:Math.sin(angle)*(150+wave*8)});enemy.fire=2.3;}
      if(Math.hypot(enemy.x-ship.x,enemy.y-ship.y)<33){enemy.dead=true;hit();if(state!=='playing')return;}
      for(const bullet of bullets)if(!bullet.dead&&!enemy.dead&&Math.abs(bullet.x-enemy.x)<22&&Math.abs(bullet.y-enemy.y)<26){
        bullet.dead=true;enemy.dead=true;burst(enemy.x,enemy.y,'#ff809d');score+=100;kills++;wave=1+Math.floor(kills/10);beep(180,.12);hud();break;
      }
    }
    for(const shot of shots){shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;if(Math.hypot(shot.x-ship.x,shot.y-ship.y)<19){shot.dead=true;hit();if(state!=='playing')return;}}
    enemies=enemies.filter(enemy=>!enemy.dead&&enemy.y<height+40);bullets=bullets.filter(bullet=>!bullet.dead&&bullet.y>-20);
    shots=shots.filter(shot=>!shot.dead&&shot.y<height+20&&shot.y>-30&&shot.x>-20&&shot.x<width+20);
    for(const particle of particles){particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;particle.life-=dt;}
    particles=particles.filter(particle=>particle.life>0);
  }
  function jet(x,y,enemy=false){
    ctx.save();ctx.translate(x,y);if(enemy)ctx.rotate(Math.PI);
    ctx.shadowColor=enemy?'#ff6787':'#76f5d2';ctx.shadowBlur=15;ctx.fillStyle=enemy?'#ff6787':'#94f8e0';
    ctx.beginPath();ctx.moveTo(0,-24);ctx.lineTo(9,-3);ctx.lineTo(24,16);ctx.lineTo(8,12);ctx.lineTo(0,19);ctx.lineTo(-8,12);ctx.lineTo(-24,16);ctx.lineTo(-9,-3);ctx.closePath();ctx.fill();
    ctx.shadowBlur=0;ctx.fillStyle='#142e46';ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(5,7);ctx.lineTo(-5,7);ctx.fill();
    ctx.fillStyle=enemy?'#f9a66b':'#67caff';ctx.beginPath();ctx.moveTo(-5,18);ctx.lineTo(0,31+Math.sin(time*35)*6);ctx.lineTo(5,18);ctx.fill();ctx.restore();
  }
  function draw(){
    ctx.fillStyle='#060d1b';ctx.fillRect(0,0,width,height);
    const glow=ctx.createRadialGradient(width*.7,height*.4,0,width*.7,height*.4,width*.7);
    glow.addColorStop(0,'#29205180');glow.addColorStop(.55,'#11304a45');glow.addColorStop(1,'#060d1b00');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
    for(const star of stars){ctx.globalAlpha=.3+star.size*.25;ctx.fillStyle='#c9e6ff';ctx.fillRect(star.x*width,star.y*height,star.size,star.size*(state==='playing'?2:1));}ctx.globalAlpha=1;
    ctx.strokeStyle='#89bbce0c';ctx.lineWidth=1;ctx.beginPath();
    for(let x=0;x<width;x+=70){ctx.moveTo(x,0);ctx.lineTo(x,height);}for(let y=0;y<height;y+=70){ctx.moveTo(0,y);ctx.lineTo(width,y);}ctx.stroke();
    ctx.strokeStyle='#738baf20';ctx.beginPath();ctx.arc(width*.82,height*.24,65,0,Math.PI*2);ctx.stroke();
    for(const bullet of bullets){ctx.shadowColor='#8af5d4';ctx.shadowBlur=12;ctx.fillStyle='#b9ffe8';ctx.fillRect(bullet.x-2,bullet.y,3,18);}ctx.shadowBlur=0;
    for(const shot of shots){ctx.fillStyle='#ff819c';ctx.beginPath();ctx.arc(shot.x,shot.y,4,0,7);ctx.fill();}
    for(const enemy of enemies)jet(enemy.x,enemy.y,true);
    if(ship.hp>0&&(inv<=0||Math.floor(inv*12)%2===0))jet(ship.x,ship.y);
    for(const particle of particles){ctx.globalAlpha=Math.min(1,particle.life*2);ctx.fillStyle=particle.color;ctx.fillRect(particle.x,particle.y,3,3);}ctx.globalAlpha=1;
  }
  function loop(now){
    frame=0;if(state!=='playing')return;
    if(!active()){pause('Flight paused when you left Home.');return;}
    update(Math.min((now-last)/1000,.035));last=now;draw();
    if(state==='playing')frame=requestAnimationFrame(loop);
  }
  const gameKeys=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space']);
  canvas.addEventListener('keydown',event=>{
    if(event.code==='Escape'){event.preventDefault();pause();$('starfallStart').focus({preventScroll:true});return;}
    if(event.code==='KeyP'&&!event.repeat){event.preventDefault();if(state==='playing')pause();else if(state==='paused')launch();return;}
    if(event.code==='Enter'&&!event.repeat&&state!=='playing'){event.preventDefault();launch();return;}
    if(state==='playing'&&gameKeys.has(event.code)){event.preventDefault();event.stopPropagation();keys[event.code]=true;}
  });
  canvas.addEventListener('keyup',event=>{if(gameKeys.has(event.code)){event.preventDefault();event.stopPropagation();keys[event.code]=false;}});
  canvas.addEventListener('blur',()=>pause());
  window.addEventListener('blur',()=>pause());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  $('starfallStart').onclick=launch;$('starfallPause').onclick=()=>pause();
  $('starfallSound').onclick=()=>{sound=!sound;$('starfallSound').textContent='Sound '+(sound?'on':'off');$('starfallSound').setAttribute('aria-pressed',String(sound));beep(600,.1);};
  for(const button of panel.querySelectorAll('[data-starfall-key]')){
    button.addEventListener('pointerdown',event=>{
      if(state!=='playing')return;event.preventDefault();canvas.focus({preventScroll:true});button.setPointerCapture(event.pointerId);keys[button.dataset.starfallKey]=true;
    });
    const release=()=>{keys[button.dataset.starfallKey]=false;};
    button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  }
  new ResizeObserver(resize).observe(canvas);
  reset();return {sync,reset};
};

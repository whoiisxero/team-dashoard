/* Globe and country information are independent of authentication and database rendering. */
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('worldGlobe'), ctx = canvas.getContext('2d');
  let features = [], countries = {}, selected = '', rates = null, ratePromise = null;
  let rotation = [-25, -15, 0], paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let dragging = null, moved = false, lastFrame = 0, lastPaint = 0;
  const projection = d3.geoOrthographic().translate([360, 360]).scale(305).clipAngle(90);
  const path = d3.geoPath(projection, ctx);
  const graticule = d3.geoGraticule10();
  function homeClock() {
    const now = new Date();
    $('homeDate').textContent = now.toLocaleDateString(undefined, { weekday:'long',year:'numeric',month:'long',day:'numeric' });
    const name = $('userName').textContent;
    $('homeWelcome').textContent = name && name !== 'Team member' ? `Welcome back, ${name}` : 'Welcome to Quest';
    if (!selected) return;
    const zone = $('countryZone').value;
    if (!zone) { $('countryClock').textContent='Time zone unavailable'; $('countryDate').textContent=''; return; }
    try {
      $('countryClock').textContent = now.toLocaleTimeString(undefined,{ timeZone:zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false });
      $('countryDate').textContent = now.toLocaleDateString(undefined,{ timeZone:zone,weekday:'long',year:'numeric',month:'long',day:'numeric' });
    } catch { $('countryClock').textContent='Time zone unavailable'; }
  }
  function draw() {
    projection.rotate(rotation);ctx.clearRect(0,0,720,720);
    const style = getComputedStyle(document.documentElement), accent=style.getPropertyValue('--green2').trim()||'#54f45c',tone=(name,fallback)=>style.getPropertyValue(name).trim()||fallback,ocean=tone('--globe-ocean','#071b2b'),grid=tone('--globe-grid','#2d5268'),land=tone('--globe-land','#29594d'),coast=tone('--globe-coast','#8bac9c');
    ctx.beginPath();path({type:'Sphere'});ctx.fillStyle=ocean;ctx.fill();
    ctx.save();ctx.shadowColor=accent;ctx.shadowBlur=22;ctx.strokeStyle=accent;ctx.lineWidth=1.2;ctx.stroke();ctx.restore();
    ctx.beginPath();path(graticule);ctx.strokeStyle=grid;ctx.lineWidth=.5;ctx.stroke();
    for (const f of features) {ctx.beginPath();path(f);ctx.fillStyle=f.properties.code===selected?accent:land;ctx.fill();ctx.strokeStyle=coast;ctx.lineWidth=.6;ctx.stroke();}
  }
  function spinLabel() {$('globeSpin').textContent=paused?'Resume rotation':'Pause rotation';$('globeSpin').setAttribute('aria-pressed',String(paused));}
  function animate(t) {
    const active = !document.hidden && !$('appShell').hidden && canvas.closest('.view')?.classList.contains('active');
    if (active && t-lastPaint>32) {if(!paused&&!dragging&&lastFrame)rotation[0]+=(Math.min(t-lastFrame,100)/1000)*2;draw();lastPaint=t;}
    lastFrame=t;requestAnimationFrame(animate);
  }
  function amount(value) {return new Intl.NumberFormat(undefined,{maximumFractionDigits: value<.01?7:4}).format(value);}
  function renderRates() {
    const panel=$('countryRates');panel.replaceChildren();
    if (!selected) return;
    const entries=Object.entries(countries[selected].currencies||{});
    if (!entries.length) {panel.textContent='No currency information available.';return;}
    for (const [code,currency] of entries) {
      const entry=document.createElement('div');entry.className='currency-entry';
      const title=document.createElement('strong');title.textContent=`${currency.name} (${code})`;entry.append(title);
      const line=document.createElement('p');const rate=code==='ZAR'?1:rates?.rates?.[code];
      line.textContent=Number.isFinite(rate)&&rate>0?`R1 = ${amount(rate)} ${code}`:rates?'Rate unavailable for this currency.':'Exchange rate unavailable.';entry.append(line);
      if(Number.isFinite(rate)&&rate>0){const reverse=document.createElement('p');reverse.textContent=`1 ${code} = R${amount(1/rate)}`;entry.append(reverse);}panel.append(entry);
    }
    $('rateUpdated').textContent=rates?`Rate update: ${new Date(rates.time_last_update_unix*1000).toLocaleDateString()}. Base: ZAR.`:'';
  }
  async function loadRates() {
    if (rates) {renderRates();return;}
    if (!ratePromise) ratePromise=(async()=>{
      $('retryRates').hidden=true;
      try {
        const response=await fetch('https://open.er-api.com/v6/latest/ZAR',{signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw new Error('Rates unavailable');const data=await response.json();
        if(data.result!=='success'||data.base_code!=='ZAR'||!data.rates||!Number.isFinite(data.time_last_update_unix))throw new Error('Invalid rates');
        rates=data;
      } catch { $('retryRates').hidden=false; }
      finally {ratePromise=null;renderRates();}
    })();
    await ratePromise;
  }
  function selectCountry(code, center=true) {
    if(!countries[code])return;selected=code;paused=true;spinLabel();$('countrySelect').value=code;
    $('countryDetails').hidden=false;$('countryName').textContent=countries[code].name;
    const zones=$('countryZone');zones.replaceChildren();
    for(const zone of countries[code].zones){const option=document.createElement('option');option.value=zone;option.textContent=zone.replaceAll('_',' ');zones.append(option);}
    zones.disabled=zones.options.length<2;
    if(center){const coordinates=countries[code].center;if(coordinates?.length===2)rotation=[-coordinates[1],-coordinates[0],0];}
    homeClock();renderRates();draw();void loadRates();
  }
  function point(e) {const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)*720/r.width,(e.clientY-r.top)*720/r.height];}
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragging={point:point(e),rotation:[...rotation]};moved=false;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!dragging)return;const p=point(e),dx=p[0]-dragging.point[0],dy=p[1]-dragging.point[1];if(Math.hypot(dx,dy)>5)moved=true;rotation=[dragging.rotation[0]+dx*.3,Math.max(-85,Math.min(85,dragging.rotation[1]-dy*.3)),0];draw();});
  canvas.addEventListener('pointerup',e=>{if(!dragging)return;dragging=null;if(moved)return;const p=point(e);if(Math.hypot(p[0]-360,p[1]-360)>305)return;const coordinates=projection.invert(p);if(!coordinates)return;const hit=features.find(f=>d3.geoContains(f,coordinates));if(hit&&countries[hit.properties.code])selectCountry(hit.properties.code,false);});
  canvas.addEventListener('pointercancel',()=>{dragging=null;});
  $('countrySelect').onchange=e=>{if(e.target.value)selectCountry(e.target.value);};
  $('countryZone').onchange=homeClock;$('retryRates').onclick=()=>void loadRates();
  $('globeSpin').onclick=()=>{paused=!paused;spinLabel();};
  $('globeSize').onclick=()=>{const large=canvas.closest('.world-layout').classList.toggle('globe-large');$('globeSize').textContent=large?'Make globe smaller':'Enlarge globe';$('globeSize').setAttribute('aria-pressed',String(large));};
  $('globeReset').onclick=()=>{rotation=[-25,-15,0];draw();};
  async function init() {
    try {
      const responses=await Promise.all([fetch('./assets/world.json'),fetch('./assets/countries.json')]);
      if(responses.some(r=>!r.ok))throw new Error();const [world,metadata]=await Promise.all(responses.map(r=>r.json()));countries=metadata;
      features=world.features;
      // D3 uses clockwise exterior rings; source GeoJSON uses the opposite convention.
      for(const feature of features)if(d3.geoArea(feature)>2*Math.PI){const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;for(const polygon of polygons)for(const ring of polygon)ring.reverse();}
      for(const [code,country] of Object.entries(countries).sort((a,b)=>a[1].name.localeCompare(b[1].name))){const option=document.createElement('option');option.value=code;option.textContent=country.name;$('countrySelect').append(option);}
      $('globeStatus').textContent='Drag to rotate · Click a country to explore';spinLabel();draw();requestAnimationFrame(animate);
    }catch{$('globeStatus').textContent='The globe could not load. Refresh the page to try again.';}
  }
  homeClock();setInterval(homeClock,1000);void init();
})();

/* Quest Lab: an isolated, deterministic visual demo. No network, storage or workspace data. */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const colors = ['#7aeadb', '#ae9cf4', '#e9c883', '#739dcc'];
  const clusterNames = ['Studio', 'Operations', 'Research', 'Personal'];
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const number = n => Math.round(n).toLocaleString('en-US');
  const price = n => n.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0});
  const random = seed => () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const normal = rng => Math.sqrt(-2 * Math.log(Math.max(.00001, rng()))) * Math.cos(TAU * rng());
  const timeLabel = value => new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(value);
  const lights = '<span class="ql-status-lights" aria-hidden="true"><i></i><i></i><i></i></span>';
  const stat = (label, key) => '<div class="ql-stat"><span>' + label + '</span><b data-read="' + key + '"></b></div>';
  const button = (action, text, extra) => '<button type="button" class="ql-button ' + (extra || '') + '" data-action="' + action + '">' + text + '</button>';
  const markup = [
    '<header class="ql-top"><div><div class="ql-brandline"><span class="ql-mark" aria-hidden="true">Q</span>Quest / Experimental space</div>',
    '<h1 class="ql-main-title">A different perspective.</h1><p class="ql-subtitle">Explore a connected universe. Follow a field of possibilities.</p></div>',
    '<div class="ql-top-right"><span class="ql-demo-badge">DEMO · SAMPLE DATA</span>',
    '<div class="ql-tabs" role="tablist" aria-label="Quest Lab views">',
    '<button type="button" role="tab" id="ql-tab-universe" aria-controls="ql-universe" aria-selected="true" data-tab="universe"><span aria-hidden="true">✺</span>Universe</button>',
    '<button type="button" role="tab" id="ql-tab-forecast" aria-controls="ql-forecast" aria-selected="false" tabindex="-1" data-tab="forecast"><span aria-hidden="true">⌁</span>Forecast Lab</button></div></div></header>',
    '<section class="ql-console" id="ql-universe" role="tabpanel" aria-labelledby="ql-tab-universe">',
    '<div class="ql-console-bar"><div class="ql-console-title">' + lights + '<strong>QUEST UNIVERSE</strong><span>/ CONNECTION ATLAS</span></div><span class="ql-console-id">SYNTHETIC GRAPH · LOCAL SESSION</span></div>',
    '<div class="ql-toolbar"><div class="ql-control-group"><label class="ql-select-label">Form<select class="ql-select" data-control="layout"><option value="orbit">Orbital</option><option value="spiral">Spiral galaxy</option><option value="sphere">Sphere</option></select></label>',
    '<label class="ql-select-label">Detail<select class="ql-select" data-control="density"><option value="light">Light</option><option value="balanced" selected>Balanced</option><option value="dense">Dense</option></select></label></div>',
    '<div class="ql-control-group">' + button('motion', 'Pause motion') + button('galaxy-out', '−', 'ql-zoom') + button('galaxy-in', '+', 'ql-zoom') + button('galaxy-reset', 'Reset view') + '</div></div>',
    '<div class="ql-layout"><div class="ql-stage"><div class="ql-stage-heading"><span>RELATIONSHIP FIELD / 3D PROJECTION</span><span>DRAG TO ORBIT · SCROLL TO ZOOM</span></div>',
    '<div class="ql-canvas"><canvas data-canvas="galaxy" tabindex="0" aria-label="Interactive sample network. Drag to rotate, scroll to zoom, click a node to select. Arrow keys rotate, plus and minus zoom, Space pauses, Home resets."></canvas></div>',
    '<div class="ql-overlay-caption"><b data-read="galaxy-caption">A UNIVERSE OF CONNECTIONS</b><span data-read="galaxy-caption-sub">Select a point. Follow its orbit.</span></div>',
    '<div class="ql-stage-foot"><span><strong>Drag</strong> to rotate · <strong>Tap</strong> a node · <strong>Scroll / pinch</strong> to zoom</span><span data-read="galaxy-camera">ORBIT 00° / 00°</span></div></div>',
    '<aside class="ql-side"><section class="ql-side-card"><h2 class="ql-card-title">Field telemetry</h2><div class="ql-stats">',
    stat('Sample nodes', 'nodes'), stat('Connections', 'edges'), stat('Visible nodes', 'visible-nodes'), stat('Average degree', 'degree'), stat('Motion', 'motion-state'),
    '</div></section><section class="ql-side-card"><h2 class="ql-card-title">Constellations</h2><div class="ql-barset" data-read="clusters"></div><p class="ql-callout">Fictional work, ideas and references. No member or project data is loaded.</p></section>',
    '<section class="ql-side-card"><h2 class="ql-card-title">Node explorer</h2><span class="ql-focus-type" data-read="focus-type">No node selected</span><h3 class="ql-focus-title" data-read="focus-name">Look a little closer.</h3>',
    '<p class="ql-focus-description" data-read="focus-description">Each point is a sample item. Select one to illuminate its direct connections.</p>',
    '<label class="ql-select-label" for="ql-node-picker">Or choose a sample node</label><select id="ql-node-picker" class="ql-select" data-control="node"><option value="">Choose a node…</option></select>',
    button('clear-node', 'Clear selection') + '</section></aside></div>',
    '<div class="ql-bottom-grid"><section class="ql-bottom-card"><h2>Filter the field</h2><div class="ql-radial-wrap"><div class="ql-radial" aria-hidden="true"><span data-read="ring-count"></span></div><div class="ql-legend" data-read="legend"></div></div></section>',
    '<section class="ql-bottom-card"><h2>Connection distribution</h2><div class="ql-histogram" data-read="histogram" aria-label="Distribution of node connection counts"></div><div class="ql-mini-axis"><span>FEWER LINKS</span><span>MORE LINKS</span></div></section>',
    '<section class="ql-bottom-card"><h2>Depth profile</h2><svg class="ql-spark" viewBox="0 0 300 90" preserveAspectRatio="none" aria-label="Distribution of sample nodes by depth"><line x1="0" y1="80" x2="300" y2="80"/><path data-read="depth-path"/></svg><div class="ql-mini-axis"><span>FAR FIELD</span><span>NEAR FIELD</span></div><p class="ql-summary-sub">A projected 3D network, rendered on your device.</p></section></div>',
    '<footer class="ql-footnote"><span><b>DEMO DATA ONLY</b> / Locally generated nodes and connections</span><span>Arrow keys: orbit · + / −: zoom · Space: pause · Home: reset</span></footer></section>',
    '<section class="ql-console" id="ql-forecast" role="tabpanel" aria-labelledby="ql-tab-forecast" hidden>',
    '<div class="ql-console-bar"><div class="ql-console-title">' + lights + '<strong>QUEST FORECAST LAB</strong><span>/ SCENARIO EXPLORER</span></div><span class="ql-console-id">SIMULATION · NO MODEL CONNECTED</span></div>',
    '<div class="ql-toolbar"><div class="ql-control-group"><label class="ql-select-label">Market<select class="ql-select" data-control="asset"><option value="btc">BTC / USD</option><option value="eth">ETH / USD</option><option value="gold">Gold / USD</option></select></label>',
    '<label class="ql-select-label">Interval<select class="ql-select" data-control="interval"><option value="1">1 minute</option><option value="5">5 minutes</option><option value="15">15 minutes</option><option value="60" selected>1 hour</option><option value="240">4 hours</option><option value="1440">1 day</option></select></label></div>',
    '<div class="ql-control-group">' + button('forecast-out', '−', 'ql-zoom') + button('forecast-in', '+', 'ql-zoom') + button('forecast-reset', 'Reset view') + button('scenario', 'New scenario', 'ql-primary') + '</div></div>',
    '<div class="ql-layout"><div class="ql-stage ql-forecast-stage"><div class="ql-stage-heading"><span data-read="chart-title">BTC / USD · SAMPLE CANDLES · 1H</span><span>100 PATHS / NEXT 24 BARS</span></div>',
    '<div class="ql-canvas"><canvas data-canvas="forecast" tabindex="0" aria-label="Simulated price chart. Drag to explore sample dates, scroll to zoom. Left and right keys pan, plus and minus zoom, Home resets. The future paths are simulations, not a trained forecast."></canvas></div>',
    '<div class="ql-stage-foot"><span data-read="crosshair">Drag to explore dates · Hover for candle details</span><span>TIME: AFRICA/JOHANNESBURG</span></div></div>',
    '<aside class="ql-side"><section class="ql-side-card"><h2 class="ql-card-title">Scenario engine</h2><span class="ql-model-label">SIMULATION / NO AI MODEL</span>',
    '<div class="ql-stats">' + stat('Synthetic history', 'history-count') + stat('Generated paths', 'path-count') + stat('Horizon', 'horizon') + stat('Sample anchor', 'anchor') + '</div>',
    '<div class="ql-quantile"><i></i>Median scenario</div><div class="ql-quantile"><i class="band"></i>10–90th scenario range</div></section>',
    '<section class="ql-side-card"><h2 class="ql-card-title">At the horizon</h2><div class="ql-pair"><span>90th percentile</span><b data-read="p90"></b></div><div class="ql-pair"><span>Median</span><b class="ql-gold" data-read="median"></b></div><div class="ql-pair"><span>10th percentile</span><b data-read="p10"></b></div>',
    '<p class="ql-callout">The spread describes these generated paths. It is not a measured confidence level or prediction accuracy.</p></section>',
    '<section class="ql-side-card"><h2 class="ql-card-title">Session readout</h2><pre class="ql-console-log" data-read="scenario-log"></pre>',
    '<p class="ql-summary-sub">Explore a new seed to see how the possible paths change.</p>' + button('motion', 'Pause motion') + '</section></aside></div>',
    '<div class="ql-scenario-summary"><section class="ql-summary-card"><div class="ql-summary-title">Median at +24 bars / USD</div><div class="ql-big-number" data-read="median-big"></div>',
    '<div class="ql-summary-sub" data-read="horizon-date"></div><div class="ql-summary-sub">Synthetic candles. Simulated future. No live quote.</div></section>',
    '<section class="ql-summary-card"><div class="ql-summary-title">Terminal scenario split</div><div class="ql-split-count"><div><small>Above anchor</small><span data-read="up-count"></span></div><div class="ql-down"><small>Below anchor</small><span data-read="down-count"></span></div></div><div class="ql-path-dots" data-read="path-dots" aria-hidden="true"></div></section>',
    '<section class="ql-summary-card"><div class="ql-summary-title">What this preview explores</div><p class="ql-summary-sub">Candles + a field of possible paths, an illuminated anchor, crosshair inspection and time navigation.</p><p class="ql-callout">No exchange connection, trained model, backtest or trading actions are included.</p></section></div>',
    '<footer class="ql-footnote"><span><b>ILLUSTRATIVE SIMULATION</b> / Seeded stochastic paths · not investment advice</span><span>Scroll / pinch: zoom · Drag: pan · Home: reset</span></footer></section>'
  ].join('');

  function graphData(count) {
    const rng = random(41 + count), nodes = [], edges = [], keys = new Set();
    const names = ['Signal', 'Atlas', 'Orbit', 'Prism', 'Echo', 'Vector', 'Pulse', 'Arc'];
    for (let i = 0; i < count; i++) {
      const group = Math.floor(i * 4 / count), u = TAU * i / count + (rng() - .5) * .1, v = TAU * rng();
      const r = 151 + 23 * Math.cos(u) + 11 * Math.sin(2 * u), minor = 34 + rng() * 24;
      nodes.push({id: i, group, u, v, r, minor, size: rng() > .94 ? 2.1 : .65 + rng() * .65,
        name: names[i % names.length] + ' / ' + String(i + 1).padStart(3, '0'),
        kind: ['Idea', 'Reference', 'Task', 'Milestone', 'Note'][i % 5], links: [], jitter: rng()});
    }
    const link = (a, b) => {
      if (a === b) return;
      const key = Math.min(a, b) + ':' + Math.max(a, b);
      if (keys.has(key)) return;
      keys.add(key); nodes[a].links.push(b); nodes[b].links.push(a);
      edges.push({a, b, lift: (rng() - .5) * 80});
    };
    for (let i = 0; i < count; i++) {
      link(i, (i + 1 + Math.floor(rng() * 20)) % count);
      link(i, (i + 25 + Math.floor(rng() * (count - 30))) % count);
      if (i % 2 === 0) link(i, (i + Math.floor(count / 3) + Math.floor(rng() * 60)) % count);
    }
    return {nodes, edges};
  }

  function galaxy(canvas, read, onSelection, onGraph) {
    const ctx = canvas.getContext('2d', {alpha: false});
    let data, width = 1, height = 1, dpr = 1, points = [], selected = null, filter = null;
    let yaw = .46, pitch = .17, zoom = 1, layout = 'orbit', rotation = 0;
    const mobile = () => width < 600;
    const groupVisible = n => filter === null || n.group === filter;
    function positions() {
      const count = data.nodes.length;
      for (const n of data.nodes) {
        if (layout === 'sphere') {
          const y = 1 - 2 * (n.id + .5) / count, phi = n.id * 2.3999632297;
          const rr = 186 + (n.jitter - .5) * 22, t = Math.sqrt(1 - y * y);
          n.x = rr * t * Math.cos(phi); n.y = y * rr; n.z = rr * t * Math.sin(phi);
        } else if (layout === 'spiral') {
          const arm = n.id % 3, radius = 17 + 188 * Math.sqrt(n.id / count);
          const angle = radius / 48 + arm * TAU / 3 + (n.jitter - .5) * .43;
          n.x = Math.cos(angle) * radius; n.z = Math.sin(angle) * radius;
          n.y = Math.sin(n.v) * (19 + (1 - radius / 210) * 35);
        } else {
          n.x = (n.r + n.minor * Math.cos(n.v)) * Math.cos(n.u);
          n.y = (n.r + n.minor * Math.cos(n.v)) * Math.sin(n.u) * 1.16;
          n.z = n.minor * Math.sin(n.v) + 24 * Math.sin(3 * n.u);
        }
      }
    }
    function build(density) {
      const small = matchMedia('(max-width: 650px)').matches;
      const count = ({light: small ? 180 : 360, balanced: small ? 320 : 760, dense: small ? 540 : 1200})[density] || 760;
      data = graphData(count); selected = null; filter = null; points = []; positions(); onGraph(data); onSelection(null, data); draw();
    }
    function resize() {
      const rect = canvas.getBoundingClientRect(); width = Math.max(1, rect.width); height = Math.max(1, rect.height);
      dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
    }
    function project(x, y, z) {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const xx = x * cy + z * sy, zz = -x * sy + z * cy;
      const yy = y * cp - zz * sp, depth = y * sp + zz * cp;
      const scale = Math.min(width / 530, height / 530) * .93 * zoom * 650 / (650 + depth);
      return {x: width * .5 + xx * scale, y: height * .49 + yy * scale, z: depth, scale};
    }
    function draw() {
      if (!data || width < 2) return;
      ctx.fillStyle = '#050c11'; ctx.fillRect(0, 0, width, height);
      const glow = ctx.createRadialGradient(width * .49, height * .48, 5, width * .49, height * .48, height * .52);
      glow.addColorStop(0, '#152536'); glow.addColorStop(.5, '#0b1724'); glow.addColorStop(1, '#050c11');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#7b9da7';
      for (let i = 0; i < 95; i++) { ctx.globalAlpha = .08 + (i % 7) * .025; ctx.fillRect((i * 157.47) % width, (i * 79.83) % height, .8, .8); }
      ctx.globalAlpha = 1; ctx.strokeStyle = '#203640'; ctx.lineWidth = .5;
      const cx = width / 2, cy = height * .49, radius = Math.min(width * .45, height * .45);
      ctx.setLineDash([2, 10]); ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 48; i++) {
        const a = i / 48 * TAU; ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (radius + 5), cy + Math.sin(a) * (radius + 5));
        ctx.lineTo(cx + Math.cos(a) * (radius + (i % 4 === 0 ? 12 : 8)), cy + Math.sin(a) * (radius + (i % 4 === 0 ? 12 : 8))); ctx.stroke();
      }
      points = data.nodes.map(n => project(n.x, n.y, n.z));
      const neighbors = selected === null ? null : new Set([selected, ...data.nodes[selected].links]);
      ctx.globalCompositeOperation = 'lighter';
      for (let group = 0; group < 4; group++) {
        ctx.beginPath(); ctx.strokeStyle = ['#b5eee7', '#cec6f7', '#f0dfaf', '#b1c9e2'][group]; ctx.lineWidth = mobile() ? .55 : .6; ctx.globalAlpha = selected === null ? .18 : .045;
        for (const edge of data.edges) {
          const n = data.nodes[edge.a], b = data.nodes[edge.b];
          if (n.group !== group || !groupVisible(n) || !groupVisible(b)) continue;
          const p = points[edge.a], q = points[edge.b];
          const control = project((n.x + b.x) * .29, (n.y + b.y) * .29, (n.z + b.z) * .45 + edge.lift);
          ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(control.x, control.y, q.x, q.y);
        }
        ctx.stroke();
      }
      if (selected === null) {
        ctx.globalAlpha = .65; ctx.fillStyle = '#c9f7ed'; ctx.shadowColor = '#a7f4df'; ctx.shadowBlur = 5;
        for (let i = 0; i < data.edges.length; i += 43) {
          const edge = data.edges[i], a = data.nodes[edge.a], b = data.nodes[edge.b];
          if (!groupVisible(a) || !groupVisible(b)) continue;
          const p = points[edge.a], q = points[edge.b];
          const c = project((a.x + b.x) * .29, (a.y + b.y) * .29, (a.z + b.z) * .45 + edge.lift);
          const t = (rotation * .08 + i * .031) % 1, one = 1 - t;
          const xx = one * one * p.x + 2 * one * t * c.x + t * t * q.x;
          const yy = one * one * p.y + 2 * one * t * c.y + t * t * q.y;
          ctx.beginPath(); ctx.arc(xx, yy, .85, 0, TAU); ctx.fill();
        }
        ctx.shadowBlur = 0;
      }
      if (selected !== null) {
        ctx.lineWidth = 1.1; ctx.globalAlpha = .6; ctx.strokeStyle = colors[data.nodes[selected].group]; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 7;
        ctx.beginPath();
        for (const edge of data.edges) if (edge.a === selected || edge.b === selected) {
          const a = data.nodes[edge.a], b = data.nodes[edge.b], p = points[edge.a], q = points[edge.b];
          const control = project((a.x + b.x) * .29, (a.y + b.y) * .29, (a.z + b.z) * .45 + edge.lift);
          ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(control.x, control.y, q.x, q.y);
        }
        ctx.stroke(); ctx.shadowBlur = 0;
      }
      let visible = 0;
      for (const n of data.nodes) {
        if (!groupVisible(n)) continue;
        const p = points[n.id], lit = neighbors === null || neighbors.has(n.id);
        ctx.globalAlpha = lit ? clamp(.65 - p.z / 750, .25, .95) : .22;
        ctx.fillStyle = colors[n.group];
        if (n.id % 5 === 0 && !neighbors) {
          const outer = project(n.x * 1.15, n.y * 1.15, n.z * 1.1);
          ctx.strokeStyle = colors[n.group]; ctx.lineWidth = .45; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(outer.x, outer.y); ctx.stroke();
          ctx.fillRect(outer.x - .6, outer.y - .6, 1.2, 1.2);
        }
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(.45, n.size * p.scale * (lit && neighbors ? 1.8 : 1)), 0, TAU); ctx.fill(); visible++;
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      if (selected !== null && groupVisible(data.nodes[selected])) {
        const p = points[selected]; ctx.strokeStyle = '#f3dba2'; ctx.shadowColor = '#d5c77a'; ctx.shadowBlur = 12; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
        ctx.fillStyle = '#d9c68b'; ctx.font = '9px ui-monospace, monospace';
        const textX = clamp(p.x + 15, 8, width - 150), textY = clamp(p.y - 10, 35, height - 20);
        ctx.fillText(data.nodes[selected].name.toUpperCase(), textX, textY);
      }
      ctx.strokeStyle = '#355059'; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6); ctx.stroke();
      read('visible-nodes', number(visible));
      read('galaxy-camera', 'ORBIT ' + ((yaw * 180 / Math.PI % 360 + 360) % 360).toFixed(0) + '° / ' + (pitch * 180 / Math.PI).toFixed(0) + '° · ' + zoom.toFixed(1) + '×');
      const depth = new Array(24).fill(0);
      for (const p of points) depth[clamp(Math.floor((p.z + 300) / 600 * 24), 0, 23)]++;
      const max = Math.max(1, ...depth);
      read('depth-path', depth.map((v, i) => (i ? 'L' : 'M') + (i * 300 / 23).toFixed(1) + ',' + (78 - 64 * v / max).toFixed(1)).join(' '), 'd');
    }
    function choose(id) {
      selected = id === null || id === '' ? null : clamp(Number(id), 0, data.nodes.length - 1);
      if (selected !== null && filter !== null && data.nodes[selected].group !== filter) filter = null;
      onSelection(selected === null ? null : data.nodes[selected], data); draw();
    }
    return {
      build, resize, draw, choose,
      tick(dt) { yaw += dt * .17; rotation += dt; draw(); },
      orbit(dx, dy) { yaw += dx * .006; pitch = clamp(pitch + dy * .006, -1.45, 1.45); draw(); },
      zoom(factor) { zoom = clamp(zoom * factor, .5, 2.3); draw(); },
      layout(value) { layout = value; positions(); draw(); },
      filter(value) { filter = value; draw(); },
      reset() { yaw = .46; pitch = .17; zoom = 1; choose(null); },
      pick(x, y) {
        let best = 17, id = null;
        for (const n of data.nodes) if (groupVisible(n)) { const p = points[n.id], d = Math.hypot(p.x - x, p.y - y); if (d < best) {best = d; id = n.id;} }
        choose(id);
      },
      snapshot() { return {nodes: data.nodes.length, edges: data.edges.length, yaw, pitch, zoom, layout, filter, selected, rotation, positions: points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 10)) === 0).map((p, i) => ({id: i * Math.max(1, Math.floor(points.length / 10)), x: p.x, y: p.y}))}; }
    };
  }

  function marketData(asset, interval, seed) {
    const anchors = {btc: 81170, eth: 2840, gold: 2640}, anchor = anchors[asset], rng = random(271 + seed + interval * 13 + anchor);
    const history = [], paths = [], count = 180, horizon = 24, step = interval * 60000;
    const stamp = Date.UTC(2026, 10, 13, 10, 0);
    const timeScale = Math.sqrt(interval / 60);
    let current = anchor * .975;
    for (let i = 0; i < count; i++) {
      const open = current, close = open * Math.exp(.00008 * timeScale + normal(rng) * .0018 * timeScale);
      const high = Math.max(open, close) * (1 + rng() * .0018 * timeScale), low = Math.min(open, close) * (1 - rng() * .0018 * timeScale);
      history.push({open, close, high, low, time: stamp - (count - 1 - i) * step}); current = close;
    }
    const factor = anchor / current;
    for (const candle of history) for (const key of ['open', 'close', 'high', 'low']) candle[key] *= factor;
    const volatility = .0022 * Math.sqrt(interval / 60), drift = .00018 * Math.sqrt(interval / 60);
    for (let i = 0; i < 100; i++) {
      const path = [anchor]; let p = anchor;
      for (let j = 1; j <= horizon; j++) {p *= Math.exp(drift + normal(rng) * volatility); path.push(p);}
      paths.push(path);
    }
    const quantiles = [];
    for (let i = 0; i <= horizon; i++) {
      const values = paths.map(p => p[i]).sort((a, b) => a - b);
      quantiles.push({low: values[9], median: (values[49] + values[50]) / 2, high: values[89], time: stamp + i * step});
    }
    return {anchor, history, paths, quantiles, horizon, interval, seed, step, stamp, asset};
  }

  function forecast(canvas, read, onData) {
    const ctx = canvas.getContext('2d', {alpha: false});
    let data, width = 1, height = 1, dpr = 1, pan = 0, span = 56, hover = null, phase = 0, map = null;
    const titles = {btc: 'BTC / USD', eth: 'ETH / USD', gold: 'GOLD / USD'};
    function build(asset, interval, seed) { data = marketData(asset, interval, seed); pan = 0; hover = null; onData(data); draw(); }
    function resize() {
      const rect = canvas.getBoundingClientRect(); width = Math.max(1, rect.width); height = Math.max(1, rect.height);
      dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
    }
    function draw() {
      if (!data || width < 2) return;
      ctx.fillStyle = '#050d12'; ctx.fillRect(0, 0, width, height);
      const left = 12, right = width < 500 ? 57 : 72, top = 53, bottom = 38, pw = width - left - right, ph = height - top - bottom;
      const anchorIndex = data.history.length - 1, start = anchorIndex - span * .51 - pan, end = start + span;
      const visible = data.history.filter((_, i) => i >= Math.floor(start) && i <= Math.ceil(end));
      let low = Math.min(...visible.map(c => c.low), data.anchor), high = Math.max(...visible.map(c => c.high), data.anchor);
      if (end > anchorIndex) {
        const qs = data.quantiles.slice(0, Math.ceil(Math.min(data.horizon + 1, end - anchorIndex + 1)));
        low = Math.min(low, ...qs.map(q => q.low)); high = Math.max(high, ...qs.map(q => q.high));
      }
      const margin = Math.max(data.anchor * .003, (high - low) * .18); low -= margin; high += margin;
      const x = i => left + (i - start) / span * pw, y = v => top + (high - v) / (high - low) * ph;
      map = {x, y, start, end, left, top, pw, ph, low, high, anchorIndex};
      const ax = x(anchorIndex), ay = y(data.anchor);
      const background = ctx.createRadialGradient(clamp(ax, 0, width), ay, 4, clamp(ax, 0, width), ay, ph * .7);
      background.addColorStop(0, '#15463766'); background.addColorStop(.45, '#0a292535'); background.addColorStop(1, '#050d1200');
      ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
      ctx.font = '9px ui-monospace, monospace'; ctx.lineWidth = .6;
      for (let i = 0; i <= 6; i++) {
        const yy = top + ph * i / 6; ctx.strokeStyle = '#183039'; ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(width - right, yy); ctx.stroke();
        ctx.fillStyle = '#67898d'; ctx.fillText(price(high - (high - low) * i / 6), width - right + 10, yy + 3);
      }
      const labelCount = width < 500 ? 3 : 6;
      for (let i = 0; i <= labelCount; i++) {
        const index = Math.round(start + span * i / labelCount), xx = x(index);
        ctx.strokeStyle = '#132a31'; ctx.beginPath(); ctx.moveTo(xx, top); ctx.lineTo(xx, height - bottom); ctx.stroke();
        ctx.fillStyle = '#67898d'; ctx.textAlign = i === 0 ? 'left' : i === labelCount ? 'right' : 'center';
        const time = data.stamp + (index - anchorIndex) * data.step;
        const label = new Intl.DateTimeFormat('en-ZA', {timeZone: 'Africa/Johannesburg', ...(data.interval >= 240 ? {day: '2-digit', month: 'short'} : {hour: '2-digit', minute: '2-digit', hour12: false})}).format(time);
        ctx.fillText(label, xx, height - 15); ctx.textAlign = 'left';
      }
      ctx.save(); ctx.beginPath(); ctx.rect(left, top - 10, pw, ph + 10); ctx.clip();
      const futureX = i => x(anchorIndex + i);
      ctx.beginPath();
      data.quantiles.forEach((q, i) => i ? ctx.lineTo(futureX(i), y(q.high)) : ctx.moveTo(futureX(i), y(q.high)));
      for (let i = data.horizon; i >= 0; i--) ctx.lineTo(futureX(i), y(data.quantiles[i].low));
      ctx.closePath(); ctx.fillStyle = '#5edbbc0d'; ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < data.paths.length; i++) {
        const path = data.paths[i]; ctx.beginPath(); ctx.strokeStyle = path[data.horizon] < data.anchor ? '#a276b0' : '#69cebd'; ctx.globalAlpha = .13; ctx.lineWidth = .6;
        path.forEach((value, j) => j ? ctx.lineTo(futureX(j), y(value)) : ctx.moveTo(ax, ay)); ctx.stroke();
      }
      ctx.globalAlpha = .5; ctx.strokeStyle = '#70dbcb'; ctx.lineWidth = .8;
      for (const key of ['low', 'high']) {ctx.beginPath(); data.quantiles.forEach((q, i) => i ? ctx.lineTo(futureX(i), y(q[key])) : ctx.moveTo(ax, ay)); ctx.stroke();}
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#e9c883'; ctx.lineWidth = 1.8; ctx.shadowColor = '#f3d696'; ctx.shadowBlur = 11; ctx.beginPath();
      data.quantiles.forEach((q, i) => i ? ctx.lineTo(futureX(i), y(q.median)) : ctx.moveTo(ax, ay)); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
      const candleWidth = Math.max(1.4, pw / span * .58);
      data.history.forEach((c, i) => {
        if (i < start - 1 || i > end + 1) return;
        const xx = x(i), color = c.close >= c.open ? '#66b7a4' : '#ce778c';
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xx, y(c.high)); ctx.lineTo(xx, y(c.low)); ctx.stroke();
        ctx.fillStyle = color; ctx.fillRect(xx - candleWidth / 2, Math.min(y(c.open), y(c.close)), candleWidth, Math.max(1.5, Math.abs(y(c.close) - y(c.open))));
      });
      if (ax >= left - 90 && ax <= width - right + 90) {
        const beam = ctx.createLinearGradient(ax - 22, 0, ax + 22, 0);
        beam.addColorStop(0, '#66fbd100'); beam.addColorStop(.5, '#80f3d31f'); beam.addColorStop(1, '#66fbd100');
        ctx.fillStyle = beam; ctx.fillRect(ax - 22, top, 44, ph);
        ctx.strokeStyle = '#81e7d24d'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, top); ctx.lineTo(ax, height - bottom); ctx.stroke();
        const radius = (width < 500 ? 29 : 43) + Math.sin(phase * 1.7) * 2;
        const halo = ctx.createRadialGradient(ax, ay, 3, ax, ay, radius * 1.9);
        halo.addColorStop(0, '#a3ffe879'); halo.addColorStop(.4, '#73e8c933'); halo.addColorStop(.65, '#66e3bf13'); halo.addColorStop(1, '#51e8c000');
        ctx.fillStyle = halo; ctx.fillRect(ax - radius * 2, ay - radius * 2, radius * 4, radius * 4);
        ctx.strokeStyle = '#9dffe3b3'; ctx.lineWidth = 1.4; ctx.shadowColor = '#73ffc9'; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(ax, ay, radius, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
        ctx.strokeStyle = '#80e0c94a'; ctx.lineWidth = .65; ctx.beginPath(); ctx.ellipse(ax, ay, radius * .43, radius, phase * .25, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(ax, ay, radius, radius * .3, -.28, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#b4f8df'; ctx.font = '9px ui-monospace, monospace'; ctx.textAlign = 'center';
        ctx.fillText('SAMPLE ANCHOR', ax, Math.max(top + 15, ay - radius - 17)); ctx.textAlign = 'left';
      }
      ctx.restore();
      function tag(xx, yy, text, color) {
        ctx.font = '9px ui-monospace, monospace'; const tw = ctx.measureText(text).width + 12;
        xx = clamp(xx, left, width - tw - 3); yy = clamp(yy, top + 7, height - bottom - 7);
        ctx.fillStyle = '#09181e'; ctx.fillRect(xx, yy - 9, tw, 18); ctx.strokeStyle = color + '70'; ctx.lineWidth = .7; ctx.strokeRect(xx, yy - 9, tw, 18);
        ctx.fillStyle = color; ctx.fillText(text, xx + 6, yy + 3);
      }
      if (ax >= left && ax <= width - right) tag(ax + 8, ay + 4, price(data.anchor) + ' · ANCHOR', '#7aeadb');
      const last = data.quantiles[data.horizon], fx = futureX(data.horizon);
      if (fx >= left && fx <= width - right) {
        tag(fx - 58, y(last.high) - 7, 'P90 ' + price(last.high), '#7aa6a3');
        tag(fx - 66, y(last.median), 'MED ' + price(last.median), '#e9c883');
        tag(fx - 58, y(last.low) + 7, 'P10 ' + price(last.low), '#aa88ac');
      }
      if (hover && hover.x >= left && hover.x <= width - right && hover.y >= top && hover.y <= height - bottom) {
        const index = Math.round(start + (hover.x - left) / pw * span), xx = x(index);
        ctx.strokeStyle = '#b8d3d282'; ctx.lineWidth = .7; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(xx, top); ctx.lineTo(xx, height - bottom); ctx.moveTo(left, hover.y); ctx.lineTo(width - right, hover.y); ctx.stroke(); ctx.setLineDash([]);
        const c = data.history[index], future = index - anchorIndex, q = data.quantiles[future];
        if (c) read('crosshair', timeLabel(c.time) + ' SAST · O ' + price(c.open) + ' H ' + price(c.high) + ' L ' + price(c.low) + ' C ' + price(c.close));
        else if (q) read('crosshair', timeLabel(q.time) + ' SAST · SIMULATED · Median ' + price(q.median) + ' · P10–P90 ' + price(q.low) + '–' + price(q.high));
        else read('crosshair', 'Outside generated history / scenario horizon');
        tag(width - right, hover.y, price(high - (hover.y - top) / ph * (high - low)), '#b2c9c6');
      }
      read('chart-title', titles[data.asset] + ' · SAMPLE CANDLES · ' + (data.interval < 60 ? data.interval + 'M' : data.interval < 1440 ? data.interval / 60 + 'H' : '1D'));
    }
    return {
      build, resize, draw, tick(dt) {phase += dt; draw();},
      pan(dx) {pan = clamp(pan + dx / Math.max(1, map?.pw || width) * span, -data.horizon, data.history.length - span * .51 - 1); draw();},
      zoom(factor) {span = clamp(span / factor, 24, 150); pan = clamp(pan, -data.horizon, data.history.length - span * .51 - 1); draw();},
      inspect(x, y) {hover = x === null ? null : {x, y}; if (!hover) read('crosshair', 'Drag to explore dates · Hover for candle details'); draw();},
      reset() {pan = 0; span = 56; hover = null; draw();},
      snapshot() {return {asset: data.asset, interval: data.interval, seed: data.seed, paths: data.paths.length, candles: data.history.length, horizon: data.horizon, anchor: data.anchor, quantiles: data.quantiles, up: data.paths.filter(p => p[data.horizon] >= data.anchor).length, pan, span, phase, firstCandle: data.history[0].time, lastCandle: data.history.at(-1).time};}
    };
  }

  window.mountQuestLab = (root, {visible: initialVisible = true, headingLevel = 1} = {}) => {
    root.classList.add('quest-lab'); root.innerHTML = markup;
    if (headingLevel === 2) {
      const title = root.querySelector('.ql-main-title'), heading = document.createElement('h2');
      heading.className = title.className; heading.textContent = title.textContent; title.replaceWith(heading);
    }
    const $ = query => root.querySelector(query);
    const read = (key, value, attribute) => {
      for (const el of root.querySelectorAll('[data-read="' + key + '"]')) {
        if (attribute) {if (el.getAttribute(attribute) !== value) el.setAttribute(attribute, value);}
        else if (el.textContent !== String(value)) el.textContent = value;
      }
    };
    const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    let paused = motionPreference.matches, visible = initialVisible, tab = 'universe', raf = 0, last = 0, frames = 0, destroyed = false;
    let seed = 1, asset = 'btc', interval = 60, activeFilter = null;
    const galaxyCanvas = $('[data-canvas=galaxy]'), chartCanvas = $('[data-canvas=forecast]');
    function updateSelection(node) {
      read('focus-type', node ? clusterNames[node.group] + ' / ' + node.kind : 'No node selected');
      read('focus-name', node ? node.name : 'Look a little closer.');
      read('focus-description', node ? node.links.length + ' direct connections in this sample network. The illuminated strands show this item’s immediate neighborhood.' : 'Each point is a sample item. Select one to illuminate its direct connections.');
      read('galaxy-caption', node ? node.name.toUpperCase() : 'A UNIVERSE OF CONNECTIONS');
      read('galaxy-caption-sub', node ? clusterNames[node.group] + ' · ' + node.links.length + ' DIRECT LINKS' : 'Select a point. Follow its orbit.');
      $('[data-control=node]').value = node === null ? '' : String(node.id);
      if (node && activeFilter !== null && node.group !== activeFilter) {
        activeFilter = null; updateFilterButtons();
      }
    }
    function updateGraph(data) {
      read('nodes', number(data.nodes.length)); read('edges', number(data.edges.length)); read('degree', (data.edges.length * 2 / data.nodes.length).toFixed(1)); read('ring-count', number(data.nodes.length));
      const clusters = $('[data-read=clusters]'); clusters.replaceChildren();
      const legend = $('[data-read=legend]'); legend.replaceChildren();
      clusterNames.forEach((name, group) => {
        const count = data.nodes.filter(n => n.group === group).length;
        const row = document.createElement('div'); row.className = 'ql-minirow';
        row.innerHTML = '<span>' + name + '</span><span class="ql-track"><i style="width:' + count / data.nodes.length * 100 * 3 + '%;--bar-color:' + colors[group] + '"></i></span><span>' + count + '</span>'; clusters.append(row);
        const b = document.createElement('button'); b.type = 'button'; b.dataset.cluster = String(group); b.style.setProperty('--cluster-color', colors[group]); b.textContent = name; b.setAttribute('aria-pressed', 'false'); legend.append(b);
      });
      const all = document.createElement('button'); all.type = 'button'; all.dataset.cluster = 'all'; all.style.setProperty('--cluster-color', '#dce9e7'); all.textContent = 'All constellations'; legend.prepend(all);
      const picker = $('[data-control=node]'); picker.replaceChildren(new Option('Choose a node…', ''));
      for (let i = 0; i < data.nodes.length; i += Math.max(1, Math.floor(data.nodes.length / 16))) {
        const n = data.nodes[i]; picker.add(new Option(n.name + ' · ' + clusterNames[n.group], n.id));
      }
      const bins = new Array(14).fill(0); for (const node of data.nodes) bins[Math.min(13, node.links.length)]++;
      const max = Math.max(...bins, 1), histogram = $('[data-read=histogram]'); histogram.replaceChildren();
      bins.forEach((v, i) => {const bar = document.createElement('i'); bar.style.height = Math.max(2, v / max * 100) + '%'; bar.title = i + ' links: ' + v + ' nodes'; histogram.append(bar);});
      activeFilter = null; updateFilterButtons();
    }
    function updateFilterButtons() {for (const b of root.querySelectorAll('[data-cluster]')) b.setAttribute('aria-pressed', String(activeFilter === (b.dataset.cluster === 'all' ? null : Number(b.dataset.cluster))));}
    function updateForecast(data) {
      const end = data.quantiles[data.horizon], up = data.paths.filter(p => p[data.horizon] >= data.anchor).length;
      read('history-count', data.history.length + ' candles'); read('path-count', data.paths.length); read('horizon', '+24 bars');
      read('anchor', price(data.anchor) + ' USD'); read('p90', price(end.high)); read('median', price(end.median)); read('p10', price(end.low)); read('median-big', price(end.median));
      read('up-count', up); read('down-count', 100 - up); read('horizon-date', timeLabel(end.time) + ' SAST · ' + (interval < 60 ? interval + 'm' : interval < 1440 ? interval / 60 + 'h' : '1D') + ' interval');
      read('scenario-log', '> seeded simulation #' + seed + '\n> 180 synthetic OHLC candles\n> 100 paths × 24 future bars\n> interval: ' + interval + ' minutes\n> drift + stochastic variation\n> percentile range: P10 / P90\n> data sources: none\n> execution: on this device');
      const dots = $('[data-read=path-dots]'); dots.replaceChildren();
      for (let i = 0; i < 100; i++) {const dot = document.createElement('i'); dot.classList.toggle('down', i >= up); dots.append(dot);}
    }
    const g = galaxy(galaxyCanvas, read, updateSelection, updateGraph);
    const f = forecast(chartCanvas, read, updateForecast);
    g.build('balanced'); f.build(asset, interval, seed);
    function draw() {if (tab === 'universe') g.draw(); else f.draw();}
    function size() {if (destroyed) return; if (tab === 'universe') g.resize(); else f.resize();}
    const allowedToAnimate = () => visible && !paused && !document.hidden && !destroyed;
    function stop() {if (raf) cancelAnimationFrame(raf); raf = 0; last = 0;}
    function frame(now) {
      raf = 0; if (!allowedToAnimate()) return;
      const wait = matchMedia('(max-width:650px)').matches ? 33 : 24;
      if (!last || now - last >= wait) {
        const dt = last ? Math.min(.08, (now - last) / 1000) : 0; last = now; frames++;
        if (tab === 'universe') g.tick(dt); else f.tick(dt);
      }
      raf = requestAnimationFrame(frame);
    }
    function reconcile() {stop(); if (allowedToAnimate()) raf = requestAnimationFrame(frame);}
    function setPaused(value) {
      paused = value;
      for (const b of root.querySelectorAll('[data-action=motion]')) {b.textContent = paused ? 'Resume motion' : 'Pause motion'; b.setAttribute('aria-pressed', String(paused));}
      read('motion-state', paused ? 'Paused' : 'Rotating');
      reconcile(); draw();
    }
    function setTab(value, focus = false) {
      tab = value === 'forecast' ? 'forecast' : 'universe';
      for (const b of root.querySelectorAll('[data-tab]')) {
        const active = b.dataset.tab === tab; b.setAttribute('aria-selected', String(active)); b.tabIndex = active ? 0 : -1;
        if (active && focus) b.focus();
      }
      $('#ql-universe').hidden = tab !== 'universe'; $('#ql-forecast').hidden = tab !== 'forecast';
      read('motion-state', paused ? 'Paused' : 'Rotating'); size(); reconcile();
    }
    const onClick = event => {
      const tabButton = event.target.closest('[data-tab]'); if (tabButton) {setTab(tabButton.dataset.tab); return;}
      const cluster = event.target.closest('[data-cluster]');
      if (cluster) {activeFilter = cluster.dataset.cluster === 'all' ? null : Number(cluster.dataset.cluster); updateFilterButtons(); g.filter(activeFilter); return;}
      const control = event.target.closest('[data-action]'); if (!control) return;
      switch (control.dataset.action) {
        case 'motion': setPaused(!paused); break;
        case 'galaxy-in': g.zoom(1.2); break;
        case 'galaxy-out': g.zoom(1 / 1.2); break;
        case 'galaxy-reset': g.reset(); break;
        case 'clear-node': g.choose(null); break;
        case 'forecast-in': f.zoom(1.2); break;
        case 'forecast-out': f.zoom(1 / 1.2); break;
        case 'forecast-reset': f.reset(); break;
        case 'scenario': seed++; f.build(asset, interval, seed); break;
      }
    };
    const onChange = event => {
      switch (event.target.dataset.control) {
        case 'layout': g.layout(event.target.value); break;
        case 'density': g.build(event.target.value); break;
        case 'node': g.choose(event.target.value); break;
        case 'asset': asset = event.target.value; f.build(asset, interval, seed); break;
        case 'interval': interval = Number(event.target.value); f.build(asset, interval, seed); break;
      }
    };
    const onKey = event => {
      if (event.target.matches('[role=tab]') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); setTab(event.key === 'Home' ? 'universe' : event.key === 'End' ? 'forecast' : tab === 'universe' ? 'forecast' : 'universe', true); return;
      }
      if (event.target !== galaxyCanvas && event.target !== chartCanvas) return;
      const graph = event.target === galaxyCanvas, renderer = graph ? g : f;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', ' ', 'Home', 'Escape'].includes(event.key)) event.preventDefault();
      if (event.key === ' ') setPaused(!paused);
      else if (event.key === 'Home') renderer.reset();
      else if (event.key === '+' || event.key === '=') renderer.zoom(1.15);
      else if (event.key === '-') renderer.zoom(1 / 1.15);
      else if (event.key === 'Escape' && graph) g.choose(null);
      else if (event.key.startsWith('Arrow')) {
        const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
        if (graph) g.orbit(direction * 12, event.key === 'ArrowUp' ? -12 : event.key === 'ArrowDown' ? 12 : 0);
        else if (direction) f.pan(direction * 35);
      }
    };
    const cleanups = [];
    function attachCanvas(canvas, renderer, graph) {
      const pointers = new Map(); let start = null, moved = false, pinch = 0;
      const local = event => {const box = canvas.getBoundingClientRect(); return {x: event.clientX - box.left, y: event.clientY - box.top};};
      const down = event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        canvas.focus({preventScroll: true}); canvas.setPointerCapture(event.pointerId);
        const p = local(event); pointers.set(event.pointerId, p); start = p; moved = false;
        if (pointers.size === 2) {const ps = [...pointers.values()]; pinch = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y); moved = true;}
      };
      const move = event => {
        const p = local(event), prev = pointers.get(event.pointerId);
        if (prev) {
          pointers.set(event.pointerId, p);
          if (pointers.size === 2) {
            const ps = [...pointers.values()], distance = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
            if (pinch > 0) renderer.zoom(distance / pinch); pinch = distance; moved = true;
          } else {
            if (start && Math.hypot(p.x - start.x, p.y - start.y) > 4) moved = true;
            if (moved) {if (graph) g.orbit(p.x - prev.x, p.y - prev.y); else f.pan(p.x - prev.x);}
          }
        } else if (!graph && event.pointerType !== 'touch') f.inspect(p.x, p.y);
      };
      const up = event => {
        if (!pointers.has(event.pointerId)) return;
        const p = local(event);
        if (!moved && pointers.size === 1 && event.type === 'pointerup') {if (graph) g.pick(p.x, p.y); else f.inspect(p.x, p.y);}
        pointers.delete(event.pointerId); pinch = 0;
        if (pointers.size) {start = [...pointers.values()][0]; moved = true;}
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      };
      const wheel = event => {event.preventDefault(); renderer.zoom(Math.exp(-clamp(event.deltaY, -100, 100) * .002));};
      const leave = () => {if (!graph && !pointers.size) f.inspect(null);};
      for (const [type, handler] of [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['lostpointercapture', up], ['pointerleave', leave]]) {
        canvas.addEventListener(type, handler); cleanups.push(() => canvas.removeEventListener(type, handler));
      }
      canvas.addEventListener('wheel', wheel, {passive: false}); cleanups.push(() => canvas.removeEventListener('wheel', wheel));
    }
    attachCanvas(galaxyCanvas, g, true); attachCanvas(chartCanvas, f, false);
    root.addEventListener('click', onClick); root.addEventListener('change', onChange); root.addEventListener('keydown', onKey);
    const observer = new ResizeObserver(size); observer.observe(root);
    const visibility = () => reconcile(); document.addEventListener('visibilitychange', visibility);
    const preference = event => setPaused(event.matches); motionPreference.addEventListener('change', preference);
    setPaused(paused); size();
    return {
      setVisible(value) {visible = !!value; if (visible) size(); reconcile();},
      reset() {
        visible = false; stop(); setPaused(motionPreference.matches); seed = 1; asset = 'btc'; interval = 60;
        $('[data-control=asset]').value = asset; $('[data-control=interval]').value = String(interval);
        $('[data-control=layout]').value = 'orbit'; $('[data-control=density]').value = 'balanced';
        g.layout('orbit'); g.build('balanced'); g.reset(); f.build(asset, interval, seed); f.reset(); setTab('universe');
      },
      snapshot() {return {tab, paused, visible, animating: !!raf, frames, galaxy: g.snapshot(), forecast: f.snapshot()};},
      destroy() {
        destroyed = true; stop(); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); motionPreference.removeEventListener('change', preference);
        root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); root.removeEventListener('keydown', onKey);
        cleanups.forEach(clean => clean()); root.replaceChildren();
      }
    };
  };

  window.createQuestLab = ({getData, navigate}) => {
    const view = document.createElement('section'); view.id = 'questLab'; view.className = 'view quest-lab'; view.hidden = true;
    document.querySelector('.content').append(view);
    const home = document.createElement('section'); home.id = 'questHomeLab'; home.className = 'quest-home-lab'; home.hidden = true;
    home.setAttribute('aria-labelledby', 'questLabHeading'); document.getElementById('overview').append(home);
    const workspace = document.createElement('section'); workspace.id = 'questWorkspaceLab'; workspace.className = 'quest-home-lab quest-workspace-lab'; workspace.hidden = true;
    workspace.setAttribute('aria-labelledby', 'questLabHeading'); document.querySelector('#personalHome .personal-hero').after(workspace);
    const surface = document.createElement('div'); surface.id = 'questLabSurface';
    const nav = document.createElement('button'); nav.type = 'button'; nav.dataset.view = 'questLab'; nav.textContent = '✺ Quest Lab'; nav.hidden = true;
    window.QuestNavigation?.decorate(nav, 'questLab'); document.querySelector('.sidebar .nav').append(nav);
    let controller = null, identity = null, expand = null, back = null, embeddedRoute = 'personalHome';
    const allowed = () => {const {user, policy} = getData(); return !!(user && policy?.is_admin && !policy.private_fragile_owner_id && !policy.studio_only_project_id);};
    const currentRoute = () => document.querySelector('.view.active')?.id;
    const onHome = () => currentRoute() === 'overview' && document.getElementById('overview').dataset.route !== 'globe';
    const onWorkspace = () => currentRoute() === 'personalHome';
    function updateAnimation() {
      if (!controller) return;
      const box = surface.getBoundingClientRect();
      const inViewport = box.width > 0 && box.height > 0 && box.bottom > -100 && box.top < innerHeight + 100;
      controller.setVisible(allowed() && !document.getElementById('appShell').hidden && (onHome() || onWorkspace() || currentRoute() === 'questLab') && inViewport);
    }
    const viewport = new IntersectionObserver(updateAnimation, {rootMargin: '100px'}); viewport.observe(surface);
    function clear() {controller?.destroy(); controller = null; surface.remove(); expand = null; back = null;}
    function mount(target) {
      if (surface.parentElement !== target) target.append(surface);
      if (!controller) {
        controller = window.mountQuestLab(surface, {visible: false, headingLevel: 2});
        const heading = surface.querySelector('.ql-main-title'); heading.id = 'questLabHeading'; heading.tabIndex = -1;
        const actions = document.createElement('div'); actions.className = 'ql-entry-actions';
        expand = document.createElement('button'); expand.type = 'button'; expand.className = 'ql-button'; expand.dataset.labOpen = 'page'; expand.textContent = 'Open full page ↗';
        back = document.createElement('button'); back.type = 'button'; back.className = 'ql-button'; back.dataset.labOpen = 'home'; back.textContent = '← Back to Home';
        actions.append(expand, back); surface.querySelector('.ql-top-right').prepend(actions);
      }
      const embedded = target === home || target === workspace;
      if (embedded) embeddedRoute = target === workspace ? 'personalHome' : 'overview';
      expand.hidden = !embedded; back.hidden = embedded;
      back.textContent = embeddedRoute === 'personalHome' ? '← Back to My workspace' : '← Back to Home';
      surface.querySelector('.ql-main-title').textContent = embedded ? 'Quest Lab' : 'A different perspective.';
      surface.classList.toggle('ql-embedded', embedded);
      updateAnimation();
    }
    surface.addEventListener('click', event => {
      const action = event.target.closest('[data-lab-open]'); if (!action || !allowed()) return;
      const destination = action.dataset.labOpen === 'page' ? 'questLab' : embeddedRoute; navigate?.(destination);
      surface.querySelector('.ql-main-title')?.focus({preventScroll: true});
      (destination === 'questLab' ? view : destination === 'personalHome' ? workspace : home).scrollIntoView({block: 'start'});
      updateAnimation();
    });
    function sync() {
      const uid = getData().user?.id || null, access = allowed();
      if (identity !== uid || !access) {clear(); identity = uid;}
      nav.hidden = !access; view.hidden = !access; workspace.hidden = !access; home.hidden = !access || document.getElementById('overview').dataset.route === 'globe';
      if (access && onHome()) mount(home);
      else if (access && onWorkspace()) mount(workspace);
      else if (access && currentRoute() === 'questLab') mount(view);
      else updateAnimation();
    }
    return {
      sync,
      activate(id) {
        sync();
        if (id === 'questLab' && allowed()) {view.scrollIntoView({block: 'start'}); updateAnimation();}
      },
      reset() {clear(); identity = null; embeddedRoute = 'personalHome'; nav.hidden = true; view.hidden = true; home.hidden = true; workspace.hidden = true;},
      snapshot() {return controller ? {...controller.snapshot(), location: surface.parentElement === home ? 'home' : surface.parentElement === workspace ? 'workspace' : 'page'} : {mounted: false};}
    };
  };
})();

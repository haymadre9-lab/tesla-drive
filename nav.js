'use strict';
/* Navegación propia (modo Tesla): búsqueda (Nominatim), rutas (OSRM) y guía paso a paso sobre mapa Leaflet/OSM.
   Se carga antes que app.js; usa globals de app.js (S, GPS, bus, toast, $, go…) solo al ejecutarse. */

const IS_TESLA = /Tesla|QtCarBrowser/i.test(navigator.userAgent || '');

const Nav = (() => {
  const N = { map: null, el: null, active: false, route: null, coords: [], steps: [], idx: 0, dest: null, pos: null, follow: true, sim: false, off: 0, muted: false, lastReroute: 0, simT: 0 };
  const MOD = { left: 'a la izquierda', right: 'a la derecha', 'slight left': 'ligeramente a la izquierda', 'slight right': 'ligeramente a la derecha', 'sharp left': 'cerrado a la izquierda', 'sharp right': 'cerrado a la derecha', straight: 'recto', uturn: 'dando la vuelta' };
  const ARROW = { left: '⬅', right: '➡', 'slight left': '↖', 'slight right': '↗', 'sharp left': '↙', 'sharp right': '↘', straight: '⬆', uturn: '↩' };
  const rad = x => x * Math.PI / 180;
  const dist = (a, b) => { const R = 6371000, dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]); const x = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  const loc = st => [st.maneuver.location[1], st.maneuver.location[0]];
  const fmtD = m => m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + ' km' : Math.max(0, Math.round(m / 10) * 10) + ' m';
  const pad2 = n => String(n).padStart(2, '0');

  function distToRoute(p, c) {
    const k = Math.cos(rad(p[0])), m = 111320; let best = Infinity;
    for (let i = 0; i < c.length - 1; i++) {
      const ax = (c[i][1] - p[1]) * k * m, ay = (c[i][0] - p[0]) * m, bx = (c[i + 1][1] - p[1]) * k * m, by = (c[i + 1][0] - p[0]) * m;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; let t = l2 ? -(ax * dx + ay * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(ax + t * dx, ay + t * dy); if (d < best) best = d;
    }
    return best;
  }
  function instr(st) {
    const m = st.maneuver, t = m.type, mod = m.modifier, nm = st.name ? ' hacia ' + st.name : '';
    switch (t) {
      case 'depart': return 'Inicia la ruta' + (st.name ? ' por ' + st.name : '');
      case 'arrive': return 'Has llegado a tu destino';
      case 'roundabout': case 'rotary': case 'roundabout turn': return 'En la rotonda, toma la salida ' + (m.exit || '') + nm;
      case 'exit roundabout': case 'exit rotary': return 'Sal de la rotonda' + nm;
      case 'off ramp': return 'Toma la salida ' + (MOD[mod] || '') + nm;
      case 'on ramp': return 'Incorpórate a la vía ' + (MOD[mod] || '') + nm;
      case 'merge': return 'Incorpórate ' + (MOD[mod] || '') + nm;
      case 'fork': return 'Mantente ' + (MOD[mod] || '') + nm;
      case 'end of road': return 'Gira ' + (MOD[mod] || '') + nm;
      default: return mod === 'straight' || !mod ? 'Continúa recto' + nm : mod === 'uturn' ? 'Da la vuelta' : 'Gira ' + MOD[mod] + nm;
    }
  }
  const icon = st => st.maneuver.type === 'arrive' ? '🏁' : /roundabout|rotary/.test(st.maneuver.type) ? '⟳' : ARROW[st.maneuver.modifier] || '⬆';

  function say(txt) {
    if (N.muted || !S.voice || !('speechSynthesis' in window)) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(txt); u.lang = 'es-ES'; speechSynthesis.speak(u); } catch { }
  }
  const getJSON = async (url, ms = 12000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); } };

  /* ── UI ── */
  function build() {
    const el = document.createElement('div'); el.className = 'navwrap';
    el.innerHTML = `<div id="navmap"></div>
      <button class="btn sec nsbtn" id="nsb" type="button" title="Buscar destino">🔍</button><div class="navtop"><div class="navsearch"><button class="nqfake" id="nq" type="button"><span>🔍</span> ¿A dónde vamos?</button><button class="btn sec" id="nph" title="Abrir en app de GPS del móvil">📲</button><button class="btn sec" id="nmaps" title="Cambiar de mapa">🗺</button></div>
        <div class="navchips" id="nchips"></div></div>
      <div class="navtools" id="ntools"><button id="nzi" title="Acercar">＋</button><button id="nzo" title="Alejar">－</button><button id="n3d" title="Cambiar entre vista 3D inclinada y mapa 2D">3D</button><button id="ncmp" title="Norte arriba"><i>▲</i></button></div>
      <div class="navguide" id="nguide" hidden><div class="ni" id="nicon">⬆</div><div class="nt"><b id="ndist">—</b><span id="ntext"></span></div></div>
      <div class="navbar" id="nbar" hidden><div><b id="nrem">—</b><small>restante</small></div><div><b id="neta">—</b><small>llegada</small></div><div><b id="nspd">0</b><small id="nspu">km/h</small></div>
        <button class="btn sec" id="nmute">🔊</button><button class="btn sec" id="nctr">🎯</button><button class="btn sec" id="nfav">⭐</button><button class="btn bad" id="nstop">✕ Terminar</button></div>
      <button class="btn sec navsim" id="nsim" hidden>🧪 Simular ruta</button>
      <div class="navlayers" id="nlay"><button data-l="cams" title="Radares fijos">📷</button><button data-l="chargers" title="Cargadores">⚡</button><button data-l="fuel" title="Gasolineras">⛽</button><button data-l="reports" title="Reportes">⚠️</button><button id="nsty" title="Cambiar el estilo del mapa (satélite, oscuro…)">🛰</button><button id="nrep" title="Reportar">➕</button></div>
      <div class="spdbub"><b class="js-spd">0</b><small>${spdUnit()}</small></div><div class="limsign" hidden></div>`;
    return el;
  }
  function chips() {
    const f = S.favs || {}, box = $('#nchips', N.el);
    const mk = (k, ico, lab) => `<span class="chip" data-fav="${k}">${ico} ${lab}${f[k] ? '' : ' <i style="opacity:.6">(sin definir)</i>'}</span>`;
    box.innerHTML = mk('home', '🏠', 'Casa') + mk('work', '💼', 'Trabajo') + (S.navRecent || []).map((r, i) => `<span class="chip" data-r="${i}">🕘 ${esc(r.name)}</span>`).join('');
    $$('[data-fav]', box).forEach(c => c.onclick = () => { const d = S.favs[c.dataset.fav]; d ? routeTo(d) : toast('Termina una ruta y pulsa ⭐ para guardarla aquí', 3500); });
    $$('[data-r]', box).forEach(c => c.onclick = () => routeTo(S.navRecent[+c.dataset.r]));
  }
  /* Estilo del mapa y del icono del vehículo (de la ventana o, si no, del ajuste general) */
  const ICONS = {
    dot: ['<div class="nme"><i></i></div>', [34, 34]],
    chev: ['<div class="nme chev"><svg viewBox="-20 -20 40 40"><path d="M0 -17 L13 15 L0 8 L-13 15Z" fill="#ff3b3b" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/></svg></div>', [44, 44]],
    car: ['<div class="nme car"><svg viewBox="-20 -34 40 68"><rect x="-14" y="-31" width="28" height="62" rx="12" fill="#eef2f8" stroke="#0b0f17" stroke-width="2"/><rect x="-10" y="-17" width="20" height="13" rx="4" fill="#243247"/><rect x="-10" y="9" width="20" height="9" rx="3" fill="#243247"/><rect x="-17" y="-22" width="4" height="10" rx="2" fill="#0b0f17"/><rect x="13" y="-22" width="4" height="10" rx="2" fill="#0b0f17"/><rect x="-17" y="12" width="4" height="10" rx="2" fill="#0b0f17"/><rect x="13" y="12" width="4" height="10" rx="2" fill="#0b0f17"/></svg></div>', [40, 68]],
  };
  const mkMe = (k, p) => { const [h, s] = ICONS[k] || ICONS.dot; return N.mx.marker(p, h, s, { z: 1000 }); };
  function applyStyle(opt) {
    if (!N.mx) return; if (opt) N.opt = opt;
    const o = N.opt || {}, st = o.mapstyle || S.mapStyle || 'auto', ic = o.icon || S.navIcon || 'dot';
    N.mx.style(st); N.el.dataset.ms = st; N.el.dataset.eng = N.mx.kind;
    if (ic !== N.iconKey) { const p = N.pos || myPos(); if (N.me) N.me.remove(); N.me = mkMe(ic, p); N.iconKey = ic; }
    drawRoute();
  }
  const STYLE_CYCLE = ['auto', 'sat', 'hybrid', 'dark', 'light'], STYLE_NAME = { auto: 'Automático', sat: 'Satélite', hybrid: 'Satélite con calles', dark: 'Oscuro', light: 'Claro' };
  const is3d = () => N.mx && N.mx.can3d && S.map3d !== false; // 3D = inclinado y girando según el rumbo (como Dashla)
  const angLerp = (a, b, t) => { let d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; };
  function centerOn(p, z, anim) { // coloca mi posición en el punto de enfoque (centro, derecha o izquierda; en 3D, abajo)
    const m = N.mx, d3 = is3d(); m.focus(N.fx, d3 ? .26 : 0);
    if (d3) m.view(p, z == null ? m.zoom() : Math.min(z, 17.4), { anim: !!anim, dur: 900, linear: true, bearing: N.hdg == null ? m.bearing() : N.hdg, pitch: 58 });
    else m.view(p, z, { anim: !!anim, dur: 700, bearing: 0, pitch: 0 });
  }
  function drawRoute() { if (!N.mx) return; N.mx.line(N.active || N.coords.length ? N.coords : null, S.accent || '#3e9bff'); }
  function setMode(d3) {
    S.map3d = !!d3; save(); const b = $('#n3d', N.el); if (b) { b.textContent = is3d() ? '3D' : '2D'; b.classList.toggle('on', is3d()); }
    N.follow = true; const p = N.pos || myPos(); if (!is3d()) N.mx.focus(N.fx, 0); centerOn(p, is3d() ? Math.max(N.mx.zoom(), 16) : N.mx.zoom(), true);
  }
  function render(root, emb, opt) {
    if (!N.el) {
      N.el = build();
      N.el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; });
      $('#nq', N.el).onclick = () => openSearch();
      $('#nph', N.el).onclick = () => navDlg(appById('maps') || { n: 'GPS', e: '🧭', k: 'gmaps' });
      $('#nmaps', N.el).onclick = () => Maps.switchFrom(N.el);
      $('#nsb', N.el).onclick = () => openSearch();
      $('#nstop', N.el).onclick = stop; $('#nsim', N.el).onclick = simulate;
      $('#nctr', N.el).onclick = () => { N.follow = true; if (N.pos) centerOn(N.pos, N.mx.zoom(), true); };
      $('#nzi', N.el).onclick = () => N.mx.zoomBy(1); $('#nzo', N.el).onclick = () => N.mx.zoomBy(-1); $('#n3d', N.el).onclick = () => { if (!N.mx.can3d) return toast('Este navegador no admite el mapa 3D (sin WebGL): se usa el mapa 2D', 3500); setMode(!is3d()); toast(is3d() ? 'Vista 3D' : 'Vista 2D'); };
      $('#ncmp', N.el).onclick = () => { N.hdg = null; N.mx.resetNorth(); N.follow = false; };
      $('#nmute', N.el).onclick = () => { N.muted = !N.muted; $('#nmute', N.el).textContent = N.muted ? '🔇' : '🔊'; if (N.muted) try { speechSynthesis.cancel(); } catch { } };
      $('#nfav', N.el).onclick = saveFav;
      $('#nrep', N.el).onclick = () => Poi.reportDlg();
      $('#nsty', N.el).onclick = () => { const cur = (N.opt && N.opt.mapstyle) || S.mapStyle || 'auto', nx = STYLE_CYCLE[(STYLE_CYCLE.indexOf(cur) + 1) % STYLE_CYCLE.length]; S.mapStyle = nx; if (N.opt) delete N.opt.mapstyle; save(); applyStyle(); toast('Mapa: ' + STYLE_NAME[nx]); };
      const sync = () => $$('#nlay [data-l]', N.el).forEach(b => b.classList.toggle('on', !!S.layers[b.dataset.l]));
      $$('#nlay [data-l]', N.el).forEach(b => b.onclick = () => { S.layers[b.dataset.l] = !S.layers[b.dataset.l]; save(); sync(); Poi.draw(); Poi.refresh(); });
      sync();
    }
    root.innerHTML = ''; root.append(N.el); N.opt = emb ? (opt || {}) : {}; N.el.classList.toggle('emb', !!emb); N.fx = ({ right: .72, left: .28 })[emb && opt && opt.focus] || .5; N.el.classList.toggle('nosearch', !!emb && !!opt && opt.search === false); N.el.classList.toggle('nolayers', !!emb && !!opt && opt.layers === false); N.el.classList.toggle('tools-on', !!emb && !!opt && String(opt.tools) === 'true'); N.el.classList.toggle('tools-off', !!emb && !!opt && String(opt.tools) === 'false'); initMap(); applyStyle(N.opt); chips(); N.mx.resize(); setTimeout(() => N.mx && N.mx.resize(), 150); const b3 = $('#n3d', N.el); b3.textContent = is3d() ? '3D' : '2D'; b3.classList.toggle('on', is3d()); b3.style.display = N.mx.can3d ? '' : 'none'; $('#ncmp', N.el).style.display = N.mx.can3d ? '' : 'none';
    $('#nph', N.el).style.display = S.teslaMode ? 'none' : '';
  }
  function initMap() {
    if (N.mx) return;
    const p = myPos(), box = $('#navmap', N.el);
    if (typeof MapX === 'undefined' || (typeof L === 'undefined' && typeof maplibregl === 'undefined')) return;
    N.mx = MapX.create(box, { c: p, z: 15, style: (N.opt && N.opt.mapstyle) || S.mapStyle || 'auto' }); N.map = N.mx; N.iconKey = null;
    N.mx.onUser(() => { N.follow = false; });
    N.mx.onMove(() => { if (Date.now() - (Poi.state.lastDraw || 0) > 4000) { Poi.state.lastDraw = Date.now(); Poi.draw(); } });
    N.mx.onRotate(() => { const a = $('.nme', N.el); if (a && N.hd != null) a.style.setProperty('--h', (N.hd - N.mx.bearing()) + 'deg'); const c = $('#ncmp i', N.el); if (c) c.style.transform = `rotate(${-N.mx.bearing()}deg)`; });
    if (window.ResizeObserver) new ResizeObserver(() => N.mx && N.mx.resize()).observe(box);
    applyStyle(); Poi.attach(N.mx);
    if (!N._thm) { N._thm = true; new MutationObserver(() => applyStyle()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); }
  }
  const openSearch = q => { if (typeof Search !== 'undefined') Search.open(q); };

  /* ── Búsqueda ── */
  const search = q => openSearch(q);

  /* ── Ruta ── */
  const ROUTERS = ['https://router.project-osrm.org/route/v1/driving', 'https://routing.openstreetmap.de/routed-car/route/v1/driving'];
  async function fetchRoute(o, d) {
    const errs = [];
    for (const base of ROUTERS) {
      try {
        const j = await getJSON(`${base}/${o[1]},${o[0]};${d.lon},${d.lat}?overview=full&geometries=geojson&steps=true`, 14000);
        if (j.code === 'NoRoute' || (j.routes && !j.routes.length)) { errs.push(new URL(base).host + ': sin ruta'); if (j.code === 'NoRoute') return { none: true }; continue; }
        if (j.routes && j.routes[0]) return { rt: j.routes[0] };
        errs.push(new URL(base).host + ': ' + (j.code || 'respuesta vacía'));
      } catch (e) { errs.push(new URL(base).host + ': ' + (e.name === 'AbortError' ? 'tarda demasiado' : e.message)); }
    }
    return { errs };
  }
  async function routeTo(d, quiet) {
    if (!N.mx) return toast('El mapa aún no está listo: abre la pestaña Mapa y reintenta', 3500);
    const o = GPS.pos ? [GPS.pos.latitude, GPS.pos.longitude] : S.lastPos || (() => { const c = N.mx.center(); toast('Sin GPS: se usa el centro del mapa como origen', 3500); return c; })();
    if (!quiet) toast('Calculando ruta…', 1500);
    const r = await fetchRoute(o, d);
    if (!r.rt) { toast(r.none ? 'No hay ruta por carretera hasta ese lugar' : 'No se pudo calcular la ruta (' + (r.errs || []).join(' · ') + '). Reintenta en unos segundos.', 5000); return false; }
    const rt = r.rt;
    N.route = rt; N.coords = rt.geometry.coordinates.map(c => [c[1], c[0]]); N.steps = rt.legs[0].steps; N.idx = 0; N.dest = d; N.off = 0; N.active = true; N.follow = true;
    N.steps.forEach(s => { s.v1 = s.v2 = false; });
    drawRoute(); if (N.dm) N.dm.remove(); N.dm = N.mx.marker([d.lat, d.lon], '<div class="poi" style="border-color:var(--acc);font-size:21px">🏁</div>', [36, 36]);
    if (!quiet) { N.mx.focus(N.fx, 0); N.mx.fit(N.coords); setTimeout(() => { N.follow = true; }, 4000); S.navRecent = [d, ...(S.navRecent || []).filter(x => x.name !== d.name)].slice(0, 5); save(); chips(); if (typeof Adv !== 'undefined') Adv.logTrip(d); say('Ruta calculada. ' + fmtD(rt.distance) + ' hasta ' + d.name); }
    $('.navtop', N.el).style.display = 'none'; $('#nguide', N.el).hidden = false; $('#nbar', N.el).hidden = false; N.el.classList.add('guiding'); $('#nsim', N.el).hidden = false; update(o);
    return true;
  }
  function stop() {
    N.active = false; clearInterval(N.simT); N.sim = false; N.sum = null; bus.emit('nav'); try { speechSynthesis.cancel(); } catch { }
    N.coords = []; drawRoute(); if (N.dm) { N.dm.remove(); N.dm = null; }
    N.el.classList.remove('guiding'); ['nguide', 'nbar', 'nsim'].forEach(i => $('#' + i, N.el).hidden = true); $('.navtop', N.el).style.display = ''; $('#nchips', N.el).style.display = ''; $('#nsim', N.el).textContent = '🧪 Simular ruta';
  }
  function saveFav() {
    if (!N.dest) return;
    dlg(`<h3>Guardar “${esc(N.dest.name)}”</h3><div class="f"><button class="btn" id="f1">🏠 Casa</button><button class="btn" id="f2">💼 Trabajo</button></div><div class="acts"><button class="btn sec" id="c">Cancelar</button></div>`, d => {
      $('#c', d).onclick = closeDlg; $('#f1', d).onclick = () => { S.favs.home = N.dest; save(); closeDlg(); toast('Guardado como Casa'); }; $('#f2', d).onclick = () => { S.favs.work = N.dest; save(); closeDlg(); toast('Guardado como Trabajo'); };
    });
  }

  /* ── Guía ── */
  function update(p) {
    const st = N.steps, last = st.length - 1; if (!st.length) return;
    while (N.idx < last && dist(p, loc(st[N.idx + 1])) < 35) N.idx++;
    if (N.idx >= last) { arrive(); return; }
    const nx = st[N.idx + 1], dN = dist(p, loc(nx));
    $('#nicon', N.el).textContent = icon(nx); $('#ndist', N.el).textContent = fmtD(dN); $('#ntext', N.el).textContent = instr(nx); N.sum = { icon: icon(nx), dist: fmtD(dN), text: instr(nx) };
    if (dN < 650 && !nx.v1 && st[N.idx].distance > 250) { nx.v1 = true; say(`En ${Math.round(dN / 50) * 50} metros, ${instr(nx).toLowerCase()}`); }
    if (dN < 140 && !nx.v2) { nx.v2 = true; say(instr(nx)); }
    let rem = dN, dur = 0; for (let j = N.idx + 1; j <= last; j++) { rem += st[j].distance; dur += st[j].duration; }
    const cur = st[N.idx]; dur += cur.duration ? dN / (cur.distance / cur.duration || 10) : 0;
    $('#nrem', N.el).textContent = fmtD(rem); const eta = new Date(Date.now() + dur * 1000); $('#neta', N.el).textContent = `${pad2(eta.getHours())}:${pad2(eta.getMinutes())}`; Object.assign(N.sum, { etaMs: eta.getTime(), rem: fmtD(rem), eta: `${pad2(eta.getHours())}:${pad2(eta.getMinutes())}` }); bus.emit('nav');
    const v = Math.round(spdConv(GPS.speed)); $('#nspd', N.el).textContent = v; $('#nspu', N.el).textContent = spdUnit();
    // fuera de ruta
    if (!N.sim) {
      if (distToRoute(p, N.coords) > 70) { if (++N.off >= 3 && Date.now() - N.lastReroute > 15000) { N.lastReroute = Date.now(); N.off = 0; say('Recalculando ruta'); toast('Recalculando…'); routeTo(N.dest, true); } } else N.off = 0;
    }
  }
  function arrive() {
    $('#nicon', N.el).textContent = '🏁'; $('#ndist', N.el).textContent = '¡Llegaste!'; $('#ntext', N.el).textContent = N.dest ? N.dest.name : ''; say('Has llegado a tu destino'); if (typeof Adv !== 'undefined') Adv.arrived(N.dest); N.sum = { icon: '🏁', dist: '¡Llegaste!', text: N.dest ? N.dest.name : '', rem: '0 m', eta: '--:--' }; bus.emit('nav');
    N.active = false; clearInterval(N.simT); setTimeout(() => { if (!N.active) stop(); }, 8000);
  }
  function onPos(c) {
    if (!N.mx) return; const p = [c.latitude, c.longitude], prev = N.pos; N.pos = p; N.me.set(p);
    const kmh = (c.speed || 0) * 3.6;
    let h = c.heading != null && !isNaN(c.heading) && kmh > 3 ? c.heading : (prev && dist(prev, p) > 6 ? (Math.atan2(rad(p[1] - prev[1]) * Math.cos(rad(prev[0])), rad(p[0] - prev[0])) * 180 / Math.PI + 360) % 360 : null);
    if (h != null) { N.hd = h; N.hdg = N.hdg == null ? h : angLerp(N.hdg, h, .5); }
    const a = $('.nme', N.el); if (a && N.hd != null) a.style.setProperty('--h', (N.hd - (is3d() ? (N.follow ? N.hdg : N.mx.bearing()) : 0)) + 'deg');
    if (N.active) {
      update(p);
      if (N.follow) { const v = spdConv(GPS.speed) * (S.speedUnit === 'mph' ? 1.609 : 1); centerOn(p, v < 30 ? 17 : v < 70 ? 16 : 15, true); }
    } else if (N.follow && (page === 'map' || N.fx !== .5) && !N.coords.length) centerOn(p, N.mx.zoom(), is3d());
  }
  function simulate() {
    if (N.sim) { clearInterval(N.simT); N.sim = false; $('#nsim', N.el).textContent = '🧪 Simular ruta'; return; }
    if (!N.coords.length) return; N.sim = true; $('#nsim', N.el).textContent = '⏹ Parar simulación'; N.follow = true;
    let i = 0, f = 0;
    N.simT = setInterval(() => {
      const c = N.coords, a = c[i], b = c[i + 1]; if (!b) { clearInterval(N.simT); return; }
      const seg = dist(a, b) || 1, step = 18; f += step; while (f >= seg && c[i + 2]) { f -= seg; i++; }
      const A = c[i], B = c[i + 1] || A, t = Math.min(1, f / (dist(A, B) || 1)), p = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
      const head = (Math.atan2(rad(B[1] - A[1]) * Math.cos(rad(A[0])), rad(B[0] - A[0])) * 180 / Math.PI + 360) % 360;
      GPS.pos = { latitude: p[0], longitude: p[1], speed: 13, heading: head, accuracy: 5 }; GPS.speed = 13; S.lastPos = p; setGpsDot('on'); bus.emit('pos', GPS.pos); renderSpeedUI();
      if (!c[i + 2] && f >= seg) { clearInterval(N.simT); }
    }, 1000);
  }
  function prefill(q) { go('map'); setTimeout(() => openSearch(q), 150); }
  return { applyStyle: () => applyStyle(), setMode, toggle3d: () => { if (!N.mx) return; if (!N.mx.can3d) return toast('Este navegador no admite el mapa 3D'); setMode(!is3d()); toast(is3d() ? 'Vista 3D' : 'Vista 2D'); }, render, mount: el => render(el, true), onPos, prefill, routeTo, search, state: N, instr, distToLine: distToRoute, summary: () => N.sum };
})();

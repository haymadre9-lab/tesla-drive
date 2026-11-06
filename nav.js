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
      <div class="navtop"><div class="navsearch"><input id="nq" type="search" placeholder="¿A dónde vamos? Dirección, lugar o lat,lon" autocomplete="off"><button class="btn" id="ngo">🔍</button><button class="btn sec" id="nph" title="Abrir en app de GPS del móvil">📲</button></div>
        <div class="navres" id="nres" hidden></div><div class="navchips" id="nchips"></div></div>
      <div class="navguide" id="nguide" hidden><div class="ni" id="nicon">⬆</div><div class="nt"><b id="ndist">—</b><span id="ntext"></span></div></div>
      <div class="navbar" id="nbar" hidden><div><b id="nrem">—</b><small>restante</small></div><div><b id="neta">—</b><small>llegada</small></div><div><b id="nspd">0</b><small id="nspu">km/h</small></div>
        <button class="btn sec" id="nmute">🔊</button><button class="btn sec" id="nctr">🎯</button><button class="btn sec" id="nfav">⭐</button><button class="btn bad" id="nstop">✕ Terminar</button></div>
      <button class="btn sec navsim" id="nsim" hidden>🧪 Simular ruta</button>
      <div class="navlayers" id="nlay"><button data-l="cams" title="Radares fijos">📷</button><button data-l="chargers" title="Cargadores">⚡</button><button data-l="fuel" title="Gasolineras">⛽</button><button data-l="reports" title="Reportes">⚠️</button><button id="nrep" title="Reportar">➕</button></div>
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
  function render(root, emb) {
    if (!N.el) {
      N.el = build();
      N.el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; });
      $('#ngo', N.el).onclick = () => search($('#nq', N.el).value);
      $('#nq', N.el).onkeydown = e => e.key === 'Enter' && search(e.target.value);
      $('#nph', N.el).onclick = () => navDlg(appById('maps') || { n: 'GPS', e: '🧭', k: 'gmaps' });
      $('#nstop', N.el).onclick = stop; $('#nsim', N.el).onclick = simulate;
      $('#nctr', N.el).onclick = () => { N.follow = true; if (N.pos) N.map.setView(N.pos, N.map.getZoom()); };
      $('#nmute', N.el).onclick = () => { N.muted = !N.muted; $('#nmute', N.el).textContent = N.muted ? '🔇' : '🔊'; if (N.muted) try { speechSynthesis.cancel(); } catch { } };
      $('#nfav', N.el).onclick = saveFav;
      $('#nrep', N.el).onclick = () => Poi.reportDlg();
      const sync = () => $$('#nlay [data-l]', N.el).forEach(b => b.classList.toggle('on', !!S.layers[b.dataset.l]));
      $$('#nlay [data-l]', N.el).forEach(b => b.onclick = () => { S.layers[b.dataset.l] = !S.layers[b.dataset.l]; save(); sync(); Poi.draw(); Poi.refresh(); });
      sync();
    }
    root.innerHTML = ''; root.append(N.el); N.el.classList.toggle('emb', !!emb); initMap(); chips(); N.map.invalidateSize(); setTimeout(() => N.map && N.map.invalidateSize(), 150);
    $('#nph', N.el).style.display = S.teslaMode ? 'none' : '';
  }
  function initMap() {
    if (N.map || typeof L === 'undefined') return;
    const p = myPos();
    N.map = L.map('navmap', { zoomControl: false, attributionControl: true, tap: true }).setView(p, 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(N.map);
    L.control.zoom({ position: 'topright' }).addTo(N.map);
    N.me = L.marker(p, { icon: L.divIcon({ className: '', html: '<div class="nme"><i></i></div>', iconSize: [34, 34], iconAnchor: [17, 17] }), zIndexOffset: 1000 }).addTo(N.map);
    N.map.on('dragstart', () => { N.follow = false; });
    N.map.on('moveend', () => { if (Date.now() - (Poi.state.lastDraw || 0) > 4000) { Poi.state.lastDraw = Date.now(); Poi.draw(); } });
    Poi.attach(N.map);
  }

  /* ── Búsqueda ── */
  async function search(q) {
    q = (q || '').trim(); if (!q) return;
    const m = q.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (m) return routeTo({ name: q, lat: +m[1], lon: +m[2] });
    const res = $('#nres', N.el); res.hidden = false; res.innerHTML = '<div class="note">Buscando…</div>';
    try {
      const p = myPos(), v = `${p[1] - .5},${p[0] + .5},${p[1] + .5},${p[0] - .5}`;
      const r = await getJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=es&q=${encodeURIComponent(q)}&viewbox=${v}`);
      if (!r.length) { res.innerHTML = '<div class="note">Sin resultados. Prueba con más detalle (calle, número, ciudad).</div>'; return; }
      res.innerHTML = r.map((x, i) => `<div class="nr" data-i="${i}"><b>${esc(x.name || x.display_name.split(',')[0])}</b><small>${esc(x.display_name.split(',').slice(1, 4).join(','))}</small></div>`).join('');
      $$('.nr', res).forEach(d => d.onclick = () => { const x = r[+d.dataset.i]; res.hidden = true; routeTo({ name: x.name || x.display_name.split(',').slice(0, 2).join(','), lat: +x.lat, lon: +x.lon }); });
    } catch { res.innerHTML = '<div class="note">No se pudo buscar (sin conexión o servidor ocupado). Reintenta.</div>'; }
  }

  /* ── Ruta ── */
  async function routeTo(d, quiet) {
    if (!N.map) return;
    const o = GPS.pos ? [GPS.pos.latitude, GPS.pos.longitude] : S.lastPos || (() => { const c = N.map.getCenter(); toast('Sin GPS: se usa el centro del mapa como origen', 3500); return [c.lat, c.lng]; })();
    if (!quiet) toast('Calculando ruta…', 1500);
    try {
      const j = await getJSON(`https://router.project-osrm.org/route/v1/driving/${o[1]},${o[0]};${d.lon},${d.lat}?overview=full&geometries=geojson&steps=true`);
      const rt = j.routes && j.routes[0]; if (!rt) throw new Error('sin ruta');
      N.route = rt; N.coords = rt.geometry.coordinates.map(c => [c[1], c[0]]); N.steps = rt.legs[0].steps; N.idx = 0; N.dest = d; N.off = 0; N.active = true; N.follow = true;
      N.steps.forEach(s => { s.v1 = s.v2 = false; });
      if (N.line) N.map.removeLayer(N.line); if (N.dm) N.map.removeLayer(N.dm);
      N.line = L.polyline(N.coords, { color: S.accent, weight: 8, opacity: .9 }).addTo(N.map);
      N.dm = L.marker([d.lat, d.lon], { icon: L.divIcon({ className: '', html: '<div class="poi" style="border-color:var(--acc);font-size:21px">🏁</div>', iconSize: [36, 36], iconAnchor: [18, 18] }) }).addTo(N.map);
      if (!quiet) { N.map.fitBounds(N.line.getBounds(), { padding: [60, 60] }); setTimeout(() => { N.follow = true; }, 4000); S.navRecent = [d, ...(S.navRecent || []).filter(x => x.name !== d.name)].slice(0, 5); save(); chips(); say('Ruta calculada. ' + fmtD(rt.distance) + ' hasta ' + d.name); }
      $('#nres', N.el).hidden = true; $('.navtop', N.el).style.display = 'none'; $('#nguide', N.el).hidden = false; $('#nbar', N.el).hidden = false; N.el.classList.add('guiding'); $('#nsim', N.el).hidden = false; update(o);
    } catch (e) { toast('No se pudo calcular la ruta (sin conexión o servidor ocupado)', 3500); }
  }
  function stop() {
    N.active = false; clearInterval(N.simT); N.sim = false; N.sum = null; bus.emit('nav'); try { speechSynthesis.cancel(); } catch { }
    if (N.line) N.map.removeLayer(N.line), N.line = null; if (N.dm) N.map.removeLayer(N.dm), N.dm = null;
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
    $('#nrem', N.el).textContent = fmtD(rem); const eta = new Date(Date.now() + dur * 1000); $('#neta', N.el).textContent = `${pad2(eta.getHours())}:${pad2(eta.getMinutes())}`; Object.assign(N.sum, { rem: fmtD(rem), eta: `${pad2(eta.getHours())}:${pad2(eta.getMinutes())}` }); bus.emit('nav');
    const v = Math.round(spdConv(GPS.speed)); $('#nspd', N.el).textContent = v; $('#nspu', N.el).textContent = spdUnit();
    // fuera de ruta
    if (!N.sim) {
      if (distToRoute(p, N.coords) > 70) { if (++N.off >= 3 && Date.now() - N.lastReroute > 15000) { N.lastReroute = Date.now(); N.off = 0; say('Recalculando ruta'); toast('Recalculando…'); routeTo(N.dest, true); } } else N.off = 0;
    }
  }
  function arrive() {
    $('#nicon', N.el).textContent = '🏁'; $('#ndist', N.el).textContent = '¡Llegaste!'; $('#ntext', N.el).textContent = N.dest ? N.dest.name : ''; say('Has llegado a tu destino'); N.sum = { icon: '🏁', dist: '¡Llegaste!', text: N.dest ? N.dest.name : '', rem: '0 m', eta: '--:--' }; bus.emit('nav');
    N.active = false; clearInterval(N.simT); setTimeout(() => { if (!N.active) stop(); }, 8000);
  }
  function onPos(c) {
    if (!N.map) return; const p = [c.latitude, c.longitude]; N.pos = p; N.me.setLatLng(p);
    const a = $('.nme', N.el); if (a && c.heading != null && !isNaN(c.heading)) a.style.setProperty('--h', c.heading + 'deg');
    if (N.active) {
      update(p);
      if (N.follow) { const v = spdConv(GPS.speed) * (S.speedUnit === 'mph' ? 1.609 : 1); N.map.setView(p, v < 30 ? 17 : v < 70 ? 16 : 15, { animate: false }); }
    } else if (N.follow && page === 'map' && !N.line) N.map.setView(p, N.map.getZoom(), { animate: false });
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
  function prefill(q) { go('map'); setTimeout(() => { const i = $('#nq', N.el); if (i) { i.focus(); if (q) { i.value = q; search(q); } } }, 150); }
  return { render, mount: el => render(el, true), onPos, prefill, routeTo, search, state: N, instr, distToLine: distToRoute, summary: () => N.sum };
})();

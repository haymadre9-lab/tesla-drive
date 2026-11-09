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
      <div class="navhdr"><button class="nsrch" id="nsq" type="button" title="Buscar destino"><svg viewBox="0 0 24 24" width="22" height="22"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg></button><button class="nmore" id="nmore" type="button" title="Ajustes del mapa y funciones"><svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="5" r="2.3" fill="currentColor"/><circle cx="12" cy="12" r="2.3" fill="currentColor"/><circle cx="12" cy="19" r="2.3" fill="currentColor"/></svg></button></div>
      <div class="navmenu" id="nmenu" hidden><div class="nm-t">Funciones del mapa</div><div id="nmbox"></div><button class="btn sec" id="nmset" type="button">Más ajustes del mapa…</button></div>
      <div class="navtools" id="ntools"><button id="nzi" title="Acercar">＋</button><button id="nzo" title="Alejar">－</button><button id="n3d" title="Cambiar entre vista 3D inclinada y mapa 2D">3D</button><button id="ncmp" title="Norte arriba"><i>▲</i></button></div>
      <div class="navguide" id="nguide" hidden><div class="ni" id="nicon">⬆</div><div class="nt"><b id="ndist">—</b><span id="ntext"></span></div></div>
      <div class="navbar" id="nbar" hidden><div><b id="nrem">—</b><small>restante</small></div><div><b id="neta">—</b><small>llegada</small></div><div><b id="nspd">0</b><small id="nspu">km/h</small></div>
        <button class="btn sec" id="nmute">🔊</button><button class="btn sec" id="nctr">🎯</button><button class="btn sec" id="nfav">⭐</button><button class="btn bad" id="nstop">✕ Terminar</button></div>
      <button class="btn sec navsim" id="nsim" hidden>🧪 Simular ruta</button>
      <div class="navlayers" id="nlay"><button data-l="cams" title="Radares fijos">📷</button><button data-l="chargers" title="Cargadores">⚡</button><button data-l="fuel" title="Gasolineras">⛽</button><button data-l="reports" title="Reportes">⚠️</button><button id="nsty" title="Cambiar el estilo del mapa (satélite, oscuro…)">🛰</button><button id="nrep" title="Reportar">➕</button></div>
      <div class="spdbub"><b class="js-spd">0</b><small>${spdUnit()}</small></div><div class="limsign" hidden></div>`;
    return el;
  }
  function chips() { }
  /* Estilo del mapa y del icono del vehículo (de la ventana o, si no, del ajuste general) */
  const shade = (hex, f) => { const v = parseInt((/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#ff2d2d').slice(1), 16), m = c => Math.max(0, Math.min(255, Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f)))); return `rgb(${m(v >> 16)},${m(v >> 8 & 255)},${m(v & 255)})`; };
  let UID = 0;
  const ICONS = { // cada icono recibe el color elegido y devuelve [html, [ancho, alto]] a tamaño 100 %
    arrow: c => { const u = 'ar' + (++UID); return [`<div class="nme arrow"><svg viewBox="-22 -22 44 48" overflow="visible"><defs><linearGradient id="${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(c, .3)}"/><stop offset=".5" stop-color="${shade(c, .3)}"/><stop offset=".5" stop-color="${shade(c, -.22)}"/><stop offset="1" stop-color="${shade(c, -.22)}"/></linearGradient></defs>
      <ellipse cx="0" cy="17" rx="14" ry="4.5" fill="rgba(0,0,0,.38)"/>
      <polygon points="0,-15 -13,13 0,6 13,13" fill="#fff" stroke="#fff" stroke-width="9" stroke-linejoin="round"/>
      <polygon points="0,-15 -13,13 0,6 13,13" fill="url(#${u})" stroke="url(#${u})" stroke-width="5" stroke-linejoin="round"/></svg></div>`, [44, 50]]; },
    dot: c => [`<div class="nme" style="--acc:${c}"><i></i></div>`, [34, 34]],
    chev: c => [`<div class="nme chev"><svg viewBox="-20 -20 40 40"><path d="M0 -17 L13 15 L0 8 L-13 15Z" fill="${c}" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/></svg></div>`, [44, 44]],
    car: () => ['<div class="nme car"><svg viewBox="-20 -34 40 68"><rect x="-14" y="-31" width="28" height="62" rx="12" fill="#eef2f8" stroke="#0b0f17" stroke-width="2"/><rect x="-10" y="-17" width="20" height="13" rx="4" fill="#243247"/><rect x="-10" y="9" width="20" height="9" rx="3" fill="#243247"/><rect x="-17" y="-22" width="4" height="10" rx="2" fill="#0b0f17"/><rect x="13" y="-22" width="4" height="10" rx="2" fill="#0b0f17"/><rect x="-17" y="12" width="4" height="10" rx="2" fill="#0b0f17"/><rect x="13" y="12" width="4" height="10" rx="2" fill="#0b0f17"/></svg></div>', [40, 68]],
  };
  const iconCfg = () => { const o = N.opt || {}; return { k: o.icon || S.navIcon || 'arrow', c: S.navIconColor || '#ff2d2d', z: Math.max(.5, Math.min(2.5, (+S.navIconSize || 100) / 100)) }; };
  const mkMe = (cfg, p) => { const [h, s] = (ICONS[cfg.k] || ICONS.arrow)(cfg.c), w = Math.round(s[0] * cfg.z), hh = Math.round(s[1] * cfg.z), m = N.mx.marker(p, h, [w, hh], { z: 1000 }); const e = m.el && m.el.querySelector('.nme'); if (e) { e.style.width = w + 'px'; e.style.height = hh + 'px'; } return m; };
  function applyStyle(opt) {
    if (!N.mx) return; if (opt) N.opt = opt;
    const o = N.opt || {}, st = o.mapstyle || S.mapStyle || 'auto', cfg = iconCfg(), ic = cfg.k + cfg.c + cfg.z;
    N.mx.style(st); N.el.dataset.ms = st; N.el.dataset.eng = N.mx.kind;
    if (ic !== N.iconKey) { const p = N.pos || myPos(); if (N.me) N.me.remove(); N.me = mkMe(cfg, p); N.iconKey = ic; }
    drawRoute();
  }
  const STYLE_CYCLE = ['auto', 'sat', 'hybrid', 'dark', 'light'], STYLE_NAME = { auto: 'Automático', sat: 'Satélite', hybrid: 'Satélite con calles', dark: 'Oscuro', light: 'Claro' };
  const is3d = () => N.mx && N.mx.can3d && S.map3d !== false; // 3D = inclinado y girando según el rumbo (como Dashla)
  const angLerp = (a, b, t) => { let d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; };
  function centerOn(p, z, anim) { // coloca mi posición en el punto de enfoque (centro, derecha o izquierda; en 3D, abajo)
    const m = N.mx, d3 = is3d(); m.focus(N.fx, d3 ? .26 : 0);
    if (m.kind === 'gl' && F.fix && N.follow) { if (z != null) N.tz = z; return; } // en GL lo mueve el bucle de animación
    if (d3) m.view(p, z == null ? m.zoom() : Math.min(z, 17.4), { anim: !!anim, dur: 900, linear: true, bearing: N.hd == null ? m.bearing() : N.hd, pitch: 58 });
    else m.view(p, z, { anim: !!anim, dur: 700, bearing: 0, pitch: 0 });
  }
  function zoomBtn(d) { if (N.mx.kind === 'gl' && F.fix && N.follow) { N.tzUser = true; N.tz = Math.max(3, Math.min(19, (N.tz == null ? N.mx.zoom() : N.tz) + d)); } else N.mx.zoomBy(d); }
  /* Animación fluida: la posición, el rumbo, la inclinación y el zoom se interpolan a 60 fps entre un GPS y el siguiente
     (el GPS llega ~1 vez por segundo; si se moviera todo a saltos, la flecha iría a trompicones) */
  const F = { fix: null, fixT: 0, v: [0, 0], off: [0, 0], disp: null, cb: null, bb: 0, cp: 0, cz: null, last: 0 };
  const meEl = () => N.me && N.me.el && (N.me._e || (N.me._e = N.me.el.querySelector('.nme')));
  const followCam = () => N.follow && (N.active || ((page === 'map' || N.fx !== .5) && !N.coords.length));
  function frame(t) {
    requestAnimationFrame(frame);
    if (!N.mx || !F.fix || !N.me || document.hidden) { F.last = t; return; }
    const dt = Math.min(.1, Math.max(0, (t - (F.last || t)) / 1000)); F.last = t;
    const age = Math.min(2.5, (Date.now() - F.fixT) / 1000), k = Math.exp(-dt / .6); F.off = [F.off[0] * k, F.off[1] * k];
    F.disp = [F.fix[0] + F.v[0] * age + F.off[0], F.fix[1] + F.v[1] * age + F.off[1]]; N.me.set(F.disp);
    if (N.hd != null) F.cb = F.cb == null ? N.hd : angLerp(F.cb, N.hd, 1 - Math.exp(-dt / .45));
    const m = N.mx;
    if (m.kind === 'gl' && followCam() && N.el.isConnected) {
      const d3 = is3d(), kk = 1 - Math.exp(-dt / .5); m.focus(N.fx, d3 ? .26 : 0);
      const tb = d3 && F.cb != null ? F.cb : 0, tz = N.tz == null ? m.zoom() : N.tz, tp = d3 ? 58 : 0;
      if (N.snap) { F.bb = tb; F.cp = tp; F.cz = tz; N.snap = false; } else { F.bb = angLerp(F.bb, tb, kk); F.cp += (tp - F.cp) * kk; F.cz = F.cz == null ? tz : F.cz + (tz - F.cz) * (1 - Math.exp(-dt / 1.1)); }
      m.view(F.disp, N.tz == null ? tz : F.cz, { bearing: F.bb, pitch: F.cp });
    }
    const e = meEl(); if (e) { if (F.cb != null) e.style.setProperty('--h', (F.cb - m.bearing()) + 'deg'); e.style.setProperty('--tilt', (m.pitch() * .7).toFixed(1) + 'deg'); }
  }
  requestAnimationFrame(frame);
  function drawRoute() { if (!N.mx) return; N.mx.line(N.active || N.coords.length ? N.coords : null, S.accent || '#3e9bff'); }
  function setMode(d3) {
    S.map3d = !!d3; save(); const b = $('#n3d', N.el); if (b) { b.textContent = is3d() ? '3D' : '2D'; b.classList.toggle('on', is3d()); }
    N.follow = true; const p = N.pos || myPos(); if (!is3d()) N.mx.focus(N.fx, 0); centerOn(p, is3d() ? Math.max(N.mx.zoom(), 16) : N.mx.zoom(), true);
  }
  function render(root, emb, opt) {
    if (!N.el) {
      N.el = build();
      N.el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; });
      $('#nsq', N.el).onclick = () => { $('#nmenu', N.el).hidden = true; openSearch(); };
      $('#nmore', N.el).onclick = () => { const m = $('#nmenu', N.el); m.hidden = !m.hidden; if (!m.hidden) { $('#nmbox', N.el).append($('#nlay', N.el)); } };
      $('#nmset', N.el).onclick = () => { $('#nmenu', N.el).hidden = true; go('settings'); setTimeout(() => { const b = $('.cats [data-c=mapa]'); if (b) b.click(); }, 120); };
      N.el.addEventListener('pointerdown', e => { const m = $('#nmenu', N.el); if (!m.hidden && !e.target.closest('#nmenu,#nmore')) m.hidden = true; });
      $('#nstop', N.el).onclick = stop; $('#nsim', N.el).onclick = simulate;
      $('#nctr', N.el).onclick = () => { N.follow = true; N.tzUser = false; if (N.pos) centerOn(N.pos, N.mx.zoom(), true); };
      $('#nzi', N.el).onclick = () => zoomBtn(1); $('#nzo', N.el).onclick = () => zoomBtn(-1); $('#n3d', N.el).onclick = () => { if (!N.mx.can3d) return toast('Este navegador no admite el mapa 3D (sin WebGL): se usa el mapa 2D', 3500); setMode(!is3d()); toast(is3d() ? 'Vista 3D' : 'Vista 2D'); };
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
  }
  function initMap() {
    if (N.mx) return;
    const p = myPos(), box = $('#navmap', N.el);
    if (typeof MapX === 'undefined' || (typeof L === 'undefined' && typeof maplibregl === 'undefined')) return;
    N.mx = MapX.create(box, { c: p, z: 15, style: (N.opt && N.opt.mapstyle) || S.mapStyle || 'auto' }); N.map = N.mx; N.iconKey = null;
    $('#nmbox', N.el).append($('#nlay', N.el));
    N.mx.onUser(() => { N.follow = false; });
    N.mx.onMove(() => { if (Date.now() - (Poi.state.lastDraw || 0) > 4000) { Poi.state.lastDraw = Date.now(); Poi.draw(); } });
    N.mx.onRotate(() => { const c = $('#ncmp i', N.el); if (c) c.style.transform = `rotate(${-N.mx.bearing()}deg)`; });
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
    N.tzUser = false; N.route = rt; N.coords = rt.geometry.coordinates.map(c => [c[1], c[0]]); N.steps = rt.legs[0].steps; N.idx = 0; N.dest = d; N.off = 0; N.active = true; N.follow = true;
    N.steps.forEach(s => { s.v1 = s.v2 = false; });
    drawRoute(); if (N.dm) N.dm.remove(); N.dm = N.mx.marker([d.lat, d.lon], '<div class="poi" style="border-color:var(--acc);font-size:21px">🏁</div>', [36, 36]);
    if (!quiet) { if (!d.link && typeof Link !== 'undefined') Link.publish(d); N.mx.focus(N.fx, 0); N.mx.fit(N.coords); setTimeout(() => { N.follow = true; }, 4000); S.navRecent = [{ name: d.name, lat: d.lat, lon: d.lon, sub: d.sub || '', t: Date.now() }, ...(S.navRecent || []).filter(x => x.name !== d.name && dist([x.lat, x.lon], [d.lat, d.lon]) > 60)].slice(0, 15); save(); chips(); if (typeof Adv !== 'undefined') Adv.logTrip(d); say('Ruta calculada. ' + fmtD(rt.distance) + ' hasta ' + d.name); }
    $('#nguide', N.el).hidden = false; $('#nbar', N.el).hidden = false; N.el.classList.add('guiding'); $('#nsim', N.el).hidden = false; update(o);
    return true;
  }
  function stop() {
    N.active = false; clearInterval(N.simT); N.sim = false; N.sum = null; bus.emit('nav'); try { speechSynthesis.cancel(); } catch { }
    N.coords = []; drawRoute(); if (N.dm) { N.dm.remove(); N.dm = null; }
    N.el.classList.remove('guiding'); ['nguide', 'nbar', 'nsim'].forEach(i => $('#' + i, N.el).hidden = true); $('#nsim', N.el).textContent = '🧪 Simular ruta';
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
    if (!N.mx) return; const p = [c.latitude, c.longitude], prev = N.pos; N.pos = p; const sp = c.speed || 0, kmh = sp * 3.6;
    const h = c.heading != null && !isNaN(c.heading) && kmh > 3 ? c.heading : (prev && dist(prev, p) > 6 ? (Math.atan2(rad(p[1] - prev[1]) * Math.cos(rad(prev[0])), rad(p[0] - prev[0])) * 180 / Math.PI + 360) % 360 : null);
    if (h != null) N.hd = h;
    const hh = rad(N.hd == null ? 0 : N.hd), kl = 111320;
    if (!F.disp || dist(F.disp, p) > 250) { F.disp = p; F.off = [0, 0]; N.snap = true; if (N.hd != null) F.cb = N.hd; } else F.off = [F.disp[0] - p[0], F.disp[1] - p[1]];
    F.fix = p; F.fixT = Date.now(); F.v = sp > 1 && N.hd != null ? [sp * Math.cos(hh) / kl, sp * Math.sin(hh) / (kl * Math.max(.2, Math.cos(rad(p[0]))))] : [0, 0];
    const gl = N.mx.kind === 'gl'; if (!gl) { N.me.set(p); const a = meEl(); if (a && N.hd != null) a.style.setProperty('--h', N.hd + 'deg'); }
    if (N.active) {
      update(p);
      if (N.follow) { const v = spdConv(GPS.speed) * (S.speedUnit === 'mph' ? 1.609 : 1), z = v < 30 ? 17 : v < 70 ? 16 : 15; if (!N.tzUser) N.tz = is3d() ? Math.min(z, 17.4) : z; if (!gl) centerOn(p, z, true); }
    } else if (N.follow && (page === 'map' || N.fx !== .5) && !N.coords.length) { if (!gl) centerOn(p, N.mx.zoom(), false); }
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
  return { applyStyle: () => applyStyle(), openPhone: () => navDlg(appById('maps') || { n: 'GPS', e: '🧭', k: 'gmaps' }), switchMap: () => Maps.switchFrom(N.el), setMode, toggle3d: () => { if (!N.mx) return; if (!N.mx.can3d) return toast('Este navegador no admite el mapa 3D'); setMode(!is3d()); toast(is3d() ? 'Vista 3D' : 'Vista 2D'); }, render, mount: el => render(el, true), onPos, prefill, routeTo, search, state: N, instr, distToLine: distToRoute, summary: () => N.sum };
})();

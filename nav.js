'use strict';
/* Navegación propia (modo Tesla): búsqueda (Nominatim), rutas (OSRM) y guía paso a paso sobre mapa Leaflet/OSM.
   Se carga antes que app.js; usa globals de app.js (S, GPS, bus, toast, $, go…) solo al ejecutarse. */

const IS_TESLA = /Tesla|QtCarBrowser/i.test(navigator.userAgent || '');

const Nav = (() => {
  const N = { map: null, el: null, active: false, route: null, coords: [], steps: [], idx: 0, dest: null, pos: null, follow: true, sim: false, off: 0, muted: false, lastReroute: 0, simT: 0, stops: [], sm: [], ri: 0 };
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
      case 'arrive': return st.stop ? 'Parada: ' + st.stop.name : 'Has llegado a tu destino';
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
  /* ── Iconos de maniobra: recuadro blanco con el dibujo en negro. 3 estilos (Ajustes → Mapa): a = flecha gruesa, b = punta abierta, c = bloque ── */
  const MST = { a: { w: 9, hl: 21, hw: 33, join: 'round', cap: 'butt', rw: 7, rad: 20 }, b: { w: 6.5, hl: 17, hw: 30, join: 'round', cap: 'round', open: true, rw: 5, rad: 14 }, c: { w: 15, hl: 24, hw: 38, join: 'miter', cap: 'butt', rw: 10, rad: 0 } };
  /* esquinas redondeadas: cada vértice se sustituye por una curva (el radio se limita para no pasarse de los tramos) */
  function roundPath(pts, r) {
    const P = p => f1(p[0]) + ' ' + f1(p[1]); if (!r || pts.length < 3) return 'M' + pts.map(P).join(' L');
    let d = 'M' + P(pts[0]);
    for (let i = 1; i < pts.length - 1; i++) { const a = pts[i - 1], v = pts[i], b = pts[i + 1], l1 = Math.hypot(v[0] - a[0], v[1] - a[1]), l2 = Math.hypot(b[0] - v[0], b[1] - v[1]), rr = Math.min(r, l1 * .6, l2 * .6), p1 = [v[0] - (v[0] - a[0]) / l1 * rr, v[1] - (v[1] - a[1]) / l1 * rr], p2 = [v[0] + (b[0] - v[0]) / l2 * rr, v[1] + (b[1] - v[1]) / l2 * rr]; d += ' L' + P(p1) + ' Q' + P(v) + ' ' + P(p2); }
    return d + ' L' + P(pts[pts.length - 1]);
  }
  const f1 = v => Math.round(v * 10) / 10;
  function manArrow(pts, s, k = 1) {
    const q = pts.length, [x1, y1] = pts[q - 2], [x2, y2] = pts[q - 1], L = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L, uy = (y2 - y1) / L, hl = s.hl * k, hw = s.hw * k, bx = x2 - ux * hl, by = y2 - uy * hl, nx = -uy, ny = ux;
    const body = s.open ? pts : pts.slice(0, q - 1).concat([[bx + ux * 2, by + uy * 2]]);
    const line = `<path d="${roundPath(body, (s.rad || 0) * k)}" fill="none" stroke="#000" stroke-width="${s.w * (k < 1 ? .8 : 1)}" stroke-linejoin="${s.join}" stroke-linecap="${s.cap}"/>`;
    const head = s.open ? `<path d="M${f1(bx + nx * hw / 2)} ${f1(by + ny * hw / 2)} L${f1(x2)} ${f1(y2)} L${f1(bx - nx * hw / 2)} ${f1(by - ny * hw / 2)}" fill="none" stroke="#000" stroke-width="${s.w * (k < 1 ? .8 : 1)}" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<polygon points="${f1(x2)},${f1(y2)} ${f1(bx + nx * hw / 2)},${f1(by + ny * hw / 2)} ${f1(bx - nx * hw / 2)},${f1(by - ny * hw / 2)}" fill="#000" stroke="#000" stroke-width="${s.join === 'round' ? 3 : 0}" stroke-linejoin="${s.join}"/>`;
    return line + head;
  }
  const mir = pts => pts.map(p => [64 - p[0], p[1]]);
  const PATHS = { straight: [[32, 58], [32, 10]], right: [[21, 58], [21, 35], [57, 35]], 'slight right': [[23, 58], [23, 43], [50, 15]], 'sharp right': [[15, 58], [15, 15], [52, 52]], uturn: [[46, 58], [46, 23], [21, 23], [21, 51]] };
  function manSvg(type, mod, exit, style) {
    const s = MST[style] || MST.a; let inner;
    if (type === 'arrive') inner = '<rect x="17" y="8" width="5" height="50" rx="2" fill="#000"/><path d="M22 10h32v26H22z" fill="#000"/><g fill="#fff"><rect x="26" y="14" width="7" height="7"/><rect x="40" y="14" width="7" height="7"/><rect x="33" y="21" width="7" height="7"/><rect x="47" y="21" width="7" height="7"/><rect x="26" y="28" width="7" height="7"/><rect x="40" y="28" width="7" height="7"/></g>';
    else if (/roundabout|rotary/.test(type)) {
      const ang = { right: 90, 'slight right': 55, 'sharp right': 135, straight: 0, left: -90, 'slight left': -55, 'sharp left': -135, uturn: 180 }[mod], th = (ang != null ? ang : [90, 0, -90, 180][((exit || 1) - 1) % 4]) * Math.PI / 180, cx = 32, cy = 38, r = 13, sn = Math.sin(th), cs = Math.cos(th);
      inner = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#000" stroke-width="${s.rw}"/><path d="M32 62V${cy + r + 1}" stroke="#000" stroke-width="${s.rw}" stroke-linecap="${s.cap === 'butt' ? 'butt' : 'round'}"/>` +
        manArrow([[cx + (r + 1) * sn, cy - (r + 1) * cs], [cx + (r + 19) * sn, cy - (r + 19) * cs]], s, .62) + (exit ? `<text x="32" y="${cy + 5}" text-anchor="middle" font-size="14" font-weight="800" font-family="Inter,Arial,sans-serif" fill="#000">${exit}</text>` : '');
    } else {
      const left = /left/.test(mod || ''), base = (mod || 'straight').replace('left', 'right'); let pts = PATHS[type === 'uturn' || mod === 'uturn' ? 'uturn' : (/^(straight|right|slight right|sharp right)$/.test(base) ? base : 'straight')];
      if (left) pts = mir(pts); inner = manArrow(pts, s, /uturn/.test(type + mod) ? .85 : /sharp/.test(mod || '') ? .85 : 1);
    }
    return `<svg viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  }
  const manTile = (st, style) => `<span class="mt">${manSvg(st.maneuver.type, st.maneuver.modifier, st.maneuver.exit, style || S.manStyle || 'a')}</span>`;


  function say(txt) {
    if (N.muted || !S.voice || !('speechSynthesis' in window)) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(txt); u.lang = 'es-ES'; speechSynthesis.speak(u); } catch { }
  }
  const getJSON = async (url, ms = 12000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); } };

  /* ── UI ── */
  function build() {
    const el = document.createElement('div'); el.className = 'navwrap';
    el.innerHTML = `<div id="navmap"></div>
      <div class="navhdr"><button class="nlay nnotes" id="nnt" type="button" title="Notas de voz del móvil"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 3h9l4 4v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14.5 3v4.5H19M8 12h8M8 16h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><button class="nlay" id="nsm" title="Estilo del mapa y funciones"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 3l9 5-9 5-9-5z" fill="currentColor"/><path d="M3 12.5l9 5 9-5M3 16.5l9 5 9-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button><button class="nsrch" id="nsq" type="button" title="Buscar destino"><svg viewBox="0 0 24 24" width="22" height="22"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg></button><button class="nmore" id="nmore" type="button" title="Ajustes de la app (mantén pulsado: funciones del mapa)"><svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="5" r="2.3" fill="currentColor"/><circle cx="12" cy="12" r="2.3" fill="currentColor"/><circle cx="12" cy="19" r="2.3" fill="currentColor"/></svg></button></div>
      <div class="navmenu" id="nmenu" hidden><div class="nm-t">Estilo del mapa</div><div class="nm-st" id="nmst"><button type="button" data-s="auto" title="Auto"><svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 3.5a8.5 8.5 0 010 17z" fill="currentColor"/></svg><span>Auto</span></button><button type="button" data-s="light" title="Día"><svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="4.4" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg><span>Día</span></button><button type="button" data-s="dark" title="Noche"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z" fill="currentColor"/></svg><span>Noche</span></button><button type="button" data-s="sat" title="Satélite"><svg viewBox="0 0 24 24" width="24" height="24"><rect x="9.5" y="9.5" width="5" height="5" rx="1" transform="rotate(45 12 12)" fill="currentColor"/><path d="M4.5 8.5l4-4 3 3-4 4zM12.5 16.5l4-4 3 3-4 4z" fill="currentColor"/><path d="M5 19a8 8 0 008-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Satélite</span></button><button type="button" id="nm3d" title="Vista 3D / 2D"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 2.8l8 4.3v9.8l-8 4.3-8-4.3V7.1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M4 7.1l8 4.4 8-4.4M12 11.5v9.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span>3D</span></button></div><div class="nm-t">Funciones del mapa</div><div id="nmbox"></div><button class="btn" id="nmsave" type="button">📍 Guardar mi ubicación</button><button class="btn sec" id="nmplaces" type="button">⭐ Mis lugares…</button><button class="btn sec" id="nmset" type="button">Más ajustes del mapa…</button></div>
      <div class="navtools" id="ntools"><button id="nzi" title="Acercar">＋</button><button id="nzo" title="Alejar">－</button><button id="n3d" title="Cambiar entre vista 3D inclinada y mapa 2D">3D</button><button id="ncmp" title="Norte arriba"><i>▲</i></button></div>
      <div class="navguide" id="nguide" hidden><div class="ni" id="nicon">⬆</div><div class="nt"><b id="ndist">—</b><span id="ntext"></span></div></div>
      <div class="navbar" id="nbar" hidden><span class="nb-s"></span><div class="nb-i"><div><b id="nrem">—</b><small>restante</small></div><div><b id="neta">—</b><small>llegada</small></div><div><b id="nspd">0</b><small id="nspu">km/h</small></div></div>
        <div class="nb-b"><button class="btn sec" id="nmute" aria-label="Voz"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></button><button class="btn sec" id="nctr" aria-label="Centrar"><svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button><button class="btn sec" id="nstops" aria-label="Paradas"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 7.5v5M9.5 10h5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button><button class="btn sec" id="nfav" aria-label="Guardar destino"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.2 6.4 20.3l1.2-6.3L3 9.6l6.3-.8z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg></button><button class="btn bad" id="nstop"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 5L19 19M19 5L5 19" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/></svg> Terminar</button></div></div>
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
    N.mx.style(st); N.el.dataset.ms = st; if (typeof mapDark === 'function') N.lastDark = mapDark(); N.el.dataset.eng = N.mx.kind;
    if (ic !== N.iconKey) { const p = N.pos || myPos(); if (N.me) N.me.remove(); N.me = mkMe(cfg, p); N.iconKey = ic; }
    drawRoute();
  }
  setInterval(() => { if (N.mx && ((N.opt && N.opt.mapstyle) || S.mapStyle || 'auto') === 'auto' && typeof mapDark === 'function' && mapDark() !== N.lastDark) { N.lastDark = mapDark(); applyStyle(); } }, 120000); // al amanecer / anochecer el mapa automático cambia solo
  const MENU_OPEN = () => { const m = $('#nmenu', N.el); m.hidden = !m.hidden; if (!m.hidden) { $('#nmbox', N.el).append($('#nlay', N.el)); markMenu(); } };
  function setStyle(k) { S.mapStyle = k; if (N.opt) delete N.opt.mapstyle; save(); applyStyle(); markMenu(); toast('Mapa: ' + STYLE_NAME[k]); }
  function markMenu() { if (!N.el) return; { const bx = $('#nmbox', N.el), t = bx && bx.previousElementSibling; if (t) t.hidden = N.el.classList.contains('nolayers'); } const cur = (N.opt && N.opt.mapstyle) || S.mapStyle || 'auto'; $$('#nmst [data-s]', N.el).forEach(b => b.classList.toggle('on', b.dataset.s === cur)); const b3 = $('#nm3d', N.el); if (b3) { b3.classList.toggle('on', is3d()); $('span', b3).textContent = N.mx && N.mx.can3d ? (is3d() ? '3D' : '2D') : '2D'; } }
  const STYLE_CYCLE = ['auto', 'sat', 'hybrid', 'dark', 'light'], STYLE_NAME = { auto: 'Automático', sat: 'Satélite', hybrid: 'Satélite con calles', dark: 'Oscuro', light: 'Claro' };
  const is3d = () => N.mx && N.mx.can3d && S.map3d !== false; // 3D = inclinado y girando según el rumbo (como Dashla)
  const angLerp = (a, b, t) => { let d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; };
  function centerOn(p, z, anim) { // coloca mi posición en el punto de enfoque (centro, derecha o izquierda; en 3D, abajo)
    const m = N.mx, d3 = is3d(); m.focus(N.fx, d3 ? .4 : 0);
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
    const age = Math.min(2.5, (Date.now() - F.fixT) / 1000), k = Math.exp(-dt / (N.coords.length ? .6 : 1.2)); F.off = [F.off[0] * k, F.off[1] * k];
    F.disp = [F.fix[0] + F.v[0] * age + F.off[0], F.fix[1] + F.v[1] * age + F.off[1]]; N.me.set(F.disp);
    if (N.hd != null) F.cb = F.cb == null ? N.hd : angLerp(F.cb, N.hd, 1 - Math.exp(-dt / .8));
    const m = N.mx;
    if (m.kind === 'gl' && followCam() && N.el.isConnected) {
      const d3 = is3d(), kk = 1 - Math.exp(-dt / .5); m.focus(N.fx, d3 ? .4 : 0);
      const tb = d3 && F.cb != null ? F.cb : 0, tz = N.tz == null ? m.zoom() : N.tz, tp = d3 ? 58 : 0;
      if (N.snap) { F.bb = tb; F.cp = tp; F.cz = tz; N.snap = false; } else { if (Math.abs(((tb - F.bb + 540) % 360) - 180) > 1.2) F.bb = angLerp(F.bb, tb, 1 - Math.exp(-dt / (d3 ? .9 : .3))); F.cp += (tp - F.cp) * kk; F.cz = F.cz == null ? tz : F.cz + (tz - F.cz) * (1 - Math.exp(-dt / 1.1)); }
      m.view(F.disp, N.tz == null ? tz : F.cz, { bearing: F.bb, pitch: F.cp });
    }
    const e = meEl(); if (e) { if (F.cb != null) { const hv = ((F.cb - m.bearing() + 540) % 360) - 180; if (F.hv == null || Math.abs(hv - F.hv) >= 1.2) { F.hv = hv; e.style.setProperty('--h', hv.toFixed(1) + 'deg'); } } const tl = m.pitch() * .7; if (F.ht == null || Math.abs(tl - F.ht) >= 1) { F.ht = tl; e.style.setProperty('--tilt', tl.toFixed(1) + 'deg'); } }
    if (N.active && N.coords.length && t - (F.lt || 0) > 900) { F.lt = t; N.mx.line(trimmed(), S.accent || '#3e9bff'); }
  }
  requestAnimationFrame(frame);
  function trimmed() { // solo el tramo que falta: desde mi posición hasta el destino (en rutas muy largas, lo lejano se simplifica)
    const c = N.coords; if (!c.length) return null; let a = c.slice(Math.min(N.ri + 1, c.length - 1));
    if (a.length > 2500) { const step = Math.ceil((a.length - 600) / 1900), far = a.slice(600).filter((_, j) => j % step === 0); far.push(c[c.length - 1]); a = a.slice(0, 600).concat(far); }
    if (F.disp && a.length) a.unshift(F.disp); return a;
  }
  function drawRoute() { if (!N.mx) return; N.mx.line(N.active || N.coords.length ? trimmed() : null, S.accent || '#3e9bff'); F.lt = performance.now(); }
  function drawStops() {
    (N.sm || []).forEach(m => m.remove()); N.sm = []; if (!N.mx || !N.coords.length) return;
    (N.stops || []).filter(x => !x.done).forEach((x, i) => N.sm.push(N.mx.marker([x.lat, x.lon], `<div class="poi stopm">${i + 1}</div>`, [34, 34])));
  }
  /* El GPS tiene un error de unos metros que hace «temblar» la flecha: yendo por la ruta, la posición y el rumbo se toman de la propia línea de la ruta */
  function bearingOf(A, B) { return (Math.atan2(rad(B[1] - A[1]) * Math.cos(rad(A[0])), rad(B[0] - A[0])) * 180 / Math.PI + 360) % 360; }
  function snapRoute(p) {
    const c = N.coords; if (c.length < 2) return null; const k = Math.cos(rad(p[0])), m = 111320; let best = null;
    const scan = (a, b) => { for (let i = a; i <= b; i++) {
      const ax = (c[i][1] - p[1]) * k * m, ay = (c[i][0] - p[0]) * m, bx = (c[i + 1][1] - p[1]) * k * m, by = (c[i + 1][0] - p[0]) * m, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      let t = l2 ? -(ax * dx + ay * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(ax + t * dx, ay + t * dy); if (!best || d < best.d) best = { d, i, t }; } };
    scan(Math.max(0, N.ri - 8), Math.min(c.length - 2, N.ri + 120)); if (!best || best.d > 35) scan(0, c.length - 2);
    if (!best || best.d > 35) return null;
    const A = c[best.i], B = c[best.i + 1], pt = [A[0] + (B[0] - A[0]) * best.t, A[1] + (B[1] - A[1]) * best.t]; N.ri = best.i;
    let j = best.i + 1; while (j < c.length - 1 && dist(pt, c[j]) < 12) j++;
    N.rf = best.t; return { pt, d: best.d, brg: bearingOf(pt, c[j]) };
  }
  function setMode(d3) {
    S.map3d = !!d3; save(); markMenu(); const b = $('#n3d', N.el); if (b) { b.textContent = is3d() ? '3D' : '2D'; b.classList.toggle('on', is3d()); }
    N.follow = true; const p = N.pos || myPos(); if (!is3d()) N.mx.focus(N.fx, 0); centerOn(p, is3d() ? Math.max(N.mx.zoom(), 16) : N.mx.zoom(), true);
  }
  function render(root, emb, opt) {
    if (!N.el) {
      N.el = build();
      N.el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; });
      { const b = $('#nsq', N.el); let sx = 0, sy = 0, drag = false, moved = false; b.title = 'Buscar · arrastra hacia abajo para ir a casa'; // arrastrar la lupa hacia abajo = ruta a casa
        const reset = () => { drag = false; b.style.transform = ''; b.classList.remove('gohome'); };
        b.onpointerdown = e => { sx = e.clientX; sy = e.clientY; drag = true; moved = false; try { b.setPointerCapture(e.pointerId); } catch { } };
        b.onpointermove = e => { if (!drag) return; const dy = e.clientY - sy, dx = e.clientX - sx; if (!moved && dy > 10 && dy > Math.abs(dx)) moved = true; if (moved) { b.style.transform = `translateY(${Math.min(90, Math.max(0, dy))}px)`; b.classList.toggle('gohome', dy > 60); } };
        b.onpointerup = e => { if (!drag) return; const dy = e.clientY - sy, was = moved; reset(); if (was) { N.swallow = true; setTimeout(() => { N.swallow = false; }, 350); if (dy > 60) goHome(); } };
        b.onpointercancel = reset;
        b.onclick = () => { if (N.swallow) return; $('#nmenu', N.el).hidden = true; openSearch(); }; }
      $$('#nmst [data-s]', N.el).forEach(b => b.onclick = () => setStyle(b.dataset.s)); $('#nm3d', N.el).onclick = () => { if (!N.mx.can3d) return toast('Este navegador no admite el mapa 3D (sin WebGL): se usa el mapa 2D', 3500); setMode(!is3d()); markMenu(); toast(is3d() ? 'Vista 3D' : 'Vista 2D'); }; $('#nsm', N.el).onclick = MENU_OPEN; $('#nnt', N.el).onclick = () => { if (typeof Notes !== 'undefined') Notes.dialog(); else toast('Notas no disponibles'); }; if (typeof Notes !== 'undefined') Notes.refreshBtn();
      { const mb = $('#nmore', N.el); let lt = 0, long = false; // toque = ajustes de la app · mantener pulsado = funciones rápidas del mapa (capas, estilo, reportar)
        mb.onpointerdown = () => { long = false; clearTimeout(lt); lt = setTimeout(() => { long = true; MENU_OPEN(); navigator.vibrate?.(20); }, 550); };
        mb.onpointerup = mb.onpointerleave = mb.onpointercancel = () => clearTimeout(lt);
        mb.onclick = () => { if (long) { long = false; return; } go('settings'); setTimeout(() => { const b = $('.cats [data-c=mapa]'); if (b) b.click(); }, 120); }; }
      $('#nmsave', N.el).onclick = () => { $('#nmenu', N.el).hidden = true; savePlace(); }; $('#nmplaces', N.el).onclick = () => { $('#nmenu', N.el).hidden = true; placesDlg(); };
      $('#nmset', N.el).onclick = () => { $('#nmenu', N.el).hidden = true; go('settings'); setTimeout(() => { const b = $('.cats [data-c=mapa]'); if (b) b.click(); }, 120); };
      N.el.addEventListener('pointerdown', e => { const m = $('#nmenu', N.el); if (!m.hidden && !e.target.closest('#nmenu,#nmore')) m.hidden = true; });
      $('#nstop', N.el).onclick = stop; $('#nsim', N.el).onclick = simulate;
      $('#nctr', N.el).onclick = () => { N.follow = true; N.tzUser = false; if (N.pos) centerOn(N.pos, N.mx.zoom(), true); };
      $('#nzi', N.el).onclick = () => zoomBtn(1); $('#nzo', N.el).onclick = () => zoomBtn(-1); $('#n3d', N.el).onclick = () => { if (!N.mx.can3d) return toast('Este navegador no admite el mapa 3D (sin WebGL): se usa el mapa 2D', 3500); setMode(!is3d()); toast(is3d() ? 'Vista 3D' : 'Vista 2D'); };
      $('#ncmp', N.el).onclick = () => { N.hdg = null; N.mx.resetNorth(); N.follow = false; };
      $('#nmute', N.el).onclick = () => { N.muted = !N.muted; $('#nmute', N.el).innerHTML = N.muted ? '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>' : '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>'; if (N.muted) try { speechSynthesis.cancel(); } catch { } };
      $('#nfav', N.el).onclick = saveFav; $('#nstops', N.el).onclick = () => stopsDlg();
      $('#nrep', N.el).onclick = () => Poi.reportDlg();
      $('#nsty', N.el).onclick = () => { const cur = (N.opt && N.opt.mapstyle) || S.mapStyle || 'auto', nx = STYLE_CYCLE[(STYLE_CYCLE.indexOf(cur) + 1) % STYLE_CYCLE.length]; S.mapStyle = nx; if (N.opt) delete N.opt.mapstyle; save(); applyStyle(); toast('Mapa: ' + STYLE_NAME[nx]); };
      const sync = () => $$('#nlay [data-l]', N.el).forEach(b => b.classList.toggle('on', !!S.layers[b.dataset.l]));
      $$('#nlay [data-l]', N.el).forEach(b => b.onclick = () => { S.layers[b.dataset.l] = !S.layers[b.dataset.l]; save(); sync(); Poi.draw(); Poi.refresh(); });
      sync();
    }
    root.innerHTML = ''; root.append(N.el); N.opt = emb ? (opt || {}) : {}; N.el.classList.toggle('emb', !!emb); N.fx = ({ right: .72, left: .28 })[emb && opt && opt.focus] || .5; N.el.classList.toggle('nosearch', !!emb && !!opt && opt.search === false); N.el.classList.toggle('nolayers', !!emb && !!opt && opt.layers === false); N.el.classList.toggle('tools-on', !!emb && !!opt && String(opt.tools) === 'true'); N.el.classList.toggle('tools-off', !!emb && !!opt && String(opt.tools) === 'false'); initMap(); applyStyle(N.opt); chips(); N.mx.resize(); setTimeout(() => N.mx && N.mx.resize(), 150); const b3 = $('#n3d', N.el); b3.textContent = is3d() ? '3D' : '2D'; b3.classList.toggle('on', is3d()); b3.style.display = N.mx.can3d ? '' : 'none'; $('#ncmp', N.el).style.display = N.mx.can3d ? '' : 'none'; setTimeout(() => resume(), 300); if (typeof Notes !== 'undefined') Notes.refreshBtn();
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
  async function fetchRoute(o, d, stops) {
    const errs = [];
    for (const base of ROUTERS) {
      try {
        const j = await getJSON(`${base}/${[[o[0], o[1]], ...(stops || []).map(x => [x.lat, x.lon]), [d.lat, d.lon]].map(q => q[1] + ',' + q[0]).join(';')}?overview=full&geometries=geojson&steps=true`, 14000);
        if (j.code === 'NoRoute' || (j.routes && !j.routes.length)) { errs.push(new URL(base).host + ': sin ruta'); if (j.code === 'NoRoute') return { none: true }; continue; }
        if (j.routes && j.routes[0]) return { rt: j.routes[0] };
        errs.push(new URL(base).host + ': ' + (j.code || 'respuesta vacía'));
      } catch (e) { errs.push(new URL(base).host + ': ' + (e.name === 'AbortError' ? 'tarda demasiado' : e.message)); }
    }
    return { errs };
  }
  /* La ruta activa sobrevive a recargas/cierres de pestaña (el navegador del coche descarta pestañas en segundo plano) */
  const saveRoute = d => { S.navRoute = d ? { name: d.name, lat: d.lat, lon: d.lon, stops: (N.stops || []).filter(x => !x.done).map(x => ({ name: x.name, lat: x.lat, lon: x.lon })), t: Date.now() } : null; save(); };
  function maybeRestore() {
    const r = S.navRoute; if (!r || N.active || N.restoring || !N.mx) return; if (Date.now() - r.t > 6 * 3600e3) { saveRoute(null); return; }
    N.restoring = true; N.restoreT = Date.now(); routeTo({ name: r.name, lat: r.lat, lon: r.lon, link: true }, true, r.stops || []).then(ok => { if (ok) toast('Ruta recuperada: ' + r.name, 3000); }).finally(() => { N.restoring = false; });
  }
  /* Al volver al mapa: se redibuja, se recarga la posición y se vuelve a centrar; la ruta se conserva (o se recupera) */
  function resume() {
    if (!N.mx || !N.el || !N.el.isConnected) return;
    N.mx.resize(); try { if (N.mx.map && N.mx.map.triggerRepaint) N.mx.map.triggerRepaint(); } catch { }
    N.follow = true; N.tzUser = false; N.snap = true; F.last = 0;
    if (typeof refreshGPS === 'function') refreshGPS();
    if (!N.active && !N.coords.length) N.tz = is3d() ? 16 : 15.5;
    if (N.pos) centerOn(N.pos, N.tz, false);
    maybeRestore(); if (typeof Poi !== 'undefined') Poi.draw();
  }
  async function routeTo(d, quiet, stops) {
    stops = (stops === undefined ? (quiet ? N.stops : []) : stops).filter(x => !x.done);
    if (!N.mx) return toast('El mapa aún no está listo: abre la pestaña Mapa y reintenta', 3500);
    const o = GPS.pos ? [GPS.pos.latitude, GPS.pos.longitude] : S.lastPos || (() => { const c = N.mx.center(); toast('Sin GPS: se usa el centro del mapa como origen', 3500); return c; })();
    if (!quiet) toast('Calculando ruta…', 1500);
    const r = await fetchRoute(o, d, stops);
    if (!r.rt) { toast(r.none ? 'No hay ruta por carretera hasta ese lugar' : 'No se pudo calcular la ruta (' + (r.errs || []).join(' · ') + '). Reintenta en unos segundos.', 5000); return false; }
    const rt = r.rt;
    N.tzUser = false; N.route = rt; N.coords = rt.geometry.coordinates.map(c => [c[1], c[0]]); N.stops = stops; N.ri = 0; N.rf = 0; N.sn = false; N.steps = rt.legs.flatMap((l, i) => l.steps.map((st, j) => { if (i < rt.legs.length - 1 && j === l.steps.length - 1) st.stop = stops[i]; return st; })); N.idx = 0; N.dest = d; N.off = 0; N.active = true; N.follow = true;
    N.steps.forEach(s => { s.v1 = s.v2 = false; });
    { // metros acumulados a lo largo de la línea y posición de cada maniobra sobre ella: el avance se mide por la ruta, no por «estar a menos de 35 m de la maniobra» (a 100+ km/h el GPS puede saltársela)
      const c = N.coords, cum = [0]; for (let i = 1; i < c.length; i++) cum[i] = cum[i - 1] + dist(c[i - 1], c[i]); N.cum = cum;
      const k = Math.cos(rad(c[0][0])), d2 = (a, b) => { const x = (a[1] - b[1]) * k, y = a[0] - b[0]; return x * x + y * y; }; let pi = 0;
      N.stepAt = N.steps.map(st => { const L = loc(st); let b = pi, bd = Infinity; for (let i = pi; i < c.length; i++) { const d = d2(L, c[i]); if (d < bd) { bd = d; b = i; } else if (bd < 1e-8 && d > bd + 1e-5) break; } pi = b; return b; });
    }
    drawRoute(); if (N.dm) N.dm.remove(); N.dm = N.mx.marker([d.lat, d.lon], '<div class="poi" style="border-color:var(--acc);font-size:21px">🏁</div>', [36, 36]); drawStops();
    if (!quiet) { saveRoute(d); if (!d.link && typeof Link !== 'undefined') Link.publish(d); N.mx.focus(N.fx, 0); N.mx.fit(N.coords); setTimeout(() => { N.follow = true; }, 4000); S.navRecent = [{ name: d.name, lat: d.lat, lon: d.lon, sub: d.sub || '', t: Date.now() }, ...(S.navRecent || []).filter(x => x.name !== d.name && dist([x.lat, x.lon], [d.lat, d.lon]) > 60)].slice(0, 15); save(); chips(); if (typeof Adv !== 'undefined') Adv.logTrip(d); say('Ruta calculada. ' + fmtD(rt.distance) + ' hasta ' + d.name); }
    $('#nguide', N.el).hidden = false; $('#nbar', N.el).hidden = false; N.el.classList.add('guiding'); $('#nsim', N.el).hidden = false; update(o);
    return true;
  }
  function stop() {
    saveRoute(null); N.active = false; clearInterval(N.simT); N.sim = false; N.sum = null; bus.emit('nav'); try { speechSynthesis.cancel(); } catch { }
    N.coords = []; N.stops = []; N.ri = 0; drawRoute(); drawStops(); if (N.dm) { N.dm.remove(); N.dm = null; }
    N.el.classList.remove('guiding'); ['nguide', 'nbar', 'nsim'].forEach(i => $('#' + i, N.el).hidden = true); $('#nsim', N.el).textContent = '🧪 Simular ruta';
  }
  /* ── Paradas ── */
  const mins = x => Math.max(1, Math.round(x / 60)) + ' min';
  const originPt = () => GPS.pos ? [GPS.pos.latitude, GPS.pos.longitude] : S.lastPos || N.pos || N.mx.center();
  async function timeMatrix(pts) { // tiempos de conducción reales entre todos los puntos (OSRM); si no responde, estimación en línea recta a 45 km/h
    const cs = pts.map(q => q[1].toFixed(6) + ',' + q[0].toFixed(6)).join(';');
    for (const b of ROUTERS) { try { const j = await getJSON(`${b.replace('/route/v1/', '/table/v1/')}/${cs}?annotations=duration`, 14000); if (j && j.code === 'Ok' && j.durations) return { m: j.durations, real: true }; } catch { } }
    return { m: pts.map(a => pts.map(b => dist(a, b) / 12.5)), real: false };
  }
  const cost = (m, ord) => { let t = 0, cur = 0; ord.forEach(i => { t += m[cur][i + 1]; cur = i + 1; }); return t + m[cur][m.length - 1]; };
  function bestOrder(m, n) { // origen → paradas → destino fijo; exacto hasta 8 paradas, vecino más próximo si hay más
    const idx = [...Array(n).keys()]; if (n < 2) return idx; let best = null, bc = Infinity;
    if (n <= 8) { const perm = (a, k) => { if (k === a.length) { const c = cost(m, a); if (c < bc) { bc = c; best = a.slice(); } return; } for (let i = k; i < a.length; i++) { [a[k], a[i]] = [a[i], a[k]]; perm(a, k + 1); [a[k], a[i]] = [a[i], a[k]]; } }; perm(idx, 0); return best; }
    const left = new Set(idx), out = []; let cur = 0; while (left.size) { let bi = -1, bd = Infinity; left.forEach(i => { if (m[cur][i + 1] < bd) { bd = m[cur][i + 1]; bi = i; } }); out.push(bi); left.delete(bi); cur = bi + 1; } return out;
  }
  async function aiOrder(stops, m, extra) {
    const n = stops.length, mm = m.map(r => r.map(x => Math.round(x / 60)));
    const sys = 'Eres un planificador de rutas por carretera. Responde SOLO con JSON: {"orden":[números de parada en el orden recomendado],"motivo":"una frase en español"}.';
    const usr = `Paradas intermedias:\n${stops.map((x, i) => `${i + 1}: ${x.name}`).join('\n')}\nDestino final (fijo): ${N.dest.name}\nMatriz de minutos de conducción entre puntos (fila→columna; 0 = origen, 1..${n} = paradas, ${n + 1} = destino): ${JSON.stringify(mm)}\nCondiciones del conductor: ${extra || 'ninguna, solo minimizar el tiempo total'}.\nElige el orden de las paradas 1..${n}, cada una exactamente una vez.`;
    const txt = await AI.call(sys, usr, { json: true }), j = JSON.parse((txt.match(/\{[\s\S]*\}/) || [''])[0]), o = (j.orden || []).map(x => +x - 1);
    if (o.length !== n || new Set(o).size !== n || o.some(x => !(x >= 0 && x < n))) throw Object.assign(new Error('orden'), { msg: 'La IA no devolvió un orden válido' });
    return { order: o, why: String(j.motivo || '') };
  }
  function addStop(d) {
    if (!N.active || !N.dest) return toast('Primero elige un destino; luego puedes añadir paradas', 3500);
    const list = (N.stops || []).filter(x => !x.done).concat([{ name: d.name, lat: d.lat, lon: d.lon }]);
    routeTo(N.dest, true, list).then(ok => { if (ok) { saveRoute(N.dest); toast(`Parada añadida: ${d.name} (${list.length} en total)`, 3500); } });
  }
  function stopsDlg(draft, info) {
    if (!N.active || !N.dest) return toast('Primero elige un destino; luego puedes añadir paradas', 3500);
    const D = draft || (N.stops || []).filter(x => !x.done).map(x => ({ name: x.name, lat: x.lat, lon: x.lon }));
    const ai = typeof AI !== 'undefined' && AI.ready();
    const rows = D.map((x, i) => `<div class="stp"><b class="stn">${i + 1}</b><span class="stt">${esc(x.name)}</span><button type="button" class="stb" data-u="${i}" ${i ? '' : 'disabled'} aria-label="Subir">▲</button><button type="button" class="stb" data-d="${i}" ${i < D.length - 1 ? '' : 'disabled'} aria-label="Bajar">▼</button><button type="button" class="stb" data-x="${i}" aria-label="Quitar">✕</button></div>`).join('');
    dlg(`<h3>Paradas de la ruta</h3><div class="note">Orden de paso: de arriba abajo, y al final el destino.</div>${rows || '<div class="note">Todavía no hay paradas.</div>'}<div class="stp fin"><b class="stn">🏁</b><span class="stt">${esc(N.dest.name)}</span></div>
      <div class="f"><button class="btn sec" id="stadd" type="button">＋ Añadir parada</button>${D.length > 1 ? '<button class="btn sec" id="stbest" type="button">⚡ Orden más rápido</button>' : ''}</div>
      ${ai && D.length > 1 ? '<label class="lab">Condiciones para la IA (opcional)<input class="in" id="stcond" placeholder="Ej.: la gasolinera antes que el restaurante"></label><div class="f"><button class="btn sec" id="stai" type="button">🤖 Preguntar a la IA</button></div>' : ''}
      <div class="note" id="stinfo">${info || (D.length > 1 ? '«Orden más rápido» calcula con tiempos de conducción reales. La IA recibe los nombres de las paradas y esos tiempos (no tu posición).' : '')}</div>
      <div class="acts"><button class="btn sec" id="stc" type="button">Cancelar</button><button class="btn" id="sto" type="button">Aplicar ruta</button></div>`, d => {
      const again = (inf) => stopsDlg(D, inf);
      $$('[data-u]', d).forEach(b => b.onclick = () => { const i = +b.dataset.u; [D[i - 1], D[i]] = [D[i], D[i - 1]]; again(); });
      $$('[data-d]', d).forEach(b => b.onclick = () => { const i = +b.dataset.d; [D[i + 1], D[i]] = [D[i], D[i + 1]]; again(); });
      $$('[data-x]', d).forEach(b => b.onclick = () => { D.splice(+b.dataset.x, 1); again(); });
      $('#stc', d).onclick = closeDlg;
      $('#stadd', d).onclick = () => { closeDlg(); if (typeof Search === 'undefined') return; Search.open('', p => { if (p) D.push({ name: p.name, lat: p.lat, lon: p.lon }); stopsDlg(D); }); };
      const run = async (useAI) => {
        const info2 = $('#stinfo', d); info2.textContent = useAI ? 'Preguntando a la IA…' : 'Calculando tiempos…';
        try {
          const o = originPt(), pts = [o, ...D.map(x => [x.lat, x.lon]), [N.dest.lat, N.dest.lon]], t = await timeMatrix(pts), now = cost(t.m, D.map((_, i) => i));
          let res; if (useAI) res = await aiOrder(D, t.m, $('#stcond', d) && $('#stcond', d).value.trim()); else res = { order: bestOrder(t.m, D.length) };
          const after = cost(t.m, res.order), nd = res.order.map(i => D[i]); D.splice(0, D.length, ...nd);
          const dif = Math.round((now - after) / 60), est = t.real ? '' : ' (estimación en línea recta: sin conexión con el servidor de rutas)';
          again(`${useAI ? '🤖 ' : '⚡ '}${res.why ? res.why + ' · ' : ''}Tiempo de conducción estimado: ${mins(after)}${dif > 0 ? ` · ${dif} min menos que antes` : dif < 0 ? ` · ${-dif} min más que antes (por tus condiciones)` : ' · ya era el mejor orden'}.${est}`);
        } catch (e) { info2.textContent = useAI ? AI.explain(e) : 'No se pudo calcular: ' + e.message; }
      };
      const bb = $('#stbest', d); if (bb) bb.onclick = () => run(false); const ba = $('#stai', d); if (ba) ba.onclick = () => run(true);
      $('#sto', d).onclick = async () => { closeDlg(); const ok = await routeTo(N.dest, true, D); if (ok) { saveRoute(N.dest); N.mx.fit(N.coords); toast(D.length ? `Ruta con ${D.length} parada${D.length > 1 ? 's' : ''}` : 'Ruta sin paradas', 3000); } };
    });
  }
  /* ── Mis lugares: guardar la ubicación actual, ponerle nombre, corregirla o borrarla. Solo se guardan en este dispositivo ── */
  const PL = () => (S.places = S.places || []);
  const myPlacePos = () => GPS.pos ? [GPS.pos.latitude, GPS.pos.longitude] : S.lastPos || null;
  async function hereName(p) { // nombre sugerido: la calle donde estás (si hay conexión)
    try { const c = new AbortController(), t = setTimeout(() => c.abort(), 4000), r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=es&lat=${p[0]}&lon=${p[1]}`, { signal: c.signal }); clearTimeout(t); const j = await r.json(), a = j.address || {}; return j.name || (a.road ? a.road + (a.house_number ? ' ' + a.house_number : '') : ''); } catch { return ''; }
  }
  function savePlace() {
    const p = myPlacePos(); if (!p) return toast('Aún no hay posición GPS: espera a que el punto de arriba se ponga verde', 4500);
    const t = new Date(), def = `Lugar ${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
    dlg(`<h3>📍 Guardar mi ubicación</h3><div class="note">Se guarda solo en este dispositivo: no se sube a GitHub ni se sincroniza.</div><label class="lab">Nombre<input class="in" id="plname" value="${esc(def)}" autocomplete="off"></label>
      <div class="f"><button class="btn" id="plok" type="button">⭐ Guardar en Mis lugares</button><button class="btn sec" id="plh" type="button">🏠 Guardar como Casa</button><button class="btn sec" id="plw" type="button">💼 Guardar como Trabajo</button></div><div class="acts"><button class="btn sec" id="plx" type="button">Cancelar</button></div>`, d => {
      const inp = $('#plname', d); hereName(p).then(n => { if (n && inp.value === def) inp.value = n; });
      const val = () => inp.value.trim() || def;
      inp.onkeydown = e => { if (e.key === 'Enter') { $('#plok', d).click(); } };
      $('#plx', d).onclick = closeDlg;
      $('#plok', d).onclick = () => { PL().unshift({ id: 'p' + Date.now(), name: val(), lat: p[0], lon: p[1], t: Date.now() }); save(); closeDlg(); toast('Guardado: ' + val(), 3000); };
      $('#plh', d).onclick = () => { S.favs.home = { name: val(), lat: p[0], lon: p[1] }; save(); closeDlg(); toast('Guardado como Casa', 3000); };
      $('#plw', d).onclick = () => { S.favs.work = { name: val(), lat: p[0], lon: p[1] }; save(); closeDlg(); toast('Guardado como Trabajo', 3000); };
    });
  }
  function editPlace(kind, id) { // kind: 'place' | 'home' | 'work'
    const obj = kind === 'place' ? PL().find(x => x.id === id) : S.favs[kind]; if (!obj) return;
    const title = kind === 'home' ? '🏠 Casa' : kind === 'work' ? '💼 Trabajo' : '⭐ Lugar guardado';
    dlg(`<h3>${title}</h3><label class="lab">Nombre<input class="in" id="pen" value="${esc(obj.name)}" autocomplete="off"></label>
      <div class="adv-ask"><label class="lab" style="flex:1">Latitud<input class="in" id="pea" inputmode="decimal" value="${(+obj.lat).toFixed(6)}"></label><label class="lab" style="flex:1">Longitud<input class="in" id="peo" inputmode="decimal" value="${(+obj.lon).toFixed(6)}"></label></div>
      <div class="f"><button class="btn sec" id="pem" type="button">📍 Poner aquí mi ubicación actual</button><button class="btn" id="peg" type="button">🧭 Ir ahí</button>${kind === 'place' ? '<button class="btn sec" id="peh" type="button">🏠 Usar como Casa</button><button class="btn sec" id="pew" type="button">💼 Usar como Trabajo</button>' : ''}</div>
      <div id="pemsg" class="note"></div><div class="acts"><button class="btn bad" id="ped" type="button">🗑 Borrar</button><button class="btn sec" id="pex" type="button">Cerrar</button><button class="btn" id="pes" type="button">Guardar</button></div>`, d => {
      const msg = t => { $('#pemsg', d).textContent = t; };
      const read = () => { const la = parseFloat(String($('#pea', d).value).replace(',', '.')), lo = parseFloat(String($('#peo', d).value).replace(',', '.')); if (!(Math.abs(la) <= 90) || !(Math.abs(lo) <= 180) || isNaN(la) || isNaN(lo)) { msg('Coordenadas no válidas (latitud entre −90 y 90, longitud entre −180 y 180)'); return null; } return { name: $('#pen', d).value.trim() || obj.name, lat: la, lon: lo }; };
      $('#pex', d).onclick = closeDlg;
      $('#pem', d).onclick = () => { const p = myPlacePos(); if (!p) return msg('Aún no hay posición GPS'); $('#pea', d).value = p[0].toFixed(6); $('#peo', d).value = p[1].toFixed(6); msg('Ubicación actual puesta: pulsa «Guardar» para confirmarla'); };
      $('#pes', d).onclick = () => { const v = read(); if (!v) return; Object.assign(obj, v); save(); closeDlg(); toast('Guardado', 2500); };
      $('#peg', d).onclick = () => { const v = read(); if (!v) return; closeDlg(); routeTo({ name: v.name, lat: v.lat, lon: v.lon, sub: 'Mi lugar' }); };
      const h = $('#peh', d), w = $('#pew', d); if (h) h.onclick = () => { const v = read(); if (!v) return; S.favs.home = v; save(); closeDlg(); toast('Casa actualizada', 2500); }; if (w) w.onclick = () => { const v = read(); if (!v) return; S.favs.work = v; save(); closeDlg(); toast('Trabajo actualizado', 2500); };
      $('#ped', d).onclick = () => { if (!confirm('¿Borrar «' + obj.name + '»?')) return; if (kind === 'place') S.places = PL().filter(x => x.id !== id); else delete S.favs[kind]; save(); closeDlg(); toast('Borrado', 2500); };
    });
  }
  function placesDlg() {
    const me = myPlacePos(), dd = x => me ? `<small>${fmtD(dist(me, [x.lat, x.lon]))}</small>` : '';
    const row = (ico, x, attr) => `<div class="plr" ${attr}><span class="ple">${ico}</span><div class="plt"><b>${esc(x.name)}</b>${dd(x)}</div><button type="button" class="stb" data-ed aria-label="Editar">✎</button></div>`;
    const f = S.favs || {};
    dlg(`<h3>⭐ Mis lugares</h3><div class="note">Toca uno para ir. El lápiz sirve para cambiar el nombre o la posición, o para borrarlo.</div>
      ${f.home ? row('🏠', f.home, 'data-k="home"') : ''}${f.work ? row('💼', f.work, 'data-k="work"') : ''}${PL().map(x => row('⭐', x, `data-k="place" data-i="${esc(x.id)}"`)).join('')}${!f.home && !f.work && !PL().length ? '<div class="note">Todavía no hay lugares guardados.</div>' : ''}
      <div class="f"><button class="btn" id="plsv" type="button">📍 Guardar mi ubicación actual</button></div><div class="acts"><button class="btn sec" id="plc" type="button">Cerrar</button></div>`, d => {
      $('#plc', d).onclick = closeDlg; $('#plsv', d).onclick = () => { closeDlg(); savePlace(); };
      $$('.plr', d).forEach(r => { const k = r.dataset.k, id = r.dataset.i, obj = k === 'place' ? PL().find(x => x.id === id) : S.favs[k];
        r.onclick = e => { if (e.target.closest('[data-ed]')) { closeDlg(); editPlace(k, id); return; } closeDlg(); routeTo({ name: obj.name, lat: obj.lat, lon: obj.lon, sub: 'Mi lugar' }); }; });
    });
  }
  function goHome() {
    const h = S.favs && S.favs.home; if (!h) return toast('Casa sin definir: haz una ruta a tu casa y pulsa ⭐ → «Casa»', 5000);
    toast('🏠 Ruta a casa…', 2000); routeTo({ name: h.name, lat: h.lat, lon: h.lon, sub: h.sub || '' });
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
    const onR = N.sn && N.cum && N.stepAt && N.cum.length > N.ri + 1, prog = onR ? N.cum[N.ri] + N.rf * (N.cum[N.ri + 1] - N.cum[N.ri]) : 0, tot = N.cum ? N.cum[N.cum.length - 1] : 0;
    while (N.idx < last && (dist(p, loc(st[N.idx + 1])) < 35 || (onR && prog >= N.cum[N.stepAt[N.idx + 1]] - 5))) { N.idx++; const sp = st[N.idx].stop; if (sp && !sp.done) { sp.done = true; say('Parada: ' + sp.name); toast('📍 Parada: ' + sp.name, 3500); drawStops(); saveRoute(N.dest); } }
    if (N.idx >= last || (onR && tot - prog < 25 && N.stops.every(x => x.done))) { arrive(); return; }
    const nx = st[N.idx + 1], dN = onR ? Math.max(0, N.cum[N.stepAt[N.idx + 1]] - prog) : dist(p, loc(nx));
    $('#nicon', N.el).innerHTML = manTile(nx); $('#ndist', N.el).textContent = fmtD(dN); $('#ntext', N.el).textContent = instr(nx); N.sum = { icon: icon(nx), dist: fmtD(dN), text: instr(nx) };
    if (dN < 650 && !nx.v1 && st[N.idx].distance > 250) { nx.v1 = true; say(`En ${Math.round(dN / 50) * 50} metros, ${instr(nx).toLowerCase()}`); }
    if (dN < 140 && !nx.v2) { nx.v2 = true; say(instr(nx)); }
    let rem = dN, dur = 0; for (let j = N.idx + 1; j <= last; j++) { rem += st[j].distance; dur += st[j].duration; }
    const cur = st[N.idx]; dur += cur.duration ? dN / (cur.distance / cur.duration || 10) : 0;
    if (onR) { rem = Math.max(0, tot - prog); dur = N.route && N.route.distance ? rem * (N.route.duration / N.route.distance) : dur; }
    $('#nrem', N.el).textContent = fmtD(rem); const eta = new Date(Date.now() + dur * 1000); $('#neta', N.el).textContent = `${pad2(eta.getHours())}:${pad2(eta.getMinutes())}`; Object.assign(N.sum, { etaMs: eta.getTime(), rem: fmtD(rem), eta: `${pad2(eta.getHours())}:${pad2(eta.getMinutes())}` }); bus.emit('nav');
    const v = Math.round(spdConv(GPS.speed)); $('#nspd', N.el).textContent = v; $('#nspu', N.el).textContent = spdUnit();
    // fuera de ruta
    if (!N.sim) {
      if (distToRoute(p, N.coords) > 70) { if (++N.off >= 3 && Date.now() - N.lastReroute > 15000) { N.lastReroute = Date.now(); N.off = 0; say('Recalculando ruta'); toast('Recalculando…'); routeTo(N.dest, true); } } else N.off = 0;
    }
  }
  function arrive() {
    $('#nicon', N.el).innerHTML = manTile({ maneuver: { type: 'arrive' } }); $('#ndist', N.el).textContent = '¡Llegaste!'; $('#ntext', N.el).textContent = N.dest ? N.dest.name : ''; say('Has llegado a tu destino'); if (typeof Adv !== 'undefined') Adv.arrived(N.dest); N.sum = { icon: '🏁', dist: '¡Llegaste!', text: N.dest ? N.dest.name : '', rem: '0 m', eta: '--:--' }; bus.emit('nav');
    N.active = false; clearInterval(N.simT); setTimeout(() => { if (!N.active) stop(); }, 8000);
  }
  function onPos(c) {
    if (!N.mx) return; if (S.navRoute && !N.active && !N.restoring && Date.now() - (N.restoreT || 0) > 20000) maybeRestore();
    const p = [c.latitude, c.longitude], prev = N.pos; N.pos = p; const sp = c.speed || 0, kmh = sp * 3.6;
    let h = c.heading != null && !isNaN(c.heading) && kmh > 6 ? c.heading : null;
    const sn = N.active && N.coords.length ? snapRoute(p) : null, q = sn ? sn.pt : p; N.sn = !!sn; if (sn && kmh > 3) h = sn.brg;
    if (h == null) { // sin rumbo del GPS: se calcula desde un punto de referencia a ≥ 10 m (se mueve con el coche)
      if (!N.anchor) N.anchor = p; else { const da = dist(N.anchor, p); if (da >= 10 && (c.speed == null || sp > .8)) { h = (Math.atan2(rad(p[1] - N.anchor[1]) * Math.cos(rad(N.anchor[0])), rad(p[0] - N.anchor[0])) * 180 / Math.PI + 360) % 360; N.anchor = p; } else if (da > 60) N.anchor = p; }
    } else N.anchor = p;
    if (h != null && (N.hd == null || Math.abs(((h - N.hd + 540) % 360) - 180) > 3.5)) N.hd = h; // banda muerta: ignora el temblor del rumbo del GPS
    const hh = rad(N.hd == null ? 0 : N.hd), kl = 111320;
    if (F.fix && c.speed != null && sp < .8 && dist(F.fix, p) < Math.max(8, (c.accuracy || 0))) { N.pos = F.fix; return; } // parado: el GPS «baila» unos metros; no se mueve ni se gira nada
    if (!F.disp || dist(F.disp, q) > 250) { F.disp = q; F.off = [0, 0]; N.snap = true; if (N.hd != null) F.cb = N.hd; } else F.off = [F.disp[0] - q[0], F.disp[1] - q[1]];
    F.fix = q; F.fixT = Date.now(); F.v = sp > 1 && N.hd != null ? [sp * Math.cos(hh) / kl, sp * Math.sin(hh) / (kl * Math.max(.2, Math.cos(rad(p[0]))))] : [0, 0];
    const gl = N.mx.kind === 'gl'; if (!gl) { N.me.set(q); const a = meEl(); if (a && N.hd != null) a.style.setProperty('--h', N.hd + 'deg'); }
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
  return { setStyle, cycleStyle: () => { const cur = (N.opt && N.opt.mapstyle) || S.mapStyle || 'auto'; setStyle(STYLE_CYCLE[(STYLE_CYCLE.indexOf(cur) + 1) % STYLE_CYCLE.length]); }, resume, refreshMan: () => { if (N.active && N.pos) update(N.pos); }, manSvg, applyStyle: () => applyStyle(), openPhone: () => navDlg(appById('maps') || { n: 'GPS', e: '🧭', k: 'gmaps' }), switchMap: () => Maps.switchFrom(N.el), setMode, toggle3d: () => { if (!N.mx) return; if (!N.mx.can3d) return toast('Este navegador no admite el mapa 3D'); setMode(!is3d()); toast(is3d() ? 'Vista 3D' : 'Vista 2D'); }, render, mount: el => render(el, true), onPos, prefill, routeTo, search, addStop, stopsDlg, goHome, savePlace, editPlace, placesDlg, state: N, instr, distToLine: distToRoute, summary: () => N.sum };
})();

'use strict';
/* Información de la carretera en tiempo real: señales que vienen (semáforos, stop, ceda el paso, resaltos, pasos a nivel,
   pasos de peatones), radares, nombre y límite de la vía, temperatura y lluvia. Datos abiertos de OpenStreetMap.
   Y los widgets del dashboard «Tres ventanas»: reloj de carretera, tarjeta de giro, música, barra superior e inferior. */

const Road = (() => {
  const R = { cache: new Map(), ahead: [], next: null, fetched: null, busy: false, said: {}, name: '', status: '', retry: 0 };
  const KEY = 'leco.road';
  try { JSON.parse(localStorage.getItem(KEY) || '[]').forEach(([id, lat, lon, t]) => R.cache.set(id, { id, lat, lon, t })); } catch { }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify([...R.cache.values()].slice(-4000).map(n => [n.id, n.lat, n.lon, n.t]))); } catch { } };
  const rad = x => x * Math.PI / 180;
  const dist = (a, b) => { const r = 6371000, dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]), x = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2; return 2 * r * Math.asin(Math.sqrt(x)); };
  const bearing = (a, b) => (Math.atan2(Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0])), Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]))) * 180 / Math.PI + 360) % 360;
  const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const TYPES = { signal: { i: '🚦', n: 'Semáforo', c: 'amber', say: 'Semáforo' }, stop: { i: '🛑', n: 'STOP', c: 'red', say: 'Stop' }, yield: { i: '🔻', n: 'Ceda el paso', c: 'blue', say: 'Ceda el paso' }, bump: { i: '🚧', n: 'Resalto', c: 'amber', say: 'Resalto' }, rail: { i: '🚆', n: 'Paso a nivel', c: 'red', say: 'Paso a nivel' }, ped: { i: '🚸', n: 'Paso de peatones', c: 'blue', say: 'Paso de peatones' }, psignal: { i: '🚸', n: 'Semáforo peatonal', c: 'blue', say: 'Semáforo peatonal' }, radar: { i: '📷', n: 'Radar', c: 'red', say: 'Radar' } };
  /* Señales dibujadas con SVG (se ven igual en cualquier navegador, sin depender de emojis) */
  function sign(t, max) {
    switch (t) {
      case 'signal': return '<svg viewBox="0 0 64 64"><rect x="18" y="3" width="28" height="58" rx="8" fill="#14181f" stroke="#5b6678" stroke-width="2.5"/><circle cx="32" cy="17" r="7" fill="#ff3b30"/><circle cx="32" cy="32" r="7" fill="#ffb020"/><circle cx="32" cy="47" r="7" fill="#32d74b"/></svg>';
      case 'stop': return '<svg viewBox="0 0 64 64"><path d="M21 3h22l18 18v22L43 61H21L3 43V21z" fill="#d71920" stroke="#fff" stroke-width="3.5"/><text x="32" y="39" text-anchor="middle" font-size="17" font-weight="800" fill="#fff" font-family="Inter,Arial,sans-serif">STOP</text></svg>';
      case 'yield': return '<svg viewBox="0 0 64 64"><path d="M32 58 L5 12 H59Z" fill="#fff" stroke="#d71920" stroke-width="7" stroke-linejoin="round"/></svg>';
      case 'bump': return '<svg viewBox="0 0 64 64"><path d="M32 4 L60 54 H4Z" fill="#fff" stroke="#d71920" stroke-width="6" stroke-linejoin="round"/><path d="M14 46 Q32 24 50 46Z" fill="#111"/></svg>';
      case 'rail': return '<svg viewBox="0 0 64 64"><path d="M32 4 L60 54 H4Z" fill="#fff" stroke="#d71920" stroke-width="6" stroke-linejoin="round"/><path d="M20 22 L44 46 M44 22 L20 46" stroke="#111" stroke-width="6" stroke-linecap="round"/></svg>';
      case 'ped': case 'psignal': return '<svg viewBox="0 0 64 64"><rect x="5" y="5" width="54" height="54" rx="8" fill="#1f6fe0" stroke="#fff" stroke-width="3"/><path d="M32 12 L52 48 H12Z" fill="#fff"/><circle cx="32" cy="27" r="3.6" fill="#1f6fe0"/><path d="M32 31 V41 M26 44 L32 41 L38 44" stroke="#1f6fe0" stroke-width="3.2" stroke-linecap="round" fill="none"/></svg>';
      case 'radar': return `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="#fff" stroke="#d71920" stroke-width="7"/>${max ? `<text x="32" y="40" text-anchor="middle" font-size="${max > 99 ? 20 : 24}" font-weight="800" fill="#111" font-family="Inter,Arial,sans-serif">${max}</text>` : '<rect x="15" y="24" width="34" height="19" rx="4" fill="#111"/><circle cx="32" cy="33" r="6" fill="#fff"/><rect x="24" y="19" width="12" height="6" rx="2" fill="#111"/>'}</svg>`;
    }
    return '<svg viewBox="0 0 64 64"><path d="M6 52 L26 12 H38 L58 52 H46 L32 22 L18 52Z" fill="#5b6678"/></svg>';
  }
  const fm = m => m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m / 10) * 10 + ' m';
  function classify(t) { if (t.highway === 'traffic_signals' || t.crossing === 'traffic_signals') return 'signal'; if (t.highway === 'stop') return 'stop'; if (t.highway === 'give_way') return 'yield'; if (t.traffic_calming) return 'bump'; if (t.railway === 'level_crossing') return 'rail'; if (t.highway === 'crossing') return 'ped'; return null; }

  async function fetchArea(p) {
    if (R.busy || Date.now() < R.retry || (R.fetched && dist(R.fetched, p) < 500)) return; R.busy = true; R.status = 'busy'; bus.emit('road');
    const a = `(around:1100,${p[0]},${p[1]})`, add = j => (j.elements || []).forEach(e => { const t = classify(e.tags || {}); if (t && e.lat != null) R.cache.set('n' + e.id, { id: 'n' + e.id, lat: e.lat, lon: e.lon, t }); });
    try {
      add(await Poi.ovp(`[out:json][timeout:20];(node${a}["highway"~"^(traffic_signals|stop|give_way)$"];node${a}["railway"="level_crossing"];);out body qt 1500;`)); R.fetched = p; R.status = 'ok'; persist(); bus.emit('road');
      try { add(await Poi.ovp(`[out:json][timeout:20];(node${a}["highway"="crossing"];node${a}["traffic_calming"];);out body qt 1500;`)); persist(); } catch { } // pasos de peatones y resaltos: secundario
    } catch { R.status = 'fail'; R.retry = Date.now() + 20000; }
    R.busy = false; bus.emit('road');
  }
  /* Lo que viene por delante, en mi dirección y en mi vía (con ruta activa: en la ruta) */
  function compute(p, h) {
    const route = Nav.state.active && Nav.state.coords && Nav.state.coords.length > 1 ? Nav.state.coords : null, way = Poi.state.way && Poi.state.way.geom && Poi.state.way.geom.length > 1 ? Poi.state.way.geom : null, out = [];
    const pool = typeof Data !== 'undefined' ? [...R.cache.values(), ...Data.near('sig', p, 520)] : [...R.cache.values()];
    for (const n of pool) {
      const d = dist(p, [n.lat, n.lon]); if (d > 500 || d < 8) continue;
      if (n.dir != null && h != null && angDiff(h, n.dir) > 70) continue;
      if (h != null && angDiff(bearing(p, [n.lat, n.lon]), h) > 28) continue;
      if (n.t === 'signal') { if (route && Nav.distToLine([n.lat, n.lon], route) > 30) continue; }
      else { const ln = route || way; if (ln) { if (Nav.distToLine([n.lat, n.lon], ln) > (route ? 18 : 12)) continue; } else if (h == null || d > 150 || angDiff(bearing(p, [n.lat, n.lon]), h) > 12) continue; } // STOP, cedas… solo si están en mi vía (sin datos de la vía: solo si están justo delante)
      out.push({ type: n.t, d, id: n.id, lat: n.lat, lon: n.lon });
    }
    if (S.radarAlerts !== false) Poi.camsNear(p, 600).forEach(c => { const d = dist(p, [c.lat, c.lon]); if (d < 8 || !Poi.onMyRoad(p, h, c)) return; out.push({ type: 'radar', d, id: c.id, max: c.max, lat: c.lat, lon: c.lon, label: Poi.RADL[c.k] }); });
    out.sort((a, b) => a.d - b.d);
    return out.filter((x, i) => !out.slice(0, i).some(y => y.type === x.type && dist([x.lat, x.lon], [y.lat, y.lon]) < 25)).slice(0, 6);
  }
  function speak(t) { if (!S.roadVoice || !('speechSynthesis' in window)) return; try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'es-ES'; speechSynthesis.speak(u); } catch { } }
  function onPos(c) {
    const p = [c.latitude, c.longitude], h = Poi.state.heading, moving = (c.speed || 0) > 1.5 || (typeof Nav !== 'undefined' && Nav.state.sim);
    fetchArea(p); R.name = (Poi.state.way && (Poi.state.way.name || Poi.state.way.ref)) || '';
    R.ahead = moving ? compute(p, h) : []; R.next = R.ahead[0] || null;
    if (R.next && R.next.type !== 'radar' && R.next.type !== 'ped' && R.next.type !== 'psignal' && R.next.type !== 'bump') { const th = R.next.type === 'signal' ? 160 : 120; if (R.next.d < th && !R.said[R.next.id]) { R.said[R.next.id] = Date.now(); speak(`${TYPES[R.next.type].say} en ${Math.round(R.next.d / 10) * 10} metros`); } }
    for (const k of Object.keys(R.said)) if (Date.now() - R.said[k] > 120000) delete R.said[k];
    bus.emit('road');
  }

  /* ── Tiempo para el reloj: temperatura y lluvia en las próximas horas ── */
  function weather() {
    const d = WX && WX.data; if (!d) return null; const t = d.current && d.current.temperature_2m;
    let rain = null; try { const i = d.hourly.time.indexOf(d.current.time.slice(0, 13) + ':00'); if (i >= 0) rain = Math.max(...d.hourly.precipitation_probability.slice(i, i + 3)); } catch { }
    return { t, rain };
  }

  /* ── Widgets ── */
  const lvl = x => x ? TYPES[x.type].c : '';
  WIDGETS.roadgauge = {
    n: 'Reloj de carretera (señales, límite, radares, tiempo)', cls: 'w-2x2', render: el => {
      el.classList.add('rgw'); el.innerHTML = `<div class="rg"><svg viewBox="-100 -100 200 200"><circle r="94" class="rg-ring"/><path d="M0 -94 A94 94 0 1 1 -0.01 -94" class="rg-prog" pathLength="100" stroke-dasharray="0 100"/></svg>
        <div class="rg-in"><div class="rg-ic js-rg-ic">${sign('')}</div><div class="rg-d js-rg-d">Vía libre</div><div class="rg-n js-rg-n">Sin señales cerca</div><div class="rg-x js-rg-x"></div><div class="rg-w"><span class="js-rg-t">--</span><span class="js-rg-r">☔ --</span></div></div></div>`;
      rgUpd(); Poi.renderLimit();
    },
  };
  function rgUpd() {
    const n = R.next, w = weather();
    $$('.rg').forEach(g => {
      g.dataset.lvl = lvl(n); $('.js-rg-ic', g).innerHTML = sign(n ? n.type : '', n && n.max); $('.js-rg-x', g).innerHTML = R.ahead.slice(1, 4).map(x => `<span>${sign(x.type, x.max)}<b>${fm(x.d)}</b></span>`).join(''); $('.js-rg-d', g).textContent = n ? fm(n.d) : 'Vía libre';
      $('.js-rg-n', g).textContent = n ? (n.label || TYPES[n.type].n) + (n.type === 'radar' && n.max ? ' · ' + n.max : '') : (R.status === 'fail' ? 'Sin datos de señales · reintentando' : R.status === 'busy' && !R.cache.size ? 'Cargando señales…' : (R.name || 'Sin señales cerca'));
      $('.rg-prog', g).setAttribute('stroke-dasharray', `${n ? Math.max(4, (1 - Math.min(n.d, 500) / 500) * 100).toFixed(0) : 0} 100`);
      $('.js-rg-t', g).textContent = w && w.t != null ? '🌡 ' + tmp(w.t) : '🌡 --'; $('.js-rg-r', g).textContent = w && w.rain != null ? '☔ ' + w.rain + '%' : '☔ --';
      g.classList.toggle('rain', !!(w && w.rain >= 50));
    });
  }
  bus.on('road', rgUpd);

  WIDGETS.navcard = { n: 'Tarjeta del próximo giro', cls: 'w-1x1', render: el => { el.classList.add('ncw'); ncUpd(); el.onclick = () => (Nav.summary() || typeof Search === 'undefined') ? go('map') : Search.open(); } };
  function ncUpd() { const s = Nav.summary(); $$('.ncw').forEach(e => { e.innerHTML = s ? `<div class="nc"><div class="nc-i">${esc(s.icon)}</div><div class="nc-t"><b>${esc(s.dist)}</b><span>${esc(s.text)}</span></div></div>` : '<div class="nc idle"><div class="nc-i">🧭</div><div class="nc-t"><b>Sin ruta</b><span>Toca para ir a…</span></div></div>'; }); }
  bus.on('nav', ncUpd);

  WIDGETS.nowplaying = { n: 'Música sonando', cls: 'w-1x1', render: el => { el.classList.add('npw'); npUpd(); } };
  function npUpd() {
    const box = $$('.npw'); if (!box.length) return; const rs = typeof Stream !== 'undefined' && Stream.RAD.st && !Stream.RAD.a.paused ? Stream.RAD.st : null, tr = Mus.list[Mus.i];
    const title = rs ? rs.n : tr ? tr.title : 'Sin música', sub = rs ? 'Radio' : tr ? (tr.artist || 'Reproduciendo') : 'Toca para elegir', playing = rs ? true : !audio.paused && !!tr, logo = rs && rs.logo;
    box.forEach(e => { e.innerHTML = `<div class="np"><div class="np-a">${logo ? `<img src="${esc(logo)}" alt="" onerror="this.remove()">` : (rs ? '📻' : '🎵')}</div><div class="np-t"><b>${esc(title)}</b><span>${esc(sub)}</span></div><button class="np-b" type="button">${playing ? '⏸' : '▶'}</button></div>`; $('.np-b', e).onclick = ev => { ev.stopPropagation(); if (rs) { Stream.RAD.a.paused ? Stream.RAD.a.play() : Stream.RAD.a.pause(); } else togglePlay(); setTimeout(npUpd, 300); }; e.onclick = ev => { if (!ev.target.closest('button')) go('music'); }; });
  }
  bus.on('music', npUpd); setInterval(npUpd, 2000);

  WIDGETS.topbar = {
    n: 'Barra superior (hora, temperatura, conexión)', cls: 'w-2x1', render: el => {
      el.classList.add('tbw'); el.innerHTML = `<div class="tb"><span class="tb-t"><b class="js-clock">--:--</b><i class="js-tbtemp">--</i></span><span class="tb-c"><i class="tb-dot"></i><span class="js-tbc">Conectado</span></span><button class="tb-g" type="button" title="Ajustes">⚙</button></div>`;
      $('.tb-g', el).onclick = () => go('settings'); tbUpd(); tickClock();
    },
  };
  function tbUpd() { const w = weather(); $$('.js-tbtemp').forEach(e => { e.textContent = w && w.t != null ? tmp(w.t) : ''; }); $$('.js-tbc').forEach(e => { const on = navigator.onLine, g = GPS.status === 'on'; e.textContent = on ? (g ? 'Conectado · GPS' : 'Conectado · sin GPS') : 'Sin conexión'; e.parentNode.dataset.ok = on && g ? '1' : on ? '2' : '0'; }); }
  setInterval(tbUpd, 3000); bus.on('pos', tbUpd);

  WIDGETS.roadbar = {
    n: 'Barra inferior (vía actual y viaje)', cls: 'w-2x1', render: el => { el.classList.add('rbw'); rbUpd(); },
  };
  function rbUpd() { const mi = S.speedUnit === 'mph', d = mi ? S.trip / 1609.34 : S.trip / 1000; $$('.rbw').forEach(e => { e.innerHTML = `<div class="rb"><span class="rb-r">🚗 <b>${esc(R.name || 'Vía sin identificar')}</b></span><span class="rb-o"><i>VIAJE</i> ${d.toFixed(1)} ${mi ? 'mi' : 'km'}</span></div>`; }); }
  bus.on('road', rbUpd); bus.on('pos', rbUpd);

  WIDGETS.scrim = {
    n: 'Degradado (para fundir el mapa con los relojes)', cls: 'w-2x2', noPointer: true, opts: [
      { k: 'side', l: 'Lado oscuro', type: 'select', o: [['left', 'Izquierda'], ['right', 'Derecha'], ['top', 'Arriba'], ['bottom', 'Abajo'], ['all', 'Viñeta (todos los bordes)']], d: 'left' },
      { k: 'strength', l: 'Intensidad', type: 'range', min: 20, max: 100, step: 5, d: 85 }],
    render: el => {
      const o = Object.assign({ side: 'left', strength: 85 }, el.wopt || {}), a = o.strength / 100, dir = { left: '90deg', right: '270deg', top: '180deg', bottom: '0deg' }[o.side];
      el.classList.add('scrimw'); el.innerHTML = '';
      el.style.background = o.side === 'all' ? `radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,${(a * .8).toFixed(2)}) 100%)` : `linear-gradient(${dir}, rgba(0,0,0,${a}) 0%, rgba(0,0,0,${(a * .62).toFixed(2)}) 40%, rgba(0,0,0,${(a * .2).toFixed(2)}) 75%, rgba(0,0,0,0) 100%)`;
    },
  };
  OPT.mapStyle = [['auto', 'Automático (según día/noche)'], ['dark', 'Oscuro'], ['light', 'Claro'], ['sat', 'Satélite'], ['hybrid', 'Satélite con calles y nombres']]; OPT.navIcon = [['arrow', 'Flecha roja 3D'], ['dot', 'Punto con flecha'], ['chev', 'Flecha plana'], ['car', 'Coche visto desde arriba']];
  CATS.mapa[1].unshift({ k: 'mapStyle', l: 'Estilo del mapa integrado', d: 'El satélite usa imágenes de Esri: necesita conexión y puede consumir más datos', type: 'select' }, { k: 'navIcon', l: 'Icono de mi vehículo en el mapa', type: 'select' }, { k: 'poiSize', l: 'Tamaño de los iconos del mapa (radares, cargadores…) %', d: 'Entre 30 % y 160 %. Más pequeños dejan ver más mapa', type: 'range', min: 30, max: 160, step: 10 }, { k: 'navIconColor', l: 'Color de la flecha / icono', type: 'color' }, { k: 'navIconSize', l: 'Tamaño de la flecha (%)', d: 'Entre 50 % y 250 %', type: 'range', min: 50, max: 250, step: 10 });
  CATS.mapa[1].push({ k: 'limitEst', l: 'Estimar el límite de velocidad si la vía no lo indica', d: 'Usa valores genéricos por tipo de vía (residencial 30, carretera 90, autovía 120…) y lo marca con borde discontinuo', type: 'toggle' }, { k: 'roadVoice', l: 'Avisos por voz de señales (stop, ceda, semáforo)', d: 'Se anuncian a unos 100–150 m. Datos de OpenStreetMap: no hay información del estado de los semáforos', type: 'toggle' });
  return { state: R, TYPES, compute, onPos };
})();

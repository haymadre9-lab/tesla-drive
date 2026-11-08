'use strict';
/* Información de la carretera en tiempo real: señales que vienen (semáforos, stop, ceda el paso, resaltos, pasos a nivel,
   pasos de peatones), radares, nombre y límite de la vía, temperatura y lluvia. Datos abiertos de OpenStreetMap.
   Y los widgets del dashboard «Tres ventanas»: reloj de carretera, tarjeta de giro, música, barra superior e inferior. */

const Road = (() => {
  const R = { cache: new Map(), ahead: [], next: null, fetched: null, busy: false, said: {}, name: '' };
  const KEY = 'leco.road';
  try { JSON.parse(localStorage.getItem(KEY) || '[]').forEach(([id, lat, lon, t]) => R.cache.set(id, { id, lat, lon, t })); } catch { }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify([...R.cache.values()].slice(-4000).map(n => [n.id, n.lat, n.lon, n.t]))); } catch { } };
  const rad = x => x * Math.PI / 180;
  const dist = (a, b) => { const r = 6371000, dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]), x = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2; return 2 * r * Math.asin(Math.sqrt(x)); };
  const bearing = (a, b) => (Math.atan2(Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0])), Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]))) * 180 / Math.PI + 360) % 360;
  const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const TYPES = { signal: { i: '🚦', n: 'Semáforo', c: 'amber', say: 'Semáforo' }, stop: { i: '🛑', n: 'STOP', c: 'red', say: 'Stop' }, yield: { i: '🔻', n: 'Ceda el paso', c: 'blue', say: 'Ceda el paso' }, bump: { i: '🚧', n: 'Resalto', c: 'amber', say: 'Resalto' }, rail: { i: '🚆', n: 'Paso a nivel', c: 'red', say: 'Paso a nivel' }, ped: { i: '🚸', n: 'Paso de peatones', c: 'blue', say: 'Paso de peatones' }, radar: { i: '📷', n: 'Radar', c: 'red', say: 'Radar' } };
  const fm = m => m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m / 10) * 10 + ' m';
  function classify(t) { if (t.highway === 'traffic_signals' || t.crossing === 'traffic_signals') return 'signal'; if (t.highway === 'stop') return 'stop'; if (t.highway === 'give_way') return 'yield'; if (t.traffic_calming) return 'bump'; if (t.railway === 'level_crossing') return 'rail'; if (t.highway === 'crossing') return 'ped'; return null; }

  async function fetchArea(p) {
    if (R.busy || (R.fetched && dist(R.fetched, p) < 700)) return; R.busy = true;
    const a = `(around:1500,${p[0]},${p[1]})`;
    try {
      const j = await Poi.ovp(`[out:json][timeout:25];(node${a}["highway"~"^(traffic_signals|stop|give_way)$"];node${a}["highway"="crossing"];node${a}["traffic_calming"];node${a}["railway"="level_crossing"];);out body 2500;`);
      (j.elements || []).forEach(e => { const t = classify(e.tags || {}); if (t && e.lat != null) R.cache.set('n' + e.id, { id: 'n' + e.id, lat: e.lat, lon: e.lon, t }); });
      R.fetched = p; persist();
    } catch { }
    R.busy = false;
  }
  /* Lo que viene por delante, en mi dirección y en mi vía (con ruta activa: en la ruta) */
  function compute(p, h) {
    const route = Nav.state.active && Nav.state.coords && Nav.state.coords.length > 1 ? Nav.state.coords : null, way = Poi.state.way && Poi.state.way.geom && Poi.state.way.geom.length > 1 ? Poi.state.way.geom : null, out = [];
    for (const n of R.cache.values()) {
      const d = dist(p, [n.lat, n.lon]); if (d > 500 || d < 8) continue;
      if (h != null && angDiff(bearing(p, [n.lat, n.lon]), h) > 28) continue;
      if (n.t === 'signal') { if (route && Nav.distToLine([n.lat, n.lon], route) > 30) continue; }
      else { const ln = route || way; if (!ln) continue; if (Nav.distToLine([n.lat, n.lon], ln) > (route ? 18 : 12)) continue; } // STOP, cedas… solo si están en mi vía
      out.push({ type: n.t, d, id: n.id, lat: n.lat, lon: n.lon });
    }
    if (S.radarAlerts !== false) (Poi.state.cams || []).forEach(c => { const d = dist(p, [c.lat, c.lon]); if (d > 600 || d < 8 || (h != null && angDiff(bearing(p, [c.lat, c.lon]), h) > 28)) return; out.push({ type: 'radar', d, id: 'c' + c.id, max: c.max, lat: c.lat, lon: c.lon }); });
    out.sort((a, b) => a.d - b.d);
    return out.filter((x, i) => !out.slice(0, i).some(y => y.type === x.type && dist([x.lat, x.lon], [y.lat, y.lon]) < 25)).slice(0, 6);
  }
  function speak(t) { if (!S.roadVoice || !('speechSynthesis' in window)) return; try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'es-ES'; speechSynthesis.speak(u); } catch { } }
  function onPos(c) {
    const p = [c.latitude, c.longitude], h = Poi.state.heading, moving = (c.speed || 0) > 1.5 || (typeof Nav !== 'undefined' && Nav.state.sim);
    fetchArea(p); R.name = (Poi.state.way && (Poi.state.way.name || Poi.state.way.ref)) || '';
    R.ahead = moving ? compute(p, h) : []; R.next = R.ahead[0] || null;
    if (R.next && R.next.type !== 'radar' && R.next.type !== 'ped' && R.next.type !== 'bump') { const th = R.next.type === 'signal' ? 160 : 120; if (R.next.d < th && !R.said[R.next.id]) { R.said[R.next.id] = Date.now(); speak(`${TYPES[R.next.type].say} en ${Math.round(R.next.d / 10) * 10} metros`); } }
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
        <div class="rg-in"><div class="limchip rg-lim"></div><div class="rg-ic js-rg-ic">🛣️</div><div class="rg-d js-rg-d">Vía libre</div><div class="rg-n js-rg-n">Sin señales cerca</div><div class="rg-w"><span class="js-rg-t">--</span><span class="js-rg-r">☔ --</span></div></div></div>`;
      rgUpd(); Poi.renderLimit();
    },
  };
  function rgUpd() {
    const n = R.next, w = weather();
    $$('.rg').forEach(g => {
      g.dataset.lvl = lvl(n); $('.js-rg-ic', g).textContent = n ? TYPES[n.type].i : '🛣️'; $('.js-rg-d', g).textContent = n ? fm(n.d) : 'Vía libre';
      $('.js-rg-n', g).textContent = n ? TYPES[n.type].n + (n.type === 'radar' && n.max ? ' · ' + n.max : '') : (R.name || 'Sin señales cerca');
      $('.rg-prog', g).setAttribute('stroke-dasharray', `${n ? Math.max(4, (1 - Math.min(n.d, 500) / 500) * 100).toFixed(0) : 0} 100`);
      $('.js-rg-t', g).textContent = w && w.t != null ? '🌡 ' + tmp(w.t) : '🌡 --'; $('.js-rg-r', g).textContent = w && w.rain != null ? '☔ ' + w.rain + '%' : '☔ --';
      g.classList.toggle('rain', !!(w && w.rain >= 50));
    });
  }
  bus.on('road', rgUpd);

  WIDGETS.navcard = { n: 'Tarjeta del próximo giro', cls: 'w-1x1', render: el => { el.classList.add('ncw'); ncUpd(); el.onclick = () => go('map'); } };
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
  CATS.mapa[1].push({ k: 'roadVoice', l: 'Avisos por voz de señales (stop, ceda, semáforo)', d: 'Se anuncian a unos 100–150 m. Datos de OpenStreetMap: no hay información del estado de los semáforos', type: 'toggle' });
  return { state: R, TYPES, compute, onPos };
})();

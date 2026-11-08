'use strict';
/* Capa "estilo Waze" con datos abiertos de OpenStreetMap (Overpass):
   radares fijos con aviso, límite de velocidad de la vía, cargadores, gasolineras y reportes locales.
   Los datos se cachean en el dispositivo. No hay avisos de controles móviles de policía. */

const Poi = (() => {
  const P = { cams: [], chargers: [], fuel: [], limit: null, limitPos: null, limitT: 0, limitBusy: false, fetched: {}, fbusy: {}, need: {}, map: null, groups: {}, said: {}, prev: null, heading: null, lastDraw: 0 };
  const OVP = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  const KEY = 'leco.poi', CAP = { cams: 2500, chargers: 900, fuel: 900 };
  const rad = x => x * Math.PI / 180;
  const dist = (a, b) => { const R = 6371000, dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]); const x = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  const bearing = (a, b) => (Math.atan2(Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0])), Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]))) * 180 / Math.PI + 360) % 360;
  const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const REP = { accident: ['💥', 'Accidente'], hazard: ['⚠️', 'Peligro en la vía'], stopped: ['🚗', 'Vehículo parado'], pothole: ['🕳️', 'Bache'], jam: ['🐌', 'Retención'] };
  const HOUR3 = 3 * 3600e3;

  function speak(t) { if (!S.voice || !('speechSynthesis' in window)) return; try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'es-ES'; speechSynthesis.speak(u); } catch { } }
  async function ovp(q) {
    for (const u of OVP) {
      try { const c = new AbortController(), t = setTimeout(() => c.abort(), 22000); const r = await fetch(u, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: c.signal }); clearTimeout(t); if (r.ok) return await r.json(); } catch { }
    }
    throw new Error('overpass');
  }
  function merge(kind, items) {
    const m = new Map(P[kind].map(x => [x.id, x])); items.forEach(x => m.set(x.id, x));
    P[kind] = [...m.values()].slice(-CAP[kind]);
  }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify({ cams: P.cams, chargers: P.chargers, fuel: P.fuel })); } catch { } };
  function parseMax(v) {
    if (!v) return null; const m = String(v).match(/^(\d{1,3})\s*(mph)?$/); if (m) return m[2] ? Math.round(+m[1] * 1.609 / 5) * 5 : +m[1];
    if (/urban$/.test(v)) return 50; if (/living_street$/.test(v)) return 20; return null;
  }
  const QUERY = {
    cams: b => `[out:json][timeout:25];(node["highway"="speed_camera"](${b});node["enforcement"~"^(maxspeed|average_speed|traffic_signals)$"](${b}););out body 800;`,
    chargers: b => `[out:json][timeout:25];node["amenity"="charging_station"](${b});out body 500;`,
    fuel: b => `[out:json][timeout:25];node["amenity"="fuel"](${b});out body 400;`,
  };
  const MAP = {
    cams: e => ({ id: e.id, lat: e.lat, lon: e.lon, max: parseMax(e.tags?.maxspeed), type: e.tags?.enforcement || 'maxspeed' }),
    chargers: e => { const t = e.tags || {}, n = t.name || t.brand || t.operator || 'Cargador'; return { id: e.id, lat: e.lat, lon: e.lon, name: n, op: t.operator || t.brand || '', tesla: /tesla/i.test((t.operator || '') + (t.brand || '') + (t.name || '')), cap: t.capacity || '' }; },
    fuel: e => ({ id: e.id, lat: e.lat, lon: e.lon, name: e.tags?.name || e.tags?.brand || 'Gasolinera', op: e.tags?.brand || '' }),
  };
  const wanted = k => k === 'cams' ? (S.radarAlerts || S.layers.cams) : (S.layers[k] || P.need[k]);

  async function refresh(force) {
    const p = GPS.pos ? [GPS.pos.latitude, GPS.pos.longitude] : S.lastPos; if (!p) return;
    for (const k of ['cams', 'chargers', 'fuel']) {
      if (!wanted(k) || P.fbusy[k]) continue;
      const f = P.fetched[k]; if (!force && f && dist(f, p) < 3000) continue;
      P.fbusy[k] = true;
      const b = `${p[0] - .06},${p[1] - .09},${p[0] + .06},${p[1] + .09}`;
      try { const j = await ovp(QUERY[k](b)); merge(k, (j.elements || []).filter(e => e.lat != null).map(MAP[k])); P.fetched[k] = p; persist(); draw(); bus.emit('poi'); }
      catch { if (force) toast('Sin conexión con el servidor de mapas: se usan datos guardados'); }
      P.fbusy[k] = false;
    }
  }

  /* ── Límite de velocidad ── */
  async function updateLimit(p) {
    const now = Date.now(); if (P.limitBusy || now - P.limitT < 8000) return; if (P.limitPos && dist(p, P.limitPos) < 50) return;
    P.limitBusy = true; P.limitT = now;
    try {
      const j = await ovp(`[out:json][timeout:10];way(around:30,${p[0]},${p[1]})[highway][maxspeed];out geom 4;`);
      let best = null, bd = 1e9;
      for (const w of j.elements || []) { const m = parseMax(w.tags?.maxspeed); if (!m || !w.geometry) continue; const d = Nav.distToLine(p, w.geometry.map(g => [g.lat, g.lon])); if (d < bd) { bd = d; best = m; } }
      P.limit = best; P.limitPos = p;
    } catch { }
    P.limitBusy = false; renderLimit();
  }
  function renderLimit() {
    const kmh = Math.round(GPS.speed * 3.6), over = P.limit && kmh > P.limit + 3;
    const lim = P.limit ? (S.speedUnit === 'mph' ? Math.round(P.limit / 1.609) : P.limit) : null;
    const st = $('#stLimit'); if (st) { st.hidden = !lim; st.textContent = lim || ''; }
    $$('.limsign,.limchip').forEach(e => { e.hidden = !lim; e.textContent = lim || ''; });
    $$('.spdbub,.cock').forEach(e => e.classList.toggle('over', !!over)); $('#stSpeed')?.classList.toggle('over', !!over);
  }

  /* ── Avisos de radares y reportes por delante ── */
  const liveReports = () => { const t = Date.now(); S.reports = (S.reports || []).filter(r => t - r.t < HOUR3); return S.reports; };
  function alerts(p, kmh) {
    const bar = $('#alertbar'); if (!bar) return;
    const h = P.heading; const cands = [];
    if (S.radarAlerts) P.cams.forEach(c => cands.push({ id: 'c' + c.id, lat: c.lat, lon: c.lon, ico: '📷', label: c.type === 'traffic_signals' ? 'Radar de semáforo' : c.type === 'average_speed' ? 'Radar de tramo' : 'Radar', max: c.max }));
    if (S.layers.reports) liveReports().forEach(r => cands.push({ id: 'r' + r.id, lat: r.lat, lon: r.lon, ico: REP[r.type][0], label: REP[r.type][1] }));
    let best = null, bd = 1e9, now = Date.now();
    for (const c of cands) {
      const d = dist(p, [c.lat, c.lon]); if (d > 1500) { delete P.said[c.id]; delete P.said[c.id + 'o']; continue; } if (d > 700 || h == null) continue;
      if (angDiff(bearing(p, [c.lat, c.lon]), h) > 35) continue;
      if (d < bd) { bd = d; best = c; }
    }
    if (!best || kmh < 5) { bar.hidden = true; return; }
    const lim = best.max, over = lim && kmh > lim + 5, dd = Math.round(bd / 10) * 10;
    bar.hidden = false; bar.classList.toggle('over', !!over);
    bar.textContent = `${best.ico} ${best.label} a ${dd} m${lim ? ' · ' + lim : ''}`;
    if (bd < 600 && !P.said[best.id]) { P.said[best.id] = now; speak(`${best.label} en ${Math.round(bd / 50) * 50} metros`); }
    if (over && bd < 400 && !P.said[best.id + 'o']) { P.said[best.id + 'o'] = now; speak('Reduce la velocidad'); }
  }

  function onPos(c) {
    const p = [c.latitude, c.longitude], kmh = (c.speed || 0) * 3.6;
    if (c.heading != null && !isNaN(c.heading) && kmh > 6) P.heading = c.heading;
    else if (P.prev && dist(P.prev, p) > 8) P.heading = bearing(P.prev, p);
    if (!P.prev || dist(P.prev, p) > 8) P.prev = p;
    refresh(); if (kmh > 3 || Nav.state.sim) updateLimit(p);
    renderLimit(); alerts(p, kmh);
  }

  /* ── Marcadores en el mapa ── */
  const icon = (e, cls = '') => L.divIcon({ className: '', html: `<div class="poi ${cls}">${e}</div>`, iconSize: [36, 36], iconAnchor: [18, 18] });
  function attach(map) { P.map = map; ['cams', 'chargers', 'fuel', 'reports'].forEach(k => P.groups[k] = L.layerGroup()); draw(); }
  function draw() {
    if (!P.map) return;
    const c = P.map.getCenter(), cc = [c.lat, c.lng], near = a => dist(cc, [a.lat, a.lon]) < 15000;
    Object.values(P.groups).forEach(g => g.clearLayers());
    const on = k => S.layers[k] || (k === 'cams' && S.radarAlerts && S.layers.cams);
    ['cams', 'chargers', 'fuel', 'reports'].forEach(k => {
      const g = P.groups[k]; if (!S.layers[k]) { P.map.removeLayer(g); return; } g.addTo(P.map);
      if (k === 'cams') P.cams.filter(near).forEach(x => L.marker([x.lat, x.lon], { icon: icon('📷', 'cam') }).on('click', () => info(`📷 Radar${x.max ? ' · ' + x.max + ' km/h' : ''}`, 'Radar fijo (datos de OpenStreetMap). Puede no estar actualizado.', x)).addTo(g));
      if (k === 'chargers') P.chargers.filter(near).forEach(x => L.marker([x.lat, x.lon], { icon: icon('⚡', x.tesla ? 'tesla' : 'chg') }).on('click', () => info('⚡ ' + x.name, [x.op, x.cap ? x.cap + ' puntos' : ''].filter(Boolean).join(' · '), x, true)).addTo(g));
      if (k === 'fuel') P.fuel.filter(near).forEach(x => L.marker([x.lat, x.lon], { icon: icon('⛽', 'fuel') }).on('click', () => info('⛽ ' + x.name, x.op, x, true)).addTo(g));
      if (k === 'reports') liveReports().forEach(r => L.marker([r.lat, r.lon], { icon: icon(REP[r.type][0], 'rep') }).on('click', () => dlg(`<h3>${REP[r.type][0]} ${REP[r.type][1]}</h3><div class="note">Reportado hace ${Math.round((Date.now() - r.t) / 60000)} min (solo en este dispositivo).</div><div class="acts"><button class="btn bad" id="d">Eliminar</button><button class="btn sec" id="c">Cerrar</button></div>`, d => { $('#c', d).onclick = closeDlg; $('#d', d).onclick = () => { S.reports = S.reports.filter(z => z !== r); save(); closeDlg(); draw(); }; })).addTo(g));
    });
  }
  function info(title, sub, x, go) {
    dlg(`<h3>${esc(title)}</h3><div class="note">${esc(sub || '')}</div><div class="acts"><button class="btn sec" id="c">Cerrar</button>${go ? '<button class="btn" id="g">🧭 Ir allí</button>' : ''}</div>`, d => {
      $('#c', d).onclick = closeDlg; if (go) $('#g', d).onclick = () => { closeDlg(); Nav.routeTo({ name: x.name, lat: x.lat, lon: x.lon }); };
    });
  }

  /* ── Reportes ── */
  function reportDlg() {
    dlg(`<h3>Reportar en tu posición</h3><div class="f">${Object.entries(REP).map(([k, v]) => `<button class="btn sec" data-r="${k}" style="font-size:18px;text-align:left">${v[0]} ${v[1]}</button>`).join('')}</div><div class="note">Los reportes se guardan 3 horas en este dispositivo; no se comparten con otros conductores.</div><div class="acts"><button class="btn sec" id="c">Cancelar</button></div>`, d => {
      $('#c', d).onclick = closeDlg;
      $$('[data-r]', d).forEach(b => b.onclick = () => {
        const p = GPS.pos ? [GPS.pos.latitude, GPS.pos.longitude] : S.lastPos || (P.map && [P.map.getCenter().lat, P.map.getCenter().lng]); if (!p) return toast('Sin posición');
        (S.reports ||= []).push({ id: Date.now(), t: Date.now(), lat: p[0], lon: p[1], type: b.dataset.r }); save(); closeDlg(); draw(); toast('Reporte guardado ' + REP[b.dataset.r][0]);
      });
    });
  }
  function init() { try { const j = JSON.parse(localStorage.getItem(KEY) || '{}'); ['cams', 'chargers', 'fuel'].forEach(k => P[k] = j[k] || []); } catch { } }
  return { init, onPos, attach, draw, refresh, reportDlg, renderLimit, need: k => { P.need[k] = true; refresh(); }, state: P, clearReports: () => { S.reports = []; save(); draw(); } };
})();

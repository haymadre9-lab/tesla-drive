'use strict';
/* Capa "estilo Waze" con datos abiertos de OpenStreetMap (Overpass):
   radares fijos con aviso, límite de velocidad de la vía, cargadores, gasolineras y reportes locales.
   Los datos se cachean en el dispositivo. No hay avisos de controles móviles de policía. */

const Poi = (() => {
  const P = { cams: [], chargers: [], fuel: [], limit: null, way: null, limitPos: null, limitT: 0, limitBusy: false, fetched: {}, fbusy: {}, need: {}, map: null, groups: {}, said: {}, prev: null, heading: null, lastDraw: 0 };
  const OVP = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
  const KEY = 'leco.poi', CAP = { cams: 2500, chargers: 900, fuel: 900 };
  const rad = x => x * Math.PI / 180;
  const dist = (a, b) => { const R = 6371000, dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]); const x = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  const bearing = (a, b) => (Math.atan2(Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0])), Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]))) * 180 / Math.PI + 360) % 360;
  const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  /* ¿Este punto está por delante y en MI carretera/ruta? (los radares del otro sentido o de vías paralelas se descartan) */
  function onMyRoad(p, h, c) {
    const d = dist(p, [c.lat, c.lon]), rt = Nav.state.active && Nav.state.coords && Nav.state.coords.length > 1 ? Nav.state.coords : null, way = P.way && P.way.geom && P.way.geom.length > 1 ? P.way.geom : null, ln = rt || way;
    if (ln) { if (Nav.distToLine([c.lat, c.lon], ln) > (rt ? 22 : 16)) return false; return h == null || angDiff(bearing(p, [c.lat, c.lon]), h) <= 50; }
    return h != null && d <= 450 && angDiff(bearing(p, [c.lat, c.lon]), h) <= 9; // sin datos de la vía: solo si está justo delante
  }
  const RADL = { fijo: 'Radar fijo', tramo: 'Radar de tramo', semaforo: 'Radar de semáforo', movil: 'Radar móvil (zona)' };
  /* Radares cercanos: los de OpenStreetMap + tu base de radares (data/radares.json), sin duplicados */
  function camsNear(p, r) {
    const out = P.cams.filter(c => dist(p, [c.lat, c.lon]) <= r).map(c => ({ id: 'c' + c.id, lat: c.lat, lon: c.lon, max: c.max, k: c.type === 'traffic_signals' ? 'semaforo' : c.type === 'average_speed' ? 'tramo' : 'fijo' }));
    if (typeof Data !== 'undefined') Data.near('rad', p, r).forEach(x => { if (dist(p, [x.lat, x.lon]) <= r && !out.some(o => Math.abs(o.lat - x.lat) < .0003 && Math.abs(o.lon - x.lon) < .0003)) out.push(x); });
    return out;
  }
  const REP = { accident: ['💥', 'Accidente'], hazard: ['⚠️', 'Peligro en la vía'], stopped: ['🚗', 'Vehículo parado'], pothole: ['🕳️', 'Bache'], jam: ['🐌', 'Retención'] };
  const HOUR3 = 3 * 3600e3;

  function speak(t) { if (!S.voice || !('speechSynthesis' in window)) return; try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'es-ES'; speechSynthesis.speak(u); } catch { } }
  async function ovp(q) {
    for (const u of OVP) {
      try { const c = new AbortController(), t = setTimeout(() => c.abort(), 22000); const r = await fetch(u, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: c.signal }); clearTimeout(t); if (r.ok) { const j = await r.json(); if (j.remark && !(j.elements || []).length) continue; return j; } } catch { }
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
    const tt = ttLimit(p); // en paralelo: TomTom da el límite; Overpass, la geometría de la vía
    try {
      const j = await ovp(`[out:json][timeout:10];way(around:30,${p[0]},${p[1]})[highway];out geom tags 8;`), FOOT = /^(footway|path|cycleway|steps|pedestrian|track|bridleway|corridor)$/;
      let near = null, nd = 1e9, best = null, bd = 1e9;
      for (const w of j.elements || []) {
        if (!w.geometry) continue; const hw = w.tags?.highway || '', geom = w.geometry.map(g => [g.lat, g.lon]), d = Nav.distToLine(p, geom); if (FOOT.test(hw)) continue;
        if (d < nd) { nd = d; near = { name: w.tags?.name || '', ref: w.tags?.ref || '', highway: hw, geom }; }
        const m = parseMax(w.tags?.maxspeed); if (m && d < bd) { bd = d; best = m; }
      }
      P.way = near; P.limit = best; P.limitPos = p; P.limitEst = best || !near ? null : estLimit(near.highway); P.limitSrc = best ? 'osm' : '';
    } catch { }
    const t2 = await tt; if (t2) { P.limit = t2; P.limitSrc = 'tomtom'; P.limitEst = null; P.limitPos = p; }
    P.limitBusy = false; renderLimit();
  }
  /* Si la vía no trae maxspeed en OpenStreetMap, se estima por tipo de vía (valores genéricos de España; se marca como «estimado») */
  const EST = { motorway: 120, motorway_link: 60, trunk: 100, trunk_link: 60, primary: 90, secondary: 90, tertiary: 90, unclassified: 50, residential: 30, living_street: 20, service: 20 };
  const estLimit = hw => S.limitEst === false ? null : EST[hw] || null;
  /* TomTom (opcional, con tu clave en Ajustes): límite de velocidad de la vía en mi posición */
  async function ttLimit(p) {
    let k = ''; try { k = localStorage.getItem('leco.tt') || ''; } catch { } if (!k) return null;
    try {
      const c = new AbortController(), t = setTimeout(() => c.abort(), 7000);
      const r = await fetch(`https://api.tomtom.com/search/2/reverseGeocode/${p[0].toFixed(5)},${p[1].toFixed(5)}.json?key=${encodeURIComponent(k)}&returnSpeedLimit=true&radius=40`, { signal: c.signal }); clearTimeout(t);
      if (!r.ok) { P.ttErr = 'HTTP ' + r.status; return null; } const j = await r.json(), s = j.addresses && j.addresses[0] && j.addresses[0].address && j.addresses[0].address.speedLimit;
      const m = s && String(s).match(/([\d.]+)\s*(KPH|MPH)?/i); if (!m) { P.ttErr = 'sin límite en esta vía'; return null; } P.ttErr = ''; return Math.round(+m[1] * (/MPH/i.test(m[2] || '') ? 1.609 : 1) / 5) * 5;
    } catch (e) { P.ttErr = e.name === 'AbortError' ? 'tarda demasiado' : e.message; return null; }
  }
  function renderLimit() {
    const eff = P.limit || P.limitEst || null, est = !P.limit && !!P.limitEst, kmh = Math.round(GPS.speed * 3.6), over = eff && kmh > eff + 3;
    const lim = eff ? (S.speedUnit === 'mph' ? Math.round(eff / 1.609) : eff) : null;
    const st = $('#stLimit'); if (st) { st.hidden = !lim; st.textContent = lim || ''; }
    $$('.limsign,.limchip').forEach(e => { e.hidden = !lim; e.textContent = lim || ''; e.classList.toggle('est', est); e.title = est ? 'Límite estimado por el tipo de vía (no figura en el mapa)' : ''; });
    $$('.spdbub,.cock').forEach(e => e.classList.toggle('over', !!over)); $('#stSpeed')?.classList.toggle('over', !!over);
  }

  /* ── Avisos de radares y reportes por delante ── */
  const liveReports = () => { const t = Date.now(); S.reports = (S.reports || []).filter(r => t - r.t < HOUR3); return S.reports; };
  function alerts(p, kmh) {
    const bar = $('#alertbar'); if (!bar) return;
    const h = P.heading; const cands = [];
    if (S.radarAlerts) camsNear(p, 1500).filter(c => onMyRoad(p, h, c)).forEach(c => cands.push({ id: c.id, lat: c.lat, lon: c.lon, ico: '📷', label: RADL[c.k] || 'Radar', max: c.max }));
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
  const icon = (e, cls = '') => `<div class="poi ${cls}">${e}</div>`, SZ = [36, 36];
  function attach(map) { P.map = map; ['cams', 'chargers', 'fuel', 'reports'].forEach(k => P.groups[k] = map.group()); draw(); }
  function draw() {
    if (!P.map) return;
    const c = P.map.getCenter(), cc = [c.lat, c.lng], near = a => dist(cc, [a.lat, a.lon]) < 15000;
    Object.values(P.groups).forEach(g => g.clear());
    const on = k => S.layers[k] || (k === 'cams' && S.radarAlerts && S.layers.cams);
    ['cams', 'chargers', 'fuel', 'reports'].forEach(k => {
      const g = P.groups[k]; if (!S.layers[k]) return;
      if (k === 'cams') camsNear(cc, 12000).slice(0, 400).forEach(x => g.add([x.lat, x.lon], icon('📷', x.k === 'movil' ? 'rep' : 'cam'), SZ, () => info(`📷 ${RADL[x.k] || 'Radar'}${x.max ? ' · ' + x.max + ' km/h' : ''}`, x.k === 'movil' ? 'Zona donde puede haber radar móvil: no es un aviso en tiempo real.' : 'Datos de tu base de radares / OpenStreetMap. Puede no estar actualizado.', x)));
      if (k === 'chargers') P.chargers.filter(near).forEach(x => g.add([x.lat, x.lon], icon('⚡', x.tesla ? 'tesla' : 'chg'), SZ, () => info('⚡ ' + x.name, [x.op, x.cap ? x.cap + ' puntos' : ''].filter(Boolean).join(' · '), x, true)));
      if (k === 'fuel') P.fuel.filter(near).forEach(x => g.add([x.lat, x.lon], icon('⛽', 'fuel'), SZ, () => info('⛽ ' + x.name, x.op, x, true)));
      if (k === 'reports') liveReports().forEach(r => g.add([r.lat, r.lon], icon(REP[r.type][0], 'rep'), SZ, () => dlg(`<h3>${REP[r.type][0]} ${REP[r.type][1]}</h3><div class="note">Reportado hace ${Math.round((Date.now() - r.t) / 60000)} min (solo en este dispositivo).</div><div class="acts"><button class="btn bad" id="d">Eliminar</button><button class="btn sec" id="c">Cerrar</button></div>`, d => { $('#c', d).onclick = closeDlg; $('#d', d).onclick = () => { S.reports = S.reports.filter(z => z !== r); save(); closeDlg(); draw(); }; })));
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
        const p = GPS.pos ? [GPS.pos.latitude, GPS.pos.longitude] : S.lastPos || (P.map && P.map.center()); if (!p) return toast('Sin posición');
        (S.reports ||= []).push({ id: Date.now(), t: Date.now(), lat: p[0], lon: p[1], type: b.dataset.r }); save(); closeDlg(); draw(); toast('Reporte guardado ' + REP[b.dataset.r][0]);
      });
    });
  }
  function init() { try { const j = JSON.parse(localStorage.getItem(KEY) || '{}'); ['cams', 'chargers', 'fuel'].forEach(k => P[k] = j[k] || []); } catch { } }
  return { onMyRoad, camsNear, RADL, init, onPos, attach, draw, refresh, reportDlg, renderLimit, ovp, need: k => { P.need[k] = true; refresh(); }, state: P, clearReports: () => { S.reports = []; save(); draw(); } };
})();

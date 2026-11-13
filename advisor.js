'use strict';
/* Asesor de viaje: tiempo aquí y en el destino, destinos que sueles repetir, y «pídeme consejo»
   (comer, café, cargar, aparcar, gasolina…) con información de cada sitio. Al elegir uno se abre en el mapa seleccionado.
   Datos abiertos: OpenStreetMap (Overpass), OSRM y Open-Meteo. No hay valoraciones de clientes ni precios. */

const Adv = (() => {
  S.trips ||= [];
  const A = { chat: [], thinking: false, errLog: [], note: '', loc: S.advLoc || null, q: '', cat: null, res: null, loading: false, err: '', pick: null, open: null, here: null, dest: null, destKey: '', hereAt: 0, expand: null };
  const rad = x => x * Math.PI / 180;
  const dist = (a, b) => { const R = 6371000, dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]), x = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  const fd = m => m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + ' km' : Math.round(m / 10) * 10 + ' m';
  const ref = () => A.loc ? { p: [A.loc.lat, A.loc.lon], label: A.loc.name } : (p => p ? { p, label: GPS.pos ? (GPS.age && GPS.age() > 60000 ? 'Posición GPS de hace ' + Math.round(GPS.age() / 60000) + ' min' : 'Tu posición (GPS)') : S.lastPos ? 'Última posición conocida' : (S.city ? S.city.name : 'Ciudad elegida') } : null)(pos());
  const pos = () => GPS.pos ? [GPS.pos.latitude, GPS.pos.longitude] : S.lastPos || (S.city ? [S.city.lat, S.city.lon] : null);
  const hm = m => { m = Math.round(m) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
  const DAYN = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

  /* ── Destinos que repites ── */
  function logTrip(d) { const n = new Date(); S.trips.push({ n: d.name, lat: d.lat, lon: d.lon, t: n.getTime(), h: n.getHours() + n.getMinutes() / 60, wd: n.getDay() }); S.trips = S.trips.slice(-400); save(); }
  function arrived(d) { const t = [...S.trips].reverse().find(x => d && Math.abs(x.lat - d.lat) < 1e-4 && Math.abs(x.lon - d.lon) < 1e-4); if (t) { t.arr = 1; save(); } }
  function suggest(now = new Date()) {
    const g = new Map(), h = now.getHours() + now.getMinutes() / 60, wd = now.getDay(), wk = d => d === 0 || d === 6;
    S.trips.forEach(t => { const k = t.lat.toFixed(3) + ',' + t.lon.toFixed(3), o = g.get(k) || { n: t.n, lat: t.lat, lon: t.lon, c: 0, hs: [], wds: [], last: 0 }; o.c++; o.hs.push(t.h); o.wds.push(t.wd); o.last = Math.max(o.last, t.t); o.n = t.n; g.set(k, o); });
    const out = [...g.values()].map(o => {
      const near = o.hs.filter(x => Math.min(Math.abs(x - h), 24 - Math.abs(x - h)) <= 2).length, same = o.wds.filter(x => x === wd).length, kind = o.wds.filter(x => wk(x) === wk(wd)).length, rec = Math.max(0, 1 - (now - o.last) / (60 * 864e5));
      const why = near >= 2 ? `Sueles ir a esta hora (${near} veces)` : same >= 2 ? `Los ${DAYN[wd]} sueles ir (${same} veces)` : `${o.c} veces en total`;
      return Object.assign(o, { near, why, score: o.c + near * 3 + same * 1.5 + kind * .5 + rec * 2 });
    }).filter(o => o.c >= 2).sort((a, b) => b.score - a.score);
    const p = pos(); return (p ? out.filter(o => dist(p, [o.lat, o.lon]) > 150) : out).slice(0, 4);
  }

  /* ── Tiempo (aquí y en el destino a la hora de llegada) ── */
  const WXC = {};
  async function wx(lat, lon) {
    const k = lat.toFixed(2) + ',' + lon.toFixed(2), c = WXC[k]; if (c && Date.now() - c.t < 20 * 60e3) return c.d;
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&forecast_days=2&timezone=auto`);
    const d = await r.json(); WXC[k] = { t: Date.now(), d }; return d;
  }
  function wxAt(d, ms) {
    const iso = new Date(ms + (d.utc_offset_seconds || 0) * 1000).toISOString().slice(0, 13) + ':00', i = d.hourly.time.indexOf(iso); if (i < 0) return null;
    return { t: d.hourly.temperature_2m[i], p: d.hourly.precipitation_probability[i], c: d.hourly.weather_code[i] };
  }
  const wxTip = w => !w ? '' : w.p >= 50 ? 'Probable lluvia: lleva paraguas' : w.t <= 5 ? 'Hace frío: abrígate' : w.t >= 31 ? 'Mucho calor: lleva agua' : w.c >= 95 ? 'Posibles tormentas' : '';
  async function loadHere() {
    const p = pos(); if (!p || Date.now() - A.hereAt < 15 * 60e3) return; A.hereAt = Date.now();
    try { A.here = await wx(p[0], p[1]); refresh(); } catch { }
  }
  async function loadDest() {
    const d = Nav.state.dest, s = Nav.summary(); if (!d || !s) { if (A.destKey) { A.dest = null; A.destKey = ''; refresh(); } return; }
    const k = d.lat.toFixed(3) + d.lon.toFixed(3); if (k === A.destKey) return; A.destKey = k;
    try { A.dest = { d: await wx(d.lat, d.lon), name: d.name }; refresh(); } catch { A.destKey = ''; }
  }
  bus.on('nav', () => loadDest());

  /* ── Horarios de OpenStreetMap (formato habitual) ── */
  const DK = { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6 }, tm = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  function days(s) {
    const set = new Set(); if (!s) return new Set([0, 1, 2, 3, 4, 5, 6]);
    for (const part of s.split(',')) { const m = part.toLowerCase().match(/^([a-z]{2})(?:-([a-z]{2}))?$/); if (!m || !(m[1] in DK) || (m[2] && !(m[2] in DK))) return null; const b = m[2] ? DK[m[2]] : DK[m[1]]; for (let d = DK[m[1]]; ; d = (d + 1) % 7) { set.add(d); if (d === b) break; } }
    return set;
  }
  function parseRules(txt) { // días → [[inicio, fin]] en minutos; null si el formato no se entiende
    const by = Array.from({ length: 7 }, () => []);
    for (const rule of txt.split(';')) {
      const r = rule.trim(); if (!r) continue;
      const m = r.match(/^(?:([A-Za-z,\- ]+?)\s+)?((?:\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*,?\s*)+|off|closed)$/i); if (!m) return null;
      const ds = days((m[1] || '').replace(/\s/g, '')); if (!ds) return null;
      const v = m[2].toLowerCase(), rg = /^(off|closed)$/.test(v) ? [] : [...v.matchAll(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g)].map(x => [tm(x[1]), tm(x[2])]);
      ds.forEach(d => { by[d] = rg; });
    }
    return by;
  }
  function weekTable(oh) { // lista Lunes…Domingo con su horario, o null si no se puede interpretar
    if (!oh) return null; const t = String(oh).trim(), N = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const by = /^24\/7$/i.test(t) ? null : parseRules(t); if (!by && !/^24\/7$/i.test(t)) return null;
    return [1, 2, 3, 4, 5, 6, 0].map(d => ({ d, n: N[d], v: !by ? 'Abierto 24 h' : by[d].length ? by[d].map(r => hm(r[0]) + '–' + hm(r[1])).join(', ') : 'Cerrado' }));
  }
  function openState(oh, now = new Date()) {
    if (!oh) return { s: 'unknown', msg: 'Horario no disponible' };
    const txt = String(oh).trim(); if (/^24\/7$/i.test(txt)) return { s: 'open', msg: 'Abierto 24 h' };
    const by = parseRules(txt); if (!by) return { s: 'unknown', msg: 'Horario no disponible' };
    const day = now.getDay(), mins = now.getHours() * 60 + now.getMinutes();
    for (const r of by[day]) if (r[1] > r[0] ? mins >= r[0] && mins < r[1] : mins >= r[0]) return { s: 'open', msg: 'Abierto hasta las ' + hm(r[1]) };
    for (const r of by[(day + 6) % 7]) if (r[1] < r[0] && mins < r[1]) return { s: 'open', msg: 'Abierto hasta las ' + hm(r[1]) };
    const nx = by[day].map(r => r[0]).filter(x => x > mins).sort((a, b) => a - b)[0];
    return { s: 'closed', msg: nx != null ? 'Cerrado · abre a las ' + hm(nx) : 'Cerrado ahora' };
  }

  /* ── Categorías y búsqueda ── */
  const CATS = {
    eat: { i: '🍽', n: 'Comer', sel: ['["amenity"="restaurant"]'] }, cafe: { i: '☕', n: 'Café', sel: ['["amenity"="cafe"]'] },
    charge: { i: '⚡', n: 'Cargar', sel: ['["amenity"="charging_station"]'] }, park: { i: '🅿️', n: 'Parking', sel: ['["amenity"="parking"]["access"!~"private|customers|permit|delivery"]'] },
    fuel: { i: '⛽', n: 'Gasolina', sel: ['["amenity"="fuel"]'] }, shop: { i: '🛒', n: 'Súper', sel: ['["shop"="supermarket"]'] }, pharm: { i: '💊', n: 'Farmacia', sel: ['["amenity"="pharmacy"]'] },
    hotel: { i: '🏨', n: 'Dormir', sel: ['["tourism"~"^(hotel|hostel|guest_house|motel)$"]'] }, wc: { i: '🚻', n: 'Baños', sel: ['["amenity"="toilets"]'] },
    wash: { i: '🚿', n: 'Lavado', sel: ['["amenity"="car_wash"]'] }, sight: { i: '📸', n: 'Ver algo', sel: ['["tourism"~"^(attraction|viewpoint|museum|gallery)$"]'] },
  };
  const KW = [[/pizza|pizzer/, 'eat', 'pizza|italian'], [/hamburgues|burger/, 'eat', 'burger'], [/sushi|japon/, 'eat', 'sushi|japanese'], [/tapas|tasca/, 'eat', 'tapas|spanish|regional'], [/marisc|pescad/, 'eat', 'seafood|fish'], [/carne|parrilla|asador/, 'eat', 'steak_house|grill'], [/vegetarian|vegan/, 'eat', 'vegetarian|vegan'],
    [/comer|cenar|almorzar|restaurant|men[uú]|hambre|comida/, 'eat'], [/caf[eé]|desayun|merienda|bolle|cerveza|copa/, 'cafe'], [/carg|supercharger|enchuf|bater/, 'charge'], [/parking|aparc|estacion|garaje/, 'park'], [/gasolin|combustible|di[eé]sel|repostar/, 'fuel'],
    [/s[uú]per|compra|mercado/, 'shop'], [/farmaci|medicin/, 'pharm'], [/hotel|dormir|alojam|hostal/, 'hotel'], [/ba[ñn]o|wc|aseo/, 'wc'], [/lavar|lavado|lavadero/, 'wash'], [/visitar|turismo|museo|mirador|ver algo/, 'sight']];
  const CUI = { pizza: 'Pizza', italian: 'Italiana', spanish: 'Española', regional: 'Regional', burger: 'Hamburguesas', japanese: 'Japonesa', sushi: 'Sushi', kebab: 'Kebab', chinese: 'China', mexican: 'Mexicana', indian: 'India', seafood: 'Marisco', steak_house: 'Carnes', grill: 'Parrilla', vegetarian: 'Vegetariana', vegan: 'Vegana', tapas: 'Tapas', mediterranean: 'Mediterránea', fish: 'Pescado', coffee_shop: 'Cafetería', sandwich: 'Bocadillos', ice_cream: 'Helados', bakery: 'Panadería' };
  const parse = t => { t = t.toLowerCase(); for (const [re, cat, cui] of KW) if (re.test(t)) return { cat, cui }; return { cat: null }; };
  const eRe = s => s.replace(/[.*+?^${}()|[\]\\"]/g, '\\$&');

  const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.openstreetmap.fr/api/interpreter'];
  async function ovpx(q) { // Overpass responde 200 con «remark» cuando se agota el tiempo: se trata como fallo y se prueba el siguiente servidor
    const log = [];
    for (const u of MIRRORS) {
      const host = u.split('/')[2];
      try {
        const c = new AbortController(), t = setTimeout(() => c.abort(), 15000), r = await fetch(u, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: c.signal }); clearTimeout(t);
        if (!r.ok) { log.push(host + ': HTTP ' + r.status); continue; }
        const j = await r.json();
        if (j.remark && /timed out|out of memory|runtime error|too many|rate/i.test(j.remark)) { log.push(host + ': ' + j.remark.slice(0, 70)); continue; }
        if (!Array.isArray(j.elements)) { log.push(host + ': respuesta inesperada'); continue; }
        return j;
      } catch (e) { log.push(host + ': ' + (e.name === 'AbortError' ? 'sin respuesta en 15 s' : 'error de red')); }
    }
    const e = new Error('overpass'); e.log = log; throw e;
  }
  const NOMQ = { eat: 'restaurante', cafe: 'cafetería', charge: 'cargador eléctrico', park: 'parking', fuel: 'gasolinera', shop: 'supermercado', pharm: 'farmacia', hotel: 'hotel', wc: 'aseos públicos', wash: 'lavadero de coches', sight: 'lugar de interés turístico' };
  async function nominatim(p, term) { // respaldo: menos detalle, pero suele responder
    const d = .06, v = `${p[1] - d * 1.4},${p[0] + d},${p[1] + d * 1.4},${p[0] - d}`, r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=30&accept-language=es&extratags=1&bounded=1&viewbox=${v}&q=${encodeURIComponent(term)}`);
    if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json();
    return j.map(x => ({ id: 'n' + x.place_id, lat: +x.lat, lon: +x.lon, tags: Object.assign({ name: x.name || String(x.display_name).split(',')[0] }, x.extratags || {}) }));
  }
  async function search(cat, cui, nameQ) {
    const R = ref(); A.errLog = []; A.note = '';
    if (!R) { A.err = 'No sé dónde estás: activa la ubicación del navegador o elige un lugar.'; A.res = []; return refresh(); }
    const p = R.p; A.loading = true; A.err = ''; A.res = null; A.pick = null; A.expand = null; refresh();
    let items = [], log = [], warn = '';
    if (!A.loc && GPS.pos) { const ac = GPS.pos.accuracy || 0, ag = GPS.age ? GPS.age() : 0; if (ag > 120000) { warn = `⚠️ El GPS no da posición nueva desde hace ${Math.round(ag / 60000)} min: puede que busque lejos de donde estás. `; refreshGPS(); } else if (ac > 1000) warn = `⚠️ La posición del GPS es muy imprecisa (±${ac >= 2000 ? Math.round(ac / 1000) + ' km' : Math.round(ac) + ' m'}). `; }
    try {
      let els = [];
      for (const r of [800, 2500, 7000, 15000]) {
        const a = `(around:${r},${p[0]},${p[1]})`, body = cat ? CATS[cat].sel.map(s => `nwr${s}${cui ? `["cuisine"~"${cui}",i]` : ''}${a};`).join('') : `nwr["name"~"${eRe(nameQ)}",i]${a};`;
        els = (await ovpx(`[out:json][timeout:25];(${body});out center tags 90;`)).elements || []; if (els.length >= 6) break;
      }
      items = els.map(e => ({ id: e.type + e.id, lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, tags: e.tags || {} })).filter(x => x.lat != null);
    } catch (e) { log = e.log || [String(e.message || e)]; }
    if (!items.length) { // respaldo
      try { items = await nominatim(p, cat ? NOMQ[cat] + (cui ? ' ' + cui.split('|')[0] : '') : nameQ); if (items.length) A.note = 'Datos de respaldo: hay menos detalle de horarios y características.'; } catch (e) { log.push('nominatim.openstreetmap.org: ' + (e.message || 'error')); }
    }
    const seen = new Set(); items = items.filter(x => { const k = (x.tags.name || '') + x.lat.toFixed(4) + x.lon.toFixed(4); if (seen.has(k)) return false; seen.add(k); return true; });
    items.forEach(x => { x.d = dist(p, [x.lat, x.lon]); }); const far = items.length; items = items.filter(x => x.d <= 100000); if (far && !items.length) log.push('Todos los resultados estaban a más de 100 km'); items.sort((a, b) => a.d - b.d); items = items.slice(0, 10);
    if (items.length) {
      try { // tiempos reales de conducción
        const co = [p, ...items.map(x => [x.lat, x.lon])].map(c => `${c[1]},${c[0]}`).join(';'), r = await fetch(`https://router.project-osrm.org/table/v1/driving/${co}?sources=0&annotations=duration`), t = await r.json();
        items.forEach((x, i) => { const sec = t.durations && t.durations[0] && t.durations[0][i + 1]; x.min = sec != null ? Math.max(1, Math.round(sec / 60)) : null; });
      } catch { }
      items.forEach(x => { if (x.min == null) { x.min = Math.max(1, Math.round(x.d * 1.4 / 500)); x.est = 1; } describe(x, cat, cui); });
      items.sort((a, b) => b.score - a.score);
    }
    A.res = items; A.cat = cat; A.pick = items[0] || null; A.errLog = log; A.note = (warn + (A.note || '')).trim(); loadImages(items);
    if (!items.length) A.err = (warn || '') + (log.length && !log.some(l => /100 km/.test(l)) ? 'No pude obtener datos ahora mismo (los servidores de mapas no respondieron).' : 'No encontré nada cerca. Prueba con otra búsqueda o cambia el lugar.');
    A.loading = false; A.last = [cat, cui, nameQ]; refresh();
  }
  /* Elegir el lugar de referencia (por si no hay GPS, o para planificar otra zona) */
  function locDlg() {
    dlg(`<h3>📍 ¿Cerca de dónde busco?</h3><div class="f"><button class="btn ${A.loc ? 'sec' : ''}" id="l1" type="button" style="text-align:left">📡 Mi posición (GPS)</button>${Nav.state.map ? '<button class="btn sec" id="l3" type="button" style="text-align:left">🗺 Centro del mapa que estoy viendo</button>' : ''}<label class="lab">…o escribe una ciudad, barrio o dirección<div class="adv-ask"><input class="in" id="lq" placeholder="Ej. Sevilla centro"><button class="btn" id="l2" type="button">Buscar</button></div></label><div id="lr" class="f"></div></div><div class="acts"><button class="btn sec" id="lx" type="button">Cerrar</button></div>`, d => {
      const set = l => { A.loc = l; S.advLoc = l; save(); closeDlg(); toast(l ? 'Buscaré cerca de: ' + l.name : 'Usaré tu posición GPS'); A.res = null; A.err = ''; refresh(); };
      $('#lx', d).onclick = closeDlg; $('#l1', d).onclick = () => set(null);
      const l3 = $('#l3', d); if (l3) l3.onclick = () => { const c = Nav.state.map.getCenter(); set({ name: 'Centro del mapa', lat: c.lat, lon: c.lng }); };
      const go1 = async () => {
        const q = $('#lq', d).value.trim(); if (!q) return; $('#lr', d).innerHTML = '<div class="note">Buscando…</div>';
        try { const r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=es&q=${encodeURIComponent(q)}`)).json();
          $('#lr', d).innerHTML = r.length ? r.map((x, i) => `<button class="btn sec" data-i="${i}" type="button" style="text-align:left">${esc(x.display_name.split(',').slice(0, 3).join(','))}</button>`).join('') : '<div class="note">No encontré ese lugar.</div>';
          $$('#lr [data-i]', d).forEach(b => b.onclick = () => { const x = r[+b.dataset.i]; set({ name: x.display_name.split(',').slice(0, 2).join(','), lat: +x.lat, lon: +x.lon }); });
        } catch { $('#lr', d).innerHTML = '<div class="note">Sin conexión con el buscador de lugares.</div>'; }
      };
      $('#l2', d).onclick = go1; $('#lq', d).onkeydown = e => { if (e.key === 'Enter') go1(); };
    });
  }
  async function loadImages(items) { // fotos desde Wikidata/Commons para los sitios que las tengan
    let added = false;
    await Promise.all(items.slice(0, 8).map(async x => {
      if (x.img || !/^Q\d+$/.test(x.tags.wikidata || '')) return;
      try { const j = await (await fetch(`https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${x.tags.wikidata}&property=P18&format=json&origin=*`)).json(), f = j.claims && j.claims.P18 && j.claims.P18[0].mainsnak.datavalue.value; if (f) { x.img = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(f) + '?width=300'; added = true; } } catch { }
    }));
    if (added && A.res === items && !A.expand) refresh();
  }
  function describe(x, cat, cui) {
    const t = x.tags, info = [], kind = cat || (t.amenity === 'charging_station' ? 'charge' : t.amenity === 'parking' ? 'park' : t.amenity === 'fuel' ? 'fuel' : t.amenity === 'restaurant' ? 'eat' : t.amenity === 'cafe' ? 'cafe' : null);
    x.kind = kind; x.icon = kind ? CATS[kind].i : '📍'; x.n = t.name || t.brand || t.operator || ({ eat: 'Restaurante sin nombre', cafe: 'Cafetería sin nombre', charge: 'Cargador', park: 'Parking', fuel: 'Gasolinera', shop: 'Supermercado', pharm: 'Farmacia', hotel: 'Alojamiento', wc: 'Aseos públicos', wash: 'Lavadero', sight: 'Lugar de interés' }[kind] || 'Lugar');
    x.img = Info.imgOf(x); x.open = openState(t.opening_hours); x.phone = t.phone || t['contact:phone'] || ''; x.web = t.website || t['contact:website'] || '';
    let sc = -x.min * .35 + (x.open.s === 'open' ? 3 : x.open.s === 'closed' ? -6 : 0) + (t.name ? .5 : 0) + (x.phone || x.web ? .3 : 0);
    if (t.cuisine) { const c = t.cuisine.split(';').map(s => CUI[s.trim()] || s.trim().replace(/_/g, ' ')).slice(0, 2).join(', '); info.push(c); if (cui && new RegExp(cui, 'i').test(t.cuisine)) sc += 2; }
    if (t.outdoor_seating === 'yes') info.push('Terraza'); if (t.takeaway === 'yes' || t.takeaway === 'only') info.push('Para llevar'); if (t['diet:vegetarian'] === 'yes') info.push('Opción vegetariana'); if (t['diet:vegan'] === 'yes') info.push('Opción vegana');
    if (t.wheelchair === 'yes') info.push('♿ Accesible'); if (t.internet_access === 'wlan' || t.internet_access === 'yes') info.push('Wi‑Fi');
    if (kind === 'charge') {
      const sk = [['socket:tesla_supercharger', 'Supercharger Tesla'], ['socket:type2_combo', 'CCS'], ['socket:type2', 'Tipo 2'], ['socket:chademo', 'CHAdeMO']].filter(([k]) => t[k] && t[k] !== 'no').map(([k, l]) => l + (/^\d+$/.test(t[k]) ? ' ×' + t[k] : ''));
      if (sk.length) info.push(sk.join(' · ')); const out = t['socket:tesla_supercharger:output'] || t['socket:type2_combo:output'] || t['charging_station:output'] || t['socket:type2:output']; if (out) info.push('Hasta ' + out); if (t.capacity) info.push(t.capacity + ' puntos');
      if (t.fee === 'no') info.push('Gratis'); else if (t.fee === 'yes') info.push('De pago'); x.tesla = /tesla/i.test((t.operator || '') + (t.brand || '') + (t.name || '')); if (x.tesla) sc += .5; if (+t.capacity >= 8) sc += 1; if (parseInt(out) >= 100) sc += 1;
    }
    if (kind === 'park') {
      info.push(t.fee === 'no' ? 'Gratuito' : t.fee === 'yes' ? 'De pago' : 'Tarifa sin datos'); if (t.capacity) info.push(t.capacity + ' plazas'); if (t.parking) info.push({ underground: 'Subterráneo', 'multi-storey': 'Varias plantas', surface: 'En superficie', street_side: 'En la calle', lane: 'En la calle' }[t.parking] || t.parking);
      if (t.maxstay) info.push('Máx. ' + t.maxstay); if (t['capacity:disabled']) info.push('♿ ' + t['capacity:disabled']); if (t.fee === 'no') sc += 1.5; if (+t.capacity >= 50) sc += .5; if (/underground|multi/.test(t.parking || '')) sc += .3;
    }
    if (kind === 'fuel') { [['fuel:diesel', 'Diésel'], ['fuel:octane_95', 'Gasolina 95'], ['fuel:octane_98', 'Gasolina 98'], ['fuel:lpg', 'GLP']].forEach(([k, l]) => { if (t[k] === 'yes') info.push(l); }); }
    x.info = info.filter(Boolean); x.score = sc;
  }
  function advice(x) {
    if (!x) return '';
    const bits = [`a ${x.min} min en coche (${fd(x.d)})`, x.open.s !== 'unknown' ? x.open.msg.toLowerCase() : '', ...x.info.slice(0, 2).map(s => s.toLowerCase())].filter(Boolean);
    return `Te recomiendo «${x.n}»: ${bits.join(', ')}.`;
  }

  /* ── Consejos del momento ── */
  function insights() {
    const out = [], h = new Date().getHours() + new Date().getMinutes() / 60, s = Nav.summary();
    if (h >= 12 && h < 15.5) out.push(['eat', '🍽 Es hora de comer. ¿Te busco algo cerca?']); else if (h >= 19.5 && h < 22.5) out.push(['eat', '🍽 Hora de cenar. ¿Quieres ideas?']); else if (h >= 7 && h < 10.5) out.push(['cafe', '☕ ¿Un café o desayuno por el camino?']);
    if (s && /^\d+(\.\d+)? km$/.test(s.rem) && parseFloat(s.rem) >= 120) out.push(['charge', '⚡ Ruta larga: ¿paramos a cargar o a descansar?']);
    return out.slice(0, 2);
  }

  /* ── Interfaz ── */
  const refresh = () => $$('.js-advw').forEach(e => draw(e, e.dataset.adv));
  const wline = (w, pre) => w ? `${pre} ${wxDesc(w.c)[0]} <b>${tmp(w.t)}</b>${w.p != null ? ` · lluvia ${w.p}%` : ''}` : '';
  function nowCard(compact) {
    const p = pos(), cur = A.here && A.here.current, s = Nav.summary(), d = Nav.state.dest;
    let h = '<h4>Ahora</h4>';
    h += cur ? `<div class="adv-w">${wxDesc(cur.weather_code)[0]} <b>${tmp(cur.temperature_2m)}</b><span>${wxDesc(cur.weather_code)[1]} · 💨 ${Math.round(cur.wind_speed_10m)} km/h</span></div>` : `<div class="note">${p ? 'Cargando el tiempo…' : 'Sin posición GPS todavía'}</div>`;
    if (s && d && A.dest) { const at = wxAt(A.dest.d, s.etaMs || Date.now()), tip = wxTip(at); h += `<div class="adv-dest"><b>🧭 ${esc(d.name)}</b><span>${esc(s.rem)} · llegada ${esc(s.eta)}</span>${at ? `<div>${wline(at, 'A tu llegada:')}</div>` : ''}${tip ? `<div class="adv-tip">💡 ${tip}</div>` : ''}</div>`; }
    else if (s && d) h += `<div class="adv-dest"><b>🧭 ${esc(d.name)}</b><span>${esc(s.rem)} · llegada ${esc(s.eta)}</span></div>`;
    insights().forEach(([c, t]) => { h += `<button class="adv-ins" data-cat="${c}">${t}</button>`; });
    return h;
  }
  function sugCard(n) {
    const l = suggest().slice(0, n); if (!l.length) return `<h4>Tus destinos habituales</h4><div class="note">Aún no hay suficientes viajes. Cuando repitas destinos te los sugeriré según la hora y el día.</div>`;
    return `<h4>Sugerencias para ti</h4>${l.map((o, i) => `<div class="adv-sug"><div><b>${esc(o.n)}</b><small>${esc(o.why)}</small></div><button class="btn" data-s="${i}">Ir</button></div>`).join('')}`;
  }
  function item(x, i) {
    const best = i === 0, open = A.expand === x;
    return `<div class="adv-it ${best ? 'best' : ''} ${open ? 'open' : ''}" data-i="${i}"><div class="adv-row">${(() => { const bd = typeof Info !== 'undefined' ? Info.badge(x) : '', im = x.img || (typeof Info !== 'undefined' ? Info.imgOf(x, 300) : ''); return im ? `<div class="ai ph"><img src="${esc(im)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('noimg');this.remove()"><span class="ic">${x.icon}</span></div>${bd ? `<div class="ai bw">${bd}</div>` : ''}` : `<div class="ai ${bd ? 'bw' : ''}">${bd || x.icon}</div>`; })()}<div class="at"><b>${best ? '⭐ ' : ''}${esc(x.n)}</b><small><span class="${x.open.s}">${esc(x.open.msg)}</span> · ${x.est ? '≈' : ''}${x.min} min · ${fd(x.d)}</small>${x.info.length ? `<div class="tags">${x.info.slice(0, 4).map(t => `<i>${esc(t)}</i>`).join('')}</div>` : ''}</div>
      <div class="ab"><button class="btn" data-go="${i}">🧭 Ir</button>${x.phone ? `<a class="btn sec" href="tel:${esc(String(x.phone).split(/[;,]/)[0].replace(/[^\d+]/g, ''))}">☎</a>` : ''}<button class="btn sec chev" type="button" title="Ver toda la información">${open ? 'Menos ▴' : 'Más info ▾'}</button></div></div>
      <div class="adv-more" ${open ? '' : 'hidden'}>${open ? Info.html(x) : ''}</div></div>`;
  }
  function draw(el, mode) {
    mode = mode || 'page'; const compact = mode === 'widget', cats = Object.entries(CATS);
    const sel = S.mapPage !== 'builtin' && Maps.get(S.mapPage) ? Maps.get(S.mapPage).n : 'Mapa integrado';
    const chips = `<div class="adv-chips">${cats.map(([k, c]) => `<button data-cat="${k}" class="${A.cat === k ? 'on' : ''}">${c.i}<span>${c.n}</span></button>`).join('')}</div>`;
    const res = A.loading ? '<div class="note adv-load">Buscando cerca de ti…</div>' : A.err ? `<div class="note">${esc(A.err)}</div><div class="adv-errb"><button class="btn sec" id="aretry" type="button">↻ Reintentar</button><button class="btn sec" id="aloc2" type="button">📍 Cambiar lugar</button></div>${A.errLog && A.errLog.length ? `<details class="adv-det"><summary>Detalles técnicos</summary>${A.errLog.map(esc).join('<br>')}</details>` : ''}` : A.res && A.res.length ? `<div class="adv-reco">💬 ${esc(advice(A.res[0]))}</div>${A.note ? `<div class="note">${esc(A.note)}</div>` : ''}<div class="adv-list">${A.res.slice(0, compact ? 3 : 8).map((x, i) => item(x, i, false)).join('')}</div><div class="adv-foot">Datos de OpenStreetMap: sin valoraciones de clientes ni precios. Comprueba el horario antes de ir.</div>` : '<div class="note">Pregúntame algo como «dónde comer pizza», «cargador cerca» o «parking», o toca una categoría.</div>';
    const has = !compact && !!(A.loading || A.err || (A.res && A.res.length));
    el.innerHTML = compact
      ? `<div class="adv w"><div class="adv-card">${nowCard(true)}</div>${chips}<div class="adv-res">${res}</div></div>`
      : `<div class="adv p"><div class="adv-l">${has ? `<div class="adv-res card adv-resc"><div class="adv-xb"><button class="adv-x" id="ares-x" type="button" aria-label="Cerrar resultados"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 5L19 19M19 5L5 19" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg></button></div>${res}</div>` : ''}<div class="adv-card">${nowCard(false)}</div><div class="adv-card">${sugCard(4)}</div></div>
        <div class="adv-r"><div class="adv-card"><h4>Pídeme consejo</h4><div class="adv-ask"><input class="in" id="aq" type="search" placeholder="${AI.ready() ? 'Pregúntame lo que quieras: «un sitio tranquilo para comer algo rápido»…' : 'Ej. dónde comer pizza cerca, parking, cargar…'}" value="${esc(A.q)}"><button class="btn" id="ago">Preguntar</button>${'webkitSpeechRecognition' in window || 'SpeechRecognition' in window ? '<button class="btn sec" id="amic" title="Hablar">🎤</button>' : ''}</div><div class="adv-loc">📍 Buscando cerca de: <b>${esc((ref() || { label: 'sin ubicación' }).label)}</b> <button class="btn sec" id="aloc" type="button">Cambiar</button></div>${chips}${chatHtml()}</div>${has ? '' : `<div class="adv-card">${res}</div>`}
        <div class="adv-card adv-map">Al pulsar 🧭 Ir se abre en: <b>🗺 ${esc(sel)}</b> <button class="btn sec" id="amap">Cambiar</button></div></div></div>`;
    const rx = $('#ares-x', el); if (rx) rx.onclick = () => { A.res = null; A.err = ''; A.loading = false; A.cat = null; A.expand = null; A.pick = null; A.note = ''; refresh(); };
    $$('[data-cat]', el).forEach(b => b.onclick = () => { if (compact) { A.q = ''; go('advisor'); } search(b.dataset.cat); });
    $$('[data-s]', el).forEach(b => b.onclick = () => { const o = suggest()[+b.dataset.s]; if (o) Maps.openPlace({ n: o.n, lat: o.lat, lon: o.lon }); });
    $$('[data-go]', el).forEach(b => b.onclick = e => { e.stopPropagation(); const x = A.res[+b.dataset.go]; Maps.openPlace({ n: x.n, lat: x.lat, lon: x.lon }); });
    $$('.adv-it', el).forEach(r => {
      const x = A.res[+r.dataset.i], more = $('.adv-more', r), chev = $('.chev', r);
      const tog = () => {
        const was = A.expand === x;
        $$('.adv-it.open', el).forEach(z => { z.classList.remove('open'); $('.adv-more', z).hidden = true; $('.chev', z).textContent = 'Más info ▾'; });
        if (was) { A.expand = null; return; }
        A.expand = A.pick = x; r.classList.add('open'); more.hidden = false; more.innerHTML = Info.html(x); chev.textContent = 'Menos ▴'; Info.bind(x, more); r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      };
      $('.adv-row', r).onclick = e => { if (e.target.closest('[data-go],a[href^="tel"]')) return; tog(); };
      if (A.expand === x) Info.bind(x, more);
    });
    const q = $('#aq', el); if (q) { q.oninput = () => { A.q = q.value; }; q.onkeydown = e => { if (e.key === 'Enter') ask(q.value); }; $('#ago', el).onclick = () => ask(q.value); }
    const mic = $('#amic', el); if (mic) mic.onclick = () => { const R = window.SpeechRecognition || window.webkitSpeechRecognition, r = new R(); r.lang = 'es-ES'; r.onresult = ev => { const t = ev.results[0][0].transcript; A.q = t; ask(t); }; r.onerror = () => toast('No se pudo usar el micrófono'); try { r.start(); toast('Escuchando…'); } catch { } };
    ['#aloc', '#aloc2'].forEach(id => { const b = $(id, el); if (b) b.onclick = locDlg; }); const rt = $('#aretry', el); if (rt) rt.onclick = () => A.last ? search(...A.last) : ask(A.q);
    const mp = $('#amap', el); if (mp) mp.onclick = () => Maps.pick(id => { S.mapPage = id; save(); refresh(); }, S.mapPage);
  }
  const SYS = 'Eres el copiloto de un coche. Hablas en español, claro y breve (máximo 4 frases). Solo usas los datos que se te dan: no inventes sitios, horarios, precios ni valoraciones de clientes (no las tienes). Si faltan datos, dilo. No des instrucciones que distraigan al conductor ni de conducción arriesgada. Recomienda como mucho 3 opciones y explica el motivo (cercanía, si está abierto ahora, características).';
  const parseJSON = t => { try { const a = t.indexOf('{'), b = t.lastIndexOf('}'); return a >= 0 && b > a ? JSON.parse(t.slice(a, b + 1)) : null; } catch { return null; } };
  function context() { // sin coordenadas: solo lo necesario para aconsejar
    const n = new Date(), cur = A.here && A.here.current, s = Nav.summary(), d = Nav.state.dest, c = { hora: n.toTimeString().slice(0, 5), dia: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][n.getDay()] };
    if (cur) c.tiempo_aqui = `${Math.round(cur.temperature_2m)}°C, ${wxDesc(cur.weather_code)[1]}`;
    if (s && d) { c.ruta = { destino: d.name, restante: s.rem, llegada: s.eta }; if (A.dest) { const at = wxAt(A.dest.d, s.etaMs || Date.now()); if (at) c.ruta.tiempo_en_destino = `${Math.round(at.t)}°C, probabilidad de lluvia ${at.p}%`; } }
    if (AI.habits()) c.destinos_habituales = suggest().slice(0, 3).map(o => `${o.n} (${o.why})`);
    const R = ref(); if (R) c.zona = R.label === 'Tu posición (GPS)' ? 'cerca de donde estoy' : R.label;
    return c;
  }
  function speakAI(t) { if (AI.voice() && 'speechSynthesis' in window) { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'es-ES'; speechSynthesis.speak(u); } catch { } } }
  async function askAI(text) {
    A.chat.push({ r: 'u', t: text }); A.chat = A.chat.slice(-8); A.thinking = true; refresh();
    try {
      const ctx = context(), plan = parseJSON(await AI.call(SYS, `Pregunta del conductor: «${text}»\nContexto: ${JSON.stringify(ctx)}\nDecide qué hacer. Responde SOLO con JSON: {"accion":"buscar"|"responder","categoria":"eat|cafe|charge|park|fuel|shop|pharm|hotel|wc|wash|sight"|null,"cocina":"palabras en inglés separadas por | (ej. pizza|italian)"|null,"nombre":"texto si buscas por nombre"|null,"respuesta":"respuesta breve si accion es responder"}`, { json: true }));
      let out;
      if (plan && plan.accion === 'buscar' && (CATS[plan.categoria] || plan.nombre)) {
        await search(CATS[plan.categoria] ? plan.categoria : null, plan.cocina || null, plan.nombre || text);
        const items = (A.res || []).slice(0, 8).map(x => ({ nombre: x.n, minutos_en_coche: x.min, distancia: fd(x.d), estado: x.open.msg, detalles: x.info.slice(0, 5) }));
        out = items.length ? await AI.call(SYS, `Pregunta del conductor: «${text}»\nContexto: ${JSON.stringify(ctx)}\nSitios encontrados (OpenStreetMap, ya ordenados por mi criterio de cercanía y horario): ${JSON.stringify(items)}\nRedacta tu consejo usando solo estos datos. Si el horario no está, dilo.`) : 'No he encontrado sitios cerca con esos datos. Prueba a cambiar el lugar o la búsqueda.';
      } else if (plan && plan.respuesta) out = plan.respuesta;
      else { const k = parse(text); if (k.cat) { await search(k.cat, k.cui); out = advice((A.res || [])[0]) || 'No he encontrado nada cerca.'; } else out = 'No he entendido bien qué buscas. Prueba con «dónde comer», «cargador» o «parking».'; }
      A.chat.push({ r: 'a', t: out.trim() }); speakAI(out);
    } catch (e) { A.chat.push({ r: 'e', t: AI.explain(e) }); }
    A.chat = A.chat.slice(-8); A.thinking = false; refresh();
  }
  const chatHtml = () => `<div class="adv-ai">${AI.ready() ? '🤖 IA activa: ' + esc(AI.label()) : '💡 Modo básico. Activa la IA gratuita en Ajustes → Asistente IA para preguntas libres.'}</div>${A.chat.length || A.thinking ? `<div class="adv-chat">${A.chat.map(m => `<div class="bub ${m.r}">${esc(m.t)}</div>`).join('')}${A.thinking ? '<div class="bub a think">Pensando…</div>' : ''}</div>` : ''}`;
  function ask(text) {
    if (AI.ready() && (text || '').trim()) { A.q = ''; return askAI(text.trim()); }
    A.q = text = (text || '').trim(); if (!text) return toast('Escribe qué necesitas');
    const k = parse(text); if (k.cat) search(k.cat, k.cui); else search(null, null, text);
  }
  WIDGETS.advisor = { n: 'Asesor de viaje', cls: 'w-2x2', render: el => { el.classList.add('js-advw', 'advcard'); el.dataset.adv = 'widget'; draw(el, 'widget'); loadHere(); loadDest(); } };
  renderers.advisor = () => { const r = $('#p-advisor'); r.classList.add('js-advw'); r.dataset.adv = 'page'; draw(r, 'page'); loadHere(); loadDest(); };
  setInterval(() => { if ($('.js-advw')) { loadHere(); if (!A.expand && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('.adv'))) refresh(); } }, 60e3);

  /* Botón del asesor en la barra lateral (una sola vez) */
  if (!S.advDock && Array.isArray(S.dock) && !S.dock.some(x => x.t === 'page:advisor')) { S.dock.splice(Math.max(0, S.dock.length - 1), 0, { id: 'advisor', i: '🧠', n: 'Asesor', t: 'page:advisor' }); S.advDock = 1; save(); Ed.renderDock(); }
  return { suggest, logTrip, arrived, openState, week: weekTable, search, ask, parse, state: A, refresh };
})();

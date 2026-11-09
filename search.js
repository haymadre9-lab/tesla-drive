'use strict';
/* Buscador global de destinos. Es una capa fija por encima de TODAS las ventanas del dashboard (relojes, degradados, mapa),
   así la barra y lo que escribes siempre se ven, y el teclado no redimensiona el mapa.
   Autocompleta con Photon (rápido, tolera erratas, prioriza lo cercano) y usa Nominatim como respaldo/complemento. Todo gratuito, sin claves. */

const Search = (() => {
  let el, inp, list, seq = 0, tm, last = '';
  const rad = x => x * Math.PI / 180;
  const dist = (a, b) => { const R = 6371000, dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]), x = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  const here = () => GPS.pos ? [GPS.pos.latitude, GPS.pos.longitude] : S.lastPos || (typeof Nav !== 'undefined' && Nav.state.mx ? Nav.state.mx.center() : null);
  const fmt = m => m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + ' km' : Math.round(m / 10) * 10 + ' m';
  const j = async (u, ms = 9000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); } };
  const ICO = { fuel: '⛽', charging_station: '⚡', restaurant: '🍽', fast_food: '🍔', cafe: '☕', bar: '🍺', parking: '🅿️', hospital: '🏥', pharmacy: '💊', supermarket: '🛒', hotel: '🏨', bank: '🏦', school: '🎓', police: '🚓', train_station: '🚆', station: '🚆', aerodrome: '✈️', museum: '🏛', cinema: '🎬', car_repair: '🔧', bus_station: '🚌' };
  const CATS = [['⛽', 'Gasolineras', 'gasolinera'], ['⚡', 'Cargadores', 'cargador eléctrico'], ['🍽', 'Restaurantes', 'restaurante'], ['☕', 'Cafeterías', 'cafetería'], ['🅿️', 'Parking', 'parking'], ['💊', 'Farmacias', 'farmacia'], ['🏥', 'Hospitales', 'hospital'], ['🛒', 'Supermercados', 'supermercado']];

  /* ── Proveedores ── */
  async function photon(q) {
    const p = here(), loc = p ? `&lat=${p[0].toFixed(4)}&lon=${p[1].toFixed(4)}` : '';
    const r = await j(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10${loc}`);
    return (r.features || []).filter(f => f.geometry && f.geometry.coordinates).map(f => {
      const t = f.properties || {}, st = [t.street, t.housenumber].filter(Boolean).join(' '), name = t.name || st || t.city || q;
      const sub = [t.name && st ? st : '', t.district || t.locality, t.city && t.city !== name ? t.city : '', t.state, t.country].filter(Boolean).join(', ');
      return { name, sub, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], ico: ICO[t.osm_value] || (t.osm_key === 'place' ? '🏙' : t.osm_key === 'highway' ? '🛣' : '📍'), src: 'Photon' };
    });
  }
  /* TomTom (opcional): solo si has puesto tu clave en Ajustes → Mapa. La clave vive solo en este dispositivo (localStorage «leco.tt») */
  const ttKey = () => { try { return localStorage.getItem('leco.tt') || ''; } catch { return ''; } };
  async function tomtom(q) {
    const k = ttKey(); if (!k) return null; const p = here(), loc = p ? `&lat=${p[0].toFixed(4)}&lon=${p[1].toFixed(4)}` : '';
    const r = await j(`https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json?key=${encodeURIComponent(k)}&limit=8&language=es-ES&typeahead=true${loc}`);
    return (r.results || []).filter(x => x.position).map(x => ({ name: (x.poi && x.poi.name) || (x.address && (x.address.streetName ? x.address.streetName + (x.address.streetNumber ? ' ' + x.address.streetNumber : '') : x.address.municipality)) || q, sub: (x.address && x.address.freeformAddress) || '', lat: x.position.lat, lon: x.position.lon, ico: x.poi ? '📍' : '🏠', src: 'TomTom' }));
  }
  function ttDlg() {
    dlg(`<h3>Clave de TomTom</h3><div class="note">Opcional. Con tu clave, el buscador usa también TomTom (mejor con comercios y direcciones). Se guarda solo en este dispositivo: no se sincroniza ni se publica en GitHub.</div><label class="lab">API key<input class="in" id="ttk" type="password" autocomplete="off" placeholder="Pega tu clave" value="${esc(ttKey())}"></label><div id="ttr" class="note"></div><div class="acts"><button class="btn bad" id="ttd" type="button">Borrar</button><button class="btn sec" id="ttt" type="button">Probar</button><button class="btn" id="tts" type="button">Guardar</button><button class="btn sec" id="ttx" type="button">Cerrar</button></div>`, d => {
      const val = () => $('#ttk', d).value.trim(), out = t => { $('#ttr', d).textContent = t; };
      $('#ttx', d).onclick = closeDlg; $('#ttd', d).onclick = () => { try { localStorage.removeItem('leco.tt'); } catch { } closeDlg(); toast('Clave de TomTom borrada'); };
      $('#tts', d).onclick = () => { try { localStorage.setItem('leco.tt', val()); } catch { return toast('No se pudo guardar en este dispositivo'); } closeDlg(); toast(val() ? 'Clave de TomTom guardada' : 'Sin clave'); };
      $('#ttt', d).onclick = async () => { out('Probando…'); try { const r = await j(`https://api.tomtom.com/search/2/search/madrid.json?key=${encodeURIComponent(val())}&limit=1`); out('✔ La clave funciona (' + ((r.results || []).length) + ' resultado de prueba)'); } catch (e) { out('✘ No funciona: ' + e.message + (/403|401/.test(e.message) ? ' (clave rechazada o sin permiso para Search)' : '')); } };
    });
  }
  async function nominatim(q, bounded) {
    const p = here(), d = bounded ? .12 : .6, vb = p ? `&viewbox=${p[1] - d},${p[0] + d},${p[1] + d},${p[0] - d}${bounded ? '&bounded=1' : ''}` : '';
    const r = await j(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${bounded ? 12 : 8}&accept-language=es&q=${encodeURIComponent(q)}${vb}`);
    return r.map(x => { const parts = x.display_name.split(','); return { name: x.name || parts[0], sub: parts.slice(1, 4).join(',').trim(), lat: +x.lat, lon: +x.lon, ico: ICO[x.type] || '📍', src: 'Nominatim' }; });
  }
  const merge = (...ls) => { const out = []; ls.flat().forEach(x => { if (!out.some(o => Math.abs(o.lat - x.lat) < .0005 && Math.abs(o.lon - x.lon) < .0005 && o.name.toLowerCase() === x.name.toLowerCase())) out.push(x); }); return out; };

  /* ── Interfaz ── */
  function build() {
    el = document.createElement('div'); el.id = 'sx'; el.hidden = true;
    el.innerHTML = '<div class="sxp"><div class="sxbar"><input id="sxq" type="search" enterkeyhint="search" placeholder="Dirección, lugar o lat,lon" autocomplete="off" autocorrect="off" spellcheck="false"><button class="btn" id="sxgo" type="button">Buscar</button><button class="btn sec" id="sxx" type="button" aria-label="Cerrar"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 5L19 19M19 5L5 19" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg></button></div><div class="sxl" id="sxl"></div></div>';
    document.body.append(el); inp = $('#sxq', el); list = $('#sxl', el);
    $('#sxx', el).onclick = close; $('#sxgo', el).onclick = () => run(inp.value, true);
    el.addEventListener('pointerdown', e => { if (e.target === el) close(); });
    inp.addEventListener('input', () => { clearTimeout(tm); const q = inp.value.trim(); if (q.length < 2) { home(); return; } tm = setTimeout(() => run(q, false), 320); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(tm); run(inp.value, true); } if (e.key === 'Escape') close(); });
    const vv = window.visualViewport, fit = () => { const h = vv ? vv.height : innerHeight, t = vv ? vv.offsetTop : 0; el.style.setProperty('--sxh', h + 'px'); el.style.setProperty('--sxt', t + 'px'); };
    if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); } addEventListener('resize', fit); fit();
  }
  function open(q) {
    if (!el) build(); el.hidden = false; document.body.classList.add('searching'); last = '';
    inp.value = q || ''; if (q && q.trim().length > 1) run(q, true); else home();
    setTimeout(() => { inp.focus(); inp.select(); }, 60);
  }
  function close() { if (!el) return; el.hidden = true; document.body.classList.remove('searching'); seq++; inp.blur(); }
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return !t ? '' : m < 2 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : m < 2880 ? 'ayer' : `hace ${Math.round(m / 1440)} días`; };
  const norm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  function home() {
    const f = S.favs || {}, rec = S.navRecent || [], p = here();
    const item = (ico, t, s, attr, extra) => `<div class="sxi" ${attr}><span class="sxe">${ico}</span><div><b>${esc(t)}</b>${s ? `<small>${esc(s)}</small>` : ''}</div>${extra || ''}</div>`;
    list.innerHTML = (rec.length ? '<div class="sxh">Últimas rutas</div>' + rec.map((r, i) => item('🕘', r.name, [r.sub, ago(r.t)].filter(Boolean).join(' · '), `data-r="${i}"`, (p ? `<em>${fmt(dist(p, [r.lat, r.lon]))}</em>` : '') + `<button type="button" class="sxdel" data-del="${i}" aria-label="Quitar de la lista"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 5L19 19M19 5L5 19" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></button>`)).join('') : '') +
      '<div class="sxh">Sitios guardados</div>' +
      item('🏠', 'Casa', f.home ? f.home.name : 'Sin definir: termina una ruta y pulsa ⭐', f.home ? 'data-fav="home"' : 'data-none="1"') + item('💼', 'Trabajo', f.work ? f.work.name : 'Sin definir', f.work ? 'data-fav="work"' : 'data-none="1"') +
      `<div class="sxh">Buscar cerca</div><div class="sxc">${CATS.map((c, i) => `<button type="button" class="chip" data-c="${i}">${c[0]} ${c[1]}</button>`).join('')}</div>` +
      '<div class="sxh">Más</div>' + item('🗺', 'Cambiar de mapa', 'Usar otro mapa o PWA en esta ventana', 'data-act="map"') + (S.teslaMode ? '' : item('📲', 'Abrir en la app de GPS del móvil', 'Google Maps, Waze…', 'data-act="phone"')) +
      '<div class="note" style="padding:12px 16px">Escribe una dirección, un lugar o “lat,lon”: los resultados aparecen mientras escribes, los más cercanos primero.</div>';
    $$('[data-act]', list).forEach(d => d.onclick = () => { close(); d.dataset.act === 'map' ? Nav.switchMap() : Nav.openPhone(); });
    $$('[data-del]', list).forEach(b => b.onclick = e => { e.stopPropagation(); S.navRecent.splice(+b.dataset.del, 1); save(); home(); });
    $$('[data-fav]', list).forEach(d => d.onclick = () => pick(f[d.dataset.fav])); $$('[data-r]', list).forEach(d => d.onclick = () => pick(rec[+d.dataset.r]));
    $$('[data-c]', list).forEach(b => b.onclick = () => { const c = CATS[+b.dataset.c]; inp.value = c[2]; run(c[2], true, true); });
  }
  const note = (h, retry) => { list.innerHTML = `<div class="note" style="padding:14px 16px">${h}</div>${retry ? '<div style="padding:0 16px 14px"><button class="btn" id="sxr" type="button">Reintentar</button></div>' : ''}`; const r = $('#sxr', list); if (r) r.onclick = () => run(inp.value, true); };
  function show(rs, near, q) {
    const p = here();
    if (p) rs.forEach(r => r.d = dist(p, [r.lat, r.lon]));
    if (p && near !== false) rs.sort((a, b) => a.d - b.d); // por cercanía (lo más próximo primero)
    const nq = norm(q), mine = nq.length > 1 ? (S.navRecent || []).filter(r => norm(r.name + ' ' + (r.sub || '')).includes(nq)).slice(0, 3).map(r => ({ name: r.name, sub: [r.sub, 'ruta anterior'].filter(Boolean).join(' · '), lat: r.lat, lon: r.lon, ico: '🕘', d: p ? dist(p, [r.lat, r.lon]) : null, recent: true })) : [];
    rs = [...mine, ...rs.filter(x => !mine.some(m => Math.abs(m.lat - x.lat) < .0006 && Math.abs(m.lon - x.lon) < .0006))];
    list.innerHTML = rs.map((r, i) => `<div class="sxi" data-i="${i}"><span class="sxe">${r.ico}</span><div><b>${esc(r.name)}</b><small>${esc(r.sub || '')}</small></div>${r.d != null ? `<em>${fmt(r.d)}</em>` : ''}</div>`).join('');
    $$('.sxi', list).forEach(d => d.onclick = () => pick(rs[+d.dataset.i]));
  }
  async function run(q, full, near) {
    q = (q || '').trim(); if (!q) return home(); const my = ++seq; last = q;
    const m = q.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
    if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) return show([{ name: 'Coordenadas ' + q, sub: 'Ir a este punto', lat: +m[1], lon: +m[2], ico: '🎯' }], false);
    list.innerHTML = '<div class="note" style="padding:14px 16px">Buscando…</div>';
    const errs = [], tryP = async (n, f) => { try { return await f(); } catch (e) { errs.push(n + ': ' + (e.name === 'AbortError' ? 'tarda demasiado' : e.message)); return null; } };
    let rs; const tt = await tryP('TomTom', () => tomtom(q));
    if (tt && tt.length && !near) { if (my !== seq) return; return show(tt, true, q); }
    if (near) { rs = await tryP('Nominatim', () => nominatim(q, true)); if (!rs || !rs.length) { const r2 = await tryP('Photon', () => photon(q)); rs = r2 || rs; } }
    else if (full) { const [a, b] = await Promise.all([tryP('Photon', () => photon(q)), tryP('Nominatim', () => nominatim(q))]); rs = a || b ? merge(a || [], b || []) : null; }
    else { rs = await tryP('Photon', () => photon(q)); if (!rs || !rs.length) { const r2 = await tryP('Nominatim', () => nominatim(q)); rs = r2 || rs; } }
    if (my !== seq) return;
    if (!rs) return note('No se pudo buscar (' + esc(errs.join(' · ')) + '). Comprueba la conexión.', true);
    if (!rs.length && !(S.navRecent || []).some(r => norm(r.name + ' ' + (r.sub || '')).includes(norm(q)))) return note('Sin resultados para “' + esc(q) + '”. Prueba con más detalle (calle, número, ciudad).');
    show(rs, true, q);
  }
  function pick(d) {
    if (!d) return; close();
    const go2 = () => Nav.routeTo({ name: d.name, lat: d.lat, lon: d.lon, sub: d.recent || !d.sub ? (d.sub || '').replace(' · ruta anterior', '').replace('ruta anterior', '') : d.sub });
    if (Nav.state.mx && document.querySelector('.navwrap')) go2(); else { go('map'); setTimeout(go2, 700); }
  }
  ACTIONS.search = ['Buscar destino', () => open()]; const bs = document.getElementById('btnSearch'); if (bs) bs.onclick = () => open();
  return { ttKey, ttDlg, open, close, run: q => { if (!el) build(); inp.value = q; return run(q, true); } };
})();

/* Ajuste: motor del mapa (aquí porque CATS/OPT ya existen) */
OPT.mapEngine = [['', 'Automático (3D si el dispositivo lo admite)'], ['leaflet', 'Solo 2D clásico (más ligero)']];
CATS.mapa[1].unshift({ k: 'mapEngine', l: 'Motor del mapa', d: 'Si el mapa 3D va lento en la pantalla del coche, elige 2D clásico. Requiere recargar la página', type: 'select' });
ACTIONS.map3d = ['Mapa: vista 3D / 2D', () => Nav.toggle3d()];
CATS.mapa[1].push({ t: 'btn', get l() { return 'Clave de TomTom (opcional): ' + (Search.ttKey() ? 'configurada' : 'sin clave'); }, f: () => Search.ttDlg() });

'use strict';
/* Ficha completa de un sitio (desplegable del Asesor): todo lo que haya en OpenStreetMap, ordenado y traducido,
   más lo que falta por saber y enlaces para ver opiniones y fotos fuera. */

const Info = (() => {
  const YN = { yes: 'Sí', no: 'No', limited: 'Limitado', only: 'Solo para llevar', designated: 'Sí, reservado', customers: 'Solo clientes', private: 'Privado', permissive: 'Permitido', public: 'Público', wlan: 'Wi‑Fi', wired: 'Por cable', terminal: 'En terminal', outside: 'Solo fuera', isolated: 'En zona aparte', separated: 'En zona aparte', dedicated: 'Zona de fumadores' };
  const yn = v => YN[v] || String(v).replace(/_/g, ' ');
  const row = (k, v, raw) => v ? `<div class="dr"><dt>${k}</dt><dd>${raw ? v : esc(v)}</dd></div>` : '';
  const sec = (t, rows) => { const h = rows.filter(Boolean).join(''); return h ? `<div class="dsec"><h5>${t}</h5><dl>${h}</dl></div>` : ''; };
  const link = (u, t) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t || u)}</a>`;
  const url = u => /^https?:/i.test(u) ? u : 'https://' + u;
  const tel = p => String(p).split(/[;,]/).map(s => s.trim()).filter(Boolean).map(s => `<a href="tel:${esc(s.replace(/\s/g, ''))}">${esc(s)}</a>`).join(' · ');
  const list = (t, keys) => keys.filter(([k]) => t[k] === 'yes' || t[k] === 'designated').map(([, l]) => l).join(', ');
  const CUI = { pizza: 'Pizza', italian: 'Italiana', spanish: 'Española', regional: 'Regional', burger: 'Hamburguesas', japanese: 'Japonesa', sushi: 'Sushi', kebab: 'Kebab', chinese: 'China', mexican: 'Mexicana', indian: 'India', seafood: 'Marisco', steak_house: 'Carnes', grill: 'Parrilla', vegetarian: 'Vegetariana', vegan: 'Vegana', tapas: 'Tapas', mediterranean: 'Mediterránea', fish: 'Pescado', coffee_shop: 'Cafetería', sandwich: 'Bocadillos', ice_cream: 'Helados', bakery: 'Panadería', american: 'Americana', thai: 'Tailandesa', french: 'Francesa', greek: 'Griega', turkish: 'Turca', arab: 'Árabe', lebanese: 'Libanesa', peruvian: 'Peruana', chicken: 'Pollo', asian: 'Asiática', international: 'Internacional', breakfast: 'Desayunos', cake: 'Tartas', juice: 'Zumos' };
  const SOCK = { 'socket:tesla_supercharger': 'Supercharger Tesla', 'socket:tesla_destination': 'Tesla Destination', 'socket:tesla_standard': 'Tesla estándar', 'socket:type2_combo': 'CCS (Combo 2)', 'socket:type2': 'Tipo 2', 'socket:chademo': 'CHAdeMO', 'socket:type1_combo': 'CCS (Combo 1)', 'socket:type1': 'Tipo 1', 'socket:schuko': 'Schuko (enchufe doméstico)', 'socket:type3c': 'Tipo 3C' };

  function addrOf(x) { const t = x.tags, s = t['addr:street']; return [s && s + (t['addr:housenumber'] ? ' ' + t['addr:housenumber'] : ''), t['addr:postcode'], t['addr:city']].filter(Boolean).join(', ') || x.addr || ''; }
  const osmLink = x => /^(node|way|relation)\d+$/.test(x.id) ? `https://www.openstreetmap.org/${x.id.replace(/(\d+)$/, '/$1')}` : `https://www.openstreetmap.org/?mlat=${x.lat}&mlon=${x.lon}#map=18/${x.lat}/${x.lon}`;

  function imgOf(x, w = 240) { const t = x.tags || {}; return /^https:/i.test(t.image || '') ? t.image : t.wikimedia_commons && /^File:/i.test(t.wikimedia_commons) ? 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(t.wikimedia_commons.replace(/^File:/i, '')) + '?width=' + w : x.img || ''; }
  /* Insignia que se entiende de un vistazo (sin leer): parking = P verde si es gratis, azul si es de pago, gris si no se sabe;
     cargador = potencia (verde ≥ 100 kW, ámbar 40–99, gris menos o sin dato); gasolinera = 24 h en verde */
  function powerKw(t) { let m = 0; Object.keys(t).forEach(k => { if (/(^charging_station:output$|^socket:.*:output$)/.test(k)) { const n = parseFloat(String(t[k]).replace(',', '.')); if (n > m) m = n; } }); return m; }
  function badge(x) {
    const t = x.tags || {}, k = x.kind, is = v => k === v || (v === 'park' && t.amenity === 'parking') || (v === 'charge' && t.amenity === 'charging_station') || (v === 'fuel' && t.amenity === 'fuel');
    if (is('park')) { const c = t.fee === 'no' ? 'free' : t.fee === 'yes' ? 'paid' : 'unk', lab = c === 'free' ? 'Gratis' : c === 'paid' ? 'De pago' : 'Sin datos'; return `<span class="bdg ${c}" title="${lab}"><b>P</b><small>${lab}</small></span>`; }
    if (is('charge')) { const kw = powerKw(t), c = kw >= 100 ? 'free' : kw >= 40 ? 'mid' : 'unk'; return `<span class="bdg ${c}" title="Potencia máxima"><b>${kw ? Math.round(kw) : '⚡'}</b><small>${kw ? 'kW' : 'sin dato'}</small></span>`; }
    if (is('fuel')) { const h24 = /^24\/7$/i.test(String(t.opening_hours || '').trim()); return `<span class="bdg ${h24 ? 'free' : 'mid'}" title="Gasolinera"><b>⛽</b><small>${h24 ? '24 h' : ''}</small></span>`; }
    return '';
  }
  /* Fotos cercanas de Wikimedia Commons (solo si el sitio no trae foto propia): se buscan en un radio de 50 m al abrir la ficha */
  async function nearPhotos(x) {
    if (x.near) return x.near; const u = `https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${x.lat}|${x.lon}&ggsradius=50&ggslimit=6&ggsnamespace=6&prop=imageinfo&iiprop=url|mime&iiurlwidth=520&format=json&origin=*`;
    try { const j = await (await fetch(u)).json(); x.near = Object.values((j.query && j.query.pages) || {}).map(pg => pg.imageinfo && pg.imageinfo[0]).filter(i => i && /^image\/(jpeg|png)$/.test(i.mime) && i.thumburl).slice(0, 3).map(i => i.thumburl); } catch { x.near = []; }
    return x.near;
  }
  function html(x) {
    const t = x.tags, k = x.kind, phone = x.phone || t['contact:mobile'] || '', web = x.web, email = t.email || t['contact:email'];
    const addr = addrOf(x), out = [];
    // 1) Contacto y ubicación
    const soc = (u, h) => !u ? '' : /^https?:/i.test(u) ? link(u, h) : link(h + u.replace(/^@/, ''), u);
    out.push(sec('📍 Contacto y ubicación', [
      row('Dirección', addr ? esc(addr) : (x.addrTried && !x.addr ? '<i>sin dirección registrada</i>' : '<i class="addr-v">buscando dirección…</i>'), true),
      row('Teléfono', phone && tel(phone), true), row('Email', email && `<a href="mailto:${esc(email)}">${esc(email)}</a>`, true), row('Web', web && link(url(web), web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')), true),
      row('Facebook', t['contact:facebook'] && soc(t['contact:facebook'], 'https://facebook.com/'), true), row('Instagram', t['contact:instagram'] && soc(t['contact:instagram'], 'https://instagram.com/'), true),
      row('Distancia', `${x.est ? '≈' : ''}${x.min} min en coche · ${x.d >= 1000 ? (x.d / 1000).toFixed(1) + ' km' : Math.round(x.d) + ' m'} en línea recta`),
    ]));
    // 2) Horario
    const wk = typeof Adv !== 'undefined' ? Adv.week(t.opening_hours) : null, today = new Date().getDay();
    out.push(sec('🕒 Horario', [
      `<div class="dr"><dt>Ahora</dt><dd><span class="${x.open.s}">${esc(x.open.msg)}</span></dd></div>`,
      /^24\/7$/i.test(String(t.opening_hours || '').trim()) ? '' : wk ? `<table class="wk">${wk.map(d => `<tr class="${d.d === today ? 'hoy' : ''}"><td>${d.n}</td><td>${esc(d.v)}</td></tr>`).join('')}</table>` : row('Horario (texto original)', t.opening_hours),
      row('Cocina / servicio', t['opening_hours:kitchen'] && t['opening_hours:kitchen']),
    ]));
    // 3) Según el tipo de sitio
    if (k === 'eat' || k === 'cafe' || t.amenity === 'restaurant' || t.amenity === 'cafe') {
      out.push(sec('🍽 Cocina y servicio', [
        row('Cocina', t.cuisine && t.cuisine.split(';').map(s => CUI[s.trim()] || yn(s.trim())).join(', ')),
        row('Dieta', list(t, [['diet:vegetarian', 'Vegetariana'], ['diet:vegan', 'Vegana'], ['diet:gluten_free', 'Sin gluten'], ['diet:halal', 'Halal'], ['diet:kosher', 'Kosher'], ['diet:lactose_free', 'Sin lactosa']])),
        row('Servicio', list(t, [['outdoor_seating', 'Terraza'], ['indoor_seating', 'Mesas dentro'], ['takeaway', 'Para llevar'], ['delivery', 'A domicilio'], ['drive_through', 'Autoservicio en coche'], ['reservation', 'Admite reserva']]) || (t.takeaway === 'only' ? 'Solo para llevar' : '')),
        row('Reserva', t.reservation && !['yes'].includes(t.reservation) ? yn(t.reservation) : ''), row('Asientos', t.capacity && t.capacity + ' plazas'),
        row('Precio', t['price'] || t['charge'] || (t['payment:cash'] === 'only' ? 'Solo efectivo' : '')),
        row('Marca / cadena', t.brand), row('Estrellas', t.stars), row('Desde', t.start_date), row('Descripción', t.description || t['description:es']),
      ]));
      out.push(sec('♿ Comodidades', [
        row('Wi‑Fi', t.internet_access && (yn(t.internet_access) + (t['internet_access:fee'] === 'no' ? ' gratis' : t['internet_access:fee'] === 'yes' ? ' de pago' : ''))),
        row('Acceso silla de ruedas', t.wheelchair && yn(t.wheelchair) + (t['wheelchair:description'] ? ' · ' + t['wheelchair:description'] : '')), row('Aseos accesibles', t['toilets:wheelchair'] && yn(t['toilets:wheelchair'])), row('Aseos', t.toilets && yn(t.toilets)),
        row('Aire acondicionado', t.air_conditioning && yn(t.air_conditioning)), row('Fumar', t.smoking && yn(t.smoking)), row('Música en directo', t.live_music && yn(t.live_music)), row('Se admiten perros', t.dog && yn(t.dog)),
        row('Pago', list(t, [['payment:cash', 'Efectivo'], ['payment:cards', 'Tarjeta'], ['payment:credit_cards', 'Tarjeta de crédito'], ['payment:debit_cards', 'Tarjeta de débito'], ['payment:contactless', 'Contactless'], ['payment:apple_pay', 'Apple Pay'], ['payment:google_pay', 'Google Pay']])),
      ]));
    }
    if (k === 'charge' || t.amenity === 'charging_station') {
      const socks = Object.keys(SOCK).filter(s => t[s] && t[s] !== 'no').map(s => `<tr><td>${SOCK[s]}</td><td>${/^\d+$/.test(t[s]) ? '×' + t[s] : ''}</td><td>${esc([t[s + ':output'], t[s + ':current'] && t[s + ':current'].toUpperCase()].filter(Boolean).join(' · '))}</td></tr>`).join('');
      out.push(sec('⚡ Carga', [
        socks ? `<table class="wk sk"><tr><th>Enchufe</th><th>Puestos</th><th>Potencia</th></tr>${socks}</table>` : '', row('Potencia', t['charging_station:output']), row('Puntos de carga', t.capacity),
        row('Operador', t.operator || t.brand), row('Red', t.network), row('Referencia', t.ref),
        row('Autenticación', list(t, [['authentication:app', 'App'], ['authentication:membership_card', 'Tarjeta de socio'], ['authentication:nfc', 'NFC'], ['authentication:none', 'Sin registro'], ['authentication:phone_call', 'Llamada'], ['authentication:debit_card', 'Tarjeta bancaria'], ['authentication:credit_card', 'Tarjeta bancaria']])),
        row('Tarifa', t.fee === 'no' ? 'Gratis' : [t.fee === 'yes' ? 'De pago' : '', t.charge].filter(Boolean).join(' · ')), row('Aparcamiento', t.parking_fee && 'Tarifa de parking: ' + yn(t.parking_fee)), row('Acceso', t.access && yn(t.access)), row('Estancia máxima', t.maxstay),
      ]));
    }
    if (k === 'park' || t.amenity === 'parking') {
      out.push(sec('🅿️ Parking', [
        row('Tarifa', t.fee === 'no' ? 'Gratuito' : [t.fee === 'yes' ? 'De pago' : '', t.charge].filter(Boolean).join(' · ') || 'Sin datos de tarifa'),
        row('Plazas', t.capacity), row('Plazas movilidad reducida', t['capacity:disabled']), row('Plazas con carga eléctrica', t['capacity:charging']),
        row('Tipo', t.parking && ({ underground: 'Subterráneo', 'multi-storey': 'Varias plantas', surface: 'En superficie', street_side: 'En la calle', lane: 'En la calle', rooftop: 'En azotea' }[t.parking] || yn(t.parking))),
        row('Altura máxima', t.maxheight), row('Estancia máxima', t.maxstay), row('Cubierto', t.covered && yn(t.covered)), row('Superficie', t.surface && yn(t.surface)), row('Vigilado', t.supervised && yn(t.supervised)), row('Iluminado', t.lit && yn(t.lit)), row('Acceso', t.access && yn(t.access)), row('Operador', t.operator), row('Park & Ride', t.park_ride && yn(t.park_ride)),
      ]));
    }
    if (k === 'fuel' || t.amenity === 'fuel') {
      out.push(sec('⛽ Gasolinera', [
        row('Combustibles', list(t, [['fuel:diesel', 'Diésel'], ['fuel:octane_95', 'Gasolina 95'], ['fuel:octane_98', 'Gasolina 98'], ['fuel:octane_100', 'Gasolina 100'], ['fuel:lpg', 'GLP'], ['fuel:cng', 'GNC'], ['fuel:electricity', 'Carga eléctrica'], ['fuel:adblue', 'AdBlue']])),
        row('Autoservicio', t.self_service && yn(t.self_service)), row('Tienda', t.shop && yn(t.shop)), row('Lavado de coches', t.car_wash && yn(t.car_wash)), row('Aire para neumáticos', t.compressed_air && yn(t.compressed_air)), row('Marca', t.brand), row('Operador', t.operator),
      ]));
    }
    if (!['eat', 'cafe', 'charge', 'park', 'fuel'].includes(k)) out.push(sec('ℹ️ Datos', [row('Marca', t.brand), row('Operador', t.operator), row('Estrellas', t.stars), row('Habitaciones', t.rooms), row('Descripción', t.description || t['description:es']), row('Acceso silla de ruedas', t.wheelchair && yn(t.wheelchair)), row('Entrada', t.fee && yn(t.fee)), row('Wi‑Fi', t.internet_access && yn(t.internet_access))]));
    // 5) Qué falta por saber
    const need = { eat: [['horario', t.opening_hours], ['teléfono', phone], ['web', web], ['tipo de cocina', t.cuisine], ['accesibilidad', t.wheelchair]], cafe: [['horario', t.opening_hours], ['teléfono', phone], ['web', web], ['accesibilidad', t.wheelchair]], charge: [['horario', t.opening_hours], ['potencia', t['charging_station:output'] || Object.keys(t).some(s => /^socket:.*:output$/.test(s)) || ''], ['enchufes', Object.keys(SOCK).some(s => t[s])], ['tarifa', t.fee || t.charge], ['acceso', t.access]], park: [['tarifa', t.fee || t.charge], ['plazas', t.capacity], ['horario', t.opening_hours], ['altura máxima', t.maxheight]], fuel: [['horario', t.opening_hours], ['combustibles', Object.keys(t).some(s => /^fuel:/.test(s))], ['marca', t.brand]] }[k] || [['horario', t.opening_hours], ['teléfono', phone], ['web', web]];
    const miss = need.filter(([, v]) => !v).map(([n]) => n);
    out.push(`<div class="dsec wide"><h5>🔎 Para decidir</h5><div class="dmiss">${miss.length ? `No hay datos de: <b>${miss.join(', ')}</b>.` : 'Los datos de este sitio están bastante completos.'} OpenStreetMap no tiene opiniones de clientes ni precios de carta. Para ver <b>valoraciones y fotos</b>, ábrelo en <a href="https://www.google.com/maps/search/?api=1&query=${x.lat},${x.lon}" target="_blank" rel="noopener">Google Maps ↗</a>.</div>
      <div class="dlinks">${link(osmLink(x), '🗺 Ver en OpenStreetMap')}${typeof AI !== 'undefined' && AI.ready() ? '<button class="btn sec" data-aisum type="button">✨ Resumen con IA</button>' : ''}</div><div class="ai-sum">${x.aiSum ? esc(x.aiSum) : ''}</div></div>`);
    // 6) Todos los datos
    const keys = Object.keys(t).sort();
    out.push(`<details class="dsec wide draw"><summary>Ver todos los datos del sitio (${keys.length})</summary><div class="raw">${keys.map(k2 => `<div><code>${esc(k2)}</code> = ${esc(t[k2])}</div>`).join('')}</div></details>`);
    const img = imgOf(x, 520), bd = badge(x);
    const hero = `<div class="dhero wide">${bd ? `<div class="dbig">${bd}</div>` : ''}<div class="dph">${img ? `<img class="dimg" src="${esc(img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div><div class="dcap"></div></div>`;
    return `<div class="dgrid2">${hero}${out.join('')}</div>`;
  }

  /* Dirección bajo demanda (si OSM no la trae) y resumen con IA */
  function bind(x, el) {
    if (!addrOf(x) && !x.addrTried) {
      x.addrTried = true;
      fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=es&lat=${x.lat}&lon=${x.lon}`).then(r => r.json()).then(j => {
        const a = j.address || {}; x.addr = [a.road && a.road + (a.house_number ? ' ' + a.house_number : ''), a.postcode, a.city || a.town || a.village].filter(Boolean).join(', ');
        const v = $('.addr-v', el); if (v) v.outerHTML = x.addr ? esc(x.addr) : '<i>sin dirección registrada</i>';
      }).catch(() => { const v = $('.addr-v', el); if (v) v.outerHTML = '<i>no se pudo cargar la dirección</i>'; });
    }
    if (!imgOf(x) && !x.nearDone) { x.nearDone = true; nearPhotos(x).then(ph => { const box = $('.dph', el), cap = $('.dcap', el); if (!ph.length || !box || box.querySelector('img')) return; box.innerHTML = ph.map(u => `<img class="dimg" src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()">`).join(''); if (cap) cap.textContent = 'Fotos cercanas de Wikimedia Commons: pueden no ser de este sitio exacto.'; }); }
    const b = $('[data-aisum]', el);
    if (b) b.onclick = async () => {
      b.disabled = true; b.textContent = 'Pensando…'; const box = $('.ai-sum', el);
      const data = { nombre: x.n, tipo: x.kind, minutos_en_coche: x.min, estado: x.open.msg, direccion: addrOf(x), detalles: x.info, datos: Object.fromEntries(Object.entries(x.tags).filter(([k]) => !/^(name|source|addr:|check_date|wikidata|wikipedia)/.test(k)).slice(0, 40)) };
      try { x.aiSum = (await AI.call('Resume en español, en 2 o 3 frases, qué sabemos de este sitio para ayudar a decidir si ir. Usa solo los datos dados; no inventes valoraciones, precios ni platos. Si faltan datos importantes, dilo.', JSON.stringify(data))).trim(); box.textContent = x.aiSum; } catch (e) { box.textContent = AI.explain(e); }
      b.disabled = false; b.textContent = '✨ Resumen con IA';
    };
  }
  return { html, bind, addrOf, imgOf, badge };
})();

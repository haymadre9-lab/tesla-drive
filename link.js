'use strict';
/* Enlace entre dispositivos y apps: el destino que eliges aquí aparece en D3D Clone (hudMapa3D) y en Autoboard-nav, y al revés.
   Mismo protocolo y mismo código que esas dos apps: un tema público de ntfy.sh llamado «d3dclone-<código>» con mensajes {d, n, la, lo}
   (d = id del dispositivo que lo envía, n = nombre, la/lo = coordenadas). Solo viaja el destino: nada de ajustes, favoritos ni historial.
   Sin cuenta ni servidor propio. Funciona igual en la PWA y en el APK.
   Aviso: el tema es público; quien conozca el código puede ver y enviar destinos. Usa un código largo y no lo compartas. */

const Link = (() => {
  const BASE = 'https://ntfy.sh/', K = { code: 'leco.link.code', dev: 'leco.link.dev', last: 'leco.link.last' };
  const rd = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
  const wr = (k, v) => { try { localStorage.setItem(k, v); } catch { } };
  const L = { code: rd(K.code, ''), device: rd(K.dev, '') || (() => { const d = Math.random().toString(36).slice(2, 10); wr(K.dev, d); return d; })(), es: null, gen: 0, estado: '', onState: null };
  const topic = () => 'd3dclone-' + L.code.toLowerCase().replace(/[^a-z0-9]/g, '');
  const valid = () => L.code.replace(/[^a-zA-Z0-9]/g, '').length >= 6;
  const state = s => { L.estado = s; if (L.onState) L.onState(s); };
  const randomCode = () => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; for (let i = 0; i < 10; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };

  /* Enviar el destino elegido a los demás dispositivos/apps con el mismo código */
  function publish(d) {
    if (!valid() || !d || !Number.isFinite(d.lat) || !Number.isFinite(d.lon)) return;
    const body = JSON.stringify({ d: L.device, n: d.name || 'Destino', la: d.lat, lo: d.lon });
    fetch(BASE + topic(), { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } }).catch(() => { }); // sin conexión: el enlace es «lo mejor posible»
  }
  /* Enviar un enlace de música/vídeo al otro dispositivo (así no hay que escribirlo en el coche). Solo viaja el enlace. */
  function publishMedia(u) {
    if (!valid() || !u) return false;
    fetch(BASE + topic(), { method: 'POST', body: JSON.stringify({ d: L.device, u: String(u).slice(0, 600), n: 'media' }), headers: { 'Content-Type': 'text/plain' } }).catch(() => { });
    return true;
  }
  /* Un enlace recibido: solo se abre si es de un servicio conocido (se convierte a su embed oficial; nunca se abre una URL cualquiera) */
  function receiveMedia(u) {
    const r = typeof mediaEmbed === 'function' ? mediaEmbed(u) : null; if (!r) return;
    toast('🎶 Recibido: ' + r.n, 3500); openFloat({ id: 'media-rx', n: r.n, e: '🎶', u: r.u, orig: u, smart: 1 });
    if (typeof Media !== 'undefined') Media.remember(u);
  }
  /* Un destino recibido: arranca la ruta (sin volver a publicarlo, para no hacer ping-pong entre dispositivos) */
  function receive(p) {
    toast('📲 Destino recibido: ' + String(p.name).split(',')[0], 3500);
    const go2 = () => Nav.routeTo({ name: p.name, lat: p.lat, lon: p.lon, link: true });
    if (Nav.state.mx && document.querySelector('.navwrap')) go2(); else { go('map'); setTimeout(go2, 800); }
  }
  function start() {
    if (L.es) { L.es.close(); L.es = null; }
    const gen = ++L.gen;
    if (!valid()) return state(L.code ? 'Código demasiado corto (mínimo 6)' : 'Sin código: no enlazado');
    state('Conectando…'); let es; try { es = new EventSource(BASE + topic() + '/sse?since=3h'); } catch { return state('Sin conexión'); }
    L.es = es;
    es.onopen = () => { if (gen === L.gen) state('Enlazado · código ' + L.code); };
    es.onerror = () => { if (gen === L.gen) state('Sin conexión (reintentando)'); };
    es.onmessage = ev => {
      if (gen !== L.gen) return;
      try {
        const m = JSON.parse(ev.data); if (m.event !== 'message') return;
        const t = +m.time || 0; if (t <= +rd(K.last, '0')) return; wr(K.last, String(t));
        const j = JSON.parse(m.message); if (j.d === L.device) return; // lo envié yo
        if (typeof j.u === 'string') { if (Date.now() / 1000 - t <= 1800) receiveMedia(j.u); return; }
        if (typeof j.la !== 'number' || typeof j.lo !== 'number') return;
        if (Date.now() / 1000 - t > 1800) return; // mensajes de hace más de 30 min: no arrancar una ruta vieja al abrir la app
        receive({ name: String(j.n || 'Destino'), lat: j.la, lon: j.lo });
      } catch { }
    };
  }
  function setCode(c) { L.code = (c || '').trim(); wr(K.code, L.code); wr(K.last, String(Math.floor(Date.now() / 1000))); start(); }

  function dialog() {
    dlg(`<h3>Enlace con D3D Clone y Autoboard-nav</h3><div class="note">El destino que elijas aquí aparecerá en las otras apps con el <b>mismo código</b>, y el que elijas allí arrancará la ruta aquí. Sirve en la PWA y en el APK. Solo viaja el destino (nombre y coordenadas).</div>
      <label class="lab">Código de enlace (mínimo 6; el mismo en todas las apps)<div class="adv-ask"><input class="in" id="lkc" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(L.code)}"><button class="btn sec" id="lkg" type="button">Generar</button></div></label>
      <div class="note" id="lks"></div>
      <div class="note">⚠️ El canal es público: quien conozca el código podría ver y enviar destinos. Usa un código largo (el botón Generar crea uno de 10 caracteres) y no lo compartas.</div>
      <div class="acts"><button class="btn bad" id="lkd" type="button">Desenlazar</button><button class="btn sec" id="lkt" type="button">Enviar prueba</button><button class="btn" id="lks2" type="button">Guardar</button><button class="btn sec" id="lkx" type="button">Cerrar</button></div>`, d => {
      const st = $('#lks', d), upd = s => { if (st.isConnected) st.textContent = 'Estado: ' + s; }; L.onState = upd; upd(L.estado || 'Sin código: no enlazado');
      $('#lkg', d).onclick = () => { $('#lkc', d).value = randomCode(); };
      $('#lks2', d).onclick = () => { setCode($('#lkc', d).value); toast(valid() ? 'Enlace activado' : 'Código demasiado corto'); if (valid()) closeDlg(); };
      $('#lkd', d).onclick = () => { setCode(''); $('#lkc', d).value = ''; toast('Desenlazado'); };
      $('#lkt', d).onclick = () => { if (!valid()) return toast('Primero guarda un código válido'); const c = S.lastPos || [40.4168, -3.7038]; publish({ name: 'Prueba de enlace', lat: c[0], lon: c[1] }); toast('Prueba enviada: debe aparecer en las otras apps'); };
      $('#lkx', d).onclick = () => { L.onState = null; closeDlg(); };
    });
  }
  start();
  CATS.mapa[1].push({ t: 'btn', get l() { return 'Enlace con D3D Clone / Autoboard-nav: ' + (valid() ? 'código ' + L.code : 'sin enlazar'); }, f: dialog });
  return { publishMedia, publish, setCode, start, dialog, state: L, valid };
})();

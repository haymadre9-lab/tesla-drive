'use strict';
/* Notas de voz del móvil → Tesla Drive.
   La app «Notas de Voz» (carpeta voicenotes/) publica cada nota cifrada en un tema de ntfy.sh y aquí se reciben, se guardan en este
   dispositivo y se pueden ordenar por fecha o cercanía y convertir en ruta.
   Privacidad: el tema se llama «ln-» + hash del código (no el código) y el contenido va cifrado con AES-GCM (clave PBKDF2 del código),
   así que ntfy.sh solo ve texto cifrado. Quien conozca el código sí puede leer las notas: usa el código generado y no lo compartas.
   Las notas con ubicación NO arrancan ninguna ruta por sí solas: tú eliges «Ir» o «Buscar». */

const Notes = (() => {
  const BASE = 'https://ntfy.sh/', MAX = 500;
  const K = { code: 'leco.notes.code', list: 'leco.notes.list', del: 'leco.notes.del' };
  const rd = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
  const wr = (k, v) => { try { localStorage.setItem(k, v); } catch { } };
  const js = (k, d) => { try { const v = JSON.parse(rd(k, '')); return v ?? d; } catch { return d; } };
  const CAT = { trabajo: '💼', casa: '🏠', compra: '🛒', lugar: '📍', general: '📝' };
  const N = { code: rd(K.code, ''), list: js(K.list, []), del: js(K.del, []), es: null, gen: 0, estado: '', onState: null, sort: 'date', cat: 'todas' };
  const norm = c => String(c || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const valid = () => norm(N.code).length >= 8;
  const state = s => { N.estado = s; if (N.onState) N.onState(s); };
  const randomCode = () => { const a = 'abcdefghjkmnpqrstuvwxyz23456789', r = crypto.getRandomValues(new Uint8Array(12)); return [...r].map(x => a[x % a.length]).join(''); };

  /*CRYPTO-START*/
  const ENC = new TextEncoder();
  async function derive(code) {
    const c = String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const h = await crypto.subtle.digest('SHA-256', ENC.encode('topic:' + c));
    const topic = 'ln-' + [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    const base = await crypto.subtle.importKey('raw', ENC.encode(c), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: ENC.encode('lecoauto-notas-v1'), iterations: 100000 }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return { topic, key };
  }
  async function decrypt(key, msg) {
    if (typeof msg !== 'string' || !msg.startsWith('e1:')) throw new Error('formato');
    const raw = Uint8Array.from(atob(msg.slice(3)), ch => ch.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  /*CRYPTO-END*/

  const save = () => { N.list.sort((a, b) => b.s - a.s); N.list = N.list.slice(0, MAX); wr(K.list, JSON.stringify(N.list)); wr(K.del, JSON.stringify(N.del.slice(-MAX))); refreshBtn(); };
  function accept(j) {
    if (!j || typeof j.i !== 'string' || typeof j.t !== 'string' || !j.t.trim()) return false;
    if (N.del.includes(j.i) || N.list.some(n => n.i === j.i)) return false;
    const ok = typeof j.la === 'number' && typeof j.lo === 'number' && Math.abs(j.la) <= 90 && Math.abs(j.lo) <= 180;
    N.list.push({ i: j.i.slice(0, 60), t: j.t.slice(0, 2000), c: CAT[j.c] ? j.c : 'general', s: +j.s || Date.now(), la: ok ? j.la : null, lo: ok ? j.lo : null });
    return true;
  }

  async function start() {
    if (N.es) { N.es.close(); N.es = null; }
    const gen = ++N.gen;
    if (!valid()) return state(N.code ? 'Código demasiado corto (mínimo 8)' : 'Sin código: no enlazado');
    state('Conectando…');
    let d; try { d = await derive(N.code); } catch { return state('Este navegador no admite cifrado (necesita HTTPS)'); }
    if (gen !== N.gen) return;
    let es; try { es = new EventSource(BASE + d.topic + '/sse?since=all'); } catch { return state('Sin conexión'); }
    N.es = es;
    es.onopen = () => { if (gen === N.gen) state('Enlazado · ' + N.list.length + ' notas'); };
    es.onerror = () => { if (gen === N.gen) state('Sin conexión (reintentando)'); };
    es.onmessage = async ev => {
      if (gen !== N.gen) return;
      try {
        const m = JSON.parse(ev.data); if (m.event !== 'message') return;
        const j = await decrypt(d.key, m.message);
        if (accept(j)) { save(); toast('📝 Nota nueva: ' + j.t.slice(0, 60), 3500); if (N.onState) N.onState('Enlazado · ' + N.list.length + ' notas'); }
      } catch { /* mensaje ajeno o corrupto: se ignora */ }
    };
  }
  function setCode(c) { N.code = String(c || '').trim(); wr(K.code, N.code); start(); }

  const dist = n => { const p = S.lastPos; if (!p || n.la == null) return null; const R = 6371000, r = x => x * Math.PI / 180, dl = r(n.la - p[0]), dn = r(n.lo - p[1]); const a = Math.sin(dl / 2) ** 2 + Math.cos(r(p[0])) * Math.cos(r(n.la)) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); };
  const fmtD = m => m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km';
  const fmtT = s => new Date(s).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  function routeTo(n) {
    closeDlg();
    const go2 = () => Nav.routeTo({ name: n.t, lat: n.la, lon: n.lo, link: true });
    if (Nav.state.mx && document.querySelector('.navwrap')) go2(); else { go('map'); setTimeout(go2, 800); }
  }

  function rows() {
    let l = N.list.filter(n => N.cat === 'todas' || n.c === N.cat);
    if (N.sort === 'near' && S.lastPos) l = l.slice().sort((a, b) => (dist(a) ?? 1e12) - (dist(b) ?? 1e12));
    return l;
  }

  function dialog() {
    dlg(`<h3>📝 Notas del móvil</h3>
      <div class="adv-ask"><select class="in" id="ntc"><option value="todas">Todas</option>${Object.keys(CAT).map(c => `<option value="${c}">${CAT[c]} ${c}</option>`).join('')}</select>
      <button class="btn sec" id="nts" type="button"></button></div>
      <div class="note" id="nte"></div>
      <div id="ntl"></div>
      <div class="acts"><button class="btn sec" id="ntk" type="button">Enlace</button><button class="btn" id="ntx" type="button">Cerrar</button></div>`, d => {
      const list = $('#ntl', d), sel = $('#ntc', d), sb = $('#nts', d), st = $('#nte', d);
      sel.value = N.cat;
      const draw = () => {
        sb.textContent = N.sort === 'near' ? 'Orden: cercanía' : 'Orden: fecha';
        st.textContent = 'Estado: ' + (N.estado || 'Sin código: no enlazado');
        const l = rows();
        list.innerHTML = l.length ? l.map((n, i) => { const m = dist(n); return `<div class="note nt" data-i="${i}"><b>${CAT[n.c]} ${esc(n.c)}</b> · ${esc(fmtT(n.s))}${m != null ? ' · 📍 ' + fmtD(m) : n.la != null ? ' · 📍' : ''}<br>${esc(n.t)}<div class="acts">${n.la != null ? '<button class="btn" data-a="go" type="button">🧭 Ir al punto</button>' : ''}<button class="btn sec" data-a="find" type="button">🔎 Buscar</button><button class="btn bad" data-a="del" type="button">✕</button></div></div>`; }).join('') : '<div class="note">No hay notas todavía. Dicta una desde la app del móvil.</div>';
        list._l = l;
      };
      N.onState = draw; draw();
      sel.onchange = () => { N.cat = sel.value; draw(); };
      sb.onclick = () => { N.sort = N.sort === 'near' ? 'date' : 'near'; draw(); };
      list.onclick = e => {
        const b = e.target.closest('button[data-a]'); if (!b) return;
        const n = list._l[+b.closest('[data-i]').dataset.i]; if (!n) return;
        if (b.dataset.a === 'go') routeTo(n);
        else if (b.dataset.a === 'find') { closeDlg(); Nav.prefill(n.t); }
        else { N.list = N.list.filter(x => x.i !== n.i); N.del.push(n.i); save(); draw(); }
      };
      $('#ntk', d).onclick = () => { N.onState = null; linkDialog(); };
      $('#ntx', d).onclick = () => { N.onState = null; closeDlg(); };
    });
  }

  function linkDialog() {
    dlg(`<h3>Enlace con la app Notas de Voz</h3><div class="note">Escribe el mismo código en la app del móvil. Las notas viajan <b>cifradas</b> y quedan guardadas solo en este dispositivo. La app del móvil las reenvía si estaba sin cobertura; si abres Tesla Drive más de 12 h después de dictarlas, pulsa «Reenviar» en el móvil.</div>
      <label class="lab">Código (mínimo 8)<div class="adv-ask"><input class="in" id="nkc" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(N.code)}"><button class="btn sec" id="nkg" type="button">Generar</button></div></label>
      <div class="note" id="nks"></div>
      <div class="note">⚠️ Quien conozca el código puede leer tus notas. Usa el generado y no lo compartas.</div>
      <div class="acts"><button class="btn bad" id="nkd" type="button">Desenlazar</button><button class="btn" id="nkv" type="button">Guardar</button><button class="btn sec" id="nkx" type="button">Cerrar</button></div>`, d => {
      const st = $('#nks', d), upd = s => { if (st.isConnected) st.textContent = 'Estado: ' + s; }; N.onState = upd; upd(N.estado || 'Sin código: no enlazado');
      $('#nkg', d).onclick = () => { $('#nkc', d).value = randomCode(); };
      $('#nkv', d).onclick = () => { setCode($('#nkc', d).value); toast(valid() ? 'Enlace activado' : 'Código demasiado corto'); if (valid()) { N.onState = null; closeDlg(); } };
      $('#nkd', d).onclick = () => { setCode(''); $('#nkc', d).value = ''; toast('Desenlazado'); };
      $('#nkx', d).onclick = () => { N.onState = null; closeDlg(); };
    });
  }

  function refreshBtn() { const b = document.getElementById('btnNotes'); if (b) b.title = 'Notas del móvil (' + N.list.length + ')'; }
  const b = document.getElementById('btnNotes'); if (b) b.onclick = dialog;
  refreshBtn(); start();
  CATS.mapa[1].push({ t: 'btn', get l() { return 'Notas de voz del móvil: ' + (valid() ? N.list.length + ' notas' : 'sin enlazar'); }, f: dialog });
  return { dialog, linkDialog, setCode, start, state: N, derive, decrypt };
})();

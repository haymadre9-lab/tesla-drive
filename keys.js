'use strict';
/* Enviar las claves de API de un dispositivo a otro (móvil → coche) sin escribirlas en el coche.
   · Qué viaja (solo lo que elijas): clave de la IA (proveedor + clave + modelo), TomTom, YouTube y el código de las notas de voz.
     NO viaja el token de GitHub: da permiso de escritura en tu repositorio y solo hace falta en el móvil.
   · Cifrado: AES-GCM con una clave derivada (PBKDF2, 100 000 vueltas) del código de enlace; el tema de ntfy.sh se llama «lk-» + hash.
     ntfy.sh solo ve texto cifrado. Quien conozca tu código de enlace podría descifrarlo: por eso se exige un código de 10 caracteres o más.
   · Al recibirlas, el dispositivo pregunta antes de guardarlas (nada se sobrescribe sin que lo aceptes). */

const Keys = (() => {
  const BASE = 'https://ntfy.sh/', ENC = new TextEncoder(), MAXAGE = 12 * 3600e3;
  const LS = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { } }, del: k => { try { localStorage.removeItem(k); } catch { } } };
  const norm = c => String(c || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const code = () => (typeof Link !== 'undefined' && Link.state && Link.state.code) || '';
  const ready = () => norm(code()).length >= 10;
  const device = () => (typeof Link !== 'undefined' && Link.state && Link.state.device) || '';
  /* Qué claves hay en este dispositivo */
  const ITEMS = [
    { id: 'ai', n: 'Asistente IA (Groq, Gemini u OpenRouter)', has: () => { try { const j = JSON.parse(LS.get('leco.ai') || '{}'); return !!j.key; } catch { return false; } }, get: () => LS.get('leco.ai'), set: v => LS.set('leco.ai', v) },
    { id: 'tt', n: 'TomTom (buscador y límite de velocidad)', has: () => !!LS.get('leco.tt'), get: () => LS.get('leco.tt'), set: v => LS.set('leco.tt', v) },
    { id: 'yt', n: 'YouTube (buscar vídeos)', has: () => !!LS.get('leco.yt'), get: () => LS.get('leco.yt'), set: v => LS.set('leco.yt', v) },
    { id: 'nc', n: 'Código de las notas de voz', has: () => !!LS.get('leco.notes.code'), get: () => LS.get('leco.notes.code'), set: v => { if (typeof Notes !== 'undefined' && Notes.setCode) Notes.setCode(v); else LS.set('leco.notes.code', v); } },
  ];
  async function derive(c) {
    const n = norm(c), h = await crypto.subtle.digest('SHA-256', ENC.encode('keys:' + n));
    const topic = 'lk-' + [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    const base = await crypto.subtle.importKey('raw', ENC.encode(n), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: ENC.encode('lecoauto-claves-v1'), iterations: 100000 }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return { topic, key };
  }
  const b64 = u => btoa(String.fromCharCode(...u)), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function encrypt(key, obj) { const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, ENC.encode(JSON.stringify(obj)))); return 'e1:' + b64(new Uint8Array([...iv, ...ct])); }
  async function decrypt(key, msg) { if (typeof msg !== 'string' || !msg.startsWith('e1:')) throw new Error('formato'); const raw = unb64(msg.slice(3)); return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12)))); }

  /* ── Enviar ── */
  async function send(ids) {
    if (!ready()) { toast('Hace falta un código de enlace de 10 caracteres o más (Ajustes → Mapa → «Enlace…» → Generar) igual en los dos dispositivos', 6000); return false; }
    const payload = { v: 1, t: Date.now(), d: device() }; let n = 0;
    ITEMS.forEach(it => { if (ids.includes(it.id) && it.has()) { payload[it.id] = it.get(); n++; } });
    if (!n) { toast('No hay ninguna clave guardada en este dispositivo para enviar'); return false; }
    try {
      const { topic, key } = await derive(code()), body = await encrypt(key, payload);
      const r = await fetch(BASE + topic, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } }); if (!r.ok) throw new Error('HTTP ' + r.status);
      toast(`Enviadas ${n} clave${n > 1 ? 's' : ''} (cifradas). En el otro dispositivo saldrá un aviso para aceptarlas.`, 6000); return true;
    } catch (e) { toast('No se pudieron enviar las claves: ' + e.message, 5000); return false; }
  }
  function sendDlg() {
    const rows = ITEMS.map(it => `<label class="row" style="cursor:pointer"><div class="tx"><b>${esc(it.n)}</b><small>${it.has() ? 'Guardada en este dispositivo' : 'No hay en este dispositivo'}</small></div><input type="checkbox" data-k="${it.id}" ${it.has() ? 'checked' : 'disabled'} style="width:24px;height:24px"></label>`).join('');
    dlg(`<h3>Enviar claves al otro dispositivo</h3><div class="note">Viajan <b>cifradas</b> con tu código de enlace y no se guardan en ningún servidor. En el otro dispositivo (con el mismo código) saldrá un aviso para aceptarlas, sin escribir nada. El token de GitHub nunca se envía.</div>${rows}<div class="note" id="ksm">${ready() ? 'Código de enlace: listo.' : '⚠️ Falta un código de enlace de 10 caracteres o más.'}</div><div class="acts"><button class="btn sec" id="kxx" type="button">Cerrar</button><button class="btn" id="kgo" type="button">Enviar</button></div>`, d => {
      $('#kxx', d).onclick = closeDlg; $('#kgo', d).onclick = async () => { const ids = $$('[data-k]', d).filter(c => c.checked).map(c => c.dataset.k); if (await send(ids)) closeDlg(); };
    });
  }

  /* ── Recibir ── */
  let es = null, gen = 0, cur = '';
  const lastKey = 'leco.keys.last';
  async function start() {
    if (es) { es.close(); es = null; } const my = ++gen; cur = code(); if (!ready() || !(window.crypto && crypto.subtle)) return;
    let d; try { d = await derive(cur); } catch { return; } if (my !== gen) return;
    try { es = new EventSource(BASE + d.topic + '/sse?since=12h'); } catch { return; }
    es.onmessage = async ev => {
      if (my !== gen) return;
      try {
        const m = JSON.parse(ev.data); if (m.event !== 'message') return; const j = await decrypt(d.key, m.message);
        if (!j || j.v !== 1 || !j.t || Date.now() - j.t > MAXAGE || j.t <= +(LS.get(lastKey) || 0) || j.d === device()) return;
        offer(j);
      } catch { /* mensaje ajeno, corrupto o de otro código: se ignora */ }
    };
  }
  function offer(j) {
    const got = ITEMS.filter(it => typeof j[it.id] === 'string' && j[it.id]); if (!got.length) return; LS.set(lastKey, String(j.t));
    dlg(`<h3>Claves recibidas</h3><div class="note">Otro dispositivo con tu código de enlace te envía:</div>${got.map(it => `<div class="row"><div class="tx"><b>${esc(it.n)}</b><small>${it.has() ? 'Sustituirá la que ya tienes' : 'Se guardará nueva'}</small></div></div>`).join('')}<div class="note">¿Las guardas en este dispositivo? Si no has sido tú quien las envió, pulsa «Rechazar».</div><div class="acts"><button class="btn bad" id="krj" type="button">Rechazar</button><button class="btn" id="kok" type="button">Guardar</button></div>`, d => {
      $('#krj', d).onclick = () => { closeDlg(); toast('Claves rechazadas'); };
      $('#kok', d).onclick = () => { got.forEach(it => it.set(j[it.id])); closeDlg(); toast(`Guardadas ${got.length} clave${got.length > 1 ? 's' : ''}`, 4000); if (typeof renderers !== 'undefined' && typeof page !== 'undefined' && page === 'settings') renderers.settings(); };
    });
  }
  setInterval(() => { if (code() !== cur) start(); }, 3000); setTimeout(start, 800);
  CATS.mapa[1].push({ t: 'btn', get l() { return 'Enviar claves (IA, TomTom, YouTube…) al otro dispositivo, cifradas'; }, f: sendDlg });
  return { send, sendDlg, start, derive, encrypt, decrypt, ITEMS };
})();

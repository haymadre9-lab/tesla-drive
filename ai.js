'use strict';
/* Asistente de IA con capas gratuitas de Google Gemini, Groq u OpenRouter (tú pones tu clave gratuita).
   La clave se guarda SOLO en este dispositivo (localStorage «leco.ai»), nunca en la configuración que se sincroniza o se publica.
   Se envía a la IA: tu pregunta, la hora, el tiempo y la lista de sitios cercanos (nombre, distancia, horario). No se envía tu posición. */

const AI = (() => {
  const PROV = {
    gemini: { n: 'Google Gemini (capa gratuita)', model: 'gemini-2.5-flash-lite', key: 'https://aistudio.google.com/apikey' },
    groq: { n: 'Groq (capa gratuita)', model: 'llama-3.3-70b-versatile', key: 'https://console.groq.com/keys', base: 'https://api.groq.com/openai/v1' },
    openrouter: { n: 'OpenRouter (modelos gratuitos)', model: 'meta-llama/llama-3.3-70b-instruct:free', key: 'https://openrouter.ai/keys', base: 'https://openrouter.ai/api/v1' },
  };
  const get = () => { try { return JSON.parse(localStorage.getItem('leco.ai') || '{}'); } catch { return {}; } };
  const put = o => { try { localStorage.setItem('leco.ai', JSON.stringify(Object.assign(get(), o))); } catch { toast('No se pudo guardar en este dispositivo'); } };
  const ready = () => { const c = get(); return !!(PROV[c.provider] && c.key); };
  const label = () => { const c = get(); return PROV[c.provider] ? PROV[c.provider].n.split(' (')[0] + ' · ' + (c.model || PROV[c.provider].model) : ''; };
  const habits = () => !!get().habits, voice = () => !!get().voice;

  function explain(e) {
    const st = e && e.status, m = e && e.msg ? ` (${String(e.msg).slice(0, 140)})` : '';
    if (e && e.name === 'AbortError') return 'La IA tardó demasiado en responder. Inténtalo de nuevo.';
    if (st === 400) return 'La IA rechazó la petición: revisa que el modelo esté bien escrito en Ajustes → Asistente IA.' + m;
    if (st === 401 || st === 403) return 'La clave no es válida o no tiene permiso. Revísala en Ajustes → Asistente IA.' + m;
    if (st === 404) return 'Ese modelo no existe en el servicio. Cámbialo en Ajustes → Asistente IA.' + m;
    if (st === 429) return 'Has alcanzado el límite gratuito. Espera un minuto (o hasta mañana) y vuelve a preguntar.' + m;
    if (st >= 500) return 'El servicio de IA no está disponible ahora mismo. Inténtalo en un rato.' + m;
    return 'No se pudo hablar con la IA (¿sin conexión?).' + m;
  }
  /* Si el servicio dice que el modelo no existe o no tienes acceso (cambian de nombre / de cuenta), se pide la lista de modelos de TU cuenta y se usa uno válido */
  async function listModels(c) {
    if (c.provider === 'gemini') { const j = await (await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', { headers: { 'x-goog-api-key': c.key } })).json(); return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => String(m.name).replace(/^models\//, '')); }
    const j = await (await fetch(PROV[c.provider].base + '/models', { headers: { Authorization: 'Bearer ' + c.key } })).json(); return (j.data || []).map(m => m.id);
  }
  function pickModel(prov, ids, bad) {
    const skip = /whisper|tts|guard|embed|image|audio|orpheus|playai|moderation|vision-preview|safeguard/i, ok = ids.filter(i => i !== bad && !skip.test(i));
    const prefs = prov === 'groq' ? [/llama-3\.3-70b/, /llama-3\.1-8b-instant/, /llama/, /gpt-oss/, /qwen/] : prov === 'gemini' ? [/flash-lite/, /flash/, /pro/] : [/llama-3\.3-70b.*:free/, /:free$/];
    for (const re of prefs) { const m = ok.find(i => re.test(i)); if (m) return m; } return ok[0] || null;
  }
  async function call(system, user, opt = {}) {
    try { return await call0(system, user, opt); } catch (e) {
      if (!opt._h && e && (e.status === 404 || e.status === 400) && /model|exist|access|not found|invalid/i.test(String(e.msg || ''))) {
        const c = get(); let ids = []; try { ids = await listModels(c); } catch { }
        const m = PROV[c.provider] && pickModel(c.provider, ids, c.model || PROV[c.provider].model);
        if (m) { put({ model: m }); toast('El modelo anterior no está disponible en tu cuenta: ahora uso «' + m + '»', 6000); return call0(system, user, Object.assign({}, opt, { _h: 1 })); }
      }
      throw e;
    }
  }
  async function call0(system, user, opt = {}) {
    const c = get(), P = PROV[c.provider]; if (!P || !c.key) throw Object.assign(new Error('sin clave'), { msg: 'Falta la clave' });
    const model = c.model || P.model, ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 30000);
    try {
      let r, txt;
      if (c.provider === 'gemini') {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: Object.assign({ temperature: .4, maxOutputTokens: 600 }, opt.json ? { responseMimeType: 'application/json' } : {}) }) });
        const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error('http'), { status: r.status, msg: j.error && j.error.message });
        txt = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts ? j.candidates[0].content.parts.map(p => p.text || '').join('') : '';
      } else {
        r = await fetch(P.base + '/chat/completions', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key },
          body: JSON.stringify(Object.assign({ model, temperature: .4, max_tokens: 600, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }, opt.json && c.provider === 'groq' ? { response_format: { type: 'json_object' } } : {})) });
        const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error('http'), { status: r.status, msg: j.error && (j.error.message || j.error) });
        txt = j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '';
      }
      if (!txt) throw Object.assign(new Error('vacío'), { msg: 'La IA devolvió una respuesta vacía' });
      return String(txt);
    } finally { clearTimeout(tm); }
  }

  /* ── Ajustes → Asistente IA ── */
  function panel() {
    const c = get(), w = el('<div></div>');
    w.append(el(`<div class="note"><b>Asistente gratuito.</b> Con una clave gratuita de Google Gemini, Groq u OpenRouter, el Asesor entiende preguntas libres («un sitio tranquilo para comer algo rápido») y te responde con consejos usando los sitios reales de tu zona.<br><br>
      <b>Gratis, pero con límites:</b> las tres tienen capa gratuita con un máximo de peticiones por minuto y por día. Esos límites cambian con el tiempo: míralos en la web de cada una. Si llegas al límite, la app te lo dirá y seguirá funcionando en modo básico.<br><br>
      <b>Privacidad:</b> se envía a la IA tu pregunta, la hora, el tiempo y la lista de sitios cercanos (nombre, distancia, horario). <b>No se envía tu posición.</b> En las capas gratuitas, los proveedores pueden usar las consultas para mejorar sus servicios: revisa sus condiciones.<br>
      La clave se guarda <b>solo en este dispositivo</b>: no se sincroniza ni se publica en GitHub.</div>`));
    const f = el(`<div class="row" style="flex-direction:column;align-items:stretch"><label class="lab">Proveedor<select class="in" id="ap"><option value="">Ninguno (modo básico)</option>${Object.entries(PROV).map(([k, v]) => `<option value="${k}" ${c.provider === k ? 'selected' : ''}>${v.n}</option>`).join('')}</select></label>
      <div id="alink" class="note"></div>
      <label class="lab">Clave (la pegas aquí, se queda en este dispositivo)<input class="in" id="ak" type="password" autocomplete="off" value="${esc(c.key || '')}" placeholder="Pega tu clave"></label>
      <label class="lab">Modelo (si el servicio cambia de nombre, edítalo aquí)<input class="in" id="am" value="${esc(c.model || '')}" placeholder=""></label>
      <label class="chk"><input type="checkbox" id="av" ${c.voice ? 'checked' : ''}> Leer las respuestas en voz alta</label>
      <label class="chk"><input type="checkbox" id="ah" ${c.habits ? 'checked' : ''}> Dejar que la IA conozca mis destinos habituales (se envían sus nombres)</label>
      <div class="inline"><button class="btn sec" id="asv" type="button">Guardar</button><button class="btn" id="atest" type="button">🧪 Probar</button></div><div id="ares" class="note"></div></div>`);
    const sync = () => { const p = $('#ap', f).value, P = PROV[p]; $('#alink', f).innerHTML = P ? `Consigue tu clave gratuita en <a href="${P.key}" target="_blank" rel="noopener">${P.key.replace('https://', '')}</a> (necesitas una cuenta del servicio; no pide tarjeta en la capa gratuita, compruébalo en su web).` : ''; $('#am', f).placeholder = P ? 'Por defecto: ' + P.model : ''; };
    const save1 = () => put({ provider: $('#ap', f).value, key: $('#ak', f).value.trim(), model: $('#am', f).value.trim(), voice: $('#av', f).checked, habits: $('#ah', f).checked });
    $('#ap', f).onchange = sync; sync();
    $('#asv', f).onclick = () => { save1(); toast(ready() ? 'Asistente activado' : 'Guardado (falta proveedor o clave)'); if (typeof Adv !== 'undefined') Adv.refresh(); };
    $('#atest', f).onclick = async () => { save1(); const r = $('#ares', f); if (!ready()) { r.textContent = 'Elige un proveedor y pega la clave.'; return; } r.textContent = 'Probando…'; try { const t = await call('Responde en español, una frase muy corta.', 'Di «listo» y nada más.'); r.textContent = '✔ Funciona: «' + t.trim().slice(0, 60) + '»'; } catch (e) { r.textContent = '✘ ' + explain(e); } };
    w.append(f); return w;
  }
  const _sr4 = settingRow;
  settingRow = function (it) { return it.t === 'aipanel' ? panel() : _sr4(it); }; // eslint-disable-line no-func-assign
  CATS.ia = ['🤖 Asistente IA (gratis)', [{ t: 'aipanel' }]]; { const a = CATS.acerca; delete CATS.acerca; CATS.acerca = a; }
  return { ready, call, label, habits, voice, explain, PROV };
})();

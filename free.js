'use strict';
/* Ventanas libres del dashboard: se mueven, se redimensionan y cada una puede mostrar
   un widget de la app o cualquier PWA/página web. Los cambios se guardan para siguientes sesiones.
   Las posiciones se guardan en % y por orientación (horizontal para el coche, vertical para el móvil). */

const Win = (() => {
  const uid = () => 'w' + Math.random().toString(36).slice(2, 7);
  const prof = () => (innerHeight > innerWidth || innerWidth < 761 ? 'port' : 'land');
  const cl = o => JSON.parse(JSON.stringify(o));
  let editing = false, root = null;

  /* Reparto automático inicial (equivale a la cuadrícula) */
  function tile(wins, pr) {
    const D = Dash.cur(), land = pr === 'land', fixed = land ? Math.max(1, D.rows || S.rows || 2) : 2;
    const occ = new Set(), pl = []; let flow = 0;
    const fits = (c, r, cw, ch) => { for (let i = 0; i < cw; i++) for (let j = 0; j < ch; j++) if (occ.has((c + i) + ',' + (r + j))) return false; return true; };
    wins.forEach(w => {
      const [sw, sh] = (w.span || '1x1').split('x').map(Number), a = Math.min(land ? sh : sw, fixed), b = land ? sw : sh;
      for (let f = 0; ; f++) {
        let done = false;
        for (let s = 0; s + a <= fixed; s++) {
          const c = land ? f : s, r = land ? s : f, cw = land ? b : a, ch = land ? a : b;
          if (fits(c, r, cw, ch)) { for (let i = 0; i < cw; i++) for (let j = 0; j < ch; j++) occ.add((c + i) + ',' + (r + j)); pl.push([w, c, r, cw, ch]); flow = Math.max(flow, land ? c + cw : r + ch); done = true; break; }
        }
        if (done) break;
      }
    });
    const cols = land ? flow : fixed, rows = land ? fixed : flow, g = .5;
    pl.forEach(([w, c, r, cw, ch]) => { (w.r ||= {})[pr] = [c / cols * 100 + g, r / rows * 100 + g, cw / cols * 100 - 2 * g, ch / rows * 100 - 2 * g]; });
  }
  function ensureFree(D) {
    if (!D.win) D.win = D.w.filter(([id, on]) => on && WIDGETS[id]).map(([id, , span]) => ({ id: uid(), type: 'widget', wid: id, span: span || '1x1', r: {} }));
    D.win.forEach(w => { w.r ||= {}; });
    const pr = prof(), miss = D.win.filter(w => !w.r[pr]);
    if (miss.length === D.win.length) tile(D.win, pr); else miss.forEach((w, i) => { w.r[pr] = [18 + i * 4, 18 + i * 4, 46, 46]; });
    return D;
  }

  /* ── Pintado ── */
  const rgba = (hex, a) => { const n = parseInt((hex || '#000000').slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${(a ?? 100) / 100})`; };
  function renderFree(D) {
    ensureFree(D); const pr = prof(), host = $('#p-home');
    host.innerHTML = '<div class="free"></div>'; root = $('.free', host);
    D.win.forEach(w => mk(w, pr));
    document.body.classList.toggle('layedit', editing); bar();
    tickClock(); renderWeather(); renderSpeedUI(); Poi.renderLimit(); Dash.tag && Dash.tag();
  }
  function mk(w, pr) {
    const [x, y, ww, hh] = w.r[pr] || [20, 20, 40, 40];
    const f = document.createElement('div'); f.className = 'fwin'; f.dataset.win = w.id; f.style.cssText = `left:${x}%;top:${y}%;width:${ww}%;height:${hh}%;z-index:${w.z || 1}`;
    const c = document.createElement('div'); c.className = 'card wc'; f.append(c); root.append(f);
    if (w.bg) c.style.background = rgba(w.bg, w.alpha); if (w.rad != null && w.rad !== '') c.style.borderRadius = w.rad + 'px';
    if (w.type === 'web') {
      c.classList.add('webwin'); const s = (w.scale || 100) / 100;
      c.innerHTML = `${w.bar === false ? '' : `<div class="wbar"><b>${esc(w.title || Ed.hostOf(w.url) || 'PWA')}</b></div>`}<div class="wfr">${w.url ? `<iframe src="${esc(w.url)}" allow="geolocation; autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write" referrerpolicy="no-referrer-when-downgrade" style="width:${100 / s}%;height:${100 / s}%;transform:scale(${s})"></iframe>` : '<div class="wempty">Sin dirección.<br>Mantén pulsado (o toca ⋮) para elegir la PWA</div>'}</div>`;
    } else {
      const W = WIDGETS[w.wid];
      if (W) { c.className += ' ' + (W.cls || '').replace(/w-\d+x\d+/g, '').trim(); c.dataset.w = w.wid; W.render(c); } else c.textContent = 'Widget no disponible';
    }
    decorate(f, w);
    return f;
  }
  /* Capas de edición sobre una ventana ya pintada (sin recargar su contenido) */
  function decorate(f, w) {
    $$('.wcover,.wtool,.wres,.wdots,.wgrip', f).forEach(n => n.remove()); f.classList.toggle('editing', editing); if (!editing) f.classList.remove('sel');
    const card = $('.wc', f); f.style.zIndex = editing ? 'auto' : (w.z || 1); card.style.zIndex = editing ? (w.z || 1) * 2 : '';
    if (editing) {
      f.insertAdjacentHTML('beforeend', `<div class="wcover"><span class="wname">${esc(w.type === 'web' ? (w.title || Ed.hostOf(w.url) || 'PWA') : (WIDGETS[w.wid]?.n || '?'))}</span></div><div class="wtool"><button data-t="cfg" title="Cambiar función o PWA">⚙</button><button data-t="del" title="Quitar ventana">✕</button></div><div class="wres" title="Redimensionar"></div>`);
      $('.wcover', f).style.zIndex = (w.z || 1) * 2 + 1; bindEdit(f, w);
    } else {
      if (S.winDots !== false) { f.insertAdjacentHTML('beforeend', '<button class="wdots" title="Configurar ventana">⋮</button>'); $('.wdots', f).onclick = e => { e.stopPropagation(); edit(w.id); }; }
      if (w.type === 'web' && w.bar === false) f.insertAdjacentHTML('beforeend', '<div class="wgrip"></div>'); // franja para poder mantener pulsado sobre una PWA
    }
  }

  /* ── Mover y redimensionar (listeners en document: valen aunque el elemento original cambie) ── */
  const MOVE = (r, dx, dy) => [clamp(r[0] + dx, 0, 100 - r[2]), clamp(r[1] + dy, 0, 100 - r[3]), r[2], r[3]];
  const SIZE = (r, dx, dy) => [r[0], r[1], clamp(r[2] + dx, 8, 100 - r[0]), clamp(r[3] + dy, 8, 100 - r[1])];
  function track(p, f, w, fn) {
    const pr = prof(), D = Dash.cur(), box = root.getBoundingClientRect(), r0 = cl(w.r[pr]), id = p.pointerId;
    w.z = Math.max(1, ...D.win.map(x => x.z || 1)) + 1; $('.wc', f).style.zIndex = w.z * 2; const cv = $('.wcover', f); if (cv) cv.style.zIndex = w.z * 2 + 1; f.classList.add('lifted'); $$('.fwin.sel', root).forEach(x => x.classList.remove('sel')); f.classList.add('sel');
    const mv = ev => {
      if (ev.pointerId !== id) return; ev.preventDefault();
      const r = fn(r0, (ev.clientX - p.x) / box.width * 100, (ev.clientY - p.y) / box.height * 100).map(v => Math.round(v * 10) / 10);
      w.r[pr] = r; f.style.left = r[0] + '%'; f.style.top = r[1] + '%'; f.style.width = r[2] + '%'; f.style.height = r[3] + '%';
    };
    const up = ev => {
      if (ev.pointerId !== id) return;
      ['pointermove', 'pointerup', 'pointercancel'].forEach((t, k) => document.removeEventListener(t, k ? up : mv, true)); f.classList.remove('lifted'); save();
    };
    document.addEventListener('pointermove', mv, true); document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', up, true);
  }
  function bindEdit(f, w) {
    $('.wcover', f).onpointerdown = e => { e.preventDefault(); e.stopPropagation(); track({ pointerId: e.pointerId, x: e.clientX, y: e.clientY }, f, w, MOVE); };
    $('.wres', f).onpointerdown = e => { e.preventDefault(); e.stopPropagation(); track({ pointerId: e.pointerId, x: e.clientX, y: e.clientY }, f, w, SIZE); };
    $('[data-t=cfg]', f).onclick = e => { e.stopPropagation(); edit(w.id); };
    $('[data-t=del]', f).onclick = e => { e.stopPropagation(); remove(w.id); };
    ['pointerdown', 'click'].forEach(ev => $('.wtool', f).addEventListener(ev, e => e.stopPropagation()));
  }
  /* Mantener pulsado una ventana y arrastrar en el mismo gesto */
  function lift(id, p) {
    const D = ensureFree(Dash.cur()), w = D.win.find(x => x.id === id), f = root && $(`.fwin[data-win="${id}"]`, root); if (!w || !f) return;
    setEditing(true); navigator.vibrate?.(30); track(p, f, w, MOVE);
  }
  let lastDel = null;
  function bar() {
    let b = $('#layedbar'); if (b) b.remove(); if (!editing) return;
    b = document.createElement('div'); b.id = 'layedbar';
    b.innerHTML = `<span>✎ ${prof() === 'port' ? 'Vertical' : 'Horizontal'}</span><button class="btn" data-a="add">＋ Ventana</button>${lastDel ? '<button class="btn sec" data-a="undo">↶ Deshacer</button>' : ''}<button class="btn sec" data-a="auto">⟲ Reordenar</button><button class="btn" data-a="done">✔ Listo</button>`;
    document.body.append(b);
    b.onclick = e => {
      const a = e.target.closest('button')?.dataset.a, D = Dash.cur();
      if (a === 'add') edit(null);
      else if (a === 'undo' && lastDel) { D.win.splice(Math.min(lastDel.i, D.win.length), 0, lastDel.w); lastDel = null; save(); renderFree(D); }
      else if (a === 'auto') { D.win.forEach(w => { delete w.r[prof()]; }); tile(D.win, prof()); save(); renderFree(D); }
      else if (a === 'done') leave();
    };
  }
  function setEditing(on) {
    editing = on; document.body.classList.toggle('layedit', on);
    const D = Dash.cur(); if (root && D.win) $$('.fwin', root).forEach(f => decorate(f, D.win.find(x => x.id === f.dataset.win)));
    bar();
  }
  function enter() {
    const D = ensureFree(Dash.cur()); if (page !== 'home') go('home'); if (!$('.free')) renderFree(D); root = $('.free');
    setEditing(true); toast('Mantén pulsada una ventana y arrástrala · esquina azul para el tamaño · ✕ para quitarla', 4500);
  }
  function leave() { setEditing(false); save(); toast('Diseño guardado'); }
  function remove(id) {
    const D = Dash.cur(), i = D.win.findIndex(w => w.id === id); if (i < 0) return;
    lastDel = { w: D.win[i], i }; D.win.splice(i, 1); save(); const f = $(`.fwin[data-win="${id}"]`, root); if (f) f.remove(); bar(); toast('Ventana quitada · puedes deshacer arriba');
  }

  /* ── Diálogo de configuración de ventana ── */
  function add(pre = {}) {
    const D = ensureFree(Dash.cur()), pr = prof(), z = Math.max(1, ...D.win.map(x => x.z || 1)) + 1;
    const w = Object.assign({ id: uid(), type: 'widget', wid: 'clock', r: { [pr]: [22, 18, 48, 56] }, z }, pre); D.win.push(w); return w;
  }
  function edit(id, opts = {}) {
    const D = ensureFree(Dash.cur()); let w = id ? D.win.find(x => x.id === id) : null, isNew = !w;
    if (isNew) { w = add(opts.pre || {}); }
    const pr = prof(), W = cl(w); W.r = W.r || {}; if (!W.r[pr]) W.r[pr] = [22, 18, 48, 56];
    const wopts = Object.entries(WIDGETS).map(([k, v]) => `<option value="w:${k}">${esc(v.n)}</option>`).join('');
    dlg(`<h3>${isNew ? 'Nueva ventana' : 'Configurar ventana'}</h3><div class="f ed">
      <label>¿Qué muestra esta ventana?<select class="in" id="wt"><optgroup label="Funciones de la app">${wopts}</optgroup><optgroup label="Otras"><option value="web">🌐 PWA / página web (dirección)</option></optgroup></select></label>
      ${W.prev && WIDGETS[W.prev] ? `<button class="btn sec" id="wback" type="button">↩ Volver a «${esc(WIDGETS[W.prev].n)}»</button>` : ''}
      <div class="note" style="padding:0">Para poner otra PWA en esta ventana elige «PWA / página web». Podrás volver a la función original cuando quieras.</div>
      <div id="wweb" class="f">
        <label>Dirección de la PWA<div class="inline"><input class="in" id="wu" placeholder="https://…" value="${esc(W.url || '')}"><button class="btn sec" id="wp" type="button">📋 Pegar</button></div></label>
        <label>…o elegir una de mis apps<select class="in" id="wa"><option value="">— elegir —</option>${S.apps.map(a => `<option value="${esc(a.id)}">${esc(a.n)}</option>`).join('')}</select></label>
        <label>Título<input class="in" id="wti" value="${esc(W.title || '')}" placeholder="(automático)"></label>
        <div class="inline"><label class="chk"><input type="checkbox" id="wbar" ${W.bar === false ? '' : 'checked'}> Mostrar barra de título</label><label>Escala <input type="range" id="wsc" min="40" max="160" step="5" value="${W.scale || 100}"> <b id="wscv">${W.scale || 100}%</b></label></div>
      </div>
      <div class="inline"><label class="chk"><input type="checkbox" id="wbgc" ${W.bg ? 'checked' : ''}> Fondo <input type="color" id="wbg" value="${esc(W.bg || '#111827')}"></label><label>Opacidad <input type="range" id="wal" min="0" max="100" step="5" value="${W.alpha ?? 100}"></label></div>
      <label>Esquinas redondeadas <input type="range" id="wr" min="0" max="40" step="2" value="${W.rad ?? 22}"></label>
      <div><small style="color:var(--dim)">Posición rápida</small><div class="inline" id="wq">${[['½ izq.', [0.5, 0.5, 49, 99]], ['½ der.', [50.5, 0.5, 49, 99]], ['½ arriba', [0.5, 0.5, 99, 49]], ['½ abajo', [0.5, 50.5, 99, 49]], ['Centro', [15, 12, 70, 76]], ['Completa', [0, 0, 100, 100]]].map(([l, r], i) => `<button class="btn sec" data-i="${i}" type="button">${l}</button>`).join('')}</div></div></div>
      <div class="acts">${isNew ? '' : '<button class="btn bad" id="wd" type="button">Eliminar</button><button class="btn sec" id="wdu" type="button">Duplicar</button>'}<button class="btn sec" id="wm" type="button">✥ Mover / tamaño</button><button class="btn sec" id="wc" type="button">Cancelar</button><button class="btn" id="wk" type="button">Guardar</button></div>`, d => {
      const QS = [[0.5, 0.5, 49, 99], [50.5, 0.5, 49, 99], [0.5, 0.5, 99, 49], [0.5, 50.5, 99, 49], [15, 12, 70, 76], [0, 0, 100, 100]];
      $('#wt', d).value = W.type === 'web' ? 'web' : 'w:' + W.wid;
      const showWeb = () => { $('#wweb', d).style.display = $('#wt', d).value === 'web' ? '' : 'none'; }; $('#wt', d).onchange = showWeb; showWeb();
      const wb = $('#wback', d); if (wb) wb.onclick = () => { $('#wt', d).value = 'w:' + W.prev; showWeb(); };
      $('#wsc', d).oninput = e => { $('#wscv', d).textContent = e.target.value + '%'; };
      $('#wp', d).onclick = async () => { const t = await Ed.paste(), u = Ed.urlFrom(t) || t; if (u) { $('#wu', d).value = u; if (!$('#wti', d).value) $('#wti', d).value = Ed.hostOf(u).replace(/^www\./, ''); } };
      $('#wa', d).onchange = e => { const a = appById(e.target.value); if (a) { $('#wu', d).value = a.u; $('#wti', d).value = a.n; } };
      $$('#wq button', d).forEach(b => b.onclick = () => { W.r[pr] = QS[+b.dataset.i].slice(); toast('Posición aplicada: guarda para confirmar'); });
      const finish = () => {
        const t = $('#wt', d).value; W.bg = $('#wbgc', d).checked ? $('#wbg', d).value : ''; W.alpha = +$('#wal', d).value; W.rad = +$('#wr', d).value;
        if (t === 'web') { const u = Ed.normUrl($('#wu', d).value); W.type = 'web'; W.url = u; W.title = $('#wti', d).value.trim(); W.bar = $('#wbar', d).checked; W.scale = +$('#wsc', d).value; if (W.wid) W.prev = W.wid; delete W.wid; }
        else { W.type = 'widget'; W.wid = t.slice(2); delete W.url; delete W.prev; }
        Object.assign(w, W); if (!w.bg) delete w.bg; save();
      };
      $('#wc', d).onclick = () => { if (isNew) D.win = D.win.filter(x => x !== w); closeDlg(); renderFree(D); };
      $('#wk', d).onclick = () => { if ($('#wt', d).value === 'web' && !Ed.normUrl($('#wu', d).value)) return toast('Pega o escribe la dirección de la PWA'); finish(); closeDlg(); renderFree(D); toast('Ventana guardada'); };
      $('#wm', d).onclick = () => { finish(); closeDlg(); enter(); };
      if (!isNew) {
        $('#wdu', d).onclick = () => { finish(); const c = cl(w); c.id = uid(); const r = c.r[pr]; c.r[pr] = [clamp(r[0] + 4, 0, 100 - r[2]), clamp(r[1] + 4, 0, 100 - r[3]), r[2], r[3]]; D.win.push(c); save(); closeDlg(); renderFree(D); };
        const del = $('#wd', d); del.onclick = () => { if (del.dataset.s) { closeDlg(); remove(w.id); } else { del.dataset.s = 1; del.textContent = '¿Seguro?'; } };
      }
    });
  }
  function fromCard(card) { // pulsación larga sobre una tarjeta de la cuadrícula: pasa a diseño libre y la abre
    const D = Dash.cur(), idx = [...card.parentNode.children].indexOf(card); ensureFree(D); save(); renderFree(D); enter(); const w = D.win[idx], f = w && $(`.fwin[data-win="${w.id}"]`, root); if (f) f.classList.add('sel');
  }
  function menu() {
    dlg(`<h3>Dashboard</h3><div class="f"><button class="btn" id="m1" type="button">＋ Añadir ventana</button><button class="btn sec" id="m2" type="button">✥ Mover y redimensionar ventanas</button><button class="btn sec" id="m3" type="button">🎛 Cambiar de dashboard</button></div><div class="acts"><button class="btn sec" id="mc" type="button">Cerrar</button></div>`, d => {
      $('#mc', d).onclick = closeDlg; $('#m1', d).onclick = () => { closeDlg(); edit(null); }; $('#m2', d).onclick = () => { closeDlg(); enter(); }; $('#m3', d).onclick = () => { closeDlg(); Dash.picker(); };
    });
  }
  function useUrl(url, title) { // PWA recibida (compartir) → ventana
    const D = ensureFree(Dash.cur());
    dlg(`<h3>Poner “${esc(title || Ed.hostOf(url))}” en una ventana</h3><div class="f"><button class="btn" id="n1" type="button">＋ Nueva ventana</button>${D.win.map(w => `<button class="btn sec" data-id="${esc(w.id)}" type="button" style="text-align:left">Sustituir: ${esc(w.type === 'web' ? (w.title || Ed.hostOf(w.url) || 'PWA') : (WIDGETS[w.wid]?.n || '?'))}</button>`).join('')}</div><div class="acts"><button class="btn sec" id="nc" type="button">Cancelar</button></div>`, d => {
      $('#nc', d).onclick = closeDlg; $('#n1', d).onclick = () => { closeDlg(); const w = add({ type: 'web', url, title: title || Ed.hostOf(url), bar: true }); save(); renderFree(D); enter(); };
      $$('[data-id]', d).forEach(b => b.onclick = () => { closeDlg(); const w = D.win.find(x => x.id === b.dataset.id); Object.assign(w, { type: 'web', url, title: title || Ed.hostOf(url), bar: true }); delete w.wid; save(); renderFree(D); toast('Ventana actualizada'); });
    });
  }

  /* ── Integración con el inicio y los ajustes ── */
  const _home = renderers.home;
  renderers.home = () => { const D = Dash.cur(); if (D.win) renderFree(D); else { document.body.classList.remove('layedit'); _home(); } };
  addEventListener('resize', () => { if (Dash.cur().win && page === 'home' && !$('#modal').offsetParent) { const D = Dash.cur(); if (!D.win.every(w => w.r[prof()])) { renderFree(D); } } });
  addEventListener('pagehide', save);
  const _go2 = go; go = function (p) { if (editing && p !== 'home') leave(); _go2(p); }; // eslint-disable-line no-func-assign

  const _we = widgetsEditor;
  widgetsEditor = function () { // eslint-disable-line no-func-assign
    const D = Dash.cur(), w = _we();
    const head = el('<div class="row"><div class="tx"><b>Diseño libre</b><small>Mueve y redimensiona las ventanas, y elige para cada una qué función o PWA muestra. También: mantén pulsada una ventana en el inicio.</small></div></div>');
    const b1 = el('<button class="btn">✎ Editar diseño</button>'), b2 = el('<button class="btn sec">＋ Añadir ventana</button>'); b1.onclick = enter; b2.onclick = () => { go('home'); edit(null); };
    head.append(b1, b2); w.insertBefore(head, w.firstChild);
    if (D.win) {
      const st = $('.sec-t', w); while (st.nextSibling) st.nextSibling.remove(); st.textContent = 'Ventanas de este dashboard';
      D.win.forEach(x => { const r = el(`<div class="row"><div class="tx"><b>${esc(x.type === 'web' ? '🌐 ' + (x.title || Ed.hostOf(x.url) || 'PWA') : WIDGETS[x.wid]?.n || '?')}</b><small>${x.type === 'web' ? esc(x.url || 'sin dirección') : 'Función de la app'}</small></div><button class="btn sec">Configurar</button></div>`); $('button', r).onclick = () => { go('home'); edit(x.id); }; w.append(r); });
      const back = el('<button class="btn sec">↺ Volver a cuadrícula automática</button>'); back.onclick = () => { delete D.win; save(); renderers.settings(); renderers.home(); toast('Cuadrícula automática'); }; w.append(back);
    }
    return w;
  };
  return { edit, enter, leave, menu, fromCard, useUrl, add, ensureFree, remove, lift };
})();

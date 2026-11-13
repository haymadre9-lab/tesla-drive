'use strict';
/* Edición de iconos (apps y barra lateral) con pulsación larga.
   Cada icono: nombre, dirección de la PWA, icono (emoji o imagen), colores y forma de abrirse. */

const Ed = (() => {
  const cl = o => JSON.parse(JSON.stringify(o));
  const hostOf = u => { try { return new URL(u, location.href).hostname; } catch { return ''; } };
  const urlFrom = t => (String(t || '').match(/https?:\/\/[^\s]+/) || [])[0] || '';
  const normUrl = u => { u = String(u || '').trim(); return !u || /^(https?:|\.{0,2}\/|[\w-]+\/)/i.test(u) && !/^[\w-]+\.[a-z]{2,}/i.test(u) ? u : (/^(https?:)/i.test(u) ? u : 'https://' + u); };
  const iconHtml = o => o.img ? `<img src="${esc(o.img)}" alt="" draggable="false">` : esc(o.e || o.i || '🌐');
  const colorStyle = o => `${o.bg ? 'background:' + esc(o.bg) + ';' : ''}${o.fg ? 'color:' + esc(o.fg) + ';' : ''}`;

  async function paste() {
    try { return (await navigator.clipboard.readText() || '').trim(); } catch { toast('El navegador no dejó leer el portapapeles: pega la dirección a mano'); return ''; }
  }
  function imgToData(file, size = 128) {
    return new Promise(ok => {
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), s = Math.max(size / img.width, size / img.height), w = img.width * s, h = img.height * s; g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h); URL.revokeObjectURL(u); ok(c.toDataURL('image/png')); };
      img.onerror = () => { URL.revokeObjectURL(u); ok(null); }; img.src = u;
    });
  }
  function pickImage() {
    return new Promise(ok => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = async () => ok(i.files[0] ? await imgToData(i.files[0]) : null); i.click(); });
  }

  /* Campos comunes de icono + colores (devuelven un lector del estado) */
  function iconFields(o) {
    return `<label>Nombre<input class="in" id="fn" value="${esc(o.n || '')}"></label>
      <label>Icono (emoji o texto corto)<input class="in" id="fe" maxlength="4" value="${esc(o.e || o.i || '')}"></label>
      <div class="inline"><button class="btn sec" id="fi" type="button">🖼 Subir imagen</button><button class="btn sec" id="fs" type="button">🌐 Icono del sitio</button><button class="btn sec" id="fx" type="button">Quitar imagen</button></div>
      <div class="inline"><label class="chk"><input type="checkbox" id="fbc" ${o.bg ? 'checked' : ''}> Fondo <input type="color" id="fb" value="${esc(o.bg || '#2b3550')}"></label>
        <label class="chk"><input type="checkbox" id="ffc" ${o.fg ? 'checked' : ''}> Texto <input type="color" id="ff" value="${esc(o.fg || '#ffffff')}"></label></div>`;
  }
  function bindIcon(d, O, urlGetter, onChange) {
    const sync = () => { O.n = $('#fn', d).value; O.e = O.i = $('#fe', d).value; O.bg = $('#fbc', d).checked ? $('#fb', d).value : ''; O.fg = $('#ffc', d).checked ? $('#ff', d).value : ''; onChange(); };
    $$('#fn,#fe,#fbc,#fb,#ffc,#ff', d).forEach(i => { i.oninput = sync; i.onchange = sync; });
    $('#fi', d).onclick = async () => { const x = await pickImage(); if (x) { O.img = x; onChange(); } };
    $('#fx', d).onclick = () => { O.img = ''; onChange(); };
    $('#fs', d).onclick = () => { const h = hostOf(urlGetter()); if (!h) return toast('Primero escribe la dirección'); O.img = `https://www.google.com/s2/favicons?domain=${h}&sz=128`; onChange(); toast('Icono del sitio puesto (necesita conexión)'); };
    sync();
  }

  /* ── Editor de app (PWA) ── */
  function appEditor(edit, pre = {}) {
    const A = Object.assign({ id: 'u' + Date.now(), n: '', u: '', e: '🌐', mode: 'default' }, edit ? cl(edit) : {}, pre), isNew = !edit;
    const quick = edit ? S.quick.includes(edit.id) : true;
    dlg(`<h3>${isNew ? 'Nueva app (PWA)' : 'Editar icono'}</h3><div class="f ed">
      <div class="prev"><div class="app"><div class="ico" id="pv"></div><span id="pvn"></span></div></div>
      <label>Dirección de la PWA<div class="inline"><input class="in" id="eu" placeholder="https://…" value="${esc(A.u)}"><button class="btn sec" id="ep" type="button">📋 Pegar</button></div></label>
      ${iconFields(A)}
      <label>Abrir en<select class="in" id="em">${[['default', 'Predeterminado (Ajustes)'], ['float', 'Ventana flotante'], ['full', 'Pantalla completa'], ['tab', 'Pestaña nueva']].map(([v, l]) => `<option value="${v}" ${A.mode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" id="eq" ${quick ? 'checked' : ''}> Mostrar en accesos rápidos</label></div>
      <div class="acts">${isNew ? '' : '<button class="btn bad" id="ed" type="button">Eliminar</button><button class="btn sec" id="edu" type="button">Duplicar</button>'}<button class="btn sec" id="ec" type="button">Cancelar</button><button class="btn" id="ek" type="button">Guardar</button></div>`, d => {
      const prev = () => { $('#pv', d).innerHTML = iconHtml(A); $('#pv', d).style.cssText = colorStyle(A); $('#pvn', d).textContent = A.n || 'Nombre'; };
      bindIcon(d, A, () => $('#eu', d).value, prev);
      $('#eu', d).oninput = () => { A.u = $('#eu', d).value; if (!$('#fn', d).value) { $('#fn', d).value = hostOf(A.u).replace(/^www\./, ''); $('#fn', d).oninput(); } };
      $('#ep', d).onclick = async () => { const t = await paste(), u = urlFrom(t) || t; if (u) { $('#eu', d).value = u; $('#eu', d).oninput(); } };
      $('#ec', d).onclick = closeDlg;
      $('#ek', d).onclick = () => {
        const u = normUrl($('#eu', d).value), n = ($('#fn', d).value || '').trim(); if (!u || !n) return toast('Nombre y dirección son obligatorios');
        A.u = u; A.n = n; A.mode = $('#em', d).value; if (!A.e && !A.img) A.e = '🌐';
        if (edit) { Object.assign(edit, A); if (!A.img) delete edit.img; if (!A.bg) delete edit.bg; if (!A.fg) delete edit.fg; } else S.apps.push(A);
        S.quick = S.quick.filter(i => i !== A.id); if ($('#eq', d).checked) S.quick.push(A.id);
        save(); closeDlg(); renderers.apps(); bus.emit('apps'); renderDock(); toast('Guardado');
      };
      if (!isNew) {
        $('#edu', d).onclick = () => { const c = cl(edit); c.id = 'u' + Date.now(); c.n += ' (copia)'; S.apps.push(c); save(); closeDlg(); renderers.apps(); bus.emit('apps'); };
        const del = $('#ed', d); del.onclick = () => { if (del.dataset.s) { S.apps = S.apps.filter(x => x !== edit); S.quick = S.quick.filter(i => i !== edit.id); save(); closeDlg(); renderers.apps(); bus.emit('apps'); } else { del.dataset.s = 1; del.textContent = '¿Seguro?'; } };
      }
    });
  }
  addAppDlg = edit => appEditor(edit); // eslint-disable-line no-func-assign

  /* ── Barra lateral configurable ── */
  const DOCK_DEF = [['home', '🏠', 'Inicio', 'page:home'], ['apps', '▦', 'Apps', 'page:apps'], ['music', '🎵', 'Música', 'page:music'], ['map', '🧭', 'Navegar', 'page:map'], ['settings', '⚙️', 'Ajustes', 'page:settings']];
  const PAGES = [['home', 'Inicio'], ['apps', 'Aplicaciones'], ['music', 'Música'], ['map', 'Navegar'], ['advisor', 'Asesor'], ['settings', 'Ajustes']];
  if (!Array.isArray(S.dock) || !S.dock.length) S.dock = DOCK_DEF.map(([id, i, n, t]) => ({ id, i, n, t }));
  if (!S.dock.some(x => x.t === 'page:settings')) S.dock.push({ id: 'settings', i: '⚙️', n: 'Ajustes', t: 'page:settings' });

  function runTarget(it) {
    const [k, ...r] = String(it.t).split(':'), v = r.join(':');
    if (k === 'page') go(v); else if (k === 'app') { const a = appById(v); a ? openApp(a) : toast('App no encontrada'); }
    else if (k === 'dash') { go('home'); Dash.use(v); } else if (k === 'act') run(v);
    else if (k === 'url') openApp({ id: 'tmp', n: it.n, u: v, e: it.i });
  }
  function renderDock() {
    const d = $('#dock');
    d.innerHTML = S.dock.map(it => `<button data-did="${esc(it.id)}" ${it.t.startsWith('page:') ? `data-go="${it.t.slice(5)}"` : ''} title="${esc(it.n)}"><span class="dki" style="${colorStyle({ bg: it.bg })}${it.fg ? 'color:' + esc(it.fg) : ''}">${iconHtml(it)}</span><i ${it.fg ? `style="color:${esc(it.fg)}"` : ''}>${esc(it.n)}</i></button>`).join('');
    $$('button', d).forEach(b => { b.onclick = () => runTarget(S.dock.find(x => x.id === b.dataset.did)); b.classList.toggle('act', b.dataset.go === page); });
  }
  function dockEditor(item) {
    const isNew = !item, I = item ? cl(item) : { id: 'd' + Date.now(), i: '⭐', n: 'Nuevo', t: 'app:' + (S.apps[0] ? S.apps[0].id : 'x') };
    let [kind, ...rest] = I.t.split(':'); let val = rest.join(':');
    dlg(`<h3>${isNew ? 'Nuevo botón de la barra' : 'Editar botón'}</h3><div class="f ed">
      <div class="prev"><div id="dpv" class="dockprev"></div></div>${iconFields(I)}
      <label>Al pulsar<select class="in" id="dk"><option value="page">Abrir pantalla de la app</option><option value="app">Abrir una de mis apps</option><option value="dash">Cambiar de dashboard</option><option value="act">Ejecutar una acción</option><option value="url">Abrir una dirección (PWA)</option></select></label>
      <div id="dv"></div></div>
      <div class="acts">${isNew ? '' : '<button class="btn sec" id="dup" type="button">▲</button><button class="btn sec" id="ddn" type="button">▼</button><button class="btn bad" id="ddel" type="button">Eliminar</button>'}<button class="btn sec" id="dc" type="button">Cancelar</button><button class="btn" id="dok" type="button">Guardar</button></div>`, d => {
      const opts = (arr, cur) => arr.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
      const detail = () => {
        const box = $('#dv', d);
        const sel = arr => { box.innerHTML = `<select class="in" id="dd">${opts(arr, val)}</select>`; if (!arr.some(a => a[0] === val)) val = arr[0][0]; $('#dd', d).value = val; $('#dd', d).onchange = e => { val = e.target.value; }; };
        if (kind === 'page') sel(PAGES); else if (kind === 'app') sel(S.apps.map(a => [a.id, a.n])); else if (kind === 'dash') sel(S.dashboards.map(x => [x.id, x.i + ' ' + x.n]));
        else if (kind === 'act') sel(Object.entries(ACTIONS).filter(([k]) => k !== 'none').map(([k, v]) => [k, v[0]]));
        else { box.innerHTML = '<div class="inline"><input class="in" id="du" placeholder="https://…"><button class="btn sec" id="dpaste" type="button">📋 Pegar</button></div>'; $('#du', d).value = val; $('#du', d).oninput = e => { val = e.target.value; }; $('#dpaste', d).onclick = async () => { const t = await paste(); if (t) { $('#du', d).value = val = urlFrom(t) || t; } }; }
      };
      $('#dk', d).value = kind; $('#dk', d).onchange = e => { kind = e.target.value; val = ''; detail(); }; detail();
      const prev = () => { const p = $('#dpv', d); p.innerHTML = `<span class="dki" style="${colorStyle({ bg: I.bg })}${I.fg ? 'color:' + esc(I.fg) : ''}">${iconHtml(I)}</span><i style="${I.fg ? 'color:' + esc(I.fg) : ''}">${esc(I.n)}</i>`; };
      bindIcon(d, I, () => (kind === 'url' ? val : ''), prev);
      $('#dc', d).onclick = closeDlg;
      $('#dok', d).onclick = () => {
        if (kind === 'url') val = normUrl(val); if (!val) return toast('Elige a dónde lleva el botón');
        I.t = kind + ':' + val; I.n = (I.n || '').trim() || 'Botón'; if (!I.e && !I.img) I.e = '⭐';
        if (!I.img) delete I.img; if (!I.bg) delete I.bg; if (!I.fg) delete I.fg;
        if (item) S.dock[S.dock.indexOf(item)] = I; else S.dock.push(I);
        if (!S.dock.some(x => x.t === 'page:settings')) { toast('Debe quedar un botón que abra Ajustes'); if (item) S.dock[S.dock.indexOf(I)] = item; else S.dock.pop(); return; }
        save(); closeDlg(); renderDock(); toast('Guardado');
      };
      if (!isNew) {
        const mv = n => { const i = S.dock.indexOf(item), j = i + n; if (j < 0 || j >= S.dock.length) return; [S.dock[i], S.dock[j]] = [S.dock[j], S.dock[i]]; save(); renderDock(); };
        $('#dup', d).onclick = () => mv(-1); $('#ddn', d).onclick = () => mv(1);
        const del = $('#ddel', d); del.onclick = () => {
          if (item.t === 'page:settings' && S.dock.filter(x => x.t === 'page:settings').length === 1) return toast('Este botón abre Ajustes y no se puede eliminar');
          if (del.dataset.s) { S.dock = S.dock.filter(x => x !== item); save(); closeDlg(); renderDock(); } else { del.dataset.s = 1; del.textContent = '¿Seguro?'; }
        };
      }
    });
  }
  renderDock();

  /* ── Pulsación larga (delegada, sirve para elementos que se vuelven a pintar) ── */
  (() => {
    let timer, sx, sy, lx, ly, fired = false;
    const SEL = '.app[data-id], #dock button[data-did], .fwin, .grid > .card[data-w], #dock, .free';
    const stop = () => { clearTimeout(timer); timer = 0; };
    document.addEventListener('pointerdown', e => {
      if (document.body.classList.contains('layedit') || !$('#modal').hidden) return;
      const t = e.target.closest(SEL); if (!t) return;
      if (t.matches('.fwin') && e.target.closest('input,select,textarea,.wdots')) return;
      if (t.matches('#dock') && e.target !== t) return; if (t.matches('.free') && e.target !== t) return;
      sx = lx = e.clientX; sy = ly = e.clientY; fired = false; stop();
      timer = setTimeout(() => {
        fired = true; navigator.vibrate?.(25);
        if (t.matches('.app[data-id]')) { const a = appById(t.dataset.id); a && appEditor(a); }
        else if (t.matches('#dock button')) dockEditor(S.dock.find(x => x.id === t.dataset.did));
        else if (t.matches('#dock')) dockEditor(null);
        else if (t.matches('.fwin')) Win.lift(t.dataset.win, { pointerId: e.pointerId, x: lx, y: ly });
        else if (t.matches('.grid > .card')) Win.fromCard(t);
        else if (t.matches('.free')) Win.menu();
      }, 600);
    }, true);
    ['pointerup', 'pointercancel', 'scroll', 'dragstart'].forEach(ev => document.addEventListener(ev, () => { stop(); if (fired) setTimeout(() => { fired = false; }, 200); }, true)); // el clic de la pulsación larga llega enseguida; después se deja de filtrar
    document.addEventListener('pointermove', e => { lx = e.clientX; ly = e.clientY; if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) stop(); }, true);
    document.addEventListener('contextmenu', e => { if (e.target.closest('.fwin,.app,#dock')) e.preventDefault(); });
    document.addEventListener('click', e => { if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; } }, true); // evita que la pulsación larga abra la app
  })();

  /* Reemplaza el pintado del icono de app para admitir imagen y colores */
  appHtml = function (a, x) { // eslint-disable-line no-func-assign
    const auto = !a.bg && !a.img && typeof appGrad === 'function';
    return `<div class="app" data-id="${esc(a.id)}"><div class="ico${auto ? ' col' : ''}" style="${auto ? 'background:' + appGrad(a) + ';' : ''}${colorStyle(a)}">${iconHtml(a)}</div><span>${esc(a.n)}</span>${x ? '<button class="x" data-del>✕</button>' : ''}</div>`;
  };

  /* Panel de Ajustes para la barra lateral */
  function dockPanel() {
    const w = el('<div><div class="sec-t">Barra lateral</div><div class="note">Mantén pulsado un botón de la barra (o el hueco vacío) para editarlo o añadir otro. También puedes hacerlo aquí.</div></div>');
    S.dock.forEach(it => { const r = el(`<div class="row"><div class="dockprev" style="flex:none"><span class="dki" style="${colorStyle({ bg: it.bg })}${it.fg ? 'color:' + esc(it.fg) : ''}">${iconHtml(it)}</span></div><div class="tx"><b>${esc(it.n)}</b><small>${esc(it.t)}</small></div><button class="btn sec">Editar</button></div>`); $('button', r).onclick = () => dockEditor(it); w.append(r); });
    const add = el('<button class="btn">＋ Añadir botón</button>'); add.onclick = () => dockEditor(null);
    const rst = el('<button class="btn sec" style="margin-left:8px">Restablecer barra</button>'); rst.onclick = () => { S.dock = DOCK_DEF.map(([id, i, n, t]) => ({ id, i, n, t })); save(); renderDock(); renderers.settings(); };
    w.append(add, rst); return w;
  }
  const _sr0 = settingRow;
  settingRow = function (it) { return it.t === 'dockpanel' ? dockPanel() : _sr0(it); }; // eslint-disable-line no-func-assign
  CATS.barra = ['⬅ Barra lateral', [{ t: 'dockpanel' }]];
  const _go0 = go; go = function (p) { _go0(p); $$('#dock button').forEach(b => b.classList.toggle('act', b.dataset.go === p)); }; // eslint-disable-line no-func-assign

  return { appEditor, dockEditor, renderDock, paste, urlFrom, normUrl, hostOf, iconHtml, colorStyle };
})();

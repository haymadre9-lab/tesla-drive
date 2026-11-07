'use strict';
/* Biblioteca de mapas: guarda tus mapas (PWA/páginas) y cambia con un toque entre ellos y el mapa integrado.
   Sirve para la ventana del mapa en los dashboards y para la pantalla Navegar. */

const Maps = (() => {
  S.maps ||= []; S.mapPage ||= 'builtin';
  const get = id => S.maps.find(m => m.id === id) || null;
  const icon = m => (m.e || '🗺');

  /* Alta / edición de un mapa */
  function edit(m, pre = {}, done) {
    const M = Object.assign({ id: 'm' + Date.now(), n: '', u: '', e: '🗺' }, m ? JSON.parse(JSON.stringify(m)) : {}, pre), isNew = !m;
    dlg(`<h3>${isNew ? 'Añadir mapa' : 'Editar mapa'}</h3><div class="f ed">
      <label>Dirección del mapa (PWA o página)<div class="inline"><input class="in" id="mu" placeholder="https://…" value="${esc(M.u)}"><button class="btn sec" id="mp" type="button">📋 Pegar</button></div></label>
      <label>Nombre<input class="in" id="mn" value="${esc(M.n)}" placeholder="Ej. Mi mapa de radares"></label>
      <label>Icono (emoji)<input class="in" id="me" maxlength="4" value="${esc(M.e || '')}"></label></div>
      <div class="acts">${isNew ? '' : '<button class="btn bad" id="md" type="button">Eliminar</button>'}<button class="btn sec" id="mc" type="button">Cancelar</button><button class="btn" id="mk" type="button">Guardar</button></div>`, d => {
      $('#mp', d).onclick = async () => { const t = await Ed.paste(), u = Ed.urlFrom(t) || t; if (u) { $('#mu', d).value = u; if (!$('#mn', d).value) $('#mn', d).value = Ed.hostOf(u).replace(/^www\./, ''); } };
      $('#mc', d).onclick = closeDlg;
      $('#mk', d).onclick = () => {
        const u = Ed.normUrl($('#mu', d).value), n = $('#mn', d).value.trim(); if (!u || !n) return toast('Nombre y dirección son obligatorios');
        Object.assign(M, { u, n, e: $('#me', d).value.trim() || '🗺' });
        if (m) Object.assign(m, M); else S.maps.push(M);
        save(); closeDlg(); toast('Mapa guardado'); if (done) done(M); else if (page === 'settings') renderers.settings();
      };
      if (!isNew) { const del = $('#md', d); del.onclick = () => { if (del.dataset.s) { S.maps = S.maps.filter(x => x !== m); if (S.mapPage === m.id) S.mapPage = 'builtin'; save(); closeDlg(); if (page === 'settings') renderers.settings(); } else { del.dataset.s = 1; del.textContent = '¿Seguro?'; } }; }
    });
  }

  /* Selector rápido: mapa integrado + mis mapas */
  function pick(cb, current) {
    dlg(`<h3>🗺 Elegir mapa</h3><div class="f"><button class="btn ${current === 'builtin' ? '' : 'sec'}" data-m="builtin" type="button" style="text-align:left">🧭 Mapa de LecoAuto (integrado, con rutas)</button>
      ${S.maps.map(m => `<button class="btn ${current === m.id ? '' : 'sec'}" data-m="${esc(m.id)}" type="button" style="text-align:left">${esc(icon(m))} ${esc(m.n)} <small style="opacity:.7">${esc(Ed.hostOf(m.u))}</small></button>`).join('')}
      <button class="btn sec" id="madd" type="button">＋ Añadir un mapa nuevo (pegar dirección)</button></div><div class="acts"><button class="btn sec" id="mx" type="button">Cerrar</button></div>`, d => {
      $('#mx', d).onclick = closeDlg;
      $$('[data-m]', d).forEach(b => b.onclick = () => { closeDlg(); cb(b.dataset.m); });
      $('#madd', d).onclick = () => edit(null, {}, m => { closeDlg(); cb(m.id); });
    });
  }

  /* Cambiar el mapa de la ventana o de la pantalla Navegar desde el propio mapa */
  function switchFrom(el) {
    const f = el && el.closest && el.closest('.fwin');
    if (f) { const w = Dash.cur().win.find(x => x.id === f.dataset.win); pick(id => Win.setMap(f.dataset.win, id), w && w.mapId ? w.mapId : 'builtin'); }
    else pick(id => setPage(id), S.mapPage);
  }
  function setPage(id) { S.mapPage = id; save(); renderers.map(); }

  /* Pantalla Navegar: mapa integrado o uno de mis mapas */
  const _rm = renderers.map;
  renderers.map = () => {
    const m = S.mapPage !== 'builtin' ? get(S.mapPage) : null;
    if (!m) { S.mapPage = 'builtin'; _rm(); return; }
    $('#p-map').innerHTML = `<div class="webmap"><iframe src="${esc(m.u)}" allow="geolocation; autoplay; fullscreen; clipboard-write" referrerpolicy="no-referrer-when-downgrade" title="${esc(m.n)}"></iframe><div class="wmtools"><button class="btn sec" id="wmsw" type="button">🗺 ${esc(m.n)} ▾</button></div></div>`;
    $('#wmsw').onclick = () => pick(setPage, S.mapPage);
  };

  /* Ajustes → Mis mapas */
  function panel() {
    const w = el('<div><div class="note">Guarda aquí tus mapas (cada uno es una dirección web o PWA). Luego, en la ventana del mapa toca <b>🗺</b> para cambiar de uno a otro con un toque, o vuelve al mapa integrado.</div><div class="sec-t">Mis mapas</div></div>');
    if (!S.maps.length) w.append(el('<div class="note">Todavía no tienes ninguno.</div>'));
    S.maps.forEach(m => { const r = el(`<div class="row"><div class="tx"><b>${esc(icon(m))} ${esc(m.n)}</b><small>${esc(m.u)}</small></div><button class="btn sec">Editar</button></div>`); $('button', r).onclick = () => edit(m); w.append(r); });
    const add = el('<button class="btn">＋ Añadir mapa</button>'); add.onclick = () => edit(null); w.append(add);
    const sel = el(`<div class="row" style="margin-top:12px"><div class="tx"><b>Mapa de la pantalla «Navegar»</b><small>Cuál se muestra al abrir Navegar</small></div><select id="mps"><option value="builtin">🧭 Integrado (con rutas)</option>${S.maps.map(m => `<option value="${esc(m.id)}" ${S.mapPage === m.id ? 'selected' : ''}>${esc(icon(m))} ${esc(m.n)}</option>`).join('')}</select></div>`);
    $('#mps', sel).onchange = e => { S.mapPage = e.target.value; save(); toast('Guardado'); }; w.append(sel);
    return w;
  }
  const _sr2 = settingRow;
  settingRow = function (it) { return it.t === 'mapspanel' ? panel() : _sr2(it); }; // eslint-disable-line no-func-assign
  CATS.maps = ['🗺 Mis mapas', [{ t: 'mapspanel' }]]; { const a = CATS.acerca; delete CATS.acerca; CATS.acerca = a; }

  return { get, edit, pick, switchFrom, setPage, panel };
})();

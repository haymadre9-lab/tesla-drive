'use strict';
/* Dashboards intercambiables: cada uno elige widgets, tamaños, estilo (skin) y acento.
   Se carga después de app.js y amplía WIDGETS, ACTIONS y el editor de ajustes. */

const PRESETS = [
  { id: 'classic', n: 'Clásico', i: '🏠', d: 'Reloj, clima, música, mapa y neumáticos', skin: 'glass', w: [['clock', 1, '1x1'], ['weather', 1, '1x1'], ['music', 1, '2x1'], ['map', 1, '2x2'], ['speed', 1, '1x1'], ['tpms', 1, '1x1'], ['apps', 1, '2x1']] },
  { id: 'drive', n: 'Conducción', i: '🚗', d: 'Velocímetro analógico, guía de ruta y mapa', skin: 'carbon', accent: '#ff6a1a', rows: 2, w: [['gauge', 1, '2x2'], ['navinfo', 1, '2x1'], ['map', 1, '2x1'], ['trip', 1, '1x1'], ['tpms', 1, '1x1']] },
  { id: 'speed', n: 'Velocímetro', i: '⚡', d: 'Velocidad grande, límite y brújula', skin: 'neon', accent: '#00e5ff', rows: 2, w: [['speedbig', 1, '2x2'], ['navinfo', 1, '2x1'], ['compass', 1, '1x1'], ['clock', 1, '1x1']] },
  { id: 'media', n: 'Música', i: '🎵', d: 'Reproductor y letras a pantalla grande', skin: 'sky', accent: '#b388ff', rows: 2, w: [['music', 1, '2x2'], ['lyrics', 1, '2x2'], ['clock', 1, '1x1'], ['weather', 1, '1x1']] },
  { id: 'ev', n: 'Coche', i: '🔋', d: 'Neumáticos, viaje, brújula y clima', skin: 'glass', accent: '#39d98a', rows: 2, w: [['tpms', 1, '2x2'], ['trip', 1, '1x1'], ['compass', 1, '1x1'], ['weather', 1, '2x1'], ['clock', 1, '1x1']] },
  { id: 'minimal', n: 'Minimal', i: '▫️', d: 'Solo hora y velocidad, sin tarjetas', skin: 'minimal', accent: '#ffffff', rows: 1, w: [['clock', 1, '2x1'], ['speedbig', 1, '2x1']] },
  { id: 'hud', n: 'HUD parabrisas', i: '🔆', d: 'Velocidad en espejo para reflejar en el cristal (móvil sobre el salpicadero)', skin: 'hud', accent: '#39ffb0', rows: 1, mirror: true, w: [['hud', 1, '1x1']] },
];
const SPANS = ['1x1', '2x1', '1x2', '2x2'];
const SKINS = [['glass', 'Cristal'], ['carbon', 'Carbono'], ['neon', 'Neón'], ['sky', 'Cielo'], ['minimal', 'Minimal'], ['hud', 'HUD']];
const clone = o => JSON.parse(JSON.stringify(o));

const Dash = (() => {
  if (!Array.isArray(S.dashboards) || !S.dashboards.length) S.dashboards = clone(PRESETS);
  PRESETS.forEach(p => { if (!S.dashboards.find(d => d.id === p.id)) S.dashboards.push(clone(p)); });
  if (!S.dashboards.find(d => d.id === S.dash)) S.dash = 'classic';

  const cur = () => S.dashboards.find(d => d.id === S.dash) || S.dashboards[0];
  const accent = () => cur().accent || S.accent;
  function sync(D) { // asegura que todos los widgets existan en la lista del dashboard
    Object.keys(WIDGETS).forEach(id => { if (!D.w.find(x => x[0] === id)) D.w.push([id, 0, (WIDGETS[id].cls.match(/w-\d+x\d+/) || ['w-1x1'])[0].slice(2)]); });
    return D;
  }
  function use(id) { S.dash = id; save(); applyTheme(); go('home'); renderers.home(); tag(); }
  function next(d) { const l = S.dashboards, i = l.findIndex(x => x.id === S.dash); use(l[(i + d + l.length) % l.length].id); toast(cur().i + ' ' + cur().n); }
  function tag() { const t = $('#dashtag'); if (t) { $('b', t).textContent = cur().i + ' ' + cur().n; t.style.display = page === 'home' ? '' : 'none'; } }

  function picker() {
    dlg(`<h3>🎛 Dashboards</h3><div class="dgrid">${S.dashboards.map(d => `<div class="dcard ${d.id === S.dash ? 'sel' : ''}" data-id="${esc(d.id)}"><div class="di">${esc(d.i)}</div><b>${esc(d.n)}</b><small>${esc(d.d || 'Personalizado')}</small></div>`).join('')}</div>
      <div class="acts"><button class="btn sec" id="dnew">＋ Duplicar actual</button><button class="btn sec" id="dset">⚙ Editar</button><button class="btn" id="dc">Cerrar</button></div>`, d => {
      $$('.dcard', d).forEach(c => c.onclick = () => { closeDlg(); use(c.dataset.id); });
      $('#dc', d).onclick = closeDlg; $('#dset', d).onclick = () => { closeDlg(); cat = 'inicio'; go('settings'); };
      $('#dnew', d).onclick = () => { closeDlg(); dup(); };
    });
  }
  async function dup() {
    const n = await promptDlg('Nombre del nuevo dashboard', 'Mi dashboard', cur().n + ' (copia)'); if (!n) return;
    const D = clone(cur()); D.id = 'u' + Date.now(); D.n = n; D.d = 'Personalizado'; S.dashboards.push(D); use(D.id);
  }

  /* ── Widgets nuevos ── */
  const arcPt = (r, deg) => { const a = deg * Math.PI / 180; return [(r * Math.sin(a)).toFixed(1), (-r * Math.cos(a)).toFixed(1)]; };
  const gaugeMax = () => S.speedUnit === 'mph' ? 150 : 240;
  WIDGETS.gauge = {
    n: 'Velocímetro analógico', cls: 'w-2x2', render: el => {
      const max = gaugeMax(), step = max === 150 ? 10 : 20; let ticks = '';
      for (let v = 0; v <= max; v += step) { const deg = -120 + v / max * 240, [x1, y1] = arcPt(78, deg), [x2, y2] = arcPt(v % (step * 2) === 0 ? 66 : 70, deg), [tx, ty] = arcPt(54, deg);
        ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="tk"/>` + (v % (step * 2) === 0 ? `<text x="${tx}" y="${(+ty + 3).toFixed(1)}" class="tl">${v}</text>` : ''); }
      const [sx, sy] = arcPt(86, -120), [ex, ey] = arcPt(86, 120);
      el.innerHTML = `<svg viewBox="-100 -100 200 170" class="gauge"><path d="M${sx} ${sy} A86 86 0 1 1 ${ex} ${ey}" class="gr"/>${ticks}
        <g class="js-needle" transform="rotate(-120)"><line x1="0" y1="8" x2="0" y2="-72" class="nd"/></g><circle r="7" class="hub"/>
        <text y="38" class="gv js-spd">0</text><text y="54" class="gu">${spdUnit()}</text></svg><div class="limchip gl" hidden></div>`;
      renderSpeedUI(); Poi.renderLimit();
    },
  };
  WIDGETS.speedbig = { n: 'Velocidad grande', cls: 'w-2x2', render: el => { el.innerHTML = `<div class="sbig"><div class="v js-spd">0</div><div class="u">${spdUnit()}</div><div class="limchip" hidden></div><div class="bar"><i class="js-spdbar"></i></div></div>`; renderSpeedUI(); Poi.renderLimit(); } };
  WIDGETS.navinfo = { n: 'Guía de ruta', cls: 'w-2x1', render: el => { el.classList.add('js-navw'); el.onclick = () => go('map'); navUpd(); } };
  function navUpd() {
    const s = Nav.summary();
    $$('.js-navw').forEach(el => {
      el.innerHTML = s ? `<h4>Navegación</h4><div class="navi"><div class="ni">${esc(s.icon)}</div><div class="nt"><b>${esc(s.dist)}</b><span>${esc(s.text)}</span><small>${esc(s.rem)} · llegada ${esc(s.eta)}</small></div></div>`
        : `<h4>Navegación</h4><div class="navi idle"><div class="ni">🧭</div><div class="nt"><b>Sin ruta</b><span>Toca para elegir destino</span></div></div>`;
    });
  }
  bus.on('nav', navUpd);
  WIDGETS.trip = { n: 'Ordenador de viaje', cls: 'w-1x1', render: el => { el.classList.add('js-tripw'); tripUpd(); el.onclick = () => dlg('<h3>Ordenador de viaje</h3><div class="note">¿Reiniciar distancia, velocidad máxima y tiempo?</div><div class="acts"><button class="btn sec" id="c">No</button><button class="btn bad" id="k">Reiniciar</button></div>', d => { $('#c', d).onclick = closeDlg; $('#k', d).onclick = () => { S.trip = 0; S.maxSpeed = 0; S.tripT = 0; save(); closeDlg(); tripUpd(); }; }); } };
  function tripUpd() {
    $$('.js-tripw').forEach(el => {
      const mi = S.speedUnit === 'mph', d = mi ? S.trip / 1609.34 : S.trip / 1000, t = S.tripT || 0, avg = t > 30 ? d / (t / 3600) : 0, h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60);
      el.innerHTML = `<h4>Viaje</h4><div class="trip"><div><b>${d.toFixed(1)}</b><small>${mi ? 'mi' : 'km'}</small></div><div><b>${Math.round(spdConv(S.maxSpeed))}</b><small>máx ${spdUnit()}</small></div><div><b>${Math.round(avg)}</b><small>media ${spdUnit()}</small></div><div><b>${h}:${String(m).padStart(2, '0')}</b><small>en marcha</small></div></div>`;
    });
  }
  const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  WIDGETS.compass = {
    n: 'Brújula', cls: 'w-1x1', render: el => {
      let t = ''; for (let i = 0; i < 12; i++) { const [x1, y1] = arcPt(80, i * 30), [x2, y2] = arcPt(i % 3 ? 72 : 66, i * 30); t += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="tk"/>`; }
      el.innerHTML = `<div class="comp"><svg viewBox="-100 -100 200 200"><circle r="86" class="gr" style="fill:none"/>${t}<text y="-52" class="tl" style="font-size:16px">N</text><g class="js-comp"><path d="M0 -62 L12 12 L0 4 L-12 12Z" class="nd" style="fill:var(--acc)"/></g></svg><b class="js-card">—</b></div>`; compUpd();
    },
  };
  function compUpd() {
    const h = Poi.state.heading ?? (GPS.pos && GPS.pos.heading != null && !isNaN(GPS.pos.heading) ? GPS.pos.heading : null);
    $$('.js-comp').forEach(g => g.setAttribute('transform', `rotate(${h ?? 0})`)); $$('.js-card').forEach(e => e.textContent = h == null ? '—' : `${CARD[Math.round(h / 45) % 8]} ${Math.round(h)}°`);
  }
  WIDGETS.lyrics = { n: 'Letras grandes', cls: 'w-2x2', render: el => { el.classList.add('js-lyrw'); lyrUpd(); } };
  function lyrUpd() {
    $$('.js-lyrw').forEach(el => {
      const L = Mus.lrc, i = Mus.lrcIdx;
      if (!L.length) { el.innerHTML = `<div class="lyrbig"><p class="cur" style="font-size:20px;color:var(--dim)">${Mus.i < 0 ? 'Añade música y un archivo .lrc para ver la letra' : 'Sin letra. Carga un .lrc en Música'}</p></div>`; return; }
      const row = (k, c) => `<p class="${c}">${esc(L[k]?.s || '')}</p>`;
      el.innerHTML = `<div class="lyrbig">${row(i - 1, 'prev')}${row(i, 'cur')}${row(i + 1, 'nxt')}${row(i + 2, 'nxt')}</div>`;
    });
  }
  audio.addEventListener('timeupdate', () => { if (Mus.lrcIdx !== lyrUpd.last) { lyrUpd.last = Mus.lrcIdx; lyrUpd(); } });
  bus.on('music', lyrUpd);
  WIDGETS.hud = {
    n: 'HUD parabrisas', cls: 'w-1x1', render: el => {
      el.classList.add('hudcard'); const D = cur();
      el.innerHTML = `<div class="hudw ${D.mirror ? 'mir' : ''}"><div class="hv js-spd">0</div><div class="hu">${spdUnit()}</div><div class="limchip" hidden></div><div class="hn js-hudnav"></div></div><div class="hudtip">Toca para espejo/normal</div>`;
      el.onclick = () => { D.mirror = !D.mirror; save(); $('.hudw', el).classList.toggle('mir', !!D.mirror); };
      renderSpeedUI(); Poi.renderLimit(); hudUpd();
    },
  };
  function hudUpd() { const s = Nav.summary(); $$('.js-hudnav').forEach(e => e.textContent = s ? `${s.icon} ${s.dist}` : ''); }
  bus.on('nav', hudUpd);

  /* ── Refresco al llegar posición / velocidad ── */
  const _rs = renderSpeedUI;
  renderSpeedUI = function () { // eslint-disable-line no-func-assign
    _rs(); const v = spdConv(GPS.speed), deg = -120 + clamp(v / gaugeMax(), 0, 1) * 240;
    $$('.js-needle').forEach(n => n.setAttribute('transform', `rotate(${deg.toFixed(1)})`)); tripUpd(); compUpd();
  };
  bus.on('pos', () => compUpd());

  /* ── Navegación entre dashboards ── */
  ACTIONS.nextdash = ['Siguiente dashboard', () => next(1)]; ACTIONS.prevdash = ['Dashboard anterior', () => next(-1)]; ACTIONS.dashpick = ['Elegir dashboard', picker];
  const _go = go;
  go = function (p) { _go(p); tag(); }; // eslint-disable-line no-func-assign

  renderers.home = () => {
    const D = sync(cur()), root = $('#p-home'); root.innerHTML = '<div class="grid"></div>'; const g = $('.grid', root);
    g.style.setProperty('--rows', D.rows || S.rows); if (D.colw) g.style.setProperty('--colw', D.colw + 'px');
    D.w.filter(([id, on]) => on && WIDGETS[id]).forEach(([id, , span]) => {
      const c = document.createElement('div'); c.className = 'card w-' + (span || '1x1') + ' ' + (WIDGETS[id].cls || '').replace(/w-\d+x\d+/g, '').trim(); c.dataset.w = id; g.append(c); WIDGETS[id].render(c);
    });
    tickClock(); renderWeather(); renderSpeedUI(); Poi.renderLimit(); tag();
  };

  /* ── Editor en Ajustes ── */
  widgetsEditor = function () { // eslint-disable-line no-func-assign
    const D = sync(cur()), w = el('<div class="wgl"></div>');
    const head = el(`<div class="row"><div class="tx"><b>Dashboard activo</b><small>Cambia el aspecto y las funciones visibles en la pantalla de inicio. También puedes cambiar con el botón 🎛 de arriba.</small></div><select id="dsel">${S.dashboards.map(d => `<option value="${esc(d.id)}" ${d.id === D.id ? 'selected' : ''}>${esc(d.i)} ${esc(d.n)}</option>`).join('')}</select></div>`);
    $('#dsel', head).onchange = e => { use(e.target.value); renderers.settings(); }; w.append(head);
    const row2 = el(`<div class="row"><div class="tx"><b>Estilo</b></div><select id="dskin">${SKINS.map(([k, l]) => `<option value="${k}" ${k === D.skin ? 'selected' : ''}>${l}</option>`).join('')}</select><input type="color" id="dacc" value="${D.accent || S.accent}"><select id="drows">${[0, 1, 2, 3].map(n => `<option value="${n}" ${(D.rows || 0) === n ? 'selected' : ''}>${n ? n + (n > 1 ? ' filas' : ' fila') : 'Filas: auto'}</option>`).join('')}</select></div>`);
    $('#dskin', row2).onchange = e => { D.skin = e.target.value; save(); applyTheme(); renderers.home(); };
    $('#dacc', row2).oninput = e => { D.accent = e.target.value; save(); applyTheme(); }; $('#drows', row2).onchange = e => { D.rows = +e.target.value || undefined; save(); renderers.home(); }; w.append(row2);
    const acts = el('<div class="row"><div class="tx"><b>Gestionar</b></div><button class="btn sec" id="adup">Duplicar</button><button class="btn sec" id="aren">Renombrar</button><button class="btn bad" id="adel"></button></div>');
    const preset = PRESETS.find(p => p.id === D.id); $('#adel', acts).textContent = preset ? 'Restablecer' : 'Eliminar';
    $('#adup', acts).onclick = dup;
    $('#aren', acts).onclick = async () => { const n = await promptDlg('Nombre', '', D.n); if (n) { D.n = n; save(); renderers.settings(); tag(); } };
    $('#adel', acts).onclick = () => { if (preset) { Object.assign(D, clone(preset)); } else { S.dashboards = S.dashboards.filter(x => x !== D); S.dash = 'classic'; } save(); applyTheme(); renderers.home(); renderers.settings(); tag(); toast(preset ? 'Restablecido' : 'Eliminado'); };
    w.append(acts, el('<div class="sec-t">Widgets de este dashboard (orden, tamaño y visibilidad)</div>'));
    D.w.forEach(([id, on, span], i) => {
      const r = el(`<div class="row"><div class="tx"><b>${esc(WIDGETS[id].n)}</b></div><select class="sp">${SPANS.map(s => `<option ${s === span ? 'selected' : ''}>${s}</option>`).join('')}</select><button class="mini" data-d="-1">▲</button><button class="mini" data-d="1">▼</button><div class="sw ${on ? 'on' : ''}"></div></div>`);
      $('.sw', r).onclick = () => { D.w[i][1] = on ? 0 : 1; save(); renderers.settings(); renderers.home(); };
      $('.sp', r).onchange = e => { D.w[i][2] = e.target.value; save(); renderers.home(); };
      $$('.mini', r).forEach(b => b.onclick = () => { const j = i + +b.dataset.d; if (j < 0 || j >= D.w.length) return; [D.w[i], D.w[j]] = [D.w[j], D.w[i]]; save(); renderers.settings(); renderers.home(); });
      w.append(r);
    });
    return w;
  };

  /* ── UI global: botón y etiqueta ── */
  $('#btnDash').onclick = picker;
  const t = document.createElement('div'); t.id = 'dashtag'; t.innerHTML = '<button data-d="-1">◀</button><b></b><button data-d="1">▶</button>'; $('#pages').append(t);
  $$('button', t).forEach(b => b.onclick = () => next(+b.dataset.d)); $('b', t).onclick = picker;
  return { cur, accent, use, next, picker };
})();

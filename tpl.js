'use strict';
/* Plantillas para crear tu propio dashboard: eliges la distribución y el modelo de velocímetro,
   y luego mueves y cambias cualquier ventana a tu gusto (mantén pulsada una ventana). */

const Tpl = (() => {
  const SPEEDO_STYLES = [['digital', 'Digital'], ['analog', 'Analógico'], ['sport', 'Deportivo'], ['ring', 'Anillo'], ['linear', 'Barra horizontal'], ['tesla', 'Minimal Tesla']];
  const W = (wid, r, span = '2x2', extra = {}) => Object.assign({ wid, r, span }, extra);
  const TPLS = [
    { id: 'digital', n: 'Velocímetro + mapa', i: '🔢', d: 'Velocímetro a la izquierda y mapa GPS a la derecha', skin: 'tesla', accent: '#3e9bff', style: 'digital',
      win: [W('speedo', [1, 1, 35, 98], '2x2', { pick: 1 }), W('navmap', [37, 1, 62, 98], '2x2')] },
    { id: 'analog', n: 'Velocímetro + mapa + música', i: '⏱', d: 'Dial analógico, música online y mapa grande', skin: 'carbon', accent: '#ff8a1a', style: 'analog',
      win: [W('speedo', [1, 1, 36, 60], '2x2', { pick: 1 }), W('stream', [1, 62, 36, 37], '2x1'), W('navmap', [38, 1, 61, 98], '2x2')] },
    { id: 'sport', n: 'Deportivo', i: '🏁', d: 'Velocímetro de competición, mapa y datos del viaje', skin: 'sport', accent: '#ff2d3d', style: 'sport',
      win: [W('speedo', [1, 1, 58, 66], '2x2', { pick: 1 }), W('navmap', [60, 1, 39, 66], '2x2'), W('trip', [1, 68, 22, 31], '1x1'), W('tpms', [24, 68, 22, 31], '1x1'), W('stream', [47, 68, 52, 31], '2x1')] },
    { id: 'pwamap', n: 'Mi PWA con el mapa en el centro', i: '🧩', d: 'Tu PWA a pantalla completa y el mapa flotando en medio (pon tu dirección en ⚙)', skin: 'minimal', accent: '#3e9bff', style: 'digital',
      win: [{ type: 'web', url: '', title: 'Mi PWA', r: [0, 0, 100, 100], span: '2x2' }, W('navmap', [20, 12, 60, 76], '2x2', { rad: 26 }), W('speedo', [1, 70, 17, 28], '1x1', { pick: 1, opt: { style: 'ring' }, bg: '#000000', alpha: 55 })] },
    { id: 'media', n: 'Música + mapa', i: '🎵', d: 'Reproductor online y radio grande, mapa y velocidad', skin: 'aurora', accent: '#b388ff', style: 'ring',
      win: [W('stream', [1, 1, 46, 98], '2x2'), W('navmap', [48, 1, 51, 60], '2x1'), W('speedo', [48, 62, 51, 37], '2x1', { pick: 1 })] },
    { id: 'tres', n: 'Escena Tesla: mapa de fondo + 2 relojes', i: '🛞', d: 'El mapa ocupa toda la pantalla y los relojes de velocidad y de carretera flotan encima, integrados y difuminados, sin bordes', skin: 'teslaos', accent: '#2e7bff', style: 'round', immersive: true,
      win: [W('navmap', [0, 0, 100, 100], '2x2', { flat: true, rad: 0, opt: { search: false, layers: false, focus: 'right' } }),
        W('scrim', [0, 0, 66, 100], '2x2', { flat: true, opt: { side: 'left', strength: 92 } }), W('scrim', [0, 0, 100, 17], '2x1', { flat: true, opt: { side: 'top', strength: 80 } }), W('scrim', [0, 82, 100, 18], '2x1', { flat: true, opt: { side: 'bottom', strength: 85 } }),
        W('speedo', [1, 16, 41, 66], '2x2', { pick: 1, flat: true }), W('roadgauge', [37.5, 53, 25, 40], '2x2', { flat: true }),
        W('topbar', [6, 1.5, 92.5, 8], '2x1', { flat: true }), W('navcard', [74, 17, 24.5, 13], '1x1', { bg: '#0b0f17', alpha: 70, rad: 22 }), W('nowplaying', [74, 70, 24.5, 14], '1x1', { bg: '#0b0f17', alpha: 70, rad: 22 }), W('roadbar', [1.5, 92.5, 60, 6], '2x1', { flat: true })] },
    { id: 'tesla2', n: 'Escena: música + reloj sobre el mapa', i: '🚘', d: 'Mapa de fondo, reloj redondo grande y música, todo integrado como en la pantalla del coche', skin: 'teslaos', accent: '#2e7bff', style: 'round', immersive: true,
      win: [W('navmap', [0, 0, 100, 100], '2x2', { flat: true, rad: 0, opt: { search: false, layers: false, focus: 'right' } }),
        W('scrim', [0, 0, 100, 100], '2x2', { flat: true, opt: { side: 'all', strength: 90 } }), W('scrim', [0, 0, 60, 100], '2x2', { flat: true, opt: { side: 'left', strength: 80 } }),
        W('music', [1.5, 14, 27, 66], '1x2', { flat: true, fade: 14 }), W('speedo', [27, 8, 40, 84], '2x2', { pick: 1, flat: true }),
        W('topbar', [6, 1.5, 92.5, 8], '2x1', { flat: true }), W('roadbar', [1.5, 92.5, 97, 6], '2x1', { flat: true })] },
    { id: 'advisor', n: 'Asesor + mapa', i: '🧠', d: 'Tiempo, destinos habituales y consejos (comer, cargar, aparcar) junto al mapa y la velocidad', skin: 'tesla', accent: '#3e9bff', style: 'ring',
      win: [W('advisor', [1, 1, 40, 98], '2x2'), W('navmap', [42, 1, 57, 70], '2x2'), W('speedo', [42, 72, 57, 27], '2x1', { pick: 1 })] },
    { id: 'blank', n: 'En blanco', i: '⬜', d: 'Empieza vacío y añade las ventanas que quieras con ＋', skin: 'tesla', accent: '#3e9bff', style: 'digital', win: [] },
  ];

  function make(t, name, style) {
    style = style || t.style;
    const key = Canvas.key(), id = 'u' + Date.now().toString(36);
    const win = t.win.map((s, k) => {
      const o = { id: 'w' + Math.random().toString(36).slice(2, 7), type: s.type || 'widget', z: k + 1, span: s.span || '1x1', r: {} };
      if (o.type === 'web') Object.assign(o, { url: s.url || '', title: s.title || 'Mi PWA', bar: false });
      else { o.wid = s.wid; if (s.opt || s.pick) o.opt = Object.assign({}, s.opt || {}); if (s.pick && style) o.opt.style = style; }
      if (s.bg) { o.bg = s.bg; o.alpha = s.alpha ?? 100; } if (s.rad != null) o.rad = s.rad; if (s.flat) o.flat = true; if (s.fade) o.fade = s.fade;
      o.r.land = s.r.slice(); if (key !== 'land' && key !== 'port') o.r[key] = s.r.slice(); // formato fijo (Tesla, móvil…): se usa tal cual
      return o;
    });
    const D = { id, n: name || t.n, i: t.i, d: 'Personalizado', skin: t.skin, accent: t.accent, immersive: !!t.immersive, rows: 2, w: [], win };
    S.dashboards.push(D); S.dash = id; save(); applyTheme(); go('home'); renderers.home(); Dash.tag();
    toast('Dashboard creado · mantén pulsada una ventana para moverla o cambiarla', 4500);
  }
  function wizard() {
    let sel = TPLS[0];
    const prev = t => `<div class="tpv">${t.win.map(s => `<i style="left:${s.r[0]}%;top:${s.r[1]}%;width:${s.r[2]}%;height:${s.r[3]}%" class="${s.type === 'web' ? 'w' : s.wid === 'navmap' ? 'm' : ''}"></i>`).join('')}</div>`;
    dlg(`<h3>✨ Crear tu dashboard</h3><div class="dgrid tg">${TPLS.map(t => `<div class="dcard ${t === sel ? 'sel' : ''}" data-t="${t.id}">${prev(t)}<b>${t.i} ${esc(t.n)}</b><small>${esc(t.d)}</small></div>`).join('')}</div>
      <div class="f ed" style="margin-top:12px"><label>Nombre<input class="in" id="tn" value="${esc(sel.n)}"></label><label id="tsl">Modelo de velocímetro<select class="in" id="ts">${SPEEDO_STYLES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label></div>
      <div class="acts"><button class="btn sec" id="tc" type="button">Cancelar</button><button class="btn" id="tk" type="button">Crear</button></div>`, d => {
      const upd = () => { $('#ts', d).value = sel.style; $('#tsl', d).style.display = sel.win.some(s => s.pick) ? '' : 'none'; };
      $$('.dcard', d).forEach(c => c.onclick = () => { sel = TPLS.find(t => t.id === c.dataset.t); $$('.dcard', d).forEach(x => x.classList.toggle('sel', x === c)); $('#tn', d).value = sel.n; upd(); }); upd();
      $('#tc', d).onclick = closeDlg; $('#tk', d).onclick = () => { closeDlg(); make(sel, $('#tn', d).value.trim(), $('#ts', d).value); };
    });
  }
  return { wizard, make, TPLS };
})();

'use strict';
/* Disposición rápida de la escena: posición del reloj de velocidad (izquierda, centro, derecha) y tamaño
   (grande o compacto: velocidad pequeña arriba para ver más mapa). Recoloca los relojes, el degradado y el foco del mapa. */

const Scene = (() => {
  const POS = [['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']], SIZE = [['big', 'Grande'], ['compact', 'Compacto']];
  const ratio = () => (typeof Canvas !== 'undefined' && Canvas.ratio()) || ($('.free') && $('.free').clientWidth / $('.free').clientHeight) || 1.6;
  const available = () => { const D = Dash.cur(); return !!(D.win && D.win.some(w => w.wid === 'speedo') && D.win.some(w => w.wid === 'roadgauge')); };
  const current = () => Object.assign({ pos: 'left', size: 'big' }, Dash.cur().speedLayout || {});
  const rd = n => Math.round(n * 10) / 10;

  /* Rectángulos [x, y, ancho, alto] en % del lienzo. Los círculos se calculan con la proporción para que sean redondos. */
  function layout(pos, size, r) {
    const sq = h => [h / r, h]; // ancho en % para un alto h (círculo)
    if (size === 'compact') {
      const [w, h] = sq(27), y = pos === 'center' ? 2 : pos === 'right' ? 27 : 11;
      const sx = pos === 'center' ? 50 - w - 1.2 : pos === 'right' ? 98.5 - w : 7, rx = pos === 'center' ? 50 + 1.2 : pos === 'right' ? 98.5 - 2 * w - 1.5 : 7 + w + 1.5;
      return { speed: [sx, y, w, h], road: [rx, y, w, h], focus: 'center', scrim: { side: pos === 'right' ? 'right' : 'left', rect: pos === 'right' ? [60, 0, 40, 100] : [0, 0, 40, 100], strength: 25 }, top: 78 };
    }
    const [w, h] = sq(66), [rw, rh] = sq(40);
    if (pos === 'right') return { speed: [99 - w, 17, w, h], road: [99 - w - rw + w * 0.1 + 0.5, 53, rw, rh], focus: 'left', scrim: { side: 'right', rect: [34, 0, 66, 100], strength: 92 }, top: 80 };
    if (pos === 'center') return { speed: [(100 - w) / 2, 14, w, h], road: [(100 + w) / 2 - rw * 0.2, 55, rw, rh], focus: 'right', scrim: { side: 'all', rect: [0, 0, 100, 100], strength: 85 }, top: 80 };
    return { speed: [1, 17, w, h], road: [1 + w * 0.9, 53, rw, rh], focus: 'right', scrim: { side: 'left', rect: [0, 0, 66, 100], strength: 92 }, top: 80 };
  }

  function apply(pos, size) {
    const D = Dash.cur(); if (!available()) return toast('Este dashboard no tiene reloj de velocidad y reloj de carretera');
    const cur = current(); pos = pos || cur.pos; size = size || cur.size; const L = layout(pos, size, ratio());
    const keys = w => { const ks = Object.keys(w.r).filter(k => Canvas.orientOf(k) === 'land'); const ck = Canvas.key(); if (Canvas.orientOf(ck) === 'land' && !ks.includes(ck)) ks.push(ck); return ks.length ? ks : ['land']; };
    const put = (w, rect) => { if (w) keys(w).forEach(k => { w.r[k] = rect.map(rd); }); };
    put(D.win.find(w => w.wid === 'speedo'), L.speed); put(D.win.find(w => w.wid === 'roadgauge'), L.road);
    const main = D.win.find(w => w.wid === 'scrim' && w.opt && /^(left|right|all)$/.test(w.opt.side) && (w.r.land || Object.values(w.r)[0] || [0, 0, 0])[2] >= 40);
    if (main) { main.opt.side = L.scrim.side; main.opt.strength = L.scrim.strength; put(main, L.scrim.rect); }
    const top = D.win.find(w => w.wid === 'scrim' && w.opt && w.opt.side === 'top'); if (top) top.opt.strength = L.top;
    const left = size === 'big' && pos === 'right'; // con el reloj grande a la derecha, las tarjetas pasan a la izquierda
    put(D.win.find(w => w.wid === 'nowplaying'), [left ? 1.5 : 74, 70, 24.5, 14]);
    D.win.filter(w => w.wid === 'navmap').forEach(w => { w.opt = Object.assign({}, w.opt, { focus: L.focus }); });
    D.speedLayout = { pos, size }; save(); renderers.home(); toast(`Reloj: ${POS.find(p => p[0] === pos)[1].toLowerCase()} · ${SIZE.find(s => s[0] === size)[1].toLowerCase()}`);
  }
  const nextPos = () => { const c = current(), i = POS.findIndex(p => p[0] === c.pos); return POS[(i + 1) % POS.length][0]; };

  /* Botones rápidos (diálogo de ventana y ajustes del dashboard) */
  function controls(onDone) {
    const c = current(), box = el('<div class="scn"></div>');
    box.innerHTML = `<small>Posición del reloj de velocidad</small><div class="seg" data-g="pos">${POS.map(([k, l]) => `<button type="button" data-v="${k}" class="${c.pos === k ? 'on' : ''}">${l}</button>`).join('')}</div><small>Tamaño</small><div class="seg" data-g="size">${SIZE.map(([k, l]) => `<button type="button" data-v="${k}" class="${c.size === k ? 'on' : ''}">${l === 'Compacto' ? 'Compacto (más mapa)' : l}</button>`).join('')}</div>`;
    $$('button', box).forEach(b => b.onclick = () => { const g = b.parentNode.dataset.g, cur = current(); apply(g === 'pos' ? b.dataset.v : cur.pos, g === 'size' ? b.dataset.v : cur.size); if (onDone) onDone(); });
    return box;
  }

  ACTIONS.speedpos = ['Reloj de velocidad: cambiar de lado', () => apply(nextPos(), null)]; ACTIONS.speedsize = ['Reloj de velocidad: grande / compacto', () => apply(null, current().size === 'big' ? 'compact' : 'big')];
  /* Migración única: la tarjeta «Sin ruta / próxima maniobra» se quita de las escenas (la sustituyen la lupa y el menú ⋮ del mapa; la maniobra se ve en el propio mapa) */
  if (!S.navcardGone) { (S.dashboards || []).forEach(D => { if (D.win && D.win.some(w => w.wid === 'scrim') && D.win.some(w => w.wid === 'roadgauge')) D.win = D.win.filter(w => w.wid !== 'navcard'); }); S.navcardGone = true; save(); }
  return { apply, available, current, controls, layout };
})();

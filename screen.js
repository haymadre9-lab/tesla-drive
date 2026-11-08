'use strict';
/* Formato de pantalla ("lienzo") para diseñar ventanas: así lo que diseñas en el móvil se ve igual en el coche.
   Con un formato fijo, el área de ventanas se ajusta a esa proporción (con franjas si sobra espacio). */

const Canvas = (() => {
  const PROFILES = [
    ['auto', 'Automático (usar toda la pantalla)', null],
    ['tesla3y', 'Tesla Model 3 / Y · 16:10', 1.6],
    ['teslasx', 'Tesla Model S / X (2021+) · ≈ 17:10', 2200 / 1300],
    ['cyber', 'Tesla Cybertruck · ≈ 16:9 (aprox.)', 16 / 9],
    ['m169', 'Móvil clásico · 16:9', 16 / 9],
    ['m209', 'Móvil actual · 20:9', 20 / 9],
    ['t43', 'Tablet · 4:3', 4 / 3],
    ['custom', 'Personalizado / medido en esta pantalla', null],
  ];
  S.screen ||= { p: 'auto', r: 1.6 };
  const prof = () => PROFILES.find(p => p[0] === S.screen.p) || PROFILES[0];
  const ratio = () => { const p = prof(); return p[0] === 'auto' ? null : p[0] === 'custom' ? (+S.screen.r || 1.6) : p[2]; };
  const key = () => ratio() === null ? (innerHeight > innerWidth || innerWidth < 761 ? 'port' : 'land') : S.screen.p;
  const orientOf = k => k === 'land' || k === 'port' ? k : ((k === 'custom' ? (+S.screen.r || 1.6) : (PROFILES.find(p => p[0] === k) || [0, 0, 1.6])[2]) >= 1 ? 'land' : 'port');
  const orient = () => orientOf(key());
  const label = () => { const r = ratio(); return r === null ? (orient() === 'port' ? 'Vertical' : 'Horizontal') : `${prof()[1].split(' · ')[0]} · ${r.toFixed(2)}:1`; };

  /* Ajusta el contenedor de ventanas a la proporción elegida */
  function fit(root) {
    const host = root.parentElement, r = ratio();
    if (r === null) { root.removeAttribute('style'); root.classList.remove('canvas'); return; }
    const W = host.clientWidth, H = host.clientHeight; let w = W, h = W / r; if (h > H) { h = H; w = H * r; }
    root.classList.add('canvas'); root.style.cssText = `position:absolute;left:${Math.round((W - w) / 2)}px;top:${Math.round((H - h) / 2)}px;width:${Math.round(w)}px;height:${Math.round(h)}px`;
  }
  addEventListener('resize', () => { const f = $('.free'); if (f) fit(f); });

  function panel() {
    const w = el('<div></div>'), host = $('.page.act') || $('#p-home'), hw = host ? host.clientWidth : innerWidth, hh = host ? host.clientHeight : innerHeight; // todas las páginas tienen el mismo tamaño
    w.append(el(`<div class="note"><b>¿Para qué sirve?</b> Las ventanas se guardan en % de un «lienzo». Si eliges el formato de tu coche aquí, verás en el móvil exactamente cómo quedará en el coche (con franjas si el móvil tiene otra proporción).<br><br>
      <b>Formatos reales:</b> [Probable] los Tesla Model 3 / Y tienen pantalla 16:10 (1920×1200) y los Model S / X nuevos unos 2200×1300; <b>ninguno es 4:3</b>. Los móviles actuales son más alargados (≈ 20:9), no 16:9. Además, el navegador del coche ocupa un poco menos que la pantalla entera. <b>Lo más fiable: abre la app en el coche y pulsa «Medir esta pantalla»</b>, luego publica la configuración.</div>`));
    const sel = el(`<div class="row"><div class="tx"><b>Formato del diseño</b><small>Área de trabajo actual: ${hw} × ${hh} px (${(hw / hh).toFixed(2)}:1)</small></div><select id="sp">${PROFILES.map(p => `<option value="${p[0]}" ${p[0] === S.screen.p ? 'selected' : ''}>${esc(p[1])}</option>`).join('')}</select></div>`);
    $('#sp', sel).onchange = e => { S.screen.p = e.target.value; save(); renderers.home(); renderers.settings(); }; w.append(sel);
    if (S.screen.p === 'custom') {
      const c = el(`<div class="row"><div class="tx"><b>Proporción personalizada</b><small>Ancho ÷ alto (ej. 1,6 = 16:10)</small></div><input type="number" step="0.01" min="0.5" max="4" id="cr" value="${(+S.screen.r || 1.6).toFixed(2)}" style="width:90px"></div>`);
      $('#cr', c).onchange = e => { S.screen.r = clamp(parseFloat(e.target.value) || 1.6, 0.5, 4); save(); renderers.home(); }; w.append(c);
    }
    const m = el('<div class="row"><div class="tx"><b>📏 Medir esta pantalla</b><small>Usa la proporción exacta del área de ventanas de este dispositivo. Hazlo en el coche y publica la configuración.</small></div><button class="btn">Medir</button></div>');
    $('button', m).onclick = () => { const h = $('.page.act') || $('#p-home'); const r = h.clientWidth / h.clientHeight; if (!isFinite(r) || r < .3) return toast('No se pudo medir: vuelve a intentarlo'); S.screen = { p: 'custom', r: Math.round(r * 100) / 100 }; save(); renderers.home(); renderers.settings(); toast(`Formato medido: ${S.screen.r}:1`); };
    w.append(m);
    return w;
  }
  const _sr3 = settingRow;
  settingRow = function (it) { return it.t === 'screenpanel' ? panel() : _sr3(it); }; // eslint-disable-line no-func-assign
  CATS.pantalla = ['📐 Pantalla y formato', [{ t: 'screenpanel' }]]; { const a = CATS.acerca; delete CATS.acerca; CATS.acerca = a; }
  return { key, ratio, orient, orientOf, label, fit, PROFILES };
})();

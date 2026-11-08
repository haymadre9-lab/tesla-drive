'use strict';
/* Widgets visuales: velocímetro con varios modelos (analógico, digital, deportivo, anillo, barra, Tesla),
   reloj grande y lista de cargadores cercanos. Cada widget admite opciones desde el configurador de ventana. */

const Speedo = (() => {
  let uid = 0;
  const unitMax = () => S.speedUnit === 'mph' ? 150 : 240;
  const pt = (r, deg) => [(r * Math.sin(deg * Math.PI / 180)).toFixed(1), (-r * Math.cos(deg * Math.PI / 180)).toFixed(1)];
  const arc = (r, a0, a1) => { const [x0, y0] = pt(r, a0), [x1, y1] = pt(r, a1); return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
  const stepFor = max => max <= 130 ? 10 : max <= 200 ? 20 : max <= 260 ? 20 : 40;
  const lim = '<div class="limchip"></div>';

  function ticksSvg(max, r0, r1, rl, fs) {
    const st = stepFor(max); let t = '';
    for (let v = 0; v <= max; v += st / 2) {
      const major = v % st === 0, deg = -120 + v / max * 240, [x1, y1] = pt(r0, deg), [x2, y2] = pt(major ? r1 : r1 + 4, deg);
      t += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="sp-tk${major ? ' mj' : ''}"/>`;
      if (major && rl) { const [tx, ty] = pt(rl, deg); t += `<text x="${tx}" y="${(+ty + fs * .35).toFixed(1)}" class="sp-tl" style="font-size:${fs}px">${v}</text>`; }
    }
    return t;
  }
  const STYLES = {
    analog: (o, max) => `<svg viewBox="-100 -100 200 200"><circle r="94" class="sp-ring"/>${ticksSvg(max, 84, 74, 60, 11)}<path d="${arc(90, -120, 120)}" class="sp-trk thin"/><path d="${arc(90, -120, 120)}" class="sp-arc thin" pathLength="100" stroke-dasharray="0 100"/>
      <g class="sp-needle" transform="rotate(-120)"><line x1="0" y1="14" x2="0" y2="-80" class="sp-nd"/></g><circle r="8" class="sp-hub"/>
      <text y="50" class="sp-num js-spd" style="font-size:36px">0</text><text y="66" class="sp-unit">${spdUnit()}</text></svg>${lim}`,
    sport: (o, max) => { const id = 'sg' + (++uid), rz = -120 + .85 * 240; return `<svg viewBox="-100 -100 200 200"><defs><linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#19d3ff"/><stop offset=".55" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff2d3d"/></linearGradient></defs>
      <path d="${arc(84, -120, 120)}" class="sp-trk"/><path d="${arc(84, rz, 120)}" class="sp-zone"/><path d="${arc(84, -120, 120)}" class="sp-arc" pathLength="100" stroke-dasharray="0 100" stroke="url(#${id})"/>
      ${ticksSvg(max, 68, 58, 0, 10)}<text y="26" class="sp-num sport js-spd" style="font-size:60px">0</text><text y="46" class="sp-unit">${spdUnit()}</text></svg>
      <div class="sp-leds">${Array.from({ length: 14 }, (_, i) => `<i class="${i < 6 ? 'g' : i < 10 ? 'y' : 'r'}"></i>`).join('')}</div>${lim}`; },
    digital: () => `<div class="sp-d">${lim}<div class="d-num js-spd">0</div><div class="d-unit">${spdUnit()}</div><div class="sp-blks">${'<i></i>'.repeat(26)}</div></div>`,
    ring: () => `<svg viewBox="-100 -100 200 200"><circle r="80" class="sp-trk thin" style="fill:none"/><path d="M0 -80 A80 80 0 1 1 -0.01 -80" class="sp-arc" pathLength="100" stroke-dasharray="0 100" transform="rotate(0)"/>
      <text y="16" class="sp-num js-spd" style="font-size:62px">0</text><text y="40" class="sp-unit">${spdUnit()}</text></svg>${lim}`,
    linear: (o, max) => { const st = stepFor(max); let t = ''; for (let v = 0; v <= max; v += st * 2) t += `<span style="left:${v / max * 100}%">${v}</span>`; return `<div class="sp-l"><div class="l-top"><div class="l-num js-spd">0</div><div class="l-unit">${spdUnit()}</div>${lim}</div><div class="l-bar"><i class="sp-bar-i"></i></div><div class="l-ticks">${t}</div></div>`; },
    round: () => `<div class="sp-rd"><svg viewBox="-100 -100 200 200"><circle r="97" class="rd-disc"/><circle r="91" class="rd-ring"/><path d="M0 -91 A91 91 0 1 1 -0.01 -91" class="sp-arc thin2" pathLength="100" stroke-dasharray="0 100"/><text y="-56" class="rd-gps">GPS</text><text y="28" class="sp-num rd-num js-spd">0</text><text y="54" class="sp-unit">${spdUnit()}</text></svg>${lim}</div>`,
    tesla: () => `<div class="sp-t">${lim}<div class="t-num js-spd">0</div><div class="t-unit">${spdUnit()}</div><div class="t-line"><i class="sp-bar-i"></i></div></div>`,
  };
  const OPTS = [
    { k: 'style', l: 'Modelo de velocímetro', type: 'select', o: [['digital', 'Digital (grande y luminoso)'], ['analog', 'Analógico clásico'], ['sport', 'Deportivo (arco, zona roja y luces)'], ['ring', 'Anillo minimalista'], ['linear', 'Barra horizontal'], ['tesla', 'Minimal estilo Tesla'], ['round', 'Redondo estilo Tesla (aro luminoso)']], d: 'digital' },
    { k: 'max', l: 'Máxima de la escala', type: 'select', o: [['auto', 'Automática'], ['120', '120'], ['160', '160'], ['200', '200'], ['240', '240'], ['300', '300']], d: 'auto' },
    { k: 'color', l: 'Color propio', type: 'color', d: '' },
    { k: 'limit', l: 'Mostrar la señal del límite de la vía', type: 'bool', d: true },
  ];
  WIDGETS.speedo = {
    n: 'Velocímetro (elige modelo)', cls: 'w-2x2', opts: OPTS, render: el => {
      const o = Object.assign({ style: 'digital', max: 'auto', color: '', limit: true }, el.wopt || {}), max = o.max === 'auto' ? unitMax() : +o.max || unitMax();
      el.classList.add('spw'); el.innerHTML = `<div class="sp sp-${o.style}${o.limit === false ? ' nolim' : ''}" data-max="${max}" style="${o.color ? '--sc:' + esc(o.color) : ''}">${(STYLES[o.style] || STYLES.digital)(o, max)}</div>`;
      renderSpeedUI(); Poi.renderLimit();
    },
  };
  function update() {
    const roots = $$('.sp'); if (!roots.length) return;
    const v = spdConv(GPS.speed), limit = Poi.state.limit, over = limit && GPS.speed * 3.6 > limit + 3;
    roots.forEach(r => {
      const pct = clamp(v / (+r.dataset.max || unitMax()), 0, 1);
      $$('.sp-arc', r).forEach(a => a.setAttribute('stroke-dasharray', `${(pct * 100).toFixed(1)} 100`));
      $$('.sp-needle', r).forEach(n => n.setAttribute('transform', `rotate(${(-120 + pct * 240).toFixed(1)})`));
      const bl = $$('.sp-blks i, .sp-leds i', r); if (bl.length) { const n = Math.round(pct * bl.length); bl.forEach((b, i) => b.classList.toggle('on', i < n)); }
      $$('.sp-bar-i', r).forEach(b => { b.style.width = (pct * 100).toFixed(1) + '%'; });
      r.classList.toggle('over', !!over);
    });
  }
  const _rs3 = renderSpeedUI;
  renderSpeedUI = function () { _rs3(); update(); }; // eslint-disable-line no-func-assign

  /* ── Reloj grande ── */
  WIDGETS.clockpro = {
    n: 'Reloj grande (digital / analógico)', cls: 'w-2x1', opts: [
      { k: 'style', l: 'Modelo de reloj', type: 'select', o: [['digital', 'Digital'], ['analog', 'Analógico']], d: 'digital' }, { k: 'sec', l: 'Mostrar segundos', type: 'bool', d: false }],
    render: el => {
      const o = Object.assign({ style: 'digital', sec: false }, el.wopt || {}); el.classList.add('ckw');
      if (o.style === 'analog') {
        let t = ''; for (let i = 0; i < 60; i++) { const [x1, y1] = pt(92, i * 6), [x2, y2] = pt(i % 5 ? 88 : 82, i * 6); t += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="sp-tk${i % 5 ? '' : ' mj'}"/>`; }
        el.innerHTML = `<div class="ck-an"><svg viewBox="-100 -100 200 200"><circle r="97" class="sp-ring"/>${t}<g class="c-h"><line y2="-50" class="sp-nd" style="stroke-width:6"/></g><g class="c-m"><line y2="-74" class="sp-nd" style="stroke-width:4"/></g><g class="c-s"><line y1="12" y2="-82" class="sp-nd" style="stroke:var(--sc,var(--acc));stroke-width:2"/></g><circle r="6" class="sp-hub"/></svg></div>`;
      } else el.innerHTML = `<div class="ck-di"><div class="c-time"><span class="c-hm js-clock">--:--</span>${o.sec ? '<span class="c-s2">00</span>' : ''}</div><div class="c-date js-date"></div></div>`;
      clockTick();
    },
  };
  function clockTick() {
    const d = new Date(), h = d.getHours() % 12 + d.getMinutes() / 60, m = d.getMinutes() + d.getSeconds() / 60, s = d.getSeconds();
    $$('.c-h').forEach(g => g.setAttribute('transform', `rotate(${h * 30})`)); $$('.c-m').forEach(g => g.setAttribute('transform', `rotate(${m * 6})`)); $$('.c-s').forEach(g => g.setAttribute('transform', `rotate(${s * 6})`));
    $$('.c-s2').forEach(e => { e.textContent = String(s).padStart(2, '0'); });
  }
  setInterval(clockTick, 1000);

  /* ── Cargadores cercanos ── */
  const dd = (a, b) => { const R = 6371000, r = x => x * Math.PI / 180, dLa = r(b[0] - a[0]), dLo = r(b[1] - a[1]), x = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  const fd = m => m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m / 10) * 10 + ' m';
  WIDGETS.chargers = { n: 'Cargadores cercanos', cls: 'w-2x1', render: el => { el.classList.add('js-chgw'); Poi.need('chargers'); chgUpd(); } };
  function chgUpd() {
    const boxes = $$('.js-chgw'); if (!boxes.length) return;
    const p = GPS.pos ? [GPS.pos.latitude, GPS.pos.longitude] : S.lastPos, list = p ? Poi.state.chargers.map(c => ({ c, d: dd(p, [c.lat, c.lon]) })).sort((a, b) => a.d - b.d).slice(0, 5) : [];
    boxes.forEach(el => {
      el.innerHTML = `<h4>⚡ Cargadores cercanos</h4>${list.length ? list.map((x, i) => `<div class="chg ${x.c.tesla ? 'tesla' : ''}" data-i="${i}"><span class="ci">⚡</span><div><b>${esc(x.c.name)}</b><small>${esc(x.c.op || '')}${x.c.cap ? ' · ' + esc(x.c.cap) + ' puntos' : ''}</small></div><em>${fd(x.d)}</em><button class="btn sec">Ir</button></div>`).join('') : `<div class="note">${p ? 'Buscando cargadores cercanos… (necesita conexión)' : 'Sin posición GPS todavía'}</div>`}`;
      $$('.chg', el).forEach(r => { $('button', r).onclick = () => { const c = list[+r.dataset.i].c; go('map'); setTimeout(() => Nav.routeTo({ name: c.name, lat: c.lat, lon: c.lon }), 400); }; });
    });
  }
  let lastChg = 0; bus.on('poi', chgUpd); bus.on('pos', () => { if (Date.now() - lastChg > 6000) { lastChg = Date.now(); chgUpd(); } });
  return { update, STYLES };
})();

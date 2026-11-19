/* Vista 3D de carriles y cartel de maniobra para la vista de cruce.
   Se monta dentro de un contenedor (#njv). Recibe la maniobra real de la ruta:
   update({ side: 'left'|'right'|'straight', lanes: [{ valid, indications }], distance, scene, night }).
   Three.js se carga desde jsDelivr (versión fija). Sin modelos externos: árboles y edificios procedurales.
   D = dirección de la salida: +1 a la izquierda, -1 a la derecha (en coordenadas de la escena). */
(() => {
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
  const LANE = 2.0, ZMAX = 60, SALIDA_Z = 6;
  let T = null, loading = null;

  const cf = z => 1 - 0.32 * Math.min(z / 40, 1); // convergencia de carriles hacia el horizonte

  function loadThree() {
    if (!loading) loading = import(THREE_URL).then(m => (T = m));
    return loading;
  }

  function Lane3D(el, onFail) {
    this.el = el; this.failed = false;
    el.innerHTML = '<div class="l3-wrap"><canvas class="l3-cv"></canvas><img class="l3-photo" alt="" hidden><div class="l3-sign" aria-live="polite"></div></div>';
    this.cv = el.querySelector('.l3-cv');
    this.sign = el.querySelector('.l3-sign');
    this.state = null;
    this.ready = false;
    loadThree().then(() => this.init()).catch(() => { this.failed = true; el.querySelector('.l3-wrap').hidden = true; if (onFail) onFail(); });
  }

  Lane3D.prototype.init = function () {
    const t = T;
    this.r = new t.WebGLRenderer({ canvas: this.cv, antialias: true });
    this.r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new t.Scene();
    this.cam = new t.PerspectiveCamera(60, 1, 0.05, 400);
    this.scene.add(new t.HemisphereLight(0xffffff, 0x3a4a3a, 1.6));
    const sun = new t.DirectionalLight(0xffffff, 1.4); sun.position.set(-6, 14, 4); this.scene.add(sun);
    const sky = new t.Mesh(new t.SphereGeometry(300, 24, 12), new t.MeshBasicMaterial({ color: 0x9cc4e8, side: t.BackSide }));
    this.scene.add(sky);
    const grass = new t.Mesh(new t.PlaneGeometry(600, 600), new t.MeshLambertMaterial({ color: 0x2f5a36 }));
    grass.rotation.x = -Math.PI / 2; grass.position.y = -0.01; this.scene.add(grass);
    this.world = new t.Group(); this.scene.add(this.world);
    this.ready = true;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.el);
    const loop = () => { if (!this.el.isConnected) return; this.frame(); requestAnimationFrame(loop); };
    loop();
    if (this.state) this.build();
  };

  Lane3D.prototype.resize = function () {
    if (!this.ready) return;
    const w = this.cv.clientWidth, h = this.cv.clientHeight || Math.round(w * 1.15);
    this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  };

  Lane3D.prototype.build = function () {
    const t = T, st = this.state, g = this.world, sel = st.sel, D = st.D, n = st.n;
    // carriles que salen (todos los válidos); vacío en maniobra recta o en incorporación
    const exitList = st.exits || [], exiting = exitList.length > 0;
    const outerE = exiting ? (D > 0 ? Math.min(...exitList) : Math.max(...exitList)) : sel; // carril de salida más alejado del centro (exterior)
    const hl = exiting ? exitList : [sel];
    const mat = c => new t.MeshLambertMaterial({ color: c });
    g.clear();
    // centro del carril i en z; el carril elegido se separa hacia la salida (lado D) tras SALIDA_Z
    const cen = (i, z) => {
      let x = -(i - (n - 1) / 2) * LANE * cf(z); // índice 0 = izquierda del todo (+x = izquierda de la pantalla); la pila va centrada
      if (exiting && exitList.includes(i) && z > SALIDA_Z) { const d = z - SALIDA_Z; x += D * (0.9 * (1 - Math.exp(-d / 1.6)) + d * d * 0.06); }
      return x;
    };
    const ribbon = (fn, y, color) => {
      const pos = [], idx = []; const N = Math.round(ZMAX / 1.5);
      for (let i = 0; i <= N; i++) { const z = -2 + i * 1.5, [a, b] = fn(z); pos.push(a, y, z, b, y, z); if (i < N) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
      const geo = new t.BufferGeometry(); geo.setAttribute('position', new t.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      g.add(new t.Mesh(geo, new t.MeshLambertMaterial({ color, side: t.DoubleSide })));
    };
    const strip = (xOf, zA, zB, w, color) => {
      const pos = [], idx = [];
      for (let z = zA, k = 0; z <= zB; z += 1.5, k++) { const x = xOf(z); pos.push(x - w, 0.04, z, x + w, 0.04, z); if (k > 0) { const j = pos.length / 3 - 4; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); } }
      const gg = new t.BufferGeometry(); gg.setAttribute('position', new t.Float32BufferAttribute(pos, 3)); gg.setIndex(idx);
      g.add(new t.Mesh(gg, new t.MeshBasicMaterial({ color, side: t.DoubleSide })));
    };
    // asfalto: arcén, carriles y carril elegido
    // arcén: en el lado de salida sigue el borde del carril de salida tras la separación (sin cuña)
    // arcén simétrico; tras la separación desaparece: el hueco entre la pila y el carril que sale queda verde
    ribbon(z => { if (exiting && z > SALIDA_Z) return [0, 0]; const h = LANE * (n / 2) * cf(z) + 0.8; return [-h, h]; }, 0.005, 0x3a404b);
    // asfalto de cada carril (sigue al carril que sale); el elegido, un tono más claro
    for (let i = 0; i < n; i++) ribbon(z => [cen(i, z) - LANE * cf(z) / 2, cen(i, z) + LANE * cf(z) / 2], 0.03, hl.includes(i) ? 0x6f7888 : 0x3a404b);
        // líneas entre carriles (i = límites de carril) y borde de la salida
    // líneas entre carriles: siguen al carril que sale, así la línea de su borde se separa con él
    for (let k = 0; k <= n; k++) { const A = exitList.includes(k - 1), B = exitList.includes(k); strip(z => (B && !A ? cen(k, z) + LANE * cf(z) / 2 : cen(k - 1, z) - LANE * cf(z) / 2), -2, ZMAX, 0.08, 0xf2f4f8); }
    // flecha blanca sobre el carril elegido
    const pts = []; for (let z = 2; z <= 30; z += 1) pts.push(new t.Vector3(cen(sel, z), 0.12, z));
    g.add(new t.Mesh(new t.TubeGeometry(new t.CatmullRomCurve3(pts), 80, 0.22, 10, false), new t.MeshBasicMaterial({ color: 0xffffff })));
    const tip = new t.Vector3(cen(sel, 31.2), 0.12, 31.2), base = pts[pts.length - 1], dir = new t.Vector3().subVectors(tip, base).normalize();
    const head = new t.Mesh(new t.ConeGeometry(0.6, 1.3, 14), new t.MeshBasicMaterial({ color: 0xffffff }));
    head.quaternion.setFromUnitVectors(new t.Vector3(0, 1, 0), dir); head.position.copy(base).addScaledVector(dir, 0.65); g.add(head);
    // guardarraíles: lado sin salida todo el tramo; lado salida solo a lo largo del carril de salida
    const rail = (edge, zA, zB) => {
      const m = mat(0xaeb8c4), p = mat(0x6d7784);
      for (let z = zA; z < zB; z += 3) {
        const z1 = Math.min(z + 3, zB), x0 = edge(z), x1 = edge(z1);
        const seg = new t.Mesh(new t.BoxGeometry(0.06, 0.14, Math.hypot(x1 - x0, z1 - z)), m);
        seg.position.set((x0 + x1) / 2, 0.62, (z + z1) / 2); seg.rotation.y = Math.atan2(x1 - x0, z1 - z); g.add(seg);
        const post = new t.Mesh(new t.BoxGeometry(0.06, 0.62, 0.06), p); post.position.set(x0, 0.31, z); g.add(post);
      }
    };
    rail(z => -D * (LANE * (n / 2) * cf(z) + 0.9), -2, ZMAX);
    if (exiting) rail(z => cen(outerE, z) + D * (LANE * cf(z) / 2 + 0.5), SALIDA_Z, ZMAX);
    // incorporación: carril de acceso que llega por el lado D desde lejos y se une al borde exterior junto al coche
    if (st.merge) ribbon(z => { const c = D * (LANE * (n / 2) * cf(z) + LANE * cf(z) * (0.5 + 2.2 * Math.min(Math.max(z, 0) / ZMAX, 1))); return [c - LANE * cf(z) * 0.45, c + LANE * cf(z) * 0.45]; }, 0.035, 0x6f7888);
    // postes de luz a ambos lados; en el lado de salida solo tras la separación
    const pole = mat(0x5a616c), lamp = new t.MeshBasicMaterial({ color: 0xfff4d6 });
    for (let z = 10; z < ZMAX; z += 24) for (const side of [-1, 1]) {
      const exitSide = exiting && side === D;
      if (exitSide && z <= SALIDA_Z) continue;
      const x = exitSide ? cen(outerE, z) + D * (LANE * cf(z) / 2 + 1.6) : side * (LANE * (n / 2) * cf(z) + 2.0);
      const p = new t.Mesh(new t.CylinderGeometry(0.09, 0.12, 7, 8), pole); p.position.set(x, 3.5, z); g.add(p);
      const a = new t.Mesh(new t.BoxGeometry(0.08, 0.08, 1.6), pole); a.position.set(x - side * 0.7, 6.9, z); g.add(a);
      const l = new t.Mesh(new t.BoxGeometry(0.35, 0.12, 0.5), lamp); l.position.set(x - side * 1.4, 6.82, z); g.add(l);
    }
    // árboles a ambos lados
    const trunk = mat(0x5b4632), crown = mat(0x2f6b3a);
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let z = -6; z <= ZMAX; z += 4.5) for (const side of [-1, 1]) {
      if (rnd() < 0.25) continue;
      const tr = new t.Group();
      const tk = new t.Mesh(new t.CylinderGeometry(0.15, 0.2, 1.4, 6), trunk); tk.position.y = 0.7; tr.add(tk);
      const cr = new t.Mesh(new t.ConeGeometry(1.4, 3.6, 7), crown); cr.position.y = 3.0; tr.add(cr);
      tr.scale.setScalar(1.6 * (0.85 + rnd() * 0.4)); tr.position.set(side * (5.5 + rnd() * 5.5), 0, z + rnd() * 2); g.add(tr);
    }
    // edificios en la escena de ciudad
    if (st.scene === 'ciudad') {
      seed = 23;
      const wall = [mat(0xd9d2c3), mat(0xb8c4cc), mat(0xe6dccb), mat(0xa9b3a6)];
      for (let z = 0; z <= ZMAX; z += 7) for (const side of [-1, 1]) {
        if (rnd() < 0.1) continue;
        const h = 4 + rnd() * 5, b = new t.Mesh(new t.BoxGeometry(5 + rnd() * 2, h, 6 + rnd() * 2), wall[Math.floor(rnd() * 4)]);
        b.position.set(side * (9 + rnd() * 2), h / 2, z + rnd() * 2); g.add(b);
      }
    }
    this.scene.background = new t.Color(st.night ? 0x0c1220 : 0x9cc4e8);
    this.cenAt = cen;
  };

  Lane3D.prototype.frame = function () {
    if (!this.ready || !this.state || !this.cenAt) return;
    // inclinación: 35° por defecto, sube hasta 45° al acercarse la maniobra (0° = cenital, 60° = conductor)
    const k = Math.max(0, Math.min(1, (this.tilt || 35) / 60)), e = k * k * (3 - 2 * k);
    const sel = this.state.sel, c0 = this.cenAt(sel, 0), c18 = this.cenAt(sel, 18);
    const P0 = new T.Vector3(c0 * 0.5, 34, -2), P1 = new T.Vector3(c0, 1.2, -4.2);
    const L0 = new T.Vector3(c0 * 0.5, 0, 8), L1 = new T.Vector3(c0 + (c18 - c0) * 0.8, 0.4, 22);
    this.cam.position.lerpVectors(P0, P1, e);
    this.cam.lookAt(L0.lerp(L1, e));
    this.r.render(this.scene, this.cam);
  };

  // Foto de referencia para cada maniobra (carpeta img/carriles). Si no hay foto para la maniobra, se muestra la escena 3D.
  function photoFor(st, n, exits) {
    const D = 'img/carriles/';
    const side = st.side === 'left' ? 'izquierda' : st.side === 'right' ? 'derecha' : null;
    const valid = (st.lanes || []).map((l, i) => (l.valid ? i : -1)).filter(i => i >= 0);
    if (st.merge) {
      if (!side) return null;
      if (n === 3) return D + 'incorporacion-3-desde-1-carril-' + side + '.jpg';
      if (n === 2) return D + 'incorporacion-2-desde-1-carril-' + side + '.jpg';
      return null;
    }
    if (!side || st.side === 'straight') { // recto: el carril del borde en autopista de 4, o el carril de la derecha/izquierda en autopista de 2
      if (n === 4 && valid.length === 1) return valid[0] === 3 ? D + 'frente-4-carriles-1-derecha.jpg' : valid[0] === 0 ? D + 'frente-4-carriles-1-izquierda.jpg' : null;
      if (n === 2 && valid.length === 1) return valid[0] === 1 ? D + 'frente-2-carriles-1-derecha.jpg' : valid[0] === 0 ? D + 'frente-2-carriles-1-izquierda.jpg' : null;
      if (n === 3 && valid.length === 1) return valid[0] === 2 ? D + 'frente-3-carriles-1-derecha.jpg' : valid[0] === 0 ? D + 'frente-3-carriles-1-izquierda.jpg' : null;
      return null;
    }
    if (n === 4 && exits.length === 2) {
      if (exits.includes(2) && exits.includes(3)) return D + 'salida-2-de-4-derecha-2-flechas.jpg';
      if (exits.includes(0) && exits.includes(1)) return D + 'salida-2-de-4-izquierda-2-flechas.jpg';
    }
    if (n === 2 && exits.length === 1) {
      if (exits[0] === 1 && side === 'derecha') return D + 'salida-1-de-2-derecha.jpg';
      if (exits[0] === 0 && side === 'izquierda') return D + 'salida-1-de-2-izquierda.jpg';
    }
    if (n === 3 && exits.length === 2) {
      if (exits.includes(1) && exits.includes(2) && side === 'derecha') return D + 'salida-2-de-3-derecha.jpg';
      if (exits.includes(0) && exits.includes(1) && side === 'izquierda') return D + 'salida-2-de-3-izquierda.jpg';
    }
    if (n === 3 && exits.length === 1) {
      if (exits[0] === 2 && side === 'derecha') return D + 'salida-3-carriles-1-derecha.jpg';
      if (exits[0] === 0 && side === 'izquierda') return D + 'salida-3-carriles-1-izquierda.jpg';
    }
    return null;
  }

  Lane3D.prototype.update = function (st) {
    const n = st.lanes && st.lanes.length ? st.lanes.length : 3;
    let sel = n - 1;
    if (st.lanes) { const v = st.lanes.findIndex(l => l.valid); if (v >= 0) sel = v; }
    // el carril de la salida es el más cercano al lado de salida
    const valid = (st.lanes || []).map((l, i) => (l.valid ? i : -1)).filter(i => i >= 0);
    // carriles que salen: todos los válidos si la maniobra es lateral y no toman todos los carriles; nada en recto o incorporación
    const exits = !st.merge && st.side && st.side !== 'straight' && valid.length && valid.length < n ? valid : [];
    // Salida de 2 carriles en el borde (4 carriles): se usa la foto de referencia, con los carriles ya pintados
    const edgeR = exits.length === 2 && n >= 4 && exits.includes(n - 1) && exits.includes(n - 2) && st.side === 'right';
    const edgeL = exits.length === 2 && n >= 4 && exits.includes(0) && exits.includes(1) && st.side === 'left';
    this.photo = photoFor(st, n, exits);
    this.state = { D: st.side === 'left' ? 1 : -1, n, sel, exits, merge: !!st.merge, scene: st.scene || 'autopista', night: !!st.night, side: st.side || 'straight' };
    this.last = st; this.tilt = tiltFor(st.distance);
    this.renderSign(st);
    const ph = this.el.querySelector('.l3-photo'), cv = this.el.querySelector('.l3-cv');
    if (ph && cv) { // foto fija o escena 3D
      if (this.photo) { if (ph.getAttribute('src') !== this.photo) ph.src = this.photo; ph.hidden = false; cv.hidden = true; }
      else { ph.hidden = true; cv.hidden = false; }
    }
    if (this.ready) { this.build(); this.resize(); }
  };

  // Cartel de maniobra. Autopista: azul con letras blancas. Carretera general: blanco con letras negras.
  const ESC = t => String(t == null ? '' : t).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
  const ANG = { straight: 0, 'slight right': 35, right: 90, 'sharp right': 135, uturn: 180, 'sharp left': -135, left: -90, 'slight left': -35 };
  // Flecha de carril sin recuadro. La que se toma: blanca, más larga y más ancha. Las demás: grises y finas.
  const laneArrow = (inds, on) => {
    const k = (inds && inds[0]) || 'straight';
    const W = on ? 2.8 : 1.8, R = on ? 10.5 : 8.5, H = on ? 6 : 4.2, T = on ? 7 : 5;
    let d, head;
    if (k === 'uturn') {
      d = 'M8 22 V11 C8 3 18 3 18 11 L18 15';
      head = 'M18 19 L' + (18 - H) + ' 10.5 L' + (18 + H) + ' 10.5 Z';
    } else {
      const a = ANG[k] || 0, r = a * Math.PI / 180;
      const ex = 12 + R * Math.sin(r), ey = 12 - R * Math.cos(r);
      let dx = ex - 12, dy = ey - 12; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const px = -dy, py = dx, tx = ex + dx * 1.5, ty = ey + dy * 1.5;
      d = 'M12 22 Q12 12 ' + (ex - dx * 2).toFixed(2) + ' ' + (ey - dy * 2).toFixed(2);
      head = 'M' + tx.toFixed(2) + ' ' + ty.toFixed(2) + ' L' + (tx - dx * T + px * H).toFixed(2) + ' ' + (ty - dy * T + py * H).toFixed(2) + ' L' + (tx - dx * T - px * H).toFixed(2) + ' ' + (ty - dy * T - py * H).toFixed(2) + ' Z';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="' + W + '" stroke-linecap="round" stroke-linejoin="round"/><path d="' + head + '" fill="currentColor"/></svg>';
  };
  // Cartel de maniobra. Autopista: azul con letras blancas. Carretera general: blanco con letras negras.
  // Con carriles: flechas de carril (la que se coge en blanco, las demás en negro), distancia y nombre de la vía o pueblo.
  // Rotonda vista desde arriba. La entrada está abajo (90°); el tramo recorrido va marcado y la salida elegida
  // lleva punta de flecha. El número de la salida va dentro de la rotonda.
  const RB_ARM = { 1: 0, 2: -90, 3: -180 };
  function roundaboutSVG(exit) {
    const pt = (a, r) => [50 + r * Math.cos(a * Math.PI / 180), 50 + r * Math.sin(a * Math.PI / 180)];
    const f = v => v.toFixed(1);
    const end = RB_ARM[exit] != null ? RB_ARM[exit] : 0;
    let out = '<svg viewBox="0 0 100 100" aria-hidden="true">';
    out += '<circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" stroke-opacity=".3" stroke-width="7"/>';
    out += '<circle cx="50" cy="50" r="18" fill="currentColor" fill-opacity=".1"/>';
    // tramo recorrido: desde la entrada (90°) en sentido antihorario hasta la salida
    let d = '';
    for (let i = 0; i <= 24; i++) { const a = 90 + (end - 90) * i / 24, [x, y] = pt(a, 30); d += (i ? ' L' : 'M') + f(x) + ' ' + f(y); }
    out += '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>';
    // brazo de salida con punta de flecha
    const [x1, y1] = pt(end, 36), [x2, y2] = pt(end, 46), [hx, hy] = pt(end, 50);
    const ux = Math.cos(end * Math.PI / 180), uy = Math.sin(end * Math.PI / 180);
    const bx = hx - ux * 5, by = hy - uy * 5, px = -uy * 5, py = ux * 5;
    out += '<line x1="' + f(x1) + '" y1="' + f(y1) + '" x2="' + f(bx) + '" y2="' + f(by) + '" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>';
    out += '<path d="M' + f(hx) + ' ' + f(hy) + ' L' + f(bx + px) + ' ' + f(by + py) + ' L' + f(bx - px) + ' ' + f(by - py) + ' Z" fill="currentColor"/>';
    // número de la salida dentro de la rotonda
    out += '<text x="50" y="57" font-size="22" font-weight="800" text-anchor="middle" fill="currentColor">' + (exit || '') + '</text>';
    return out + '</svg>';
  }
  // Cartel de rotonda, formato 5: texto a la izquierda y rotonda a la derecha. Sin nombre de calle, el número de salida va en un recuadro.
  function roundaboutBoard(st) {
    const cls = st.hw ? 'hw' : 'gen';
    const dist = st.distance ? Math.round(st.distance / 10) * 10 + ' m' : '';
    const name = st.dest || st.street || '';
    const box = st.exit && !name ? '<div class="l3-rbbox">' + ESC(st.exit) + '</div>' : '';
    return '<div class="l3-board l3-rb ' + cls + '">' +
      '<div class="l3-rbrow"><div class="l3-rbtx"><small>Rotonda</small>' + box + (name ? '<b>' + ESC(name) + '</b>' : '') + '<span class="l3-rbd">' + dist + '</span></div>' +
      '<div class="l3-rbsvg">' + roundaboutSVG(st.exit) + '</div></div></div>';
  }
  function signHTML(st) {
    const left = st.side === 'left', dist = st.distance ? Math.round(st.distance / 10) * 10 + ' m' : '';
    const cls = st.hw ? 'hw' : 'gen';
    const name = st.dest || st.street || '';
    if (st.roundabout) return roundaboutBoard(st);
    if (st.lanes && st.lanes.length >= 2) {
      const lanes = st.lanes.map(l => '<div class="l3-lane ' + (l.valid ? 'on' : 'off') + '">' + laneArrow(l.indications, !!l.valid) + '</div>').join('');
      return '<div class="l3-board d ' + cls + '">' +
        '<div class="l3-dtop"><span>' + (st.exit ? 'Salida ' + ESC(st.exit) : 'Salida') + '</span><span class="l3-dist">' + dist + '</span></div>' +
        '<div class="l3-lanes">' + lanes + '</div>' +
        (name ? '<div class="l3-dname">' + ESC(name) + '</div>' : '') + '</div>';
    }
    const txt = st.side === 'straight' ? 'Continúa recto' : 'Sal ' + (left ? 'a la izquierda' : 'a la derecha');
    const arrow = left ? 'M46 6 L6 40 L46 74 L46 52 L72 52 L72 28 L46 28 Z' : 'M26 6 L66 40 L26 74 L26 52 L0 52 L0 28 L26 28 Z';
    // Opción 6: flecha, salida y destino en fila; la distancia arriba a la derecha. Azul en autopista, blanco en general.
    const arrowSvg = laneArrow([st.side === 'left' ? 'left' : st.side === 'right' ? 'right' : 'straight'], true);
    const small = st.exit ? 'Salida ' + ESC(st.exit) : 'Salida';
    return '<div class="l3-board ' + cls + ' l3-six">' +
      '<div class="l3-row">' + arrowSvg + '<div class="l3-tx"><small>' + small + '</small><b>' + ESC(name || txt) + '</b></div><div class="l3-dist">' + dist + '</div></div></div>';
  }
  Lane3D.signHTML = signHTML;
  // Herramientas del panel: −/+ para el tamaño, ⠿ para mover. Se guardan con store.save (ajustes de la app).
  Lane3D.toolsHTML = '<div class="l3-tools"><button type="button" data-l3act="move" aria-label="Mover">⠿</button><button type="button" data-l3act="smaller" aria-label="Reducir">−</button><button type="button" data-l3act="bigger" aria-label="Aumentar">+</button><button type="button" data-l3act="reset" aria-label="Volver a la izquierda">⟲</button></div>';
  // El panel vive dentro de una ventana del dashboard, y la pulsación larga de esa ventana abre el editor de
  // ventanas (X y flechas). Por eso los toques del panel se interceptan en la fase de captura de la ventana.
  Lane3D.bindTools = function (panel, store) {
    const cfg = Object.assign({ k: 1.05, x: null, y: null }, store.load() || {});
    const apply = () => {
      panel.style.setProperty('--l3k', cfg.k);
      if (cfg.x != null) { panel.style.left = cfg.x + 'px'; panel.style.top = cfg.y + 'px'; panel.style.bottom = 'auto'; }
      else { panel.style.left = ''; panel.style.top = ''; panel.style.bottom = ''; }
    };
    panel._l3 = { cfg, store, apply };
    apply();
    if (window.__l3guard) return; window.__l3guard = true;
    const owner = t => (t && t.closest ? t.closest('#njv') : null);
    window.addEventListener('pointerdown', e => {
      const pn = owner(e.target); if (!pn || !pn._l3) return;
      e.stopPropagation(); // ni pulsación larga ni selección del editor de ventanas
      const g = e.target.closest('[data-l3act="move"]'); if (!g) return;
      e.preventDefault();
      const { cfg: c, store: st, apply: ap } = pn._l3;
      const pr = pn.parentElement, r0 = pn.getBoundingClientRect(), p0 = pr.getBoundingClientRect();
      const sc = r0.width / (pn.offsetWidth || 1), ox = (e.clientX - r0.left) / sc, oy = (e.clientY - r0.top) / sc;
      g.setPointerCapture(e.pointerId);
      const mv = ev => {
        let x = (ev.clientX - p0.left) / sc - ox, y = (ev.clientY - p0.top) / sc - oy;
        x = Math.max(0, Math.min(x, pr.clientWidth - pn.offsetWidth)); y = Math.max(0, Math.min(y, pr.clientHeight - pn.offsetHeight));
        c.x = Math.round(x); c.y = Math.round(y); ap();
      };
      const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); st.save(c); };
      g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
    }, true);
    window.addEventListener('click', e => {
      const pn = owner(e.target); if (!pn || !pn._l3) return;
      e.stopPropagation();
      const b = e.target.closest('[data-l3act]'); if (!b) return;
      const { cfg: c, store: st, apply: ap } = pn._l3; const a = b.dataset.l3act;
      if (a === 'reset') { c.x = null; c.y = null; ap(); st.save(c); return; }
      if (a === 'bigger') c.k = Math.min(1.6, +(c.k + 0.1).toFixed(2));
      else if (a === 'smaller') c.k = Math.max(0.6, +(c.k - 0.1).toFixed(2));
      else return;
      ap(); st.save(c);
    }, true);
    window.addEventListener('contextmenu', e => { if (owner(e.target)) e.preventDefault(); }, true);
  };

  // 35° lejos, 45° a menos de 150 m de la maniobra
  const tiltFor = d => d == null ? 35 : 35 + 10 * Math.max(0, Math.min(1, (650 - d) / 500));
  Lane3D.prototype.setDistance = function (d) { this.tilt = tiltFor(d); if (this.last) { this.last.distance = d; this.renderSign(this.last); } };
  Lane3D.prototype.renderSign = function (st) { this.sign.innerHTML = signHTML(st); };

  const STYLE = '.l3-wrap{position:relative;display:flex;flex-direction:column;gap:8px;align-items:flex-start;max-width:calc(100vw - 40px)}' +
    '.l3-cv{display:block;width:240px;height:150px;max-width:100%;flex:none;border-radius:14px;background:#0f131a}' +
    '.l3-sign{position:relative;width:240px;flex:none}' +
    '.l3sign{width:240px;flex:none}' +
    '#njv{transform:scale(var(--l3k,1));transform-origin:top left}' +
    '.l3-tools{position:absolute;top:-30px;left:0;display:flex;gap:4px}' +
    '.l3-tools button{min-width:30px;height:26px;border:0;border-radius:8px;background:rgba(8,12,20,.8);color:#fff;font:700 14px system-ui;cursor:pointer;touch-action:none}' +
    '.l3-board{background:#1b6237;color:#fff;border:3px solid #fff;border-radius:12px;box-shadow:0 8px 20px rgba(0,0,0,.4),inset 0 0 0 2px rgba(255,255,255,.12);font-family:system-ui,-apple-system,sans-serif;overflow:hidden}' +
    '.l3-top{display:flex;align-items:center;gap:12px;padding:10px 14px}' +
    '.l3-top svg{width:36px;height:36px;flex:0 0 auto;filter:drop-shadow(0 2px 2px rgba(0,0,0,.3))}' +
    '.l3-n{min-width:34px;height:34px;font-size:18px;padding:0 8px;box-sizing:border-box;border-radius:8px;background:#fff;color:#1b6237;font-weight:800;display:flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}' +
    '.l3-tx{min-width:0;flex:1}' +
    '.l3-k{font-size:11px;letter-spacing:.1em;text-transform:uppercase;opacity:.85}' +
    '.l3-m{font-size:16px;font-weight:700;line-height:1.1;text-wrap:balance}' +
    '.l3-d{background:rgba(0,0,0,.22);padding:6px 14px;font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;text-align:right;border-top:2px solid rgba(255,255,255,.35)}' +
    '.l3-board.hw{background:#0b5fd0;color:#fff;border-color:#fff}' +
    '.l3-board.hw .l3-n{background:#fff;color:#0b5fd0}' +
    '.l3-board.gen{background:#fff;color:#111;border-color:#111}' +
    '.l3-board.gen .l3-n{background:#111;color:#fff}' +
    '.l3-board.gen .l3-d{background:#e9ecf1;border-top-color:#111;color:#111}' +
    '.l3-board{width:240px;height:150px;box-sizing:border-box;overflow:hidden}' +
    '.l3-board.d,.l3-board.l3-six{height:auto;min-height:150px}' +
    '.l3-photo{display:block;width:100%;height:auto;object-fit:contain}' +
    '.l3-rb .l3-rbrow{display:flex;align-items:center;gap:8px;padding:10px;height:100%;box-sizing:border-box}' +
    '.l3-rb .l3-rbtx{min-width:0;flex:1;display:flex;flex-direction:column;gap:4px}' +
    '.l3-rb .l3-rbtx small{font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.85}' +
    '.l3-rb .l3-rbtx b{font-size:16px;line-height:1.15}' +
    '.l3-rb .l3-rbbox{align-self:flex-start;background:#fff;color:#0b5fd0;font-weight:800;font-size:22px;padding:0 8px;border-radius:4px;line-height:30px}' +
    '.l3-rb.gen .l3-rbbox{background:#111;color:#fff}' +
    '.l3-rb .l3-rbd{margin-top:auto;font-size:18px;font-weight:800;font-variant-numeric:tabular-nums}' +
    '.l3-rb .l3-rbsvg{width:104px;height:104px;flex:0 0 auto}' +
    '.l3-rb .l3-rbsvg svg{width:100%;height:100%;display:block}' +
    '.l3-board.hw.l3-rb{color:#fff}' +
    '.l3-board.gen.l3-rb{color:#111}' +
    '.l3-six .l3-row{display:flex;align-items:center;gap:10px;padding:12px}' +
    '.l3-six svg{width:46px;height:46px;flex:0 0 auto}' +
    '.l3-six .l3-tx{min-width:0;flex:1}' +
    '.l3-six .l3-tx small{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.85}' +
    '.l3-six .l3-tx b{display:block;font-size:18px;line-height:1.1}' +
    '.l3-six .l3-dist{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;align-self:flex-start;white-space:nowrap}' +
    '.l3-board.d{border-radius:10px}' +
    '.l3-dtop{display:flex;justify-content:space-between;align-items:center;padding:7px 10px;font-weight:700;font-size:14px}' +
    '.l3-dist{font-size:18px;font-variant-numeric:tabular-nums}' +
    '.l3-lanes{display:flex;gap:4px;padding:0 8px 8px}' +
    '.l3-lane{flex:1;height:48px;display:flex;align-items:center;justify-content:center;box-sizing:border-box}' +
    '.l3-lane svg{width:34px;height:40px}' +
    '.l3-board.hw .l3-lane.on{color:#fff}' +
    '.l3-board.hw .l3-lane.off{color:#8d9bb0}' +
    '.l3-board.gen .l3-lane.on{color:#111}' +
    '.l3-board.gen .l3-lane.off{color:#8a909b}' +
    '.l3-dname{padding:6px 10px;background:rgba(0,0,0,.2);font-size:14px;font-weight:700;text-align:left}' +
    '.l3-board.gen .l3-dname{background:#e9ecf1;color:#111;border-top:2px solid #111}' +
    '.l3-nm{font-size:13px;font-weight:600;opacity:.9;margin-top:3px}';
  if (typeof document !== 'undefined' && !document.getElementById('l3-style')) {
    const s = document.createElement('style'); s.id = 'l3-style'; s.textContent = STYLE; document.head.appendChild(s);
  }
  window.Lane3D = Lane3D;
})();

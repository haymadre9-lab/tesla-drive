'use strict';
/* Bases de datos propias de señales y radares (archivos data/senales.json y data/radares.json, o los que importes en Ajustes).
   Se indexan en una cuadrícula para consultar rápido lo que hay cerca sin recorrer miles de puntos.
   senales.json: {p:[[lat, lon, tipo, dirección], …]} con tipo s = semáforo, p = semáforo peatonal, c = ceda el paso, t = STOP;
   dirección: número = rumbo en grados al que afecta, "f"/"b" = sentido de la vía (sin datos de la vía se ignora), "" = cualquiera.
   radares.json: [{lat, lon, max, t}] con t = fijo | tramo | semaforo | movil. */

const Data = (() => {
  const D = { sig: [], rad: [], idx: {}, info: { sig: null, rad: null }, ready: false };
  const CELL = .02, K = { sig: 'leco.d.sig', rad: 'leco.d.rad' };
  const TYPE = { s: 'signal', p: 'psignal', c: 'yield', t: 'stop' };
  const key = (a, b) => Math.floor(a / CELL) + ',' + Math.floor(b / CELL);
  function index(kind, arr) { const m = new Map(); arr.forEach(x => { const k = key(x.lat, x.lon); let l = m.get(k); if (!l) m.set(k, l = []); l.push(x); }); D.idx[kind] = m; }
  function parseSig(j) {
    const p = Array.isArray(j) ? j : (j && j.p); if (!Array.isArray(p)) throw new Error('El archivo no tiene la lista «p» de señales');
    const out = []; p.forEach((x, i) => { if (!Array.isArray(x) || typeof x[0] !== 'number' || typeof x[1] !== 'number' || !TYPE[x[2]]) return; out.push({ id: 'd' + i, lat: x[0], lon: x[1], t: TYPE[x[2]], dir: typeof x[3] === 'number' ? x[3] : null }); });
    if (!out.length) throw new Error('No se encontró ninguna señal válida'); return { list: out, info: { n: out.length, fecha: j.fecha || '', bbox: j.bbox || null } };
  }
  function parseRad(j) {
    if (!Array.isArray(j)) throw new Error('El archivo de radares debe ser una lista'); const out = [];
    j.forEach((x, i) => { if (!x || typeof x.lat !== 'number' || typeof x.lon !== 'number') return; out.push({ id: 'r' + i, lat: x.lat, lon: x.lon, max: x.max >= 20 && x.max <= 200 ? x.max : null, k: x.t || 'fijo' }); });
    if (!out.length) throw new Error('No se encontró ningún radar válido'); return { list: out, info: { n: out.length } };
  }
  const set = (kind, r) => { D[kind] = r.list; D.info[kind] = r.info; index(kind, r.list); };
  const ls = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  async function load() {
    for (const [kind, file, parse] of [['sig', 'data/senales.json', parseSig], ['rad', 'data/radares.json', parseRad]]) {
      try { const mine = ls(K[kind]); if (mine) { set(kind, parse(mine)); D.info[kind].custom = true; continue; } } catch { }
      try { const r = await fetch(file); if (r.ok) set(kind, parse(await r.json())); } catch { }
    }
    D.ready = true; if (typeof bus !== 'undefined') bus.emit('road');
  }
  function near(kind, p, r) {
    const m = D.idx[kind]; if (!m) return []; const dl = r / 111320, dn = r / (111320 * Math.max(.2, Math.cos(p[0] * Math.PI / 180))), out = [];
    for (let a = Math.floor((p[0] - dl) / CELL); a <= Math.floor((p[0] + dl) / CELL); a++) for (let b = Math.floor((p[1] - dn) / CELL); b <= Math.floor((p[1] + dn) / CELL); b++) { const l = m.get(a + ',' + b); if (l) for (const x of l) out.push(x); }
    return out;
  }
  /* Importar un archivo propio (se guarda en este dispositivo; no se sincroniza con GitHub por su tamaño) */
  function pick(kind) {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = async () => {
      const f = i.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text()), r = (kind === 'sig' ? parseSig : parseRad)(j);
        try { localStorage.setItem(K[kind], JSON.stringify(j)); } catch { return toast('El archivo es demasiado grande para guardarlo en este dispositivo', 4000); }
        set(kind, r); D.info[kind].custom = true; toast(`${kind === 'sig' ? 'Señales' : 'Radares'} importados: ${r.list.length}`, 3500); bus.emit('road'); if (typeof Poi !== 'undefined') Poi.draw(); if (typeof renderers !== 'undefined' && page === 'settings') renderers.settings();
      } catch (e) { toast('No se pudo importar: ' + e.message, 4500); }
    };
    i.click();
  }
  async function reset(kind) { try { localStorage.removeItem(K[kind]); } catch { } await load(); toast('Restaurados los datos incluidos en la app'); if (typeof renderers !== 'undefined' && page === 'settings') renderers.settings(); }
  const sum = kind => { const i = D.info[kind]; return i ? `${i.n} ${kind === 'sig' ? 'señales' : 'radares'}${i.fecha ? ' · ' + i.fecha : ''}${i.custom ? ' · importado por ti' : ' · incluido en la app'}` : 'Sin datos cargados'; };
  load();
  return { state: D, near, pick, reset, sum, load };
})();

/* Ajustes: importar tus propias bases */
CATS.mapa[1].push(
  { t: 'btn', get l() { return 'Señales: ' + Data.sum('sig') + ' — importar JSON'; }, f: () => Data.pick('sig') },
  { t: 'btn', get l() { return 'Radares: ' + Data.sum('rad') + ' — importar JSON'; }, f: () => Data.pick('rad') },
  { t: 'btn', l: 'Restaurar las bases incluidas en la app', f: async () => { await Data.reset('sig'); await Data.reset('rad'); } });

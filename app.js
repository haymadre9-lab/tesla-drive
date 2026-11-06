'use strict';
/* LecoAuto PWA — launcher para pantallas de coche (inspirado en la app Android LecoAuto).
   Sin dependencias ni claves de API. Estado en localStorage; fondos en IndexedDB. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pad = n => String(n).padStart(2, '0');
const bus = (() => { const m = {}; return { on: (e, f) => (m[e] ||= []).push(f), emit: (e, d) => (m[e] || []).forEach(f => f(d)) }; })();

/* ───────────── Estado ───────────── */
const DEF_APPS = [
  { id: 'maps', n: 'Google Maps', u: 'https://www.google.com/maps', e: '📍', k: 'gmaps' },
  { id: 'waze', n: 'Waze', u: 'https://www.waze.com/live-map', e: '🚙', k: 'waze' },
  { id: 'yt', n: 'YouTube', u: 'https://m.youtube.com', e: '▶️', k: 'yt' },
  { id: 'spot', n: 'Spotify', u: 'https://open.spotify.com', e: '🎧', k: 'spot' },
  { id: 'nflx', n: 'Netflix', u: 'https://www.netflix.com', e: '🎬', k: 'blocked' },
  { id: 'twitch', n: 'Twitch', u: 'https://m.twitch.tv', e: '🟣', k: 'twitch' },
  { id: 'wa', n: 'WhatsApp', u: 'https://web.whatsapp.com', e: '💬', k: 'blocked' },
  { id: 'radio', n: 'Radio Garden', u: 'https://radio.garden', e: '📻' },
  { id: 'windy', n: 'Windy', u: 'https://www.windy.com', e: '🌬️', k: 'windy' },
  { id: 'hud', n: 'Tesla HUD (antiguo)', u: 'old-hud/index.html', e: '🚘' },
  { id: 'gmail', n: 'Gmail', u: 'https://mail.google.com', e: '✉️', k: 'blocked' },
  { id: 'wiki', n: 'Wikipedia', u: 'https://es.m.wikipedia.org', e: '📚' },
];
const DEF = {
  theme: 'auto-time', accent: '#3e9bff', radius: 22, colw: 300, rows: 2, rhd: false,
  wallMode: 'default', wallSel: 0, wallInterval: 30, wallEffect: 'fade',
  widgets: [['clock', 1], ['weather', 1], ['music', 1], ['map', 1], ['speed', 1], ['tpms', 1], ['apps', 1]],
  apps: DEF_APPS, quick: ['maps', 'yt', 'spot', 'waze', 'hud'], openMode: 'float', sort: 'default',
  hideLyrics: false, visualizer: true, lyricSize: 28, lyricCur: '#ffffff', lyricNorm: '#9aa3b2',
  speedUnit: 'kmh', pressUnit: 'bar', tempUnit: 'c', tpWarn: 2.0, tpDanger: 1.6, spare: false,
  tires: { fl: 2.4, fr: 2.4, rl: 2.5, rr: 2.5 },
  fab: { on: true, click: 'home', long: 'daynight', x: null, y: null }, keys: [],
  city: null, lastPos: null, last: {}, recent: [], teslaMode: IS_TESLA, voice: true, tripT: 0, dash: 'classic', dashboards: null, radarAlerts: true, layers: { cams: true, chargers: false, fuel: false, reports: true }, reports: [], navRecent: [], favs: { home: null, work: null }, maxSpeed: 0, trip: 0,
};
let S;
try { S = Object.assign(structuredClone(DEF), JSON.parse(localStorage.getItem('leco.v1') || '{}')); } catch { S = structuredClone(DEF); }
const save = () => { try { localStorage.setItem('leco.v1', JSON.stringify(S)); } catch { toast('No se pudo guardar (almacenamiento lleno)'); } };

function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
}

/* ───────────── IndexedDB (fondos) ───────────── */
const idb = (() => {
  let db;
  const open = () => db ||= new Promise((ok, ko) => {
    const r = indexedDB.open('lecoauto', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('walls', { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  });
  const tx = async (m, f) => { const d = await open(); return new Promise((ok, ko) => { const t = d.transaction('walls', m); const q = f(t.objectStore('walls')); t.oncomplete = () => ok(q.result); t.onerror = () => ko(t.error); }); };
  return { all: () => tx('readonly', s => s.getAll()), add: b => tx('readwrite', s => s.add({ blob: b })), del: id => tx('readwrite', s => s.delete(id)) };
})();

/* ───────────── Tema día/noche ───────────── */
let ambientDark = null;
function isDark() {
  switch (S.theme) {
    case 'dark': return true;
    case 'light': return false;
    case 'system': return matchMedia('(prefers-color-scheme: dark)').matches;
    case 'light-sensor': if (ambientDark !== null) return ambientDark; // si no hay sensor, cae a hora
    default: { const h = new Date().getHours(); return h < 6 || h >= 19; }
  }
}
function applyTheme() {
  const dark = isDark(), r = document.documentElement;
  r.dataset.theme = dark ? 'dark' : 'light';
  r.style.setProperty('--acc', Dash.accent()); document.body.dataset.skin = Dash.cur().skin; r.style.setProperty('--radius', S.radius + 'px');
  r.style.setProperty('--colw', S.colw + 'px'); r.style.setProperty('--rows', S.rows);
  r.style.setProperty('--lyr-cur', S.lyricCur); r.style.setProperty('--lyr-norm', S.lyricNorm); r.style.setProperty('--lyr-size', S.lyricSize + 'px');
  document.body.classList.toggle('rhd', S.rhd); document.body.classList.toggle('tesla', !!S.teslaMode); document.body.classList.toggle('nolyr', S.hideLyrics);
  $('meta[name=theme-color]').content = dark ? '#0b0f17' : '#e9eef6';
  Wall.refreshDefault();
}
if (S.theme === 'light-sensor' && 'AmbientLightSensor' in window) {
  try { const s = new AmbientLightSensor({ frequency: 0.5 }); s.onreading = () => { const d = s.illuminance < 25; if (d !== ambientDark) { ambientDark = d; applyTheme(); } }; s.start(); } catch { }
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => S.theme === 'system' && applyTheme());

/* ───────────── Fondo / carrusel ───────────── */
const Wall = {
  list: [], layers: $$('#wall .wl'), cur: 0, idx: 0, timer: 0, urls: [],
  async load() { try { this.list = await idb.all(); } catch { this.list = []; } this.urls.forEach(URL.revokeObjectURL); this.urls = this.list.map(w => URL.createObjectURL(w.blob)); },
  show(url) {
    const next = this.layers[1 - this.cur], old = this.layers[this.cur];
    next.className = 'wl fx-' + S.wallEffect + (url ? '' : ' def-' + (isDark() ? 'dark' : 'light'));
    next.style.backgroundImage = url ? `url("${url}")` : '';
    document.documentElement.style.setProperty('--wt', S.wallEffect === 'none' ? '0s' : '1.2s');
    void next.offsetWidth; next.classList.add('show'); old.classList.remove('show'); this.cur = 1 - this.cur;
  },
  refreshDefault() { if (!this.urls.length || S.wallMode === 'default') this.apply(true); },
  apply(quiet) {
    clearInterval(this.timer);
    if (S.wallMode === 'default' || !this.urls.length) return this.show(null);
    if (S.wallMode === 'custom') return this.show(this.urls[clamp(S.wallSel, 0, this.urls.length - 1)]);
    this.idx = quiet ? this.idx : 0; this.show(this.urls[this.idx % this.urls.length]);
    this.timer = setInterval(() => { this.idx = (this.idx + 1) % this.urls.length; this.show(this.urls[this.idx]); }, Math.max(5, S.wallInterval) * 1000);
  },
};

/* ───────────── Navegación ───────────── */
let page = 'home';
const renderers = {};
function go(p) {
  if (!renderers[p]) return;
  page = p;
  $$('.page').forEach(e => e.classList.toggle('act', e.id === 'p-' + p));
  $$('#dock button').forEach(b => b.classList.toggle('act', b.dataset.go === p));
  renderers[p]();
}
$$('#dock button').forEach(b => b.onclick = () => go(b.dataset.go));

/* ───────────── Reloj ───────────── */
const DAYS = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' });
function greeting(h) { return h < 6 ? 'Madrugada' : h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; }
function tickClock() {
  const d = new Date(), t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  $('#stTime').textContent = t; $('#stDate').textContent = DAYS.format(d);
  $$('.js-clock').forEach(e => e.textContent = t);
  $$('.js-greet').forEach(e => e.textContent = greeting(d.getHours()));
  $$('.js-date').forEach(e => e.textContent = DAYS.format(d));
  if (S.theme === 'auto-time' || S.theme === 'light-sensor') { const dk = isDark(); if (document.documentElement.dataset.theme !== (dk ? 'dark' : 'light')) applyTheme(); }
}

/* ───────────── GPS / velocidad ───────────── */
const GPS = { pos: null, speed: 0, status: 'off', last: null };
const spdConv = ms => S.speedUnit === 'mph' ? ms * 2.23694 : ms * 3.6;
const spdUnit = () => S.speedUnit === 'mph' ? 'mph' : 'km/h';
function startGPS() {
  if (!navigator.geolocation) return setGpsDot('off');
  setGpsDot('wait');
  navigator.geolocation.watchPosition(p => {
    if (Nav.state.sim) return;
    const c = p.coords; GPS.pos = c; GPS.speed = c.speed != null && !isNaN(c.speed) ? Math.max(0, c.speed) : 0;
    const nowT = Date.now(); if (GPS.t && GPS.speed > 1) S.tripT = (S.tripT || 0) + Math.min(10, (nowT - GPS.t) / 1000); GPS.t = nowT;
    if (GPS.last && c.accuracy < 60) { const d = hav(GPS.last, c); if (d > 4 && d < 500) { S.trip += d; } }
    if (!GPS.last || c.accuracy < 60) GPS.last = { latitude: c.latitude, longitude: c.longitude };
    S.maxSpeed = Math.max(S.maxSpeed, GPS.speed); S.lastPos = [c.latitude, c.longitude];
    setGpsDot('on'); bus.emit('pos', c); renderSpeedUI(); saveSoon();
  }, () => setGpsDot('off'), { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}
let sv; const saveSoon = () => { clearTimeout(sv); sv = setTimeout(save, 3000); };
function setGpsDot(s) { GPS.status = s; const d = $('#stGps'); d.className = 'dot ' + (s === 'on' ? 'on' : s === 'wait' ? 'wait' : ''); }
function hav(a, b) { const R = 6371000, r = x => x * Math.PI / 180, dLa = r(b.latitude - a.latitude), dLo = r(b.longitude - a.longitude); const x = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
function renderSpeedUI() {
  const v = Math.round(spdConv(GPS.speed));
  $('#stSpeed').textContent = `${v} ${spdUnit()}`;
  $$('.js-spd').forEach(e => e.textContent = v);
  $$('.js-spdbar').forEach(e => e.style.width = clamp(v / (S.speedUnit === 'mph' ? 100 : 160) * 100, 0, 100) + '%');
  $$('.js-max').forEach(e => e.textContent = Math.round(spdConv(S.maxSpeed)));
  $$('.js-trip').forEach(e => e.textContent = (S.speedUnit === 'mph' ? S.trip / 1609.34 : S.trip / 1000).toFixed(1));
}

/* ───────────── Clima (Open-Meteo, sin clave) ───────────── */
const WX = { data: null, at: 0 };
const wxDesc = c => c === 0 ? ['☀️', 'Despejado'] : c <= 2 ? ['🌤️', 'Poco nublado'] : c === 3 ? ['☁️', 'Nublado'] : c <= 48 ? ['🌫️', 'Niebla'] : c <= 57 ? ['🌦️', 'Llovizna'] : c <= 67 ? ['🌧️', 'Lluvia'] : c <= 77 ? ['🌨️', 'Nieve'] : c <= 82 ? ['🌧️', 'Chubascos'] : c <= 86 ? ['🌨️', 'Nevada'] : ['⛈️', 'Tormenta'];
const tmp = c => S.tempUnit === 'f' ? Math.round(c * 9 / 5 + 32) + '°F' : Math.round(c) + '°C';
async function loadWeather(force) {
  const p = GPS.pos ? [GPS.pos.latitude, GPS.pos.longitude] : S.city ? [S.city.lat, S.city.lon] : S.lastPos;
  if (!p) return;
  if (!force && WX.data && Date.now() - WX.at < 15 * 60e3) return;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p[0].toFixed(3)}&longitude=${p[1].toFixed(3)}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`);
    WX.data = await r.json(); WX.at = Date.now(); renderWeather();
  } catch { /* sin red */ }
}
function renderWeather() {
  const d = WX.data; const [em, tx] = d ? wxDesc(d.current.weather_code) : ['🌡️', 'Sin datos'];
  $('#stWeather').textContent = d ? `${em} ${tmp(d.current.temperature_2m)} · ${tx}` : '';
  $$('.js-wx').forEach(el => {
    el.innerHTML = d ? `<div class="row"><span class="em">${em}</span><div><span class="t">${tmp(d.current.temperature_2m)}</span><small>${tx}</small></div></div>
      <small>↑ ${tmp(d.daily.temperature_2m_max[0])} · ↓ ${tmp(d.daily.temperature_2m_min[0])} · 💨 ${Math.round(d.current.wind_speed_10m)} km/h · 💧 ${d.current.relative_humidity_2m}%</small>
      <small class="city" data-act="city">📍 ${esc(S.city?.name || (GPS.pos ? 'Tu ubicación' : 'Elegir ciudad'))}</small>`
      : `<div class="row"><span class="em">🌡️</span><div><small>Sin datos del clima.<br>Activa el GPS o elige una ciudad.</small></div></div><small class="city" data-act="city">📍 Elegir ciudad</small>`;
  });
}
async function pickCity() {
  const v = await promptDlg('Buscar ciudad', 'Ej. Madrid');
  if (!v) return;
  try {
    const r = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(v)}&count=1&language=es`)).json();
    const c = r.results?.[0]; if (!c) return toast('Ciudad no encontrada');
    S.city = { name: c.name, lat: c.latitude, lon: c.longitude }; save(); loadWeather(true); toast('Ciudad: ' + c.name);
  } catch { toast('Sin conexión'); }
}

/* ───────────── Diálogos ───────────── */
function dlg(html, onMount) {
  const m = $('#modal'); m.innerHTML = `<div class="dlg">${html}</div>`; m.hidden = false;
  m.onclick = e => { if (e.target === m) closeDlg(); }; onMount?.($('.dlg', m));
}
const closeDlg = () => { $('#modal').hidden = true; $('#modal').innerHTML = ''; };
function promptDlg(title, ph = '', val = '') {
  return new Promise(ok => dlg(`<h3>${esc(title)}</h3><div class="f"><input class="in" id="dv" placeholder="${esc(ph)}" value="${esc(val)}"></div>
    <div class="acts"><button class="btn sec" id="dc">Cancelar</button><button class="btn" id="dk">Aceptar</button></div>`, d => {
    const i = $('#dv', d); i.focus(); const fin = v => { closeDlg(); ok(v); };
    $('#dc', d).onclick = () => fin(null); $('#dk', d).onclick = () => fin(i.value.trim()); i.onkeydown = e => e.key === 'Enter' && fin(i.value.trim());
  }));
}

/* ───────────── Música ───────────── */
const audio = $('#audio');
const Mus = { list: [], i: -1, lrc: [], lrcIdx: -1, ac: null, an: null };
const fmt = s => isFinite(s) ? `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}` : '0:00';
function parseLRC(txt) {
  const out = [];
  for (const line of txt.split(/\r?\n/)) {
    const ts = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]; const text = line.replace(/\[[^\]]*\]/g, '').trim();
    ts.forEach(m => out.push({ t: +m[1] * 60 + parseFloat(m[2]), s: text }));
  }
  return out.sort((a, b) => a.t - b.t);
}
const base = n => n.replace(/\.[^.]+$/, '');
function addTracks(files) {
  const aud = [...files].filter(f => f.type.startsWith('audio') || /\.(mp3|m4a|aac|ogg|wav|flac|opus)$/i.test(f.name));
  const lrcs = [...files].filter(f => /\.lrc$/i.test(f.name));
  aud.forEach(f => {
    const [ar, ti] = base(f.name).includes(' - ') ? base(f.name).split(/ - (.+)/) : ['', base(f.name)];
    Mus.list.push({ file: f, url: URL.createObjectURL(f), title: ti, artist: ar, lrcFile: lrcs.find(l => base(l.name) === base(f.name)) });
  });
  if (aud.length) { toast(`${aud.length} canción(es) añadida(s)`); if (Mus.i < 0) playIdx(0); else bus.emit('music'); }
}
async function playIdx(i) {
  if (!Mus.list.length) return;
  Mus.i = (i + Mus.list.length) % Mus.list.length; const t = Mus.list[Mus.i];
  audio.src = t.url; Mus.lrc = []; Mus.lrcIdx = -1;
  if (t.lrcFile) Mus.lrc = parseLRC(await t.lrcFile.text());
  try { await audio.play(); } catch { }
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist });
  bus.emit('music');
}
const togglePlay = () => { if (Mus.i < 0) return pickAudio(); audio.paused ? audio.play() : audio.pause(); };
const pickAudio = () => $('#fileAudio').click();
$('#fileAudio').onchange = e => { addTracks(e.target.files); e.target.value = ''; };
$('#fileLrc').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f || Mus.i < 0) return; Mus.lrc = parseLRC(await f.text()); Mus.list[Mus.i].lrcFile = f; toast(Mus.lrc.length ? 'Letra cargada' : 'Formato LRC no válido'); bus.emit('music'); };
audio.onended = () => playIdx(Mus.i + 1);
['play', 'pause'].forEach(ev => audio.addEventListener(ev, () => { $$('.cd').forEach(c => c.classList.toggle('play', !audio.paused)); $$('.js-pp').forEach(b => b.textContent = audio.paused ? '▶' : '⏸'); if (!audio.paused) startViz(); }));
audio.ontimeupdate = () => {
  $$('.js-seek').forEach(r => { if (!r.dragging) { r.max = audio.duration || 0; r.value = audio.currentTime; } });
  $$('.js-cur').forEach(e => e.textContent = fmt(audio.currentTime)); $$('.js-dur').forEach(e => e.textContent = fmt(audio.duration));
  let k = -1; for (let j = 0; j < Mus.lrc.length && Mus.lrc[j].t <= audio.currentTime + .2; j++) k = j;
  if (k !== Mus.lrcIdx) { Mus.lrcIdx = k; const line = Mus.lrc[k]?.s || ''; $$('.lyr1').forEach(e => e.textContent = line); updateLyricsFull(); }
};
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  [['play', () => audio.play()], ['pause', () => audio.pause()], ['previoustrack', () => playIdx(Mus.i - 1)], ['nexttrack', () => playIdx(Mus.i + 1)]].forEach(([a, f]) => { try { ms.setActionHandler(a, f); } catch { } });
}
function startViz() {
  if (!S.visualizer || Mus.an) return;
  try { Mus.ac = new (window.AudioContext || window.webkitAudioContext)(); const src = Mus.ac.createMediaElementSource(audio); Mus.an = Mus.ac.createAnalyser(); Mus.an.fftSize = 64; src.connect(Mus.an); Mus.an.connect(Mus.ac.destination); } catch { return; }
  const buf = new Uint8Array(Mus.an.frequencyBinCount);
  (function draw() {
    requestAnimationFrame(draw);
    if (audio.paused || !S.visualizer) return;
    Mus.an.getByteFrequencyData(buf);
    $$('canvas.viz').forEach(c => {
      const w = c.width = c.clientWidth, h = c.height = c.clientHeight, g = c.getContext('2d'), n = 24, bw = w / n;
      g.clearRect(0, 0, w, h); g.fillStyle = S.accent;
      for (let i = 0; i < n; i++) { const v = buf[i] / 255 * h; g.globalAlpha = .4 + buf[i] / 400; g.fillRect(i * bw + 2, h - v, bw - 4, v); }
    });
  })();
}
function trackInfo() { const t = Mus.list[Mus.i]; return t ? [t.title, t.artist || 'Artista desconocido'] : ['Sin música', 'Toca para añadir canciones']; }
const musicControls = () => `<div class="ctl"><button data-a="prev">⏮</button><button class="main js-pp" data-a="pp">${audio.paused ? '▶' : '⏸'}</button><button data-a="next">⏭</button></div>`;
function bindMusic(root) {
  $$('[data-a]', root).forEach(b => b.onclick = e => {
    e.stopPropagation(); const a = b.dataset.a;
    if (a === 'prev') playIdx(Mus.i - 1); else if (a === 'next') playIdx(Mus.i + 1); else if (a === 'pp') togglePlay();
    else if (a === 'add') pickAudio(); else if (a === 'lrc') Mus.i < 0 ? toast('Primero añade una canción') : $('#fileLrc').click();
  });
  $$('.js-seek', root).forEach(r => { r.oninput = () => { r.dragging = true; }; r.onchange = () => { audio.currentTime = +r.value; r.dragging = false; }; });
}
function widgetMusic(el) {
  const [t, a] = trackInfo();
  el.innerHTML = `<div class="mus"><div class="top"><div class="cd ${audio.paused ? '' : 'play'}"></div><div class="meta"><div class="ti">${esc(t)}</div><div class="ar">${esc(a)}</div></div>
    <button class="ic" data-a="add" title="Añadir música">＋</button></div>
    <div class="lyr1">${esc(Mus.lrc[Mus.lrcIdx]?.s || '')}</div>${S.visualizer ? '<canvas class="viz"></canvas>' : ''}
    <div class="seek"><span class="js-cur">0:00</span><input type="range" class="js-seek" min="0" max="${audio.duration || 0}" value="${audio.currentTime || 0}" step="0.1"><span class="js-dur">0:00</span></div>${musicControls()}</div>`;
  bindMusic(el); el.onclick = e => { if (!e.target.closest('button,input')) go('music'); };
}
function updateLyricsFull() {
  const box = $('.lyrics'); if (!box || page !== 'music') return;
  $$('p', box).forEach((p, i) => p.classList.toggle('cur', i === Mus.lrcIdx));
  const c = $('p.cur', box); if (c) box.scrollTop = c.offsetTop - box.clientHeight / 2 + c.clientHeight / 2;
}
renderers.music = () => {
  const root = $('#p-music'), [t, a] = trackInfo();
  root.innerHTML = `<div class="musfull"><div class="card left"><div class="cd ${audio.paused ? '' : 'play'}"></div><div style="text-align:center"><div class="ti" style="font-size:22px;font-weight:600">${esc(t)}</div><div class="ar" style="color:var(--dim)">${esc(a)}</div></div>
    ${S.visualizer ? '<canvas class="viz" style="width:80%;height:34px"></canvas>' : ''}
    <div class="seek" style="width:90%"><span class="js-cur">0:00</span><input type="range" class="js-seek" min="0" max="${audio.duration || 0}" value="${audio.currentTime || 0}" step="0.1"><span class="js-dur">0:00</span></div>${musicControls()}
    <div class="toolbar" style="margin:0"><button class="btn sec" data-a="add">＋ Música</button><button class="btn sec" data-a="lrc">📝 Letra .lrc</button></div>
    <div class="plist">${Mus.list.map((x, i) => `<div data-i="${i}" class="${i === Mus.i ? 'cur' : ''}">${i + 1}. ${esc(x.title)}</div>`).join('') || '<div class="note">Sin canciones. Añade archivos de audio (mp3, m4a, ogg, flac…). Si el archivo .lrc tiene el mismo nombre y lo seleccionas junto al audio, se carga solo.</div>'}</div></div>
    <div class="card" style="padding:0"><div class="lyrics">${Mus.lrc.map(l => `<p>${esc(l.s) || '♪'}</p>`).join('') || '<p class="note">Sin letra. Carga un archivo .lrc con sincronía.</p>'}</div></div></div>`;
  bindMusic(root); $$('.plist [data-i]', root).forEach(d => d.onclick = () => playIdx(+d.dataset.i)); updateLyricsFull();
};
bus.on('music', () => { if (page === 'music') renderers.music(); $$('.js-musw').forEach(widgetMusic); });

/* ───────────── Neumáticos (TPMS) ───────────── */
const pU = () => S.pressUnit;
const toU = bar => pU() === 'psi' ? bar * 14.5038 : pU() === 'kpa' ? bar * 100 : bar;
const fromU = v => pU() === 'psi' ? v / 14.5038 : pU() === 'kpa' ? v / 100 : v;
const fmtP = bar => toU(bar).toFixed(pU() === 'bar' ? 1 : 0) + ' ' + pU();
const tireState = bar => bar < S.tpDanger ? 'bad' : bar < S.tpWarn ? 'warn' : '';
let alerted = '';
function widgetTpms(el) {
  const T = S.tires, names = { fl: 'Del. izq.', fr: 'Del. der.', rl: 'Tras. izq.', rr: 'Tras. der.' };
  el.innerHTML = `<h4>Neumáticos</h4><div class="tp"><div class="car"></div>${Object.keys(names).map(k => `<div class="tire ${k} ${tireState(T[k])}" data-t="${k}"><small>${names[k]}</small><b>${fmtP(T[k])}</b></div>`).join('')}</div>`;
  $$('.tire', el).forEach(t => t.onclick = () => editTire(t.dataset.t));
  const bad = Object.keys(T).filter(k => tireState(T[k])); const key = bad.map(k => k + tireState(T[k])).join();
  if (key && key !== alerted) { showAlert('⚠ Presión anormal en ' + bad.map(k => names[k]).join(', ')); }
  alerted = key;
}
function showAlert(txt) { const a = document.createElement('div'); a.className = 'alert'; a.textContent = txt; document.body.append(a); setTimeout(() => a.remove(), 5000); }
async function editTire(k) {
  const v = await promptDlg('Presión (' + pU() + ')', 'Valor', toU(S.tires[k]).toFixed(pU() === 'bar' ? 1 : 0));
  const n = parseFloat(String(v).replace(',', '.')); if (!v || isNaN(n) || n <= 0) return;
  S.tires[k] = fromU(n); save(); bus.emit('tpms');
}
bus.on('tpms', () => $$('.js-tpw').forEach(widgetTpms));

/* ───────────── Mapa ───────────── */
let mapKey = '';
function mapSrc(big) {
  const p = GPS.pos ? [GPS.pos.latitude, GPS.pos.longitude] : S.lastPos || (S.city && [S.city.lat, S.city.lon]) || [40.4168, -3.7038], z = big ? 0.012 : 0.008;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${p[1] - z * 1.6},${p[0] - z},${p[1] + z * 1.6},${p[0] + z}&layer=mapnik&marker=${p[0]},${p[1]}`;
}
function widgetMap(el) {
  el.innerHTML = `<span class="tag">🗺️ Mapa · toca para ampliar</span><iframe loading="lazy" title="Mapa" src="${mapSrc()}"></iframe>`;
  el.querySelector('.tag').onclick = () => go('map');
}
renderers.map = () => Nav.render($('#p-map'));
bus.on('pos', c => Nav.onPos(c));
bus.on('pos', c => Poi.onPos(c));
bus.on('pos', () => {
  const p = GPS.pos; if (!p) return; const key = p.latitude.toFixed(3) + p.longitude.toFixed(3); if (key === mapKey) return; mapKey = key;
  $$('.js-mapw iframe').forEach(f => f.src = mapSrc());
  loadWeather();
});

/* ───────────── Apps / ventanas flotantes ───────────── */
const appById = id => S.apps.find(a => a.id === id);
function sortedApps(list) {
  const l = [...list];
  if (S.sort === 'az') l.sort((a, b) => a.n.localeCompare(b.n)); else if (S.sort === 'za') l.sort((a, b) => b.n.localeCompare(a.n));
  return l;
}
async function openApp(a, mode = S.openMode) {
  if (a.k === 'gmaps' || a.k === 'waze') return S.teslaMode ? Nav.prefill() : navDlg(a);
  if (mode === 'tab') return window.open(a.u, '_blank', 'noopener');
  const r = await embedFor(a); if (!r) return;
  openFloat({ ...a, u: r.u || a.u, orig: r.orig || a.u, blocked: r.blocked, smart: r.smart }, mode === 'full');
}
/* Cada servicio tiene su versión incrustable oficial (los sitios normales prohíben el iframe). */
const myPos = () => GPS.pos ? [GPS.pos.latitude, GPS.pos.longitude] : S.lastPos || (S.city && [S.city.lat, S.city.lon]) || [40.4168, -3.7038];
function ytEmbed(t) {
  const id = (t.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/) || [])[1], list = (t.match(/[?&]list=([\w-]+)/) || [])[1];
  if (id) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0${list ? '&list=' + list : ''}`;
  if (list) return `https://www.youtube-nocookie.com/embed/videoseries?list=${list}&autoplay=1`;
}
async function embedFor(a) {
  const L = S.last, ask = async (k, title, ph) => { const v = await promptDlg(title, ph, L[k] || ''); if (v) { L[k] = v; save(); } return v; };
  const bad = m => (toast(m, 3000), null);
  switch (a.k) {
    case 'blocked': return { blocked: true };
    case 'gmaps': { const q = await ask('gmaps', 'Google Maps: lugar o dirección (vacío = tu posición)', 'Ej. Gasolinera cerca'); if (q === null) return null; const p = myPos(); return { u: `https://maps.google.com/maps?q=${encodeURIComponent(q || p.join(','))}&z=15&output=embed`, orig: 'https://www.google.com/maps/search/' + encodeURIComponent(q || p.join(',')), smart: 1 }; }
    case 'waze': { const p = myPos(); return { u: `https://embed.waze.com/iframe?zoom=14&lat=${p[0]}&lon=${p[1]}&pin=1`, smart: 1 }; }
    case 'windy': { const p = myPos(); return { u: `https://embed.windy.com/embed2.html?lat=${p[0].toFixed(2)}&lon=${p[1].toFixed(2)}&zoom=7&level=surface&overlay=wind&product=ecmwf&marker=true&message=true`, smart: 1 }; }
    case 'yt': { const v = await ask('yt', 'YouTube: pega el enlace de un vídeo o lista', 'https://youtu.be/…'); if (v === null) return null; const u = ytEmbed(v); return u ? { u, orig: v, smart: 1 } : bad('Enlace de YouTube no válido'); }
    case 'spot': { const v = await ask('spot', 'Spotify: pega el enlace de canción, álbum o lista', 'https://open.spotify.com/…'); if (v === null) return null; const m = v.match(/open\.spotify\.com\/(?:intl-\w+\/)?(track|album|playlist|episode|show|artist)\/(\w+)/); return m ? { u: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, orig: v, smart: 1 } : bad('Enlace de Spotify no válido'); }
    case 'twitch': { const c = await ask('twitch', 'Twitch: nombre del canal', 'Ej. ibai'); if (c === null) return null; return /^\w{3,25}$/.test(c) ? { u: `https://player.twitch.tv/?channel=${c}&parent=${location.hostname || 'localhost'}`, orig: 'https://www.twitch.tv/' + c, smart: 1 } : bad('Canal no válido'); }
  }
  return {};
}

/* ───────────── Navegación: abre la app de GPS con la ruta ───────────── */
function navUrl(via, q) {
  const enc = encodeURIComponent(q), coords = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(q);
  if (via === 'waze') return !q ? 'https://waze.com/ul' : coords ? `https://waze.com/ul?ll=${encodeURIComponent(q.replace(/\s/g, ''))}&navigate=yes` : `https://waze.com/ul?q=${enc}&navigate=yes`;
  if (via === 'geo') return `geo:0,0?q=${enc}`;
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${enc}&travelmode=driving&dir_action=navigate` : 'https://www.google.com/maps';
}
function navigateTo(via, q) {
  q = (q || '').trim();
  if (q) { S.recent = [q, ...S.recent.filter(x => x !== q)].slice(0, 6); save(); }
  const u = navUrl(via, q);
  if (via === 'geo') location.href = u; else window.open(u, '_blank', 'noopener');
  toast(q ? 'Abriendo ruta a ' + q : 'Abriendo navegación…');
}
function navDlg(a) {
  const via = a.k === 'waze' ? 'waze' : 'gmaps';
  dlg(`<h3>${esc(a.e)} Navegar con ${esc(a.n)}</h3><div class="f"><input class="in" id="nd" placeholder="Destino: dirección, lugar o lat,lon" autocomplete="off">
    <div>${S.recent.map(r => `<span class="chip" data-r="${esc(r)}" style="cursor:pointer">🕘 ${esc(r)}</span>`).join('')}</div>
    <button class="btn" id="n1">🧭 Iniciar navegación en ${esc(a.n)}</button>
    <button class="btn sec" id="n3">📲 Elegir otra app de GPS</button>
    <button class="btn sec" id="n2">▢ Solo ver el mapa en ventana</button></div>
    <div class="note">Se abre la app instalada en el dispositivo con la ruta lista. Dejando el destino vacío se abre la app sin ruta.</div>
    <div class="acts"><button class="btn sec" id="c">Cerrar</button></div>`, d => {
    const i = $('#nd', d); i.focus();
    $$('[data-r]', d).forEach(c => c.onclick = () => { i.value = c.dataset.r; });
    const go1 = v => { closeDlg(); navigateTo(v, i.value); };
    $('#n1', d).onclick = () => go1(via); $('#n3', d).onclick = () => go1('geo'); i.onkeydown = e => e.key === 'Enter' && go1(via);
    $('#c', d).onclick = closeDlg;
    $('#n2', d).onclick = () => {
      const q = i.value.trim(), p = myPos(); closeDlg();
      openFloat({ ...a, smart: 1, orig: navUrl(via, q), u: via === 'waze' ? `https://embed.waze.com/iframe?zoom=14&lat=${p[0]}&lon=${p[1]}&pin=1` : `https://maps.google.com/maps?q=${encodeURIComponent(q || p.join(','))}&z=15&output=embed` });
    };
  });
}
const floats = [];
const vvp = () => window.visualViewport || { offsetTop: 0, offsetLeft: 0, width: innerWidth, height: innerHeight };
/* Mantiene la ventana siempre dentro de la parte visible (teclado, barras del sistema, giro de pantalla). */
function fitFloat(w, center) {
  if (w.classList.contains('full')) return;
  const v = vvp(), top0 = 8;
  const ww = Math.min(w.offsetWidth, v.width - 16), hh = Math.min(w.offsetHeight, v.height - top0 - 8);
  w.style.width = ww + 'px'; w.style.height = hh + 'px';
  const idx = floats.indexOf(w);
  const L = center ? v.offsetLeft + (v.width - ww) / 2 + idx * 36 : w.offsetLeft, T = center ? v.offsetTop + Math.max(56, (v.height - hh) / 2) + idx * 36 : w.offsetTop;
  w.style.left = clamp(L, v.offsetLeft + 8, v.offsetLeft + v.width - ww - 8) + 'px';
  w.style.top = clamp(T, v.offsetTop + top0, v.offsetTop + v.height - hh - 8) + 'px';
}
const fitAll = () => floats.forEach(w => fitFloat(w));
addEventListener('resize', fitAll); window.visualViewport?.addEventListener('resize', fitAll);
function openFloat(a, full = false) {
  if (floats.length >= 2) floats.shift().remove(); // doble PiP: máximo 2
  document.activeElement?.blur?.(); scrollTo(0, 0);
  const w = document.createElement('div'); w.className = 'fw' + (full ? ' full' : '');
  w.innerHTML = `<div class="hd" title="Arrastra para mover · doble toque para centrar"><b>${esc(a.e || '🌐')} ${esc(a.n)}</b><button data-b="ctr" title="Centrar">⌖</button><button data-b="tab" title="Abrir fuera">↗</button><button data-b="full" title="Pantalla completa">⛶</button><button data-b="x" title="Cerrar">✕</button></div>
    ${a.blocked ? `<div class="blk"><div style="font-size:44px">🔒</div><p><b>${esc(a.n)}</b> no permite abrirse dentro de otra ventana.<br>Es una restricción del propio servicio.</p><button class="btn" data-b="tab">Abrir ${esc(a.n)}</button></div>`
    : `${a.smart ? '' : '<div class="hint">Si ves la ventana en blanco, este sitio bloquea el modo incrustado: usa ↗.</div>'}
    <iframe src="${esc(a.u)}" allow="geolocation; autoplay; fullscreen; encrypted-media; picture-in-picture" referrerpolicy="no-referrer-when-downgrade"></iframe>`}
    <div class="ft" title="Arrastra para mover">⋯ mover ⋯</div>`;
  $('#floats').append(w); floats.push(w); fitFloat(w, true);
  $('[data-b=x]', w).onclick = () => { w.remove(); floats.splice(floats.indexOf(w), 1); };
  $('[data-b=full]', w).onclick = () => { w.classList.toggle('full'); if (!w.classList.contains('full')) { w.style.width = w.style.height = ''; fitFloat(w, true); } };
  $('[data-b=ctr]', w).onclick = () => { w.classList.remove('full'); w.style.width = w.style.height = ''; fitFloat(w, true); };
  $$('[data-b=tab]', w).forEach(b => b.onclick = () => window.open(a.orig || a.u, '_blank', 'noopener'));
  let dx, dy, drag = false;
  const bring = () => { $$('.fw').forEach(x => x.style.zIndex = 50); w.style.zIndex = 51; };
  w.addEventListener('pointerdown', bring);
  [$('.hd', w), $('.ft', w)].forEach(h => {
    h.onpointerdown = e => { if (e.target.closest('button') || w.classList.contains('full')) return; drag = true; dx = e.clientX - w.offsetLeft; dy = e.clientY - w.offsetTop; h.setPointerCapture(e.pointerId); };
    h.onpointermove = e => { if (!drag) return; const v = vvp(); w.style.left = clamp(e.clientX - dx, v.offsetLeft - w.offsetWidth + 90, v.offsetLeft + v.width - 90) + 'px'; w.style.top = clamp(e.clientY - dy, v.offsetTop, v.offsetTop + v.height - 70) + 'px'; };
    h.onpointerup = h.onpointercancel = () => { drag = false; };
  });
  $('.hd', w).ondblclick = e => { if (!e.target.closest('button')) fitFloat(w, true); };
}
function appHtml(a, x) { return `<div class="app" data-id="${esc(a.id)}"><div class="ico">${esc(a.e || '🌐')}</div><span>${esc(a.n)}</span>${x ? '<button class="x" data-del>✕</button>' : ''}</div>`; }
function widgetApps(el) {
  const q = S.quick.map(appById).filter(Boolean);
  el.innerHTML = `<h4>Accesos rápidos</h4><div class="appsrow ${el.dataset.edit ? 'editing' : ''}">${q.map(a => appHtml(a)).join('')}<div class="app" data-more><div class="ico">⋯</div><span>Todas</span></div></div>`;
  $$('.app[data-id]', el).forEach(d => d.onclick = () => openApp(appById(d.dataset.id)));
  $('[data-more]', el).onclick = () => go('apps');
}
function addAppDlg(edit) {
  dlg(`<h3>${edit ? 'Editar' : 'Añadir'} aplicación</h3><div class="f"><input class="in" id="an" placeholder="Nombre" value="${esc(edit?.n || '')}"><input class="in" id="au" placeholder="https://…" value="${esc(edit?.u || '')}"><input class="in" id="ae" placeholder="Emoji / icono (ej. 🎮)" maxlength="4" value="${esc(edit?.e || '')}">
    <label class="note"><input type="checkbox" id="aq" ${S.quick.includes(edit?.id) ? 'checked' : ''}> Mostrar en accesos rápidos</label></div>
    <div class="acts"><button class="btn sec" id="c">Cancelar</button><button class="btn" id="k">Guardar</button></div>`, d => {
    $('#c', d).onclick = closeDlg;
    $('#k', d).onclick = () => {
      let u = $('#au', d).value.trim(), n = $('#an', d).value.trim(); if (!u || !n) return toast('Nombre y URL obligatorios');
      if (!/^(https?:|\.\.?\/)/i.test(u)) u = 'https://' + u;
      const a = edit || { id: 'u' + Date.now() }; Object.assign(a, { n, u, e: $('#ae', d).value.trim() || '🌐' }); if (!edit) S.apps.push(a);
      S.quick = S.quick.filter(i => i !== a.id); if ($('#aq', d).checked) S.quick.push(a.id);
      save(); closeDlg(); renderers.apps(); bus.emit('apps');
    };
  });
}
let appsEdit = false;
renderers.apps = () => {
  const root = $('#p-apps'), q = (root.dataset.q || '').toLowerCase();
  const list = sortedApps(S.apps).filter(a => !q || a.n.toLowerCase().includes(q));
  root.innerHTML = `<div class="toolbar"><input type="search" id="aq" placeholder="Buscar aplicación…" value="${esc(root.dataset.q || '')}"><button class="btn sec" id="aadd">＋ Añadir</button><button class="btn ${appsEdit ? '' : 'sec'}" id="aed">${appsEdit ? 'Listo' : '✎ Editar'}</button></div>
    <div class="applist ${appsEdit ? 'editing' : ''}">${list.map(a => appHtml(a, appsEdit)).join('')}</div>`;
  const s = $('#aq', root); s.oninput = () => { root.dataset.q = s.value; const p = s.selectionStart; renderers.apps(); const n = $('#aq', root); n.focus(); n.setSelectionRange(p, p); };
  $('#aadd', root).onclick = () => addAppDlg(); $('#aed', root).onclick = () => { appsEdit = !appsEdit; renderers.apps(); };
  $$('.app', root).forEach(d => d.onclick = e => {
    const a = appById(d.dataset.id);
    if (e.target.closest('[data-del]')) { S.apps = S.apps.filter(x => x !== a); S.quick = S.quick.filter(i => i !== a.id); save(); renderers.apps(); bus.emit('apps'); }
    else if (appsEdit) addAppDlg(a); else openApp(a);
  });
};
bus.on('apps', () => $$('.js-appw').forEach(widgetApps));

/* ───────────── Home ───────────── */
const WIDGETS = {
  clock: { n: 'Reloj', cls: 'w-1x1', render: el => el.innerHTML = `<div class="clock"><div class="hi js-greet"></div><div class="big js-clock">--:--</div><div class="dt js-date"></div></div>` },
  weather: { n: 'Clima', cls: 'w-1x1', render: el => { el.classList.add('js-wx'); el.innerHTML = '<h4>Clima</h4>'; renderWeather(); el.onclick = e => e.target.closest('[data-act=city]') && pickCity(); } },
  music: { n: 'Música y letras', cls: 'w-2x1', render: el => { el.classList.add('js-musw'); widgetMusic(el); } },
  map: { n: 'Mapa', cls: 'w-2x2 mapc', render: el => { el.classList.add('js-mapw'); widgetMap(el); } },
  speed: { n: 'Velocidad GPS', cls: 'w-1x1', render: el => { el.innerHTML = `<div class="spd"><div class="v js-spd">0</div><div class="u">${spdUnit()}</div><div class="bar"><i class="js-spdbar"></i></div><div class="m"><span>Máx <b class="js-max">0</b></span><span>Viaje <b class="js-trip">0.0</b> ${S.speedUnit === 'mph' ? 'mi' : 'km'}</span></div></div>`; renderSpeedUI(); } },
  tpms: { n: 'Neumáticos (TPMS)', cls: 'w-1x1', render: el => { el.classList.add('js-tpw'); widgetTpms(el); } },
  apps: { n: 'Accesos rápidos', cls: 'w-2x1', render: el => { el.classList.add('js-appw'); widgetApps(el); } },
};
renderers.home = () => {
  const root = $('#p-home'); root.innerHTML = '<div class="grid"></div>'; const g = $('.grid', root);
  S.widgets.filter(([id, on]) => on && WIDGETS[id]).forEach(([id]) => {
    const c = document.createElement('div'); c.className = 'card ' + WIDGETS[id].cls; c.dataset.w = id; g.append(c); WIDGETS[id].render(c);
  });
  tickClock(); renderWeather();
};

/* ───────────── Acciones globales (teclas, FAB) ───────────── */
const ACTIONS = {
  none: ['— Ninguna —', () => { }],
  home: ['Ir a inicio', () => go('home')], apps: ['Abrir aplicaciones', () => go('apps')], music: ['Abrir música', () => go('music')], map: ['Abrir mapa', () => go('map')], settings: ['Abrir ajustes', () => go('settings')],
  pp: ['Reproducir / pausar', togglePlay], next: ['Siguiente canción', () => playIdx(Mus.i + 1)], prev: ['Canción anterior', () => playIdx(Mus.i - 1)],
  volup: ['Subir volumen', () => { audio.volume = clamp(audio.volume + .1, 0, 1); toast('Volumen ' + Math.round(audio.volume * 100) + '%'); }],
  voldown: ['Bajar volumen', () => { audio.volume = clamp(audio.volume - .1, 0, 1); toast('Volumen ' + Math.round(audio.volume * 100) + '%'); }],
  mute: ['Silenciar / restaurar', () => { audio.muted = !audio.muted; toast(audio.muted ? 'Silenciado' : 'Sonido activado'); }],
  daynight: ['Cambiar día / noche', () => { S.theme = isDark() ? 'light' : 'dark'; save(); applyTheme(); toast(isDark() ? 'Modo noche' : 'Modo día'); }],
  fullscreen: ['Pantalla completa', toggleFS], closefloats: ['Cerrar ventanas flotantes', () => { floats.splice(0).forEach(f => f.remove()); }],
};
const run = k => ACTIONS[k]?.[1]();
function toggleFS() { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.().catch(() => { }); }
$('#btnFS').onclick = toggleFS; $('#btnDN').onclick = () => run('daynight');

let capturing = null;
addEventListener('keydown', e => {
  if (capturing) { e.preventDefault(); const cb = capturing; capturing = null; return cb(e); }
  if (e.target.closest?.('input,textarea,select')) return;
  const k = S.keys.find(x => x.code === e.code); if (k) { e.preventDefault(); run(k.action); }
});

const fab = $('#fab');
function placeFab() {
  fab.classList.toggle('on', S.fab.on);
  const portrait = innerWidth < 761 || innerHeight > innerWidth, x = S.fab.x ?? innerWidth - 80, y = S.fab.y ?? innerHeight - (portrait ? 170 : 90);
  fab.style.left = clamp(x, 0, innerWidth - 58) + 'px'; fab.style.top = clamp(y, 0, innerHeight - 58) + 'px';
}
(() => {
  let sx, sy, ox, oy, moved, lp, long;
  fab.onpointerdown = e => { fab.setPointerCapture(e.pointerId); sx = e.clientX; sy = e.clientY; ox = fab.offsetLeft; oy = fab.offsetTop; moved = false; long = false; lp = setTimeout(() => { if (!moved) { long = true; run(S.fab.long); } }, 600); };
  fab.onpointermove = e => { if (sx == null) return; if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) moved = true; if (moved) { fab.style.left = clamp(ox + e.clientX - sx, 0, innerWidth - 58) + 'px'; fab.style.top = clamp(oy + e.clientY - sy, 0, innerHeight - 58) + 'px'; } };
  fab.onpointerup = () => { clearTimeout(lp); if (moved) { S.fab.x = fab.offsetLeft; S.fab.y = fab.offsetTop; save(); } else if (!long) run(S.fab.click); sx = null; };
})();
addEventListener('resize', placeFab);

/* ───────────── Ajustes ───────────── */
const OPT = {
  theme: [['auto-time', 'Automático por hora (19:00–06:00)'], ['light-sensor', 'Sensor de luz (si existe)'], ['system', 'Seguir al sistema'], ['dark', 'Siempre noche'], ['light', 'Siempre día']],
  wallMode: [['default', 'Predeterminado'], ['custom', 'Una imagen'], ['carousel', 'Carrusel']],
  wallEffect: [['fade', 'Desvanecer'], ['zoom', 'Zoom'], ['slide', 'Deslizar'], ['blur', 'Desenfoque'], ['none', 'Sin efecto']],
  openMode: [['float', 'Ventana flotante (PiP)'], ['full', 'Pantalla completa'], ['tab', 'Nueva pestaña']],
  sort: [['default', 'Predeterminado'], ['az', 'Nombre A-Z'], ['za', 'Nombre Z-A']],
  speedUnit: [['kmh', 'km/h'], ['mph', 'mph']], tempUnit: [['c', '°C'], ['f', '°F']], pressUnit: [['bar', 'bar'], ['psi', 'psi'], ['kpa', 'kPa']],
};
const CATS = {
  inicio: ['🏠 Inicio', [
    { t: 'widgets' },
    { k: 'rows', l: 'Filas de widgets', d: 'Número de filas de la pantalla de inicio', type: 'range', min: 1, max: 3, step: 1 },
    { k: 'colw', l: 'Ancho mínimo de columna', d: 'Mayor valor = menos columnas visibles (200–500 px)', type: 'range', min: 200, max: 500, step: 10 },
    { k: 'radius', l: 'Bordes redondeados', d: 'Radio de las tarjetas', type: 'range', min: 0, max: 40, step: 2 },
    { k: 'rhd', l: 'Disposición para conducción a la derecha', d: 'Mueve la barra de navegación al lado derecho', type: 'toggle' },
  ]],
  tema: ['🌓 Tema', [
    { k: 'theme', l: 'Cambio día / noche', d: 'Lógica del cambio automático de tema', type: 'select' },
    { k: 'accent', l: 'Color de acento', type: 'color' },
  ]],
  fondo: ['🖼 Fondo', [{ t: 'walls' },
    { k: 'wallMode', l: 'Modo de fondo', type: 'select' }, { k: 'wallEffect', l: 'Efecto de transición', type: 'select' },
    { k: 'wallInterval', l: 'Segundos entre fondos (carrusel)', type: 'range', min: 5, max: 300, step: 5 }]],
  apps: ['▦ Aplicaciones', [
    { k: 'openMode', l: 'Modo de apertura', d: 'Cómo se abren las apps: ventana flotante, pantalla completa o pestaña', type: 'select' },
    { k: 'sort', l: 'Regla de ordenación', type: 'select' },
    { t: 'btn', l: 'Gestionar aplicaciones', f: () => { appsEdit = true; go('apps'); } },
  ]],
  musica: ['🎵 Música', [
    { k: 'hideLyrics', l: 'Ocultar letras', d: 'Oculta las letras en el widget y en la página de música', type: 'toggle' },
    { k: 'visualizer', l: 'Visualizador de audio', d: 'Desactívalo para ahorrar batería en pantallas lentas', type: 'toggle' },
    { k: 'lyricSize', l: 'Tamaño de letra', type: 'range', min: 14, max: 60, step: 2 },
    { k: 'lyricCur', l: 'Color de la línea actual', type: 'color' }, { k: 'lyricNorm', l: 'Color del resto de líneas', type: 'color' },
  ]],
  tpms: ['🛞 Neumáticos', [
    { k: 'pressUnit', l: 'Unidad de presión', type: 'select' },
    { k: 'tpWarn', l: 'Presión de aviso (bar)', d: 'Por debajo se marca en ámbar', type: 'number', step: .1 },
    { k: 'tpDanger', l: 'Presión peligrosa (bar)', d: 'Por debajo se marca en rojo y salta una alerta', type: 'number', step: .1 },
    { t: 'note', l: 'Una PWA no puede leer sensores TPMS Bluetooth de forma genérica: toca cada neumático en el widget para introducir su presión. Los valores se guardan en el dispositivo.' },
  ]],
  mapa: ['🗺 Mapa y avisos', [
    { k: 'radarAlerts', l: 'Avisos de radares fijos', d: 'Aviso en pantalla y por voz cuando se acerca un radar fijo por delante. Datos de OpenStreetMap: pueden estar incompletos o desactualizados. Comprueba la normativa de tu país', type: 'toggle' },
    { k: 'layers.cams', l: 'Mostrar radares en el mapa', type: 'toggle' }, { k: 'layers.chargers', l: 'Mostrar cargadores', d: 'Los de Tesla se marcan en rojo', type: 'toggle' },
    { k: 'layers.fuel', l: 'Mostrar gasolineras', type: 'toggle' }, { k: 'layers.reports', l: 'Mostrar mis reportes', type: 'toggle' },
    { t: 'btn', l: 'Actualizar radares y puntos de interés', f: () => { Poi.refresh(true); toast('Actualizando…'); } },
    { t: 'btn', l: 'Borrar mis reportes', f: () => { Poi.clearReports(); toast('Reportes borrados'); } },
    { t: 'note', l: 'No se incluyen avisos de controles móviles de policía. Los reportes (accidente, peligro, bache…) se guardan solo en este dispositivo durante 3 horas.' },
  ]],
  unidades: ['📏 Unidades', [{ k: 'speedUnit', l: 'Velocidad', type: 'select' }, { k: 'tempUnit', l: 'Temperatura', type: 'select' }, { t: 'btn', l: 'Reiniciar viaje y velocidad máxima', f: () => { S.trip = 0; S.maxSpeed = 0; S.tripT = 0; save(); renderSpeedUI(); toast('Reiniciado'); } }]],
  controles: ['🎛 Controles', [
    { k: 'teslaMode', l: 'Modo Tesla', d: 'Botones grandes y navegación propia dentro de la app (el navegador de Tesla no abre las apps de Maps/Waze). Se activa solo en el navegador del coche', type: 'toggle' },
    { k: 'voice', l: 'Voz de navegación', d: 'Avisos hablados de giros (si el navegador lo permite)', type: 'toggle' },
    { k: 'fab.on', l: 'Botón flotante', d: 'Punto arrastrable. Toque = acción corta, pulsación larga = acción larga', type: 'toggle' },
    { k: 'fab.click', l: 'Acción al tocar', type: 'action' }, { k: 'fab.long', l: 'Acción al mantener', type: 'action' },
    { t: 'keys' },
  ]],
  datos: ['💾 Datos', [
    { t: 'btn', l: 'Exportar copia de seguridad', f: backup }, { t: 'btn', l: 'Restaurar copia de seguridad', f: () => $('#fileCfg').click() },
    { t: 'btn', l: 'Restablecer valores de fábrica', f: () => confirm('¿Borrar todos los ajustes?') && (localStorage.removeItem('leco.v1'), location.reload()) },
  ]],
  acerca: ['ℹ️ Acerca de', [{ t: 'note', l: 'LecoAuto PWA — launcher web para pantallas de coche, de código abierto en este repositorio. Es un proyecto independiente: no está afiliado ni incluye código, marcas o recursos de la app Android LecoAuto. Clima: Open-Meteo. Mapa: © OpenStreetMap.' }]],
};
const getK = k => k.split('.').reduce((o, p) => o?.[p], S);
const setK = (k, v) => { const p = k.split('.'), l = p.pop(); p.reduce((o, x) => o[x], S)[l] = v; };
let cat = 'inicio';
renderers.settings = () => {
  const root = $('#p-settings');
  root.innerHTML = `<div class="set"><div class="cats">${Object.entries(CATS).map(([k, v]) => `<button data-c="${k}" class="${k === cat ? 'act' : ''}">${v[0]}</button>`).join('')}</div><div class="body"></div></div>`;
  $$('.cats button', root).forEach(b => b.onclick = () => { cat = b.dataset.c; renderers.settings(); });
  const body = $('.body', root);
  CATS[cat][1].forEach(it => body.append(settingRow(it)));
};
function el(html) { const t = document.createElement('div'); t.innerHTML = html.trim(); return t.firstChild; }
function settingRow(it) {
  if (it.t === 'note') return el(`<div class="note">${esc(it.l)}</div>`);
  if (it.t === 'btn') { const r = el(`<div class="row"><div class="tx"><b>${esc(it.l)}</b></div><button class="btn sec">Abrir</button></div>`); $('button', r).onclick = it.f; return r; }
  if (it.t === 'widgets') return widgetsEditor();
  if (it.t === 'walls') return wallsEditor();
  if (it.t === 'keys') return keysEditor();
  const val = getK(it.k), r = el(`<div class="row"><div class="tx"><b>${esc(it.l)}</b>${it.d ? `<small>${esc(it.d)}</small>` : ''}</div><div class="ctrl"></div></div>`), c = $('.ctrl', r);
  const commit = v => { setK(it.k, v); save(); applyTheme(); placeFab(); if (['wallMode', 'wallEffect', 'wallInterval'].includes(it.k)) Wall.apply(); if (['speedUnit', 'tempUnit', 'pressUnit', 'rows', 'colw', 'visualizer', 'hideLyrics'].includes(it.k)) refreshHome(); if (it.k === 'radarAlerts' || it.k.startsWith('layers.')) { Poi.draw(); Poi.refresh(); } };
  if (it.type === 'toggle') { const s = el(`<div class="sw ${val ? 'on' : ''}"></div>`); s.onclick = () => { s.classList.toggle('on'); commit(s.classList.contains('on')); }; c.append(s); }
  else if (it.type === 'select' || it.type === 'action') {
    const opts = it.type === 'action' ? Object.entries(ACTIONS).map(([k, v]) => [k, v[0]]) : OPT[it.k];
    const s = el(`<select>${opts.map(([v, l]) => `<option value="${v}" ${v == val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`); s.onchange = () => commit(s.value); c.append(s);
  } else if (it.type === 'range') { const s = el(`<input type="range" min="${it.min}" max="${it.max}" step="${it.step}" value="${val}">`); const o = el(`<span class="note">${val}</span>`); s.oninput = () => { o.textContent = s.value; }; s.onchange = () => commit(+s.value); c.append(s, o); }
  else if (it.type === 'color') { const s = el(`<input type="color" value="${val}">`); s.oninput = () => commit(s.value); c.append(s); }
  else if (it.type === 'number') { const s = el(`<input type="number" step="${it.step}" value="${val}" style="width:90px">`); s.onchange = () => commit(parseFloat(s.value) || val); c.append(s); }
  return r;
}
function refreshHome() { renderers.home(); }
function widgetsEditor() {
  const w = el('<div class="wgl"><div class="sec-t">Widgets de la pantalla de inicio (orden y visibilidad)</div></div>');
  S.widgets.forEach(([id, on], i) => {
    const r = el(`<div class="row"><div class="tx"><b>${esc(WIDGETS[id].n)}</b></div><button class="mini" data-d="-1">▲</button><button class="mini" data-d="1">▼</button><div class="sw ${on ? 'on' : ''}"></div></div>`);
    $('.sw', r).onclick = () => { S.widgets[i][1] = on ? 0 : 1; save(); renderers.settings(); refreshHome(); };
    $$('.mini', r).forEach(b => b.onclick = () => { const j = i + +b.dataset.d; if (j < 0 || j >= S.widgets.length) return; [S.widgets[i], S.widgets[j]] = [S.widgets[j], S.widgets[i]]; save(); renderers.settings(); refreshHome(); });
    w.append(r);
  });
  return w;
}
function wallsEditor() {
  const w = el('<div><div class="sec-t">Imágenes de fondo (se guardan en el dispositivo; usa imágenes ligeras)</div><div class="walls"></div><button class="btn sec" id="wadd">＋ Añadir imágenes</button><div style="height:14px"></div></div>');
  const box = $('.walls', w);
  Wall.list.forEach((x, i) => { const t = el(`<div class="th ${S.wallMode === 'custom' && S.wallSel === i ? 'sel' : ''}" style="background-image:url('${Wall.urls[i]}')"><button>✕</button></div>`); t.onclick = e => { if (e.target.tagName === 'BUTTON') return; S.wallMode = 'custom'; S.wallSel = i; save(); Wall.apply(); renderers.settings(); }; $('button', t).onclick = async () => { await idb.del(x.id); await Wall.load(); Wall.apply(); renderers.settings(); }; box.append(t); });
  if (!Wall.list.length) box.append(el('<span class="note">Aún no hay imágenes.</span>'));
  $('#wadd', w).onclick = () => $('#fileImg').click(); return w;
}
$('#fileImg').onchange = async e => {
  for (const f of e.target.files) { if (f.size > 4e6) { toast(`${f.name}: supera 4 MB`); continue; } await idb.add(f); }
  e.target.value = ''; await Wall.load(); if (S.wallMode === 'default') { S.wallMode = 'custom'; save(); } Wall.apply(); renderers.settings();
};
function keysEditor() {
  const w = el('<div><div class="sec-t">Extensiones de teclas</div><div class="note">Asigna acciones a las teclas de tu teclado o volante (si envía teclas estándar).</div></div>');
  S.keys.forEach((k, i) => { const r = el(`<div class="row"><div class="tx"><b>${esc(k.label)}</b><small>${esc(ACTIONS[k.action]?.[0] || '')}</small></div><button class="btn bad">Borrar</button></div>`); $('button', r).onclick = () => { S.keys.splice(i, 1); save(); renderers.settings(); }; w.append(r); });
  const add = el('<button class="btn">＋ Añadir tecla</button>');
  add.onclick = () => {
    toast('Pulsa la tecla que quieres asignar…', 4000);
    capturing = e => {
      if (e.code === 'Escape') return;
      dlg(`<h3>Tecla: ${esc(e.key.length === 1 ? e.key.toUpperCase() : e.code)}</h3><div class="f"><select class="in" id="ka">${Object.entries(ACTIONS).filter(([k]) => k !== 'none').map(([k, v]) => `<option value="${k}">${esc(v[0])}</option>`).join('')}</select></div><div class="acts"><button class="btn sec" id="c">Cancelar</button><button class="btn" id="k">Guardar</button></div>`, d => {
        $('#c', d).onclick = closeDlg; $('#k', d).onclick = () => { S.keys = S.keys.filter(x => x.code !== e.code); S.keys.push({ code: e.code, label: e.key.length === 1 ? e.key.toUpperCase() : e.code, action: $('#ka', d).value }); save(); closeDlg(); renderers.settings(); };
      });
    };
  };
  w.append(add); return w;
}
function backup() {
  const b = new Blob([JSON.stringify({ app: 'lecoauto-pwa', v: 1, settings: S }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'lecoauto-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$('#fileCfg').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (f.size > 1e6) return toast('Archivo demasiado grande');
  try { const j = JSON.parse(await f.text()); if (j.app !== 'lecoauto-pwa') throw 0; S = Object.assign(structuredClone(DEF), j.settings); save(); toast('Restaurado'); setTimeout(() => location.reload(), 600); } catch { toast('Copia de seguridad no válida'); }
};

/* ───────────── Arranque ───────────── */
async function init() {
  S.apps.forEach(a => { const d = DEF_APPS.find(x => x.id === a.id); if (d && !a.k) a.k = d.k; });
  await Wall.load(); applyTheme(); Wall.apply(); placeFab();
  go('home'); tickClock(); setInterval(tickClock, 1000);
  Poi.init(); startGPS(); loadWeather(); setInterval(() => loadWeather(), 15 * 60e3);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
  try { navigator.wakeLock?.request('screen').catch(() => { }); document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && navigator.wakeLock?.request('screen').catch(() => { })); } catch { }
}
addEventListener('DOMContentLoaded', init); // tras cargar también dash.js

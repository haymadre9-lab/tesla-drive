'use strict';
/* Catálogo de apps web recomendadas para abrir en las ventanas flotantes (y en el navegador del Tesla).
   Cada entrada dice con qué método funciona, para no prometer lo que no se ha podido comprobar:
   · propia    → página nuestra (carpeta mini/) que usa APIs abiertas con CORS: no depende de que un tercero permita el iframe.
   · embed     → versión incrustable OFICIAL del servicio (widget/embed documentado por el propio servicio).
   · probar    → sitio normal: puede o no permitir abrirse dentro de otra ventana. SIN VERIFICAR: pruébalo; si sale en blanco, usa ↗.
   · bloquea   → el servicio prohíbe el iframe (cabecera X-Frame-Options/CSP): se abre en pestaña aparte. */

const Cat = (() => {
  const TAGS = {
    ghp: ['🟢 GitHub Pages', 'Alojado en GitHub Pages, que no prohíbe el iframe. El juego en sí no se ha podido abrir desde el entorno de desarrollo: pruébalo.'],
    propia: ['✅ Propia', 'Hecha por nosotros con datos abiertos: se abre dentro de la ventana sin depender de terceros (necesita internet).'],
    embed: ['🟢 Embed oficial', 'Usa la versión incrustable que el propio servicio ofrece para webs.'],
    probar: ['🟡 Probar', 'Sin verificar: puede que no se abra dentro de la ventana. Si sale en blanco, usa ↗ para abrirla fuera.'],
    bloquea: ['🔴 Se abre fuera', 'El servicio no permite abrirse dentro de otra ventana: se abre en una pestaña.'],
  };
  const LIST = [
    ['Tus apps', [
      { id: 'd3d', n: 'D3D Clone', e: '🛣️', t: 'propia', d: 'Visor 3D de conducción. Comparte con esta app el código de enlace (mismo origen) y los destinos van y vienen. Necesita WebGL.', a: { u: 'https://haymadre9-lab.github.io/hudMapa3D/', img: 'icons/d3d.png' } },
      { id: 'launcher', n: 'Launcher', e: '🚀', t: 'propia', d: 'Tu launcher web (Teslalaunch).', a: { u: 'https://apkapp-driver.github.io/Teslalaunch/', img: 'icons/launcher.svg' } },
    ]],
    ['Lectura y tiempo', [
      { id: 'tiempo', n: 'El tiempo', e: '⛅', t: 'propia', d: 'Tiempo ahora, próximas horas y 7 días en tu posición o en otra ciudad. Aviso de lluvia probable. Datos de Open-Meteo.', a: { u: 'mini/tiempo.html', k: 'tiempo' } },
      { id: 'wikipro', n: 'Wikipedia (lector)', e: '📚', t: 'propia', d: 'Buscar, leer, «cerca de ti» con tu GPS, al azar, letra grande y leer en voz alta. ES/EN.', a: { u: 'mini/wiki.html', k: 'wikipro' } },
    ]],
    ['Para el viaje (sin verificar)', [
      { id: 'viajando', n: 'Viajando en Tesla', e: '🚗', t: 'probar', d: 'Navegador de Viajando en Tesla.', a: { u: 'https://www.viajandoentesla.es/navegador', img: 'icons/viajando.svg' } },
      { id: 'codriver', n: 'CoDriver', e: '🧭', t: 'probar', d: 'CoDriver (app.codriver.io).', a: { u: 'https://app.codriver.io/?lang=en', img: 'icons/codriver.svg' } },
      { id: 'dgt', n: 'DGT · tráfico y cámaras', e: '🚧', t: 'probar', d: 'Incidencias, obras y cámaras de la DGT.', a: { u: 'https://infocar.dgt.es/etraffic/' } },
      { id: 'abrp', n: 'A Better Route Planner', e: '⚡', t: 'probar', d: 'Planificador de rutas con paradas de carga para eléctricos.', a: { u: 'https://abetterrouteplanner.com/' } },
    ]],
    ['Música, podcasts y vídeo', [
      { id: 'yt', n: 'YouTube', e: '▶️', t: 'embed', d: 'Se abre dentro de la ventana con el enlace ya escrito: solo pulsa Aceptar. Los enlaces de vídeo (youtu.be/…) se reproducen; otros enlaces se abren fuera.', a: { u: 'https://m.youtube.com', k: 'yt' } },
      { id: 'media', n: 'Reproductor por enlace', e: '🎶', t: 'embed', d: 'Favoritos para tocar (se guardan en el móvil), recientes y enlaces enviados desde el móvil. YouTube, Spotify, SoundCloud, Mixcloud, Apple, Deezer, Vimeo, Dailymotion, Twitch.', a: { u: 'https://youtube.com', k: 'media' } },
      { id: 'radio', n: 'Radio Garden', e: '📻', t: 'probar', d: 'Radios de todo el mundo en un globo.', a: { u: 'https://radio.garden' } },
      { id: 'pocketcasts', n: 'Pocket Casts (web)', e: '🎧', t: 'probar', d: 'Tus podcasts (necesita cuenta).', a: { u: 'https://play.pocketcasts.com/' } },
    ]],
    ['Juegos', [
      { id: 'tetris', n: 'Tetris', e: '🧱', t: 'propia', d: 'Horizontal, con botones grandes (girar, mover, caída rápida, pausa), pieza siguiente y niveles.', a: { u: 'mini/games/tetris.html', k: 'own', mode: 'full' } },
      { id: 'snake', n: 'Serpiente', e: '🐍', t: 'propia', d: 'Desliza o usa las flechas; se acelera al comer. Récord guardado.', a: { u: 'mini/games/snake.html', k: 'own', mode: 'full' } },
      { id: 'clumsy', n: 'Clumsy Bird', e: '🐦', t: 'ghp', d: 'Versión libre de Flappy Bird: un toque para aletear.', a: { u: 'https://ellisonleao.github.io/clumsy-bird/' } },
    ]],
    ['Servicios que NO se pueden abrir dentro de una ventana', [
      { id: 'playables', n: 'YouTube Playables', e: '🎮', t: 'bloquea', d: 'No se puede abrir dentro de una ventana (comprobado en tu coche). Se abre en pestaña con un toque.', a: { u: 'https://www.youtube.com/playables', mode: 'tab' } },
    ]],
  ];

  const find = id => { for (const [, l] of LIST) { const x = l.find(y => y.id === id); if (x) return x; } };
  const have = id => { const x = find(id); return (S.apps || []).some(a => a.id === id || (x && x.a.k && x.a.k !== 'blocked' && x.a.k !== 'own' && a.k === x.a.k)); };
  const mk = x => Object.assign({ id: x.id, n: x.n, e: x.e }, x.a);
  function add(id) { const x = find(id); if (!x || have(id)) return false; S.apps.push(mk(x)); save(); if (typeof renderers !== 'undefined' && renderers.apps && page === 'apps') renderers.apps(); bus.emit('apps'); return true; }
  function open() {
    const row = x => `<div class="cat-r" data-id="${esc(x.id)}"><span class="cat-e">${x.e}</span><div class="cat-t"><b>${esc(x.n)}</b> <span class="cat-g cat-${x.t}" title="${esc(TAGS[x.t][1])}">${TAGS[x.t][0]}</span><small>${esc(x.d)}</small></div><div class="cat-b"><button class="btn sec" data-o="${esc(x.id)}" type="button">Abrir</button><button class="btn ${have(x.id) ? 'sec' : ''}" data-a="${esc(x.id)}" type="button" ${have(x.id) ? 'disabled' : ''}>${have(x.id) ? '✓ Añadida' : 'Añadir'}</button></div></div>`;
    dlg(`<h3>Apps recomendadas</h3><div class="note">Cada una indica cómo funciona. <b>Abrir</b> la prueba al momento; <b>Añadir</b> la deja en tu pantalla de Apps.</div><div class="cat-l">${LIST.map(([h, l]) => `<div class="cat-h">${esc(h)}</div>${l.map(row).join('')}`).join('')}</div><div class="acts"><button class="btn sec" id="cx" type="button">Cerrar</button></div>`, d => {
      $('#cx', d).onclick = closeDlg;
      $$('[data-a]', d).forEach(b => b.onclick = () => { if (add(b.dataset.a)) { b.textContent = '✓ Añadida'; b.disabled = true; b.classList.add('sec'); toast('Añadida a Apps'); } });
      $$('[data-o]', d).forEach(b => b.onclick = () => { const x = find(b.dataset.o); closeDlg(); openApp(mk(x), x.a.mode || (x.t === 'bloquea' ? 'float' : undefined)); });
    });
  }
  /* Migración única: el lector de Wikipedia sustituye al sitio móvil (que puede no abrirse en ventana) y se añaden las apps nuevas */
  if (!S.appsV2) {
    const w = S.apps.find(a => a.id === 'wiki'); if (w && /wikipedia\.org/.test(w.u || '')) { w.u = 'mini/wiki.html'; w.k = 'wikipro'; w.n = 'Wikipedia'; }
    ['media'].forEach(id => { if (!have(id) && !(id === 'wikipro')) { const x = find(id); if (x) S.apps.push(mk(x)); } });
    S.appsV2 = 1; save();
  }
  /* Migración V9: se quitan TuneIn, Telegram y PlugShare */
  if (!S.appsV9) { const gone9 = ['tunein', 'tg', 'plugshare']; S.apps = S.apps.filter(a => !gone9.includes(a.id)); S.quick = (S.quick || []).filter(id => !gone9.includes(id)); S.appsV9 = 1; save(); }
  /* Migración V8: se quitan Ajedrez y 2048 */
  if (!S.appsV8) { const gone = ['lichess', 'g2048']; S.apps = S.apps.filter(a => !gone.includes(a.id)); S.quick = (S.quick || []).filter(id => !gone.includes(id)); S.appsV8 = 1; save(); }
  /* Migración V7: ajedrez ampliable a pantalla completa; PlugShare y Playables se abren fuera */
  if (!S.appsV7) {
    S.apps.forEach(a => { if (a.id === 'lichess') { a.n = 'Ajedrez · Lichess TV'; a.u = 'mini/games/ajedrez.html'; a.k = 'own'; a.mode = 'full'; } if (a.id === 'plugshare' || a.id === 'playables') a.mode = 'tab'; });
    S.appsV7 = 1; save();
  }
  /* Migración V6: juegos propios en horizontal (sustituyen a 2048 y Hextris externos) y YouTube con enlace ya escrito */
  if (!S.appsV6) {
    S.apps = S.apps.filter(a => a.id !== 'hextris');
    S.apps.forEach(a => { if (a.id === 'g2048') { a.u = 'mini/games/2048.html'; a.k = 'own'; a.mode = 'full'; } if (a.id === 'yt') { a.u = 'https://m.youtube.com'; a.k = 'yt'; delete a.mode; } });
    ['g2048', 'tetris', 'snake'].forEach(id => { if (!S.apps.some(a => a.id === id)) { const x = find(id); if (x) S.apps.push(mk(x)); } });
    S.appsV6 = 1; save();
  }
  /* Migración V5: YouTube vuelve a Apps con su dirección principal (se abre en pestaña) */
  if (!S.appsV5) { if (!have('yt')) { const x = find('yt'); if (x) { S.apps.unshift(mk(x)); S.quick = ['yt', ...(S.quick || []).filter(i => i !== 'yt')]; } } S.appsV5 = 1; save(); }
  /* Migración V4: juegos web (se añaden a Apps una sola vez) */
  if (!S.appsV4) { ['g2048', 'hextris', 'clumsy'].forEach(id => { if (!have(id)) { const x = find(id); if (x) S.apps.push(mk(x)); } }); S.appsV4 = 1; save(); }
  /* Migración V3: se quitan las apps que ya no interesan y se añaden D3D Clone, El tiempo, Viajando en Tesla, Launcher y CoDriver */
  if (!S.appsV3) {
    const gone = ['maps', 'waze', 'nflx', 'twitch', 'spot', 'wa', 'windy', 'rain', 'gmail', 'hud'];
    S.apps = S.apps.filter(a => !gone.includes(a.id)); S.quick = (S.quick || []).filter(id => !gone.includes(id));
    ['d3d', 'tiempo', 'viajando', 'launcher', 'codriver'].forEach(id => { if (!have(id)) { const x = find(id); if (x) { S.apps.push(mk(x)); S.quick.push(id); } } });
    S.appsV3 = 1; save();
  }
  const _r = renderers.apps; renderers.apps = () => { _r(); const tb = $('#p-apps .toolbar'); if (tb && !$('#acat', tb)) { const b = el('<button class="btn sec" id="acat" type="button">🛍 Recomendadas</button>'); b.onclick = open; tb.insertBefore(b, $('#aadd', tb)); } };
  ACTIONS.catalog = ['Apps recomendadas', open];
  return { open, add, LIST, TAGS };
})();

/* ───────── Reproductor por enlace: pensado para NO escribir en el coche ─────────
   · Favoritos: se guardan en el móvil y viajan al coche con la sincronización de ajustes (S.mediaFavs).
   · Recientes: lo último que has abierto en este dispositivo.
   · Enviar: desde el móvil se manda el enlace al coche por el enlace entre dispositivos (ntfy.sh, mismo código).
   · Compartir: en el móvil, «Compartir» desde YouTube/Spotify/SoundCloud… → LecoAuto (PWA instalada) ofrece abrir, enviar o guardar. */
const Media = (() => {
  const F = () => (S.mediaFavs ||= []), Rc = () => (S.mediaRecent ||= []); // la sincronización puede reemplazar S: siempre se lee con valor por defecto
  const nameOf = u => { const r = mediaEmbed(u); if (!r) return u; let seg = ''; try { const p = new URL(/^https?:/i.test(u) ? u : 'https://' + u).pathname.split('/').filter(Boolean); seg = decodeURIComponent(p[p.length - 1] || '').replace(/[-_]/g, ' '); } catch { } return r.n + (seg && seg.length < 40 ? ' · ' + seg : ''); };
  /* Favoritos de arranque (solo la primera vez): directos de YouTube que se pueden incrustar y tu enlace, para tocar sin escribir */
  if (!S.mediaSeed) { const f = F(); [{ n: 'Lofi Girl · directo (YouTube)', u: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' }, { n: 'Synthwave · directo (YouTube)', u: 'https://www.youtube.com/watch?v=4xDzrJKXOOY' }, { n: 'Tu enlace de YouTube (se abre fuera)', u: typeof YT_DEFAULT === 'string' ? YT_DEFAULT : 'https://share.google/59pnNBgXOUBLdbM3p' }].forEach(x => { if (!f.some(y => y.u === x.u)) f.push(x); }); S.mediaSeed = 1; save(); }
  const remember = (u, n) => { S.mediaRecent = [{ u, n: (n || nameOf(u)).slice(0, 60) }, ...Rc().filter(x => x.u !== u)].slice(0, 8); save(); };
  /* Búsqueda en YouTube: usa la API oficial con TU clave (gratis, ~100 búsquedas al día). La clave vive solo en este dispositivo (localStorage «leco.yt»). */
  const ytKey = () => { try { return localStorage.getItem('leco.yt') || ''; } catch { return ''; } };
  /* Sin clave: servidores públicos gratuitos de búsqueda (Piped / Invidious). Responde el primero que funcione; si ninguno está disponible, se avisa */
  async function ytSearchFree(q) {
    const ctl = new AbortController(), T = setTimeout(() => ctl.abort(), 9000), enc = encodeURIComponent(q), th = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
    const get = async u => { const r = await fetch(u, { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
    const tasks = [
      ...['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://api.piped.private.coffee'].map(b => get(`${b}/search?q=${enc}&filter=videos`).then(j => (j.items || []).filter(x => x.url && /[?&]v=/.test(x.url)).map(x => { const id = x.url.split('v=')[1].split('&')[0]; return { id, t: x.title, ch: x.uploaderName || '', th: th(id) }; }))),
      ...['https://inv.nadeko.net', 'https://yewtu.be', 'https://invidious.nerdvpn.de'].map(b => get(`${b}/api/v1/search?q=${enc}&type=video`).then(j => (Array.isArray(j) ? j : []).filter(x => x.videoId).map(x => ({ id: x.videoId, t: x.title, ch: x.author || '', th: th(x.videoId) })))),
    ];
    try { const rs = await Promise.any(tasks.map(p => p.then(r => { if (!r.length) throw new Error('vacío'); return r; }))); ctl.abort(); return rs.slice(0, 12); }
    catch { throw new Error('ningún servidor gratuito responde ahora; puedes poner tu propia clave en Ajustes → Mapa → «Clave de YouTube»'); }
    finally { clearTimeout(T); }
  }
  async function ytSearch(q) {
    if (!ytKey()) return ytSearchFree(q);
    try { return await ytSearchKey(q); } catch (e) { try { return await ytSearchFree(q); } catch { throw e; } }
  }
  async function ytSearchKey(q) {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 12000);
    try {
      const r = await fetch('https://www.googleapis.com/youtube/v3/search?' + new URLSearchParams({ part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '12', regionCode: 'ES', relevanceLanguage: 'es', q, key: ytKey() }), { signal: c.signal }), j = await r.json();
      if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
      return (j.items || []).filter(x => x.id && x.id.videoId).map(x => ({ id: x.id.videoId, t: x.snippet.title, ch: x.snippet.channelTitle, th: x.snippet.thumbnails && (x.snippet.thumbnails.medium || x.snippet.thumbnails.default || {}).url }));
    } finally { clearTimeout(t); }
  }
  function ytKeyDlg() {
    dlg(`<h3>Clave de YouTube (para buscar)</h3><div class="note">Opcional. Permite buscar vídeos desde el reproductor. Crea una clave gratuita de «YouTube Data API v3» en Google Cloud (consola de APIs) y escríbela o pégala aquí desde el móvil. Se guarda solo en este dispositivo: no se sincroniza ni se publica. Cuota gratuita: unas 100 búsquedas al día.</div><label class="lab">API key<input class="in" id="ykk" type="password" autocomplete="off" placeholder="AIza…" value="${esc(ytKey())}"></label><div id="ykr" class="note"></div><div class="acts"><button class="btn bad" id="ykd" type="button">Borrar</button><button class="btn sec" id="ykt" type="button">Probar</button><button class="btn" id="yks" type="button">Guardar</button><button class="btn sec" id="ykx" type="button">Cerrar</button></div>`, d => {
      const val = () => $('#ykk', d).value.trim(), out = t => { $('#ykr', d).textContent = t; };
      $('#ykx', d).onclick = closeDlg; $('#ykd', d).onclick = () => { try { localStorage.removeItem('leco.yt'); } catch { } closeDlg(); toast('Clave de YouTube borrada'); };
      $('#yks', d).onclick = () => { try { localStorage.setItem('leco.yt', val()); } catch { return toast('No se pudo guardar en este dispositivo'); } closeDlg(); toast(val() ? 'Clave de YouTube guardada' : 'Sin clave'); };
      $('#ykt', d).onclick = async () => { out('Probando…'); const old = ytKey(); try { localStorage.setItem('leco.yt', val()); await ytSearch('musica'); out('✔ La clave funciona'); } catch (e) { out('✘ No funciona: ' + e.message); } finally { try { localStorage.setItem('leco.yt', old); } catch { } } };
    });
  }

  const fav = (u, n) => { if (F().some(x => x.u === u)) return false; F().unshift({ u, n: (n || nameOf(u)).slice(0, 60) }); save(); return true; };
  const send = u => { if (typeof Link === 'undefined' || !Link.valid()) { toast('Primero configura el enlace entre dispositivos: Ajustes → Mapa → «Enlace con D3D Clone / Autoboard-nav»', 5000); return false; } Link.publishMedia(u); toast('Enviado al otro dispositivo'); return true; };
  function pick() {
    return new Promise(res => {
      const row = (ico, x, i, k) => `<div class="mp-r" data-${k}="${i}"><span>${ico}</span><b>${esc(x.n)}</b>${k === 'f' ? `<button class="mp-x" data-df="${i}" type="button" aria-label="Quitar"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 5L19 19M19 5L5 19" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></button>` : ''}</div>`;
      const body = () => (F().length ? '<div class="cat-h">⭐ Favoritos (tócalos para reproducir)</div>' + F().map((x, i) => row('⭐', x, i, 'f')).join('') : '<div class="note">Aún no tienes favoritos. Guárdalos desde el móvil: se sincronizan con el coche y no hay que escribir nada.</div>') + (Rc().length ? '<div class="cat-h">🕘 Recientes</div>' + Rc().map((x, i) => row('🕘', x, i, 'r')).join('') : '');
      dlg(`<h3>🎶 Reproductor</h3><div id="mpl" class="cat-l" style="max-height:34vh"></div><div class="cat-h">Buscar en YouTube o pegar un enlace</div><div class="adv-ask"><input class="in" id="mpi" placeholder="Buscar… o enlace" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn" id="mpq" type="button" aria-label="Buscar"><svg viewBox="0 0 24 24" width="22" height="22"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg></button><button class="btn sec" id="mpg" type="button" aria-label="Reproducir enlace">▶</button></div>
        <div class="acts"><button class="btn sec" id="mps" type="button">⭐ Guardar</button><button class="btn sec" id="mpe" type="button">📲 Enviar a otro dispositivo</button><button class="btn sec" id="mpx" type="button">Cerrar</button></div>`, d => {
        const list = $('#mpl', d), inp = $('#mpi', d); let done = false; const fin = v => { if (done) return; done = true; closeDlg(); res(v); };
        const draw = () => { list.innerHTML = body(); $$('[data-f]', list).forEach(r => r.onclick = e => { if (e.target.closest('[data-df]')) return; const x = F()[+r.dataset.f]; remember(x.u); fin(x.u); }); $$('[data-r]', list).forEach(r => r.onclick = () => fin(Rc()[+r.dataset.r].u)); $$('[data-df]', list).forEach(b => b.onclick = e => { e.stopPropagation(); F().splice(+b.dataset.df, 1); save(); draw(); }); };
        draw(); const val = () => inp.value.trim(), okv = () => { const v = val(); if (!mediaEmbed(v)) { toast('No reconozco ese enlace (YouTube, Spotify, SoundCloud, Mixcloud, Apple, Deezer, Vimeo, Dailymotion, Twitch)', 4000); return null; } return v; };
        const showRes = async q => {
          list.innerHTML = '<div class="note">Buscando…</div>';
          try {
            const rs = await ytSearch(q); if (!rs.length) { list.innerHTML = '<div class="note">Sin resultados.</div><div class="mp-r" id="mpb"><span>◀</span><b>Volver a favoritos</b></div>'; $('#mpb', list).onclick = draw; return; }
            list.innerHTML = '<div class="mp-r" id="mpb"><span>◀</span><b>Volver a favoritos</b></div>' + rs.map((x, i) => `<div class="mp-r mp-v" data-v="${i}">${x.th ? `<img src="${esc(x.th)}" alt="" loading="lazy">` : '<span>🎬</span>'}<div><b>${esc(x.t)}</b><small>${esc(x.ch)}</small></div><button class="mp-x" data-sv="${i}" type="button" aria-label="Guardar en favoritos">★</button></div>`).join('');
            $('#mpb', list).onclick = draw; const link = x => 'https://www.youtube.com/watch?v=' + x.id;
            $$('[data-v]', list).forEach(r => r.onclick = e => { const x = rs[+r.dataset.v]; if (e.target.closest('[data-sv]')) { e.stopPropagation(); toast(fav(link(x), x.t) ? 'Guardado en favoritos' : 'Ya estaba en favoritos'); return; } remember(link(x), x.t); fin(link(x)); });
          } catch (e) { list.innerHTML = `<div class="note">No se pudo buscar (${esc(e.name === 'AbortError' ? 'tarda demasiado' : e.message)}).</div><div class="mp-r" id="mpb"><span>◀</span><b>Volver a favoritos</b></div>`; $('#mpb', list).onclick = draw; }
        };
        const go1 = () => { const v = val(); if (!v) return; if (mediaEmbed(v)) { remember(v); fin(v); } else if (/^https?:\/\//i.test(v)) toast('No reconozco ese enlace (YouTube, Spotify, SoundCloud, Mixcloud, Apple, Deezer, Vimeo, Dailymotion, Twitch)', 4000); else showRes(v); };
        $('#mpg', d).onclick = () => { const v = okv(); if (v) { remember(v); fin(v); } }; $('#mpq', d).onclick = () => { const v = val(); if (v) showRes(v); }; inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go1(); } });
        $('#mps', d).onclick = () => { const v = okv(); if (v) { toast(fav(v) ? 'Guardado en favoritos' : 'Ya estaba en favoritos'); inp.value = ''; draw(); } };
        $('#mpe', d).onclick = () => { const v = okv(); if (v) send(v); };
        $('#mpx', d).onclick = () => fin(null); $('#modal').onclick = e => { if (e.target.id === 'modal') fin(null); };
      });
    });
  }
  /* «Compartir» desde otra app del móvil → LecoAuto (share_target del manifest) */
  function shared() {
    const q = new URLSearchParams(location.search), txt = [q.get('url'), q.get('text'), q.get('title')].filter(Boolean).join(' '); if (!txt) return;
    const m = txt.match(/(https?:\/\/[^\s]+)/i), u = m && m[1];
    if (!u || !mediaEmbed(u)) return; // el resto de enlaces compartidos (PWAs, mapas…) los gestionan otros módulos: no se toca la dirección
    try { history.replaceState(null, '', location.pathname); } catch { }
    dlg(`<h3>🎶 ${esc(nameOf(u))}</h3><div class="note">Enlace compartido. ¿Qué quieres hacer?</div><div class="f"><button class="btn" id="sh1" type="button">▶ Abrir aquí</button><button class="btn" id="sh2" type="button">📲 Enviar al coche</button><button class="btn sec" id="sh3" type="button">⭐ Guardar en favoritos (se sincroniza con el coche)</button></div><div class="acts"><button class="btn sec" id="shx" type="button">Cerrar</button></div>`, d => {
      $('#shx', d).onclick = closeDlg; $('#sh1', d).onclick = () => { closeDlg(); remember(u); const r = mediaEmbed(u); openFloat({ id: 'media-sh', n: r.n, e: '🎶', u: r.u, orig: u, smart: 1 }); };
      $('#sh2', d).onclick = () => { if (send(u)) closeDlg(); }; $('#sh3', d).onclick = () => { toast(fav(u) ? 'Guardado en favoritos' : 'Ya estaba en favoritos'); closeDlg(); };
    });
  }
  setTimeout(shared, 900);
  return { pick, remember, fav, send, nameOf, shared, ytKey, ytKeyDlg, ytSearch };
})();
const mediaPick = () => Media.pick();
CATS.mapa[1].push({ t: 'btn', get l() { return 'Clave de YouTube para buscar (opcional): ' + (Media.ytKey() ? 'configurada' : 'sin clave'); }, f: () => Media.ytKeyDlg() });

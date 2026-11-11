'use strict';
/* Catálogo de apps web recomendadas para abrir en las ventanas flotantes (y en el navegador del Tesla).
   Cada entrada dice con qué método funciona, para no prometer lo que no se ha podido comprobar:
   · propia    → página nuestra (carpeta mini/) que usa APIs abiertas con CORS: no depende de que un tercero permita el iframe.
   · embed     → versión incrustable OFICIAL del servicio (widget/embed documentado por el propio servicio).
   · probar    → sitio normal: puede o no permitir abrirse dentro de otra ventana. SIN VERIFICAR: pruébalo; si sale en blanco, usa ↗.
   · bloquea   → el servicio prohíbe el iframe (cabecera X-Frame-Options/CSP): se abre en pestaña aparte. */

const Cat = (() => {
  const TAGS = {
    propia: ['✅ Propia', 'Hecha por nosotros con datos abiertos: se abre dentro de la ventana sin depender de terceros (necesita internet).'],
    embed: ['🟢 Embed oficial', 'Usa la versión incrustable que el propio servicio ofrece para webs.'],
    probar: ['🟡 Probar', 'Sin verificar: puede que no se abra dentro de la ventana. Si sale en blanco, usa ↗ para abrirla fuera.'],
    bloquea: ['🔴 Se abre fuera', 'El servicio no permite abrirse dentro de otra ventana: se abre en una pestaña.'],
  };
  const LIST = [
    ['Lectura y consulta', [
      { id: 'wikipro', n: 'Wikipedia (lector)', e: '📚', t: 'propia', d: 'Buscar, leer, «cerca de ti» con tu GPS, al azar, letra grande y leer en voz alta. ES/EN.', a: { u: 'mini/wiki.html', k: 'wikipro' } },
    ]],
    ['Tiempo y tráfico', [
      { id: 'rain', n: 'Radar de lluvia', e: '🌧️', t: 'propia', d: 'Radar animado de precipitación (RainViewer) sobre mapa oscuro, centrado donde estás.', a: { u: 'mini/lluvia.html', k: 'rain' } },
      { id: 'windy', n: 'Windy', e: '🌬️', t: 'embed', d: 'Viento, lluvia y temperatura. Embed oficial de Windy.', a: { u: 'https://www.windy.com', k: 'windy' } },
      { id: 'wazemap', n: 'Waze · mapa de tráfico', e: '🚙', t: 'embed', d: 'Mapa en vivo de Waze (embed oficial). Para navegar usa el mapa de esta app.', a: { u: 'https://www.waze.com/live-map', k: 'wazemap' } },
      { id: 'dgt', n: 'DGT · tráfico y cámaras', e: '🚧', t: 'probar', d: 'Incidencias, obras y cámaras de la DGT.', a: { u: 'https://infocar.dgt.es/etraffic/' } },
    ]],
    ['Música, podcasts y vídeo', [
      { id: 'media', n: 'Reproductor por enlace', e: '🎶', t: 'embed', d: 'Pega un enlace de YouTube, Spotify, SoundCloud, Mixcloud, Apple Music/Podcasts, Deezer, Vimeo, Dailymotion o Twitch y se reproduce en la ventana.', a: { u: 'https://youtube.com', k: 'media' } },
      { id: 'yt', n: 'YouTube (enlace)', e: '▶️', t: 'embed', d: 'Pega el enlace de un vídeo o lista.', a: { u: 'https://m.youtube.com', k: 'yt' } },
      { id: 'radio', n: 'Radio Garden', e: '📻', t: 'probar', d: 'Radios de todo el mundo en un globo.', a: { u: 'https://radio.garden' } },
      { id: 'tunein', n: 'TuneIn', e: '🎙️', t: 'probar', d: 'Radios y podcasts.', a: { u: 'https://tunein.com/' } },
      { id: 'pocketcasts', n: 'Pocket Casts (web)', e: '🎧', t: 'probar', d: 'Tus podcasts (necesita cuenta).', a: { u: 'https://play.pocketcasts.com/' } },
    ]],
    ['Coche eléctrico', [
      { id: 'abrp', n: 'A Better Route Planner', e: '⚡', t: 'probar', d: 'Planificador de rutas con paradas de carga para eléctricos.', a: { u: 'https://abetterrouteplanner.com/' } },
      { id: 'plugshare', n: 'PlugShare', e: '🔌', t: 'probar', d: 'Mapa de cargadores con comentarios.', a: { u: 'https://www.plugshare.com/' } },
    ]],
    ['Juegos', [
      { id: 'lichess', n: 'Lichess TV (ajedrez)', e: '♟️', t: 'embed', d: 'Partidas de ajedrez en directo (embed oficial de Lichess TV).', a: { u: 'https://lichess.org/tv/frame?theme=brown&bg=dark', k: 'lichess' } },
      { id: 'lichessweb', n: 'Lichess (jugar)', e: '♞', t: 'probar', d: 'Jugar al ajedrez; la web completa.', a: { u: 'https://lichess.org/' } },
    ]],
    ['Servicios que NO se pueden abrir dentro de una ventana', [
      { id: 'tg', n: 'Telegram Web', e: '✈️', t: 'bloquea', d: 'Telegram envía SAMEORIGIN: no se puede incrustar. Se abre en pestaña.', a: { u: 'https://web.telegram.org/k/', k: 'blocked' } },
    ]],
  ];
  const find = id => { for (const [, l] of LIST) { const x = l.find(y => y.id === id); if (x) return x; } };
  const have = id => { const x = find(id); return (S.apps || []).some(a => a.id === id || (x && x.a.k && x.a.k !== 'blocked' && a.k === x.a.k)); };
  const mk = x => Object.assign({ id: x.id, n: x.n, e: x.e }, x.a);
  function add(id) { const x = find(id); if (!x || have(id)) return false; S.apps.push(mk(x)); save(); if (typeof renderers !== 'undefined' && renderers.apps && page === 'apps') renderers.apps(); bus.emit('apps'); return true; }
  function open() {
    const row = x => `<div class="cat-r" data-id="${esc(x.id)}"><span class="cat-e">${x.e}</span><div class="cat-t"><b>${esc(x.n)}</b> <span class="cat-g cat-${x.t}" title="${esc(TAGS[x.t][1])}">${TAGS[x.t][0]}</span><small>${esc(x.d)}</small></div><div class="cat-b"><button class="btn sec" data-o="${esc(x.id)}" type="button">Abrir</button><button class="btn ${have(x.id) ? 'sec' : ''}" data-a="${esc(x.id)}" type="button" ${have(x.id) ? 'disabled' : ''}>${have(x.id) ? '✓ Añadida' : 'Añadir'}</button></div></div>`;
    dlg(`<h3>Apps recomendadas</h3><div class="note">Cada una indica cómo funciona. <b>Abrir</b> la prueba al momento; <b>Añadir</b> la deja en tu pantalla de Apps.</div><div class="cat-l">${LIST.map(([h, l]) => `<div class="cat-h">${esc(h)}</div>${l.map(row).join('')}`).join('')}</div><div class="acts"><button class="btn sec" id="cx" type="button">Cerrar</button></div>`, d => {
      $('#cx', d).onclick = closeDlg;
      $$('[data-a]', d).forEach(b => b.onclick = () => { if (add(b.dataset.a)) { b.textContent = '✓ Añadida'; b.disabled = true; b.classList.add('sec'); toast('Añadida a Apps'); } });
      $$('[data-o]', d).forEach(b => b.onclick = () => { const x = find(b.dataset.o); closeDlg(); openApp(mk(x), x.t === 'bloquea' ? 'float' : undefined); });
    });
  }
  /* Migración única: el lector de Wikipedia sustituye al sitio móvil (que puede no abrirse en ventana) y se añaden las apps nuevas */
  if (!S.appsV2) {
    const w = S.apps.find(a => a.id === 'wiki'); if (w && /wikipedia\.org/.test(w.u || '')) { w.u = 'mini/wiki.html'; w.k = 'wikipro'; w.n = 'Wikipedia'; }
    ['rain', 'media', 'lichess'].forEach(id => { if (!have(id) && !(id === 'wikipro')) { const x = find(id); if (x) S.apps.push(mk(x)); } });
    S.appsV2 = 1; save();
  }
  const _r = renderers.apps; renderers.apps = () => { _r(); const tb = $('#p-apps .toolbar'); if (tb && !$('#acat', tb)) { const b = el('<button class="btn sec" id="acat" type="button">🛍 Recomendadas</button>'); b.onclick = open; tb.insertBefore(b, $('#aadd', tb)); } };
  ACTIONS.catalog = ['Apps recomendadas', open];
  return { open, add, LIST, TAGS };
})();

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

/* ───────── Reproductor por enlace: pensado para NO escribir en el coche ─────────
   · Favoritos: se guardan en el móvil y viajan al coche con la sincronización de ajustes (S.mediaFavs).
   · Recientes: lo último que has abierto en este dispositivo.
   · Enviar: desde el móvil se manda el enlace al coche por el enlace entre dispositivos (ntfy.sh, mismo código).
   · Compartir: en el móvil, «Compartir» desde YouTube/Spotify/SoundCloud… → LecoAuto (PWA instalada) ofrece abrir, enviar o guardar. */
const Media = (() => {
  const F = () => (S.mediaFavs ||= []), Rc = () => (S.mediaRecent ||= []); // la sincronización puede reemplazar S: siempre se lee con valor por defecto
  const nameOf = u => { const r = mediaEmbed(u); if (!r) return u; let seg = ''; try { const p = new URL(/^https?:/i.test(u) ? u : 'https://' + u).pathname.split('/').filter(Boolean); seg = decodeURIComponent(p[p.length - 1] || '').replace(/[-_]/g, ' '); } catch { } return r.n + (seg && seg.length < 40 ? ' · ' + seg : ''); };
  const remember = u => { S.mediaRecent = [{ u, n: nameOf(u) }, ...Rc().filter(x => x.u !== u)].slice(0, 8); save(); };
  const fav = (u, n) => { if (F().some(x => x.u === u)) return false; F().unshift({ u, n: (n || nameOf(u)).slice(0, 60) }); save(); return true; };
  const send = u => { if (typeof Link === 'undefined' || !Link.valid()) { toast('Primero configura el enlace entre dispositivos: Ajustes → Mapa → «Enlace con D3D Clone / Autoboard-nav»', 5000); return false; } Link.publishMedia(u); toast('Enviado al otro dispositivo'); return true; };
  function pick() {
    return new Promise(res => {
      const row = (ico, x, i, k) => `<div class="mp-r" data-${k}="${i}"><span>${ico}</span><b>${esc(x.n)}</b>${k === 'f' ? `<button class="mp-x" data-df="${i}" type="button" aria-label="Quitar"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 5L19 19M19 5L5 19" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></button>` : ''}</div>`;
      const body = () => (F().length ? '<div class="cat-h">⭐ Favoritos (tócalos para reproducir)</div>' + F().map((x, i) => row('⭐', x, i, 'f')).join('') : '<div class="note">Aún no tienes favoritos. Guárdalos desde el móvil: se sincronizan con el coche y no hay que escribir nada.</div>') + (Rc().length ? '<div class="cat-h">🕘 Recientes</div>' + Rc().map((x, i) => row('🕘', x, i, 'r')).join('') : '');
      dlg(`<h3>🎶 Reproductor</h3><div id="mpl" class="cat-l" style="max-height:34vh"></div><div class="cat-h">Otro enlace</div><div class="adv-ask"><input class="in" id="mpi" placeholder="Escribe o pega un enlace" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn" id="mpg" type="button">▶</button></div>
        <div class="acts"><button class="btn sec" id="mps" type="button">⭐ Guardar</button><button class="btn sec" id="mpe" type="button">📲 Enviar a otro dispositivo</button><button class="btn sec" id="mpx" type="button">Cerrar</button></div>`, d => {
        const list = $('#mpl', d), inp = $('#mpi', d); let done = false; const fin = v => { if (done) return; done = true; closeDlg(); res(v); };
        const draw = () => { list.innerHTML = body(); $$('[data-f]', list).forEach(r => r.onclick = e => { if (e.target.closest('[data-df]')) return; const x = F()[+r.dataset.f]; remember(x.u); fin(x.u); }); $$('[data-r]', list).forEach(r => r.onclick = () => fin(Rc()[+r.dataset.r].u)); $$('[data-df]', list).forEach(b => b.onclick = e => { e.stopPropagation(); F().splice(+b.dataset.df, 1); save(); draw(); }); };
        draw(); const val = () => inp.value.trim(), okv = () => { const v = val(); if (!mediaEmbed(v)) { toast('No reconozco ese enlace (YouTube, Spotify, SoundCloud, Mixcloud, Apple, Deezer, Vimeo, Dailymotion, Twitch)', 4000); return null; } return v; };
        $('#mpg', d).onclick = () => { const v = okv(); if (v) { remember(v); fin(v); } }; inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#mpg', d).click(); } });
        $('#mps', d).onclick = () => { const v = okv(); if (v) { toast(fav(v) ? 'Guardado en favoritos' : 'Ya estaba en favoritos'); inp.value = ''; draw(); } };
        $('#mpe', d).onclick = () => { const v = okv(); if (v) send(v); };
        $('#mpx', d).onclick = () => fin(null); $('#modal').onclick = e => { if (e.target.id === 'modal') fin(null); };
      });
    });
  }
  /* «Compartir» desde otra app del móvil → LecoAuto (share_target del manifest) */
  function shared() {
    const q = new URLSearchParams(location.search), txt = [q.get('url'), q.get('text'), q.get('title')].filter(Boolean).join(' '); if (!txt) return;
    const m = txt.match(/(https?:\/\/[^\s]+)/i), u = m && m[1]; try { history.replaceState(null, '', location.pathname); } catch { }
    if (!u) return; if (!mediaEmbed(u)) return; // los enlaces de mapas/ubicaciones los gestiona el mapa
    dlg(`<h3>🎶 ${esc(nameOf(u))}</h3><div class="note">Enlace compartido. ¿Qué quieres hacer?</div><div class="f"><button class="btn" id="sh1" type="button">▶ Abrir aquí</button><button class="btn" id="sh2" type="button">📲 Enviar al coche</button><button class="btn sec" id="sh3" type="button">⭐ Guardar en favoritos (se sincroniza con el coche)</button></div><div class="acts"><button class="btn sec" id="shx" type="button">Cerrar</button></div>`, d => {
      $('#shx', d).onclick = closeDlg; $('#sh1', d).onclick = () => { closeDlg(); remember(u); const r = mediaEmbed(u); openFloat({ id: 'media-sh', n: r.n, e: '🎶', u: r.u, orig: u, smart: 1 }); };
      $('#sh2', d).onclick = () => { if (send(u)) closeDlg(); }; $('#sh3', d).onclick = () => { toast(fav(u) ? 'Guardado en favoritos' : 'Ya estaba en favoritos'); closeDlg(); };
    });
  }
  setTimeout(shared, 900);
  return { pick, remember, fav, send, nameOf, shared };
})();
const mediaPick = () => Media.pick();

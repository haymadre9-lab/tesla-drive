'use strict';
/* Música online dentro de la PWA (no hace falta abrir apps): Spotify, Tidal, YouTube, Apple Music, SoundCloud y Deezer
   mediante sus reproductores incrustables oficiales, y radio por internet con el directorio abierto Radio Browser. */

const Stream = (() => {
  S.stream ||= { tab: 'radio', cur: {}, fav: {}, radios: [], cc: '' };
  const ST = () => S.stream;
  const SV = [['radio', '📻', 'Radio'], ['spotify', '🟢', 'Spotify'], ['tidal', '🌊', 'Tidal'], ['youtube', '▶️', 'YouTube'], ['apple', '🍎', 'Apple'], ['soundcloud', '☁️', 'SoundCloud'], ['deezer', '🎧', 'Deezer']];
  const NAME = Object.fromEntries(SV.map(([k, , n]) => [k, n])), ICON = Object.fromEntries(SV.map(([k, i]) => [k, i]));

  /* Enlace normal → reproductor incrustable oficial */
  const EMB = {
    spotify: u => { const m = u.match(/open\.spotify\.com\/(?:intl-\w+\/)?(track|album|playlist|episode|show|artist)\/(\w+)/); return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?theme=0` : null; },
    tidal: u => { const m = u.match(/tidal\.com\/(?:browse\/)?(track|album|playlist|video)\/([\w-]+)/); return m ? `https://embed.tidal.com/${m[1]}s/${m[2]}` : null; },
    youtube: u => { const id = (u.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/) || [])[1], list = (u.match(/[?&]list=([\w-]+)/) || [])[1]; return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0${list ? '&list=' + list : ''}` : list ? `https://www.youtube-nocookie.com/embed/videoseries?list=${list}` : null; },
    apple: u => /music\.apple\.com\//.test(u) ? u.replace('://music.apple.com', '://embed.music.apple.com') : null,
    soundcloud: u => /soundcloud\.com\//.test(u) ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(u)}&color=%23ff5500&auto_play=false&visual=true` : null,
    deezer: u => { const m = u.match(/deezer\.com\/(?:\w\w\/)?(track|album|playlist|artist)\/(\d+)/); return m ? `https://widget.deezer.com/widget/dark/${m[1]}/${m[2]}` : null; },
  };

  /* ── Radio por internet (Radio Browser) ── */
  const RAD = { a: new Audio(), st: null, list: [], mode: 'fav', q: '', busy: false, err: '', manage: false };
  RAD.a.preload = 'none';
  const RB = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info'];
  async function rb(path) {
    for (const b of RB) { try { const c = new AbortController(), t = setTimeout(() => c.abort(), 9000); const r = await fetch(b + path, { signal: c.signal }); clearTimeout(t); if (r.ok) return await r.json(); } catch { } }
    throw new Error('rb');
  }
  const cc = () => ST().cc === '*' ? '' : (ST().cc || ((navigator.language || 'es-ES').split('-')[1] || 'ES')).toUpperCase();
  async function search(q) {
    RAD.busy = true; RAD.err = ''; RAD.mode = 'res'; refresh();
    try {
      const p = new URLSearchParams({ limit: '120', hidebroken: 'true', order: 'clickcount', reverse: 'true' }); if (q) p.set('name', q); if (cc()) p.set('countrycode', cc());
      const j = await rb('/json/stations/search?' + p);
      RAD.list = j.filter(s => /^https:/i.test(s.url_resolved || '')).slice(0, 60).map(s => ({ id: s.stationuuid, n: (s.name || '').trim() || 'Emisora', u: s.url_resolved, logo: /^https:/.test(s.favicon || '') ? s.favicon : '', c: s.countrycode || '', tags: (s.tags || '').split(',').filter(Boolean).slice(0, 2).join(', '), br: s.bitrate || 0 }));
      if (!RAD.list.length) RAD.err = 'Sin resultados con emisión segura (https). Prueba con otro nombre o país.';
    } catch { RAD.err = 'No se pudo conectar con el directorio de radios (necesita conexión).'; }
    RAD.busy = false; refresh();
  }
  function play(s) {
    RAD.st = s; if (!audio.paused) audio.pause(); RAD.a.src = s.u; RAD.a.play().catch(() => toast('No se pudo reproducir esta emisora'));
    if ('mediaSession' in navigator) { try { navigator.mediaSession.metadata = new MediaMetadata({ title: s.n, artist: 'Radio', artwork: s.logo ? [{ src: s.logo, sizes: '96x96' }] : [] }); } catch { } }
    refresh();
  }
  const isFav = s => ST().radios.some(r => r.id === s.id);
  function toggleFav(s) { const l = ST().radios; const i = l.findIndex(r => r.id === s.id); if (i >= 0) l.splice(i, 1); else l.push({ id: s.id, n: s.n, u: s.u, logo: s.logo, c: s.c, tags: s.tags, br: s.br }); save(); refresh(); }
  ['play', 'pause', 'error', 'playing', 'waiting', 'ended'].forEach(ev => RAD.a.addEventListener(ev, () => { if (ev === 'error' && RAD.st) toast('No se pudo reproducir «' + RAD.st.n + '»'); refresh(); }));
  audio.addEventListener('play', () => { if (!RAD.a.paused) RAD.a.pause(); });
  if ('mediaSession' in navigator) { try { navigator.mediaSession.setActionHandler('play', () => (RAD.st && audio.paused ? RAD.a.play() : audio.play())); navigator.mediaSession.setActionHandler('pause', () => { RAD.a.pause(); audio.pause(); }); } catch { } }

  /* ── Interfaz ── */
  const refresh = () => $$('.js-stmw').forEach(draw);
  function draw(el) {
    const tab = ST().tab, np = tab === 'radio' && RAD.st;
    el.innerHTML = `<div class="stm"><div class="stm-tabs">${SV.map(([k, i, n]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}" title="${n}"><span>${i}</span><i>${n}</i></button>`).join('')}</div><div class="stm-body"></div>
      ${np ? `<div class="stm-np"><div class="np-i">${RAD.st.logo ? `<img src="${esc(RAD.st.logo)}" alt="" onerror="this.remove()">` : '📻'}</div><div class="np-t"><b>${esc(RAD.st.n)}</b><small>${RAD.a.paused ? 'En pausa' : RAD.a.readyState < 3 ? 'Conectando…' : '▶ En directo'}</small></div><button data-a="pp" title="Reproducir / pausar">${RAD.a.paused ? '▶' : '⏸'}</button><button data-a="stop" title="Parar">⏹</button><input type="range" data-a="vol" min="0" max="1" step="0.05" value="${RAD.a.volume}"></div>` : ''}</div>`;
    $$('.stm-tabs button', el).forEach(b => b.onclick = () => { ST().tab = b.dataset.t; save(); refresh(); });
    const body = $('.stm-body', el); tab === 'radio' ? drawRadio(body) : drawEmb(body, tab);
    const pp = $('[data-a=pp]', el); if (pp) pp.onclick = () => (RAD.a.paused ? RAD.a.play() : RAD.a.pause());
    const sp = $('[data-a=stop]', el); if (sp) sp.onclick = () => { RAD.a.pause(); RAD.a.removeAttribute('src'); RAD.st = null; refresh(); };
    const vo = $('[data-a=vol]', el); if (vo) vo.oninput = () => { RAD.a.volume = +vo.value; };
  }
  function drawRadio(body) {
    const favs = ST().radios, list = RAD.mode === 'fav' ? favs : RAD.list, CCS = ['', 'ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'US', 'GB', 'FR', 'DE', 'IT', 'PT', 'BR', '*'];
    body.innerHTML = `<div class="rd-top"><input class="in" id="rq" type="search" placeholder="Buscar emisora…" value="${esc(RAD.q)}"><button class="btn" id="rgo">🔍</button><select id="rcc" title="País">${CCS.map(c => `<option value="${c}" ${(ST().cc || '') === c ? 'selected' : ''}>${c === '' ? 'Mi país (' + cc() + ')' : c === '*' ? 'Todo el mundo' : c}</option>`).join('')}</select></div>
      <div class="rd-sub"><button data-m="fav" class="${RAD.mode === 'fav' ? 'on' : ''}">⭐ Favoritas (${favs.length})</button><button data-m="top" class="${RAD.mode !== 'fav' ? 'on' : ''}">🔥 Populares / resultados</button></div>
      <div class="rd-list">${RAD.busy ? '<div class="note">Cargando…</div>' : RAD.err && RAD.mode !== 'fav' ? `<div class="note">${esc(RAD.err)}</div>` : !list.length ? `<div class="note">${RAD.mode === 'fav' ? 'Aún no tienes favoritas. Pulsa 🔥 Populares o busca una emisora y marca la ⭐.' : 'Pulsa 🔍 para buscar o ver las más populares.'}</div>` : list.map((s, i) => `<div class="rd-i ${RAD.st && RAD.st.id === s.id ? 'cur' : ''}" data-i="${i}"><div class="rd-l">${s.logo ? `<img src="${esc(s.logo)}" alt="" loading="lazy" onerror="this.remove()">` : '📻'}</div><div class="rd-t"><b>${esc(s.n)}</b><small>${esc([s.tags, s.c, s.br ? s.br + ' kbps' : ''].filter(Boolean).join(' · '))}</small></div><button data-p title="Reproducir">▶</button><button data-f title="Favorita" class="${isFav(s) ? 'on' : ''}">${isFav(s) ? '★' : '☆'}</button></div>`).join('')}</div>`;
    const go1 = () => { RAD.q = $('#rq', body).value.trim(); search(RAD.q); };
    $('#rgo', body).onclick = go1; $('#rq', body).onkeydown = e => { if (e.key === 'Enter') go1(); };
    $('#rcc', body).onchange = e => { ST().cc = e.target.value; save(); search(RAD.q); };
    $$('.rd-sub button', body).forEach(b => b.onclick = () => { if (b.dataset.m === 'fav') { RAD.mode = 'fav'; refresh(); } else if (RAD.list.length && RAD.mode === 'fav') { RAD.mode = 'res'; refresh(); } else search(RAD.q); });
    $$('.rd-i', body).forEach(r => { const s = list[+r.dataset.i]; $('[data-p]', r).onclick = () => play(s); $('[data-f]', r).onclick = () => toggleFav(s); r.querySelector('.rd-t').onclick = () => play(s); });
  }
  async function pasteLink(svc) {
    const t = await Ed.paste(), u = Ed.urlFrom(t) || t; if (!u) return;
    if (!EMB[svc](u)) return toast('Ese enlace no parece de ' + NAME[svc] + '. Copia el enlace de «Compartir» de una canción, álbum o lista.', 4500);
    ST().cur[svc] = u; save(); refresh();
  }
  function drawEmb(body, svc) {
    const url = ST().cur[svc], emb = url && EMB[svc](url), favs = (ST().fav[svc] ||= []);
    body.innerHTML = `${emb ? `<iframe src="${esc(emb)}" allow="autoplay; encrypted-media; clipboard-write; fullscreen" referrerpolicy="no-referrer-when-downgrade"></iframe>` : `<div class="stm-empty"><div class="big">${ICON[svc]}</div><p>Pega el enlace de una canción, álbum o lista de <b>${NAME[svc]}</b> y se reproduce aquí, sin abrir la app.</p><button class="btn" data-a="paste">📋 Pegar enlace</button></div>`}
      <div class="stm-bar"><button data-a="paste">📋 Pegar enlace</button>${emb ? '<button data-a="fav">⭐ Guardar en mis listas</button><button data-a="open">↗ Abrir fuera</button><button data-a="clear">✕ Quitar</button>' : ''}${favs.length ? `<button data-a="manage" class="${RAD.manage ? 'on' : ''}">🗑</button>` : ''}</div>
      ${favs.length ? `<div class="stm-fav">${favs.map((f, i) => `<span class="chip" data-i="${i}">${ICON[svc]} ${esc(f.n)}${RAD.manage ? ' <b data-x>✕</b>' : ''}</span>`).join('')}</div>` : ''}`;
    $$('[data-a=paste]', body).forEach(b => b.onclick = () => pasteLink(svc));
    const g = a => $(`[data-a=${a}]`, body);
    if (g('fav')) g('fav').onclick = async () => { const n = await promptDlg('Nombre para guardar', 'Mi lista', ''); if (n) { favs.push({ n, u: url }); save(); refresh(); } };
    if (g('open')) g('open').onclick = () => window.open(url, '_blank', 'noopener');
    if (g('clear')) g('clear').onclick = () => { delete ST().cur[svc]; save(); refresh(); };
    if (g('manage')) g('manage').onclick = () => { RAD.manage = !RAD.manage; refresh(); };
    $$('.stm-fav .chip', body).forEach(c => c.onclick = e => { const i = +c.dataset.i; if (e.target.closest('[data-x]')) { favs.splice(i, 1); save(); refresh(); } else { ST().cur[svc] = favs[i].u; save(); refresh(); } });
  }
  WIDGETS.stream = {
    n: 'Música online y radio', cls: 'w-2x2', render: el => {
      el.classList.add('js-stmw', 'stmcard'); draw(el);
      if (ST().tab === 'radio' && !RAD.list.length && !ST().radios.length && !RAD.busy && !RAD.auto) { RAD.auto = true; search(''); }
      else if (ST().tab === 'radio' && !ST().radios.length) RAD.mode = 'res';
    },
  };
  return { search, play, EMB, RAD, refresh };
})();

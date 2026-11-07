'use strict';
/* Sincronización de la configuración: móvil → GitHub (config.json) → pantalla del coche.
   También recibe enlaces compartidos desde el móvil ("Compartir" → LecoAuto) para crear apps o ventanas. */

const Sync = (() => {
  const LOCAL = ['lastPos', 'maxSpeed', 'trip', 'tripT', 'reports', 'recent', 'navRecent', 'last', 'cfgRev', 'cfgSeen', 'city'];
  const cl = o => JSON.parse(JSON.stringify(o));
  const gh = () => { try { return JSON.parse(localStorage.getItem('leco.gh') || '{}'); } catch { return {}; } };
  const setGh = o => { try { localStorage.setItem('leco.gh', JSON.stringify(Object.assign(gh(), o))); } catch { toast('No se pudo guardar en este dispositivo'); } };
  const guessRepo = () => { const m = location.hostname.match(/^(.+)\.github\.io$/), p = location.pathname.split('/')[1]; return m && p && !/\.\w+$/.test(p) ? `${m[1]}/${p}` : ''; };
  const b64 = s => btoa(unescape(encodeURIComponent(s)));
  const unb64 = s => decodeURIComponent(escape(atob(s.replace(/\s/g, ''))));

  function build(rev) { const s = cl(S); LOCAL.forEach(k => delete s[k]); return { app: 'lecoauto-pwa', v: 2, rev, updated: new Date().toISOString(), settings: s }; }
  function apply(cfg) {
    const keep = {}; LOCAL.forEach(k => { keep[k] = S[k]; });
    S = Object.assign(structuredClone(DEF), keep, cfg.settings, { cfgRev: cfg.rev || 0 }); save(); location.reload();
  }
  const valid = j => j && j.app === 'lecoauto-pwa' && j.settings && typeof j.settings === 'object';

  /* Al abrir: ¿hay una configuración más nueva publicada? */
  async function check(force) {
    const url = (S.syncUrl || 'config.json') + ((S.syncUrl || 'config.json').includes('?') ? '&' : '?') + 'ts=' + Date.now();
    try {
      const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) { if (force) toast('No hay config.json publicado todavía'); return; }
      const j = await r.json(); if (!valid(j)) { if (force) toast('config.json no es válido'); return; }
      if (!(j.rev > (S.cfgRev || 0))) { if (force) toast('Ya tienes la última configuración (rev ' + (S.cfgRev || 0) + ')'); return; }
      const mode = S.syncMode || 'ask';
      if (force || mode === 'auto') return apply(j);
      if (mode === 'off' || (S.cfgSeen || 0) >= j.rev) return;
      dlg(`<h3>☁️ Configuración nueva</h3><div class="note">Se publicó la configuración nº ${j.rev} (${esc((j.updated || '').slice(0, 16).replace('T', ' '))}). ¿Aplicarla en este dispositivo? Se cambiarán dashboards, ventanas, iconos y ajustes.</div><div class="acts"><button class="btn sec" id="sn" type="button">Ahora no</button><button class="btn" id="sy" type="button">Aplicar</button></div>`, d => {
        $('#sn', d).onclick = () => { S.cfgSeen = j.rev; save(); closeDlg(); }; $('#sy', d).onclick = () => apply(j);
      });
    } catch { if (force) toast('Sin conexión'); }
  }

  /* Publicar en GitHub desde el móvil */
  async function publish() {
    const g = gh(), repo = (g.repo || guessRepo()).trim(), branch = g.branch || 'main', path = g.path || 'config.json';
    if (!repo || !g.token) return toast('Falta el repositorio o el token de GitHub');
    const H = { Authorization: 'Bearer ' + g.token, Accept: 'application/vnd.github+json' }, api = `https://api.github.com/repos/${repo}/contents/${path}`;
    toast('Publicando…', 8000);
    try {
      let sha, remoteRev = 0; const r = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers: H });
      if (r.ok) { const j = await r.json(); sha = j.sha; try { remoteRev = JSON.parse(unb64(j.content)).rev || 0; } catch { } }
      else if (r.status !== 404) throw Object.assign(new Error('get'), { status: r.status });
      const rev = Math.max(remoteRev, S.cfgRev || 0) + 1, body = JSON.stringify(build(rev), null, 1);
      const p = await fetch(api, { method: 'PUT', headers: H, body: JSON.stringify({ message: `Configuración desde el dispositivo (rev ${rev})`, content: b64(body), branch, ...(sha ? { sha } : {}) }) });
      if (!p.ok) throw Object.assign(new Error('put'), { status: p.status });
      S.cfgRev = rev; S.cfgSeen = rev; save(); toast(`Publicado (rev ${rev}). El coche la verá en 1–2 minutos`, 5000);
    } catch (e) {
      toast(e.status === 401 ? 'Token no válido o caducado' : e.status === 403 || e.status === 404 ? 'Sin permiso o repositorio no encontrado (revisa el token y el repo)' : e.status === 409 ? 'Conflicto: vuelve a intentarlo' : 'No se pudo publicar (sin conexión?)', 5000);
    }
  }

  const copyText = async t => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };
  function importText(t) {
    try { const j = JSON.parse(t); if (!valid(j)) throw 0; dlg(`<h3>Importar configuración</h3><div class="note">Se reemplazarán dashboards, ventanas, iconos y ajustes de este dispositivo (nº ${j.rev || 0}).</div><div class="acts"><button class="btn sec" id="ic" type="button">Cancelar</button><button class="btn" id="ik" type="button">Importar</button></div>`, d => { $('#ic', d).onclick = closeDlg; $('#ik', d).onclick = () => apply(j); }); }
    catch { toast('El texto no es una configuración válida'); }
  }

  function panel() {
    const w = el('<div></div>'), g = gh();
    const field = (label, id, val, type = 'text', ph = '') => `<label class="lab">${label}<input class="in" id="${id}" type="${type}" value="${esc(val || '')}" placeholder="${esc(ph)}" autocomplete="off"></label>`;
    w.append(el(`<div class="note"><b>Cómo funciona:</b> configura todo en el móvil (iconos, ventanas, dashboards) y pulsa <b>Publicar en GitHub</b>. La pantalla del coche carga <code>config.json</code> al abrir y te pregunta si aplicarlo. Sin escribir direcciones en el coche.</div>`));
    const st = el(`<div class="row"><div class="tx"><b>Estado</b><small>Versión local: ${S.cfgRev || 0}</small></div><button class="btn sec" id="spull" type="button">⬇ Traer del repositorio</button></div>`);
    $('#spull', st).onclick = () => check(true); w.append(st);
    w.append(el('<div class="sec-t">Publicar desde este dispositivo</div>'));
    const f = el(`<div class="row" style="flex-direction:column;align-items:stretch">${field('Repositorio (usuario/nombre)', 'gr', g.repo || guessRepo(), 'text', 'usuario/repositorio')}${field('Rama', 'gb', g.branch || 'main')}${field('Token de GitHub (solo se guarda en este dispositivo)', 'gt', g.token, 'password', 'github_pat_…')}
      <div class="note">Crea un token en GitHub → Settings → Developer settings → <b>Fine-grained tokens</b>: solo este repositorio, permiso <b>Contents: Read and write</b>. No lo compartas con nadie.</div>
      <div class="inline"><button class="btn sec" id="gsave" type="button">Guardar datos</button><button class="btn" id="gpub" type="button">⬆ Publicar en GitHub</button></div></div>`);
    $('#gsave', f).onclick = () => { setGh({ repo: $('#gr', f).value.trim(), branch: $('#gb', f).value.trim() || 'main', token: $('#gt', f).value.trim() }); toast('Guardado en este dispositivo'); };
    $('#gpub', f).onclick = () => { setGh({ repo: $('#gr', f).value.trim(), branch: $('#gb', f).value.trim() || 'main', token: $('#gt', f).value.trim() }); publish(); }; w.append(f);
    w.append(el('<div class="sec-t">En esta pantalla (coche)</div>'));
    const m = el(`<div class="row"><div class="tx"><b>Al abrir la app</b><small>Qué hacer si hay una configuración nueva publicada</small></div><select id="sm">${[['ask', 'Preguntar'], ['auto', 'Aplicar automáticamente'], ['off', 'No comprobar']].map(([v, l]) => `<option value="${v}" ${(S.syncMode || 'ask') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`);
    $('#sm', m).onchange = e => { S.syncMode = e.target.value; save(); }; w.append(m);
    w.append(el(`<div class="row" style="flex-direction:column;align-items:stretch">${field('Dirección de config.json (opcional; para el APK)', 'su', S.syncUrl || '', 'text', 'https://usuario.github.io/repo/config.json')}</div>`));
    $('#su', w).onchange = e => { S.syncUrl = e.target.value.trim(); save(); };
    w.append(el('<div class="sec-t">Sin GitHub: copiar y pegar</div>'));
    const c = el('<div class="inline"><button class="btn sec" id="cc" type="button">📋 Copiar configuración</button><button class="btn sec" id="cd" type="button">⬇ Descargar config.json</button><button class="btn sec" id="ci" type="button">📥 Importar del portapapeles</button><button class="btn sec" id="cf" type="button">📂 Importar archivo</button></div>');
    $('#cc', c).onclick = async () => toast((await copyText(JSON.stringify(build((S.cfgRev || 0) + 1), null, 1))) ? 'Configuración copiada' : 'No se pudo copiar: usa Descargar');
    $('#cd', c).onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(build((S.cfgRev || 0) + 1), null, 1)], { type: 'application/json' })); a.download = 'config.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    $('#ci', c).onclick = async () => { const t = await Ed.paste(); if (t) importText(t); };
    $('#cf', c).onclick = () => $('#fileCfg').click(); w.append(c);
    w.append(el('<div class="note">Para subirlo a mano: guarda el archivo como <code>config.json</code> en la raíz del repositorio (Add file → Upload files).</div>'));
    return w;
  }
  const _sr1 = settingRow;
  settingRow = function (it) { return it.t === 'sync' ? panel() : _sr1(it); }; // eslint-disable-line no-func-assign
  CATS.sync = ['☁️ Sincronizar', [{ t: 'sync' }]]; { const a = CATS.acerca; delete CATS.acerca; CATS.acerca = a; }

  /* Enlace compartido desde el móvil ("Compartir" → LecoAuto) */
  function incoming() {
    const q = new URLSearchParams(location.search), u = Ed.urlFrom(q.get('url') || '') || Ed.urlFrom(q.get('text') || ''); if (!u) return;
    const title = (q.get('title') || '').trim(); history.replaceState(null, '', location.pathname);
    dlg(`<h3>🔗 Enlace recibido</h3><div class="note" style="word-break:break-all">${esc(u)}</div><div class="f"><button class="btn" id="r1" type="button">＋ Añadir como app</button><button class="btn sec" id="r2" type="button">▢ Ponerlo en una ventana del dashboard</button><button class="btn sec" id="r3" type="button">🗺 Guardar como mapa</button></div><div class="acts"><button class="btn sec" id="rc" type="button">Cancelar</button></div>`, d => {
      $('#rc', d).onclick = closeDlg; $('#r1', d).onclick = () => { closeDlg(); Ed.appEditor(null, { u, n: title || Ed.hostOf(u).replace(/^www\./, '') }); }; $('#r2', d).onclick = () => { closeDlg(); go('home'); Win.useUrl(u, title); }; $('#r3', d).onclick = () => { closeDlg(); Maps.edit(null, { u, n: title || Ed.hostOf(u).replace(/^www\./, '') }); };
    });
  }
  addEventListener('DOMContentLoaded', () => { setTimeout(() => { incoming(); check(); }, 900); });
  return { check, publish, build, apply, panel };
})();

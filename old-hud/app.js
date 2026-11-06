// ════════════════════════════════════════════════════════════════════════
//  UsoEmbsa PWA — lógica principal
//  Backend: Supabase (mismo que la app Android)
// ════════════════════════════════════════════════════════════════════════
'use strict';

const CFG = window.USOEMBSA_CONFIG;
const ICONS = window.ICONS;
const app = document.getElementById('app');

// ─────────────────────────── Supabase mini-cliente ──────────────────────
const SB = {
  headers() {
    return {
      'apikey': CFG.SUPABASE_KEY,
      'Authorization': 'Bearer ' + CFG.SUPABASE_KEY,
      'Content-Type': 'application/json',
    };
  },
  async select(table, query='') {
    const url = `${CFG.SUPABASE_URL}/rest/v1/${table}` + (query ? `?${query}` : '');
    const r = await fetch(url, { headers: this.headers() });
    if (!r.ok) throw new Error(`GET ${table}: ${r.status}`);
    return r.json();
  },
  async insert(table, payload) {
    const url = `${CFG.SUPABASE_URL}/rest/v1/${table}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { ...this.headers(), 'Prefer': 'return=representation' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`POST ${table}: ${r.status} ${await r.text()}`);
    return r.json();
  },
  async del(table, query) {
    const url = `${CFG.SUPABASE_URL}/rest/v1/${table}?${query}`;
    const r = await fetch(url, { method: 'DELETE', headers: this.headers() });
    if (!r.ok) throw new Error(`DELETE ${table}: ${r.status}`);
  },
  async rpc(fn, payload) {
    const url = `${CFG.SUPABASE_URL}/rest/v1/rpc/${fn}`;
    const r = await fetch(url, { method: 'POST', headers: this.headers(), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error(`RPC ${fn}: ${r.status}`);
    return r.text();
  },
  async uploadFile(path, file, contentType) {
    const url = `${CFG.SUPABASE_URL}/storage/v1/object/${CFG.STORAGE_BUCKET}/${path}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'apikey': CFG.SUPABASE_KEY, 'Authorization': 'Bearer ' + CFG.SUPABASE_KEY,
                 'Content-Type': contentType, 'x-upsert': 'true' },
      body: file,
    });
    if (!r.ok) throw new Error(`UPLOAD: ${r.status} ${await r.text()}`);
    return `${CFG.SUPABASE_URL}/storage/v1/object/public/${CFG.STORAGE_BUCKET}/${path}`;
  },
  async askAi(question) {
    const url = `${CFG.SUPABASE_URL}/functions/v1/preguntar-convenio`;
    const r = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ question }) });
    const data = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
    return data.answer;
  },
  // Carpetas personalizadas
  async getFolders() {
    return this.select('custom_folders', 'select=*&order=created_at.asc');
  },
  async createFolder(title) {
    const key = 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    return this.insert('custom_folders', { cat_key:key, title });
  },
  async deleteFolder(id, catKey) {
    // Borra la carpeta y todo su contenido asociado
    await this.del('content_items', `category=eq.${encodeURIComponent(catKey)}`).catch(()=>{});
    await this.del('custom_folders', `id=eq.${id}`);
  },
};

// ─────────────────────────── Auth (localStorage) ────────────────────────
const Auth = {
  get matricula() { return localStorage.getItem('matricula') || ''; },
  set matricula(v) { localStorage.setItem('matricula', v); },
  get deviceId() {
    let id = localStorage.getItem('deviceId');
    if (!id) { id = 'web-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
               localStorage.setItem('deviceId', id); }
    return id;
  },
  get isLogged() { return !!this.matricula; },
  get isAdmin() { return this.matricula === CFG.PERMANENT_MATRICULA; },
  // Modo gestión: se desbloquea al entrar en Privado con la contraseña.
  // Dura toda la sesión (hasta cerrar sesión). Guardado en sessionStorage
  // para que no persista entre cierres completos de la app.
  get manageMode() { return sessionStorage.getItem('manage') === '1'; },
  set manageMode(v) { if(v) sessionStorage.setItem('manage','1'); else sessionStorage.removeItem('manage'); },
  checkPrivadoPassword(pw) { return pw === CFG.PRIVADO_PASSWORD; },
  logout() { localStorage.removeItem('matricula'); sessionStorage.removeItem('manage'); },
};

// ─────────────────────────── Categorías ─────────────────────────────────
const CALENDAR_SUBS = [
  { key:'calendarios_100', label:'Línea 100' },
  { key:'calendarios_3198', label:'Línea 3198' },
  { key:'calendarios_50', label:'Línea 50' },
  { key:'calendarios_sae', label:'SAE' },
  { key:'calendarios_inspeccion', label:'Inspección' },
  { key:'calendarios_z', label:'Zona' },
  { key:'calendarios_interinis', label:'Interinidad' },
];

const MENU = [
  { cat:'convenio',   title:'Convenio',  icon:'convenio',   color:'var(--azul)' },
  { cat:'calendarios',title:'Calendarios',icon:'calendarios',color:'var(--verde)' },
  { cat:'actas',      title:'Actas',     icon:'actas',      color:'var(--naranja)' },
  { cat:'contactos',  title:'Contactos', icon:'contactos',  color:'var(--teal)' },
  { cat:'pic',        title:'Bus y Avería',icon:'pic',      color:'var(--violeta)' },
  { cat:'quejas',     title:'Quejas y sugerencias',icon:'quejas',color:'var(--rojo)' },
  { cat:'privado',    title:'Privado',   icon:'privado',    color:'var(--gris)', auth:true },
];

const CAT_META = {
  convenio:{name:'CONVENIO',icon:'convenio',color:'var(--azul)'},
  calendarios:{name:'CALENDARIOS',icon:'calendarios',color:'var(--verde)'},
  actas:{name:'ACTAS',icon:'actas',color:'var(--naranja)'},
  contactos:{name:'CONTACTOS',icon:'contactos',color:'var(--teal)'},
  pic:{name:'BUS Y AVERÍA',icon:'pic',color:'var(--violeta)'},
  quejas:{name:'QUEJAS',icon:'quejas',color:'var(--rojo)'},
  privado:{name:'PRIVADO',icon:'privado',color:'var(--gris)'},
};

// ─────────────────────────── Utilidades UI ──────────────────────────────
function el(html){ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstChild; }
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2600); }
function esc(s){ return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function nowStr(){ const d=new Date(); const p=n=>String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; }
function catLabel(cat){ if(cat.startsWith('calendarios')) return 'CALENDARIOS';
  return (CAT_META[cat]||{name:cat.toUpperCase()}).name; }
function catIcon(cat){ if(cat.startsWith('calendarios')) return 'calendarios';
  return (CAT_META[cat]||{icon:'contactos'}).icon; }

// ¿Puede el usuario AÑADIR contenido en esta categoría?
//  - Quejas y Bus/Avería: cualquiera (buzones abiertos)
//  - Resto: solo en modo gestión (contraseña de Privado)
function canAdd(cat){
  if (cat === 'quejas' || cat === 'pic') return true;
  return Auth.manageMode;
}

// ¿Puede el usuario BORRAR contenido en esta categoría?
//  - Borrar SIEMPRE requiere modo gestión, en todas las secciones.
function canDelete(cat){
  return Auth.manageMode;
}

// Compatibilidad: canManage = puede añadir (se usa para mostrar el botón +)
function canManage(cat){ return canAdd(cat); }

// ─────────────────────────── Router ─────────────────────────────────────
const routes = {};
function route(name, fn){ routes[name]=fn; }
function go(name, params){ location.hash = '#'+name + (params?('/'+encodeURIComponent(JSON.stringify(params))):''); }
function render(node){ app.innerHTML=''; app.appendChild(node); }

window.addEventListener('hashchange', handleRoute);
function handleRoute(){
  const raw = location.hash.slice(1) || 'main';
  const [name, paramStr] = raw.split('/');
  if (!Auth.isLogged && name !== 'login') { return go('login'); }
  const fn = routes[name] || routes['main'];
  let params = null;
  if (paramStr) { try { params = JSON.parse(decodeURIComponent(paramStr)); } catch(e){} }
  fn(params);
}

// ─────────────────────────── Pantalla LOGIN ─────────────────────────────
route('login', () => {
  const node = el(`<div class="screen"><div class="login">
    <div class="biglogo"><span></span></div>
    <h2>USO <i style="font-style:italic;color:var(--rojo)">emb</i></h2>
    <p>Introduce tu matrícula para entrar</p>
    <input id="mat" inputmode="numeric" placeholder="Matrícula" autocomplete="off">
    <div class="err" id="loginErr"></div>
    <button class="btn" id="enterBtn">Entrar</button>
  </div></div>`);
  render(node);
  const inp = node.querySelector('#mat');
  const err = node.querySelector('#loginErr');
  const btn = node.querySelector('#enterBtn');
  inp.focus();
  const submit = async () => {
    const val = inp.value.trim();
    if (!val) { err.textContent='Escribe tu matrícula.'; return; }
    btn.disabled=true; err.textContent=''; btn.innerHTML='<span class="spinner"></span>';
    try {
      // PIN de emergencia
      if (val === CFG.EMERGENCY_PIN) {
        await SB.rpc('claim_matricula', { p_matricula: CFG.PERMANENT_MATRICULA, p_device_id: Auth.deviceId }).catch(()=>{});
        Auth.matricula = CFG.PERMANENT_MATRICULA;
        return go('main');
      }
      const key = val.toUpperCase();
      // Validar permitida
      const allowed = await SB.select('matriculas_allowed', `matricula=eq.${encodeURIComponent(key)}&select=matricula`);
      const isPermanent = key === CFG.PERMANENT_MATRICULA;
      if (!allowed.length && !isPermanent) { err.textContent='Matrícula no autorizada.'; return; }
      // Reclamar
      const res = (await SB.rpc('claim_matricula', { p_matricula:key, p_device_id:Auth.deviceId })).trim();
      if (res === 'true' || isPermanent) { Auth.matricula = key; go('main'); }
      else err.textContent='Esa matrícula ya está en uso en otro dispositivo.';
    } catch(e) {
      err.textContent = 'Error de conexión. Revisa tu internet.';
      console.error(e);
    } finally { btn.disabled=false; btn.textContent='Entrar'; }
  };
  btn.onclick = submit;
  inp.onkeydown = e => { if(e.key==='Enter') submit(); };
});

// ─────────────────────────── Pantalla PRINCIPAL ─────────────────────────
route('main', async () => {
  const node = el(`<div class="screen">
    <div class="hero">
      <div class="logo"><span></span></div>
      <div class="titles"><b>USO</b><i>emb</i>
        ${Auth.matricula?`<small>Matrícula ${esc(Auth.matricula)}</small>`:''}</div>
      <button id="logoutBtn" title="Salir" style="color:#fff;font-size:18px">⎋</button>
    </div>
    <div class="content">
      <div id="recentWrap"></div>
      <div class="section-title">Categorías</div>
      <div class="grid" id="grid"></div>
    </div>
  </div>`);
  render(node);
  node.querySelector('#logoutBtn').onclick = () => {
    if(confirm('¿Cerrar sesión?')){ Auth.logout(); go('login'); }
  };

  const grid = node.querySelector('#grid');
  const items = MENU.filter(m => !m.adminOnly || Auth.isAdmin);
  items.forEach(m => {
    const card = el(`<button class="card" style="color:${m.color}">
      ${ICONS[m.icon]}<div class="label">${esc(m.title)}</div></button>`);
    card.onclick = () => {
      if (m.cat==='privado') return go('privado');
      if (m.cat==='convenio') return go('convenio');
      if (m.cat==='calendarios') return go('calendarios');
      go('list', { cat:m.cat });
    };
    grid.appendChild(card);
  });

  // Carpetas personalizadas (creadas desde Privado). Visibles para todos.
  try {
    const folders = await SB.getFolders();
    folders.forEach(f => {
      const card = el(`<button class="card" style="color:var(--gris)">
        ${ICONS.contactos}<div class="label">${esc(f.title)}</div></button>`);
      card.onclick = () => go('list', { cat:f.cat_key, title:f.title });
      grid.appendChild(card);
    });
  } catch(e){ console.warn('folders', e); }

  // Actividad reciente
  try {
    const recent = await loadRecent();
    if (recent.length) {
      const wrap = node.querySelector('#recentWrap');
      wrap.appendChild(el(`<div class="section-title">Última actividad</div>`));
      const row = el(`<div class="recent"></div>`);
      recent.forEach(({cat,item}) => {
        const c = el(`<div class="recent-card">${ICONS[catIcon(cat)]}
          <div style="min-width:0">
            <div class="rc-cat" style="color:${(CAT_META[cat.replace(/_.*/,'')]||{}).color||'var(--rojo)'}">${catLabel(cat)}</div>
            <div class="rc-title">${esc(item.title||'(sin título)')}</div>
            <div class="rc-date">${esc(item.date_text||'')}</div>
          </div></div>`);
        c.onclick = () => {
          if(cat.startsWith('calendarios')) return go('calendarios');
          if(cat==='convenio') return go('convenio');
          go('list',{cat});
        };
        row.appendChild(c);
      });
      wrap.appendChild(row);
    }
  } catch(e){ console.warn('recent', e); }
});

async function loadRecent(){
  const cats = ['quejas','actas','pic','contactos'];
  const all = [];
  for (const cat of cats) {
    try {
      const rows = await SB.select('content_items', `category=eq.${cat}&select=*&order=created_at.desc&limit=3`);
      rows.forEach(r => all.push({ cat, item:r, ts:r.created_at }));
    } catch(e){}
  }
  all.sort((a,b)=> (b.ts||'').localeCompare(a.ts||''));
  return all.slice(0,5);
}

// ─────────────────────────── Pantalla LISTA genérica ────────────────────
route('list', async (params) => {
  const cat = params?.cat || 'quejas';
  const customTitle = params?.title;
  const meta = CAT_META[cat] || { name: customTitle || cat.toUpperCase() };
  const titulo = customTitle || (meta.name.charAt(0)+meta.name.slice(1).toLowerCase());
  const node = el(`<div class="screen">
    <div class="appbar"><button id="back">‹</button><h1>${esc(titulo)}</h1></div>
    <div class="content" id="list"><div class="loading-full"><div class="spinner dark"></div></div></div>
  </div>`);
  render(node);
  node.querySelector('#back').onclick = () => go('main');
  const cont = node.querySelector('#list');

  async function reload(){
    try {
      const rows = await SB.select('content_items', `category=eq.${cat}&select=*&order=created_at.desc`);
      cont.innerHTML='';
      if (!rows.length) {
        cont.appendChild(el(`<div class="empty">${ICONS[catIcon(cat)]}<p>Todavía no hay nada aquí.</p></div>`));
      } else {
        const list = el(`<div class="list"></div>`);
        rows.forEach(r => list.appendChild(renderItem(r, cat, reload)));
        cont.appendChild(list);
      }
    } catch(e){
      cont.innerHTML=''; cont.appendChild(el(`<div class="empty"><p>Error al cargar.<br>${esc(e.message)}</p></div>`));
    }
  }
  await reload();

  // FAB para añadir (quejas: todos; resto: solo modo gestión)
  if (canManage(cat)) {
    const fab = el(`<button class="fab">＋</button>`);
    fab.onclick = () => openAddModal(cat, reload);
    node.appendChild(fab);
  }
});

// Resalta en amarillo las apariciones de `term` dentro de un texto,
// respetando tildes (busca sin tilde pero marca el texto original).
function highlightText(text, term){
  const safe = esc(text || '');
  if (!term) return safe;
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const nText = norm(safe);
  const nTerm = norm(term.trim());
  if (!nTerm) return safe;
  let out = '', i = 0;
  while (i < safe.length) {
    const idx = nText.indexOf(nTerm, i);
    if (idx === -1) { out += safe.slice(i); break; }
    out += safe.slice(i, idx);
    out += '<mark class="hl">' + safe.slice(idx, idx + nTerm.length) + '</mark>';
    i = idx + nTerm.length;
  }
  return out;
}

function renderItem(r, cat, reload, highlight=''){
  const puedeBorrar = canDelete(cat);
  const titleHtml = highlight ? highlightText(r.title||'(sin título)', highlight) : esc(r.title||'(sin título)');
  const bodyHtml  = highlight ? highlightText(r.body||'', highlight) : esc(r.body||'');
  const item = el(`<div class="item">
    ${puedeBorrar?`<button class="it-del">Borrar</button>`:''}
    <div class="it-cat">${catLabel(cat)}</div>
    <div class="it-title">${titleHtml}</div>
    ${r.body?`<div class="it-body">${bodyHtml}</div>`:''}
    ${r.file_url?`<a class="it-file" href="${esc(r.file_url)}" target="_blank" rel="noopener">📎 ${esc(r.file_name||'Ver archivo')}</a>`:''}
    <div class="it-date">${esc(r.date_text||'')} ${r.uploader?'· '+esc(r.uploader):''}</div>
  </div>`);
  if (puedeBorrar) {
    item.querySelector('.it-del').onclick = async () => {
      if(!confirm('¿Borrar este elemento?')) return;
      try { await SB.del('content_items', `id=eq.${r.id}`); toast('Borrado'); reload(); }
      catch(e){ toast('Error al borrar'); }
    };
  }
  return item;
}

// ─────────────────────────── Modal AÑADIR ───────────────────────────────
function openAddModal(cat, reload){
  const bg = el(`<div class="modal-bg"><div class="modal">
    <h3>Añadir a ${esc((CAT_META[cat]||{name:cat}).name.toLowerCase())}</h3>
    <input id="aTitle" placeholder="Título">
    <textarea id="aBody" placeholder="Escribe aquí…"></textarea>
    <input type="file" id="aFile" accept="image/*,application/pdf">
    <div class="err" id="aErr"></div>
    <div class="modal-actions">
      <button class="btn btn-sec" id="aCancel">Cancelar</button>
      <button class="btn" id="aSave">Publicar</button>
    </div>
  </div></div>`);
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.onclick = e => { if(e.target===bg) close(); };
  bg.querySelector('#aCancel').onclick = close;
  bg.querySelector('#aSave').onclick = async () => {
    const title = bg.querySelector('#aTitle').value.trim();
    const body = bg.querySelector('#aBody').value.trim();
    const file = bg.querySelector('#aFile').files[0];
    const err = bg.querySelector('#aErr');
    const btn = bg.querySelector('#aSave');
    if (!title && !body && !file) { err.textContent='Escribe algo o adjunta un archivo.'; return; }
    btn.disabled=true; btn.innerHTML='<span class="spinner"></span>'; err.textContent='';
    try {
      let fileUrl=null, fileName=null, filePath=null;
      if (file) {
        const prepared = await prepareFile(file);
        const safe = file.name.replace(/[^A-Za-z0-9._-]/g,'_');
        filePath = `${cat}/${crypto.randomUUID()}-${safe}`;
        fileUrl = await SB.uploadFile(filePath, prepared.blob, prepared.type);
        fileName = file.name;
      }
      await SB.insert('content_items', {
        category:cat, title:title||fileName||'(sin título)', body,
        uploader:Auth.matricula, date_text:nowStr(),
        file_name:fileName, file_path:filePath, file_url:fileUrl,
      });
      toast('Publicado'); close(); reload();
    } catch(e){
      err.textContent='Error al subir: '+e.message; console.error(e);
    } finally { btn.disabled=false; btn.textContent='Publicar'; }
  };
}

// Comprime imágenes a máx 1600px / JPEG antes de subir
async function prepareFile(file){
  if (!file.type.startsWith('image/')) {
    if (file.size > 5*1024*1024) throw new Error('Archivo muy grande (máx 5 MB)');
    return { blob:file, type:file.type||'application/octet-stream' };
  }
  const img = await new Promise((res,rej)=>{ const i=new Image();
    i.onload=()=>res(i); i.onerror=rej; i.src=URL.createObjectURL(file); });
  const max=1600; let {width:w,height:h}=img;
  if (Math.max(w,h)>max){ const r=max/Math.max(w,h); w=Math.round(w*r); h=Math.round(h*r); }
  const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  cv.getContext('2d').drawImage(img,0,0,w,h);
  const blob = await new Promise(res=>cv.toBlob(res,'image/jpeg',0.85));
  if (blob.size > 2*1024*1024) {
    const blob2 = await new Promise(res=>cv.toBlob(res,'image/jpeg',0.6));
    return { blob:blob2, type:'image/jpeg' };
  }
  return { blob, type:'image/jpeg' };
}

// ─────────────────────────── Pantalla CONVENIO ──────────────────────────
route('convenio', async () => {
  const node = el(`<div class="screen">
    <div class="appbar"><button id="back">‹</button><h1>Convenio</h1>
      <button id="aiBtn" title="Preguntar a la IA">✨</button></div>
    <div style="padding:12px 16px 0">
      <input id="cvSearch" placeholder="🔍 Buscar en el convenio…"
        style="width:100%;padding:12px 16px;border-radius:20px;border:1px solid var(--outline);
        background:var(--surface);color:var(--on-bg);font-size:15px">
    </div>
    <div class="content" id="cont"><div class="loading-full"><div class="spinner dark"></div></div></div>
  </div>`);
  render(node);
  node.querySelector('#back').onclick = () => go('main');
  node.querySelector('#aiBtn').onclick = () => go('ia');
  const cont = node.querySelector('#cont');
  const search = node.querySelector('#cvSearch');

  let allRows = [];
  // Normaliza: minúsculas y sin tildes, para que "articulo" encuentre "artículo"
  const norm = s => (s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  function paint(filter=''){
    const q = norm(filter.trim());
    const rows = q ? allRows.filter(r =>
      norm(r.title).includes(q) || norm(r.body).includes(q)
    ) : allRows;
    cont.innerHTML='';
    if (!rows.length) {
      cont.appendChild(el(`<div class="empty">${ICONS.convenio}<p>${q?'Sin resultados para tu búsqueda.':'No hay artículos del convenio aún.'}</p></div>`));
    } else {
      const list=el(`<div class="list"></div>`);
      rows.forEach(r=>list.appendChild(renderItem(r,'convenio',()=>go('convenio'), filter)));
      cont.appendChild(list);
    }
  }

  try {
    allRows = await SB.select('convenio_articulos', `select=*&order=created_at.asc`);
    paint();
  } catch(e){ cont.innerHTML=''; cont.appendChild(el(`<div class="empty"><p>Error: ${esc(e.message)}</p></div>`)); }

  let t;
  search.oninput = () => { clearTimeout(t); t=setTimeout(()=>paint(search.value), 200); };

  if (canManage('convenio')) { const fab=el(`<button class="fab">＋</button>`);
    fab.onclick=()=>openAddModal('convenio',()=>go('convenio')); node.appendChild(fab); }
});

// ─────────────────────────── Pantalla IA (chat) ─────────────────────────
route('ia', () => {
  const node = el(`<div class="screen">
    <div class="appbar"><button id="back">‹</button><h1>✨ Pregunta al convenio</h1></div>
    <div class="chat">
      <div class="chat-msgs" id="msgs"></div>
      <div class="chat-input">
        <textarea id="q" rows="1" placeholder="Escribe tu pregunta…"></textarea>
        <button id="send">➤</button>
      </div>
    </div>
  </div>`);
  render(node);
  node.querySelector('#back').onclick = () => go('convenio');
  const msgs = node.querySelector('#msgs');
  const q = node.querySelector('#q');
  const send = node.querySelector('#send');

  const sugs = ['¿Cuántos días de vacaciones tengo?','¿Cómo se calcula el plus de nocturnidad?',
    '¿Qué pagas extras me corresponden?','¿Qué cobro si me pongo enfermo?'];
  const welcome = el(`<div class="chat-welcome">
    <div class="ico">✨</div>
    <h2 style="margin:0 0 8px">Pregúntame del convenio</h2>
    <p style="color:var(--on-var)">Respondo según el convenio EMB y el Estatuto de los Trabajadores. No invento — si no está, te lo digo.</p>
    <div style="text-align:left;font-weight:600;margin:20px 0 8px;color:var(--on-var)">Sugerencias</div>
  </div>`);
  sugs.forEach(s=>{ const b=el(`<button class="sug">${esc(s)}</button>`); b.onclick=()=>ask(s); welcome.appendChild(b); });
  msgs.appendChild(welcome);

  q.oninput = () => { q.style.height='auto'; q.style.height=Math.min(q.scrollHeight,100)+'px'; };
  let loading=false;
  async function ask(text){
    const question=(text||q.value).trim();
    if(!question||loading) return;
    welcome.remove();
    msgs.appendChild(el(`<div class="bubble user">${esc(question)}</div>`));
    q.value=''; q.style.height='auto';
    loading=true; send.disabled=true;
    const load = el(`<div class="bubble ai"><span class="spinner dark"></span> Pensando…</div>`);
    msgs.appendChild(load); msgs.scrollTop=msgs.scrollHeight;
    try {
      const answer = await SB.askAi(question);
      load.remove();
      msgs.appendChild(el(`<div class="bubble ai">${esc(answer)}</div>`));
    } catch(e){
      load.remove();
      msgs.appendChild(el(`<div class="bubble err">⚠️ ${esc(e.message)}</div>`));
    } finally { loading=false; send.disabled=false; msgs.scrollTop=msgs.scrollHeight; }
  }
  send.onclick = () => ask();
  q.onkeydown = e => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); ask(); } };
});

// ─────────────────────────── Pantalla CALENDARIOS ───────────────────────
route('calendarios', async () => {
  let activeSub = CALENDAR_SUBS[0].key;
  const node = el(`<div class="screen">
    <div class="appbar"><button id="back">‹</button><h1>Calendarios</h1></div>
    <div class="tabs" id="tabs"></div>
    <div class="content" id="cont"></div>
  </div>`);
  render(node);
  node.querySelector('#back').onclick = () => go('main');
  const tabs = node.querySelector('#tabs');
  const cont = node.querySelector('#cont');

  CALENDAR_SUBS.forEach(s => {
    const t = el(`<button class="tab${s.key===activeSub?' active':''}">${esc(s.label)}</button>`);
    t.onclick = () => { activeSub=s.key; [...tabs.children].forEach(c=>c.classList.remove('active'));
      t.classList.add('active'); loadSub(); };
    tabs.appendChild(t);
  });

  async function loadSub(){
    cont.innerHTML='<div class="loading-full"><div class="spinner dark"></div></div>';
    try {
      const rows = await SB.select('content_items', `category=eq.${activeSub}&select=*&order=created_at.desc`);
      cont.innerHTML='';
      if(!rows.length) cont.appendChild(el(`<div class="empty">${ICONS.calendarios}<p>Sin calendarios en esta línea.</p></div>`));
      else { const list=el(`<div class="list"></div>`);
        rows.forEach(r=>list.appendChild(renderItem(r,activeSub,loadSub))); cont.appendChild(list); }
    } catch(e){ cont.innerHTML=''; cont.appendChild(el(`<div class="empty"><p>Error: ${esc(e.message)}</p></div>`)); }
  }
  await loadSub();

  if (canManage('calendarios')) { const fab=el(`<button class="fab">＋</button>`);
    fab.onclick=()=>openAddModal(activeSub,loadSub); node.appendChild(fab); }
});

// ─────────────────────────── Pantalla PRIVADO ───────────────────────────
route('privado', async () => {
  // Si aún no está desbloqueado el modo gestión, pedir la contraseña.
  if (!Auth.manageMode) {
    const node = el(`<div class="screen">
      <div class="appbar"><button id="back">‹</button><h1>Privado</h1></div>
      <div class="login" style="justify-content:flex-start;padding-top:50px">
        <div class="biglogo" style="width:80px;height:80px">${ICONS.privado}</div>
        <h2 style="margin-top:16px">Zona privada</h2>
        <p>Introduce la contraseña para gestionar el contenido de la app.</p>
        <input id="pw" type="password" placeholder="Contraseña" autocomplete="off">
        <div class="err" id="pwErr"></div>
        <button class="btn" id="pwBtn">Desbloquear</button>
      </div>
    </div>`);
    render(node);
    node.querySelector('#back').onclick = () => go('main');
    const inp = node.querySelector('#pw');
    const err = node.querySelector('#pwErr');
    inp.focus();
    const submit = () => {
      if (Auth.checkPrivadoPassword(inp.value)) {
        Auth.manageMode = true;
        toast('Modo gestión activado');
        go('privado'); // recargar la pantalla ya desbloqueada
      } else {
        err.textContent = 'Contraseña incorrecta.';
        inp.value = '';
      }
    };
    node.querySelector('#pwBtn').onclick = submit;
    inp.onkeydown = e => { if(e.key==='Enter') submit(); };
    return;
  }

  // Ya desbloqueado: mostrar el contenido de Privado + opción de bloquear.
  const node = el(`<div class="screen">
    <div class="appbar"><button id="back">‹</button><h1>Privado</h1>
      <button id="lock" title="Bloquear gestión">🔓</button></div>
    <div class="content" id="cont"><div class="loading-full"><div class="spinner dark"></div></div></div>
  </div>`);
  render(node);
  node.querySelector('#back').onclick=()=>go('main');
  node.querySelector('#lock').onclick=()=>{
    Auth.manageMode = false; toast('Gestión bloqueada'); go('main');
  };
  const cont = node.querySelector('#cont');
  async function reload(){
    try {
      const rows = await SB.select('content_items', `category=eq.privado&select=*&order=created_at.desc`);
      cont.innerHTML='';
      const info = el(`<div style="padding:14px 16px 0;color:var(--on-var);font-size:14px">
        ✅ Modo gestión activo. Ya puedes añadir y borrar contenido en todas las secciones.</div>`);
      cont.appendChild(info);

      // ── Gestor de carpetas de la pantalla de inicio ──
      const folderBox = el(`<div style="padding:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <b style="font-size:16px">Carpetas de inicio</b>
          <button id="newFolder" class="btn" style="width:auto;padding:8px 16px;font-size:14px">＋ Nueva</button>
        </div>
        <div id="folderList"></div>
      </div>`);
      cont.appendChild(folderBox);
      folderBox.querySelector('#newFolder').onclick = () => openNewFolderModal(reload);
      try {
        const folders = await SB.getFolders();
        const fl = folderBox.querySelector('#folderList');
        if (!folders.length) {
          fl.appendChild(el(`<div style="color:var(--on-var);font-size:14px">No has creado carpetas aún.</div>`));
        } else {
          folders.forEach(f => {
            const row = el(`<div class="item" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px">
              <span style="font-weight:600">${esc(f.title)}</span>
              <button class="it-del" style="float:none">Borrar</button>
            </div>`);
            row.querySelector('.it-del').onclick = async () => {
              if(!confirm(`¿Borrar la carpeta "${f.title}" y todo su contenido?`)) return;
              try { await SB.deleteFolder(f.id, f.cat_key); toast('Carpeta borrada'); reload(); }
              catch(e){ toast('Error al borrar'); }
            };
            fl.appendChild(row);
          });
        }
      } catch(e){ console.warn('folders', e); }

      // ── Contenido de la sección Privado ──
      cont.appendChild(el(`<div class="section-title" style="padding-top:8px">Contenido privado</div>`));
      if(!rows.length) cont.appendChild(el(`<div class="empty">${ICONS.privado}<p>Zona privada vacía.</p></div>`));
      else { const list=el(`<div class="list"></div>`);
        rows.forEach(r=>list.appendChild(renderItem(r,'privado',reload))); cont.appendChild(list); }
    } catch(e){ cont.innerHTML=''; cont.appendChild(el(`<div class="empty"><p>Error: ${esc(e.message)}</p></div>`)); }
  }
  await reload();
  const fab=el(`<button class="fab">＋</button>`); fab.onclick=()=>openAddModal('privado',reload); node.appendChild(fab);
});

// Modal para crear una carpeta nueva
function openNewFolderModal(reload){
  const bg = el(`<div class="modal-bg"><div class="modal">
    <h3>Nueva carpeta</h3>
    <input id="fName" placeholder="Nombre de la carpeta" autocomplete="off">
    <div class="err" id="fErr"></div>
    <div class="modal-actions">
      <button class="btn btn-sec" id="fCancel">Cancelar</button>
      <button class="btn" id="fSave">Crear</button>
    </div>
  </div></div>`);
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.onclick = e => { if(e.target===bg) close(); };
  bg.querySelector('#fCancel').onclick = close;
  bg.querySelector('#fName').focus();
  bg.querySelector('#fSave').onclick = async () => {
    const name = bg.querySelector('#fName').value.trim();
    const err = bg.querySelector('#fErr');
    if (name.length < 2) { err.textContent='Escribe un nombre.'; return; }
    const btn = bg.querySelector('#fSave');
    btn.disabled=true; btn.innerHTML='<span class="spinner"></span>';
    try { await SB.createFolder(name); toast('Carpeta creada'); close(); reload(); }
    catch(e){ err.textContent='Error: '+e.message; btn.disabled=false; btn.textContent='Crear'; }
  };
}

// ─────────────────────────── Arranque ───────────────────────────────────
if (CFG.SUPABASE_URL.includes('REEMPLAZAR')) {
  app.innerHTML = `<div class="login"><div class="biglogo"><span></span></div>
    <h2>Configura la app</h2>
    <p style="max-width:340px">Edita el archivo <b>config.js</b> y pega tu URL y clave de Supabase
    (los mismos de la app Android). Luego recarga.</p></div>`;
} else {
  handleRoute();
}

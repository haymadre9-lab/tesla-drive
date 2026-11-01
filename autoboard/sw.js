/* autoboard-next · service worker (v79)
   - Cascarón propio: precacheado → la app abre al instante y sin red.
   - HTML: red primero (siempre la última versión) con caída a caché.
   - Librerías CDN (MapLibre, three) y datos locales (assets/*.json, autopistas/*.json, *.glb): caché primero + refresco en segundo plano.
   - APIs en vivo (TomTom, MapTiler, OpenChargeMap, Overpass, tiles…): NO se tocan. */
const VER = 'autoboard-v79';
const SHELL = ['./', './index.html', './clips-voz.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const CDN = ['https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
             'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
             'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VER);
    await Promise.all(SHELL.map(u => c.add(u).catch(() => {})));              /* un fallo aislado no impide instalar */
    await Promise.all(CDN.map(u => fetch(u, { mode: 'no-cors' }).then(r => c.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VER) await caches.delete(k);
    await self.clients.claim();
  })());
});

const esCDN   = u => /^https:\/\/(unpkg\.com\/maplibre-gl@|cdn\.jsdelivr\.net\/npm\/three@)/.test(u);
const esLocal = u => u.origin === self.location.origin;
const esDato  = p => /\/(assets|autopistas|modelos)\/|\.(json|glb|mp3|png|jpg|webp|svg)$/i.test(p);

async function swr(req) {                                                   /* caché primero, refresca en segundo plano */
  const c = await caches.open(VER), hit = await c.match(req);
  const red = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await red) || Response.error();
}
async function redPrimero(req) {                                            /* HTML: última versión si hay red */
  const c = await caches.open(VER);
  try { const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; }
  catch (_) { return (await c.match(req)) || (await c.match('./index.html')) || Response.error(); }
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (esCDN(req.url)) { e.respondWith(swr(req)); return; }
  if (!esLocal(u)) return;                                                  /* APIs y teselas: directo a la red */
  if (req.mode === 'navigate' || u.pathname.endsWith('.html') || u.pathname.endsWith('/')) { e.respondWith(redPrimero(req)); return; }
  if (u.pathname.endsWith('/sw.js')) return;
  if (esDato(u.pathname) || /\.(js|css|webmanifest)$/.test(u.pathname)) e.respondWith(swr(req));
});

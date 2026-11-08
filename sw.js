// Service worker: cachea el cascarón para abrir sin conexión. Clima/mapa siempre van a la red.
const CACHE = 'lecoauto-v10';
const SHELL = ['./', './index.html', './style.css', './app.js', './nav.js', './poi.js', './dash.js', './edit.js', './free.js', './sync.js', './maps.js', './screen.js', './speedo.js', './stream.js', './tpl.js', './advisor.js', './vendor/leaflet.js', './vendor/leaflet.css', './manifest.json', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('/config.json')) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request).then(m => m || caches.match('./index.html'))));
});

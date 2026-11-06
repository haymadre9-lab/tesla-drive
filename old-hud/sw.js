// Service Worker básico: cachea el "cascarón" de la app para que abra offline.
// Los datos (Supabase) siempre se piden a la red.
const CACHE = 'usoembsa-v7';
const SHELL = ['./','./index.html','./app.js','./icons.js','./config.js',
               './manifest.webmanifest','./icon-192.png','./icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Nunca cachear llamadas a Supabase (datos en vivo)
  if (url.includes('supabase.co') || url.includes('/rest/v1') || url.includes('/functions/v1')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      // Cachear recursos propios sobre la marcha
      if (e.request.method==='GET' && resp.ok && url.startsWith(self.location.origin)) {
        const clone = resp.clone(); caches.open(CACHE).then(c=>c.put(e.request, clone));
      }
      return resp;
    }).catch(()=>caches.match('./index.html')))
  );
});

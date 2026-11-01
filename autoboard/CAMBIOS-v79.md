# autoboard-next v79 (sobre v78)

Cambios sin quitar ninguna función:

- Audio (mp3 base64, ~530 KB) sacado de `index.html` a `clips-voz.js`, cargado con `async`. El HTML pasa de 1,03 MB a 0,50 MB: se analiza y arranca antes en el navegador del Tesla.
- `registrarError`: lista acotada a 40, mensajes iguales consecutivos agrupados (`×N`), texto escapado (antes `innerHTML` con texto de la red) y pintado como máximo una vez por frame.
- `service worker` nuevo (`sw.js`): cascarón precacheado, HTML red-primero, MapLibre/three y datos locales (`assets/`, `autopistas/`, `.glb`) caché-primero con refresco en segundo plano. No toca TomTom, MapTiler, OCM ni Overpass.
- `preconnect` a unpkg, MapTiler y TomTom; `manifest.webmanifest` y iconos incluidos.

Despliegue: copiar `assets/`, `autopistas/` y los `.glb` junto a estos archivos.

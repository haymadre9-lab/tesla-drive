# Apps web para las ventanas flotantes (y el navegador del Tesla)

Las ventanas flotantes son `iframe`. Un servicio solo se abre dentro si **permite ser incrustado** (cabeceras `X-Frame-Options` / `frame-ancestors`).
Por eso Spotify, Netflix, Gmail, WhatsApp y Google Maps «no funcionan» como páginas normales: no es fallo de la app.
El catálogo (Apps → 🛍 Recomendadas) etiqueta cada app según cómo funciona:

| Etiqueta | Qué significa | Verificado |
|---|---|---|
| ✅ Propia | Página nuestra en `mini/` con APIs abiertas (CORS): no depende de que nadie permita el iframe | Probada con servicios simulados; las APIs reales no se pudieron llamar desde el entorno de desarrollo |
| 🟢 Embed oficial | Widget/embed documentado por el propio servicio (YouTube, Spotify, SoundCloud, Mixcloud, Apple Music/Podcasts, Deezer, Vimeo, Dailymotion, Twitch, Windy, Waze, Lichess TV) | Formato de URL comprobado; el servicio real no se pudo contactar |
| 🟡 Probar | Sitio normal: puede o no permitir el iframe | **Sin verificar**: probar en el coche; si sale en blanco, usar ↗ |
| 🔴 Se abre fuera | Prohíbe el iframe (Telegram Web envía `SAMEORIGIN`) | Según documentación de Telegram |

## Lista para probar en el coche
1. Apps → 🛍 Recomendadas → **Abrir** en cada una; apunta si se ve, si reproduce sonido y si responde al tacto.
2. Wikipedia (lector): buscar, «Cerca de ti» (pide permiso de ubicación), 🔊 Leer.
3. Radar de lluvia: debe mostrar imágenes y animarse; si dice «No se pudo cargar el radar», es la API de RainViewer.
4. Reproductor por enlace: pega un enlace de SoundCloud / Mixcloud / YouTube. Spotify, Apple Music y Deezer solo reproducen fragmentos de 30 s si no hay sesión iniciada en ese servicio.
5. Las 🟡 (DGT, TuneIn, Pocket Casts, ABRP, PlugShare, Radio Garden, Lichess web): anota cuáles se ven.
6. Vídeo en movimiento: el navegador del Tesla puede bloquearlo con el coche en marcha; el audio sí suele seguir.

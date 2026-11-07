# LecoAuto PWA

Launcher web para pantallas de coche (widgets, música con letras LRC, clima, mapa, neumáticos, apps y ventanas flotantes).

- **Web/PWA:** archivos en la raíz (`index.html`, `app.js`, `style.css`). Con GitHub Pages: `https://<usuario>.github.io/<repo>/`.
- **APK:** pestaña *Actions* → *Compilar APK* → *Run workflow*; al terminar, descarga el artefacto `LecoAuto-apk`.
- `old-hud/`: el antiguo Tesla Drive HUD.

Proyecto independiente; no incluye código ni recursos de la app Android LecoAuto.

## Configuración desde el móvil

Ajustes → ☁️ Sincronizar: publica la configuración (iconos, ventanas, dashboards) en `config.json` y la pantalla del coche la aplica al abrir. Requiere un token de GitHub de grano fino (solo este repo, *Contents: read and write*), que se guarda únicamente en el dispositivo.

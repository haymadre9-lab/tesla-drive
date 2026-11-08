// Copia solo los archivos de la PWA a ./www (carpeta que empaqueta Capacitor).
const fs = require('fs');
fs.rmSync('www', { recursive: true, force: true });
fs.mkdirSync('www');
['index.html', 'style.css', 'app.js', 'nav.js', 'poi.js', 'dash.js', 'edit.js', 'free.js', 'sync.js', 'maps.js', 'screen.js', 'speedo.js', 'stream.js', 'tpl.js', 'config.json', 'manifest.json', 'sw.js', 'icon-192.png', 'icon-512.png']
  .forEach(f => fs.copyFileSync(f, 'www/' + f));
fs.cpSync('vendor', 'www/vendor', { recursive: true });
console.log('www listo');

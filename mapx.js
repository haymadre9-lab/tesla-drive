'use strict';
/* Adaptador de mapa. Motor principal: MapLibre GL (vectorial, 3D con edificios, giro y inclinación).
   Respaldo automático: Leaflet con teselas raster cuando el navegador no tiene WebGL (o si se elige en Ajustes).
   Ambos motores exponen la misma API para que nav.js y poi.js no dependan del motor. Las coordenadas son siempre [lat, lon]. */

const MapX = (() => {
  const glOK = () => {
    try { if (typeof maplibregl === 'undefined' || S.mapEngine === 'leaflet') return false; const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
  };
  const DARK = () => typeof mapDark === 'function' ? mapDark() : (typeof isDark === 'function' && isDark());
  const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf', VECTOR = 'https://tiles.openfreemap.org/planet';
  const CARTO = k => ['a', 'b', 'c', 'd'].map(s => `https://${s}.basemaps.cartocdn.com/${k}/{z}/{x}/{y}.png`);
  const TILE = { osm: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', '© OpenStreetMap'], sat: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 'Imágenes © Esri, Maxar, Earthstar Geographics'], road: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', ''], place: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', ''] };

  /* ── Estilos GL ── */
  const raster = (id, tiles, attr, extra) => ({ type: 'raster', source: id, paint: Object.assign({}, extra), _src: { type: 'raster', tiles: [].concat(tiles), tileSize: 256, maxzoom: 19, attribution: attr } });
  function rasterStyle(layers) {
    const sources = {}, out = []; layers.forEach(l => { sources[l.source] = l._src; const { _src, ...r } = l; out.push(Object.assign({ id: 'r-' + l.source }, r)); });
    return { version: 8, glyphs: GLYPHS, sources, layers: out };
  }
  const STY = {
    satelite: () => rasterStyle([raster('sat', TILE.sat[0], TILE.sat[1], { 'raster-brightness-max': .85, 'raster-saturation': .1 })]),
    hibrido: () => rasterStyle([raster('sat', TILE.sat[0], TILE.sat[1], { 'raster-brightness-max': .85, 'raster-saturation': .1 }), raster('road', TILE.road[0], ''), raster('place', TILE.place[0], '')]),
    rdark: () => rasterStyle([raster('c', CARTO('dark_all'), '© OpenStreetMap © CARTO')]),
    rlight: () => rasterStyle([raster('c', CARTO('light_all'), '© OpenStreetMap © CARTO')]),
    dark: () => vec(true), light: () => vec(false),
  };
  function vec(dark) {
    const c = dark ? { bg: '#0d1219', water: '#0a2338', park: '#10241b', wood: '#0e2018', res: '#111821', bld: '#26334a', rd: '#2d384b', rdc: '#080b10', mw: '#5a7396', pri: '#41506a', lab: '#cfd8e6', halo: '#0a0e14', pl: '#e8eef8' }
      : { bg: '#eceee9', water: '#a9cfe9', park: '#cfe5c6', wood: '#bcd9b3', res: '#e5e6df', bld: '#d3d0c8', rd: '#ffffff', rdc: '#c6cbd1', mw: '#f2b25c', pri: '#fde3a6', lab: '#2a3140', halo: '#ffffff', pl: '#1d2430' };
    const S0 = 'o', cls = (...a) => ['match', ['get', 'class'], a, true, false];
    const w = b => ['interpolate', ['exponential', 1.5], ['zoom'], 8, b * .2, 13, b * 1.1, 16, b * 3.4, 19, b * 11];
    const road = (id, f, col, base, minz) => [
      { id: id + '-c', type: 'line', source: S0, 'source-layer': 'transportation', minzoom: minz, filter: f, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.rdc, 'line-width': w(base + 1.6), 'line-opacity': dark ? .9 : .8 } },
      { id: id, type: 'line', source: S0, 'source-layer': 'transportation', minzoom: minz, filter: f, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': col, 'line-width': w(base) } },
    ];
    const font = ['Noto Sans Regular'], txt = { 'text-color': c.lab, 'text-halo-color': c.halo, 'text-halo-width': 1.6 };
    return {
      version: 8, glyphs: GLYPHS, sources: { [S0]: { type: 'vector', url: VECTOR, attribution: '© OpenStreetMap · OpenFreeMap' } },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': c.bg } },
        { id: 'wood', type: 'fill', source: S0, 'source-layer': 'landcover', filter: cls('wood', 'forest'), paint: { 'fill-color': c.wood, 'fill-opacity': .8 } },
        { id: 'grass', type: 'fill', source: S0, 'source-layer': 'landcover', filter: cls('grass', 'farmland'), paint: { 'fill-color': c.park, 'fill-opacity': .6 } },
        { id: 'park', type: 'fill', source: S0, 'source-layer': 'park', paint: { 'fill-color': c.park, 'fill-opacity': .85 } },
        { id: 'resid', type: 'fill', source: S0, 'source-layer': 'landuse', filter: cls('residential', 'suburb', 'neighbourhood'), paint: { 'fill-color': c.res } },
        { id: 'water', type: 'fill', source: S0, 'source-layer': 'water', paint: { 'fill-color': c.water } },
        { id: 'waterway', type: 'line', source: S0, 'source-layer': 'waterway', paint: { 'line-color': c.water, 'line-width': 1.6 } },
        ...road('r-min', cls('minor', 'service', 'track'), c.rd, 1.6, 12),
        ...road('r-sec', cls('secondary', 'tertiary'), c.rd, 2.4, 9),
        ...road('r-pri', cls('primary'), c.pri, 3, 7),
        ...road('r-mw', cls('motorway', 'trunk'), c.mw, 3.4, 5),
        { id: 'bld3d', type: 'fill-extrusion', source: S0, 'source-layer': 'building', minzoom: 13.5, paint: { 'fill-extrusion-color': c.bld, 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': dark ? .92 : .85 } },
        { id: 'roadname', type: 'symbol', source: S0, 'source-layer': 'transportation_name', minzoom: 14.5, layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': font, 'text-size': 12 }, paint: { 'text-color': c.lab, 'text-halo-color': c.halo, 'text-halo-width': 1.4, 'text-opacity': .85 } },
        { id: 'place', type: 'symbol', source: S0, 'source-layer': 'place', filter: cls('city', 'town', 'village', 'suburb', 'neighbourhood'), layout: { 'text-field': ['get', 'name'], 'text-font': font, 'text-size': ['match', ['get', 'class'], 'city', 17, 'town', 15, 13], 'text-max-width': 8 }, paint: Object.assign({}, txt, { 'text-color': c.pl }) },
      ],
    };
  }
  const resolve = key => { const k = key || 'auto'; return k === 'auto' ? (DARK() ? 'dark' : 'light') : k === 'sat' ? 'satelite' : k === 'hybrid' ? 'hibrido' : k; };

  /* ── Motor GL ── */
  function gl(el, o) {
    const map = new maplibregl.Map({ container: el, style: STY[resolve(o.style)](), center: [o.c[1], o.c[0]], zoom: o.z, attributionControl: { compact: true }, maxPitch: 75, fadeDuration: 0, dragRotate: true, touchPitch: true });
    const E = { kind: 'gl', map, can3d: true, pad: { left: 0, right: 0, top: 0, bottom: 0 }, sk: null, route: null, fails: 0, vecOk: false };
    const EMPTY = { type: 'FeatureCollection', features: [] };
    E.center = () => { const c = map.getCenter(); return [c.lat, c.lng]; }; E.getCenter = () => map.getCenter(); E.getZoom = () => map.getZoom();
    E.zoom = () => map.getZoom(); E.size = () => [el.clientWidth, el.clientHeight]; E.pitch = () => map.getPitch(); E.bearing = () => map.getBearing();
    E.focus = (fx, up) => { const [w, h] = E.size(); E.pad = { left: fx > .5 ? Math.round((fx - .5) * 2 * w) : 0, right: fx < .5 ? Math.round((.5 - fx) * 2 * w) : 0, top: Math.round((up || 0) * h), bottom: 0 }; };
    E.view = (p, z, v = {}) => {
      const opt = { center: [p[1], p[0]], zoom: z == null ? map.getZoom() : z, padding: E.pad }; if (v.bearing != null) opt.bearing = v.bearing; if (v.pitch != null) opt.pitch = v.pitch;
      if (v.anim) { Object.assign(opt, { duration: v.dur || 600, essential: true }); if (v.linear) opt.easing = t => t; map.easeTo(opt); } else map.jumpTo(opt);
    };
    E.fit = (coords, v = {}) => {
      const b = new maplibregl.LngLatBounds(); coords.forEach(c => b.extend([c[1], c[0]])); const p = E.pad, m = 50;
      map.fitBounds(b, { padding: { left: m + p.left, right: m + p.right, top: 110 + p.top, bottom: 100 }, duration: 900, pitch: v.pitch == null ? 0 : v.pitch, bearing: 0, maxZoom: 17 });
    };
    E.zoomBy = d => map.zoomTo(map.getZoom() + d, { duration: 250 });
    E.resetNorth = () => map.easeTo({ bearing: 0, pitch: 0, duration: 500 });
    E.resize = () => map.resize();
    E.onUser = fn => { map.on('dragstart', fn); map.on('rotatestart', e => e.originalEvent && fn()); map.on('pitchstart', e => e.originalEvent && fn()); map.on('zoomstart', e => e.originalEvent && fn()); };
    E.onMove = fn => map.on('moveend', fn); E.onRotate = fn => map.on('rotate', fn);
    E.marker = (p, html, size, op = {}) => {
      const d = document.createElement('div'); d.className = 'mxm'; d.style.width = size[0] + 'px'; d.style.height = size[1] + 'px'; if (op.z) d.style.zIndex = op.z; d.innerHTML = html;
      if (op.click) d.addEventListener('click', ev => { ev.stopPropagation(); op.click(); });
      const m = new maplibregl.Marker({ element: d, anchor: 'center' }).setLngLat([p[1], p[0]]).addTo(map);
      return { el: d, set: q => m.setLngLat([q[1], q[0]]), remove: () => m.remove() };
    };
    E.group = () => { let it = []; return { add: (p, html, size, click) => it.push(E.marker(p, html, size, { click })), clear: () => { it.forEach(m => m.remove()); it = []; } }; };
    /* ruta con halo */
    const dec = () => {
      try {
        if (!map.getSource('route')) {
          map.addSource('route', { type: 'geojson', data: EMPTY });
          const base = { type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' } }, wd = b => ['interpolate', ['exponential', 1.4], ['zoom'], 8, b * .3, 14, b, 19, b * 3];
          map.addLayer(Object.assign({ id: 'route-glow', paint: { 'line-color': ['get', 'c'], 'line-width': wd(22), 'line-blur': 12, 'line-opacity': .5 } }, base));
          map.addLayer(Object.assign({ id: 'route-case', paint: { 'line-color': '#ffffff', 'line-width': wd(13) } }, base));
          map.addLayer(Object.assign({ id: 'route-line', paint: { 'line-color': ['get', 'c'], 'line-width': wd(8) } }, base));
        }
        const r = E.route; map.getSource('route').setData(r ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { c: r.col }, geometry: { type: 'LineString', coordinates: r.c.map(q => [q[1], q[0]]) } }] } : EMPTY);
      } catch { }
    };
    E.line = (coords, col) => { E.route = coords && coords.length > 1 ? { c: coords, col: col || '#3e9bff' } : null; dec(); };
    map.on('style.load', () => { dec(); }); map.on('load', dec);
    /* estilo + respaldo si el vectorial no carga */
    E.style = key => {
      const k = resolve(key); if (k === E.sk) return; E.sk = k; E.fails = 0; E.vecOk = false; map.setStyle(STY[k](), { diff: false });
    };
    E.sk = resolve(o.style);
    map.on('sourcedata', e => { if (e.sourceId === 'o' && e.isSourceLoaded) E.vecOk = true; });
    map.on('error', e => {
      if (!(e && e.sourceId === 'o') || E.vecOk || (E.sk !== 'dark' && E.sk !== 'light')) return;
      if ((E.fails += e.tile ? 1 : 3) >= 3) { const k = E.sk === 'dark' ? 'rdark' : 'rlight'; E.sk = k; E.fails = 0; map.setStyle(STY[k](), { diff: false }); if (typeof toast === 'function') toast('Mapa vectorial no disponible: se usa el mapa de respaldo (sin 3D de edificios)', 3500); }
    });
    return E;
  }

  /* ── Motor Leaflet (respaldo) ── */
  function lf(el, o) {
    const map = L.map(el, { zoomControl: false, attributionControl: true, tap: true }).setView(o.c, o.z);
    const E = { kind: 'lf', map, can3d: false, fx: .5, tiles: [], sk: null, line: null };
    E.center = () => { const c = map.getCenter(); return [c.lat, c.lng]; }; E.getCenter = () => map.getCenter(); E.getZoom = () => map.getZoom(); E.zoom = () => map.getZoom();
    E.size = () => [el.clientWidth, el.clientHeight]; E.pitch = () => 0; E.bearing = () => 0;
    E.focus = fx => { E.fx = fx; };
    E.view = (p, z, v = {}) => { map.setView(p, z == null ? map.getZoom() : z, { animate: !!v.anim }); if (E.fx !== .5) map.panBy([-(E.fx - .5) * map.getSize().x, 0], { animate: false }); };
    E.fit = coords => { const w = map.getSize().x, fx = E.fx; map.fitBounds(L.latLngBounds(coords), { paddingTopLeft: [fx > .5 ? Math.round(w * (fx - .5) * 2) + 40 : 60, 90], paddingBottomRight: [fx < .5 ? Math.round(w * (.5 - fx) * 2) + 40 : 60, 90] }); };
    E.zoomBy = d => map.setZoom(map.getZoom() + d); E.resetNorth = () => { }; E.resize = () => map.invalidateSize();
    E.onUser = fn => map.on('dragstart', fn); E.onMove = fn => map.on('moveend', fn); E.onRotate = () => { };
    const ico = (html, s) => L.divIcon({ className: '', html, iconSize: s, iconAnchor: [s[0] / 2, s[1] / 2] });
    E.marker = (p, html, size, op = {}) => { const m = L.marker(p, { icon: ico(html, size), zIndexOffset: op.z || 0 }).addTo(map); if (op.click) m.on('click', op.click); return { get el() { return m.getElement(); }, set: q => m.setLatLng(q), remove: () => m.remove() }; };
    E.group = () => { const g = L.layerGroup().addTo(map); return { add: (p, html, size, click) => { const m = L.marker(p, { icon: ico(html, size) }); if (click) m.on('click', click); m.addTo(g); }, clear: () => g.clearLayers() }; };
    E.line = (coords, col) => { if (E.ln) { map.removeLayer(E.ln); E.ln = null; } if (coords && coords.length > 1) E.ln = L.polyline(coords, { color: col || '#3e9bff', weight: 8, opacity: .9 }).addTo(map); };
    E.style = key => {
      const k = key === 'sat' || key === 'hybrid' ? key : 'osm'; if (k === E.sk) return; E.sk = k; E.tiles.forEach(l => map.removeLayer(l)); E.tiles = [];
      const add = (n, z) => E.tiles.push(L.tileLayer(TILE[n][0], { maxZoom: 19, attribution: TILE[n][1], zIndex: z }).addTo(map));
      if (k === 'sat' || k === 'hybrid') { add('sat', 1); if (k === 'hybrid') { add('road', 2); add('place', 3); } } else add('osm', 1);
    };
    E.style(o.style);
    return E;
  }

  return { create: (el, o) => glOK() ? gl(el, o) : lf(el, o), hasGL: glOK };
})();


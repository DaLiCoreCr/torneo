/* Service worker: la app abre sin conexión y siempre intenta traer la versión más nueva.
   - Archivos propios: red primero, con copia guardada como respaldo.
   - Librerías de Firebase y fuentes (versionadas): copia primero.
   - Las consultas a Firestore no pasan por aquí; su propio caché guarda los datos. */
const CACHE = 'hoopz-v15';
const SHELL = ['./', 'index.html', 'resultados.html', 'posiciones.html', 'estadisticas.html', 'partido.html', 'tv.html', 'mesa.html', 'sorteo.html', 'presentacion.html', 'admin.html',
  'css/styles.css?v=15', 'js/firebase-config.js?v=15', 'js/core.js?v=15', 'js/seed.js?v=15', 'js/ui.js?v=15', 'js/store-firebase.js',
  'assets/logo.jpg', 'assets/hero.webp', 'assets/bg-hoop.jpg', 'icons/icon-192.png'];
const STATIC_HOSTS = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  if (STATIC_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }))
    );
  }
});

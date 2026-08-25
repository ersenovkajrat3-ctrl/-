/* Сетка — офлайн-кэш. Игра целиком статическая, поэтому кэшируем весь набор файлов. */
const CACHE = 'setka-v3';
const ASSETS = [
  './', './index.html', './manifest.json', './assets/css/style.css', './assets/icons/icon.svg',
  './src/core.js', './src/data.js', './src/players.js', './src/engine.js', './src/economy.js',
  './src/identity.js', './src/fans.js', './src/world.js', './src/feed.js', './src/season.js', './src/calendar.js', './src/transfers.js', './src/national.js',
  './src/audio.js', './src/save.js', './src/crest.js', './src/charts.js', './src/ui.js', './src/ui2.js', './src/match-ui.js', './src/ceremony.js', './src/app.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});

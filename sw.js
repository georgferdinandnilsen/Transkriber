// Gjør at appen åpner seg uten nett, og at biblioteket for Whisper bare lastes ned én gang.
// Språkmodellene lagres av bibliotekene selv i nettleserens lager.

const VERSION = 'transkriber-v1';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/ai.js',
  'js/audio.js',
  'js/files.js',
  'js/mini.js',
  'js/models.js',
  'js/recorder.js',
  'js/store.js',
  'js/text.js',
  'js/worker.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon.png',
];
const LIBRARIES = ['cdn.jsdelivr.net', 'esm.run'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('transkriber-') && key !== VERSION && key !== 'transkriber-libs') await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Appens egne filer: nyeste versjon fra nettet, og den lagrede når du er uten nett.
  // Da henger aldri en gammel fil igjen etter en oppdatering.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const response = await fetch(request, { cache: 'no-cache' });
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch (error) {
        const cached = await cache.match(request, { ignoreSearch: true })
          || (request.mode === 'navigate' ? await cache.match('index.html') : undefined);
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  // Biblioteker fra CDN: faste versjoner, så de kan lagres for godt
  if (LIBRARIES.includes(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open('transkriber-libs');
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    })());
  }
});

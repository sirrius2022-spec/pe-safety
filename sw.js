// Service Worker — PE Safety v3 (2026-04-26 강제갱신)
const CACHE_NAME = 'pe-safety-v3-ts20260426-143000';
const URLS = [
  './',
  './index.html',
  './forest.html',
  './d01.html',
  './d02.html',
  './d03.html',
  './d04.html',
  './d05.html',
  './d06.html',
  './d07.html',
  './d08.html',
  './manifest.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(URLS);
    }).catch(function() {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) {
          return name.indexOf('pe-safety') === 0 && name !== CACHE_NAME;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    })
  );
  self.clients.matchAll().then(function(clients) {
    clients.forEach(function(client) {
      client.postMessage({type: 'CACHE_UPDATED'});
    });
  });
});

self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(response) {
      return response || fetch(e.request);
    }).catch(function() {
      return caches.match('./index.html');
    })
  );
});

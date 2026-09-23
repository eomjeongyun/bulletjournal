'use strict';

const CACHE_NAME = 'bulletjournal-v2';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './fonts/KkuBulLim.woff2',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME && key.startsWith('bulletjournal-')).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.includes('/api/bulletjournal-digest/')) return; // always live, never cached

  if (event.request.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then(cached => {
      const fresh = fetch(new Request('./index.html', { cache: 'no-cache' })).then(response => {
        if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put('./index.html', response.clone()));
        return response;
      }).catch(() => cached);
      event.waitUntil(fresh.then(() => {}).catch(() => {}));
      return cached || fresh;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => {
    const refresh = fetch(new Request(event.request.url, { cache: 'no-cache' })).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => null);
    if (cached) {
      event.waitUntil(refresh);
      return cached;
    }
    return refresh.then(response => response || new Response('', { status: 503 }));
  }));
});

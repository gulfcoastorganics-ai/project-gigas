const CACHE = 'gigas-shell-v4'
const SHELL = ['/', '/manifest.webmanifest']
const LOCAL_FIXTURES = ['/folios/', '/tiles/']

function isCacheable(url) {
  if (url.origin !== self.location.origin) return false
  return SHELL.includes(url.pathname) || LOCAL_FIXTURES.some((prefix) => url.pathname.startsWith(prefix))
}

self.addEventListener('install', (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())) })
self.addEventListener('activate', (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())) })
self.addEventListener('fetch', (event) => { if (event.request.method !== 'GET') return; const url = new URL(event.request.url); if (!isCacheable(url)) return; event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => { if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone())); return response }).catch(() => caches.match('/')))) })

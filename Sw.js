/* ==========================================================
   SSK-POS PWA — Service Worker (Phase 2)
   Version de cache identique au PC : 8.1.8 (ssk-pos-pwa-8.1.8)
   - Pré-cache de l'application (./ et ./index.html)
   - Cache runtime pour les CDN (html5-qrcode) et les images
   - Jamais de cache pour les fichiers de synchronisation SSK-*.json
     ni pour database.db : ces fichiers doivent rester LIVE.
   ========================================================== */
'use strict';

const SW_VERSION = '8.1.8';
const CACHE_NAME = 'ssk-pos-pwa-' + SW_VERSION;
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './favicon-64.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // add() par fichier : un fichier manquant ne vide pas tout le cache.
      .then((cache) => Promise.all(PRECACHE.map((url) =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.indexOf('ssk-pos-pwa-') === 0 && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isSyncFile(url) {
  return /SSK-[^/]*\.json$/i.test(url.pathname) || /database\.db$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Jamais de cache pour la synchronisation locale.
  if (isSyncFile(url)) return;

  const sameOrigin = (url.origin === self.location.origin);

  if (sameOrigin) {
    // Navigation / application : réseau d'abord, cache en secours (offline).
    if (req.mode === 'navigate' || url.pathname.endsWith('/') || /index\.html?$/i.test(url.pathname)) {
      event.respondWith(
        fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          })
          .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
      );
      return;
    }
    // Ressources locales : cache d'abord, puis réseau.
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }))
    );
    return;
  }

  // CDN (html5-qrcode, etc.) : cache d'abord pour permettre le scan offline.
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => hit))
  );
});

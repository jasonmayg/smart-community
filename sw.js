// Service worker: makes the app open and run with no network.
// App files are precached on install (cache-first); fonts are cached as they load; the model API is never cached.
// Bump VERSION whenever a file changes so devices pick up the new build. tests/pwa.test.mjs checks the list.
const VERSION = 'sc-v4-4';
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/app.css',
  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/js/domain/assets.js',
  'assets/js/domain/assistant.js',
  'assets/js/domain/data.js',
  'assets/js/domain/forecast.js',
  'assets/js/domain/ledger.js',
  'assets/js/domain/org.js',
  'assets/js/domain/routes.js',
  'assets/js/domain/sync.js',
  'assets/js/domain/triage.js',
  'assets/js/domain/wellbeing.js',
  'assets/js/domain/workorders.js',
  'assets/js/lib/format.js',
  'assets/js/lib/icons.js',
  'assets/js/lib/llm.js',
  'assets/js/lib/store.js',
  'assets/js/lib/ui.js', 'assets/js/lib/tour.js',
  'assets/js/main.js',
  'assets/js/state.js',
  'assets/js/views/canteen.js',
  'assets/js/views/care.js',
  'assets/js/views/facilities.js',
  'assets/js/views/market.js',
  'assets/js/views/orders.js',
  'assets/js/views/org.js',
  'assets/js/views/overview.js',
  'assets/js/views/resident.js',
  'assets/js/views/revenue.js',
  'assets/js/views/shared.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'fonts').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname === 'api.anthropic.com') return; // live AI: network only
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) {
    // fonts: serve from cache if we have them, refresh in the background
    e.respondWith(caches.open('fonts').then(async c => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  if (e.request.mode === 'navigate') {
    // the page itself: network first so updates arrive, cached copy when offline
    e.respondWith(fetch(e.request).then(r => { caches.open(VERSION).then(c => c.put('index.html', r.clone())); return r; }).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return r;
  })));
});

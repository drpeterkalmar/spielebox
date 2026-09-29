// Service-Worker: offline spielbar (Solo/zu zweit), Cache-Busting über Inhalts-Hash (tools/update_sw.py)
const VERSION = '9e5fcdcd3f';
const CACHE = 'spielebox-' + VERSION;
const ASSETS = [
  './',
  'assets/wood/dark.webp',
  'assets/wood/frame.webp',
  'assets/wood/light.webp',
  'css/style.css',
  'icons/apple-touch-icon.png',
  'icons/favicon-64.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'index.html',
  'lib/trystero.js',
  'manifest.webmanifest',
  'src/app.js',
  'src/botclient.js',
  'src/botworker.js',
  'src/build.js',
  'src/games/dame/bot.js',
  'src/games/dame/engine.js',
  'src/games/dame/view.js',
  'src/games/muehle/bot.js',
  'src/games/muehle/engine.js',
  'src/games/muehle/view.js',
  'src/games/registry.js',
  'src/net/crypto.js',
  'src/net/netlink.js',
  'src/net/relaychannel.js',
  'src/net/relays.js',
  'src/net/table.js',
  'src/rng.js',
  'src/store.js',
  'src/ui/dom.js',
  'src/ui/lobby.js',
  'src/ui/svg.js',
  'src/ui/tablescreen.js',
  'src/ui/texts.js',
  'src/words.js'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('spielebox-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html', { cacheName: CACHE }).then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { cacheName: CACHE, ignoreSearch: true }).then((r) => r || fetch(req).then((res) => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
    return res;
  })));
});

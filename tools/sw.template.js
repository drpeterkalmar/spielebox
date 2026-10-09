// Service-Worker: offline spielbar (Solo/zu zweit), Cache-Busting über Inhalts-Hash (tools/update_sw.py).
// Zwei Caches (Gutachten P2-7):
// - spielebox-core-<VERSION>: HTML/CSS/JS/Icons, bei jeder Version neu (in Gruppen à 40 mit Wiederholung)
// - spielebox-assets: Karten, Holz, Figuren – versionslos, beim Aktivieren nicht gelöscht. Schlüssel = Pfad + Inhalts-Hash
//   (?h=…), so lädt ein Update nur fehlende oder geänderte Bilder nach; alte Fassungen werden beim Aktivieren entfernt.
// Kartenpakete (n9): die @2x-Einzelkarten liegen bitgleich in 2 Paketen (tools/cardpack.py). Vorab geladen werden nur
// die Pakete; eine Karten-Anfrage beantwortet der Worker mit dem Ausschnitt aus dem Paket (Blob.slice, ohne Kopie).
const VERSION = '__VERSION__';
const CORE = 'spielebox-core-' + VERSION;
const ASSETS = 'spielebox-assets';
const CORE_FILES = [
  __CORE__
];
// Pfad → Inhalts-Hash (alle eingecheckten Bilder unter assets/); vorab geladen werden nur die in PRE
const ASSET_HASH = {
  __ASSET_HASH__
};
const PRE = [
  __PRE__
];
// Einzelkarte → [Paket, Versatz, Länge]
const PACKED = {
  __PACKED__
};
const GROUP = 40;
const TRIES = 3;

const assetKey = (path) => path + '?h=' + ASSET_HASH[path];
const pathOf = (url) => new URL(url).pathname.slice(new URL(self.registration.scope).pathname.length);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn) {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) { if (i >= TRIES) throw e; await pause(500 * i); }
  }
}

// Inhalts-Hash wie update_sw.py (SHA-256, erste 10 Hex-Zeichen)
async function hashOf(res) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', await res.clone().arrayBuffer()));
  return Array.from(d.slice(0, 5), (b) => b.toString(16).padStart(2, '0')).join('');
}

// fehlende Bilder holen: erst aus einem alten Cache (nur wenn der Inhalt passt), sonst aus dem Netz
async function fillAssets() {
  const c = await caches.open(ASSETS);
  const missing = [];
  for (const p of PRE) if (!(await c.match(assetKey(p)))) missing.push(p);
  for (let i = 0; i < missing.length; i += GROUP) {
    await Promise.all(missing.slice(i, i + GROUP).map((p) => withRetry(async () => {
      const old = await caches.match(p, { ignoreSearch: true });
      if (old && old.ok && (await hashOf(old)) === ASSET_HASH[p]) return c.put(assetKey(p), old);
      const res = await fetch(new Request(p, { cache: 'reload' }));
      if (!res.ok) throw new Error(p + ' ' + res.status);
      return c.put(assetKey(p), res);
    })));
  }
}

// Pakete als Blob im Speicher des Workers (einmal aus dem Cache gelesen; der Worker darf jederzeit beendet werden)
const packBlobs = new Map();
function packBlob(pack) {
  if (!packBlobs.has(pack)) {
    packBlobs.set(pack, caches.open(ASSETS).then((c) => c.match(assetKey(pack))).then((r) => (r ? r.blob() : null))
      .then((b) => { if (!b) packBlobs.delete(pack); return b; }, () => { packBlobs.delete(pack); return null; }));
  }
  return packBlobs.get(pack);
}
async function fromPack(p) {
  const [pack, off, len] = PACKED[p];
  const b = await packBlob(pack);
  if (!b || b.size < off + len) return null;
  return new Response(b.slice(off, off + len, 'image/webp'), { headers: { 'Content-Type': 'image/webp', 'Content-Length': String(len) } });
}

async function fillCore() {
  const c = await caches.open(CORE);
  for (let i = 0; i < CORE_FILES.length; i += GROUP) {
    const group = CORE_FILES.slice(i, i + GROUP);
    await withRetry(() => c.addAll(group.map((u) => new Request(u, { cache: 'reload' }))));
  }
}

self.addEventListener('install', (e) => {
  e.waitUntil(fillAssets().then(fillCore).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter((k) => k.startsWith('spielebox-') && k !== CORE && k !== ASSETS).map((k) => caches.delete(k)));
    // Bilder-Cache behalten, nur Fassungen entfernen, die zu keiner aktuellen Datei mehr gehören –
    // und Einzelkarten, die jetzt im (geladenen) Paket stecken (sonst lägen sie doppelt im Speicher)
    const c = await caches.open(ASSETS);
    const packsIn = new Set();
    for (const p of new Set(Object.values(PACKED).map((v) => v[0]))) if (await c.match(assetKey(p))) packsIn.add(p);
    for (const req of await c.keys()) {
      const u = new URL(req.url);
      const p = pathOf(req.url);
      if (!(p in ASSET_HASH) || u.searchParams.get('h') !== ASSET_HASH[p] || (p in PACKED && packsIn.has(PACKED[p][0]))) await c.delete(req);
    }
    await self.clients.claim();
  })());
});

// Bild: zuerst aus dem Bilder-Cache, sonst holen und merken (auch nicht vorab geladene, z. B. 1×-Karten)
function assetResponse(req, p) {
  return caches.open(ASSETS).then((c) => c.match(assetKey(p)).then((r) => r || fetch(req).then((res) => {
    if (res.ok) { const cp = res.clone(); hashOf(cp).then((x) => { if (x === ASSET_HASH[p]) c.put(assetKey(p), cp); }).catch(() => {}); }
    return res;
  })));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html', { cacheName: CORE }).then((r) => r || fetch(req)));
    return;
  }
  const p = pathOf(req.url);
  if (p in PACKED) {
    // Karte aus dem Paket; ist das Paket (noch) nicht im Cache: wie jedes andere Bild (Cache, sonst Netz)
    e.respondWith(fromPack(p).then((r) => r || assetResponse(req, p)));
    return;
  }
  if (p in ASSET_HASH) {
    e.respondWith(assetResponse(req, p));
    return;
  }
  e.respondWith(caches.match(req, { cacheName: CORE, ignoreSearch: true }).then((r) => r || fetch(req).then((res) => {
    if (res.ok) { const cp = res.clone(); caches.open(CORE).then((c) => c.put(req, cp)); }
    return res;
  })));
});

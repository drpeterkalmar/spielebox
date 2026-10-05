# Service-Worker lokal (Gutachten P2-7): zwei Caches (Kern je Version, Bilder versionslos), Update lädt nur geänderte
# Bilder nach, offline spielbar mit Karten. Läuft gegen eine Kopie der App in tests/out/swroot (dort wird für das
# Update sw.js und ein Bild verändert); der Server zählt die Abrufe unter assets/.
# Aufruf: python3 tests/test_sw.py
import sys, time, os, re, shutil, hashlib, threading, socket, functools
sys.path.insert(0, 'tests')
from util import *

c = Checker()
SRC = ROOT
DST = os.path.join(ROOT, 'tests', 'out', 'swroot')
shutil.rmtree(DST, ignore_errors=True)
os.makedirs(DST)
for f in ['index.html', 'manifest.webmanifest', 'sw.js']:
    shutil.copy(os.path.join(SRC, f), DST)
for d in ['css', 'src', 'lib', 'icons', 'assets']:
    shutil.copytree(os.path.join(SRC, d), os.path.join(DST, d))

hits = []


class Counting(Quiet):
    def do_GET(self):
        if self.path.startswith('/assets/'):
            hits.append(self.path)
        return super().do_GET()


def wait(fn, timeout=60, what='Bedingung'):
    t0 = time.time()
    while not fn():
        if time.time() - t0 > timeout:
            raise TimeoutError(what)
        time.sleep(0.2)


s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
httpd = BigQueueServer(('127.0.0.1', port), functools.partial(Counting, directory=DST))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{port}/'
sw = open(os.path.join(DST, 'sw.js')).read()
ver = re.search(r"const VERSION = '(\w+)'", sw).group(1)
n_core = len(re.search(r'const CORE_FILES = \[(.*?)\];', sw, re.S).group(1).split(','))
pre = re.findall(r"'([^']+)'", re.search(r'const PRE = \[(.*?)\];', sw, re.S).group(1))
n_pre = len(pre)

with sync_playwright() as pw:
    br = launch(pw)
    P = Page(br, base, 'hoch')
    P.pg.goto(base + 'index.html?nosw&tempo=test')     # App selbst registriert nur unter https
    P.pg.wait_for_function('window.__box && window.__box.ready', timeout=60000)
    old = os.environ.get('SW_ALT')   # Umstieg prüfen: zuerst dieser alte sw.js (ein Cache je Version), dann der neue
    if old:
        shutil.copy(old, os.path.join(DST, 'sw.js'))
        P.ev("navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => true)")
        wait(lambda: any(k.startswith('spielebox-') for k in P.ev('caches.keys()')), 60, 'alter SW installiert')
        time.sleep(1)
        print(f'  alter SW: {len(hits)} Abrufe unter assets/, Caches {P.ev("caches.keys()")}')
        hits.clear()
        open(os.path.join(DST, 'sw.js'), 'w').write(sw)
        P.ev("navigator.serviceWorker.getRegistration().then((r) => r.update()).then(() => true)")
        wait(lambda: f'spielebox-core-{ver}' in P.ev('caches.keys()') and len(P.ev('caches.keys()')) == 2, 60, 'neuer SW aktiv')
        c.ok(len(hits) <= 2, f'Umstieg: Bilder aus dem alten Cache übernommen ({len(hits)} Abrufe unter assets/: {hits[:3]})')
        hits.clear()
    P.ev("navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => true)")
    P.pg.reload()
    P.pg.wait_for_function('window.__box && window.__box.ready', timeout=60000)
    wait(lambda: P.ev('!!navigator.serviceWorker.controller'), 30, 'SW steuert die Seite')
    keys = P.ev('caches.keys()')
    c.ok(sorted(keys) == sorted([f'spielebox-core-{ver}', 'spielebox-assets']), f'zwei Caches {keys}')
    keyset = lambda: P.ev("caches.open('spielebox-assets').then((c) => c.keys()).then((k) => k.map((r) => r.url.replace(location.origin + '/', '')))")
    k0 = keyset()
    have = {k.split('?')[0] for k in k0}
    c.ok(all(p in have for p in pre), f'Bilder-Cache: alle {n_pre} vorab geladen ({len(k0)} Einträge mit den von der Seite geholten)')
    k1 = P.ev(f"caches.open('spielebox-core-{ver}').then((c) => c.keys()).then((k) => k.length)")
    c.ok(k1 >= n_core, f'Kern-Cache: {k1} Dateien (Liste {n_core})')
    first = len(hits)
    if not old: c.ok(first >= n_pre, f'erste Installation holt die Bilder ({first} Abrufe unter assets/)')

    # Update: neue Version, ein vorab geladenes Bild geändert
    changed = 'assets/cards/de/HA@2x.webp'
    with open(os.path.join(DST, changed), 'ab') as f:
        f.write(b'\0')
    nh = hashlib.sha256(open(os.path.join(DST, changed), 'rb').read()).hexdigest()[:10]
    sw2 = re.sub(r"'" + re.escape(changed) + r"': '\w+'", f"'{changed}': '{nh}'", sw).replace(f"const VERSION = '{ver}'", "const VERSION = 'neu0000001'")
    open(os.path.join(DST, 'sw.js'), 'w').write(sw2)
    hits.clear()
    P.ev("navigator.serviceWorker.getRegistration().then((r) => r.update()).then(() => true)")
    wait(lambda: 'spielebox-core-neu0000001' in P.ev('caches.keys()') and f'spielebox-core-{ver}' not in P.ev('caches.keys()'), 60, 'neue Version aktiv')
    keys2 = P.ev('caches.keys()')
    c.ok(sorted(keys2) == ['spielebox-assets', 'spielebox-core-neu0000001'], f'nach dem Update: alter Kern weg, Bilder-Cache bleibt {keys2}')
    c.ok(hits == ['/' + changed], f'Update holt nur das geänderte Bild ({hits[:5]})')
    akeys = keyset()
    c.ok(len(akeys) == len(k0) and not [k for k in akeys if k.startswith(changed + '?') and not k.endswith(nh)], f'Bilder-Cache behalten ({len(akeys)} Einträge), alte Fassung des geänderten Bildes entfernt')
    c.ok(f'{changed}?h={nh}' in akeys, 'geändertes Bild unter neuem Hash')

    # offline: neu laden, Karten aus dem Cache, Dame zu zweit
    P.ctx.set_offline(True)
    P.pg.reload()
    P.pg.wait_for_function('window.__box && window.__box.ready', timeout=30000)
    ok = P.ev("Promise.all(['assets/cards/de/HA@2x.webp', 'assets/cards/fr/AS@2x.webp', 'assets/wood/light.webp', 'assets/pieces/wK.svg'].map((u) => fetch(u).then((r) => r.ok, () => false)))")
    c.ok(all(ok), f'offline: Karten, Holz, Figuren aus dem Cache {ok}')
    P.ev("__box.local('bot', 'schnapsen', {}, 'weiss', 1)")
    time.sleep(1.0)
    imgs = P.ev("[...document.querySelectorAll('img, image')].filter((e) => /cards/.test(e.getAttribute('src') || e.getAttribute('href') || '')).length")
    c.ok(imgs > 0, f'offline: Schnapsen zeigt Karten ({imgs} Kartenbilder)')
    P.ev("__box.local('hotseat', 'dame', {rules: 'international'})")
    c.ok(P.ev("!!document.querySelector('svg.board') && __box.table().gs.n === 10"), 'offline: Dame 10×10 zu zweit spielbar')
    P.ctx.set_offline(False)
    errs = [e for e in P.app_errors() if 'ERR_INTERNET_DISCONNECTED' not in e]
    c.ok(errs == [], f'0 Fehler {errs[:3]}')
    P.close(); br.close()
httpd.shutdown(); httpd.server_close()
shutil.rmtree(DST, ignore_errors=True)
print('\nSERVICE-WORKER GRÜN' if not c.fails else f'\n{len(c.fails)} rot')
sys.exit(1 if c.fails else 0)

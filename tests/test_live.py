# Live-Prüfung gegen GitHub Pages: HTTP 200, Start ohne Fehler (hoch + quer), Version = lokal, Solo-Zug,
# PWA installierbar, Service-Worker aktiv, offline neu laden (Solo spielbar), Teilen-Link füllt die Wörter vor,
# und ein echter Beitritt zweier Kontexte über die Live-Seite (3 Wörter, öffentliche Relays).
# Aufruf: python3 tests/test_live.py [URL]
import sys, time, json, re, os, urllib.request
sys.path.insert(0, 'tests')
from util import *

URL = sys.argv[1] if len(sys.argv) > 1 else 'https://drpeterkalmar.github.io/spielebox/'
local = re.search(r"'(\w+)'", open(os.path.join(ROOT, 'src', 'build.js')).read()).group(1)
c = Checker()


def get(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'spielebox-live-check'}), timeout=30)
    return r.status, r.read()


st, body = get(URL)
c.ok(st == 200, f'HTTP {st} {URL}')
for path in ['sw.js', 'manifest.webmanifest', 'lib/trystero.js', 'src/app.js', 'assets/wood/light.webp', 'icons/icon-512.png']:
    s2, b2 = get(URL + path)
    c.ok(s2 == 200 and len(b2) > 100, f'HTTP {s2} {path} ({len(b2)} B)')
sw_live = get(URL + 'sw.js')[1].decode()
c.ok(f"'{local}'" in sw_live, f'sw.js live hat Version {local}')


def wait(fn, timeout=30, what='Bedingung'):
    t0 = time.time()
    while not fn():
        if time.time() - t0 > timeout:
            raise TimeoutError(what)
        time.sleep(0.1)


with sync_playwright() as pw:
    b = launch(pw)
    for form in ['hoch', 'quer']:
        print(form)
        P = Page(b, URL.rstrip('/') + '/', form)
        P.pg.goto(URL)
        P.pg.wait_for_function("window.__box && window.__box.ready", timeout=60000)
        build = P.ev("__box.build")
        c.ok(build == local, f'{form}: Version live {build} = lokal {local}')
        P.ev("__box.setName('Peter')")
        P.ev("__box.local('bot', 'muehle', {}, 'weiss', 1)")
        time.sleep(0.6)
        P.tap_target(9)
        wait(lambda: P.state()['table']['nmoves'] >= 2, 20, 'Bot antwortet live')
        c.ok(True, f'{form}: Solo gegen Computer live spielbar')
        P.pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'final', f'live_{form}.jpg'), type='jpeg', quality=82)
        if form == 'quer':
            cdp = P.ctx.new_cdp_session(P.pg)
            inst = cdp.send('Page.getInstallabilityErrors')
            c.ok(inst.get('installabilityErrors') == [], f"PWA installierbar {inst.get('installabilityErrors')}")
            sw = P.pg.evaluate("navigator.serviceWorker.ready.then(r => !!r.active)")
            c.ok(sw, 'Service-Worker aktiv')
            time.sleep(2)
            P.pg.goto(URL)
            P.pg.wait_for_function("window.__box && window.__box.ready", timeout=60000)
            P.ctx.set_offline(True)
            try:
                P.pg.reload()
                P.pg.wait_for_function("window.__box && window.__box.ready", timeout=30000)
                P.ev("__box.local('hotseat', 'dame', {rules: 'international'})")
                time.sleep(0.8)
                ok_board = P.ev("!!document.querySelector('svg.board') && __box.table().gs.n === 10")
                c.ok(ok_board, 'offline neu geladen (aus dem Cache), Dame 10×10 zu zweit offline spielbar')
                P.pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'dev', 'live_offline.png'))
            except Exception as e:
                c.ok(False, f'offline neu laden: {e}')
            P.ctx.set_offline(False)
        errs = P.app_errors()
        c.ok(errs == [], f'{form}: 0 Fehler {errs[:3]}')
        P.close()

    # Teilen-Link in frischem Kontext: Wörter stehen in den Beitreten-Feldern
    P = Page(b, URL, 'hoch')
    P.pg.goto(URL + '#baum-wolke-ball')
    P.pg.wait_for_function("window.__box && window.__box.ready", timeout=60000)
    vals = P.ev("[0,1,2].map(k => document.querySelector('#w' + k).value.toLowerCase())")
    c.ok(sorted(vals) == ['ball', 'baum', 'wolke'], f'Teilen-Link füllt die Wörter vor {vals}')
    c.ok(P.ev("!document.querySelector('[data-act=join]').disabled"), '„Mitspielen“ ist sofort bereit')
    P.pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'dev', 'live_link.png'))
    P.close()

    # echter Beitritt über die Live-Seite
    A = Page(b, URL, 'hoch', 'Host', rtc_all=True)
    Bp = Page(b, URL, 'hoch', 'Gast', rtc_all=True)
    for X in (A, Bp):
        X.pg.goto(URL)
        X.pg.wait_for_function("window.__box && window.__box.ready", timeout=60000)
    A.ev("__box.setName('Peter')"); Bp.ev("__box.setName('Anna')")
    A.ev("__box.create('dame', {rules: 'deutsch'})")
    wait(lambda: A.state()['words'], 20, 'Wörter')
    words = A.state()['words']
    t0 = time.time()
    Bp.ev(f"__box.join({json.dumps(words)}, 'play')")
    try:
        wait(lambda: Bp.state()['table'] and Bp.state()['table']['status'] == 'play', 90, 'Beitritt live')
        join_s = time.time() - t0
        c.ok(True, f'Live-Beitritt über die 3 Wörter in {join_s:.1f} s ({A.state()["net"]["mode"]})')
        for k in range(4):
            wait(lambda: A.state()['table']['seq'] == Bp.state()['table']['seq'] and not Bp.state()['pending'], 30, 'Gleichstand')
            t = A.state()['table']
            mover = A if A.state()['mySeat'] == t['turn'] else Bp
            n = t['nmoves']
            mover.ev("__box.botMove(1)")
            wait(lambda: A.state()['table']['nmoves'] == n + 1 and Bp.state()['table']['nmoves'] == n + 1, 30, 'Zug live')
        c.ok(True, 'Live: 4 Dame-Züge hin und her')
    except Exception as e:
        c.ok(False, f'Live-Beitritt: {e}')
    errs = A.app_errors() + Bp.app_errors()
    c.ok(errs == [], f'Live-Beitritt: 0 App-Fehler {errs[:3]} (Relay-Abbrüche: {len(A.net_events()) + len(Bp.net_events())})')
    A.close(); Bp.close()
    b.close()
print('\nLIVE', 'GRÜN' if not c.fails else f'ROT ({len(c.fails)})')
sys.exit(1 if c.fails else 0)

# Dame als Schwarz gegen den Computer: Brett gedreht (Schwarz unten), Züge per Tap funktionieren
import sys, time, json
sys.path.insert(0, 'tests')
from util import *
c = Checker()
with Server() as srv, sync_playwright() as pw:
    b = launch(pw)
    P = Page(b, srv.base, 'hoch').open()
    P.ev("__box.setName('Peter')")
    P.ev("__box.local('bot', 'dame', {rules: 'deutsch'}, 'schwarz', 1)")
    t0 = time.time()
    while P.state()['table']['nmoves'] < 1 and time.time() - t0 < 10: time.sleep(0.1)
    c.ok(P.state()['mySeat'] == 1, 'Peter spielt Schwarz')
    # eigener Stein muss unten stehen: Bildschirm-y eines schwarzen Steins > Brettmitte
    legal = P.ev("__box.legal()")
    y = P.ev(f"__box.target({legal[0]['from']})")[1]
    bc = P.board_check()
    c.ok(y > (bc['y0'] + bc['y1']) / 2, f'schwarze Steine unten (y {y:.0f} > Mitte {(bc["y0"] + bc["y1"]) / 2:.0f})')
    for k in range(3):
        legal = P.ev("__box.legal()")
        m = legal[0]
        n = P.state()['table']['nmoves']
        P.tap_target(m['from'])
        for sq in m['path']: P.tap_target(sq)
        t0 = time.time()
        while P.state()['table']['nmoves'] < n + 2 and time.time() - t0 < 10: time.sleep(0.1)
        c.ok(P.state()['table']['nmoves'] >= n + 1, f'Zug {k + 1} per Tap auf gedrehtem Brett')
    time.sleep(0.5)
    P.shot('dame8_schwarz_hoch', 'final')
    c.ok(P.app_errors() == [], f'0 Fehler {P.app_errors()[:3]}')
    b.close()
print('FLIP', 'GRÜN' if not c.fails else 'ROT')
sys.exit(1 if c.fails else 0)

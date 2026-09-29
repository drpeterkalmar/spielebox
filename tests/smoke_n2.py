# Rauchtest Tagesspurt (Pixel 7 hoch/quer, Desktop): neue Spiele mit echten Taps, Knöpfe ≥ 48 px,
# Brett ganz sichtbar, Zoom-Schutz, 0 Fehler. Screenshots → tests/shots/n2/.
# Aufruf: python3 tests/smoke_n2.py [schach] [schnapsen] [backgammon] [blackjack] [halma] [zoom]   (ohne Argument: alle)
import sys, time, json
sys.path.insert(0, 'tests')
from util import *

c = Checker()
ALL = ['zoom', 'schach', 'schnapsen', 'backgammon', 'blackjack', 'halma']
want = [a for a in sys.argv[1:] if a in ALL] or ALL


def wait(fn, timeout=20, what='Bedingung'):
    t0 = time.time()
    while not fn():
        if time.time() - t0 > timeout:
            raise TimeoutError(what)
        time.sleep(0.05)


def tbl(P):
    return P.state()['table']


def check_screen(P, label, board=True):
    sb = P.small_buttons()
    c.ok(sb == [], f'{label}: Knöpfe ≥ 48 px und im Bild {sb[:3]}')
    if board:
        bc = P.board_check()
        c.ok(bc['inside'], f'{label}: Brett ganz sichtbar ({bc["x0"]:.0f},{bc["y0"]:.0f})–({bc["x1"]:.0f},{bc["y1"]:.0f}) in {bc["W"]}×{bc["H"]}')
        c.ok(bc['minTargetPx'] >= 48, f'{label}: Touch-Ziele {bc["minTargetPx"]:.1f} px ≥ 48 (Brett {bc["sizePx"]:.0f} px)')


def tap_sq(P, sq):
    x, y = P.ev(f"__box.target({json.dumps(sq)})")
    P.tap_xy(x, y)


def zoom(P, form):
    bad = P.ev("""() => { const out = [];
      for (const el of document.querySelectorAll('*')) { const st = getComputedStyle(el);
        if (/(auto|scroll)/.test(st.overflowY + st.overflowX) && st.touchAction === 'auto' && el.scrollHeight > el.clientHeight) out.push(el.className || el.tagName); }
      for (const el of document.querySelectorAll('input, select, textarea')) { const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 16) out.push('input ' + (el.id || el.className) + ' ' + fs); }
      return out; }""")
    c.ok(bad == [], f'{form}: Scroll-Container mit touch-action, Eingabefelder ≥ 16 px {bad[:4]}')
    vp = P.ev("document.querySelector('meta[name=viewport]').content")
    c.ok('user-scalable=no' in vp and 'maximum-scale=1' in vp, f'{form}: Viewport sperrt Zoom ({vp})')
    if P.device != 'desktop':
        cdp = P.ctx.new_cdp_session(P.pg)
        for sel in ['.lobby-head h1', '.card.join h2']:
            box = P.pg.locator(sel).first.bounding_box()
            cdp.send('Input.synthesizeTapGesture', {'x': box['x'] + 10, 'y': box['y'] + 10, 'tapCount': 2, 'gestureSourceType': 'touch'})
            time.sleep(0.5)
        sc = P.ev("visualViewport.scale")
        c.ok(abs(sc - 1) < 1e-3, f'{form}: Doppeltipp zoomt nicht (visualViewport.scale = {sc})')


def schach(P, form):
    # zu zweit: 1. e4 e5 2. Sf3 Sc6 3. Lc4 Lc5 4. O-O (per Tipp auf König, dann auf den Turm)
    P.ev("__box.local('hotseat', 'schach', {})")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'schach' and tbl(P)['status'] == 'play', 10, 'Schach zu zweit')
    time.sleep(0.3)
    check_screen(P, f'{form} Schach')
    seq = [('e2', 'e4'), ('e7', 'e5'), ('g1', 'f3'), ('b8', 'c6'), ('f1', 'c4'), ('f8', 'c5')]
    for k, (a, b2) in enumerate(seq):
        n = tbl(P)['nmoves']
        tap_sq(P, a)
        if k == 0:
            dots = P.ev("document.querySelectorAll('.board .hint-dot').length")
            c.ok(dots == 2, f'{form}: e2 angetippt → 2 Zielfelder markiert ({dots})')
        tap_sq(P, b2)
        wait(lambda: tbl(P)['nmoves'] == n + 1, 5, f'Zug {a}-{b2}')
    n = tbl(P)['nmoves']
    tap_sq(P, 'e1'); tap_sq(P, 'h1')
    anims = P.ev("document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.pieces')).length")
    wait(lambda: tbl(P)['nmoves'] == n + 1, 5, 'Rochade')
    b = P.ev("__box.table().gs.fen").split(' ')[0]
    c.ok(b.endswith('RNBQ1RK1'), f'{form}: Rochade per Tipp auf König + Turm ({b.split("/")[-1]}), {anims} Animation(en)')
    moves = P.ev("[...document.querySelectorAll('.movelist li')].map(e => e.textContent)")
    c.ok('Sf3' in moves and 'O-O' in moves, f'{form}: Zugliste deutsch ({" ".join(moves)})')
    P.shot(f'schach_{form}', 'n2')
    # Menü → PGN vorhanden
    P.tap('[data-act="menu"]')
    time.sleep(0.3)
    c.ok(P.ev("!!document.querySelector('[data-act=pgn]')"), f'{form}: Menü hat „Partie als PGN teilen“')
    P.pg.keyboard.press('Escape')
    time.sleep(0.3)
    # gegen Computer als Schwarz: Brett gedreht, Computer zieht zuerst
    P.ev("__box.local('bot', 'schach', {}, 'schwarz', 1)")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'schach' and tbl(P)['nmoves'] >= 1, 15, 'Computer zieht')
    y1 = P.ev("__box.target('e1')[1]"); y8 = P.ev("__box.target('e8')[1]")
    c.ok(y1 < y8, f'{form}: als Schwarz ist das Brett gedreht (e1 oben)')
    legal = P.ev("__box.legal()")
    m = legal[0]
    n = tbl(P)['nmoves']
    tap_sq(P, m['from']); tap_sq(P, m['to'])
    wait(lambda: tbl(P)['nmoves'] >= n + 2, 15, 'eigener Zug + Antwort des Computers')
    c.ok(True, f'{form}: gegen Computer gezogen, Computer hat geantwortet')
    P.shot(f'schach_bot_{form}', 'n2')


with Server() as srv, sync_playwright() as pw:
    b = launch(pw)
    for form in ['hoch', 'quer', 'desktop']:
        print(form, flush=True)
        P = Page(b, srv.base, form).open()
        c.ok(P.boot_s < 10, f'{form}: Start in {P.boot_s:.1f} s')
        time.sleep(0.3)
        check_screen(P, f'{form} Lobby', board=False)
        P.shot(f'lobby_{form}', 'n2')
        if 'zoom' in want: zoom(P, form)
        for g in want:
            if g == 'zoom': continue
            fn = globals().get(g)
            if not fn: continue
            try:
                fn(P, form)
            except Exception as e:
                c.ok(False, f'{form} {g}: Ausnahme {e}')
                P.shot(f'fehler_{g}_{form}', 'n2')
        errs = P.app_errors()
        c.ok(errs == [], f'{form}: 0 App-Fehler {errs[:3]}')
        P.close()
    b.close()

print(f'\n{"ALLES GRÜN" if not c.fails else str(len(c.fails)) + " FEHLER"}')
sys.exit(1 if c.fails else 0)

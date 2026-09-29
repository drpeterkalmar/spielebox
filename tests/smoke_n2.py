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
        W, H = P.ev("[innerWidth, innerHeight]")
        for (x, y) in [(W * 0.5, 60), (W * 0.3, H * 0.5)]:
            cdp.send('Input.synthesizeTapGesture', {'x': x, 'y': y, 'tapCount': 2, 'gestureSourceType': 'touch'})
            time.sleep(0.5)
        sc = P.ev("visualViewport.scale")
        P.ev("document.querySelectorAll('.sheet-wrap').forEach(e => e.remove())")
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


def schnapsen(P, form):
    P.ev("__box.local('bot', 'schnapsen', {}, 'weiss', 1)")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'schnapsen' and P.ev("__box.table().gs.phase") == 'play', 10, 'Schnapsen ausgeteilt')
    wait(lambda: P.ev("__box.legal().length") > 0, 15, 'ich bin am Zug')
    time.sleep(0.4)
    check_screen(P, f'{form} Schnapsen')
    m = P.metrics()
    c.ok(m['cardW'] >= 48, f'{form}: Handkarten {m["cardW"]:.0f} px breit (≥ 48)')
    hand = P.ev("[...document.querySelectorAll('.hand [data-hand]')].map(e => e.dataset.hand)")
    opp = P.ev("document.querySelectorAll('.opp .card:not(.back)').length")
    c.ok(len(hand) == 5 and opp == 0, f'{form}: 5 eigene Karten offen ({" ".join(hand)}), Gegner nur Rücken')
    dom_leak = P.ev("(() => { const g = __box.table().gs; const other = g.hands[1]; return other.filter(c => document.querySelector(`[data-card=\"${c}\"]`)).length; })()")
    c.ok(dom_leak == 0, f'{form}: keine Gegnerkarte im Bild (DOM)')
    P.shot(f'schnapsen_{form}', 'n2')
    legal = [x for x in P.ev("__box.legal()") if x['type'] == 'play']
    card = legal[0]['card']
    n = tbl(P)['nmoves']
    x, y = P.ev(f"__box.target('{card}')"); P.tap_xy(x, y)
    time.sleep(0.2)
    x, y = P.ev(f"__box.target('{card}')"); P.tap_xy(x, y)
    wait(lambda: tbl(P)['nmoves'] >= n + 1, 5, 'Karte ausgespielt')
    wait(lambda: tbl(P)['nmoves'] >= n + 2, 10, 'Computer antwortet')
    time.sleep(0.4)
    c.ok(True, f'{form}: Karte {card} per Doppeltipp ausgespielt, Computer hat geantwortet')
    P.shot(f'schnapsen_stich_{form}', 'n2')
    # zu zweit: Sichtschutz vor der ersten Hand
    P.ev("__box.local('hotseat', 'schnapsen', {})")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'schnapsen' and P.ev("__box.table().gs.phase") == 'play', 10, 'zu zweit')
    time.sleep(0.3)
    ov = P.ev("!!document.querySelector('[data-overlay=handoff]')")
    shown = P.ev("document.querySelectorAll('.hand [data-hand]').length")
    c.ok(ov and shown == 0, f'{form}: zu zweit → Sichtschutz „Gerät weitergeben“, keine Karte sichtbar')
    P.shot(f'schnapsen_sichtschutz_{form}', 'n2')
    P.tap('[data-act="unlock"]')
    time.sleep(0.3)
    c.ok(P.ev("document.querySelectorAll('.hand [data-hand]').length") == 5, f'{form}: nach „Karten zeigen“ 5 Karten sichtbar')


def backgammon(P, form):
    P.ev("__box.local('bot', 'backgammon', {cube: true}, 'weiss', 1)")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'backgammon' and P.ev("__box.legal().length") > 0, 20, 'ich bin am Zug')
    time.sleep(0.4)
    if P.ev("__box.table().gs.phase") == 'roll':
        c.ok(P.ev("!!document.querySelector('[data-act=roll]')"), f'{form}: Knopf „Würfeln“')
        P.tap('[data-act="roll"]')
        wait(lambda: P.ev("__box.table().gs.phase") == 'move', 10, 'gewürfelt')
    time.sleep(0.9)
    check_screen(P, f'{form} Backgammon')
    dice = P.ev("document.querySelectorAll('.board .die').length")
    c.ok(dice >= 2, f'{form}: Würfel sichtbar ({dice})')
    P.shot(f'backgammon_{form}', 'n2')
    legal = P.ev("__box.legal()")
    m = max(legal, key=lambda x: len(x.get('steps', [])))
    n = tbl(P)['nmoves']
    for k, st in enumerate(m['steps']):
        # nach einem Teilzug bleibt derselbe Stein gewählt, wenn er weiterziehen kann
        if not (k and m['steps'][k - 1]['to'] == st['from']):
            x, y = P.ev(f"__box.target({json.dumps(st['from'])})"); P.tap_xy(x, y)
        if k == 0:
            tg = P.ev("document.querySelectorAll('.board .pt-target').length")
            c.ok(tg >= 1, f'{form}: Stein angetippt → {tg} Ziel(e) leuchten')
        if st['to'] == 'off':
            P.tap('[data-act="off"]')
        else:
            x, y = P.ev(f"__box.target({st['to']})"); P.tap_xy(x, y)
        time.sleep(0.15)
    P.shot(f'backgammon_zug_{form}', 'n2')
    c.ok(P.ev("!document.querySelector('[data-act=done]').disabled"), f'{form}: „Fertig“ aktiv nach {len(m["steps"])} Teilzügen')
    if m['steps']:
        P.tap('[data-act="undo"]')
        time.sleep(0.2)
        c.ok(P.ev("document.querySelector('[data-act=done]').disabled"), f'{form}: „Zurück“ nimmt einen Teilzug zurück')
        st = m['steps'][-1]
        if not (len(m['steps']) > 1 and m['steps'][-2]['to'] == st['from']):
            x, y = P.ev(f"__box.target({json.dumps(st['from'])})"); P.tap_xy(x, y)
        if st['to'] == 'off': P.tap('[data-act="off"]')
        else:
            x, y = P.ev(f"__box.target({st['to']})"); P.tap_xy(x, y)
        time.sleep(0.2)
    P.tap('[data-act="done"]')
    wait(lambda: tbl(P)['nmoves'] >= n + 1, 5, 'Zug abgeschickt')
    wait(lambda: tbl(P)['nmoves'] >= n + 3 or tbl(P)['status'] != 'play', 20, 'Computer würfelt und zieht')
    c.ok(True, f'{form}: Zug per Taps gespielt, Computer hat geantwortet')


with Server() as srv, sync_playwright() as pw:
    b = launch(pw)
    for form in ['hoch', 'quer', 'desktop']:
        print(form, flush=True)
        P = Page(b, srv.base, form).open('?nosw&alle')
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

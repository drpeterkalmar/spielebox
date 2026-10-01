# Rauchtest n4 (Pixel 7 hoch/quer, Desktop): die neuen Klassiker mit echten Taps, Knöpfe ≥ 48 px, Brett ganz sichtbar,
# Computer-Tempo (Banner/Ereignisse), 0 Fehler. Screenshots → tests/shots/n4/.
# Aufruf: python3 tests/smoke_n4.py [ludo] [vier] [maumau] [wuerfel] [schiffe] [reversi] [--nur hoch,quer]   (ohne Argument: alle)
import sys, time, json
sys.path.insert(0, 'tests')
from util import *

c = Checker()
ALL = ['ludo', 'vier', 'maumau', 'wuerfel', 'schiffe', 'reversi']
want = [a for a in sys.argv[1:] if a in ALL] or ALL
forms = ['hoch', 'quer', 'desktop']
for a in sys.argv[1:]:
    if a.startswith('--nur='): forms = a.split('=', 1)[1].split(',')


def wait(fn, timeout=20, what='Bedingung'):
    t0 = time.time()
    while not fn():
        if time.time() - t0 > timeout:
            raise TimeoutError(what)
        time.sleep(0.05)


def tbl(P):
    return P.state()['table']


def gs(P):
    return P.ev("__box.table().gs")


def check_screen(P, label, board=True, target=True):
    sb = P.small_buttons()
    c.ok(sb == [], f'{label}: Knöpfe ≥ 48 px und im Bild {sb[:3]}')
    if board:
        bc = P.board_check()
        c.ok(bc['inside'], f'{label}: Brett ganz sichtbar ({bc["x0"]:.0f},{bc["y0"]:.0f})–({bc["x1"]:.0f},{bc["y1"]:.0f}) in {bc["W"]}×{bc["H"]}')
        if target:
            c.ok(bc['minTargetPx'] >= 48, f'{label}: Touch-Ziele {bc["minTargetPx"]:.1f} px ≥ 48 (Brett {bc["sizePx"]:.0f} px)')
        return bc


def tap_target(P, x):
    px, py = P.ev(f"__box.target({json.dumps(x)})")
    P.tap_xy(px, py)


def my_turn(P):
    return P.ev("__box.legal().length") > 0 and not P.ev("__box.busy()")


def ludo(P, form):
    P.ev("__box.local('bot', 'ludo', {players: 4}, 'weiss', 1)")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'ludo' and my_turn(P), 15, 'Ludo: ich bin dran')
    time.sleep(0.3)
    bc = check_screen(P, f'{form} Ludo', target=False)
    m = P.metrics()
    print(f'    Feld {m["fieldPx"]:.1f} px (Tipp → nächster Kandidat), Brett {m["boardPx"]:.0f} px')
    chips = P.ev("document.querySelectorAll('.tmain .pchip, .side-players .pchip').length")
    c.ok(chips >= 3, f'{form}: Mehr-Sitz-Leiste zeigt die anderen Farben ({chips})')
    P.shot(f'ludo_start_{form}', 'n4')
    moved = 0
    for rnd in range(8):
        wait(lambda: my_turn(P) or tbl(P)['status'] != 'play', 30, 'wieder dran')
        if tbl(P)['status'] != 'play': break
        g = gs(P)
        if g['phase'] == 'roll':
            n = tbl(P)['nmoves']
            if rnd % 2: tap_target(P, 'die')
            else: P.tap('[data-act="roll"]')
            wait(lambda: tbl(P)['nmoves'] > n, 5, 'gewürfelt')
            continue
        if g['phase'] == 'move':
            legal = P.ev("__box.legal()")
            k = legal[0]['piece']
            before = g['pieces'][0][k]
            dots = P.ev("document.querySelectorAll('.board .hint-dot').length")
            n = tbl(P)['nmoves']
            # Figur leicht daneben antippen → trotzdem die richtige
            x, y = P.ev(f"__box.target([0, {k}])"); P.tap_xy(x + 5, y - 5)
            wait(lambda: tbl(P)['nmoves'] > n, 5, 'gezogen')
            after = P.ev(f"__box.table().gs.pieces[0][{k}]")
            if moved == 0:
                c.ok(dots >= 1 and after != before, f'{form}: Figur per Tipp gezogen ({before} → {after}), {dots} Ziel(e) markiert')
                P.shot(f'ludo_zug_{form}', 'n4')
            moved += 1
    c.ok(moved >= 1, f'{form}: Ludo – {moved} eigene Züge, Computer haben gezogen (Zug {tbl(P)["nmoves"]})')
    ev = P.ev("__box.events().map(e => e.text)")
    c.ok(any('würfel' in e for e in ev), f'{form}: Ereignisse „würfelt …“ ({ev[-3:]})')
    P.shot(f'ludo_{form}', 'n4')
    # zu zweit an einem Gerät: Rot gegen Grün
    P.ev("__box.local('hotseat', 'ludo', {players: 2})")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'ludo' and P.ev("__box.table().gs.n") == 2, 10, 'Ludo zu zweit')
    time.sleep(0.3)
    cols = P.ev("__box.table().gs.colors")
    c.ok(cols == [0, 2], f'{form}: zu zweit Rot gegen Grün ({cols})')
    P.tap('[data-act="roll"]')
    time.sleep(0.4)
    P.shot(f'ludo_zuzweit_{form}', 'n4')


def schiffe(P, form):
    P.ev("__box.local('bot', 'schiffe', {}, 'weiss', 1)")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'schiffe' and my_turn(P), 15, 'Schiffe: aufstellen')
    time.sleep(0.3)
    check_screen(P, f'{form} Schiffe aufstellen', target=False)
    m = P.metrics()
    print(f'    Feld {m["cellPx"]:.1f} px (Schuss mit Fadenkreuz + zweitem Tipp)')
    P.tap('[data-act="shuffle"]')
    # ein Schiff verschieben: Schiff antippen, freies Feld antippen (eins, wo es passt)
    fl = P.ev("__box.view().fleet()")
    sh = fl[-1]
    occ = set()
    for x in fl:
        for j in range(x['len']):
            r, c0 = (x['r'] + j, x['c']) if x['dir'] == 'v' else (x['r'], x['c'] + j)
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1): occ.add((r + dr) * 10 + c0 + dc)
    free = next(i for i in range(100) if all(((i // 10) + (j if sh['dir'] == 'v' else 0)) * 10 + (i % 10) + (j if sh['dir'] == 'h' else 0) not in occ and (i % 10) + (j if sh['dir'] == 'h' else 0) < 10 and (i // 10) + (j if sh['dir'] == 'v' else 0) < 10 for j in range(sh['len'])))
    tap_target(P, sh['r'] * 10 + sh['c'])
    tap_target(P, free)
    nf = P.ev("__box.view().fleet()")[-1]
    c.ok(nf['r'] * 10 + nf['c'] == free and P.ev("__box.view().fleetOk()"), f'{form}: Schiff per Tipp verschoben ({sh["r"]},{sh["c"]} → {nf["r"]},{nf["c"]}), Flotte gültig')
    P.tap('[data-act="rotate"]')
    rot = P.ev("__box.view().fleet()")[-1]['dir']
    c.ok(rot != sh['dir'], f'{form}: „Drehen“ dreht das gewählte Schiff ({sh["dir"]} → {rot})')
    if not P.ev("__box.view().fleetOk()"): P.tap('[data-act="shuffle"]')
    # ein Schiff verschieben: Schiff antippen, leeres Feld antippen
    P.shot(f'schiffe_aufstellen_{form}', 'n4')
    P.tap('[data-act="place"]')
    wait(lambda: P.ev("__box.table().gs.phase") == 'shoot' and my_turn(P), 15, 'Computer hat aufgestellt, ich schieße')
    dom = P.ev("document.querySelectorAll('.board-schiffe .sv-ship').length")
    c.ok(dom == 5, f'{form}: eigene Flotte gesetzt, im Bild nur die eigenen 5 Schiffe ({dom})')
    time.sleep(0.2)
    check_screen(P, f'{form} Schiffe schießen', target=False)
    for k, i in enumerate([44, 45, 54, 55, 22, 77]):
        wait(lambda: my_turn(P) or tbl(P)['status'] != 'play', 20, 'wieder dran')
        if tbl(P)['status'] != 'play': break
        n = len(gs(P)['shots'][0])
        tap_target(P, i)
        if k == 0:
            acts = P.ev("[...document.querySelectorAll('.actions [data-act]')].map(e => e.dataset.act)")
            c.ok('fire' in acts, f'{form}: Fadenkreuz gesetzt, Knopf „Feuer“ ({acts})')
            P.tap('[data-act="fire"]')
        else:
            tap_target(P, i)
        wait(lambda: len(gs(P)['shots'][0]) > n, 5, 'Schuss')
    c.ok(len(gs(P)['shots'][0]) >= 4, f'{form}: {len(gs(P)["shots"][0])} Schüsse per Tipp, Computer schießt zurück ({len(gs(P)["shots"][1])})')
    time.sleep(0.4)
    P.shot(f'schiffe_{form}', 'n4')
    # zu zweit an einem Gerät: Sichtschutz zwischen den Zügen
    P.ev("__box.local('hotseat', 'schiffe', {})")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'schiffe' and P.ev("!!document.querySelector('[data-act=unlock]')"), 10, 'Sichtschutz')
    for k in range(2):
        P.tap('[data-act="unlock"]')
        wait(lambda: P.ev("!!document.querySelector('[data-act=place]')"), 5, 'aufstellen')
        P.tap('[data-act="place"]')
        time.sleep(0.3)
    wait(lambda: P.ev("!!document.querySelector('[data-act=unlock]')"), 5, 'Sichtschutz vor dem Schießen')
    P.tap('[data-act="unlock"]')
    time.sleep(0.2)
    tap_target(P, 33); tap_target(P, 33)
    wait(lambda: P.ev("!!document.querySelector('.handoff-note')"), 5, 'Sichtschutz mit Ergebnis')
    note = P.ev("document.querySelector('.handoff-note').textContent")
    c.ok('D4' in note, f'{form}: zu zweit – Sichtschutz zeigt das Ergebnis „{note}“')
    P.shot(f'schiffe_zuzweit_{form}', 'n4')


with Server() as srv, sync_playwright() as pw:
    b = launch(pw)
    for form in forms:
        print(form, flush=True)
        P = Page(b, srv.base, form).open('?nosw&alle')
        c.ok(P.boot_s < 10, f'{form}: Start in {P.boot_s:.1f} s')
        time.sleep(0.3)
        check_screen(P, f'{form} Lobby', board=False)
        P.shot(f'lobby_{form}', 'n4')
        for g in want:
            fn = globals().get(g)
            if not fn: continue
            try:
                fn(P, form)
            except Exception as e:
                c.ok(False, f'{form} {g}: Ausnahme {e}')
                P.shot(f'fehler_{g}_{form}', 'n4')
        errs = P.app_errors()
        c.ok(errs == [], f'{form}: 0 App-Fehler {errs[:3]}')
        P.close()
    b.close()

print(f'\n{"ALLES GRÜN" if not c.fails else str(len(c.fails)) + " FEHLER"}')
sys.exit(1 if c.fails else 0)

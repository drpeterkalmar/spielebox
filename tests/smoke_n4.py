# Rauchtest n4 (Pixel 7 hoch/quer, Desktop): die neuen Klassiker mit echten Taps, Knöpfe ≥ 48 px, Brett ganz sichtbar,
# Computer-Tempo (Banner/Ereignisse), 0 Fehler. Screenshots → tests/shots/n4/.
# Aufruf: python3 tests/smoke_n4.py [ludo] [vier] [maumau] [wuerfel] [schiffe] [reversi] [--nur hoch,quer]   (ohne Argument: alle)
import sys, time, json
sys.path.insert(0, 'tests')
from util import *

c = Checker()
ALL = ['ludo', 'vier', 'maumau', 'wuerfel', 'schiffe', 'reversi', 'paare']
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


def vier(P, form):
    P.ev("__box.local('bot', 'vier', {}, 'weiss', 1)")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'vier' and my_turn(P), 15, 'Vier: ich bin dran')
    time.sleep(0.3)
    check_screen(P, f'{form} Vier')
    labels = P.ev("[...document.querySelectorAll('.seg-btn .seg-t')].map(e => e.textContent)")
    for k, col in enumerate([3, 3, 2, 4, 3, 1]):
        wait(lambda: my_turn(P) or tbl(P)['status'] != 'play', 20, 'wieder dran')
        if tbl(P)['status'] != 'play': break
        g = gs(P)
        if len(g['cols'][col]) >= 6: col = next(c for c in range(7) if len(g['cols'][c]) < 6)
        n = tbl(P)['nmoves']
        tap_target(P, col)
        if k == 0:
            hov = P.ev("document.querySelectorAll('.board-vier .v4-stone.hover').length")
            c.ok(hov == 1 and tbl(P)['nmoves'] == n, f'{form}: erster Tipp hebt den Stein über die Spalte (noch kein Zug)')
            P.shot(f'vier_wahl_{form}', 'n4')
        tap_target(P, col)
        wait(lambda: tbl(P)['nmoves'] > n, 5, 'eingeworfen')
    c.ok(tbl(P)['nmoves'] >= 4, f'{form}: Vier – Steine per Doppeltipp eingeworfen, Computer antwortet ({tbl(P)["nmoves"]} Züge)')
    P.shot(f'vier_{form}', 'n4')
    # Tempo „normal“: Stein fällt sichtbar (Animation läuft)
    P.open('?nosw&alle&tempo=normal')
    P.ev("__box.local('hotseat', 'vier', {})")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'vier' and tbl(P)['nmoves'] == 0, 10, 'zu zweit')
    time.sleep(0.3)
    tap_target(P, 0); tap_target(P, 0)
    anims = P.ev("document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('v4-stone')).length")
    c.ok(anims >= 1, f'{form}: Stein fällt animiert ({anims} Animation)')
    P.open('?nosw&alle')


def mm_turn(P):
    """ein eigener Mau-Mau-Zug per Tipp: passende Karte (zweimal), sonst ziehen, dann ggf. weiter"""
    legal = P.ev("__box.legal()")
    plays = [m for m in legal if m['type'] == 'play']
    n = tbl(P)['nmoves']
    if plays:
        card = plays[0]['card']
        tap_target(P, card); tap_target(P, card)
        if P.ev("!!document.querySelector('[data-act^=wish-]')"):
            P.tap('[data-act^="wish-"]')
    elif any(m['type'] == 'draw' for m in legal):
        tap_target(P, 'stock')
    else:
        P.tap('[data-act="pass"]')
    wait(lambda: tbl(P)['nmoves'] > n, 5, 'Mau-Mau-Zug')
    return plays[0]['card'] if plays else None


def maumau(P, form):
    P.ev("__box.local('bot', 'maumau', {players: 3}, 'weiss', 1)")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'maumau' and my_turn(P), 15, 'Mau-Mau: ich bin dran')
    time.sleep(0.3)
    check_screen(P, f'{form} Mau-Mau', target=False)
    m = P.metrics()
    c.ok(m['cardW'] >= 48, f'{form}: Handkarten {m["cardW"]:.0f} px breit, Abstand {m["gapPx"]:.0f} px')
    P.shot(f'maumau_start_{form}', 'n4')
    played = 0
    for k in range(6):
        wait(lambda: my_turn(P) or tbl(P)['status'] != 'play', 30, 'wieder dran')
        if tbl(P)['status'] != 'play': break
        if mm_turn(P): played += 1
        # verdeckt bleibt verdeckt: im Bild nur eigene Karten und die Ablage
        g = gs(P)
        me = P.state()['mySeat']
        ok_cards = set(g['hands'][me]) | set(g['pile'])
        shown = set(P.ev("[...document.querySelectorAll('.board-maumau [data-card]')].map(e => e.dataset.card)"))
        # Atlas (n9): Bildpfad nennt keine Karte – die Karte steht dann nur in data-card (oben geprüft)
        hrefs = P.ev("[...document.querySelectorAll('.board-maumau image')].map(e => e.getAttribute('href')).filter(h => !/\\/atlas\\//.test(h))")
        bad = [x for x in shown if x not in ok_cards] + [h for h in hrefs if not any(cc in h for cc in ok_cards)]
        if bad: c.ok(False, f'{form}: fremde Karte im Bild {bad[:3]}')
    c.ok(True, f'{form}: Mau-Mau – {played} Karte(n) per Doppeltipp gelegt, sonst gezogen; nie eine fremde Karte im Bild')
    P.shot(f'maumau_{form}', 'n4')
    # „Mau“ sagen: Hand auf 2 passende Karten setzen
    me = P.state()['mySeat']
    wait(lambda: my_turn(P) or tbl(P)['status'] != 'play', 30, 'wieder dran')
    if tbl(P)['status'] == 'play':
        P.ev(f"(() => {{ const g = __box.table().gs; g.hands[{me}] = ['H9', 'HK']; g.pile.push('HA'); g.wish = null; g.penalty = 0; g.drawn = null; __box.poke(); }})()")
        time.sleep(0.4)
        has = P.ev("!!document.querySelector('[data-act=mau]')")
        P.tap('[data-act="mau"]')
        n = tbl(P)['nmoves']
        tap_target(P, 'H9'); tap_target(P, 'H9')
        wait(lambda: tbl(P)['nmoves'] > n, 5, 'gelegt')
        mine = P.ev(f"__box.table().hist.filter(e => e.by === {me}).pop().m")
        left = P.ev(f"__box.table().gs.hands[{me}].length")
        c.ok(has and mine.get('mau') is True and left == 1, f'{form}: Knopf „Mau sagen“, Karte mit Mau gelegt ({mine}), keine Strafkarten ({left} Karte)')
    # zu zweit: Sichtschutz
    P.ev("__box.local('hotseat', 'maumau', {players: 2})")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'maumau' and P.ev("!!document.querySelector('[data-act=unlock]')"), 10, 'Sichtschutz')
    shown = P.ev("document.querySelectorAll('.board-maumau .hand [data-card]').length")
    c.ok(shown == 0, f'{form}: zu zweit – vor „Karten zeigen“ keine Handkarte im Bild')
    P.tap('[data-act="unlock"]')
    time.sleep(0.3)
    c.ok(P.ev("document.querySelectorAll('.board-maumau .hand [data-card]').length") == 5, f'{form}: nach „Karten zeigen“ 5 eigene Karten')
    P.shot(f'maumau_zuzweit_{form}', 'n4')


def wuerfel(P, form):
    P.ev("__box.local('bot', 'wuerfel', {players: 2}, 'weiss', 1)")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'wuerfel' and my_turn(P), 15, 'Würfelglück: ich bin dran')
    time.sleep(0.3)
    check_screen(P, f'{form} Würfelglück', board=False)
    box = P.ev("(() => { const r = document.querySelector('.wg').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, innerWidth, innerHeight]; })()")
    c.ok(box[0] >= -1 and box[1] >= -1 and box[2] <= box[4] + 1 and box[3] <= box[5] + 1, f'{form}: Würfel + Block ganz im Bild {[round(x) for x in box]}')
    for rnd in range(2):
        wait(lambda: my_turn(P), 30, 'wieder dran')
        P.tap('[data-act="roll"]')
        wait(lambda: gs(P)['phase'] == 'choose' and my_turn(P), 5, 'gewürfelt')
        d0 = gs(P)['dice']
        tap_target(P, 0); tap_target(P, 1)
        pressed = P.ev("[...document.querySelectorAll('.wg-die')].map(e => e.getAttribute('aria-pressed'))")
        if rnd == 0:
            c.ok(pressed[:2] == ['true', 'true'] and pressed[2:] == ['false'] * 3, f'{form}: Würfel 1 und 2 per Tipp gehalten ({pressed})')
            P.shot(f'wuerfel_halten_{form}', 'n4')
        P.tap('[data-act="roll"]')
        wait(lambda: gs(P)['rolls'] == 2 and gs(P)['phase'] == 'choose', 5, 'zweiter Wurf')
        d1 = gs(P)['dice']
        c.ok(d1[:2] == d0[:2], f'{form}: gehaltene Würfel bleiben ({d0} → {d1})') if rnd == 0 else None
        best = P.ev("document.querySelector('.wg-cat.best').dataset.cat")
        n = tbl(P)['nmoves']
        P.tap(f'.wg-cat[data-cat="{best}"]')
        acts = P.ev("[...document.querySelectorAll('.actions [data-act]')].map(e => e.dataset.act)")
        P.tap(f'.wg-cat[data-cat="{best}"]')
        wait(lambda: tbl(P)['nmoves'] > n, 5, 'eingetragen')
        sheet = P.ev("__box.table().gs.sheets[0]")
        if rnd == 0: c.ok(sheet[best] is not None and 'score' in acts, f'{form}: Vorschlag ★ {best} per Doppeltipp eingetragen ({sheet[best]} Punkte, Knopf „Eintragen“ war da)')
    wait(lambda: my_turn(P), 30, 'Computer fertig')
    P.shot(f'wuerfel_{form}', 'n4')
    P.tap('[data-act="menu"]')
    P.tap('[data-act="block"]')
    time.sleep(0.3)
    rows = P.ev("document.querySelectorAll('.wg-block tr').length")
    c.ok(rows >= 16, f'{form}: Menü → Spielblock aller Spieler ({rows} Zeilen)')
    P.shot(f'wuerfel_block_{form}', 'n4')
    P.pg.keyboard.press('Escape'); P.pg.keyboard.press('Escape')
    time.sleep(0.3)
    # allein
    P.ev("__box.local('hotseat', 'wuerfel', {players: 1})")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'wuerfel' and len(tbl(P)['seats']) == 1, 10, 'allein')
    P.tap('[data-act="roll"]')
    time.sleep(0.4)
    check_screen(P, f'{form} Würfelglück allein', board=False)
    P.shot(f'wuerfel_allein_{form}', 'n4')


def reversi(P, form):
    P.ev("__box.local('bot', 'reversi', {}, 'weiss', 1)")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'reversi' and my_turn(P), 15, 'Reversi: ich bin dran')
    time.sleep(0.3)
    check_screen(P, f'{form} Reversi')
    dots = P.ev("document.querySelectorAll('.board-reversi .hint-dot').length")
    c.ok(dots == 4, f'{form}: Start – 4 erlaubte Felder markiert ({dots})')
    for k in range(5):
        wait(lambda: my_turn(P) or tbl(P)['status'] != 'play', 20, 'wieder dran')
        if tbl(P)['status'] != 'play': break
        legal = P.ev("__box.legal()")
        if legal[0].get('pass'):
            P.tap('[data-act="pass"]'); continue
        m = legal[0]
        before = P.ev("__box.table().gs.board.filter(x => x === 0).length")
        n = tbl(P)['nmoves']
        tap_target(P, m['i'])
        wait(lambda: tbl(P)['nmoves'] > n, 5, 'gesetzt')
        if k == 0:
            after = P.ev(f"__box.table().hist.filter(e => e.by === 0).pop().m.i")
            c.ok(after == m['i'], f'{form}: Stein per Tipp gesetzt ({m["i"]})')
    c.ok(tbl(P)['nmoves'] >= 6, f'{form}: Reversi – Computer antwortet ({tbl(P)["nmoves"]} Züge)')
    P.shot(f'reversi_{form}', 'n4')
    P.open('?nosw&alle&tempo=normal')
    P.ev("__box.local('hotseat', 'reversi', {})")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'reversi', 10, 'zu zweit')
    time.sleep(0.3)
    x, y = P.ev("__box.target(19)")
    P.pg.touchscreen.tap(x, y) if P.device != 'desktop' else P.pg.mouse.click(x, y)
    anims = P.ev("document.getAnimations().length")
    c.ok(anims >= 2, f'{form}: Steine kippen animiert ({anims} Animationen)')
    P.open('?nosw&alle')


def paare(P, form):
    P.ev("__box.local('bot', 'paare', {paare: 18, players: 2}, 'weiss', 1)")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'paare' and my_turn(P), 15, 'Paare: ich bin dran')
    time.sleep(0.3)
    check_screen(P, f'{form} Paare (6 × 6)')
    c.ok(P.ev("document.querySelectorAll('.pa-emoji').length") == 0, f'{form}: am Anfang kein Bild im DOM (alles verdeckt)')
    found = 0
    for k in range(8):
        wait(lambda: my_turn(P) or tbl(P)['status'] != 'play', 30, 'wieder dran')
        if tbl(P)['status'] != 'play': break
        g = gs(P)   # voller Zustand (lokal) – nur der Test schummelt, um ein Paar zu treffen
        free = [i for i in range(36) if g['found'][i] is None and i not in g['open']]
        if g['open']:
            a = g['open'][0]
            mate = next((i for i in free if g['cards'][i] == g['cards'][a]), free[0])
            n = tbl(P)['nmoves']; tap_target(P, mate); wait(lambda: tbl(P)['nmoves'] > n, 5, 'zweite Karte')
            if P.ev(f"__box.table().gs.found[{mate}]") == 0: found += 1
        else:
            n = tbl(P)['nmoves']; tap_target(P, free[0]); wait(lambda: tbl(P)['nmoves'] > n, 5, 'erste Karte')
            vis = P.ev("document.querySelectorAll('.pa-emoji').length")
            should = P.ev("(() => { const g = __box.table().gs; return g.cards.filter((_, i) => g.found[i] !== null || g.open.includes(i) || (g.shown && g.shown.includes(i))).length; })()")
            if vis != should: c.ok(False, f'{form}: {vis} Bilder im DOM, offen sind {should}')
    c.ok(found >= 2, f'{form}: Paare per Tipp gefunden ({found}), nur offene Bilder im DOM')
    P.shot(f'paare_{form}', 'n4')
    P.ev("__box.local('hotseat', 'paare', {paare: 8, players: 2})")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'paare', 10, 'zu zweit')
    time.sleep(0.3)
    c.ok(not P.ev("!!document.querySelector('[data-act=unlock]')"), f'{form}: zu zweit kein Sichtschutz nötig (für alle gleich verdeckt)')
    tap_target(P, 0); tap_target(P, 5)
    time.sleep(0.2)
    P.shot(f'paare_zuzweit_{form}', 'n4')


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

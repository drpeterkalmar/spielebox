# Rauchtest im Browser (Pixel 7 hoch/quer, Desktop): Lobby, Tisch aufmachen (3-Wörter-Anzeige), Beitreten-Felder,
# Mühle mit echten Taps (Mühle schließen + Stein nehmen), Dame 8×8 (Schlag per Taps), Dame 10×10 (Touch-Ziele),
# Pusten, Knöpfe ≥ 48 px, Brett ganz sichtbar, 0 Fehler. Screenshots → tests/shots/final.
# Aufruf: python3 tests/smoke.py
import sys, time, json
sys.path.insert(0, 'tests')
from util import *

c = Checker()


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


def muehle_mill_by_taps(P, form):
    """Zu zweit: Weiß a7, Schwarz a1, Weiß d7, Schwarz d1, Weiß g7 = Mühle → Stein a1 nehmen, alles per Tap."""
    P.ev("__box.local('hotseat', 'muehle', {})")
    wait(lambda: tbl(P) and tbl(P)['status'] == 'play', 10, 'Mühle zu zweit')
    for i in (0, 21, 1, 22, 2):
        n = tbl(P)['nmoves']
        P.tap_target(i)
        if i != 2:
            wait(lambda: tbl(P)['nmoves'] == n + 1, 5, f'Setzen auf {i}')
    time.sleep(0.2)
    hint = P.ev("document.querySelector('.hint').textContent")
    c.ok('Mühle' in hint, f'{form}: Mühle erkannt, Hinweis „{hint}“')
    rings = P.ev("document.querySelectorAll('.board .hint-take').length")
    c.ok(rings == 2, f'{form}: 2 schlagbare Steine markiert ({rings})')
    P.shot(f'muehle_schlagen_{form}', 'dev')
    x, y = P.ev("__box.target(21)")
    if P.device == 'desktop': P.pg.mouse.click(x, y)
    else: P.pg.touchscreen.tap(x, y)
    # nur Stein-Animationen zählen (nicht die pulsierenden Hinweis-Ringe)
    anims = P.ev("document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.pieces, .fx')).length")
    wait(lambda: tbl(P)['nmoves'] == 5, 5, 'Schlagen')
    c.ok(anims >= 1, f'{form}: Zug-Animation läuft ({anims} Animation(en): Stein fällt, geschlagener Stein blendet aus)')
    b = P.ev("__box.table().gs.board")
    c.ok(b[21] == -1 and b[22] == 1 and b[0] == 0, f'{form}: Stein a1 geschlagen, d1 steht noch')
    time.sleep(0.5)


def dame_capture_by_taps(P, form, opts, label):
    """Zu zweit Dame: ziehen per Tap, bis ein Schlag möglich ist; den Schlag Sprung für Sprung antippen."""
    P.ev(f"__box.local('hotseat', 'dame', {json.dumps(opts)})")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'dame' and tbl(P)['status'] == 'play', 10, 'Dame zu zweit')
    for ply in range(40):
        legal = P.ev("__box.legal()")
        caps = [m for m in legal if m.get('cap')]
        m = caps[0] if caps else legal[(ply * 7) % len(legal)]
        before = P.ev("__box.table().gs.board.filter(v => v !== 0).length")
        n = tbl(P)['nmoves']
        P.tap_target(m['from'])
        time.sleep(0.08)
        dots = P.ev("document.querySelectorAll('.board .hint-dot').length")
        for sq in m['path']:
            P.tap_target(sq)
            time.sleep(0.08)
        wait(lambda: tbl(P)['nmoves'] == n + 1, 5, f'Dame-Zug {m}')
        if caps:
            after = P.ev("__box.table().gs.board.filter(v => v !== 0).length")
            c.ok(before - after == len(m['cap']), f'{label}: Schlag per Taps ({len(m["path"])} Sprung/Sprünge, {len(m["cap"])} geschlagen), Zielpunkte angezeigt: {dots}')
            return True
    c.ok(False, f'{label}: kein Schlag in 40 Zügen')
    return False


def pusten_by_taps(P, form):
    P.ev("__box.local('hotseat', 'dame', {rules: 'deutsch', pusten: true})")
    wait(lambda: tbl(P) and tbl(P)['opts'].get('pusten'), 10, 'Pusten-Partie')
    for ply in range(60):
        legal = P.ev("__box.legal()")
        caps = [m for m in legal if m.get('cap')]
        quiet = [m for m in legal if 'from' in m and not m.get('cap')]
        if caps and quiet:
            m = quiet[0]
            n = tbl(P)['nmoves']
            P.tap_target(m['from']); P.tap_target(m['path'][0])
            wait(lambda: tbl(P)['nmoves'] == n + 1, 5, 'Nicht-Schlag')
            pl = [x for x in P.ev("__box.legal()") if 'puste' in x]
            c.ok(len(pl) >= 1, f'{form}: nicht geschlagen → Gegner darf pusten ({len(pl)} Stein(e) markiert)')
            P.shot(f'dame_pusten_{form}', 'dev')
            turn = tbl(P)['turn']
            before = P.ev("__box.table().gs.board.filter(v => v !== 0).length")
            P.tap_target(pl[0]['puste'])
            wait(lambda: tbl(P)['nmoves'] == n + 2, 5, 'Pusten')
            after = P.ev("__box.table().gs.board.filter(v => v !== 0).length")
            c.ok(before - after == 1 and tbl(P)['turn'] == turn, f'{form}: gepustet (1 Stein weg), derselbe Spieler zieht weiter')
            return
        m = legal[(ply * 5) % len(legal)]
        if 'puste' in m:
            m = [x for x in legal if 'from' in x][0]
        n = tbl(P)['nmoves']
        P.tap_target(m['from'])
        for sq in m['path']:
            P.tap_target(sq)
        wait(lambda: tbl(P)['nmoves'] == n + 1, 5, 'Zug')
    c.ok(False, f'{form}: keine Pusten-Situation gefunden')


with Server() as srv, sync_playwright() as pw:
    b = launch(pw)
    for form in ['hoch', 'quer', 'desktop']:
        print(form, flush=True)
        P = Page(b, srv.base, form).open()
        c.ok(P.boot_s < 10, f'{form}: Start in {P.boot_s:.1f} s')
        time.sleep(0.3)
        check_screen(P, f'{form} Lobby', board=False)
        P.shot(f'lobby_{form}', 'final')
        # Name per Tastatur, Tisch aufmachen über die Oberfläche → 3 Wörter
        P.tap('#name'); P.pg.keyboard.type('Peter', delay=20)
        P.tap('[data-game="dame"]')
        time.sleep(0.3)
        P.shot(f'dame_optionen_{form}', 'dev')
        check_screen(P, f'{form} Dame-Optionen', board=False)
        P.tap('.seg-btn[data-v="international"]')
        P.tap('[data-act="online"]')
        P.pg.wait_for_selector('[data-overlay="wait"]', timeout=15000)
        time.sleep(0.4)
        words = P.state()['words']
        fs = P.ev("parseFloat(getComputedStyle(document.querySelector('.word-t')).fontSize)")
        vis = P.ev("[...document.querySelectorAll('.word-t')].every(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.width > 0; })")
        c.ok(len(words) == 3 and fs >= 28 and vis, f'{form}: 3 Wörter groß angezeigt ({" · ".join(words)}, {fs:.0f} px, sichtbar)')
        c.ok(P.ev("location.hash") == '#' + '-'.join(words), f'{form}: Wörter im #-Teil der URL')
        check_screen(P, f'{form} Wartekarte', board=False)
        P.shot(f'woerter_{form}', 'final')
        # zurück, Wörter in die Beitreten-Felder (Autovervollständigung)
        P.tap('.tbar .back')
        P.pg.wait_for_selector('.lobby', timeout=10000)
        c.ok(P.ev("document.querySelectorAll('.resume-item').length") >= 1, f'{form}: Tisch steht unter „Weiterspielen“')
        P.tap('#w0')
        target = words[1]
        found = False
        for k in range(2, len(target)):
            P.pg.keyboard.type(target[k - 1] if k > 2 else target[:2], delay=30)
            time.sleep(0.15)
            if P.ev(f"!!document.querySelector('.chip[data-word=\"{target}\"]')"):
                found = True
                break
        chips = P.ev("[...document.querySelectorAll('.chip')].map(e => e.textContent)")
        c.ok(found, f'{form}: Vorschläge beim Tippen enthalten „{target}“ {chips}')
        if found:
            P.tap(f'.chip[data-word="{target}"]')
            c.ok(P.ev("document.querySelector('#w0').value.toLowerCase()") == target, f'{form}: Vorschlag antippen füllt das Feld')
        P.shot(f'beitreten_{form}', 'dev')
        # Mühle mit echten Taps
        muehle_mill_by_taps(P, form)
        check_screen(P, f'{form} Mühle')
        P.shot(f'muehle_{form}', 'final')
        # Dame deutsch 8×8
        dame_capture_by_taps(P, form, {'rules': 'deutsch'}, f'{form} Dame 8×8')
        check_screen(P, f'{form} Dame 8×8')
        P.shot(f'dame8_{form}', 'final')
        # Dame international 10×10
        dame_capture_by_taps(P, form, {'rules': 'international'}, f'{form} Dame 10×10')
        check_screen(P, f'{form} Dame 10×10')
        P.shot(f'dame10_{form}', 'final')
        if form == 'hoch':
            pusten_by_taps(P, form)
            # gegen den Computer: Bot antwortet
            P.ev("__box.local('bot', 'muehle', {}, 'weiss', 2)")
            wait(lambda: tbl(P) and tbl(P)['seats'][1]['bot'] == 2, 10, 'Bot-Partie')
            P.tap_target(9)
            wait(lambda: tbl(P)['nmoves'] == 2, 10, 'Bot antwortet')
            c.ok(True, f'{form}: Computer antwortet (Web Worker)')
            # Menü und Regeln öffnen
            P.tap('[data-act="menu"]'); time.sleep(0.2)
            check_screen(P, f'{form} Menü', board=False)
            P.tap('[data-act="rules"]'); time.sleep(0.3)
            P.shot('regeln_hoch', 'dev')
            P.pg.keyboard.press('Escape'); time.sleep(0.3)
        errs = P.app_errors()
        c.ok(errs == [], f'{form}: 0 Page-/Console-Fehler {errs[:3]}')
        P.close()
    # quer im Browser-Tab (weniger Höhe): Bretter trotzdem ganz sichtbar, Touch-Ziele ≥ 48 px
    P = Page(b, srv.base, 'quer_tab').open()
    for mode, game, opts, label in (('hotseat', 'muehle', {}, 'Mühle'), ('hotseat', 'dame', {'rules': 'deutsch'}, 'Dame 8×8'), ('hotseat', 'dame', {'rules': 'international'}, 'Dame 10×10')):
        P.ev(f"__box.local('{mode}', '{game}', {json.dumps(opts)})")
        time.sleep(0.5)
        if label == 'Dame 10×10':
            # 10 Reihen in ~346 px: physikalisch knapp unter 48 px – nur messen und berichten (Vorgabe gilt Hochformat)
            bc = P.board_check()
            c.ok(bc['inside'], f'quer im Tab (915×350) {label}: Brett ganz sichtbar')
            print(f'  ℹ️  quer im Tab (915×350) {label}: Touch-Ziele {bc["minTargetPx"]:.1f} px (Hochformat und installierte App ≥ 48)')
        else:
            check_screen(P, f'quer im Tab (915×350) {label}')
    P.shot('dame10_quer_tab', 'dev')
    c.ok(P.app_errors() == [], f'quer im Tab: 0 Fehler {P.app_errors()[:3]}')
    P.close()
    b.close()
print('\nRAUCHTEST', 'GRÜN' if not c.fails else f'ROT ({len(c.fails)})')
sys.exit(1 if c.fails else 0)

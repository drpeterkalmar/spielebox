# Netz-E2E n4 (echte öffentliche Relays, EIN Browser, mehrere Kontexte):
#   schiffe – Host + Gast; der Gast sieht die Flotte des Hosts nie (Zustand, Verlauf, Bild), nur versenkte Schiffe
#   maumau  – Host + Gast + Computer (3 Plätze); der Gast sieht nie eine Karte des Hosts, faire Mischung geprüft
#   ludo    – Host + Gast; faire Würfel (ein Würfel je Wurf), Gast prüft jeden Wurf
# Aufruf: python3 tests/e2e_n4.py [schiffe] [maumau] [ludo] [--relay]
import sys, time, json
sys.path.insert(0, 'tests')
from util import *

c = Checker()
RELAY = '--relay' in sys.argv
want = [a for a in sys.argv[1:] if not a.startswith('--')] or ['schiffe', 'maumau', 'ludo']
Q = '?nosw' + ('&relay=1' if RELAY else '')


def wait(fn, timeout=60, what='Bedingung', step=0.1):
    t0 = time.time()
    while True:
        try:
            v = fn()
            if v: return v
        except Exception:
            pass
        if time.time() - t0 > timeout:
            raise TimeoutError('Zeitüberschreitung: ' + what)
        time.sleep(step)


def tbl(P):
    return P.state()['table']


def join(P, words, want='play', name='Gast'):
    P.ev(f"__box.setName({json.dumps(name)})")
    P.ev(f"__box.join({json.dumps(words)}, '{want}')")


def pair(b, base, game, opts):
    A = Page(b, base, 'hoch', 'A', rtc_all=True).open(Q)
    B = Page(b, base, 'hoch', 'B', rtc_all=True).open(Q)
    A.ev("__box.setName('Peter')")
    A.ev(f"__box.create('{game}', {json.dumps(opts)}, 'weiss')")
    words = wait(lambda: A.state()['words'], 20, 'Wörter')
    t0 = time.time()
    join(B, words, 'play', 'Anna')
    wait(lambda: tbl(B) and tbl(A)['seats'][1], 60, 'Gast sitzt')
    c.ok(True, f'{game}: Gast sitzt nach {time.time() - t0:.1f} s ({B.state()["net"]["text"]})')
    return A, B


def step(A, B, level=2, timeout=30):
    mover = A if A.ev("__box.legal().length") else (B if B.ev("__box.legal().length") else None)
    if not mover:
        time.sleep(0.1); return False
    n = tbl(A)['nmoves']
    r = mover.ev(f"__box.botMove({level})")
    if not r.get('ok'):
        time.sleep(0.1); return False
    wait(lambda: tbl(A)['nmoves'] > n and tbl(B)['seq'] == tbl(A)['seq'] and not B.state()['pending'], timeout, 'Zug verteilt')
    return True


def schiffe(b, base):
    A, B = pair(b, base, 'schiffe', {})
    wait(lambda: tbl(B)['status'] == 'play', 30, 'Start')
    leaks, steps = 0, 0
    while steps < 70 and tbl(A)['status'] == 'play':
        if not step(A, B): continue
        steps += 1
        gA = A.ev("__box.table().gs")
        if gA['phase'] == 'over' or not gA['fleets'][0]: continue
        gB = B.ev("__box.table().gs")
        hist = B.ev("__box.table().hist.filter(e => e.by === 0).map(e => e.m)")   # Züge des Hosts
        host_cells = set()
        for sh in gA['fleets'][0]:
            for j in range(sh['len']):
                host_cells.add((sh['r'] + (j if sh['dir'] == 'v' else 0)) * 10 + sh['c'] + (j if sh['dir'] == 'h' else 0))
        sunk = set()
        for sh in (gB.get('revealed') or [[], []])[0]:
            for j in range(sh['len']):
                sunk.add((sh['r'] + (j if sh['dir'] == 'v' else 0)) * 10 + sh['c'] + (j if sh['dir'] == 'h' else 0))
        # im Bild des Gasts (beim Schießen): Schiffsrümpfe im großen Meer nur für versenkte Schiffe
        hulls = B.ev("document.querySelectorAll('.board-schiffe > g:first-child .sv-ship').length")
        why = [w for w, bad in [('Zustand', gB['fleets'][0] is not None), ('Verlauf', any(m.get('ships') for m in hist if m)),
               ('versenkt falsch', not sunk <= host_cells), (f'Bild {hulls}', gB['phase'] == 'shoot' and hulls > len(gB['revealed'][0]))] if bad]
        if why:
            leaks += 1
            if leaks == 1: print('    Leck:', why, 'Sitz Gast', B.state()['mySeat'])
        if steps == 30: B.shot('e2e_schiffe_gast', 'n4')
    c.ok(leaks == 0, f'Schiffe: Gast sah die Flotte des Hosts nie ({steps} Züge geprüft: Zustand, Verlauf, Bild)')


def maumau(b, base):
    A, B = pair(b, base, 'maumau', {'players': 3})
    A.ev("__box.act('fill-bots')")
    wait(lambda: tbl(B)['status'] == 'play' and B.ev("__box.table().gs.phase") == 'play', 40, 'ausgeteilt')
    leaks, steps = 0, 0
    while steps < 40 and tbl(A)['status'] == 'play':
        if not step(A, B): continue
        steps += 1
        gA = A.ev("__box.table().gs")
        host = [x for x in gA['hands'][0] if x]
        gB = B.ev("__box.table().gs")
        leak_state = any(x for x in gB['hands'][0]) or any(x for x in gB['hands'][2]) or any(x for x in gB['stock'])
        leak_dom = B.ev(f"{json.dumps(host)}.filter(c => document.querySelector(`.board-maumau .hand [data-card=\"${{c}}\"]`)).length")
        if leak_state or leak_dom: leaks += 1
        if steps == 6: B.shot('e2e_maumau_gast', 'n4')
    c.ok(leaks == 0, f'Mau-Mau: Gast sah nie eine Karte des Hosts oder des Stapels ({steps} Züge, Zustand + Bild)')
    if tbl(A)['status'] == 'over':
        fair = wait(lambda: B.ev("(() => { const e = document.querySelector('.fair-badge'); return e && !e.classList.contains('hidden') ? e.textContent : null; })()"), 20, 'Fair-Anzeige')
        c.ok('fair gemischt' in fair, f'Mau-Mau: nach dem Spiel beim Gast „{fair}“')
    else:
        print(f'    (Partie nach {steps} Zügen noch offen – Mischprüfung erst am Ende)')


def ludo(b, base):
    A, B = pair(b, base, 'ludo', {'players': 2})
    wait(lambda: tbl(B)['status'] == 'play', 30, 'Start')
    steps = 0
    while steps < 40 and tbl(A)['status'] == 'play':
        if step(A, B): steps += 1
    fair = wait(lambda: B.ev("(() => { const e = document.querySelector('.fair-badge'); return e && !e.classList.contains('hidden') ? e.textContent : null; })()"), 20, 'Fair-Anzeige')
    log = A.ev("__box.table().fair.log")
    c.ok('fair gewürfelt' in fair and all(e.get('n') == 1 for e in log), f'Ludo: {len(log)} Würfe mit je einem Würfel, beim Gast „{fair}“')
    B.shot('e2e_ludo_gast', 'n4')


with Server() as srv, sync_playwright() as pw:
    b = launch(pw)
    for g in want:
        print(g, flush=True)
        try:
            globals()[g](b, srv.base)
        except Exception as e:
            c.ok(False, f'{g}: Ausnahme {e}')
    b.close()

print(f'\n{"E2E GRÜN" if not c.fails else str(len(c.fails)) + " FEHLER"}')
sys.exit(1 if c.fails else 0)

# Netz-E2E Tagesspurt (echte öffentliche Relays, ein Browser, mehrere Kontexte):
#   schnapsen  – Host + Gast + Zuschauer; Gast und Zuschauer sehen die Karten des Hosts NIE (Zustand + DOM),
#                ein ganzes Spiel + Beginn des nächsten, „✓ fair gemischt“ beim Gast
#   backgammon – Host + Gast, faire Würfel (Hash-Ketten), Gast prüft jeden Wurf
#   blackjack  – Mehr-Sitz-Tisch: Host + 2 Gäste über die 3 Wörter (Oberfläche), Rest Computer, Runden spielen
# Aufruf: python3 tests/e2e_n2.py [schnapsen] [backgammon] [blackjack] [--relay]
import sys, time, json
sys.path.insert(0, 'tests')
from util import *

c = Checker()
RELAY = '--relay' in sys.argv
want = [a for a in sys.argv[1:] if not a.startswith('--')] or ['schnapsen', 'backgammon', 'blackjack']
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


def schnapsen(b, base):
    A = Page(b, base, 'hoch', 'A', rtc_all=True).open(Q)
    B = Page(b, base, 'hoch', 'B', rtc_all=True).open(Q)
    W = Page(b, base, 'desktop', 'W', rtc_all=True).open(Q)
    A.ev("__box.setName('Peter')")
    A.ev("__box.create('schnapsen', {bummerl: 2}, 'weiss')")
    words = wait(lambda: A.state()['words'], 20, 'Wörter')
    t0 = time.time()
    join(B, words, 'play', 'Anna')
    wait(lambda: tbl(B) and tbl(B)['status'] == 'play', 60, 'Gast sitzt')
    c.ok(True, f'Schnapsen: Gast sitzt nach {time.time() - t0:.1f} s ({B.state()["net"]["text"]})')
    join(W, words, 'watch', 'Zaungast')
    wait(lambda: tbl(W) and tbl(W)['status'] == 'play', 60, 'Zuschauer')
    leaks, steps, spiele = 0, 0, 0
    fair_seen = None
    while steps < 120:
        gsA = A.ev("__box.table().gs")
        if gsA['phase'] == 'play':
            host = [x for x in gsA['hands'][0] if x]
            gB = B.ev("__box.table().gs")
            gW = W.ev("__box.table().gs")
            leak_state = any(x for x in gB['hands'][0]) or any(x for x in gB['talon']) or any(x for h in gW['hands'] for x in h)
            leak_dom = B.ev(f"{json.dumps(host)}.filter(c => document.querySelector(`[data-card=\"${{c}}\"]`) && !document.querySelector(`.trick [data-card=\"${{c}}\"]`)).length")
            if leak_state or leak_dom: leaks += 1
        if gsA['phase'] == 'spielende':
            spiele += 1
            if spiele == 1: B.shot('e2e_schnapsen_spielende_gast', 'n2')
            if spiele >= 2: break
        mover = A if A.ev("__box.legal().length") else (B if B.ev("__box.legal().length") else None)
        if not mover:
            time.sleep(0.1); continue
        n = tbl(A)['nmoves']
        r = mover.ev("__box.botMove(2)")
        if not r.get('ok'):
            time.sleep(0.1); continue
        wait(lambda: tbl(A)['nmoves'] > n and tbl(B)['seq'] == tbl(A)['seq'] and not B.state()['pending'], 30, 'Zug verteilt')
        steps += 1
        if steps == 3: B.shot('e2e_schnapsen_gast', 'n2'); W.shot('e2e_schnapsen_zuschauer', 'n2')
        if spiele == 1 and fair_seen is None:
            fair_seen = B.ev("(() => { const e = document.querySelector('.fair-badge'); return e && !e.classList.contains('hidden') ? e.textContent : null; })()")
    c.ok(leaks == 0, f'Schnapsen: Gast und Zuschauer sahen die Host-Karten nie ({steps} Züge geprüft, Zustand + DOM)')
    c.ok(spiele >= 1, f'Schnapsen: ganzes Spiel online gespielt ({spiele} Spielende)')
    fc = wait(lambda: B.ev("(() => { const e = document.querySelector('.fair-badge'); return e && !e.classList.contains('hidden') ? e.textContent : null; })()"), 20, 'Fair-Anzeige')
    c.ok('✓ fair gemischt' in fc, f'Schnapsen: Gast zeigt „{fc}“')
    for P in (A, B, W):
        errs = P.app_errors()
        c.ok(errs == [], f'Schnapsen {P.name}: 0 App-Fehler {errs[:3]}')
        P.close()


def backgammon(b, base):
    A = Page(b, base, 'hoch', 'A', rtc_all=True).open(Q)
    B = Page(b, base, 'quer', 'B', rtc_all=True).open(Q)
    A.ev("__box.setName('Peter')")
    A.ev("__box.create('backgammon', {cube: true}, 'weiss')")
    words = wait(lambda: A.state()['words'], 20, 'Wörter')
    join(B, words, 'play', 'Anna')
    wait(lambda: tbl(B) and tbl(B)['status'] == 'play', 60, 'Gast sitzt')
    steps = 0
    while steps < 30 and tbl(A)['status'] == 'play':
        mover = A if A.ev("__box.legal().length") else (B if B.ev("__box.legal().length") else None)
        if not mover:
            time.sleep(0.1); continue
        n = tbl(A)['nmoves']
        r = mover.ev("__box.botMove(2)")
        if not r.get('ok'):
            time.sleep(0.1); continue
        wait(lambda: tbl(A)['nmoves'] > n and tbl(B)['seq'] == tbl(A)['seq'], 30, 'Zug verteilt')
        steps += 1
    log = A.ev("__box.table().fair.log")
    c.ok(len(log) >= 5 and all(not e.get('fallback') for e in log), f'Backgammon: {len(log)} Würfe aus beiden Hash-Ketten')
    fc = wait(lambda: B.ev("(() => { const e = document.querySelector('.fair-badge'); return e && !e.classList.contains('hidden') ? e.textContent : null; })()"), 20, 'Fair-Anzeige')
    c.ok('✓ fair gewürfelt' in fc, f'Backgammon: Gast zeigt „{fc}“')
    B.shot('e2e_backgammon_gast', 'n2')
    for P in (A, B):
        errs = P.app_errors()
        c.ok(errs == [], f'Backgammon {P.name}: 0 App-Fehler {errs[:3]}')
        P.close()


def blackjack(b, base):
    A = Page(b, base, 'hoch', 'A', rtc_all=True).open(Q)
    B = Page(b, base, 'hoch', 'B', rtc_all=True).open(Q)
    C = Page(b, base, 'quer', 'C', rtc_all=True).open(Q)
    A.ev("__box.setName('Peter')")
    A.ev("__box.create('blackjack', {players: 4}, 'weiss')")
    words = wait(lambda: A.state()['words'], 20, 'Wörter')
    t0 = time.time()
    for P, name in ((B, 'Anna'), (C, 'Berni')):
        P.ev(f"__box.setName({json.dumps(name)})")
        # über die Oberfläche: Wörter eintippen, „Mitspielen“
        P.tap('#w0'); P.pg.keyboard.type(' '.join(words), delay=15)
        wait(lambda: P.ev("!document.querySelector('[data-act=join]').disabled"), 5, 'Mitspielen aktiv')
        P.tap('[data-act="join"]')
    wait(lambda: len([s for s in tbl(A)['seats'] if s]) == 3, 60, 'drei am Tisch')
    c.ok(True, f'Blackjack: 2 Gäste über die 3 Wörter am Tisch nach {time.time() - t0:.1f} s')
    A.tap('[data-act="fill-bots"]')
    wait(lambda: tbl(B)['status'] == 'play' and tbl(C)['status'] == 'play', 30, 'Start')
    rounds0 = A.ev("__box.table().gs.round")
    steps = 0
    pages = {0: A}
    for P in (B, C):
        pages[P.state()['mySeat']] = P
    while steps < 60 and A.ev("__box.table().gs.round") < rounds0 + 3:
        mover = next((P for P in (A, B, C) if P.ev("__box.legal().length")), None)
        if not mover:
            time.sleep(0.1); continue
        n = tbl(A)['nmoves']
        r = mover.ev("__box.botMove(2)")
        if not r.get('ok'):
            time.sleep(0.1); continue
        wait(lambda: tbl(A)['nmoves'] > n, 30, 'Zug')
        steps += 1
        if steps == 4:
            for P in (A, B, C): P.shot(f'e2e_blackjack_{P.name}', 'n2')
    wait(lambda: len(set(P.ev("JSON.stringify(__box.table().gs.beans)") for P in (A, B, C))) == 1, 30, 'gleicher Stand')
    beans = A.ev("__box.table().gs.beans")
    c.ok(abs(sum(beans) - 400) < 1e-9, f'Blackjack: 3 Runden mit 3 Menschen + Computer, Bohnen {beans} (Summe 400)')
    for P in (A, B, C):
        errs = P.app_errors()
        c.ok(errs == [], f'Blackjack {P.name}: 0 App-Fehler {errs[:3]}')
        P.close()


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

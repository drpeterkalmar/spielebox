# Rauchtest n5 – Texas Hold'em (Pixel 7 hoch/quer, Desktop): echte Taps auf Aussteigen/Checken/Mitgehen/Erhöhen,
# Regler + Schnellknöpfe + Plus/Minus, Vorab-Knöpfe, Knöpfe ≥ 48 px und im Bild, Brett ganz sichtbar, nie eine fremde
# Hole Card im DOM, Hand-Hilfe und „Wer gewinnt?“, zu mehreren an einem Gerät mit Sichtschutz, Showdown mit Side-Pot,
# Turnierende mit Rangliste, 0 Fehler. Screenshots → tests/shots/n5/.
# Aufruf: python3 tests/smoke_n5.py [--nur=hoch,quer]
import sys, time, json
sys.path.insert(0, 'tests')
from util import *

c = Checker()
forms = ['hoch', 'quer', 'desktop']
for a in sys.argv[1:]:
    if a.startswith('--nur='): forms = a.split('=', 1)[1].split(',')
SUB = 'n5'


def wait(fn, timeout=20, what='Bedingung'):
    t0 = time.time()
    while not fn():
        if time.time() - t0 > timeout:
            raise TimeoutError(what)
        time.sleep(0.05)


def tbl(P):
    return P.state()['table']


def my_turn(P):
    return P.ev("__box.legal().length") > 0 and not P.ev("__box.busy()")


def check_screen(P, label):
    sb = P.small_buttons()
    c.ok(sb == [], f'{label}: Knöpfe ≥ 48 px und im Bild {sb[:3]}')
    bc = P.board_check()
    c.ok(bc['inside'], f'{label}: Brett ganz sichtbar ({bc["x0"]:.0f},{bc["y0"]:.0f})–({bc["x1"]:.0f},{bc["y1"]:.0f}) in {bc["W"]}×{bc["H"]}')


# Karten im DOM dürfen nur sein: Board, eigene Hole Cards, aufgedeckte (All-in / Showdown), eigene der letzten Hand
LEAK_JS = """(seat) => {
  if (seat < 0) seat = null;
  const t = __box.table(); const gs = t.gs; const ok = new Set([...gs.board]);
  if (seat !== null && gs.holes[seat]) gs.holes[seat].forEach((c) => ok.add(c));
  gs.holes.forEach((h, q) => { if (gs.shown[q]) h.forEach((c) => ok.add(c)); });
  if (gs.lastHand) { gs.lastHand.board.forEach((c) => ok.add(c)); Object.values(gs.lastHand.shown).flat().forEach((c) => ok.add(c)); }
  if (seat !== null && gs.lastHoles && gs.lastHoles[seat]) gs.lastHoles[seat].forEach((c) => ok.add(c));
  if (window.__heMine) window.__heMine.forEach((c) => ok.add(c));
  if (seat !== null && gs.holes[seat]) window.__heMine = gs.holes[seat].slice();
  const bad = [];
  document.querySelectorAll('svg.board [data-card]').forEach((el) => { const c = el.dataset.card; if (!ok.has(c)) bad.push(c); });
  return bad; }"""


def leaks(P, seat):
    return P.ev(LEAK_JS, seat if seat is not None else -1)


def play_solo(P, form):
    P.ev("localStorage.removeItem('sb.settings')")
    P.ev("__box.local('bot', 'holdem', {players: 6}, 'weiss', 2)")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'holdem' and my_turn(P), 30, 'ich bin dran')
    me = P.state()['mySeat']
    c.ok(me == 5, f'{form}: Solo – Mensch auf dem letzten Platz ({me})')
    time.sleep(0.3)
    check_screen(P, f'{form} Preflop')
    hole = P.ev(f"__box.table().gs.holes[{me}]")
    dom = P.ev("[...document.querySelectorAll('svg.board [data-hole]')].filter(e => e.dataset.hole !== 'x').map(e => e.dataset.hole)")
    c.ok(sorted(dom) == sorted(hole), f'{form}: eigene Karten groß unten {hole}, sonst nur Rückseiten ({dom})')
    c.ok(leaks(P, me) == [], f'{form}: keine fremde Hole Card im DOM')
    ev = P.ev("document.querySelector('[data-act=eval]').textContent")
    c.ok('Wer gewinnt?' in ev and '%' in ev and 'zufällig' in ev, f'{form}: „Wer gewinnt?“ als Gewinnchance gegen zufällige Hände: {ev}')
    P.shot(f'preflop_{form}', SUB)
    # Erhöhen: Regler öffnen, Schnellknopf, Plus, Minus, bestätigen
    if P.ev("__box.legal().some(m => m.type === 'raise')"):
        P.tap('[data-act=raise]')
        wait(lambda: P.ev("!!document.querySelector('[data-panel=raise]')"), 5, 'Regler offen')
        check_screen(P, f'{form} Regler offen')
        P.tap('[data-act=q-pot]')
        lbl = P.ev("document.querySelector('[data-act=raise-ok] .he-act-t').textContent")
        P.tap('[data-act=plus]')
        lbl2 = P.ev("document.querySelector('[data-act=raise-ok] .he-act-t').textContent")
        P.tap('[data-act=minus]')
        lbl3 = P.ev("document.querySelector('[data-act=raise-ok] .he-act-t').textContent")
        c.ok(lbl != lbl2 and lbl3 == lbl, f'{form}: Pot / + / − ändern den Betrag ({lbl} → {lbl2} → {lbl3})')
        P.shot(f'regler_{form}', SUB)
        n = tbl(P)['nmoves']
        P.tap('[data-act=raise-ok]')
        wait(lambda: tbl(P)['nmoves'] > n, 5, 'erhöht')
        mine = [e for e in P.ev("__box.table().hist") if e['by'] == me]
        c.ok(mine and mine[-1]['m']['type'] == 'raise', f'{form}: Erhöhung per Tipp ({mine[-1]["d"] if mine else "–"})')
    # einige Hände spielen: mitgehen/checken per Tipp, zwischendurch Vorab-Knopf
    hands0 = P.ev("__box.table().gs.hand")
    pre_done = False
    t0 = time.time()
    while time.time() - t0 < 60 and P.ev("__box.table().gs.hand") < hands0 + 4 and tbl(P)['status'] == 'play':
        g = P.ev("__box.table().gs")
        if g['out'][me] is not None: break
        if not pre_done and not my_turn(P) and P.ev("!!document.querySelector('[data-act=pre-checkfold]')"):
            P.tap('[data-act=pre-checkfold]')
            on = P.ev("document.querySelector('[data-act=pre-checkfold]') && document.querySelector('[data-act=pre-checkfold]').getAttribute('aria-pressed')")
            n = len(P.ev("__box.table().gs.log"))
            hand = g['hand']
            c.ok(on == 'true', f'{form}: Vorab „Check/Fold“ angetippt')
            # sobald ich dran bin, checkt/foldet die App selbst
            try:
                wait(lambda: any(e['s'] == me and e['t'] in ('check', 'fold') for e in P.ev("__box.table().gs.log")[n:]) or P.ev("__box.table().gs.hand") != hand, 30, 'Vorab ausgeführt')
                c.ok(True, f'{form}: Vorab-Aktion automatisch ausgeführt')
            except TimeoutError:
                c.ok(False, f'{form}: Vorab-Aktion nicht ausgeführt')
            pre_done = True
            continue
        if my_turn(P):
            c.ok(leaks(P, me) == [], f'{form}: Hand {g["hand"]}: keine fremde Hole Card im DOM') if g['hand'] % 2 == 0 else None
            lg = P.ev("__box.legal()")
            act = 'check' if any(m['type'] == 'check' for m in lg) else 'call'
            n = tbl(P)['nmoves']
            P.tap(f'[data-act={act}]')
            wait(lambda: tbl(P)['nmoves'] > n or not my_turn(P), 5, 'getippt')
        time.sleep(0.1)
    c.ok(P.ev("__box.table().gs.hand") >= hands0 + 2, f'{form}: mehrere Hände gespielt (bis Hand {P.ev("__box.table().gs.hand")})')
    # Hand-Hilfe einschalten (Menü)
    P.tap('[data-act=menu]')
    P.tap('[data-act=help-toggle]')
    time.sleep(0.4)
    wait(lambda: my_turn(P) or P.ev("__box.table().gs.out[%d] !== null" % me), 40, 'wieder dran')
    if my_turn(P):
        hint = P.ev("document.querySelector('.hint').textContent")
        c.ok(any(w in hint for w in ('Starthand', 'Paar', 'Höchste', 'Drilling', 'Straße', 'Flush', 'Zwei Paare', 'Full', 'Vierling')), f'{form}: Hand-Hilfe benennt die eigene Hand: „{hint}“')
    errs = P.app_errors()
    c.ok(errs == [], f'{form}: keine Fehler {errs[:3]}')


def hotseat_sidepot(P, form):
    # zu viert an einem Gerät, Chips so verteilt, dass alle All-in gehen → Hauptpot + 2 Side-Pots
    P.ev("__box.local('hotseat', 'holdem', {players: 4}, 'weiss')")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'holdem' and tbl(P)['turn'] is not None, 10, 'Start')
    ov = P.ev("!!document.querySelector('[data-overlay=handoff]')")
    c.ok(ov, f'{form}: zu viert: Sichtschutz „Gerät an … weitergeben“')
    dom = P.ev("[...document.querySelectorAll('svg.board [data-hole]')].filter(e => e.dataset.hole !== 'x').length")
    c.ok(dom == 0, f'{form}: vor dem Antippen keine Hole Card sichtbar ({dom})')
    P.tap('[data-act=unlock]')
    time.sleep(0.2)
    dom = P.ev("[...document.querySelectorAll('svg.board [data-hole]')].filter(e => e.dataset.hole !== 'x').length")
    c.ok(dom == 2, f'{form}: nach dem Antippen genau die eigenen 2 Karten ({dom})')
    # Stacks verteilen (nur Test): 0: 1000, 1: 400 (SB), 2: 200 (BB), 3: 700 (UTG)
    P.ev("""(() => { const g = __box.table().gs; g.stacks = [1000, 390, 180, 700]; g.startStacks = [1000, 400, 200, 700]; __box.poke(); })()""")
    for _ in range(4):
        mv = P.ev("""(() => { const g = __box.table().gs; const p = g.turn; return { type: 'raise', to: g.bets[p] + g.stacks[p] }; })()""")
        r = P.ev("m => __box.move(m)", mv)
        if not r['ok']:
            P.ev("__box.move({type: 'call'})")
        time.sleep(0.1)
        if P.ev("__box.table().gs.hand") > 1: break
    lh = P.ev("__box.table().gs.lastHand")
    c.ok(lh and len(lh['pots']) >= 3, f'{form}: Showdown mit Hauptpot und Side-Pots ({[p["amount"] for p in lh["pots"]] if lh else None})')
    c.ok(lh and lh['allin'] and len(lh['shown']) == 4, f'{form}: All-in → alle Hände aufgedeckt')


def sidepot_shot(br, srv, form):
    # mit Animation (Tempo normal): Bild während das Ergebnis liegt
    P = Page(br, srv.base, form)
    P.open('?nosw&alle&tempo=normal')
    P.ev("__box.setName('Peter')")
    # zu fünft: vier gehen All-in (Hauptpot + 2 Side-Pots), Platz 5 steigt aus → das Turnier geht weiter
    P.ev("__box.local('hotseat', 'holdem', {players: 5}, 'weiss')")
    wait(lambda: tbl(P) and tbl(P)['turn'] is not None, 10, 'Start')
    P.ev("""(() => { const g = __box.table().gs; g.stacks = [1000, 390, 180, 700, 1000]; g.startStacks = [1000, 400, 200, 700, 1000]; __box.poke(); })()""")
    for _ in range(6):
        if P.ev("__box.table().gs.turn") == 4: P.ev("__box.move({type: 'fold'})"); continue
        mv = P.ev("""(() => { const g = __box.table().gs; const p = g.turn; return { type: 'raise', to: g.bets[p] + g.stacks[p] }; })()""")
        if not P.ev("m => __box.move(m)", mv)['ok']: P.ev("__box.move({type: 'call'})")
        if P.ev("__box.table().gs.hand") > 1: break
        time.sleep(0.05)
    # warten bis Ergebnis-Bild steht (Banner mit Gewinner)
    try:
        wait(lambda: 'gewinnt' in (P.ev("__box.banner()") or '') or 'geteilt' in (P.ev("__box.banner()") or ''), 15, 'Ergebnis')
        wait(lambda: P.ev("document.querySelectorAll('.he-label.win').length") >= 1, 6, 'Gewinner-Anzeige')
        time.sleep(0.5)
    except TimeoutError:
        pass
    P.shot(f'showdown_sidepot_{form}', SUB)
    c.ok(P.ev("document.querySelectorAll('.he-label.win').length") >= 1, f'{form}: Ergebnis-Bild zeigt Gewinner (+Chips, Hand)')
    c.ok(P.app_errors() == [], f'{form}: Showdown-Bild ohne Fehler')
    P.close()


def busted_new(P, form):
    # gegen den Computer ausgeschieden: Hinweis + Knopf „Neues Turnier“ (≥ 48 px), Tipp startet ein frisches Turnier.
    # Tempo normal: im Test-Tempo spielen die Computer den Rest sofort zu Ende, dann gäbe es nur noch „Revanche“.
    P.open('?nosw&alle&tempo=normal')
    P.ev("__box.setName('Peter')")
    P.ev("__box.local('bot', 'holdem', {players: 4}, 'weiss', 2)")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'holdem', 10, 'Start')
    me = P.state()['mySeat']
    for attempt in range(40):
        if P.ev("__box.table().gs.out[%d] !== null" % me) or tbl(P)['status'] == 'over': break
        try:
            wait(lambda: my_turn(P) or P.ev("__box.table().gs.out[%d] !== null" % me), 30, 'dran')
        except TimeoutError:
            break
        if not my_turn(P): continue
        # nur Test: eigener Stack fast leer, dann All-in
        P.ev("""(() => { const g = __box.table().gs; const me = __box.state().mySeat; g.stacks[me] = Math.min(g.stacks[me], 5); __box.poke(); })()""")
        P.ev("__box.move(__box.legal().find(m => m.type === 'raise' && m.to === Math.max(...__box.legal().filter(x => x.type === 'raise').map(x => x.to))) || __box.legal().find(m => m.type === 'call') || __box.legal().find(m => m.type === 'check') || __box.legal()[0])")
        time.sleep(0.2)
    # kein Vorgriff: solange die letzte Hand noch ausgespielt wird (Karten, Showdown), steht der Knopf noch nicht da
    early = []
    t0 = time.time()
    while time.time() - t0 < 20 and not P.ev("!!document.querySelector('[data-act=new-tournament]')"):
        if P.ev("__box.table().gs.out[%d] !== null" % me) and P.ev("__box.busy()"):
            early.append(P.ev("!!document.querySelector('[data-act=new-tournament]') || !!document.querySelector('.he-out')"))
        time.sleep(0.05)
    c.ok(early and not any(early), f'{form}: „Du bist raus“ erst nach dem Ausspielen der Hand ({len(early)} Proben während der Animation)')
    try:
        wait(lambda: P.ev("!!document.querySelector('[data-act=new-tournament]')"), 20, 'Knopf Neues Turnier')
    except TimeoutError:
        pass
    has = P.ev("!!document.querySelector('[data-act=new-tournament]')")
    txt = P.ev("(document.querySelector('.he-out') || {}).textContent || ''")
    c.ok(has and 'Du bist raus' in txt, f'{form}: ausgeschieden → „{txt}“ + Knopf „Neues Turnier“')
    if not has: return
    time.sleep(0.3)
    check_screen(P, f'{form} ausgeschieden')
    P.shot(f'ausgeschieden_{form}', SUB)
    old = tbl(P)['id'] if 'id' in tbl(P) else None
    P.tap('[data-act=new-tournament]')
    wait(lambda: P.ev("__box.table().gs.out[%d] === null && __box.table().gs.hand <= 1" % me), 10, 'neues Turnier')
    st = P.ev("__box.table().gs.stacks.concat(__box.table().gs.contrib)")
    c.ok(P.ev("__box.table().gs.out.every(x => x === null)"), f'{form}: „Neues Turnier“ startet frisch (Hand 1, alle wieder dabei, Stacks {st[:4]})')
    c.ok(P.app_errors() == [], f'{form}: ausgeschieden/neu ohne Fehler')
    P.open('?nosw')
    P.ev("__box.setName('Peter')")


def tournament_end(P, form):
    P.ev("__box.local('bot', 'holdem', {players: 4}, 'weiss', 1)")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'holdem', 10, 'Start')
    for attempt in range(30):
        if tbl(P)['status'] == 'over': break
        wait(lambda: my_turn(P) or tbl(P)['status'] == 'over', 30, 'dran')
        if tbl(P)['status'] == 'over': break
        # Computer fast ohne Chips (nur Test) → schnelles Ende
        P.ev("""(() => { const g = __box.table().gs; const me = __box.state().mySeat; g.stacks = g.stacks.map((x, i) => i === me ? x : Math.min(x, 15)); })()""")
        P.ev("__box.move(__box.legal().find(m => m.type === 'raise' && m.to === Math.max(...__box.legal().filter(x => x.type === 'raise').map(x => x.to))) || __box.legal().find(m => m.type === 'call') || __box.legal()[0])")
        time.sleep(0.2)
    wait(lambda: tbl(P)['status'] == 'over', 20, 'Turnier vorbei')
    time.sleep(0.4)
    res = tbl(P)['result']
    c.ok(P.ev("!!document.querySelector('[data-end]')"), f'{form}: Turnierende mit Rangliste auf dem Tisch ({res["reason"]})')
    st = P.ev("document.querySelector('.status-t').textContent")
    P.shot(f'turnier_ende_{form}', SUB)
    print('    ', st)
    check_screen(P, f'{form} Turnierende')


with Server() as srv, sync_playwright() as pw:
    br = launch(pw)
    for form in forms:
        print(f'— {form}')
        P = Page(br, srv.base, form)
        P.open('?nosw')
        c.ok(P.ev("!!document.querySelector('[data-game=holdem]')"), f'{form}: Kachel „Texas Hold\'em“ in der Lobby')
        if form == 'hoch':
            P.tap('[data-game=holdem]')
            time.sleep(0.3)
            c.ok(P.ev("document.querySelector('.sheet') && document.querySelector('.sheet').textContent.includes('Plätze am Tisch')"), 'Auswahlblatt mit Optionen')
            P.shot('auswahl_hoch', SUB)
            P.tap('.sheet .btn.link')
            time.sleep(0.3)
            txt = P.ev("document.querySelectorAll('.sheet')[1] ? document.querySelectorAll('.sheet')[1].textContent : document.querySelector('.sheet').textContent")
            c.ok('nur Spielchips' in txt.lower() or 'Nur Spielchips' in txt, 'Regeln: Hinweis „nur Spielchips“')
            c.ok(P.ev("document.querySelectorAll('.he-ranking li').length") == 10, 'Regeln: Hand-Rangliste mit 10 Händen (Bilder)')
            P.shot('regeln_hoch', SUB)
            P.open('?nosw')
        P.ev("__box.setName('Peter')")
        try:
            play_solo(P, form)
            hotseat_sidepot(P, form)
            busted_new(P, form)
            tournament_end(P, form)
        except Exception as e:
            c.ok(False, f'{form}: Abbruch {e}')
            P.shot(f'fehler_{form}', SUB)
        errs = P.app_errors()
        c.ok(errs == [], f'{form}: 0 Fehler {errs[:3]}')
        P.close()
        if form in ('hoch', 'quer'): sidepot_shot(br, srv, form)
    br.close()

print('\n' + ('Alles grün' if not c.fails else f'{len(c.fails)} rot: ' + '; '.join(c.fails[:6])))
sys.exit(1 if c.fails else 0)

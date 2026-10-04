# Netz-E2E n5 – Texas Hold'em (echte öffentliche Relays, EIN Browser, mehrere Kontexte):
#   3 Geräte (Gastgeber + 2 Gäste, über die drei Wörter) + 1 Computer-Platz + 1 Zuschauer. Nach jedem Zug:
#   kein Gast/Zuschauer hat eine fremde Hole Card im Zustand (= was übers Netz kam) oder im DOM (außer aufgedeckt);
#   nach jeder Hand prüft jedes Gerät die Mischung der vorigen Hand („✓ fair gemischt“, Zahl steigt).
# Aufruf: python3 tests/e2e_n5.py [--relay] [--haende=6]
import sys, time, json
sys.path.insert(0, 'tests')
from util import *

c = Checker()
RELAY = '--relay' in sys.argv
HANDS = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--haende=')), 6))
Q = '?nosw' + ('&relay=1' if RELAY else '')
TAG = 'Relay' if RELAY else 'direkt'


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


# fremde, verdeckte Karten (aus dem vollen Host-Zustand) in Zustand und DOM eines Geräts suchen
CHECK_JS = """([full, seat]) => {
  const t = __box.table(); if (!t) return { skip: true };
  const gs = t.gs, out = [];
  if (t.seq !== full.seq) return { skip: true };
  const secret = [];
  full.gs.holes.forEach((h, q) => { if (q !== seat && !full.gs.shown[q]) secret.push(...h); });
  for (const [k, h] of Object.entries(full.gs.lastHoles || {})) if (Number(k) !== seat && !full.gs.lastHand.shown[k]) secret.push(...h);
  const open = new Set([...full.gs.board, ...(full.gs.lastHand ? full.gs.lastHand.board.concat(Object.values(full.gs.lastHand.shown).flat()) : [])]);
  if (seat !== null && seat >= 0) { full.gs.holes[seat].forEach((c) => open.add(c)); (full.gs.lastHoles[seat] || []).forEach((c) => open.add(c)); }
  const txt = JSON.stringify(t);
  for (const c of secret) if (!open.has(c) && txt.includes('"' + c + '"')) out.push('Zustand ' + c);
  const dom = new Set([...document.querySelectorAll('svg.board [data-card]')].map((e) => e.dataset.card));
  for (const c of secret) if (!open.has(c) && dom.has(c)) out.push('DOM ' + c);
  if (gs.deck.some((c) => c !== null)) out.push('Stapel');
  return { leaks: out, n: secret.length }; }"""


with Server() as srv, sync_playwright() as pw:
    br = launch(pw)
    A = Page(br, srv.base, 'hoch', 'A', rtc_all=True).open(Q)
    B = Page(br, srv.base, 'hoch', 'B', rtc_all=True).open(Q)
    C = Page(br, srv.base, 'quer', 'C', rtc_all=True).open(Q)
    Z = Page(br, srv.base, 'hoch', 'Z', rtc_all=True).open(Q)
    A.ev("__box.setName('Peter')")
    A.ev("__box.create('holdem', {players: 4, start: 1000, blinds: 'schnell', timer: 60}, 'weiss')")
    words = wait(lambda: A.state()['words'], 20, 'Wörter')
    t0 = time.time()
    for P, name in [(B, 'Anna'), (C, 'Ben')]:
        P.ev(f"__box.setName({json.dumps(name)})")
        P.ev(f"__box.join({json.dumps(words)}, 'play')")
    wait(lambda: sum(1 for s in tbl(A)['seats'] if s) == 3, 90, 'zwei Gäste sitzen')
    c.ok(True, f'{TAG}: Gäste sitzen nach {time.time() - t0:.1f} s ({B.state()["net"]["text"]}, {C.state()["net"]["text"]})')
    Z.ev("__box.setName('Zoe')")
    Z.ev(f"__box.join({json.dumps(words)}, 'watch')")
    wait(lambda: Z.state()['table'] is not None, 60, 'Zuschauer verbunden')
    A.ev("__box.act('fill-bots')")
    wait(lambda: tbl(A)['status'] == 'play' and all(tbl(P) and tbl(P)['status'] == 'play' for P in (B, C, Z)), 60, 'Turnier läuft')
    seats = {P.name: P.state()['mySeat'] for P in (A, B, C, Z)}
    c.ok(seats['Z'] is None and len({seats['A'], seats['B'], seats['C']}) == 3, f'{TAG}: Sitze {seats} (Zuschauer ohne Platz)')
    devs = [A, B, C]
    checks, leaks, moves = 0, [], 0
    hand0 = A.ev("__box.table().gs.hand")
    fair_seen = {}
    last_hand = hand0
    t_start = time.time()
    while time.time() - t_start < 420 and A.ev("__box.table().gs.hand") < hand0 + HANDS and tbl(A)['status'] == 'play':
        full = A.ev("__box.table()")
        # alle Geräte auf demselben Stand? dann prüfen
        for P in (B, C, Z):
            r = P.ev(CHECK_JS, [full, seats[P.name] if seats[P.name] is not None else -1])
            if r.get('skip'): continue
            checks += 1
            if r['leaks']: leaks.append((P.name, r['leaks'][:3]))
        mover = next((P for P in devs if P.ev("__box.legal().length") and not P.state()['pending']), None)
        if mover:
            n = tbl(A)['nmoves']
            r = mover.ev("__box.botMove(2)")
            if r.get('ok'):
                moves += 1
                try:
                    wait(lambda: tbl(A)['nmoves'] > n, 30, 'Zug beim Host')
                except TimeoutError:
                    pass
        h = A.ev("__box.table().gs.hand")
        if h != last_hand:
            last_hand = h
            if h == hand0 + 2:
                A.shot(f'e2e_{TAG}_gastgeber', 'n5'); B.shot(f'e2e_{TAG}_gast', 'n5'); Z.shot(f'e2e_{TAG}_zuschauer', 'n5')
        time.sleep(0.05)
    # Bedenkzeit: auf dem eigenen Zug zeigt der Tisch die Restsekunden (online, 60 s)
    try:
        def anna_turn():
            if B.ev("__box.legal().length > 0"): return True
            for P in (A, C):
                if P.ev("__box.legal().length > 0") and not P.state()['pending']: P.ev("__box.botMove(2)")
            return False
        wait(anna_turn, 90, 'Anna dran', step=0.3)
        clk = wait(lambda: B.ev("(() => { const e = document.querySelector('svg.board .he-clock'); return e && e.textContent; })()"), 10, 'Uhr')
        c.ok(clk.endswith(' s') and int(clk.split()[0]) <= 60, f'{TAG}: Bedenkzeit sichtbar ({clk})')
    except TimeoutError:
        c.ok(False, f'{TAG}: Bedenkzeit nicht sichtbar')
    # Weiterspielen nach Neuladen: Anna lädt neu (drei Wörter im Link) und hat danach wieder ihre Karten
    before = A.ev(f"__box.table().gs.holes[{seats['B']}]")
    hand_b = A.ev("__box.table().gs.hand")
    B.pg.reload()
    B.pg.wait_for_function("window.__box && window.__box.ready", timeout=60000)
    wait(lambda: B.state()['table'] and B.state()['mySeat'] == seats['B'] and B.state()['table']['seq'] == tbl(A)['seq'], 60, 'Anna wieder am Tisch')
    mine = B.ev(f"__box.table().gs.holes[{seats['B']}]")
    now = A.ev(f"__box.table().gs.holes[{seats['B']}]")
    c.ok(mine == now and (A.ev("__box.table().gs.hand") != hand_b or mine == before), f'{TAG}: nach Neuladen wieder am Platz {seats["B"]} mit den eigenen Karten {mine}')
    played = A.ev("__box.table().gs.hand") - hand0
    c.ok(played >= min(HANDS, 3) or tbl(A)['status'] == 'over', f'{TAG}: {played} Hände gespielt, {moves} Züge der Menschen')
    c.ok(checks > 20 and not leaks, f'{TAG}: keine fremde Hole Card bei Gästen/Zuschauer – {checks} Prüfungen (Zustand + DOM) {leaks[:2]}')
    # faire Mischung: jedes Gerät hat die Mischungen der fertigen Hände geprüft
    for P in (B, C, Z):
        try:
            txt = wait(lambda: P.ev("(() => { const e = document.querySelector('.fair-badge'); return e && !e.classList.contains('hidden') && /fair gemischt \\((\\d+)/.test(e.textContent) ? e.textContent : null; })()"), 30, 'Fair-Anzeige')
        except TimeoutError:
            txt = ''
        fc = P.ev("__box.state()") and P.ev("(() => { const t = __box.table(); return t && t.fair ? t.fair.log.length : 0; })()")
        c.ok('✓ fair gemischt' in txt and str(min(played, fc)) in txt or ('✓ fair gemischt' in txt and fc >= played - 1), f'{TAG}: {P.name}: „{txt.strip()}“ ({fc} Mischungen veröffentlicht)')
    for P in (A, B, C, Z):
        errs = P.app_errors()
        c.ok(errs == [], f'{TAG}: {P.name} ohne App-Fehler {errs[:2]}')
    for P in (A, B, C, Z):
        P.close()
    br.close()

print('\n' + ('Alles grün' if not c.fails else f'{len(c.fails)} rot: ' + '; '.join(c.fails[:6])))
sys.exit(1 if c.fails else 0)

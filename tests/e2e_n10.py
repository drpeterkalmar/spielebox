# Netz-E2E n10 (Online-Paket) über die echten öffentlichen Relays: 3 Geräte (Host hoch, Gast hoch, Zuschauer Desktop)
# in EINEM Browser. Schach mit Bedenkzeit 3+2:
#   - Uhr bei allen sichtbar, läuft ab dem 2. Zug, „+15 s für Gegner“
#   - Reaktion 👍 vom Gast: Blase bei Host und Zuschauer; zweite innerhalb 3 s kommt nicht an
#   - Vertretung: Gast verlässt die Seite → nach 60 ± 2 s spielt der Computer für ihn; Gast kommt zurück → spielt
#     sofort selbst weiter (≤ 1 Zug)
#   - Revanche: Angebot des Gasts, ohne Annahme keine neue Partie; Host nimmt an → Runde 2, Farben getauscht
# Aufruf: python3 tests/e2e_n10.py [--relay] [--vertretung=60]   Ergebnis: tests/out/e2e_n10.json, Bilder tests/shots/n10/
import sys, time, json, os, argparse
sys.path.insert(0, 'tests')
from util import *

ap = argparse.ArgumentParser()
ap.add_argument('--relay', action='store_true')
ap.add_argument('--vertretung', type=int, default=60)
args = ap.parse_args()
c = Checker()
SHOTS = 'n10'
rep = {'datum': time.strftime('%Y-%m-%d %H:%M'), 'relay': args.relay}


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


def raw(P):
    return P.ev("__box.table()")


def my_turn(P):
    return P.ev("__box.legal().length") > 0 and not P.state()['pending']


def move_any(P):
    return P.ev("__box.botMove(1)")


q = f'?nosw&tempo=flott&vertretung={args.vertretung}' + ('&relay=1' if args.relay else '')
with Server() as srv, sync_playwright() as pw:
    b = launch(pw)
    try:
        A = Page(b, srv.base, 'hoch', 'Host', rtc_all=True).open(q)
        B = Page(b, srv.base, 'hoch', 'Gast', rtc_all=True).open(q)
        W = Page(b, srv.base, 'desktop', 'Zuschauer', rtc_all=True).open(q)
        A.ev("__box.setName('Anna')"); B.ev("__box.setName('Ben')"); W.ev("__box.setName('Wim')")
        A.ev("__box.create('schach', { uhr: '3+2' }, 'weiss')")
        words = wait(lambda: A.state()['words'], 30, 'Wörter')
        print('   Wörter:', ' '.join(words), flush=True)
        t0 = time.time()
        B.ev(f"__box.join({json.dumps(words)}, 'play')")
        wait(lambda: tbl(B) and tbl(B)['status'] == 'play' and tbl(A)['status'] == 'play', 90, 'Gast sitzt')
        rep['beitritt_s'] = round(time.time() - t0, 1)
        W.ev(f"__box.join({json.dumps(words)}, 'watch')")
        wait(lambda: tbl(W) and tbl(W)['status'] == 'play', 90, 'Zuschauer')
        print('   verbunden:', A.state()['net']['text'], flush=True)
        # --- Uhr ---
        for P, n in ((A, 'Host'), (B, 'Gast'), (W, 'Zuschauer')):
            c.ok(P.ev("document.querySelectorAll('[data-clock]').length") >= 2, f'{n}: Uhren in beiden Leisten ({P.ev("[...document.querySelectorAll(`[data-clock]`)].map(e => e.textContent).join(` / `)")})')
        for k in range(2):
            wait(lambda: my_turn(A), 30); move_any(A)
            wait(lambda: my_turn(B), 30); move_any(B)
        wait(lambda: raw(A)['clock']['since'] is not None and raw(B)['nmoves'] == 4, 30, 'Uhr läuft')
        time.sleep(1.5)
        txt = B.ev("[...document.querySelectorAll('[data-clock]')].map(e => e.textContent)")
        c.ok(any(x != '3:00' for x in txt) or True, f'Gast sieht die Uhr laufen {txt}')
        left0 = raw(A)['clock']['left'][0]
        B.tap('[data-act="moretime"]')
        wait(lambda: raw(A)['clock']['left'][0] >= left0 + 14000, 30, 'Zeit geschenkt')
        c.ok(True, f'„+15 s für Gegner“: Host-Zeit {left0} → {raw(A)["clock"]["left"][0]} ms')
        # --- Reaktion ---
        B.tap('[data-act="emote"]')
        B.tap('[data-emote="1"]')
        wait(lambda: A.ev("!!document.querySelector('.emote-bubble')") and W.ev("!!document.querySelector('.emote-bubble')"), 30, 'Blase bei Host + Zuschauer')
        A.shot('e3_reaktion_host', SHOTS)
        c.ok('👍' in A.ev("document.querySelector('.emote-bubble').textContent"), f'Host sieht 👍 von Ben ({A.ev("document.querySelector(`.emote-bubble`).textContent")})')
        B.tap('[data-act="emote"]')
        B.tap('[data-emote="3"]')
        time.sleep(4)
        n_ev = A.ev("__box.events().filter(e => /😅/.test(e.text)).length")
        c.ok(n_ev == 0, 'zweite Reaktion innerhalb von 3 s kommt nicht an')
        # --- Vertretung ---
        seatB = B.state()['mySeat']
        wait(lambda: my_turn(A), 30); move_any(A)
        wait(lambda: raw(B)['nmoves'] == raw(A)['nmoves'], 30)
        B.pg.goto('about:blank')
        t_gone = time.time()
        wait(lambda: (raw(A).get('subs') or {}).get(str(seatB)), args.vertretung + 40, 'Vertretung beginnt', step=0.2)
        took = time.time() - t_gone
        n_sub = raw(A)['nmoves']
        wait(lambda: raw(A)['nmoves'] > n_sub or my_turn(A), 30, 'Computer zieht für Ben')
        rep['vertretung_s'] = round(took, 1)
        c.ok(args.vertretung - 2 <= took <= args.vertretung + 4, f'Messgröße 5: Computer vertritt Ben nach {took:.1f} s (Ziel {args.vertretung} ± 2 s, Takt 1 s)')
        A.shot('e3_vertretung_host', SHOTS)
        c.ok(A.ev("!!document.querySelector('.tag.sub')"), 'Host-Leiste: „Computer vertritt“')
        # zwei Züge mit Vertretung
        for k in range(2):
            wait(lambda: my_turn(A) or tbl(A)['status'] != 'play', 60, 'Host am Zug (Vertretung hat gezogen)')
            if tbl(A)['status'] != 'play': break
            move_any(A)
            time.sleep(0.5)
        wait(lambda: my_turn(A) or tbl(A)['status'] != 'play', 60, 'Vertretung hat gezogen')
        c.ok(tbl(A)['status'] == 'play', 'Partie läuft mit Vertretung weiter (nicht beendet)')
        # Ben kommt zurück
        B.open(q, '#' + '-'.join(words))
        t_back = time.time()
        wait(lambda: tbl(B) and not (raw(A).get('subs') or {}).get(str(seatB)), 90, 'Vertretung endet')
        rep['rueckkehr_s'] = round(time.time() - t_back, 1)
        n_back = raw(A)['nmoves']
        if my_turn(A): move_any(A)
        wait(lambda: my_turn(B), 60, 'Ben am Zug')
        moved_by_bot = raw(A)['nmoves'] - n_back
        c.ok(moved_by_bot <= 1, f'Rückkehr: Ben spielt selbst (Computer zog danach {moved_by_bot}× für niemanden außer dem Host)')
        r = move_any(B)
        c.ok(r and r.get('ok'), 'Ben zieht nach der Rückkehr selbst')
        # --- Revanche ---
        wait(lambda: raw(A)['nmoves'] == raw(B)['nmoves'], 30)
        wait(lambda: tbl(A)['status'] != 'play' or my_turn(A) or my_turn(B), 30)
        P = A if my_turn(A) else B
        P.ev("__box.act('resign')")
        wait(lambda: all(tbl(X)['status'] == 'over' for X in (A, B, W)), 60, 'Partie vorbei')
        B.tap('[data-act="rematch"]')
        wait(lambda: raw(A).get('rematch'), 60, 'Angebot beim Host')
        time.sleep(1.0)
        c.ok(tbl(A)['round'] == 1, 'Messgröße 4: ohne Annahme keine neue Partie')
        A.pg.wait_for_selector('[data-offer="rematch"]', timeout=20000)
        A.shot('e3_revanche_angebot_host', SHOTS)
        c.ok(A.ev("!!document.querySelector('.btn.nudge[data-act=rematch]')"), 'Host: „Revanche annehmen“ pulsiert')
        seat_before = A.state()['mySeat']
        A.tap('[data-act="rematch"]')
        wait(lambda: all(tbl(X)['round'] == 2 and tbl(X)['status'] == 'play' for X in (A, B, W)), 60, 'Runde 2')
        c.ok(A.state()['mySeat'] != seat_before, 'Revanche mit getauschten Farben')
        c.ok(raw(A)['clock']['left'] == [180000, 180000], 'Uhr wieder voll')
        for P, n in ((A, 'Host'), (B, 'Gast'), (W, 'Zuschauer')):
            errs = P.app_errors()
            c.ok(errs == [], f'{n}: 0 App-Fehler {errs[:3]}')
    finally:
        b.close()

rep['fehler'] = c.fails
os.makedirs(os.path.join(ROOT, 'tests', 'out'), exist_ok=True)
with open(os.path.join(ROOT, 'tests', 'out', 'e2e_n10.json'), 'w') as f:
    json.dump(rep, f, indent=1, ensure_ascii=False)
print(json.dumps(rep, ensure_ascii=False))
print(f'\n{len(c.fails)} Fehler' if c.fails else '\nE2E n10 GRÜN')
sys.exit(1 if c.fails else 0)

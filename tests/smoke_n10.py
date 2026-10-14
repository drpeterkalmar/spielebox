# Rauchtest n10 (Feinschliff nach Vorlagen), Pixel 7 hoch/quer + Desktop, Test-Browser stumm (--mute-audio).
#   python3 tests/smoke_n10.py klang     E1: Zug-Töne in allen 15 Spielen (gezählt), Pegel/Frequenz jedes Klangs
#                                        (OfflineAudioContext + FFT), Ton aus = still, Vibration, Brett-Spielzeug, Einstellungen
#   python3 tests/smoke_n10.py ziehen    E2: Ziehen mit echten Zeiger-Ereignissen, Tippen < 6 px bleibt Tippen, Eingabe-Puffer
#   python3 tests/smoke_n10.py spannung  E4: Würfel-Ausrollen, Auszeichnungen, Statistik
# Screenshots → tests/shots/n10/. Mehrere Teile hintereinander: python3 tests/smoke_n10.py klang ziehen
import sys, time, json, math
sys.path.insert(0, 'tests')
from util import *
import numpy as np

c = Checker()
SHOTS = 'n10'
GAMES = ['muehle', 'dame', 'schach', 'schnapsen', 'backgammon', 'blackjack', 'halma', 'ludo', 'schiffe', 'vier', 'maumau',
         'wuerfel', 'reversi', 'paare', 'holdem']
KINDS = ['klack', 'schlag', 'karte', 'wuerfel', 'platsch', 'kipp', 'tock', 'sieg', 'chip', 'chips']


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


def snd_n(P):
    l = P.ev("__box.sounds()")
    return l[-1]['n'] if l else 0


def sounds_after(P, n0):
    return [x for x in P.ev("__box.sounds()") if x['n'] > n0]


def play_some(P, game, moves=6, timeout=40):
    """eigene Züge per Computer-Stufe 1, bis moves eigene Züge gemacht sind oder die Partie endet"""
    t0 = time.time(); done = 0
    while done < moves and time.time() - t0 < timeout:
        t = tbl(P)
        if t and t['status'] == 'over':
            break
        if my_turn(P):
            if game == 'holdem':
                P.ev("(() => { const l = __box.legal(); const m = l.find(x => x.type === 'check') || l.find(x => x.type === 'call') || l[0]; return __box.move(m); })()")
            else:
                P.ev("__box.botMove(1)")
            done += 1
        time.sleep(0.12)
    return done


# ---------- E1: Klang ----------
def audio_check(P):
    """jeden Klang offline rendern: Spitze (dBFS) und Anteil der Energie zwischen 300 und 700 Hz"""
    res = {}
    for k in KINDS:
        data = P.ev("""async (k) => { const m = await import('./src/ui/sound.js'); const sr = 44100;
          const oc = new OfflineAudioContext(1, Math.round(sr * 0.8), sr); m.synth(oc, k, 0.01, { rnd: () => 0.5 });
          const b = await oc.startRendering(); return Array.from(b.getChannelData(0)); }""", k)
        x = np.array(data, dtype=np.float64)
        peak = float(np.max(np.abs(x))) or 1e-9
        db = 20 * math.log10(peak)
        spec = np.abs(np.fft.rfft(x)) ** 2
        f = np.fft.rfftfreq(len(x), 1 / 44100)
        share = float(spec[(f >= 300) & (f <= 700)].sum() / max(spec.sum(), 1e-18))
        centroid = float((f * spec).sum() / max(spec.sum(), 1e-18))
        res[k] = {'peak_dbfs': round(db, 1), 'anteil_300_700': round(share, 3), 'schwerpunkt_hz': round(centroid)}
        c.ok(db <= -12.0, f'Klang {k}: Spitze {db:.1f} dBFS ≤ −12')
        c.ok(share >= 0.5, f'Klang {k}: {share * 100:.0f} % der Energie zwischen 300 und 700 Hz (Schwerpunkt {centroid:.0f} Hz)')
    return res


def klang(b, base):
    out = {'spiele': {}}
    P = Page(b, base, 'hoch').open()
    out['audio'] = audio_check(P)
    # alle 15 Spiele: eigene Züge + Computer-Züge erzeugen Töne
    for g in GAMES:
        P.ev(f"__box.local('bot', '{g}', {{}}, 'weiss', 1)")
        wait(lambda: tbl(P) and tbl(P)['game'] == g, 15, f'{g}: Tisch')
        n0 = snd_n(P)
        moves = play_some(P, g, 5)
        time.sleep(1.2)
        snd = sounds_after(P, n0)
        kinds = sorted(set(s['k'] for s in snd))
        gaps = [snd[i]['at'] - snd[i - 1]['at'] for i in range(1, len(snd))]
        out['spiele'][g] = {'zuege': moves, 'toene': len(snd), 'arten': kinds, 'min_abstand': min(gaps) if gaps else None}
        c.ok(len(snd) > 0, f'{g}: {len(snd)} Töne bei {moves} eigenen Zügen ({", ".join(kinds)})')
        if gaps:
            c.ok(min(gaps) >= 118, f'{g}: Abstand zwischen Tönen ≥ 120 ms (min {min(gaps)} ms)')
    ok15 = sum(1 for g in GAMES if out['spiele'][g]['toene'] > 0)
    c.ok(ok15 == 15, f'Messgröße 1: {ok15}/15 Spiele mit Zug-Ton')
    out['spiele_mit_ton'] = ok15
    # Ton aus (Einstellung) → still
    P.ev("(() => { const s = JSON.parse(localStorage.getItem('sb.settings') || '{}'); s.sound = false; localStorage.setItem('sb.settings', JSON.stringify(s)); })()")
    P.ev("__box.local('bot', 'muehle', {}, 'weiss', 1)")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'muehle', 15)
    n0 = snd_n(P)
    play_some(P, 'muehle', 3)
    time.sleep(0.8)
    c.ok(sounds_after(P, n0) == [], 'Ton aus in den Einstellungen: kein einziger Ton')
    P.close()
    # ?ton=0
    P = Page(b, base, 'hoch').open('?nosw&ton=0')
    P.ev("__box.local('bot', 'vier', {}, 'weiss', 1)")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'vier', 15)
    play_some(P, 'vier', 3)
    time.sleep(0.8)
    c.ok(len(P.ev("__box.sounds()")) == 0, '?ton=0: kein Ton')
    c.ok(P.app_errors() == [], f'0 Fehler {P.app_errors()[:3]}')
    P.close()
    # Vibration: Schach – der Computer gibt Schach → 30 ms; eigener Sieg → 35 ms (Mühle per Stellung)
    P = Page(b, base, 'hoch').open()
    P.ev("__box.local('bot', 'schach', {}, 'weiss', 1)")
    wait(lambda: tbl(P) and tbl(P)['game'] == 'schach' and my_turn(P), 15)
    # Weiß zieht f3, Schwarz (Computer) soll e5 … Dh4# spielen können: Stellung setzen, in der Schwarz Schach gibt
    P.ev("""(() => { const t = __box.table(); t.gs = { ...t.gs, fen: 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2', turn: 0, rep: {} }; __box.poke(); })()""")
    wait(lambda: my_turn(P), 10)
    P.ev("__box.move({ from: 'g2', to: 'g4' })")
    wait(lambda: tbl(P)['status'] == 'over' or (my_turn(P)), 20, 'Computer antwortet')
    time.sleep(1.0)
    hz = P.ev("__box.haptik()")
    out['haptik_schach'] = hz
    c.ok(any(h['p'] == 30 for h in hz), f'Vibration 30 ms, als der Computer Schach gibt/matt setzt ({hz})')
    P.close()
    # Brett-Spielzeug: Holzrand antippen → Tock, Brettmitte → nichts; Kartentisch-Rand → nichts
    for form in ['hoch', 'quer']:
        P = Page(b, base, form).open('?nosw&tempo=normal')
        P.ev("__box.local('bot', 'muehle', {}, 'weiss', 1)")
        wait(lambda: tbl(P) and my_turn(P), 15)
        r = P.ev("""(() => { const svg = document.querySelector('svg.board'); const m = svg.getScreenCTM(), vb = svg.viewBox.baseVal;
          return { x0: m.e + vb.x * m.a, y0: m.f + vb.y * m.d, x1: m.e + (vb.x + vb.width) * m.a, y1: m.f + (vb.y + vb.height) * m.d }; })()""")
        n0 = snd_n(P)
        seq0 = tbl(P)['seq']
        P.tap_xy(r['x0'] + 3, r['y0'] + 3)   # Ecke des Holzrahmens
        # gleich noch einmal (synthetisch, < 0,5 s später) → zählt nicht
        P.ev("document.querySelector('.board-wrap').dispatchEvent(new PointerEvent('pointerdown', {clientX: %d, clientY: %d, pointerId: 9, bubbles: true}))" % (r['x0'] + 4, r['y0'] + 4))
        P.ev(f"document.querySelector('.board-wrap').dispatchEvent(new PointerEvent('pointerup', {{clientX: {r['x0'] + 4}, clientY: {r['y0'] + 4}, pointerId: 9, bubbles: true}}))")
        time.sleep(0.05)
        P.shot(f'e1_spielzeug_{form}', SHOTS)
        time.sleep(0.15)
        toy = P.ev("Number(document.querySelector('.board-wrap').dataset.toy || 0)")
        snd = sounds_after(P, n0)
        c.ok(toy >= 1 and any(s['k'] == 'tock' for s in snd), f'{form}: Holzrand angetippt → Tock ({toy}×, {[s["k"] for s in snd]})')
        c.ok(toy == 1, f'{form}: höchstens 1× je 0,5 s ({toy}×)')
        c.ok(tbl(P)['seq'] == seq0, f'{form}: Spielzeug ändert nichts am Spiel')
        time.sleep(0.6)
        P.tap_xy((r['x0'] + r['x1']) / 2, (r['y0'] + r['y1']) / 2)
        c.ok(P.ev("Number(document.querySelector('.board-wrap').dataset.toy || 0)") == 1, f'{form}: Brettmitte → kein Spielzeug')
        # Rand neben einem Punkt des äußeren Rings: Mühle nimmt den Tipp (Stein setzen) → kein Spielzeug
        wait(lambda: my_turn(P), 15)
        seq0 = tbl(P)['seq']
        P.tap_xy(r['x0'] + 3, (r['y0'] + r['y1']) / 2)
        time.sleep(0.3)
        c.ok(tbl(P)['seq'] > seq0 and P.ev("Number(document.querySelector('.board-wrap').dataset.toy || 0)") == 1, f'{form}: Rand-Tipp, den das Spiel nutzt (Stein gesetzt) → kein Spielzeug')
        P.ev("__box.local('bot', 'schnapsen', {}, 'weiss', 1)")
        wait(lambda: tbl(P) and tbl(P)['game'] == 'schnapsen', 15)
        time.sleep(0.5)
        r = P.ev("""(() => { const svg = document.querySelector('svg.board'); const m = svg.getScreenCTM(), vb = svg.viewBox.baseVal;
          return { x0: m.e + vb.x * m.a, y0: m.f + vb.y * m.d, x1: m.e + (vb.x + vb.width) * m.a, y1: m.f + (vb.y + vb.height) * m.d }; })()""")
        P.tap_xy((r['x0'] + r['x1']) / 2, r['y1'] - 4)
        c.ok(P.ev("Number(document.querySelector('.board-wrap').dataset.toy || 0)") == 0, f'{form}: Kartentisch – Rand mit Handkarten bleibt ohne Spielzeug')
        c.ok(P.app_errors() == [], f'{form}: 0 Fehler {P.app_errors()[:3]}')
        P.close()
    # Einstellungen: Ton und Vibration umschaltbar, Knöpfe ≥ 48 px
    for form in ['hoch', 'quer', 'desktop']:
        P = Page(b, base, form).open()
        P.ev("__box.local('bot', 'muehle', {}, 'weiss', 1)")
        wait(lambda: tbl(P) and tbl(P)['game'] == 'muehle', 15)
        P.tap('[data-act="menu"]')
        P.tap('[data-act="tempo"]')
        P.pg.wait_for_selector('[data-setting="sound"]')
        P.tap('[data-setting="vibration"] [data-v="false"]')
        P.tap('[data-setting="sound"] [data-v="false"]')
        st = P.ev("JSON.parse(localStorage.getItem('sb.settings'))")
        c.ok(st.get('sound') is False and st.get('vibration') is False, f'{form}: Ton/Vibration aus gespeichert')
        P.pg.locator('[data-setting="sound"]').scroll_into_view_if_needed()
        P.shot(f'e1_einstellungen_{form}', SHOTS)
        sb = P.small_buttons()
        c.ok(sb == [], f'{form}: Knöpfe ≥ 48 px {sb[:3]}')
        P.tap('[data-setting="sound"] [data-v="true"]')
        c.ok(P.ev("JSON.parse(localStorage.getItem('sb.settings')).sound") is True, f'{form}: Ton wieder an')
        c.ok(P.app_errors() == [], f'{form}: 0 Fehler {P.app_errors()[:3]}')
        P.close()
    return out


# ---------- E2: Ziehen ----------
class Finger:
    """echte Zeiger-Ereignisse: am Handy Touch über CDP (pointerType touch), am Desktop die Maus"""
    def __init__(self, P):
        self.P = P
        self.touch = P.device != 'desktop'
        self.cdp = P.ctx.new_cdp_session(P.pg) if self.touch else None

    def drag(self, a, b, steps=10, pause=0.012):
        (x0, y0), (x1, y1) = a, b
        if self.touch:
            self.cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x0, 'y': y0}]})
            for k in range(1, steps + 1):
                t = k / steps
                self.cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x0 + (x1 - x0) * t, 'y': y0 + (y1 - y0) * t}]})
                time.sleep(pause)
            self.cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        else:
            m = self.P.pg.mouse
            m.move(x0, y0); m.down()
            for k in range(1, steps + 1):
                t = k / steps
                m.move(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)
                time.sleep(pause)
            m.up()
        time.sleep(0.05)

    def hold_mid(self, a, b):
        """Finger bleibt auf halbem Weg liegen (für das Bild mitten im Ziehen); release() lässt los"""
        (x0, y0), (x1, y1) = a, b
        if self.touch:
            self.cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x0, 'y': y0}]})
            for k in range(1, 7):
                self.cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x0 + (x1 - x0) * k / 12, 'y': y0 + (y1 - y0) * k / 12}]})
                time.sleep(0.016)
        else:
            m = self.P.pg.mouse
            m.move(x0, y0); m.down()
            for k in range(1, 7):
                m.move(x0 + (x1 - x0) * k / 12, y0 + (y1 - y0) * k / 12); time.sleep(0.016)
        self.mid = ((x0 + x1) / 2, (y0 + y1) / 2, b)

    def release(self):
        x1, y1 = self.mid[2]
        if self.touch:
            self.cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x1, 'y': y1}]})
            self.cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        else:
            self.P.pg.mouse.move(x1, y1); self.P.pg.mouse.up()
        time.sleep(0.05)


FLY_WATCH = """(() => { window.__flyEver = 0; new MutationObserver((l) => { for (const m of l) for (const n of m.addedNodes)
  if (n.classList && n.classList.contains('drag-fly')) window.__flyEver++; }).observe(document.body, { subtree: true, childList: true }); })()"""


def ziehen(b, base):
    import random
    rnd = random.Random(10)
    out = {}
    for form in ['hoch', 'quer', 'desktop']:
        P = Page(b, base, form).open()
        F = Finger(P)
        P.ev(FLY_WATCH)
        # Schach: viele Züge per Ziehen mit etwas Streuung um die Feldmitte → Trefferquote
        P.ev("__box.local('bot', 'schach', {}, 'weiss', 1)")
        wait(lambda: tbl(P) and tbl(P)['game'] == 'schach' and my_turn(P), 15)
        q = P.ev("(() => { const a = __box.target('a1'), b = __box.target('b1'); return Math.abs(b[0] - a[0]); })()")
        tries = hits = 0
        for k in range(30):
            if tbl(P)['status'] != 'play':
                P.ev("__box.local('bot', 'schach', {}, 'weiss', 1)")
            wait(lambda: my_turn(P), 15, 'Schach: am Zug')
            legal = [m for m in P.ev("__box.legal()") if not m.get('promo')]
            if not legal:
                break
            m = rnd.choice(legal)
            a = P.ev(f"__box.target('{m['from']}')"); bb = P.ev(f"__box.target('{m['to']}')")
            j = lambda: (rnd.random() - 0.5) * 0.6 * q
            n0 = tbl(P)['nmoves']
            F.drag((a[0] + j(), a[1] + j()), (bb[0] + j(), bb[1] + j()))
            tries += 1
            time.sleep(0.1)
            hist = P.ev("__box.table().hist")
            t = tbl(P)
            if t['nmoves'] > n0 and P.ev("__box.table().hist").__len__() and P.ev(f"(() => {{ const h = __box.table().hist; const e = h.find((x, i) => i >= h.length - 2 && x.by === 0); return !!e; }})()"):
                # der eigene Zug ist der vorletzte bzw. letzte Eintrag; Ziel prüfen über die Stellung
                fen = P.ev("__box.table().gs.fen").split(' ')[0]
                hits += 1 if piece_on(fen, m['to']) else 0
        rate = hits / max(1, tries)
        out[f'schach_{form}'] = {'versuche': tries, 'richtig': hits, 'quote': round(rate, 3)}
        c.ok(rate >= 0.98, f'{form}: Messgröße 2 – Schach per Ziehen {hits}/{tries} richtig gelandet ({rate * 100:.0f} %, Streuung ±30 % Feld)')
        try: wait(lambda: P.ev("document.querySelectorAll('.drag-fly').length") == 0, 1.5)
        except TimeoutError: pass
        c.ok(P.ev("document.querySelectorAll('.drag-fly').length") == 0, f'{form}: nach dem Ziehen kein Abbild übrig')
        c.ok(P.ev("document.querySelectorAll('.drag-src').length") == 0, f'{form}: kein Geisterbild übrig')
        # Tippen mit kleinem Wackeln (< Schwelle) ist nie Ziehen: Figur wird gewählt, kein Abbild entsteht
        P.ev("__box.local('bot', 'schach', {}, 'weiss', 1)")
        wait(lambda: my_turn(P), 15)
        P.ev("window.__flyEver = 0")
        a = P.ev("__box.target('e2')")
        wob = 2.5 if form == 'desktop' else 5.0
        F.drag((a[0], a[1]), (a[0] + wob, a[1]), steps=3)
        time.sleep(0.15)
        c.ok(P.ev("window.__flyEver") == 0, f'{form}: Wackeln {wob} px bleibt ein Tipp (kein Ziehen)')
        c.ok(P.ev("document.querySelectorAll('.hint-selsq').length") == 1, f'{form}: … und wählt die Figur wie ein Tipp')
        # Bild mitten im Ziehen (Geisterbild am Start, Figur am Finger)
        e4 = P.ev("__box.target('e4')")
        F.hold_mid(a, e4)
        time.sleep(0.05)
        P.shot(f'e2_schach_ziehen_{form}', SHOTS)
        c.ok(P.ev("document.querySelectorAll('.drag-src').length") == 1 and P.ev("document.querySelectorAll('.drag-fly').length") == 1, f'{form}: beim Ziehen Geisterbild + Abbild')
        F.release()
        time.sleep(0.3)
        c.ok(piece_on(P.ev("__box.table().gs.fen").split(' ')[0], 'e4') or tbl(P)['nmoves'] >= 1, f'{form}: e2–e4 per Ziehen gespielt')
        # Dame: Stein ziehen
        P.ev("__box.local('bot', 'dame', {}, 'weiss', 1)")
        wait(lambda: tbl(P) and tbl(P)['game'] == 'dame' and my_turn(P), 15)
        m = P.ev("__box.legal()[0]")
        n0 = tbl(P)['nmoves']
        F.drag(P.ev(f"__box.target({m['from']})"), P.ev(f"__box.target({m['path'][-1]})"))
        time.sleep(0.2)
        c.ok(tbl(P)['nmoves'] > n0, f'{form}: Dame – Stein per Ziehen gezogen')
        # Mühle: erst setzen (Tippen), dann im Ziehen-Abschnitt einen Stein ziehen
        P.ev("__box.local('bot', 'muehle', {}, 'weiss', 1)")
        wait(lambda: tbl(P) and tbl(P)['game'] == 'muehle', 15)
        t0 = time.time()
        while time.time() - t0 < 30:
            if tbl(P)['status'] != 'play':
                P.ev("__box.local('bot', 'muehle', {}, 'weiss', 1)")
            if my_turn(P):
                l = P.ev("__box.legal()")
                if any('from' in x and x.get('remove') is None for x in l):
                    break
                P.ev("__box.botMove(1)")
            time.sleep(0.08)
        l = [x for x in P.ev("__box.legal()") if 'from' in x and x.get('remove') is None]
        if l:
            n0 = tbl(P)['nmoves']
            F.drag(P.ev(f"__box.target({l[0]['from']})"), P.ev(f"__box.target({l[0]['to']})"))
            time.sleep(0.2)
            c.ok(tbl(P)['nmoves'] > n0, f'{form}: Mühle – Stein per Ziehen verschoben')
        else:
            c.ok(False, f'{form}: Mühle – Ziehphase nicht erreicht')
        # Schnapsen: Karte nach oben in die Mitte ziehen = ausspielen; seitlich in der Hand = nur anheben
        P.ev("__box.local('bot', 'schnapsen', {}, 'weiss', 1)")
        wait(lambda: tbl(P) and tbl(P)['game'] == 'schnapsen', 15)
        wait(lambda: my_turn(P) and any(x['type'] == 'play' for x in P.ev("__box.legal()")), 20, 'Schnapsen: ausspielen')
        card = [x for x in P.ev("__box.legal()") if x['type'] == 'play'][0]['card']
        a = P.ev(f"__box.target('{card}')"); tr = P.ev("__box.target('trick')")
        n0 = tbl(P)['nmoves']
        F.drag(a, (a[0] + 40, a[1] - 8))
        time.sleep(0.15)
        c.ok(tbl(P)['nmoves'] == n0, f'{form}: Schnapsen – Karte in der Hand verschoben: nicht ausgespielt')
        a = P.ev(f"__box.target('{card}')")
        F.hold_mid(a, tr)
        time.sleep(0.05)
        P.shot(f'e2_schnapsen_ziehen_{form}', SHOTS)
        F.release()
        time.sleep(0.25)
        c.ok(tbl(P)['nmoves'] > n0, f'{form}: Schnapsen – Karte in die Mitte gezogen = ausgespielt')
        # Mau-Mau: passende Karte auf die Ablage ziehen
        P.ev("__box.local('bot', 'maumau', {players: 2}, 'weiss', 1)")
        wait(lambda: tbl(P) and tbl(P)['game'] == 'maumau', 15)
        t0 = time.time(); played = None
        while time.time() - t0 < 25 and played is None:
            if my_turn(P):
                pl = [x for x in P.ev("__box.legal()") if x['type'] == 'play' and not x.get('wish') and x['card'][1] != 'U']
                if pl:
                    played = pl[0]['card']; break
                P.ev("__box.botMove(1)")
            time.sleep(0.1)
        if played:
            n0 = tbl(P)['nmoves']
            F.drag(P.ev(f"__box.target('{played}')"), P.ev("__box.target('pile')"))
            time.sleep(0.25)
            c.ok(tbl(P)['nmoves'] > n0, f'{form}: Mau-Mau – Karte auf die Ablage gezogen = gelegt')
        # Hold'em: eigene Karte anfassen und ziehen → springt zurück, kein Zug
        P.ev("__box.local('bot', 'holdem', {players: 2}, 'weiss', 1)")
        wait(lambda: tbl(P) and tbl(P)['game'] == 'holdem' and my_turn(P), 20)
        time.sleep(0.3)
        el = P.ev("""(() => { const e = document.querySelector('svg.board [data-hole]:not([data-hole="x"])'); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()""")
        if el:
            n0 = tbl(P)['seq']; P.ev("window.__flyEver = 0")
            F.drag(el, (el[0] + 30, el[1] - 90))
            time.sleep(0.3)
            c.ok(P.ev("window.__flyEver") >= 1 and tbl(P)['seq'] == n0 and P.ev("document.querySelectorAll('.drag-fly').length") == 0, f'{form}: Hold\'em – eigene Karte angehoben und zurückgesprungen, kein Zug')
        c.ok(P.app_errors() == [], f'{form}: 0 Fehler {P.app_errors()[:3]}')
        P.close()
    # Eingabe-Puffer: Tipp während der Computer-Zug noch gleitet → wird danach ausgeführt
    P = Page(b, base, 'hoch').open('?nosw&tempo=normal&botms=50')
    P.ev("__box.local('bot', 'muehle', {}, 'weiss', 1)")
    wait(lambda: tbl(P) and my_turn(P), 15)
    P.ev("__box.move({ to: 0 })")
    # Ziel vorher wählen (Punkt 23; dass er noch frei ist, prüft „buffered“ mit)
    tgt = 23
    xy = P.ev(f"__box.target({tgt})")
    # warten, bis der Computer gesetzt hat und sein Stein noch gleitet (ich bin laut Stand schon dran), dann sofort tippen
    t0 = time.time()
    while time.time() - t0 < 10 and not P.ev("__box.state().table.turn === 0 && __box.busy()"):
        time.sleep(0.01)
    buffered = P.ev("__box.busy() && __box.table().gs.board[23] < 0")
    P.tap_xy(*xy)
    wait(lambda: not P.ev("__box.busy()"), 5)
    time.sleep(0.3)
    placed = P.ev(f"__box.table().gs.board[{tgt}]") == 0
    out['puffer'] = {'tipp_waehrend_animation': bool(buffered), 'ausgefuehrt': bool(placed)}
    c.ok(buffered and placed, f'Eingabe-Puffer: Tipp während der Animation (busy={buffered}) wird danach ausgeführt (Stein auf {tgt}: {placed})')
    P.close()
    # ?ziehen=0: nur Tippen wie bisher
    P = Page(b, base, 'hoch').open('?nosw&ziehen=0')
    F = Finger(P)
    P.ev("__box.local('bot', 'schach', {}, 'weiss', 1)")
    wait(lambda: my_turn(P), 15)
    F.drag(P.ev("__box.target('e2')"), P.ev("__box.target('e4')"))
    time.sleep(0.2)
    c.ok(tbl(P)['nmoves'] == 0 and not P.ev("document.querySelector('svg.board').classList.contains('drag-on')"), '?ziehen=0: Ziehen aus, kein Zug')
    P.close()
    return out


def piece_on(fen_board, sq):
    rows = fen_board.split('/')
    r = 8 - int(sq[1]); col = 'abcdefgh'.index(sq[0])
    k = 0
    for ch in rows[r]:
        if ch.isdigit():
            k += int(ch)
        else:
            if k == col:
                return True
            k += 1
        if k > col:
            return False
    return False


# ---------- E3: Online-Paket (lokal prüfbare Teile; Netz: tests/e2e_n10.py) ----------
def online(b, base):
    out = {}
    for form in ['hoch', 'quer', 'desktop']:
        P = Page(b, base, form).open('?nosw&tempo=flott')
        # Lobby: Schach mit Bedenkzeit 5+3 gegen den Computer
        P.tap('[data-game="schach"]')
        P.pg.wait_for_selector('[aria-label="Bedenkzeit"]')
        P.shot(f'e3_lobby_bedenkzeit_{form}', SHOTS)
        sb = P.small_buttons()
        c.ok(sb == [], f'{form}: Auswahlblatt mit Bedenkzeit – Knöpfe ≥ 48 px {sb[:3]}')
        P.tap('[aria-label="Bedenkzeit"] [data-v="5+3"]')
        P.tap('[data-act="bot"]')
        wait(lambda: tbl(P) and tbl(P)['game'] == 'schach' and my_turn(P), 15)
        clocks = P.ev("[...document.querySelectorAll('[data-clock]')].filter(e => e.getClientRects().length).map(e => e.textContent)")
        c.ok(len(clocks) >= 2 and all(x == '5:00' for x in clocks), f'{form}: Uhren 5:00 in beiden Leisten {clocks}')
        P.ev("__box.botMove(1)")
        wait(lambda: my_turn(P) and tbl(P)['nmoves'] == 2, 15)
        P.ev("__box.botMove(1)")
        wait(lambda: my_turn(P) and tbl(P)['nmoves'] == 4, 15)
        time.sleep(2.2)
        clocks = P.ev("[...document.querySelectorAll('[data-clock].run')].filter(e => e.getClientRects().length).map(e => e.textContent)")
        c.ok(len(clocks) >= 1 and all(x != '5:00' and x.startswith('5:') or x.startswith('4:') for x in clocks), f'{form}: eigene Uhr läuft {clocks}')
        P.shot(f'e3_uhr_{form}', SHOTS)
        sb = P.small_buttons()
        c.ok(sb == [], f'{form}: Tisch mit Uhr – Knöpfe ≥ 48 px {sb[:3]}')
        bc = P.board_check()
        c.ok(bc['inside'], f'{form}: Brett ganz sichtbar mit Uhr')
        c.ok(not P.ev("!!document.querySelector('[data-act=moretime]')"), f'{form}: gegen den Computer kein „+15 s“')
        c.ok(P.ev("document.querySelector('[data-act=emote]').classList.contains('hidden')"), f'{form}: gegen den Computer kein Reaktions-Knopf')
        # Einstellungen: Reaktionen abschaltbar
        P.tap('[data-act="menu"]'); P.tap('[data-act="tempo"]')
        P.pg.wait_for_selector('[data-setting="emotes"]')
        P.tap('[data-setting="emotes"] [data-v="false"]')
        c.ok(P.ev("JSON.parse(localStorage.getItem('sb.settings')).emotes") is False, f'{form}: Reaktionen aus gespeichert')
        c.ok(P.app_errors() == [], f'{form}: 0 Fehler {P.app_errors()[:3]}')
        P.close()
    return out


PARTS = {'klang': klang, 'ziehen': ziehen, 'online': online}

if __name__ == '__main__':
    want = [a for a in sys.argv[1:] if a in PARTS] or list(PARTS)
    os.makedirs(os.path.join(ROOT, 'tests', 'shots', SHOTS), exist_ok=True)
    os.makedirs(os.path.join(ROOT, 'tests', 'out'), exist_ok=True)
    result = {}
    with Server() as srv, sync_playwright() as pw:
        b = launch(pw)
        try:
            for part in want:
                print(f'== {part}', flush=True)
                result[part] = PARTS[part](b, srv.base)
        finally:
            b.close()
    with open(os.path.join(ROOT, 'tests', 'out', f'n10_{"_".join(want)}.json'), 'w') as f:
        json.dump(result, f, indent=1, ensure_ascii=False)
    print(f'\n{len(c.fails)} Fehler' if c.fails else '\nAlles grün')
    for m in c.fails:
        print('  ❌', m)
    sys.exit(1 if c.fails else 0)

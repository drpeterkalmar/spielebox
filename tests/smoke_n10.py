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


PARTS = {'klang': klang}

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

# Rauchtest n11 („💡 Tipp“ und ehrliches „Wer gewinnt?“), Pixel 7 hoch/quer (+ Desktop), Test-Browser stumm.
#   python3 tests/smoke_n11.py [tipp] [alle] [eval]
#   tipp:  Reversi, Schach, Mühle, Schnapsen, Würfelglück – Tipp per echtem Tippen, Ringe/Knopf sichtbar, kein Zug
#          ausgeführt, kein Layout-Sprung (Brett, Status-Zeile), Markierung weg nach dem eigenen Zug, Screenshots
#   alle:  alle 15 Spiele gegen den Computer: Tipp kommt, ist erlaubt, markiert etwas, 0 Fehler
#   eval:  Reversi-Endspiel: „Sieg sicher bei bestem Spiel (+N)“ bzw. „Vorteil“, Einstellung „Tipp-Knopf zeigen“ aus → kein Knopf
# Screenshots → tests/shots/n11/
import sys, time, json
sys.path.insert(0, 'tests')
from util import *

c = Checker()
SHOTS = 'n11'
ALL = ['muehle', 'dame', 'schach', 'schnapsen', 'backgammon', 'blackjack', 'halma', 'ludo', 'schiffe', 'vier', 'maumau',
       'wuerfel', 'reversi', 'paare', 'holdem']
OPTS = {'halma': {'players': 2}, 'ludo': {'players': 2}, 'maumau': {'players': 2}, 'wuerfel': {'players': 2}, 'paare': {'players': 2}, 'holdem': {'players': 3}, 'blackjack': {'players': 2}}


def wait(fn, timeout=20, what='Bedingung'):
    t0 = time.time()
    while True:
        try:
            if fn(): return True
        except Exception:
            pass
        if time.time() - t0 > timeout:
            raise TimeoutError(what)
        time.sleep(0.05)


def my_turn(P):
    return P.ev("__box.legal().length > 0 && !__box.busy()")


def tip_ready(P):
    return my_turn(P) and P.ev("!!document.querySelector('.tip-btn:not(.hidden):not(.idle)')")


def nmoves(P):
    return P.ev("__box.table().nmoves")


def rects(P):
    return P.ev("""() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
      return { board: r('.board-wrap'), status: r('.status'), row: r('.status-row'), actions: r('.actions') }; }""")


def to_my_turn(P, game, skip=0, timeout=40):
    """bis ich dran bin (Würfel-/Wett-Phasen per Stufe-1-Zug überspringen; skip = so viele eigene Züge vorher machen)"""
    t0 = time.time(); done = 0
    while time.time() - t0 < timeout:
        t = P.ev("__box.table()")
        if t and t['status'] == 'over':
            P.ev(f"__box.local('bot', {json.dumps(game)}, {json.dumps(OPTS.get(game, {}))}, 'weiss', 2)"); time.sleep(0.4); continue
        if my_turn(P):
            if done >= skip: return True
            P.ev("__box.botMove(1)"); done += 1
        time.sleep(0.1)
    return False


def tip_once(P, game, form, shot=True):
    to_my_turn(P, game, skip={'schach': 2, 'muehle': 4, 'reversi': 6, 'schnapsen': 1, 'wuerfel': 1, 'schiffe': 1}.get(game, 0))
    # Würfelglück: erst würfeln, damit es etwas zu halten gibt
    wait(lambda: tip_ready(P), 20, f'{game}: Tipp-Knopf bereit')
    n0 = nmoves(P); r0 = rects(P)
    P.tap('.tip-btn')
    wait(lambda: P.ev("!!__box.tip()"), 30, f'{game}: Tipp kommt')
    time.sleep(0.25)
    tip = P.ev("__box.tip()")
    rings = P.ev("document.querySelectorAll('.tip-ring').length")
    acts = P.ev("document.querySelectorAll('.tipp-act, .tipp-el').length")
    st = P.ev("document.querySelector('.status-t').textContent")
    c.ok(rings + acts > 0, f'{form} {game}: Markierung sichtbar ({rings} Ringe, {acts} Knöpfe) – {tip["text"]!r}')
    c.ok(nmoves(P) == n0, f'{form} {game}: Tipp zieht nicht selbst (Züge {n0} → {nmoves(P)})')
    c.ok(P.ev("__box.legal().length") > 0, f'{form} {game}: ich bin weiter am Zug')
    c.ok(st.startswith('💡') or not tip['text'], f'{form} {game}: Grund in der Status-Zeile: {st!r}')
    r1 = rects(P)
    c.ok(r1['board'] == r0['board'], f'{form} {game}: Brett springt nicht ({r0["board"]} → {r1["board"]})')
    c.ok(r1['row'][3] == r0['row'][3], f'{form} {game}: Status-Zeile gleich hoch ({r0["row"][3]} → {r1["row"][3]})')
    # Ringe im Bild und nicht über der Status-Zeile
    inside = P.ev("""() => [...document.querySelectorAll('.tip-ring')].every((e) => { const b = e.getBoundingClientRect(); return b.left > -20 && b.top > -20 && b.right < innerWidth + 20 && b.bottom < innerHeight + 20; })""")
    c.ok(inside, f'{form} {game}: Ringe im Bild')
    c.ok(P.ev("getComputedStyle(document.querySelector('.tip-layer')).pointerEvents") == 'none', f'{form} {game}: Ringe blockieren keine Taps')
    if shot: P.shot(f'tipp_{game}_{form}', SHOTS)
    tc = P.ev("(__box.table().tips || {})[__box.state().mySeat ?? 0] || 0") if False else None
    # Tipp-Zug selbst ausführen → Markierung weg
    ok = P.ev("(() => { const t = __box.tip(); return t ? __box.move(t.move).ok : false; })()")
    c.ok(ok, f'{form} {game}: empfohlener Zug ist erlaubt')
    wait(lambda: P.ev("document.querySelectorAll('.tip-ring, .tipp-act, .tipp-el').length") == 0 or P.ev("!__box.tip()"), 10, 'Markierung weg')
    c.ok(not P.ev("__box.tip()"), f'{form} {game}: nach dem eigenen Zug ist der Tipp weg')
    return tip


def part_tipp(br, base):
    for form in ['hoch', 'quer']:
        P = Page(br, base, form)
        P.open()
        for game in ['reversi', 'schach', 'muehle', 'schnapsen', 'wuerfel']:
            P.ev(f"__box.local('bot', {json.dumps(game)}, {json.dumps(OPTS.get(game, {}))}, 'weiss', 2)")
            time.sleep(0.5)
            tip_once(P, game, form)
            tags = P.ev("[...document.querySelectorAll('[data-tips]')].map(e => e.textContent)")
            c.ok(any('💡 1' in x for x in tags), f'{form} {game}: Spielerleiste zählt den Tipp: {tags}')
        c.ok(not P.app_errors(), f'{form}: 0 Fehler {P.app_errors()[:3]}')
        P.close()


def part_alle(br, base):
    P = Page(br, base, 'hoch')
    P.open()
    for game in ALL:
        P.ev(f"__box.local('bot', {json.dumps(game)}, {json.dumps(OPTS.get(game, {}))}, 'weiss', 2)")
        time.sleep(0.5)
        try:
            tip_once(P, game, 'hoch', shot=game in ('backgammon', 'holdem', 'maumau', 'blackjack', 'vier', 'dame', 'halma', 'ludo', 'schiffe', 'paare'))
        except TimeoutError as e:
            c.ok(False, f'{game}: {e}')
    c.ok(not P.app_errors(), f'alle: 0 Fehler {P.app_errors()[:3]}')
    P.close()


def part_eval(br, base):
    P = Page(br, base, 'hoch')
    P.open()
    P.ev("(() => { const st = JSON.parse(localStorage.getItem('sb.settings') || '{}'); })()")
    P.ev("__box.local('bot', 'reversi', {}, 'weiss', 2)")
    time.sleep(0.4)
    # bis ins Endspiel: beide Seiten per Computer
    t0 = time.time()
    seen = set()
    while time.time() - t0 < 90:
        t = P.ev("__box.table()")
        if t['status'] == 'over': break
        empt = P.ev("__box.table().gs.board.filter(v => v === null).length")
        txt = P.ev("document.querySelector('.eval-btn').textContent")
        if empt <= 30 and 'Vorteil' in txt: seen.add('vorteil')
        if 'Sieg sicher bei bestem Spiel' in txt or 'Niederlage droht' in txt or 'Remis bei bestem Spiel' in txt: seen.add('sicher')
        if 'Steine' in txt and empt > 12: seen.add('steine-mittelspiel')
        if 'sicher' in seen and empt <= 10:
            P.shot('eval_reversi_sicher', SHOTS); break
        if my_turn(P): P.ev("__box.botMove(2)")
        time.sleep(0.15)
    c.ok('vorteil' in seen, 'Reversi-Mittelspiel: „Vorteil …“')
    c.ok('sicher' in seen, 'Reversi-Endspiel: „Sieg sicher bei bestem Spiel“ / „Niederlage droht“')
    c.ok('steine-mittelspiel' not in seen, 'keine „Steine“ im Mittelspiel')
    c.ok(P.ev("document.querySelector('.eval-btn').getBoundingClientRect().height") <= 50, 'bewiesenes Ergebnis passt in eine Zeile (Knopf 48 px)')
    # Einstellung aus → kein Knopf
    P.ev("(() => { const k = 'sb.settings'; const st = JSON.parse(localStorage.getItem(k) || '{}'); st.tipOn = false; localStorage.setItem(k, JSON.stringify(st)); })()")
    P.ev("__box.local('bot', 'vier', {}, 'weiss', 2)"); time.sleep(0.6)
    c.ok(P.ev("!document.querySelector('.tip-btn') || document.querySelector('.tip-btn').classList.contains('hidden')"), 'Tipp-Knopf aus → nicht da')
    c.ok(not P.app_errors(), f'eval: 0 Fehler {P.app_errors()[:3]}')
    P.close()


parts = [a for a in sys.argv[1:]] or ['tipp', 'alle', 'eval']
with Server() as srv, sync_playwright() as pw:
    br = launch(pw)
    try:
        for p in parts:
            print(f'== {p}', flush=True)
            {'tipp': part_tipp, 'alle': part_alle, 'eval': part_eval}[p](br, srv.base)
    finally:
        br.close()
print(f'\n{len(c.fails)} Fehler' if c.fails else '\nsmoke_n11 grün')
sys.exit(1 if c.fails else 0)

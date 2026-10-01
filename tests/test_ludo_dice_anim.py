# Regression: Ludo-Würfel dreht sich genau EINMAL pro Wurf – nicht nochmal beim Ziehen der Figur.
# Zählt Element.animate()-Aufrufe am Würfel (.ld-die) über mehrere Würfe + Züge (Hotseat, Tempo normal).
# Aufruf: python3 tests/test_ludo_dice_anim.py
import sys, time
sys.path.insert(0, 'tests')
from util import *

c = Checker()

HOOK = """(() => {
  window.__dieAnims = [];
  const orig = Element.prototype.animate;
  Element.prototype.animate = function (...a) {
    if (this.classList && this.classList.contains('ld-die')) {
      const g = __box.table().gs;
      window.__dieAnims.push({ phase: g.phase, ply: g.ply, die: this.getAttribute('data-die') });
    }
    return orig.apply(this, a);
  };
})()"""


def wait(fn, timeout=20, what='Bedingung'):
    t0 = time.time()
    while not fn():
        if time.time() - t0 > timeout:
            raise TimeoutError(what)
        time.sleep(0.05)


with Server() as srv, sync_playwright() as pw:
    b = launch(pw)
    P = Page(b, srv.base, 'hoch').open('?nosw&alle&tempo=flott')
    P.ev(HOOK)
    P.ev("__box.local('hotseat', 'ludo', {players: 2})")
    wait(lambda: P.ev("__box.table() && __box.table().game === 'ludo'"), 10, 'Ludo zu zweit')
    rolls = moves = 0
    for _ in range(60):
        wait(lambda: P.ev("__box.legal().length > 0 && !__box.busy()"), 15, 'dran')
        g = P.ev("__box.table().gs")
        if g['phase'] == 'over': break
        n = P.ev("__box.table().nmoves")
        legal = P.ev("__box.legal()")
        if legal[0]['type'] == 'roll':
            P.tap('[data-act="roll"]'); rolls += 1
        else:
            P.tap_xy(*P.ev(f"__box.target([__box.table().gs.turn, {legal[0]['piece']}])"))
            moves += 1
        wait(lambda: P.ev("__box.table().nmoves") > n, 10, 'Zug angekommen')
        if moves >= 6: break
    time.sleep(1.2)
    anims = P.ev("window.__dieAnims")
    on_move = [a for a in anims if a['phase'] != 'move' and a['phase'] != 'roll']
    c.ok(moves >= 3, f'{rolls} Würfe, {moves} Züge gespielt')
    c.ok(len(anims) == rolls, f'Würfel-Animationen {len(anims)} = Würfe {rolls}  {anims}')
    c.ok(on_move == [], f'keine Animation in anderen Phasen {on_move}')
    errs = P.app_errors()
    c.ok(errs == [], f'0 App-Fehler {errs[:3]}')
    P.close(); b.close()

print(f'\n{"ALLES GRÜN" if not c.fails else str(len(c.fails)) + " FEHLER"}')
sys.exit(1 if c.fails else 0)

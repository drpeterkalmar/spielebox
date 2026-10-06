# Prüfungen zu den Kriegsschiffen (n8) im Browser – Aufruf über python3 tests/schiffe_n8.py check | clip
# - kein Informationsleck: Im großen Meer (Gegner) steht vor dem Versenken nichts, was die Lage eines Schiffs verrät;
#   danach genau die versenkten Schiffe, an ihrer richtigen Stelle und mit ihrem richtigen Typ
# - Treffer auf eigenen Schiffen hängen in der Schiffsgruppe (schaukeln mit)
# - Schaukeln: nur Stufe 2, nicht bei „Bewegung reduzieren“; im Leerlauf zwischen den Dünungen keine Animation;
#   eine Dünung endet von selbst; das gewählte Schiff (Aufstellen) bleibt ruhig; Tippen trifft weiter die Zelle
# - Stufe 0 = altes Aussehen (keine neuen Teile), Stufe 1 = Silhouetten ohne Bewegung; 0 Seitenfehler
import sys, os, time, json, subprocess, shutil
sys.path.insert(0, 'tests')
from util import *
from deko_rundgang import ctx_page, load_fixture, wait_js
from schiffe_n8 import open_table, OUT, big_clip, small_clip, SEED_JS

SEEK = "(t) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; } }"
BIG_INFO = """() => { const svg = document.querySelector('svg.board'); const g = svg.children[0];
  const t = __box.table(), gs = t.gs;
  const rocks = [...g.querySelectorAll('.sv-rock')].map(r => { const b = r.querySelector('.sv-ship').getBoundingClientRect();
    const m = svg.getScreenCTM(); return { x: (b.left + b.width / 2 - m.e) / m.a, y: (b.top + b.height / 2 - m.f) / m.d,
      href: r.querySelector('.sv-ship').getAttribute('href') }; });
  return { html: g.innerHTML, rocks, ships: g.querySelectorAll('.sv-ship').length, sunk: gs.sunk[0], fleet1: gs.fleets[1] }; }"""


def main():
    c = Checker()
    with sync_playwright() as pw, Server() as srv:
        b = launch(pw)
        # 1) Leck: frisch gesetzte Flotten, noch nichts versenkt → im Gegner-Meer kein Schiffsteil
        P = ctx_page(b, srv.base, 'hoch', settings={'evalOn': False})
        P.ctx.add_init_script(SEED_JS)
        P.open('?nosw&tempo=test')
        P.ev("__box.local('bot', 'schiffe', {flotte: 'gross'}, 'weiss', 1)")
        wait_js(P, "!!__box.table() && __box.view().placing()", 20)
        P.tap('[data-act="place"]')
        wait_js(P, "__box.table().gs.phase === 'shoot' && __box.legal().length > 0", 20)
        time.sleep(0.4)
        info = P.ev(BIG_INFO)
        bad = [w for w in ['sv-rock', 'sv-shd', 'sv-bow', 'sv-ship', '#sv-h-', '#sv-d-', '#sv-w-', 'dk-smoke', 'dk-glow'] if w in info['html']]
        c.ok(not bad and info['ships'] == 0, f'Leck: vor dem Versenken nichts im Gegner-Meer (Schiffe {info["ships"]}, verdächtige Teile {bad or "keine"})')
        und = P.ev("document.querySelector('svg.deko-under').innerHTML")
        c.ok(not any(w in und for w in ['sv-h-', 'sv-rock', 'sv-ship']), 'Leck: auch die Wasser-Ebene darunter enthält keine Schiffe')
        own = P.ev("document.querySelector('svg.board').children[1].querySelectorAll('.sv-rock').length")
        c.ok(own == 10, f'eigene Flotte auf der Mini-Karte: {own} Schiffe')
        errs = P.app_errors(); P.close()

        # 2) Szene mit 1 versenktem Gegner-Schiff und 3 eigenen Treffern
        for form in ['hoch', 'quer']:
            P = open_table(b, srv.base, form, 'schiffe_gross', '', tempo='test')
            time.sleep(0.8)
            info = P.ev(BIG_INFO)
            k = info['sunk'][0]
            sh = info['fleet1'][k] if info['fleet1'] else None
            fx = load_fixture('schiffe_gross')['gs']['fleets'][1][k]
            cx = 70 + (fx['c'] + (fx['len'] / 2 if fx['dir'] == 'h' else 0.5)) * 90
            cy = 66 + (fx['r'] + (fx['len'] / 2 if fx['dir'] == 'v' else 0.5)) * 90
            ok = len(info['rocks']) == 1 and abs(info['rocks'][0]['x'] - cx) < 12 and abs(info['rocks'][0]['y'] - cy) < 12
            c.ok(ok, f'{form}: genau das versenkte Schiff im Gegner-Meer, an seiner Stelle ({info["rocks"]} ↔ {cx:.0f},{cy:.0f})')
            c.ok(info['rocks'] and 'kreuzer4' in info['rocks'][0]['href'], f'{form}: versenktes Schiff hat seinen Typ (Kreuzer)')
            hits = P.ev("""() => { const g = document.querySelector('svg.board').children[1];
              const hs = [...g.querySelectorAll('.sv-hit')]; return [hs.length, hs.filter(h => h.closest('.sv-rock')).length]; }""")
            c.ok(hits[0] == 3 and hits[1] == 3, f'{form}: 3 eigene Treffer, alle in der Schiffsgruppe (schaukeln mit) {hits}')
            n0 = P.ev("document.getAnimations().length")
            P.ev("__box.view().swell()")
            time.sleep(0.15)
            n1 = P.ev("document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.sv-rock')).length")
            time.sleep(2.4)
            n2 = P.ev("document.getAnimations().length")
            c.ok(n0 == 0 and n1 >= 11 * 2 and n2 == 0, f'{form}: Dünung läuft ({n1} Animationen) und endet von selbst (vorher {n0}, danach {n2})')
            errs += P.app_errors(); P.close()

        # 3) Aufstellen: gewähltes Schiff ruhig, Tipp trifft während der Dünung die Zelle
        P = open_table(b, srv.base, 'hoch', None, '', tempo='test')
        time.sleep(0.5)
        fl = P.ev("__box.view().fleet()")
        P.ev("__box.view().swell()")
        time.sleep(0.25)
        P.tap_target(fl[0]['r'] * 10 + fl[0]['c'])
        picked = P.ev("__box.view().picked()")
        still = P.ev("""() => { const r = document.querySelector('svg.board .sv-rock.still'); return !!r && r.getAnimations().length === 0; }""")
        P.ev("__box.view().swell()")
        time.sleep(0.2)
        still2 = P.ev("""() => { const r = document.querySelector('svg.board .sv-rock.still'); return !!r && r.getAnimations().length === 0; }""")
        c.ok(picked == 0 and still and still2, f'Aufstellen: Tipp während der Dünung wählt das Schiff ({picked}), es schaukelt nicht')
        errs += P.app_errors(); P.close()

        # 4) Stufen: 0 = alt, 1 = still, reduzierte Bewegung = still
        for q, want in [('deko=0', 'alt'), ('deko=1', 'still')]:
            P = open_table(b, srv.base, 'hoch', 'schiffe_gross', q, tempo='test')
            time.sleep(0.6)
            r = P.ev("""() => ({ n8: document.querySelectorAll('.n8, .sv-rock').length, rect: document.querySelectorAll('rect.sv-ship').length })""")
            P.ev("__box.view().swell()"); time.sleep(0.2)
            anim = P.ev("document.getAnimations().length")
            if want == 'alt': c.ok(r['n8'] == 0 and r['rect'] == 10 + 1 and anim == 0, f'?deko=0: altes Aussehen (Kapseln {r["rect"]}, neue Teile {r["n8"]}, Animationen {anim})')
            else: c.ok(r['n8'] > 0 and r['rect'] == 0 and anim == 0, f'?deko=1: Kriegsschiffe ohne Bewegung (neue Teile {r["n8"]}, Animationen {anim})')
            errs += P.app_errors(); P.close()
        P = ctx_page(b, srv.base, 'hoch', load_fixture('schiffe_gross'), settings={'evalOn': False})
        P.pg.emulate_media(reduced_motion='reduce')
        P.open('?nosw&tempo=test', '#solo')
        wait_js(P, "!!__box.table() && __box.state().screen === 'table'", 20)
        time.sleep(0.5)
        P.ev("__box.view().swell()"); time.sleep(0.2)
        anim = P.ev("document.getAnimations().length")
        c.ok(anim == 0, f'„Bewegung reduzieren“: kein Schaukeln (Animationen {anim})')
        errs += P.app_errors(); P.close()
        b.close()
    c.ok(not errs, f'0 Seitenfehler {errs[:3]}')
    print('\n' + ('ALLES GRÜN' if not c.fails else f'{len(c.fails)} rot: {c.fails}'))
    return 1 if c.fails else 0


def clip():
    """Schaukelndes Meer (Aufstellen, große Flotte): eine Dünung Bild für Bild (Animationen angehalten und vorgespult),
    dann ffmpeg → tests/shots/schiffe-n8/schaukeln.mp4 (≤ 3 s)."""
    tmp = os.path.join(ROOT, 'tests', 'out', 'clip_n8')
    shutil.rmtree(tmp, ignore_errors=True); os.makedirs(tmp)
    with sync_playwright() as pw, Server() as srv:
        b = launch(pw)
        P = open_table(b, srv.base, 'quer', None, '', tempo='test')
        time.sleep(0.8)
        clipr = big_clip(P, 4)
        P.ev("__box.view().swell()")
        fps, dur = 25, 2.6
        for f in range(int(fps * dur)):
            P.ev(SEEK, f * 1000 / fps - 200)
            P.pg.screenshot(path=os.path.join(tmp, f'f{f:03d}.png'), clip=clipr)
        errs = P.app_errors()
        P.close(); b.close()
    out = os.path.join(OUT, 'schaukeln.mp4')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', os.path.join(tmp, 'f%03d.png'),
                    '-vf', 'scale=1080:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', out], check=True)
    shutil.rmtree(tmp, ignore_errors=True)
    print(out, f'{os.path.getsize(out) / 1024:.0f} KB', 'Fehler:', errs[:3] or 0)

# Schiffe versenken – echte Kriegsschiffe, die auf See schaukeln (n8, 06.10.2026): Szenen, Messung, Bilder, Prüfungen.
#   python3 tests/schiffe_n8.py fixtures                    – Szenen erspielen → tests/deko/fixtures/schiffe_{gross,klein}.json
#                                                             (Schießen, 3 Treffer auf der eigenen Flotte, 1 Gegner-Schiff versenkt)
#   python3 tests/schiffe_n8.py perf <name> [--ab=deko=1|deko=2] [--reps=2] [--nur=…] [--form=hoch,quer] [--alt=<Ordner mit altem Stand>, Variante alt:deko=2]   → tests/out/perf_<name>.json
#   python3 tests/schiffe_n8.py shots <ordner> [q]          – Bilder hoch/quer → tests/shots/schiffe-n8/<ordner>/
#   python3 tests/schiffe_n8.py vergleich <a> <b>           – Collagen vorher | nachher → tests/shots/schiffe-n8/vergleich_*.jpg
#   python3 tests/schiffe_n8.py check                       – Prüfungen (kein Leck, Schaukeln, Treffer schaukeln mit, A/B-Stufen)
#   python3 tests/schiffe_n8.py clip                        – kurzer Film vom schaukelnden Meer → tests/shots/schiffe-n8/schaukeln.mp4
import sys, os, time, json, statistics, subprocess, shutil
sys.path.insert(0, 'tests')
from util import *
from deko_rundgang import ctx_page, load_fixture, wait_js, FIX
from deko_perf import SEED_JS, FRAMES_JS, AUTO_JS, chrome_cpu, pct

OUT = os.path.join(ROOT, 'tests', 'shots', 'schiffe-n8')
MINE = "(() => { const t = __box.table(); return !!t && t.status === 'play' && __box.legal().length > 0 && !__box.busy(); })()"

# Mein Zug in der Szene: erst ein bestimmtes Gegner-Schiff versenken, dann nur noch sicheres Wasser treffen,
# bis der Computer genau 3 Treffer auf meiner Flotte hat (dann anhalten, ich bin dran)
STEP_JS = """(k) => { const t = __box.table(), g = t.gs; if (g.phase === 'place') { __box.botMove(1); return 'place'; }
  const hits = g.fleets[0].reduce((a, s) => a + s.hits, 0);
  if (g.sunk[0].length >= 1 && hits === 3) return 'fertig';
  if (hits > 3 || g.sunk[0].length > 1) return 'neu';
  const done = new Set(g.shots[0].map(x => x.i)), en = g.fleets[1];
  const cellsOf = (s) => Array.from({ length: s.len }, (_, j) => (s.r + (s.dir === 'v' ? j : 0)) * 10 + s.c + (s.dir === 'h' ? j : 0));
  if (!g.sunk[0].length) { const i = cellsOf(en[k]).find(i => !done.has(i)); __box.move({ type: 'shot', i }); return 'ziel'; }
  const near = new Set(); for (const s of en) for (const i of cellsOf(s)) for (const d of [-11, -10, -9, -1, 0, 1, 9, 10, 11]) near.add(i + d);
  const ship = new Set(en.flatMap(cellsOf));
  let free = []; for (let i = 0; i < 100; i++) if (!done.has(i) && !near.has(i)) free.push(i);
  if (!free.length) for (let i = 0; i < 100; i++) if (!done.has(i) && !ship.has(i)) free.push(i);
  __box.move({ type: 'shot', i: free[Math.floor(Math.random() * free.length)] }); return 'wasser'; }"""


def make_fixture(b, base, name, opts, k):
    P = ctx_page(b, base, 'hoch')
    P.open('?nosw')
    start = f"__box.local('bot', 'schiffe', {json.dumps(opts)}, 'weiss', 1)"
    P.ev(start)
    wait_js(P, "!!__box.table()", 15, 'Tisch')
    t0 = time.time()
    while time.time() - t0 < 120:
        if not P.ev(MINE): time.sleep(0.04); continue
        r = P.ev(STEP_JS, k)
        if r == 'fertig': break
        if r == 'neu': print('   zu viele Treffer, neu'); P.ev(start); time.sleep(0.4)
        time.sleep(0.06)
    else:
        raise TimeoutError(name)
    time.sleep(0.4)
    data = P.ev("localStorage.getItem('sb.local.bot')")
    with open(os.path.join(FIX, name + '.json'), 'w') as f: f.write(data)
    g = json.loads(data)['gs']
    print(f"  ✅ {name}: Schüsse {len(g['shots'][0])}/{len(g['shots'][1])}, versenkt {g['sunk']}, Treffer auf mir {sum(s['hits'] for s in g['fleets'][0])}")
    P.close()


def fixtures():
    with sync_playwright() as pw, Server() as srv:
        b = launch(pw)
        make_fixture(b, srv.base, 'schiffe_gross', {'flotte': 'gross'}, 1)   # ein Kreuzer versenkt
        make_fixture(b, srv.base, 'schiffe_klein', {}, 1)                    # das Schlachtschiff versenkt
        b.close()


def open_table(b, base, form, fixture, q='', tempo='normal', settings=None):
    P = ctx_page(b, base, form, load_fixture(fixture) if fixture else None, settings={'evalOn': False, **(settings or {})})
    P.ctx.add_init_script(SEED_JS)
    query = f'?nosw&tempo={tempo}' + ('&' + q if q else '')
    if fixture:
        P.open(query, '#solo')
        wait_js(P, "!!__box.table() && __box.state().screen === 'table'", 20, 'Tisch')
    else:
        P.open(query)
        P.ev("__box.local('bot', 'schiffe', {flotte: 'gross'}, 'weiss', 1)")
        wait_js(P, "!!__box.table() && __box.state().screen === 'table' && __box.view().placing()", 20, 'Aufstellen')
    return P


# ---------- Messung ----------
# name, Fixture (None = Aufstellen), Dauer s, Art (auto = Computer spielt für mich, idle = nichts tun)
SCENES = [
    ('schuss', 'schiffe_gross', 12, 'auto'),
    ('leerlauf', 'schiffe_gross', 25, 'idle'),
    ('aufstellen', None, 25, 'idle'),
]


def run_scene(b, base, form, name, fixture, dur, kind, q):
    def fresh():
        P = open_table(b, base, form, fixture, q)
        time.sleep(1.5)
        cdp = P.ctx.new_cdp_session(P.pg)
        cdp.send('Performance.enable')
        return P, cdp
    P, cdp = fresh()
    if kind == 'auto': P.ev(AUTO_JS)
    c0 = chrome_cpu(); t0 = time.time()
    time.sleep(dur)
    cpu = (chrome_cpu() - c0) / (time.time() - t0)
    if kind == 'auto':
        # Phase B wieder ab demselben Stand (sonst läuft die Partie in Phase A schon zu weit)
        P.close(); P, cdp = fresh()
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    P.ev(FRAMES_JS)
    if kind == 'auto': P.ev(AUTO_JS)
    m0 = {m['name']: m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
    t0 = time.time()
    time.sleep(dur)
    wall = time.time() - t0
    m1 = {m['name']: m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
    d = P.ev("(() => { window.__ft.on = false; return window.__ft.d; })()")
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
    nm = P.ev("__box.table() ? __box.table().nmoves : null")
    deko = P.ev("__box.deko()")
    errs = P.app_errors()
    P.close()
    busy = (m1.get('TaskDuration', 0) - m0.get('TaskDuration', 0)) / wall
    return {'frames': len(d), 'p50': round(pct(d, 50), 2), 'p95': round(pct(d, 95), 2), 'max': round(max(d) if d else 0, 1),
            'long': round(sum(1 for x in d if x > 33.4) / max(1, len(d)) * 100, 1), 'busy': round(busy * 100, 1),
            'cpu': round(cpu * 100, 1), 'nodes': m1.get('Nodes'), 'moves': nm, 'deko': deko, 'errors': errs[:3]}


def perf(name, variants, reps, only, forms=('hoch', 'quer'), root=ROOT, alt=None):
    # Variante „alt:deko=2“ = alter Stand (Ordner alt, z. B. git worktree des Commits davor), verschränkt mit dem neuen
    out = {'name': name, 'variants': variants, 'root': root, 'alt': alt, 'when': time.strftime('%Y-%m-%d %H:%M'), 'scenes': {}}
    with sync_playwright() as pw, Server(root) as srv, Server(alt or root) as srv_alt:
        b = launch(pw)
        for form in forms:
            for sc in SCENES:
                if only and sc[0] not in only: continue
                key = f'{sc[0]}_{form}'
                runs = {v: [] for v in variants}
                for r in range(reps):
                    for v in (variants if r % 2 == 0 else variants[::-1]):
                        base, qv = (srv_alt.base, v[4:]) if v.startswith('alt:') else (srv.base, v)
                        runs[v].append(run_scene(b, base, form, *sc, qv))
                out['scenes'][key] = {}
                for v in variants:
                    rs = runs[v]
                    med = {k: (statistics.median([x[k] for x in rs]) if isinstance(rs[0][k], (int, float)) and rs[0][k] is not None else rs[0][k]) for k in rs[0]}
                    med['runs'] = rs
                    out['scenes'][key][v] = med
                    print(f"  {key:16s} [{v or 'Standard':7s}] p50 {med['p50']:6.2f}  p95 {med['p95']:6.2f}  max {med['max']:6.1f}  lang {med['long']:4.1f} %  "
                          f"Last {med['busy']:5.1f} %  CPU ges. {med['cpu']:5.1f} %  Knoten {med['nodes']}  Züge {med['moves']}  {med['errors'] or ''}", flush=True)
        b.close()
    os.makedirs(os.path.join(ROOT, 'tests', 'out'), exist_ok=True)
    with open(os.path.join(ROOT, 'tests', 'out', f'perf_{name}.json'), 'w') as f: json.dump(out, f, indent=1)


# ---------- Bilder ----------
def small_clip(P, pad=10):
    """Bildausschnitt um das kleine (eigene) Meer, in CSS-Pixeln."""
    return P.ev("""(pad) => { const svg = document.querySelector('svg.board'); const g = svg.children[1]; const r = g.getBoundingClientRect();
      return { x: Math.max(0, r.left - pad), y: Math.max(0, r.top - pad), width: r.width + 2 * pad, height: r.height + 2 * pad }; }""", pad)


def big_clip(P, pad=6):
    return P.ev("""(pad) => { const svg = document.querySelector('svg.board'); const m = svg.getScreenCTM();
      const x = m.e + 63 * m.a, y = m.f + 59 * m.d, w = 914 * m.a;
      return { x: Math.max(0, x - pad), y: Math.max(0, y - pad), width: w + 2 * pad, height: w + 2 * pad }; }""", pad)


def snap(P, name, sub, clip=None):
    d = os.path.join(OUT, sub)
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, name + '.png')
    P.pg.screenshot(path=p, **({'clip': clip} if clip else {}))
    return p


def pick_and_bad(P):
    """Aufstellen: ein Schiff wählen (gelb); danach ein zweites so legen, dass es ein anderes berührt (rot)."""
    fl = P.ev("__box.view().fleet()")
    cells = lambda s: [(s['r'] + (j if s['dir'] == 'v' else 0)) * 10 + s['c'] + (j if s['dir'] == 'h' else 0) for j in range(s['len'])]
    occ = {i for s in fl for i in cells(s)}
    return fl, cells, occ


def shots(sub, q=''):
    errs = []
    with sync_playwright() as pw, Server() as srv:
        b = launch(pw)
        for form in ['hoch', 'quer']:
            # Aufstellen, große und kleine Flotte; dann „gewählt“ (gelb) und „zu nah“ (rot)
            for fl_name, opts in [('gross', "{flotte: 'gross'}"), ('klein', '{}')]:
                P = ctx_page(b, srv.base, form, settings={'evalOn': False})
                P.ctx.add_init_script(SEED_JS)
                P.open('?nosw&tempo=test' + ('&' + q if q else ''))
                P.ev(f"__box.local('bot', 'schiffe', {opts}, 'weiss', 1)")
                wait_js(P, "!!__box.table() && __box.state().screen === 'table' && __box.view().placing()", 20)
                time.sleep(0.6)
                snap(P, f'aufstellen_{fl_name}_{form}', sub)
                if fl_name == 'gross':
                    fl, cells, occ = pick_and_bad(P)
                    P.tap_target(cells(fl[0])[0])
                    time.sleep(0.4)
                    snap(P, f'aufstellen_gewaehlt_{form}', sub)
                    # das gewählte Schiff neben ein anderes legen → beide rot
                    other = fl[3]
                    tgt = None
                    for i in range(100):
                        sh = {**fl[0], 'r': i // 10, 'c': i % 10}
                        if (sh['c'] + (sh['len'] if sh['dir'] == 'h' else 1)) > 10 or (sh['r'] + (sh['len'] if sh['dir'] == 'v' else 1)) > 10: continue
                        cs = set(cells(sh))
                        if cs & (occ - set(cells(fl[0]))): continue
                        if any(abs(a // 10 - c // 10) <= 1 and abs(a % 10 - c % 10) <= 1 for a in cs for c in cells(other)):
                            tgt = i; break
                    if tgt is not None:
                        P.tap_target(tgt)
                        time.sleep(0.4)
                        snap(P, f'aufstellen_zunah_{form}', sub)
                errs += P.app_errors(); P.close()
            # Schießen (große und kleine Flotte), Ausschnitte: eigene Treffer (Mini-Karte), Wrack (großes Meer)
            for fx in ['schiffe_gross', 'schiffe_klein']:
                P = open_table(b, srv.base, form, fx, q, tempo='test')
                time.sleep(1.0)
                tag = fx.split('_')[1]
                snap(P, f'schiessen_{tag}_{form}', sub)
                snap(P, f'treffer_{tag}_{form}', sub, small_clip(P))
                snap(P, f'wrack_{tag}_{form}', sub, big_clip(P))
                errs += P.app_errors(); P.close()
            print(f'  📷 {form}', flush=True)
        # Schaukeln: Dünung auslösen, angehalten bei Ruhe, Ausschlag und Gegen-Ausschlag (a/b/c); dazu Treffer im Ausschlag
        SEEK = "(t) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; } }"
        for form in ['hoch', 'quer']:
            for fx, tag, clipf in [(None, '', big_clip), ('schiffe_gross', 'mini_', small_clip)]:
                P = open_table(b, srv.base, form, fx, q, tempo='test')
                time.sleep(0.8)
                cl = clipf(P)
                P.ev("__box.view().swell()")
                for k, t in [('a', -100), ('b', 520), ('c', 900)]:
                    P.ev(SEEK, t); time.sleep(0.15)
                    snap(P, f'schaukeln_{tag}{form}_{k}', sub, cl)
                errs += P.app_errors(); P.close()
        b.close()
    print('Fehler:', errs[:5] if errs else 0)
    return errs


def font(size):
    from PIL import ImageFont
    for fp in ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf']:
        try: return ImageFont.truetype(fp, size)
        except Exception: pass
    return ImageFont.load_default()


def vergleich(a, b_):
    from PIL import Image, ImageDraw
    f = font(30)
    for form in ['hoch', 'quer']:
        names = [f'aufstellen_gross_{form}', f'schiessen_gross_{form}', f'schiessen_klein_{form}']
        rows = []
        for n in names:
            pa, pb = os.path.join(OUT, a, n + '.png'), os.path.join(OUT, b_, n + '.png')
            if os.path.exists(pa) and os.path.exists(pb): rows.append((Image.open(pa).convert('RGB'), Image.open(pb).convert('RGB')))
        k = 0.42 if form == 'hoch' else 0.36
        rows = [tuple(im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS) for im in r) for r in rows]
        pad, head = 14, 48
        if form == 'hoch':
            # nebeneinander: je Szene ein Paar vorher | nachher
            w = rows[0][0].width; h = rows[0][0].height
            W = len(rows) * (2 * w + pad) + (len(rows) + 1) * pad; H = h + head + pad
            im = Image.new('RGB', (W, H), (24, 24, 24)); d = ImageDraw.Draw(im)
            x = pad
            for ra, rb in rows:
                d.text((x, 8), 'vorher', fill=(220, 220, 220), font=f); im.paste(ra, (x, head))
                d.text((x + w + pad, 8), 'nachher', fill=(255, 214, 120), font=f); im.paste(rb, (x + w + pad, head))
                x += 2 * w + 2 * pad
        else:
            w = rows[0][0].width; h = rows[0][0].height
            W = 2 * w + 3 * pad; H = len(rows) * (h + pad) + head + pad
            im = Image.new('RGB', (W, H), (24, 24, 24)); d = ImageDraw.Draw(im)
            d.text((pad, 8), 'vorher', fill=(220, 220, 220), font=f); d.text((2 * pad + w, 8), 'nachher', fill=(255, 214, 120), font=f)
            y = head
            for ra, rb in rows:
                im.paste(ra, (pad, y)); im.paste(rb, (2 * pad + w, y)); y += h + pad
        p = os.path.join(OUT, f'vergleich_{form}.jpg')
        im.save(p, quality=82, optimize=True)
        print(p, im.size)


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'check'
    rest = [a for a in sys.argv[2:] if not a.startswith('--')]
    flags = dict(a[2:].split('=', 1) for a in sys.argv[2:] if a.startswith('--') and '=' in a)
    if cmd == 'fixtures': fixtures()
    elif cmd == 'perf':
        perf(rest[0] if rest else 'schiffe', flags.get('ab', '').split('|') if 'ab' in flags else [''], int(flags.get('reps', 2)),
             flags['nur'].split(',') if 'nur' in flags else None, flags['form'].split(',') if 'form' in flags else ('hoch', 'quer'), flags.get('root', ROOT), flags.get('alt'))
    elif cmd == 'shots': sys.exit(1 if shots(rest[0] if rest else 'nachher', rest[1] if len(rest) > 1 else '') else 0)
    elif cmd == 'vergleich': vergleich(rest[0], rest[1])
    elif cmd == 'check':
        from schiffe_n8_check import main as check_main
        sys.exit(check_main())
    elif cmd == 'clip':
        from schiffe_n8_check import clip
        clip()

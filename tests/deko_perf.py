# Leistung messen (Verschönerung, 05.10.2026): Pixel 7 hoch, CPU 4× gedrosselt (CDP Emulation.setCPUThrottlingRate),
# je Szene ≥ 10 s: Frame-Zeit p50/p95/max (requestAnimationFrame-Abstände), Anteil langer Frames (> 33 ms) und
# Hauptthread-Last (CDP Performance.getMetrics: TaskDuration je Sekunde = „wie warm wird das Handy“). Dazu die Ladegröße.
#   python3 tests/deko_perf.py <name> [q] [--reps=2] [--nur=lobby_idle,ludo_anim]   → tests/out/perf_<name>.json
#   q z. B. "deko=0" (altes Aussehen)
# Die Szenen starten aus den Fixtures von deko_rundgang.py; Math.random und crypto.getRandomValues sind fest gesät,
# damit vorher/nachher möglichst dieselben Züge laufen (Bot-Suchtiefe hängt trotzdem etwas an der CPU-Zeit).
import sys, os, time, json, gzip, statistics
sys.path.insert(0, 'tests')
from util import *
from deko_rundgang import ctx_page, load_fixture, wait_js

SEED_JS = """(() => { let a = 0x5eed1234 >>> 0; const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = r; const g = crypto.getRandomValues.bind(crypto);
  crypto.getRandomValues = (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(r() * 256); return arr; }; })();"""

FRAMES_JS = """(() => { const f = window.__ft = { d: [], last: 0, on: true };
  const loop = (ts) => { if (f.last) f.d.push(ts - f.last); f.last = ts; if (f.on) requestAnimationFrame(loop); };
  requestAnimationFrame(loop); })()"""

# eigener Platz spielt automatisch (Hold'em: mitgehen/checken, damit die Hand weiterläuft)
AUTO_JS = """(() => { window.__auto = setInterval(() => { try {
  const t = __box.table(); if (!t) return;
  if (t.status === 'over') { return; }
  const l = __box.legal(); if (!l.length || __box.busy()) return;
  if (t.game === 'holdem') { const m = l.find(x => x.type === 'check') || l.find(x => x.type === 'call') || l[0]; __box.move(m); }
  else __box.botMove(1); } catch (e) {} }, 150); })()"""

SCENES = [
    # name, fixture, dauer s, Aufbau
    ('lobby_idle', None, 10, 'lobby'),
    ('tisch_idle', 'muehle', 10, 'idle'),
    ('dame_anim', 'dame', 12, 'auto'),
    ('ludo_anim', 'ludo', 12, 'auto'),
    ('holdem_anim', 'holdem', 12, 'auto'),
    ('vier_sieg', 'vier_sieg', 6, 'win'),
]


def chrome_cpu():
    """CPU-Zeit (s) aller Prozesse des Test-Chromiums (Browser, GPU/SwiftShader, Renderer) – misst auch das Rastern."""
    tot = 0
    hz = os.sysconf('SC_CLK_TCK')
    for pid in os.listdir('/proc'):
        if not pid.isdigit(): continue
        try:
            cmd = open(f'/proc/{pid}/cmdline', 'rb').read()
            if b'ms-playwright' not in cmd: continue
            f = open(f'/proc/{pid}/stat').read().rsplit(')', 1)[1].split()
            tot += (int(f[11]) + int(f[12])) / hz
        except Exception:
            continue
    return tot


def pct(xs, p):
    if not xs: return 0
    xs = sorted(xs)
    k = min(len(xs) - 1, max(0, int(round(p / 100 * (len(xs) - 1)))))
    return xs[k]


WIN_JS = """async () => { const E = await import('./src/games/vier/engine.js'); const t = __box.table();
  for (const m of __box.legal()) if (E.applyMove(t.gs, m).win) { __box.move(m); return; } }"""


def open_scene(b, base, fixture, kind, q):
    P = ctx_page(b, base, 'hoch', load_fixture(fixture) if fixture else None, settings={'evalOn': False})
    P.ctx.add_init_script(SEED_JS)
    query = '?nosw&tempo=normal' + ('&' + q if q else '')
    if kind == 'lobby': P.open(query)
    else:
        P.open(query, '#solo')
        wait_js(P, "!!__box.table() && __box.state().screen === 'table'", 20)
    time.sleep(1.5)
    cdp = P.ctx.new_cdp_session(P.pg)
    cdp.send('Performance.enable')
    return P, cdp


def run_scene(b, base, name, fixture, dur, kind, q):
    P, cdp = open_scene(b, base, fixture, kind, q)
    if kind == 'auto': P.ev(AUTO_JS)
    if kind == 'win': P.ev(WIN_JS)
    # Phase A (ungedrosselt): CPU aller Chromium-Prozesse (Hauptthread, Rastern, GPU) – ohne Messschleife;
    # die CDP-Drosselung selbst kostet Rechenzeit und gehört nicht in diese Zahl
    c0 = chrome_cpu(); t0 = time.time()
    time.sleep(dur)
    cpu = (chrome_cpu() - c0) / (time.time() - t0)
    if kind == 'win':
        # Sieg läuft nur einmal: für Phase B frisch laden und nochmal gewinnen
        P.close()
        P, cdp = open_scene(b, base, fixture, kind, q)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    P.ev(FRAMES_JS)
    if kind == 'win': P.ev(WIN_JS)
    # Phase B (4× gedrosselt): Frame-Zeiten (rAF) und Hauptthread-Last (Performance.getMetrics)
    m0 = {m['name']: m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
    t0 = time.time()
    time.sleep(dur)
    wall = time.time() - t0
    m1 = {m['name']: m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
    d = P.ev("(() => { window.__ft.on = false; return window.__ft.d; })()")
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
    nm = P.ev("__box.table() ? __box.table().nmoves : null")
    errs = P.app_errors()
    P.close()
    busy = {k: (m1.get(k, 0) - m0.get(k, 0)) / wall for k in ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration']}
    return {
        'frames': len(d), 'p50': round(pct(d, 50), 2), 'p95': round(pct(d, 95), 2), 'p99': round(pct(d, 99), 2), 'max': round(max(d) if d else 0, 1),
        'long': round(sum(1 for x in d if x > 33.4) / max(1, len(d)) * 100, 1), 'fps': round(len(d) / wall, 1),
        'busy': round(busy['TaskDuration'] * 100, 1), 'cpu': round(cpu * 100, 1), 'script': round(busy['ScriptDuration'] * 100, 1),
        'layout': round(busy['LayoutDuration'] * 100, 1), 'style': round(busy['RecalcStyleDuration'] * 100, 1),
        'nodes': m1.get('Nodes'), 'heapMB': round(m1.get('JSHeapUsedSize', 0) / 1e6, 1), 'moves': nm, 'errors': errs[:3]
    }


def load_size(b, base, q):
    # Ladegröße: alle Dateien der Vorab-Liste (sw.js) roh/gzip + was die Lobby beim ersten Öffnen wirklich lädt
    sw = open(os.path.join(ROOT, 'sw.js')).read()
    files = [l.strip().strip("',") for l in sw.split('const ASSETS = [')[1].split('];')[0].split('\n') if l.strip().startswith("'")]
    files = [f for f in files if f != './']
    raw = gz = 0
    for f in files:
        data = open(os.path.join(ROOT, f), 'rb').read()
        raw += len(data); gz += len(gzip.compress(data, 9))
    P = Page(b, base, 'hoch')
    got = []
    P.pg.on('response', lambda r: got.append(r))
    P.open('?nosw' + ('&' + q if q else ''))
    time.sleep(1.5)
    lraw = lgz = 0
    got = [r for r in got if r.url.startswith('http')]   # Blob-/Data-URLs (vorgezeichnete Texturen) sind kein Netz
    for r in got:
        try: body = r.body()
        except Exception: continue
        lraw += len(body); lgz += len(gzip.compress(body, 9))
    P.close()
    return {'precache_files': len(files), 'precache_raw_kb': round(raw / 1024, 1), 'precache_gzip_kb': round(gz / 1024, 1),
            'lobby_requests': len(got), 'lobby_raw_kb': round(lraw / 1024, 1), 'lobby_gzip_kb': round(lgz / 1024, 1)}


if __name__ == '__main__':
    # Aufruf: deko_perf.py <name> [q] [--reps=N] [--nur=…] [--ab=deko=0|deko=2]  (A/B: Varianten abwechselnd je Szene,
    # damit Takt- und Wärme-Schwankungen des Messrechners beide gleich treffen)
    name = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'messung'
    q = ''
    reps = 2
    only = None
    variants = None
    for a in sys.argv[2:]:
        if a.startswith('--reps='): reps = int(a.split('=')[1])
        elif a.startswith('--nur='): only = a.split('=', 1)[1].split(',')
        elif a.startswith('--ab='): variants = a.split('=', 1)[1].split('|')
        else: q = a
    variants = variants or [q]
    out = {'name': name, 'variants': variants, 'when': time.strftime('%Y-%m-%d %H:%M'), 'gpu': 'vulkan' if os.environ.get('SB_VULKAN') else 'swiftshader', 'size': {}, 'scenes': {}}
    with sync_playwright() as pw, Server() as srv:
        b = launch(pw)
        for v in variants:
            out['size'][v] = load_size(b, srv.base, v)
            print(f'Ladegröße [{v or "Standard"}]', out['size'][v], flush=True)
        for sc in SCENES:
            if only and sc[0] not in only: continue
            runs = {v: [] for v in variants}
            for r in range(reps):
                for v in (variants if r % 2 == 0 else variants[::-1]):
                    runs[v].append(run_scene(b, srv.base, *sc, v))
            out['scenes'][sc[0]] = {}
            for v in variants:
                rs = runs[v]
                med = {k: (statistics.median([x[k] for x in rs]) if isinstance(rs[0][k], (int, float)) and rs[0][k] is not None else rs[0][k]) for k in rs[0]}
                med['runs'] = rs
                out['scenes'][sc[0]][v] = med
                print(f"  {sc[0]:12s} [{v or 'Standard':7s}] p50 {med['p50']:6.2f} ms  p95 {med['p95']:6.2f} ms  max {med['max']:6.1f}  lang {med['long']:4.1f} %  "
                      f"Last {med['busy']:5.1f} %  CPU ges. {med['cpu']:5.1f} % (Skript {med['script']:4.1f}, Layout {med['layout']:4.1f}, Stil {med['style']:4.1f})  Züge {med['moves']}  {med['errors'] or ''}", flush=True)
        b.close()
    os.makedirs(os.path.join(ROOT, 'tests', 'out'), exist_ok=True)
    with open(os.path.join(ROOT, 'tests', 'out', f'perf_{name}.json'), 'w') as f: json.dump(out, f, indent=1)

# Leistung messen (Verschönerung, 05.10.2026): Pixel 7 hoch, CPU 4× gedrosselt (CDP Emulation.setCPUThrottlingRate),
# je Szene ≥ 10 s: Frame-Zeit p50/p95/max (requestAnimationFrame-Abstände), Anteil langer Frames (> 33 ms) und
# Hauptthread-Last (CDP Performance.getMetrics: TaskDuration je Sekunde = „wie warm wird das Handy“). Dazu die Ladegröße.
#   python3 tests/deko_perf.py <name> [q] [--reps=2] [--nur=lobby_idle,ludo_anim]   → tests/out/perf_<name>.json
#   q z. B. "deko=0" (altes Aussehen)
# Technik n9 (Profil Mittelklasse = CPU 4× gedrosselt, hoch + quer):
#   python3 tests/deko_perf.py n9_vorher --form=hoch,quer --nur=lobby_idle,schnapsen_anim,halma_anim,vier_sieg --erster-tisch --trace
#   --form=hoch,quer   Szenen in beiden Lagen (Schlüssel „szene“ bzw. „szene@quer“)
#   --erster-tisch     Zeit bis zum ersten Tisch (Schnapsen, Karten sichtbar): kalt (leerer Cache) und warm (Service-Worker)
#   --trace            je ein CDP-Trace (devtools.timeline) für Konfetti-Finale und Lobby: Layout/Stil/Paint-Ereignisse
#                      und Animationen, die nicht auf dem Compositor laufen (compositeFailed) → out['trace'], roh in
#                      tests/out/trace_<name>_<szene>.json.gz
# Die Szenen starten aus den Fixtures von deko_rundgang.py; Math.random und crypto.getRandomValues sind fest gesät,
# damit vorher/nachher möglichst dieselben Züge laufen (Bot-Suchtiefe hängt trotzdem etwas an der CPU-Zeit).
import sys, os, time, json, gzip, statistics, subprocess
sys.path.insert(0, 'tests')
from util import *
from deko_rundgang import ctx_page, load_fixture, wait_js

SEED_JS = """(() => { let a = 0x5eed1234 >>> 0; const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = r; const g = crypto.getRandomValues.bind(crypto);
  crypto.getRandomValues = (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(r() * 256); return arr; }; })();"""

# Bildabstände (rAF) und Bildkosten: Zeit vom Start des Mess-Callbacks bis nach dem Rendern dieses Bildes (Nachricht,
# die im Callback abgeschickt wird, läuft erst nach Stil/Layout/Malen) = Hauptthread-Arbeit je Bild. Die Messschleife
# startet vor dem Effekt, ihr Callback läuft deshalb als erster im Bild. Die Bildkosten hängen nicht vom Bildtakt ab –
# wichtig am Mac mit gesperrtem Bildschirm: dann drosselt macOS die Zeitgeber, rAF kommt nur noch alle 70–150 ms.
FRAMES_JS = """(() => { const f = window.__ft = { d: [], c: [], last: 0, t0: 0, on: true };
  const ch = new MessageChannel(); ch.port1.onmessage = () => { f.c.push(performance.now() - f.t0); };
  const loop = (ts) => { if (f.last) f.d.push(ts - f.last); f.last = ts; f.t0 = performance.now(); ch.port2.postMessage(0);
    if (f.on) requestAnimationFrame(loop); };
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
    ('vier_sieg', 'vier_sieg', 6, 'win'),          # Konfetti-Finale (Sieg: Konfetti, Kanonen, Sterne)
    # n9: Kartentisch (Atlas) und großes Brett mit vielen Steinen
    ('schnapsen_anim', 'schnapsen', 12, 'auto'),
    ('halma_anim', 'halma', 12, 'auto'),
]


def chrome_cpu():
    """CPU-Zeit (s) aller Prozesse des Test-Chromiums (Browser, GPU/SwiftShader, Renderer) – misst auch das Rastern."""
    tot = 0
    if not os.path.isdir('/proc'):
        # macOS: kein /proc → ps (Spalte time = verbrauchte CPU-Zeit, [[H:]M:]S.ss)
        out = subprocess.run(['ps', '-Ao', 'time=,command='], capture_output=True, text=True).stdout
        for line in out.splitlines():
            if 'ms-playwright' not in line: continue
            t = line.split(None, 1)[0]
            try: tot += sum(float(p) * 60 ** i for i, p in enumerate(reversed(t.split(':'))))
            except ValueError: continue
        return tot
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


def open_scene(b, base, fixture, kind, q, form='hoch'):
    P = ctx_page(b, base, form, load_fixture(fixture) if fixture else None, settings={'evalOn': False})
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


def run_scene(b, base, name, fixture, dur, kind, q, form='hoch'):
    P, cdp = open_scene(b, base, fixture, kind, q, form)
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
        P, cdp = open_scene(b, base, fixture, kind, q, form)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    P.ev(FRAMES_JS)
    if kind == 'win': P.ev(WIN_JS)
    # Phase B (4× gedrosselt): Frame-Zeiten (rAF) und Hauptthread-Last (Performance.getMetrics)
    m0 = {m['name']: m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
    t0 = time.time()
    time.sleep(dur)
    wall = time.time() - t0
    m1 = {m['name']: m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
    d, c = P.ev("(() => { window.__ft.on = false; return [window.__ft.d, window.__ft.c]; })()")
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
    nm = P.ev("__box.table() ? __box.table().nmoves : null")
    errs = P.app_errors()
    P.close()
    busy = {k: (m1.get(k, 0) - m0.get(k, 0)) / wall for k in ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration']}
    return {
        'frames': len(d), 'p50': round(pct(d, 50), 2), 'p95': round(pct(d, 95), 2), 'p99': round(pct(d, 99), 2), 'max': round(max(d) if d else 0, 1),
        'long': round(sum(1 for x in d if x > 33.4) / max(1, len(d)) * 100, 1), 'fps': round(len(d) / wall, 1),
        'cost50': round(pct(c, 50), 2), 'cost95': round(pct(c, 95), 2), 'cost_max': round(max(c) if c else 0, 1),
        'cost_ms_s': round(sum(c) / wall, 1),
        'busy': round(busy['TaskDuration'] * 100, 1), 'cpu': round(cpu * 100, 1), 'script': round(busy['ScriptDuration'] * 100, 1),
        'layout': round(busy['LayoutDuration'] * 100, 1), 'style': round(busy['RecalcStyleDuration'] * 100, 1),
        'nodes': m1.get('Nodes'), 'heapMB': round(m1.get('JSHeapUsedSize', 0) / 1e6, 1), 'moves': nm, 'errors': errs[:3]
    }


def sw_list(sw, const):
    """Einträge einer Liste const NAME = [ … ] aus sw.js"""
    if f'const {const} = [' not in sw: return []
    return [l.strip().strip("',") for l in sw.split(f'const {const} = [')[1].split('];')[0].split('\n') if l.strip().startswith("'")]


def load_size(b, base, q):
    # Ladegröße: alle Dateien der Vorab-Liste (sw.js) roh/gzip + was die Lobby beim ersten Öffnen wirklich lädt
    # (seit dem Umbau zwei Listen: CORE_FILES und PRE = Bilder; vorher eine Liste ASSETS)
    sw = open(os.path.join(ROOT, 'sw.js')).read()
    files = sw_list(sw, 'CORE_FILES') + sw_list(sw, 'PRE') or sw_list(sw, 'ASSETS')
    files = [f for f in files if f != './']
    pre = [f for f in files if f.startswith('assets/')]
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
    return {'precache_files': len(files), 'precache_images': len(pre), 'precache_raw_kb': round(raw / 1024, 1), 'precache_gzip_kb': round(gz / 1024, 1),
            'lobby_requests': len(got), 'lobby_raw_kb': round(lraw / 1024, 1), 'lobby_gzip_kb': round(lgz / 1024, 1)}


# ---------- n9: Zeit bis zum ersten Tisch (kalt/warm) ----------
# Gemessen ab Navigationsstart: Tisch-Bildschirm steht und alle Bilder unter assets/, die bis dahin angefragt wurden,
# sind da (Karten/Atlas, Holz). Kalt = frischer Kontext ohne Cache; warm = Service-Worker registriert, Caches gefüllt,
# dann neu geladen (die App registriert ihn nur unter https – hier von Hand, wie test_sw.py).
FIRST_TABLE_JS = """async () => {
  const t0 = performance.timeOrigin;
  while (!(window.__box && __box.table && __box.table() && __box.state().screen === 'table')) await new Promise((r) => setTimeout(r, 10));
  const tTable = performance.now();
  await new Promise((r) => setTimeout(r, 400));   // Bilder, die der Tisch gleich anfragt
  const all = performance.getEntriesByType('resource');
  const res = all.filter((e) => /assets\\//.test(e.name));
  const imgs = await Promise.all([...document.querySelectorAll('svg.board image, svg.deko-layer image')].map((im) => {
    const href = im.getAttribute('href') || '';
    if (!href || href.startsWith('blob:') || href.startsWith('data:')) return 0;
    const i = new Image(); i.src = href; return i.decode().then(() => performance.now(), () => performance.now());
  }));
  const tImg = Math.max(0, ...res.map((e) => e.responseEnd), ...imgs);
  return { table_ms: Math.round(tTable), images_ms: Math.round(tImg), first_table_ms: Math.round(Math.max(tTable, tImg)),
           all_requests: all.length, requests: res.length, kb: Math.round(res.reduce((n, e) => n + (e.transferSize || e.encodedBodySize || 0), 0) / 1024),
           atlas: res.filter((e) => /cards\\/atlas\\//.test(e.name)).length, singles: res.filter((e) => /cards\\/(de|fr)\\//.test(e.name)).length };
}"""


def first_table(b, base, q, form='hoch', fixture='schnapsen'):
    out = {}
    query = '?tempo=normal' + ('&' + q if q else '')
    # kalt: ohne Service-Worker, leerer Kontext
    P = ctx_page(b, base, form, load_fixture(fixture), settings={'evalOn': False})
    cdp = P.ctx.new_cdp_session(P.pg)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    P.pg.goto(base + 'index.html' + query + '&nosw#solo')
    out['kalt'] = P.pg.evaluate(FIRST_TABLE_JS)
    # warm: Service-Worker von Hand registrieren, warten bis er steuert und die Caches voll sind, neu laden
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
    P.pg.evaluate("navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => true)")
    P.pg.reload()
    P.pg.wait_for_function('!!navigator.serviceWorker.controller', timeout=60000)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    P.pg.goto(base + 'index.html' + query + '#solo')
    out['warm'] = P.pg.evaluate(FIRST_TABLE_JS)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
    P.pg.evaluate("navigator.serviceWorker.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister())))")
    P.close()
    return out


# ---------- n9: CDP-Trace (Layout/Paint während Effekten, nicht beschleunigte Animationen) ----------
TRACE_CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.animations', 'cc', 'benchmark']


def trace_summary(events):
    """Zählt Layout/Stil/Paint im Hauptthread und sammelt Animationen, die nicht auf dem Compositor laufen."""
    sums = {}
    layout_stacks = {}
    failed = {}
    for e in events:
        n, ph = e.get('name'), e.get('ph')
        if n in ('Layout', 'UpdateLayoutTree', 'Paint', 'PrePaint', 'Layerize', 'RasterTask', 'CompositeLayers') and ph == 'X':
            s = sums.setdefault(n, {'count': 0, 'ms': 0.0, 'max_ms': 0.0})
            d = e.get('dur', 0) / 1000
            s['count'] += 1; s['ms'] += d; s['max_ms'] = max(s['max_ms'], d)
            if n == 'Layout':
                st = ((e.get('args') or {}).get('beginData') or {}).get('stackTrace') or []
                key = ' < '.join(f"{f.get('functionName') or '?'}@{(f.get('url') or '').rsplit('/', 1)[-1]}:{f.get('lineNumber')}" for f in st[:3]) or '(ohne Skript: Stil/Animation)'
                layout_stacks[key] = layout_stacks.get(key, 0) + 1
        if n == 'Animation':
            data = (e.get('args') or {}).get('data') or {}
            if data.get('compositeFailed') or data.get('unsupportedProperties'):
                key = f"{data.get('name') or data.get('id') or '?'}: {','.join(data.get('unsupportedProperties') or [])} (Code {data.get('compositeFailed')})"
                failed[key] = failed.get(key, 0) + 1
    for s in sums.values(): s['ms'] = round(s['ms'], 1); s['max_ms'] = round(s['max_ms'], 2)
    return {'main': sums, 'layout_sources': dict(sorted(layout_stacks.items(), key=lambda kv: -kv[1])[:12]),
            'not_composited': dict(sorted(failed.items(), key=lambda kv: -kv[1])[:20])}


def trace_scene(b, base, name, scene, q, form='hoch'):
    sc = next(s for s in SCENES if s[0] == scene)
    _, fixture, dur, kind = sc
    P, cdp = open_scene(b, base, fixture, kind, q, form)
    if kind == 'lobby':
        # Kachel-Einblendung erneut auslösen: Lobby neu laden mit frischem Speicher (tile-in läuft beim ersten Öffnen)
        P.pg.evaluate("sessionStorage.clear()")
    b.start_tracing(page=P.pg, categories=TRACE_CATS)
    if kind == 'lobby': P.pg.reload(); P.pg.wait_for_function("window.__box && window.__box.ready", timeout=60000)
    if kind == 'auto': P.ev(AUTO_JS)
    if kind == 'win': P.ev(WIN_JS)
    time.sleep(min(dur, 6))
    raw = b.stop_tracing()
    P.close()
    os.makedirs(os.path.join(ROOT, 'tests', 'out'), exist_ok=True)
    with open(os.path.join(ROOT, 'tests', 'out', f'trace_{name}_{scene}{"" if form == "hoch" else "@" + form}.json.gz'), 'wb') as f: f.write(gzip.compress(raw))
    data = json.loads(raw)
    return trace_summary(data['traceEvents'] if isinstance(data, dict) else data)


if __name__ == '__main__':
    # Aufruf: deko_perf.py <name> [q] [--reps=N] [--nur=…] [--ab=deko=0|deko=2]  (A/B: Varianten abwechselnd je Szene,
    # damit Takt- und Wärme-Schwankungen des Messrechners beide gleich treffen)
    name = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'messung'
    q = ''
    reps = 2
    only = None
    variants = None
    forms = ['hoch']
    want_first = want_trace = False
    for a in sys.argv[2:]:
        if a.startswith('--reps='): reps = int(a.split('=')[1])
        elif a.startswith('--nur='): only = a.split('=', 1)[1].split(',')
        elif a.startswith('--ab='): variants = a.split('=', 1)[1].split('|')
        elif a.startswith('--form='): forms = a.split('=', 1)[1].split(',')
        elif a == '--erster-tisch': want_first = True
        elif a == '--trace': want_trace = True
        else: q = a
    variants = variants or [q]
    out = {'name': name, 'variants': variants, 'forms': forms, 'profile': 'Mittelklasse: CPU 4× gedrosselt (Phase B), Pixel 7',
           'when': time.strftime('%Y-%m-%d %H:%M'), 'gpu': 'metal' if sys.platform == 'darwin' else 'vulkan' if os.environ.get('SB_VULKAN') else 'swiftshader',
           'size': {}, 'scenes': {}, 'first_table': {}, 'trace': {}}
    with sync_playwright() as pw, Server() as srv:
        b = launch(pw)
        for v in variants:
            out['size'][v] = load_size(b, srv.base, v)
            print(f'Ladegröße [{v or "Standard"}]', out['size'][v], flush=True)
        if want_first:
            for v in variants:
                for form in forms:
                    key = v + ('' if form == 'hoch' else '@' + form)
                    out['first_table'][key] = first_table(b, srv.base, v, form)
                    print(f'Erster Tisch [{v or "Standard"} {form}]', out['first_table'][key], flush=True)
        for form in forms:
          for sc in SCENES:
            if only and sc[0] not in only: continue
            key = sc[0] + ('' if form == 'hoch' else '@' + form)
            runs = {v: [] for v in variants}
            for r in range(reps):
                for v in (variants if r % 2 == 0 else variants[::-1]):
                    runs[v].append(run_scene(b, srv.base, *sc, v, form))
            out['scenes'][key] = {}
            for v in variants:
                rs = runs[v]
                med = {k: (statistics.median([x[k] for x in rs]) if isinstance(rs[0][k], (int, float)) and rs[0][k] is not None else rs[0][k]) for k in rs[0]}
                med['runs'] = rs
                out['scenes'][key][v] = med
                print(f"  {key:12s} [{v or 'Standard':7s}] Bildkosten p50 {med['cost50']:5.2f} p95 {med['cost95']:5.2f} max {med['cost_max']:5.1f} ms  Abstand p50 {med['p50']:6.2f} ms  p95 {med['p95']:6.2f} ms  max {med['max']:6.1f}  lang {med['long']:4.1f} %  "
                      f"Last {med['busy']:5.1f} %  CPU ges. {med['cpu']:5.1f} % (Skript {med['script']:4.1f}, Layout {med['layout']:4.1f}, Stil {med['style']:4.1f})  Züge {med['moves']}  {med['errors'] or ''}", flush=True)
        if want_trace:
            for v in variants:
                for scene in ('vier_sieg', 'lobby_idle'):
                    key = f'{scene}[{v or "Standard"}]'
                    out['trace'][key] = trace_scene(b, srv.base, name, scene, v)
                    tr = out['trace'][key]
                    print(f"Trace {key}: " + ', '.join(f"{k} {s['count']}× {s['ms']} ms" for k, s in tr['main'].items()), flush=True)
                    for k, c in tr['not_composited'].items(): print(f'    nicht auf dem Compositor: {k} ({c}×)', flush=True)
        b.close()
    os.makedirs(os.path.join(ROOT, 'tests', 'out'), exist_ok=True)
    with open(os.path.join(ROOT, 'tests', 'out', f'perf_{name}.json'), 'w') as f: json.dump(out, f, indent=1)

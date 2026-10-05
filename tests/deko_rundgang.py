# Deko-Rundgang (Verschönerung, 05.10.2026): feste Spielszenen als Fixtures, Screenshots hoch/quer, Collagen.
#   python3 tests/deko_rundgang.py fixtures            – Szenen einmal erspielen → tests/deko/fixtures/*.json
#   python3 tests/deko_rundgang.py shots <ordner> [q]  – alle Szenen fotografieren (q z. B. "deko=0"), → tests/shots/deko/<ordner>/
#   python3 tests/deko_rundgang.py vergleich <a> <b>   – Collagen a | b je Szene → tests/shots/deko/vergleich_*.jpg
#   … shots <ordner> [q] --nur=lobby,vier_sieg         – nur einzelne Szenen
# Die Szenen laden einen gespeicherten Solo-Tisch (localStorage sb.local.bot) und öffnen #solo – so sehen vorher und
# nachher exakt gleich aus. Sieg-Szenen machen danach den letzten (gewinnenden) Zug live und fotografieren eine Serie.
import sys, os, time, json
sys.path.insert(0, 'tests')
from util import *

FIX = os.path.join(ROOT, 'tests', 'deko', 'fixtures')
SHOTS = os.path.join(ROOT, 'tests', 'shots', 'deko')
PID = 'dekotest00000a'
PROFILE = {'pid': PID, 'name': 'Peter', 'secret': 'd' * 32}

# name, Spiel, Optionen, Stufe, Halt-Bedingung (JS über t = __box.table(), mine = ich bin dran)
SCENES = [
    ('muehle', 'muehle', {}, 1, "t.nmoves >= 24"),
    ('dame', 'dame', {}, 1, "t.nmoves >= 12"),
    ('schach', 'schach', {}, 1, "t.nmoves >= 14"),
    ('schnapsen', 'schnapsen', {}, 1, "t.nmoves >= 4 && t.gs.trick.length === 1"),
    ('backgammon', 'backgammon', {}, 1, "t.nmoves >= 10 && t.gs.phase === 'move'"),
    ('blackjack', 'blackjack', {'players': 4}, 1, "t.round >= 0 && t.gs.round >= 2 && t.gs.phase === 'play'"),
    ('halma', 'halma', {'players': 3}, 1, "t.nmoves >= 18"),
    ('ludo', 'ludo', {'players': 4}, 1, "t.nmoves >= 40 && t.gs.phase === 'move'"),
    ('schiffe', 'schiffe', {}, 1, "t.gs.phase === 'shoot' && t.gs.ply >= 26"),
    ('vier', 'vier', {}, 1, "t.nmoves >= 10"),
    ('maumau', 'maumau', {'players': 3}, 1, "t.nmoves >= 8 && t.gs.phase === 'play'"),
    ('wuerfel', 'wuerfel', {'players': 2}, 1, "t.gs.round >= 5 && t.gs.phase === 'choose' && t.gs.rolls === 1"),
    ('reversi', 'reversi', {}, 1, "t.nmoves >= 22"),
    ('paare', 'paare', {'players': 2, 'paare': 12}, 1, "t.gs.found.filter(x => x !== null).length >= 8 && t.gs.open.length === 0"),
    ('holdem', 'holdem', {'players': 6}, 1, "t.gs.street >= 1 && t.gs.phase === 'bet' && !t.gs.folded[t.seats.length - 1]"),
    # Sieg/Erfolg: Stand kurz vor dem Ende, der letzte Zug wird live gemacht
    ('vier_sieg', 'vier', {}, 1, "WIN"),
    ('paare_sieg', 'paare', {'players': 1, 'paare': 8}, 1, "PAARE_LAST"),
    ('schnapsen_ende', 'schnapsen', {}, 1, "t.gs.phase === 'spielende'"),
]
EXTRA = ['lobby', 'lobby_spiele', 'trainer']   # ohne Fixture


def ctx_page(b, base, form, fixture=None, q='', settings=None):
    P = Page(b, base, form)
    init = {'sb.profile': PROFILE, 'sb.settings': {'botLevel': 1, 'hostColor': 'weiss', 'tempo': 'normal', 'evalOn': True, **(settings or {})}}
    if fixture is not None: init['sb.local.bot'] = fixture
    js = ''.join(f"localStorage.setItem({json.dumps(k)}, {json.dumps(json.dumps(v))});" for k, v in init.items())
    P.ctx.add_init_script("if (!sessionStorage.getItem('dekoInit')) { sessionStorage.setItem('dekoInit', '1'); " + js + " }")
    return P


def wait_js(P, js, timeout=30, what=''):
    t0 = time.time()
    while not P.ev(js):
        if time.time() - t0 > timeout: raise TimeoutError(what or js)
        time.sleep(0.05)


MINE = "(() => { const t = __box.table(); return !!t && t.status === 'play' && __box.legal().length > 0 && !__box.busy(); })()"


def make_fixture(b, base, name, game, opts, level, cond):
    P = ctx_page(b, base, 'hoch')
    P.open('?nosw')
    P.ev(f"__box.local('bot', {json.dumps(game)}, {json.dumps(opts)}, 'weiss', {level})")
    wait_js(P, "!!__box.table()", 15, 'Tisch')
    t0 = time.time()
    while time.time() - t0 < 120:
        st = P.ev("__box.state().table")
        if st['status'] != 'play':
            print('   Partie vorbei, neu'); P.ev(f"__box.local('bot', {json.dumps(game)}, {json.dumps(opts)}, 'weiss', {level})"); time.sleep(0.3); continue
        if not P.ev(MINE): time.sleep(0.04); continue
        if cond == 'WIN':
            # Vier: gibt es einen Gewinnzug für mich? Dann hier anhalten
            win = P.ev("""async () => { const E = await import('./src/games/vier/engine.js'); const t = __box.table();
              for (const m of __box.legal()) { const g = E.applyMove(t.gs, m); if (g.win) return m; } return null; }""")
            if win and st['nmoves'] >= 9: break
        elif cond == 'PAARE_LAST':
            if P.ev("(() => { const g = __box.table().gs; return g.found.filter(x => x === null).length === 2 && g.open.length === 0; })()"): break
        elif P.ev(f"(() => {{ const t = __box.table(); return {cond}; }})()"):
            break
        # Hold'em: mitgehen statt aussteigen, damit ich im Flop noch dabei bin
        if game == 'holdem':
            P.ev("(() => { const l = __box.legal(); const m = l.find(x => x.type === 'check') || l.find(x => x.type === 'call') || l[0]; __box.move(m); })()")
        elif cond == 'WIN' or name == 'vier':
            # Vier: nicht selbst gewinnen, bevor die Szene steht (zufällig ziehen, Gewinnzüge meiden)
            P.ev("""async () => { const E = await import('./src/games/vier/engine.js'); const t = __box.table(); const l = __box.legal();
              const ok = l.filter(m => !E.applyMove(t.gs, m).win); const m = (ok.length ? ok : l)[Math.floor(Math.random() * (ok.length ? ok : l).length)]; __box.move(m); }""")
        else:
            P.ev("__box.botMove(1)")
        time.sleep(0.05)
    else:
        raise TimeoutError(f'{name}: Szene nicht erreicht')
    time.sleep(0.4)
    data = P.ev("localStorage.getItem('sb.local.bot')")
    os.makedirs(FIX, exist_ok=True)
    with open(os.path.join(FIX, name + '.json'), 'w') as f: f.write(data)
    print(f'  ✅ {name}: Zug {P.ev("__box.table().nmoves")}, {len(data) / 1024:.1f} KB')
    P.close()


def fixtures(only=None):
    with sync_playwright() as pw, Server() as srv:
        b = launch(pw)
        for name, game, opts, level, cond in SCENES:
            if only and name not in only: continue
            make_fixture(b, srv.base, name, game, opts, level, cond)
        b.close()


def load_fixture(name):
    with open(os.path.join(FIX, name + '.json')) as f: return json.loads(f.read())


def settle(P, extra=0.7):
    wait_js(P, "!__box.busy()", 20, 'Ruhe')
    # Bilder (Karten, Holz) geladen?
    P.ev("Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })))")
    time.sleep(extra)


def shoot_scene(b, base, name, form, outdir, q, burst=False):
    paths = []
    query = '?nosw' + ('&' + q if q else '')
    if name in EXTRA:
        P = ctx_page(b, base, form)
        if name == 'trainer':
            P.open(query, '#trainer')
            wait_js(P, "!!document.querySelector('.trainer')", 15)
        else:
            P.open(query)
            if name == 'lobby_spiele':
                P.ev("document.querySelector('.card.new').scrollIntoView({block: 'start'})")
        time.sleep(0.8)
        paths.append(P.shot(f'{name}_{form}', f'deko/{outdir}'))
    else:
        scene = next(s for s in SCENES if s[0] == name)
        P = ctx_page(b, base, form, load_fixture(name))
        # Sieg-Szenen: echtes Tempo, damit die Animation läuft
        P.open(query + ('&tempo=normal' if name.endswith('_sieg') else ''), '#solo')
        wait_js(P, "!!__box.table() && __box.state().screen === 'table'", 20, 'Tisch')
        settle(P)
        if name == 'vier_sieg':
            P.ev("""async () => { const E = await import('./src/games/vier/engine.js'); const t = __box.table();
              for (const m of __box.legal()) if (E.applyMove(t.gs, m).win) { __box.move(m); return; } }""")
        elif name == 'paare_sieg':
            P.ev("(() => { const g = __box.table().gs; const free = g.found.map((x, i) => x === null ? i : -1).filter(i => i >= 0); __box.move({ flip: free[0] }); setTimeout(() => __box.move({ flip: free[1] }), 900); })()")
            time.sleep(0.9)
        if name.endswith('_sieg'):
            # Serie: flüchtige Zustände (Sieg-Animation) einfangen – zu festen Zeiten anhalten, fotografieren, weiter
            # (ein Foto dauert hier bis zu 3 s; ohne Anhalten wäre das Konfetti schon vorbei)
            t0 = time.time(); paused = 0.0
            for k, at in enumerate([0.5, 0.9, 1.3, 1.9, 2.8, 4.5]):
                while time.time() - t0 - paused < at: time.sleep(0.01)
                p0 = time.time()
                P.ev("__box.freeze && __box.freeze(true)")
                paths.append(P.shot(f'{name}_{form}_{k}', f'deko/{outdir}'))
                P.ev("__box.freeze && __box.freeze(false)")
                paused += time.time() - p0
        else:
            paths.append(P.shot(f'{name}_{form}', f'deko/{outdir}'))
    errs = P.app_errors()
    if errs: print(f'  ❌ {name} {form}: {errs[:3]}')
    P.close()
    return paths, errs


def shots(outdir, q='', only=None):
    allerr = []
    with sync_playwright() as pw, Server() as srv:
        b = launch(pw)
        names = EXTRA + [s[0] for s in SCENES]
        for name in names:
            if only and name not in only: continue
            for form in ['hoch', 'quer']:
                _, errs = shoot_scene(b, srv.base, name, form, outdir, q)
                allerr += errs
            print(f'  📷 {name}', flush=True)
        b.close()
    print('Fehler:', len(allerr))
    return allerr


def vergleich(a, b, only=None):
    from PIL import Image, ImageDraw, ImageFont
    da, db = os.path.join(SHOTS, a), os.path.join(SHOTS, b)
    names = EXTRA + [s[0] for s in SCENES]
    font = ImageFont.load_default()
    for fp in ['/usr/share/fonts/TTF/DejaVuSans-Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf']:   # Linux, macOS
        try: font = ImageFont.truetype(fp, 34); break
        except Exception: pass
    made = []
    for form in ['hoch', 'quer']:
        for name in names:
            if only and name not in only: continue
            fa = os.path.join(da, f'{name}_{form}.png'); fb = os.path.join(db, f'{name}_{form}.png')
            if name.endswith('_sieg'):
                fa = os.path.join(da, f'{name}_{form}_2.png'); fb = os.path.join(db, f'{name}_{form}_2.png')
            if not (os.path.exists(fa) and os.path.exists(fb)): continue
            ia, ib = Image.open(fa).convert('RGB'), Image.open(fb).convert('RGB')
            k = 0.5 if form == 'hoch' else 0.42
            ia = ia.resize((int(ia.width * k), int(ia.height * k)), Image.LANCZOS)
            ib = ib.resize((int(ib.width * k), int(ib.height * k)), Image.LANCZOS)
            pad, head = 16, 56
            W = ia.width + ib.width + 3 * pad; H = max(ia.height, ib.height) + head + pad
            im = Image.new('RGB', (W, H), (24, 24, 24))
            d = ImageDraw.Draw(im)
            d.text((pad, 10), f'vorher ({a})', fill=(230, 230, 230), font=font)
            d.text((2 * pad + ia.width, 10), f'nachher ({b})', fill=(255, 214, 120), font=font)
            im.paste(ia, (pad, head)); im.paste(ib, (2 * pad + ia.width, head))
            p = os.path.join(SHOTS, f'vergleich_{name}_{form}.jpg')
            im.save(p, quality=80, optimize=True)
            made.append(p)
    print('\n'.join(made))
    return made


def kontakt(outdir, form, names=None, cols=4, scale=0.3, out=None):
    """Kontaktbogen: viele Screenshots eines Ordners auf einem Bild (zum Ansehen)."""
    from PIL import Image, ImageDraw, ImageFont
    d = os.path.join(SHOTS, outdir)
    names = names or (EXTRA + [s[0] for s in SCENES])
    files = []
    for n in names:
        f = os.path.join(d, f'{n}_{form}.png')
        if not os.path.exists(f): f = os.path.join(d, f'{n}_{form}_2.png')
        if os.path.exists(f): files.append((n, f))
    ims = [(n, Image.open(f).convert('RGB')) for n, f in files]
    ims = [(n, im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)) for n, im in ims]
    w = max(im.width for _, im in ims); h = max(im.height for _, im in ims) + 26
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * w, rows * h), (20, 20, 20))
    dr = ImageDraw.Draw(sheet)
    for k, (n, im) in enumerate(ims):
        x, y = (k % cols) * w, (k // cols) * h
        sheet.paste(im, (x, y + 26)); dr.text((x + 6, y + 4), n, fill=(255, 220, 120))
    p = out or os.path.join(SHOTS, f'kontakt_{outdir}_{form}.jpg')
    sheet.save(p, quality=82)
    print(p, sheet.size)
    return p


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'shots'
    only = None
    rest = []
    for a in sys.argv[2:]:
        if a.startswith('--nur='): only = a.split('=', 1)[1].split(',')
        else: rest.append(a)
    if cmd == 'fixtures': fixtures(only)
    elif cmd == 'shots': sys.exit(1 if shots(rest[0] if rest else 'nachher', rest[1] if len(rest) > 1 else '', only) else 0)
    elif cmd == 'vergleich': vergleich(rest[0], rest[1], only)
    elif cmd == 'kontakt':
        for form in ['hoch', 'quer']: kontakt(rest[0], form, only, cols=6 if form == 'hoch' else 4, scale=0.28 if form == 'hoch' else 0.3)

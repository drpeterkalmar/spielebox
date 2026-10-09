# Technik n9 – Abnahme im Browser (09.10.2026)
#   python3 tests/technik_n9.py karten [--nur=schnapsen,…]   – Pixelvergleich Einzelkarten (?atlas=0) gegen Atlas je Blatt,
#        hoch/quer (Pixel 7, DPR 2,625 → @2x) und Desktop (DPR 1 → 1×). Je Karte auf dem Bildschirm: PSNR und größte
#        Abweichung; Ausschnitte der schlechtesten Karten nebeneinander (×2) → tests/shots/technik/karten_*.png
#   python3 tests/technik_n9.py speicher                      – Bildspeicher (dekodiert) und Dekodierzeit am Kartentisch
# Gleiche Fixture, gleicher Zustand, nur der Regler unterscheidet sich → jede Abweichung kommt vom Kartenbild.
import sys, os, time, json, math
sys.path.insert(0, 'tests')
from util import *
from deko_rundgang import ctx_page, load_fixture, wait_js, settle

OUT = os.path.join(ROOT, 'tests', 'shots', 'technik')
CARD_SCENES = ['schnapsen', 'schnapsen_ende', 'maumau', 'blackjack', 'holdem']

RECTS_JS = """() => [...document.querySelectorAll('.card[data-card], img[data-card]')].map((e) => {
  const r = e.getBoundingClientRect(); return { card: e.getAttribute('data-card'), x: r.x, y: r.y, w: r.width, h: r.height }; })
  .filter((r) => r.w > 8 && r.h > 8)"""


def shot_scene(b, base, name, form, q):
    P = ctx_page(b, base, form, load_fixture(name))
    P.open('?nosw' + ('&' + q if q else ''), '#solo')
    wait_js(P, "!!__box.table() && __box.state().screen === 'table'", 20, 'Tisch')
    settle(P, 1.2)
    # Bilder in SVG (<image>) sind nicht in document.images: nachladen abwarten
    P.ev("""Promise.all([...document.querySelectorAll('image')].map((im) => { const i = new Image(); i.src = im.href.baseVal; return i.decode().catch(() => 0); }))""")
    time.sleep(0.6)
    rects = P.ev(RECTS_JS)
    dpr = P.ev('devicePixelRatio')
    png = P.pg.screenshot()
    errs = P.app_errors()
    P.close()
    return png, rects, dpr, errs


def psnr(a, b):
    import numpy as np
    d = (a.astype(np.float64) - b.astype(np.float64)) ** 2
    m = d.mean()
    return 99.0 if m == 0 else 10 * math.log10(255 ** 2 / m)


def karten(only=None):
    import io
    import numpy as np
    from PIL import Image
    os.makedirs(OUT, exist_ok=True)
    rep = {}
    worst_all = []
    with sync_playwright() as pw, Server() as srv:
        b = launch(pw)
        for name in CARD_SCENES:
            if only and name not in only: continue
            for form in ['hoch', 'quer', 'desktop']:
                A, ra, dpr, ea = shot_scene(b, srv.base, name, form, 'atlas=0')
                B, rb, _, eb = shot_scene(b, srv.base, name, form, '')
                ia = np.asarray(Image.open(io.BytesIO(A)).convert('RGB')); ib = np.asarray(Image.open(io.BytesIO(B)).convert('RGB'))
                if ia.shape != ib.shape:
                    print(f'  ❌ {name} {form}: Bildgröße verschieden'); continue
                full = psnr(ia, ib)
                diff = np.abs(ia.astype(int) - ib.astype(int)).max(axis=2)
                mask = np.zeros(diff.shape, bool)
                cards = []
                for r in ra:
                    x0, y0 = max(0, int(r['x'] * dpr)), max(0, int(r['y'] * dpr))
                    x1, y1 = min(ia.shape[1], int((r['x'] + r['w']) * dpr)), min(ia.shape[0], int((r['y'] + r['h']) * dpr))
                    if x1 - x0 < 8 or y1 - y0 < 8: continue
                    mask[y0:y1, x0:x1] = True
                    ca, cb = ia[y0:y1, x0:x1], ib[y0:y1, x0:x1]
                    cards.append({'card': r['card'], 'psnr': round(psnr(ca, cb), 2), 'max': int(np.abs(ca.astype(int) - cb.astype(int)).max()),
                                  'px': [x1 - x0, y1 - y0], 'box': [x0, y0, x1, y1]})
                outside = diff[~mask]
                n_out = int((outside > 24).sum())
                cards.sort(key=lambda c: c['psnr'])
                key = f'{name}@{form}'
                rep[key] = {'dpr': dpr, 'psnr_bild': round(full, 2), 'karten': len(cards),
                            'psnr_min': cards[0]['psnr'] if cards else None, 'psnr_mittel': round(sum(c['psnr'] for c in cards) / len(cards), 2) if cards else None,
                            'max_abw': max((c['max'] for c in cards), default=0), 'aussen_px_ueber_24': n_out,
                            'schlechteste': cards[:3], 'fehler': (ea + eb)[:3], 'gleiche_karten': len(ra) == len(rb)}
                print(f"  {key:24s} Karten {len(cards):2d}  PSNR min {rep[key]['psnr_min']}  Mittel {rep[key]['psnr_mittel']}  max. Abw. {rep[key]['max_abw']:3d}  "
                      f"außerhalb >24: {n_out} px  Bild {full:.1f} dB  {ea + eb or ''}", flush=True)
                for c in cards[:2]:
                    worst_all.append((c['psnr'], key, c, ia, ib))
                # Ausschnitt der schlechtesten Karte: links Einzeldatei, rechts Atlas, ×2 (nächster Nachbar), darunter Differenz ×8
                if cards:
                    c = cards[0]; x0, y0, x1, y1 = c['box']
                    ca, cb = Image.fromarray(ia[y0:y1, x0:x1]), Image.fromarray(ib[y0:y1, x0:x1])
                    dd = Image.fromarray(np.clip(np.abs(ia[y0:y1, x0:x1].astype(int) - ib[y0:y1, x0:x1].astype(int)) * 8, 0, 255).astype('uint8'))
                    w, h = ca.size
                    k = max(1, min(3, 600 // max(w, 1)))
                    sheet = Image.new('RGB', (w * k * 3 + 20, h * k), 'white')
                    for i, im in enumerate([ca, cb, dd]): sheet.paste(im.resize((w * k, h * k), Image.NEAREST), (i * (w * k + 10), 0))
                    sheet.save(os.path.join(OUT, f'karten_{name}_{form}.png'))
        b.close()
    with open(os.path.join(ROOT, 'tests', 'out', 'technik_karten.json'), 'w') as f: json.dump(rep, f, indent=1)
    worst_all.sort(key=lambda t: t[0])
    print('schlechteste Karten:', [(round(p, 1), k, c['card']) for p, k, c, *_ in worst_all[:6]])
    return rep


# Bildspeicher am Kartentisch: Summe der dekodierten Bildgrößen (Breite × Höhe × 4) aller geladenen Kartenbilder
# und Dekodierzeit (Image.decode, CPU 4× gedrosselt) – Einzeldateien gegen Atlas
MEM_JS = """async () => {
  const urls = [...new Set([...document.querySelectorAll('image')].map((im) => im.href.baseVal)
    .concat([...document.querySelectorAll('img[data-card]')].map((i) => (getComputedStyle(i).backgroundImage.match(/url\\("?([^")]+)/) || [])[1] || i.src))
    .filter((u) => u && /assets\\/cards\\//.test(u)))];
  let px = 0, ms = 0;
  for (const u of urls) {
    const i = new Image(); i.src = u + (u.includes('?') ? '&' : '?') + 'dec=' + Math.random();
    const t = performance.now(); await i.decode().catch(() => 0); ms += performance.now() - t;
    px += i.naturalWidth * i.naturalHeight;
  }
  return { files: urls.length, mb: Math.round(px * 4 / 1e5) / 10, decode_ms: Math.round(ms), urls: urls.map((u) => u.split('/').slice(-2).join('/')) };
}"""


def speicher(only=None):
    rep = {}
    with sync_playwright() as pw, Server() as srv:
        b = launch(pw)
        for name in ['schnapsen', 'maumau', 'blackjack', 'holdem']:
            if only and name not in only: continue
            for q in ['atlas=0', '']:
                P = ctx_page(b, srv.base, 'hoch', load_fixture(name))
                P.open('?nosw' + ('&' + q if q else ''), '#solo')
                wait_js(P, "!!__box.table() && __box.state().screen === 'table'", 20, 'Tisch')
                settle(P, 1.0)
                cdp = P.ctx.new_cdp_session(P.pg)
                cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
                r = P.pg.evaluate(MEM_JS)
                cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
                P.close()
                rep[f'{name}[{q or "Atlas"}]'] = r
                print(f"  {name:10s} [{q or 'Atlas':7s}] Dateien {r['files']:2d}  dekodiert {r['mb']:5.1f} MB  Dekodieren {r['decode_ms']:5d} ms (CPU 4×)  {r['urls'][:6]}", flush=True)
        b.close()
    with open(os.path.join(ROOT, 'tests', 'out', 'technik_speicher.json'), 'w') as f: json.dump(rep, f, indent=1)
    return rep


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'karten'
    only = None
    for a in sys.argv[2:]:
        if a.startswith('--nur='): only = a.split('=', 1)[1].split(',')
    {'karten': karten, 'speicher': speicher}[cmd](only)

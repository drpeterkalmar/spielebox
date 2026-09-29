#!/usr/bin/env python3
"""Doppeldeutsche Schnapskarten aus Wikimedia-Commons-Fotos (Public Domain, Zakupak).

Ablauf (reproduzierbar):
  1. Rohfotos nach tools/cards/raw/ laden (falls fehlend).
  2. Je Karte die gedruckte Rahmenlinie finden: grobe Ecken (von Hand aus einer
     Vorschau abgelesen, ROUGH) werden automatisch auf die dunkle Rahmenlinie
     eingerastet (Linien-Suche im Black-Hat-Bild). Ergebnis -> corners.json.
     Existiert corners.json, wird es verwendet (Handkorrektur moeglich);
     mit --redetect neu berechnen.
  3. Perspektive entzerren (Rahmen + fester Rand), Weissabgleich auf
     cremeweisses Papier, leichte Kontrastanhebung, Rand ausserhalb der
     Rahmenlinie sauber in Papierfarbe, runde Ecken als Alpha.
  4. Export WebP 240 px und @2x 480 px nach assets/cards/de/, Kontaktbogen.

Aufruf:  tools/cards/.venv/bin/python tools/cards/crop_de.py [--redetect]
"""
import json, sys, os, urllib.parse, urllib.request
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
RAW = HERE / "raw"
OUT = ROOT / "assets" / "cards" / "de"
CORNERS = HERE / "corners.json"
UA = "Spielebox/1.0 (dr.peter.kalmar@gmail.com)"

FILES = {  # Farbe -> Commons-Dateiname
    "H": "Červené v kartách.jpg",   # Herz (cerveny)
    "S": "Kule v kartách.jpg",      # Schellen (kule)
    "L": "Zelené v kartách.jpg",    # Laub/Gruen (zelene)
    "E": "Žaludy v kartách.jpg",    # Eichel (zaludy)
}

# Grobe Ecken der Rahmenlinie (TL, TR, BR, BL) in Vorschau-Koordinaten
# (Vorschau = Foto auf 1400 px Breite skaliert). Anordnung in allen vier
# Fotos: obere Reihe Daus, Koenig, Ober, Unter; unten links der Zehner.
ROUGH = {
    "H": {"A": [(260, 55), (465, 55), (452, 393), (232, 388)],
          "K": [(488, 56), (718, 60), (712, 398), (480, 396)],
          "O": [(742, 55), (950, 55), (972, 392), (742, 390)],
          "U": [(980, 60), (1195, 62), (1215, 402), (1000, 402)],
          "Z": [(222, 430), (446, 432), (440, 812), (212, 810)]},
    "S": {"A": [(218, 48), (462, 50), (452, 428), (208, 425)],
          "K": [(490, 45), (730, 45), (730, 430), (482, 428)],
          "O": [(758, 40), (998, 45), (1008, 420), (760, 420)],
          "U": [(1028, 48), (1255, 48), (1275, 428), (1045, 432)],
          "Z": [(205, 465), (440, 465), (445, 875), (200, 875)]},
    "L": {"A": [(145, 38), (388, 35), (382, 418), (140, 418)],
          "K": [(418, 32), (662, 32), (660, 418), (415, 420)],
          "O": [(692, 32), (938, 32), (945, 420), (695, 422)],
          "U": [(968, 40), (1215, 40), (1220, 432), (978, 432)],
          "Z": [(130, 455), (372, 455), (368, 862), (118, 862)]},
    "E": {"A": [(40, 28), (338, 28), (338, 518), (35, 518)],
          "K": [(378, 28), (688, 30), (688, 520), (370, 515)],
          "O": [(722, 30), (1030, 32), (1035, 522), (728, 522)],
          "U": [(1070, 38), (1360, 38), (1365, 528), (1075, 528)],
          "Z": [(30, 555), (335, 555), (338, 1045), (30, 1045)]},
}
SUITS = "HSLE"
RANKS = "AZKOU"
SUIT_NAME = {"H": "Herz", "S": "Schellen", "L": "Laub", "E": "Eichel"}
RANK_NAME = {"A": "Daus", "Z": "Zehner", "K": "König", "O": "Ober", "U": "Unter"}

# Zielgeometrie (bei 480 px Breite): Rahmenlinie + Rand
W2 = 480
MARGIN = 22          # px Rand ausserhalb der Rahmenlinie (bei 480 px)
PAPER = np.array([236, 243, 248], np.float32)  # BGR, cremeweiss (~ #F8F3EC)


def download():
    RAW.mkdir(exist_ok=True)
    for k, name in FILES.items():
        dst = RAW / f"{k}.jpg"
        if dst.exists():
            continue
        url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(name)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req) as r:
            dst.write_bytes(r.read())
        print("geladen", dst.name)


def blackhat(gray):
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11))
    bh = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, k).astype(np.float32)
    return cv2.GaussianBlur(bh, (5, 5), 0)


def snap_edge(bh, p0, p1, inward, band=70, step=2):
    """Verschiebt die Endpunkte p0/p1 entlang der Normalen, bis die Strecke
    maximal auf dunkler duenner Linie liegt. Liefert (p0, p1)."""
    p0, p1 = np.float32(p0), np.float32(p1)
    d = p1 - p0
    n = np.float32([-d[1], d[0]]) / np.linalg.norm(d)
    if np.dot(n, inward) < 0:
        n = -n
    t = np.linspace(0.12, 0.88, 300, dtype=np.float32)[:, None]
    offs = np.arange(-band, band + 1, step, dtype=np.float32)
    h, w = bh.shape
    best = (-1, 0, 0)
    for a in offs:
        q0 = p0 + n * a
        # alle b auf einmal
        pts0 = q0[None, None, :] * (1 - t[None]) + (p1[None, None, :] + n[None, None, :] * offs[:, None, None]) * t[None]
        xs = np.clip(pts0[..., 0].round().astype(int), 0, w - 1)
        ys = np.clip(pts0[..., 1].round().astype(int), 0, h - 1)
        s = bh[ys, xs].mean(axis=1)
        i = int(s.argmax())
        if s[i] > best[0]:
            best = (float(s[i]), a, offs[i])
    _, a, b = best
    return p0 + n * a, p1 + n * b, best[0]


def intersect(a0, a1, b0, b1):
    A = np.array([[a1[0] - a0[0], -(b1[0] - b0[0])], [a1[1] - a0[1], -(b1[1] - b0[1])]], np.float64)
    r = np.array([b0[0] - a0[0], b0[1] - a0[1]], np.float64)
    s = np.linalg.solve(A, r)[0]
    return a0 + (a1 - a0) * s


def detect(img, rough_prev):
    h, w = img.shape[:2]
    sc = w / 1400.0
    q = np.float32(rough_prev) * sc
    bh = blackhat(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
    c = q.mean(axis=0)
    for band in (70, 14):
        lines = []
        for i in range(4):
            p0, p1 = q[i], q[(i + 1) % 4]
            mid = (p0 + p1) / 2
            a, b, sc_ = snap_edge(bh, p0, p1, c - mid, band=band, step=2 if band > 20 else 1)
            lines.append((a, b))
        q = np.float32([intersect(*lines[(i - 1) % 4], *lines[i]) for i in range(4)])
    return q


def paper_balance(bgr, mask, satf=1.06):
    """Weissabgleich: Papierpixel (hell, wenig Saettigung) -> PAPER."""
    f = bgr.astype(np.float32)
    px = f[mask > 0]
    lum = px.mean(axis=1)
    sat = px.max(axis=1) - px.min(axis=1)
    sel = px[(lum > np.percentile(lum, 55)) & (sat < np.percentile(sat, 60))]
    ref = np.median(sel, axis=0)
    g = PAPER / np.maximum(ref, 1)
    f = f * g
    # leichte Kontrastanhebung: Schwarzpunkt anheben, Gamma minimal
    lo = np.percentile(f[mask > 0].mean(axis=1), 0.3) * 0.7
    f = (f - lo) / (PAPER.mean() - lo) * PAPER.mean()
    f = np.clip(f, 0, 255)
    # dezente Saettigung/Kontrast
    hsv = cv2.cvtColor(f.astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * satf, 0, 255)
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)


def render(img, frame, fw, fh, sat=1.06):
    """Entzerrt die Rahmenlinie auf fw x fh (plus MARGIN) bei 480 px Breite."""
    W, H = fw + 2 * MARGIN, fh + 2 * MARGIN
    dst = np.float32([[MARGIN, MARGIN], [MARGIN + fw, MARGIN], [MARGIN + fw, MARGIN + fh], [MARGIN, MARGIN + fh]])
    # Supersampling: erst doppelt, dann verkleinern
    S = 2
    M = cv2.getPerspectiveTransform(np.float32(frame), dst * S)
    big = cv2.warpPerspective(img, M, (W * S, H * S), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    out = cv2.resize(big, (W, H), interpolation=cv2.INTER_AREA)
    inner = np.zeros((H, W), np.uint8)
    cv2.rectangle(inner, (MARGIN + 3, MARGIN + 3), (MARGIN + fw - 3, MARGIN + fh - 3), 255, -1)
    out = paper_balance(out, inner, sat)
    # Rand ausserhalb der Rahmenlinie: echtes Papier bis ~8 px, dann weich in Papierfarbe
    dist = np.zeros((H, W), np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    dx = np.maximum(np.maximum(MARGIN - xx, xx - (MARGIN + fw)), 0)
    dy = np.maximum(np.maximum(MARGIN - yy, yy - (MARGIN + fh)), 0)
    dist = np.maximum(dx, dy)
    a = np.clip((dist - 5) / 4, 0, 1)[..., None]
    out = (out.astype(np.float32) * (1 - a) + PAPER[None, None, :] * a).astype(np.uint8)
    # runde Ecken
    r = int(round(W * 0.055))
    m = Image.new("L", (W * 4, H * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, W * 4 - 1, H * 4 - 1], radius=r * 4, fill=255)
    alpha = np.array(m.resize((W, H), Image.LANCZOS))
    rgba = np.dstack([cv2.cvtColor(out, cv2.COLOR_BGR2RGB), alpha])
    return Image.fromarray(rgba, "RGBA")


def save_webp(im, path, maxkb):
    for q in (86, 82, 78, 74, 70, 65, 60, 55, 50):
        im.save(path, "WEBP", quality=q, alpha_quality=90, method=6)
        if path.stat().st_size <= maxkb * 1024:
            return q
    return q


def main():
    download()
    OUT.mkdir(parents=True, exist_ok=True)
    data = json.loads(CORNERS.read_text()) if CORNERS.exists() and "--redetect" not in sys.argv else {}
    imgs = {k: cv2.imread(str(RAW / f"{k}.jpg")) for k in SUITS}
    changed = False
    for s in SUITS:
        for r in RANKS:
            key = s + r
            if key not in data:
                data[key] = detect(imgs[s], ROUGH[s][r]).round(1).tolist()
                changed = True
    if changed:
        CORNERS.write_text(json.dumps({k: data[k] for k in sorted(data)}, indent=1))
    # einheitliches Rahmen-Seitenverhaeltnis = Median der gemessenen Rahmen
    ratios = []
    for key, q in data.items():
        q = np.float32(q)
        wdt = (np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])) / 2
        hgt = (np.linalg.norm(q[3] - q[0]) + np.linalg.norm(q[2] - q[1])) / 2
        ratios.append(hgt / wdt)
    ratio = float(np.median(ratios))
    fw = W2 - 2 * MARGIN
    fh = int(round(fw * ratio))
    print(f"Rahmen-Verhaeltnis {ratio:.4f} (min {min(ratios):.3f} max {max(ratios):.3f}); Karte {W2}x{fh + 2 * MARGIN}")
    cards = {}
    for s in SUITS:
        for r in RANKS:
            key = s + r
            im = render(imgs[s], data[key], fw, fh, 0.92 if s == "E" else 1.04)  # Eichel-Foto ist schon uebersaettigt
            cards[key] = im
            q2 = save_webp(im, OUT / f"{key}@2x.webp", 110)
            im1 = im.resize((240, round(im.height * 240 / W2)), Image.LANCZOS)
            q1 = save_webp(im1, OUT / f"{key}.webp", 35)
            print(key, im1.size, im.size, f"q{q1}/{q2}",
                  (OUT / f"{key}.webp").stat().st_size // 1024, "KB /",
                  (OUT / f"{key}@2x.webp").stat().st_size // 1024, "KB")
    contact(cards)


def contact(cards):
    cw, ch = 240, None
    sample = next(iter(cards.values()))
    ch = round(sample.height * cw / sample.width)
    pad, lab = 16, 26
    sheet = Image.new("RGB", (pad + len(RANKS) * (cw + pad), pad + 4 * (ch + lab + pad)), (40, 90, 60))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    for i, s in enumerate(SUITS):
        for j, r in enumerate(RANKS):
            im = cards[s + r].resize((cw, ch), Image.LANCZOS)
            x, y = pad + j * (cw + pad), pad + i * (ch + lab + pad)
            d.text((x, y), f"{s}{r} {SUIT_NAME[s]} {RANK_NAME[r]}", fill=(255, 255, 255), font=font)
            sheet.paste(im, (x, y + lab), im)
    sheet.save(HERE / "kontakt_de.png")
    print("Kontaktbogen", HERE / "kontakt_de.png")


if __name__ == "__main__":
    main()

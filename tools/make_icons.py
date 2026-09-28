#!/usr/bin/env python3
"""App-Icons der Spielebox zeichnen (eigene Gestaltung mit PIL, kein Text).

Motiv: stilisiertes Mühlebrett – drei konzentrische Quadrate mit Verbindungslinien auf einer
hellen Holzplatte mit Gehrungsrahmen aus dunklem Holz, darauf drei Spielsteine (hell/dunkel)
mit leichtem Schatten. Das maskierbare Icon legt das Brett auf dunkelgrünen Filz.
Holz: die CC0-Texturen aus assets/wood/ (Poly Haven, siehe assets/wood/SOURCES.json) –
vorher tools/fetch_textures.py laufen lassen. Filz: prozedurales Rauschen (fester Seed).
Gezeichnet wird in 4-facher Größe, verkleinert mit Lanczos (Antialiasing).

    python3 tools/make_icons.py              # icons/*.png erzeugen
    python3 tools/make_icons.py --preview    # zusätzlich Kontaktbogen in assets_src/preview/

Ausgabe (icons/):
    icon-192.png, icon-512.png   purpose "any": abgerundetes Brett, transparente Ecken
    icon-maskable-512.png        purpose "maskable": vollflächig, Brett in der 80-%-Sicherheitszone
    apple-touch-icon.png         180x180, vollflächig, ohne Transparenz (iOS rundet selbst)
    favicon-64.png               wie "any"
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
WOOD = ROOT / "assets" / "wood"
OUT = ROOT / "icons"
PREVIEW = ROOT / "assets_src" / "preview"

SS = 4                                   # Supersampling-Faktor

# Farben
LINE = (42, 26, 16)                      # eingebrannte Linien
LINE_ALPHA = 0.92
FELT = (31, 74, 58)                      # dunkelgrüner Filz  #1f4a3a
STONE_LIGHT = dict(hi=(255, 251, 242), base=(240, 231, 212), edge=(200, 186, 158), rim=(128, 106, 78))
STONE_DARK = dict(hi=(110, 98, 92), base=(48, 41, 38), edge=(22, 18, 16), rim=(8, 6, 5))

# Steine: (Farbe, x, y) in Einheiten der halben Außenquadrat-Seite, Mitte = (0, 0), y nach unten.
# Außenring = 1, Mittelring = 2/3, Innenring = 1/3.
LAYOUTS = {
    "A": [("light", -1, -1), ("dark", 2 / 3, 0), ("light", 0, 1)],
    "B": [("light", -2 / 3, -2 / 3), ("dark", 2 / 3, 2 / 3), ("dark", 1, -1)],
    "C": [("light", -1, -1), ("light", 0, -1), ("dark", 1, -1)],
    "D": [("light", 0, -2 / 3), ("dark", -1 / 3, 1 / 3), ("light", 1, 1)],
    "E": [("dark", -1, -1), ("light", 2 / 3, 0), ("dark", 0, 2 / 3)],
}
LAYOUT = "B"


# --------------------------------------------------------------------------- Hilfen

def load_wood(name: str) -> Image.Image:
    path = WOOD / f"{name}.jpg"
    if not path.exists():
        sys.exit(f"{path} fehlt – zuerst python3 tools/fetch_textures.py ausführen")
    return Image.open(path).convert("RGB")


def rounded_mask(size: int, box, radius: float) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    x0, y0, x1, y1 = (int(round(v)) for v in box)
    ImageDraw.Draw(m).rounded_rectangle((x0, y0, x1 - 1, y1 - 1), radius=int(round(radius)), fill=255)
    return m


def scale_alpha(mask: Image.Image, factor: float) -> Image.Image:
    return mask.point(lambda v: int(round(v * factor)))


def put(canvas: Image.Image, color, mask: Image.Image) -> None:
    """Farbe durch eine Graustufen-Maske auf die (RGBA-)Leinwand legen."""
    layer = Image.new("RGBA", canvas.size, tuple(color) + (0,))
    layer.putalpha(mask)
    canvas.alpha_composite(layer)


def texture_fill(tex: Image.Image, size: int, crop: float, offset=(0.0, 0.0)) -> Image.Image:
    """Ausschnitt (Anteil `crop` der Textur, versetzt um `offset`) auf size x size skalieren.
    Die Texturen sind kachelbar, daher darf der Ausschnitt über den Rand laufen."""
    w = tex.width
    c = int(round(w * crop))
    ox, oy = int(offset[0] * w) % w, int(offset[1] * w) % w
    tiled = Image.new("RGB", (2 * w, 2 * w))
    for x in (0, w):
        for y in (0, w):
            tiled.paste(tex, (x, y))
    return tiled.crop((ox, oy, ox + c, oy + c)).resize((size, size), Image.Resampling.BICUBIC)


def brighten(img: Image.Image, f: float) -> Image.Image:
    return img.point(lambda v: max(0, min(255, int(round(v * f)))))


# --------------------------------------------------------------------------- Bausteine

def felt(size: int, seed: int = 7) -> Image.Image:
    """Dunkelgrüner Filz: Grundton + feines Rauschen + weiche Vignette."""
    rng = np.random.default_rng(seed)
    n = rng.normal(0.0, 1.0, (size, size))
    n = np.asarray(Image.fromarray(((n * 32) + 128).clip(0, 255).astype(np.uint8))
                   .filter(ImageFilter.GaussianBlur(SS * 0.6)), dtype=np.float64) / 128.0 - 1.0
    yy, xx = np.mgrid[0:size, 0:size] / (size - 1) - 0.5
    r = np.sqrt(xx ** 2 + (yy + 0.06) ** 2) / 0.7071
    vign = 1.08 - 0.28 * r ** 1.6                         # Mitte etwas heller, Rand dunkler
    base = np.array(FELT, dtype=np.float64)[None, None, :]
    a = base * vign[..., None] * (1.0 + 0.10 * n[..., None])
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), "RGB").convert("RGBA")


def board(size: int, box, radius: float, frame_w: float, panel_wood: Image.Image,
          frame_wood: Image.Image, stones: list, shadow_on=None) -> Image.Image:
    """Brett (Rahmen + Platte + Linien + Steine) als RGBA-Ebene der Größe size x size.
    box/radius/frame_w in Pixeln (bereits supersampled)."""
    x0, y0, x1, y1 = box
    B = x1 - x0
    f = frame_w
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    outer = rounded_mask(size, box, radius)

    # Schlagschatten auf dem Untergrund (nur wenn es einen gibt)
    if shadow_on is not None:
        sh = Image.new("L", (size, size), 0)
        sh.paste(outer, (int(0.012 * B), int(0.022 * B)))
        sh = scale_alpha(sh.filter(ImageFilter.GaussianBlur(0.028 * B)), 0.60)
        put(shadow_on, (0, 0, 0), sh)

    # Rahmen mit Gehrung: oben/unten waagerechte Maserung, links/rechts senkrechte.
    ib = int(round(B))
    tex_h = texture_fill(frame_wood, ib, 0.55, (0.10, 0.30))
    tex_v = texture_fill(frame_wood, ib, 0.55, (0.62, 0.05)).transpose(Image.Transpose.ROTATE_90)
    pieces = {
        "top": ([(0, 0), (B, 0), (B - f, f), (f, f)], tex_h, 1.10),
        "bottom": ([(0, B), (B, B), (B - f, B - f), (f, B - f)], tex_h, 0.80),
        "left": ([(0, 0), (f, f), (f, B - f), (0, B)], tex_v, 1.00),
        "right": ([(B, 0), (B, B), (B - f, B - f), (B - f, f)], tex_v, 0.88),
    }
    frame_img = Image.new("RGB", (ib, ib))
    for poly, tex, gain in pieces.values():
        m = Image.new("L", (ib, ib), 0)
        ImageDraw.Draw(m).polygon(poly, fill=255)
        frame_img.paste(brighten(tex, gain), (0, 0), m)
    joints = Image.new("L", (ib, ib), 0)
    jd = ImageDraw.Draw(joints)
    jw = max(1, int(round(0.004 * B)))
    for a, b in [((0, 0), (f, f)), ((B, 0), (B - f, f)), ((0, B), (f, B - f)), ((B, B), (B - f, B - f))]:
        jd.line([a, b], fill=110, width=jw)
    frame_rgba = frame_img.convert("RGBA")
    frame_rgba.alpha_composite(Image.merge("RGBA", (*Image.new("RGB", (ib, ib), (0, 0, 0)).split(), joints)))
    fl = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    fl.paste(frame_rgba, (int(round(x0)), int(round(y0))))
    layer.paste(fl, (0, 0), outer)

    # Platte (helles Holz); eckig, weil der Gehrungsrahmen innen scharfe Ecken hat
    pbox = (x0 + f, y0 + f, x1 - f, y1 - f)
    P = pbox[2] - pbox[0]
    pmask = rounded_mask(size, pbox, 0)
    ip = int(round(P))
    panel_tex = texture_fill(panel_wood, ip, 0.62, (0.20, 0.35))
    pl = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pl.paste(panel_tex.convert("RGBA"), (int(round(pbox[0])), int(round(pbox[1]))))
    layer.paste(pl, (0, 0), pmask)

    # Innenschatten: der Rahmen wirft (Licht von oben links) einen Schatten auf die Platte.
    inv = ImageChops.invert(pmask)
    shifted = Image.new("L", (size, size), 255)
    d = int(round(0.012 * B))
    shifted.paste(inv, (d, d))
    ishadow = ImageChops.multiply(shifted.filter(ImageFilter.GaussianBlur(0.018 * B)), pmask)
    put(layer, (20, 10, 4), scale_alpha(ishadow, 0.45))
    # feine helle Kante am unteren/rechten Plattenrand (beleuchtete Innenkante des Rahmens)
    e = max(1, int(0.004 * B))
    edge_in = Image.new("L", (size, size), 0)
    edge_in.paste(pmask, (-e, -e))
    rim = ImageChops.subtract(pmask, edge_in)
    put(layer, (255, 240, 210), scale_alpha(rim.filter(ImageFilter.GaussianBlur(0.002 * B)), 0.35))

    # Linien: drei Quadrate + vier Verbindungen + Punkte, alles in einer Maske (keine Doppel-Deckung)
    cx, cy = (pbox[0] + pbox[2]) / 2, (pbox[1] + pbox[3]) / 2
    h1 = 0.385 * P                       # halbe Seite des Außenquadrats
    w = 0.036 * P                        # Linienstärke
    lm = Image.new("L", (size, size), 0)
    ld = ImageDraw.Draw(lm)
    for k in (1, 2 / 3, 1 / 3):
        h = h1 * k
        ld.rectangle((cx - h - w / 2, cy - h - w / 2, cx + h + w / 2, cy + h + w / 2),
                     outline=255, width=int(round(w)))
    for (ax, ay, bx, by) in [(cx, cy - h1, cx, cy - h1 / 3), (cx, cy + h1 / 3, cx, cy + h1),
                             (cx - h1, cy, cx - h1 / 3, cy), (cx + h1 / 3, cy, cx + h1, cy)]:
        ld.rectangle((min(ax, bx) - w / 2, min(ay, by) - w / 2, max(ax, bx) + w / 2, max(ay, by) + w / 2),
                     fill=255)
    dot = 0.95 * w
    for k in (1, 2 / 3, 1 / 3):
        for ux in (-1, 0, 1):
            for uy in (-1, 0, 1):
                if ux == 0 and uy == 0:
                    continue
                px, py = cx + ux * h1 * k, cy + uy * h1 * k
                ld.ellipse((px - dot, py - dot, px + dot, py + dot), fill=255)
    put(layer, LINE, scale_alpha(lm, LINE_ALPHA))

    # Steine
    rs = 0.086 * P                       # Steinradius; Luft zum Rahmen bleibt auch am Eckstein
    for color, ux, uy in stones:
        draw_stone(layer, cx + ux * h1, cy + uy * h1, rs, STONE_LIGHT if color == "light" else STONE_DARK)
    return layer


def draw_stone(canvas: Image.Image, cx: float, cy: float, r: float, pal: dict) -> None:
    size = canvas.width
    # weicher Schatten nach rechts unten
    sh = Image.new("L", (size, size), 0)
    ox, oy = 0.14 * r, 0.24 * r
    ImageDraw.Draw(sh).ellipse((cx - r + ox, cy - r + oy, cx + r + ox, cy + r + oy), fill=255)
    put(canvas, (15, 8, 2), scale_alpha(sh.filter(ImageFilter.GaussianBlur(0.22 * r)), 0.55))

    # Körper: radialer Verlauf mit Glanzpunkt oben links, gedrehte Rille, dunkler Rand
    x0, y0 = int(math.floor(cx - r - 2)), int(math.floor(cy - r - 2))
    n = int(math.ceil(2 * r + 4))
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float64)
    xx += x0 + 0.5 - cx
    yy += y0 + 0.5 - cy
    dist = np.sqrt(xx ** 2 + yy ** 2)
    hl = np.sqrt((xx + 0.38 * r) ** 2 + (yy + 0.42 * r) ** 2) / (1.55 * r)
    t = np.clip(hl, 0, 1)
    hi, base, edge, rim = (np.array(pal[k], dtype=np.float64) for k in ("hi", "base", "edge", "rim"))
    s1 = np.clip(t / 0.45, 0, 1)[..., None]
    s2 = np.clip((t - 0.45) / 0.55, 0, 1)[..., None]
    col = hi * (1 - s1) + base * s1
    col = col * (1 - s2) + edge * s2
    # Drechsel-Rille bei 62 % des Radius, Randring
    groove = np.exp(-((dist - 0.62 * r) / (0.035 * r)) ** 2)[..., None]
    col = col * (1 - 0.22 * groove)
    ring = np.clip((dist - 0.90 * r) / (0.10 * r), 0, 1)[..., None]
    col = col * (1 - 0.85 * ring) + rim * 0.85 * ring
    alpha = np.clip(r - dist + 0.5, 0, 1) * 255
    rgba = np.dstack([col.clip(0, 255), alpha]).astype(np.uint8)
    canvas.alpha_composite(Image.fromarray(rgba, "RGBA"), (x0, y0))


# --------------------------------------------------------------------------- Icons

def render(kind: str, out_size: int, layout: str = LAYOUT) -> Image.Image:
    """kind: 'any' (abgerundet, transparent), 'full' (vollflächig, Apple), 'maskable' (Filz + Brett in
    der Sicherheitszone)."""
    S = out_size * SS
    panel, frame = load_wood("light"), load_wood("frame")
    stones = LAYOUTS[layout]
    if kind == "any":
        m = 0.02 * S
        box = (m, m, S - m, S - m)
        canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        lay = board(S, box, 0.17 * S, 0.075 * S, panel, frame, stones)
    elif kind == "full":
        # iOS rundet mit ~22 % Radius ab; breiterer Rahmen, damit er an den Ecken sichtbar bleibt
        box = (0, 0, S, S)
        canvas = Image.new("RGBA", (S, S), (0, 0, 0, 255))
        lay = board(S, box, 0, 0.095 * S, panel, frame, stones)
    elif kind == "maskable":
        # Brett 60 % breit, Eckradius 6 %: weitester Punkt 0.24*sqrt(2)+0.06 = 0.399 < 0.40 (Sicherheitszone)
        side, rad = 0.60 * S, 0.06 * S
        o = (S - side) / 2
        box = (o, o, o + side, o + side)
        canvas = felt(S)
        lay = board(S, box, rad, 0.075 * side, panel, frame, stones, shadow_on=canvas)
    else:
        raise ValueError(kind)
    canvas.alpha_composite(lay)
    img = canvas.resize((out_size, out_size), Image.Resampling.LANCZOS)
    return img if kind == "any" else img.convert("RGB")


TARGETS = [
    ("icon-512.png", "any", 512),
    ("icon-192.png", "any", 192),
    ("icon-maskable-512.png", "maskable", 512),
    ("apple-touch-icon.png", "full", 180),
    ("favicon-64.png", "any", 64),
]


def save_png(img: Image.Image, path: Path) -> None:
    img.save(path, "PNG", optimize=True)


def preview_sheet(layouts: list[str]) -> Path:
    """Alle Layouts in 512/192/64/48/32 px nebeneinander, dazu maskable mit Kreis-Maske."""
    f = ImageFont.load_default(size=18)
    rows = []
    for lay in layouts:
        big = render("any", 512, lay)
        sm = [render("any", s, lay) for s in (192, 64, 48, 32)]
        mk = render("maskable", 512, lay).resize((256, 256), Image.Resampling.LANCZOS)
        circ = Image.new("L", (256, 256), 0)
        ImageDraw.Draw(circ).ellipse((0, 0, 255, 255), fill=255)
        mk_c = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
        mk_c.paste(mk, (0, 0), circ)
        mk48 = render("maskable", 512, lay).resize((48, 48), Image.Resampling.LANCZOS)
        row = Image.new("RGBA", (512 + 192 + 64 + 48 + 32 + 256 + 48 + 8 * 20, 540), (236, 236, 236, 255))
        x = 0
        for im in [big] + sm + [mk_c, mk48]:
            row.alpha_composite(im.convert("RGBA"), (x, 20))
            x += im.width + 20
        ImageDraw.Draw(row).text((4, 0), f"Layout {lay}", fill="black", font=f)
        rows.append(row)
    sheet = Image.new("RGBA", (rows[0].width, sum(r.height for r in rows)), "white")
    y = 0
    for r in rows:
        sheet.alpha_composite(r, (0, y))
        y += r.height
    PREVIEW.mkdir(parents=True, exist_ok=True)
    dest = PREVIEW / f"icons_sheet_{''.join(layouts)}.png"
    sheet.convert("RGB").save(dest)
    return dest


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preview", nargs="*", metavar="LAYOUT",
                    help="Kontaktbogen für Layouts (Standard: das gewählte) in assets_src/preview/")
    args = ap.parse_args()

    if args.preview is not None:
        print(preview_sheet(args.preview or [LAYOUT]))
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    for name, kind, size in TARGETS:
        img = render(kind, size)
        save_png(img, OUT / name)
        print(f"{name:24s} {size}x{size} {img.mode:4s} {(OUT / name).stat().st_size / 1024:6.1f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())

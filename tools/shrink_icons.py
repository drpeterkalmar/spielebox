#!/usr/bin/env python3
"""App-Icons verkleinern (Technik n9, Audit #7): PNG als Palettenbild, nur mit Pillow – oxipng/pngquant sind auf dem
Mac nicht installiert. Ziel: icon-512 und icon-maskable-512 unter 60 KB (TARGET), ohne dass das Icon sichtbar leidet
(PSNR ≥ MIN_DB gegen das Original, vormultipliziert). Probiert werden absteigende Farbzahlen; genommen wird die
beste Stufe unter TARGET, sonst die kleinste, die MIN_DB hält. Hält keine die Schwelle, bleibt die Datei unverändert.

Aufruf:  python3 tools/shrink_icons.py [--check] [Dateien …]   (Standard: alle PNG in icons/)
         --check: nur berichten, nichts schreiben
Auch von tools/make_icons.py benutzt (save_png → shrink).
"""
from __future__ import annotations

import io
import math
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MIN_DB = 37.5      # darunter gilt das Icon als sichtbar verändert (gemessen 07.10.: icon-512 37,7 dB, Holzmaserung)
TARGET = 60 * 1024
COLORS = (256, 192, 128, 96, 80, 64)


def psnr(a: Image.Image, b: Image.Image) -> float:
    """PSNR (dB) zweier gleich großer Bilder, RGB vormultipliziert mit Alpha, Alpha als vierter Kanal."""
    a, b = a.convert("RGBA"), b.convert("RGBA")
    if a.size != b.size:
        raise ValueError("ungleiche Größe")
    pa, pb = a.tobytes(), b.tobytes()
    se = 0.0
    for i in range(0, len(pa), 4):
        aa, ba = pa[i + 3], pb[i + 3]
        for k in range(3):
            d = (pa[i + k] * aa - pb[i + k] * ba) / 255
            se += d * d
        d = aa - ba
        se += d * d
    mse = se / len(pa)
    return math.inf if mse == 0 else 10 * math.log10(255 * 255 / mse)


def quantize(img: Image.Image, colors: int = 256) -> Image.Image:
    """Palettenbild mit Fehlerstreuung. RGBA: Fast-Octree (behält Alpha in der Palette), RGB: Median-Cut."""
    if img.mode == "RGBA":
        return img.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
    return img.convert("RGB").quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)


def candidates(img: Image.Image):
    """(Bytes, dB, Farben) je Farbzahl, nur Stufen, die MIN_DB halten"""
    out = []
    for n in COLORS:
        q = quantize(img, n)
        db = psnr(img, q)
        if db >= MIN_DB:
            out.append((png_bytes(q), db, n))
    return out


def png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def pick(cands, orig_len: int):
    """beste Stufe unter TARGET (höchstes dB), sonst die kleinste; None, wenn nichts kleiner als das Original ist"""
    cands = [c for c in cands if len(c[0]) < orig_len]
    if not cands:
        return None
    under = [c for c in cands if len(c[0]) <= TARGET]
    return max(under, key=lambda c: c[1]) if under else min(cands, key=lambda c: len(c[0]))


def shrink(img: Image.Image) -> tuple[bytes, float, int]:
    """(PNG-Bytes, dB, Farben); ohne passende Stufe das Original verlustfrei optimiert (dB = inf, Farben = 0)"""
    orig = png_bytes(img)
    best = pick(candidates(img), len(orig))
    return best if best else (orig, math.inf, 0)


def main(argv: list[str]) -> int:
    check = "--check" in argv
    files = [Path(a) for a in argv if not a.startswith("--")] or sorted((ROOT / "icons").glob("*.png"))
    for f in files:
        img = Image.open(f)
        img.load()
        before = f.stat().st_size
        if img.mode == "P":
            print(f"{f.name:24s} P    {before / 1024:6.1f} KB  (schon Palettenbild – zuerst tools/make_icons.py)")
            continue
        data, db, n = shrink(img)
        tag = "unverändert" if db == math.inf else f"{n} Farben, {db:.1f} dB"
        print(f"{f.name:24s} {img.mode:4s} {before / 1024:6.1f} KB → {len(data) / 1024:6.1f} KB  ({tag})")
        if not check and len(data) < before:
            f.write_bytes(data)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

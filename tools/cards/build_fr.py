#!/usr/bin/env python3
"""Franzoesische Karten (Byron Knoll, Vector Playing Cards, Public Domain)
aus github.com/notpeter/Vector-Playing-Cards -> WebP 240 px / 480 px.

Aufruf:  tools/cards/.venv/bin/python tools/cards/build_fr.py
Ausgabe: assets/cards/fr/<Rang><Farbe>.webp und ...@2x.webp
         Rang A 2..9 T J Q K, Farbe S H D C; Kontaktbogen tools/cards/kontakt_fr.png
"""
import io, tarfile, urllib.request
from pathlib import Path
import cairosvg
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
RAW = HERE / "raw" / "vpc"
OUT = ROOT / "assets" / "cards" / "fr"
# fester Stand (Commit) fuer Reproduzierbarkeit
SHA = "72cb5b288ed61251ef344e369446687cd51281a4"
URL = f"https://codeload.github.com/notpeter/Vector-Playing-Cards/tar.gz/{SHA}"
RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"]
SUITS = ["S", "H", "D", "C"]


def download():
    svgdir = RAW / "cards-svg"
    if svgdir.exists() and len(list(svgdir.glob("*.svg"))) >= 52:
        return svgdir
    data = urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "Spielebox/1.0"})).read()
    with tarfile.open(fileobj=io.BytesIO(data)) as tf:
        for m in tf.getmembers():
            parts = m.name.split("/", 1)
            if len(parts) == 2 and parts[1] and m.isfile():
                dst = RAW / parts[1]
                dst.parent.mkdir(parents=True, exist_ok=True)
                dst.write_bytes(tf.extractfile(m).read())
    return svgdir


def render(svg, width):
    png = cairosvg.svg2png(url=str(svg), output_width=width)
    return Image.open(io.BytesIO(png)).convert("RGBA")


def save(im, path, maxkb):
    for q in (86, 82, 78, 72, 66, 60):
        im.save(path, "WEBP", quality=q, alpha_quality=90, method=6)
        if path.stat().st_size <= maxkb * 1024:
            break
    return q


def main():
    svgdir = download()
    OUT.mkdir(parents=True, exist_ok=True)
    thumbs = {}
    for s in SUITS:
        for r in RANKS:
            src = svgdir / f"{'10' if r == 'T' else r}{s}.svg"
            name = r + s
            big = render(src, 480)
            small = render(src, 240)
            q2 = save(big, OUT / f"{name}@2x.webp", 40)
            q1 = save(small, OUT / f"{name}.webp", 16)
            thumbs[name] = small
            print(name, small.size, big.size, q1, q2,
                  (OUT / f"{name}.webp").stat().st_size // 1024, "KB /",
                  (OUT / f"{name}@2x.webp").stat().st_size // 1024, "KB")
    contact(thumbs)


def contact(thumbs):
    cw = 120
    sample = next(iter(thumbs.values()))
    ch = round(sample.height * cw / sample.width)
    pad, lab = 8, 18
    sheet = Image.new("RGB", (pad + 13 * (cw + pad), pad + 4 * (ch + lab + pad)), (40, 90, 60))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)
    except OSError:
        font = ImageFont.load_default()
    for i, s in enumerate(SUITS):
        for j, r in enumerate(RANKS):
            im = thumbs[r + s].resize((cw, ch), Image.LANCZOS)
            x, y = pad + j * (cw + pad), pad + i * (ch + lab + pad)
            d.text((x, y), r + s, fill=(255, 255, 255), font=font)
            sheet.paste(im, (x, y + lab), im)
    sheet.save(HERE / "kontakt_fr.png")
    print("Kontaktbogen", HERE / "kontakt_fr.png")


if __name__ == "__main__":
    main()

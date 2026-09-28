#!/usr/bin/env python3
"""Holztexturen von Poly Haven (alle Assets CC0) laden und web-tauglich aufbereiten.

Aufruf aus dem Projektordner:

    python3 tools/fetch_textures.py                 # laden (falls nötig), aufbereiten, SOURCES.json
    python3 tools/fetch_textures.py --refresh       # API-Antworten neu holen (Downloads nur bei md5-Änderung)
    python3 tools/fetch_textures.py --preview ID…   # Kandidaten ansehen: Kontaktbogen in assets_src/preview/

Idempotent: API-Antworten und Rohdownloads liegen gecacht in assets_src/ (per .gitignore
ausgeschlossen, md5-geprüft gegen https://api.polyhaven.com/files/<id>); die Ausgaben in
assets/wood/ werden bei jedem Lauf deterministisch neu erzeugt.

Ausgabe:
    assets/wood/{light,dark,frame}.jpg   (q80, progressiv, ohne Metadaten)
    assets/wood/{light,dark,frame}.webp  (q78)
    assets/wood/SOURCES.json             (Herkunft, Autor, Lizenz, Bearbeitung je Datei)
    assets_src/preview/tilecheck_*.jpg   (2x2-Kachelprobe zur Sichtkontrolle der Nähte)
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import http.client
import io
import json
import random
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "assets_src"            # Rohdownloads + API-Cache (nicht im Repo)
API_CACHE = SRC_DIR / "api"
PREVIEW_DIR = SRC_DIR / "preview"
OUT_DIR = ROOT / "assets" / "wood"

API = "https://api.polyhaven.com"
USER_AGENT = "spielebox-asset-fetch (drpeterkalmar)"
LICENSE = "CC0 1.0"
LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/"
LICENSE_NOTE = "Poly Haven stellt alle Assets unter CC0 bereit (https://polyhaven.com/license)."

SOURCE_RES = "2k"            # Poly-Haven-Auflösung der Diffuse-Map (2048 x 2048)
OUT_SIZES = (1024, 768)      # erste Größe, die das Budget einhält, gewinnt
JPG_QUALITY = 80
WEBP_QUALITY = 78
MAX_JPG_BYTES = 200 * 1024
WRAP_PAD = 64                # Rand (Quell-px), der zyklisch angesetzt wird -> Kachelbarkeit bleibt

# Auswahl nach Sichtung der Kandidaten (--preview) und einem Probe-Brett.
# Verworfen u. a.: american_walnut_veneer (grau statt nussbraun), grey_oak_veneer_01 (rosa-grau,
# stumpf), white_maple_veneer (sehr blass, helle Steine heben sich kaum ab).
# rotate: 90 = Maserung von senkrecht auf waagerecht drehen (alle drei Texturen laufen dann
# waagerecht). gamma > 1 hellt Mitteltöne auf, < 1 dunkelt ab; 1.0 = unverändert.
TEXTURES = [
    {
        "role": "light",
        "id": "silver_oak_veneer_01",
        "use": "Mühlebrett-Fläche, helle Damefelder",
        "rotate": 0, "gamma": 1.0, "contrast": 1.0, "saturation": 1.0,
    },
    {
        "role": "dark",
        "id": "walnut_veneer",
        "use": "dunkle Damefelder",
        "rotate": 90, "gamma": 0.85, "contrast": 1.0, "saturation": 1.0,
    },
    {
        "role": "frame",
        "id": "dark_wood",
        "use": "Brettrand/Rahmen",
        "rotate": 0, "gamma": 1.0, "contrast": 1.0, "saturation": 1.0,
        "note": "Oben/unten trifft die Maserung an der Kachelkante etwas hart aufeinander; "
                "wirkt wie eine Maserungslinie und fällt in schmalen Rahmenleisten nicht auf.",
    },
]


# --------------------------------------------------------------------------- Netz

def _retrying(fn, what: str, attempts: int = 5):
    """fn() bis zu `attempts`-mal ausführen, exponentielles Backoff (VPN/TLS-Aussetzer)."""
    for i in range(1, attempts + 1):
        try:
            return fn()
        except urllib.error.HTTPError as e:
            if e.code < 500 and e.code != 429:
                raise                    # 4xx: Wiederholen bringt nichts
            err = e
        except (urllib.error.URLError, http.client.HTTPException, ssl.SSLError,
                ConnectionError, TimeoutError, OSError, ValueError) as e:
            err = e
        if i == attempts:
            raise RuntimeError(f"{what}: nach {attempts} Versuchen fehlgeschlagen: {err}") from err
        wait = 2 ** i + random.uniform(0, 1)
        print(f"  ! {what}: {err} – neuer Versuch {i + 1}/{attempts} in {wait:.1f}s", file=sys.stderr)
        time.sleep(wait)


def http_get(url: str, timeout: float = 60) -> bytes:
    def once() -> bytes:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = r.read()
            length = r.headers.get("Content-Length")
            if length is not None and int(length) != len(data):
                raise ValueError(f"unvollständig ({len(data)}/{length} Bytes)")
            return data
    return _retrying(once, url)


def api_json(kind: str, asset_id: str, refresh: bool) -> dict:
    """/info/<id> bzw. /files/<id>, gecacht in assets_src/api/."""
    cache = API_CACHE / f"{kind}_{asset_id}.json"
    if cache.exists() and not refresh:
        return json.loads(cache.read_text("utf-8"))
    data = json.loads(http_get(f"{API}/{kind}/{asset_id}"))
    API_CACHE.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(data, indent=1, ensure_ascii=False), "utf-8")
    return data


def md5_of(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def download(url: str, dest: Path, md5: str) -> None:
    """Datei laden, sofern sie nicht schon mit passender md5 vorliegt."""
    if dest.exists() and md5_of(dest) == md5:
        print(f"  = {dest.relative_to(ROOT)} (Cache, md5 ok)")
        return

    def once() -> bytes:
        data = http_get(url, timeout=120)
        got = hashlib.md5(data).hexdigest()
        if got != md5:
            raise ValueError(f"md5 {got} != {md5}")
        return data

    data = _retrying(once, f"Download {dest.name}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    tmp.write_bytes(data)
    tmp.replace(dest)
    print(f"  + {dest.relative_to(ROOT)} ({len(data) / 1024:.0f} KB)")


def diffuse_entry(files: dict, res: str) -> dict:
    for key in ("Diffuse", "diffuse", "diff", "albedo", "Albedo", "Color"):
        if key in files:
            return files[key][res]["jpg"]
    raise KeyError(f"keine Diffuse-Map gefunden (Schlüssel: {sorted(files)})")


def fetch_diffuse(asset_id: str, res: str, refresh: bool, folder: Path) -> tuple[Path, dict]:
    entry = diffuse_entry(api_json("files", asset_id, refresh), res)
    dest = folder / Path(entry["url"]).name
    download(entry["url"], dest, entry["md5"])
    return dest, entry


# --------------------------------------------------------------------------- Bild

def to_float(img: Image.Image) -> np.ndarray:
    return np.asarray(img.convert("RGB"), dtype=np.float64) / 255.0


def to_image(a: np.ndarray) -> Image.Image:
    return Image.fromarray(np.clip(np.rint(a * 255.0), 0, 255).astype(np.uint8), "RGB")


def luminance(a: np.ndarray) -> np.ndarray:
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def hex_color(a: np.ndarray) -> str:
    r, g, b = (int(round(v * 255)) for v in a.reshape(-1, 3).mean(axis=0))
    return f"#{r:02x}{g:02x}{b:02x}"


def resize_tileable(img: Image.Image, size: int) -> Image.Image:
    """Quadratische, kachelbare Textur verkleinern, ohne die Naht zu zerstören:
    zyklisch (wrap-around) auffüllen, skalieren, Mitte ausschneiden. So sieht der
    Resampling-Filter am Rand dieselben Nachbarn wie beim Kacheln."""
    w, h = img.size
    assert w == h, "nur quadratische Texturen"
    scale = size / w
    pad = WRAP_PAD
    if abs(pad * scale - round(pad * scale)) > 1e-9:
        raise ValueError(f"Rand {pad}px * {scale} ist nicht ganzzahlig")
    a = np.asarray(img.convert("RGB"))
    a = np.pad(a, ((pad, pad), (pad, pad), (0, 0)), mode="wrap")
    big = Image.fromarray(a, "RGB")
    out_pad = int(round(pad * scale))
    big = big.resize((size + 2 * out_pad, size + 2 * out_pad), Image.Resampling.LANCZOS)
    return big.crop((out_pad, out_pad, out_pad + size, out_pad + size))


def adjust(a: np.ndarray, gamma: float, contrast: float, saturation: float) -> np.ndarray:
    if gamma != 1.0:
        a = np.power(a, 1.0 / gamma)
    if contrast != 1.0:
        m = luminance(a).mean()
        a = m + (a - m) * contrast
    if saturation != 1.0:
        lum = luminance(a)[..., None]
        a = lum + (a - lum) * saturation
    return np.clip(a, 0.0, 1.0)


def encode_jpg(img: Image.Image, quality: int) -> bytes:
    buf = io.BytesIO()
    # Keine exif/icc_profile-Parameter -> keine Metadaten im Ergebnis.
    img.save(buf, "JPEG", quality=quality, progressive=True, optimize=True, subsampling="4:2:0")
    return buf.getvalue()


def encode_webp(img: Image.Image, quality: int) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=quality, method=6)
    return buf.getvalue()


def seam_score(img: Image.Image) -> float:
    """Mittlerer Farbsprung an der Kachelnaht relativ zum Sprung zwischen Nachbarspalten/-zeilen
    im Inneren (~1.0 = Naht unsichtbar)."""
    a = np.asarray(img.convert("RGB"), dtype=np.float64)
    inner = (np.abs(np.diff(a, axis=1)).mean() + np.abs(np.diff(a, axis=0)).mean()) / 2
    seam = (np.abs(a[:, 0] - a[:, -1]).mean() + np.abs(a[0] - a[-1]).mean()) / 2
    return float(seam / inner) if inner else 0.0


def tile_preview(img: Image.Image, dest: Path) -> None:
    w, h = img.size
    sheet = Image.new("RGB", (2 * w, 2 * h))
    for x in (0, w):
        for y in (0, h):
            sheet.paste(img, (x, y))
    sheet.resize((1024, 1024), Image.Resampling.LANCZOS).save(dest, "JPEG", quality=85)


# --------------------------------------------------------------------------- Vorschau

def font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:                       # sehr alte Pillow-Versionen
        return ImageFont.load_default()


def preview(ids: list[str], refresh: bool) -> None:
    """1k-Diffuse der Kandidaten laden und als beschrifteten Kontaktbogen ablegen."""
    folder = PREVIEW_DIR / "candidates"
    cell, label_h, cols = 320, 34, 4
    tiles = []
    for asset_id in ids:
        print(f"* {asset_id}")
        path, _ = fetch_diffuse(asset_id, "1k", refresh, folder)
        img = Image.open(path).convert("RGB")
        a = to_float(img)
        tiles.append((asset_id, img.resize((cell, cell), Image.Resampling.LANCZOS),
                      hex_color(a), luminance(a).mean()))
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + label_h)), "white")
    draw = ImageDraw.Draw(sheet)
    f = font(15)
    for i, (asset_id, thumb, hx, lum) in enumerate(tiles):
        x, y = (i % cols) * cell, (i // cols) * (cell + label_h)
        sheet.paste(thumb, (x, y))
        draw.text((x + 4, y + cell + 2), asset_id, fill="black", font=f)
        draw.text((x + 4, y + cell + 17), f"{hx}  L={lum:.2f}", fill="#444", font=f)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    stamp = "_".join(ids)[:60]
    dest = PREVIEW_DIR / f"sheet_{hashlib.md5(stamp.encode()).hexdigest()[:8]}.jpg"
    sheet.save(dest, "JPEG", quality=88)
    print(f"Kontaktbogen: {dest}")


# --------------------------------------------------------------------------- Hauptlauf

def process(spec: dict, refresh: bool) -> list[dict]:
    asset_id, role = spec["id"], spec["role"]
    print(f"* {role}: {asset_id}")
    info = api_json("info", asset_id, refresh)
    if info.get("type") != 1:
        raise ValueError(f"{asset_id} ist keine Textur (type={info.get('type')})")
    src_path, src_entry = fetch_diffuse(asset_id, SOURCE_RES, refresh, SRC_DIR / asset_id)

    src = Image.open(src_path).convert("RGB")
    src_w, src_h = src.size
    if src_w != src_h:
        raise ValueError(f"{asset_id}: nicht quadratisch ({src_w}x{src_h}) – bitte gesondert behandeln")
    rot = spec.get("rotate", 0) % 360
    if rot:
        # Drehung um Vielfache von 90 Grad ist verlustfrei und erhält die Kachelbarkeit.
        src = src.transpose({90: Image.Transpose.ROTATE_90, 180: Image.Transpose.ROTATE_180,
                             270: Image.Transpose.ROTATE_270}[rot])
    src_seam = seam_score(src)

    g, c, s = spec["gamma"], spec["contrast"], spec["saturation"]
    chosen = None
    for size in OUT_SIZES:
        img = resize_tileable(src, size)
        img = to_image(adjust(to_float(img), g, c, s))
        jpg = encode_jpg(img, JPG_QUALITY)
        chosen = (size, img, jpg)
        if len(jpg) <= MAX_JPG_BYTES:
            break
    size, img, jpg = chosen
    if len(jpg) > MAX_JPG_BYTES:
        print(f"  ! {role}.jpg bleibt über dem Budget: {len(jpg) / 1024:.0f} KB", file=sys.stderr)
    webp = encode_webp(img, WEBP_QUALITY)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    files = {"jpg": jpg, "webp": webp}
    for ext, data in files.items():
        (OUT_DIR / f"{role}.{ext}").write_bytes(data)

    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    tile_preview(img, PREVIEW_DIR / f"tilecheck_{role}.jpg")

    a = to_float(img)
    mean_hex, lum = hex_color(a), float(luminance(a).mean())
    out_seam = seam_score(img)

    tweaks = []
    if rot:
        tweaks.append(f"um {rot} Grad gedreht (Maserung waagerecht)")
    if g != 1.0:
        tweaks.append(f"Gamma {g:.2f} ({'Mitteltöne heller' if g > 1 else 'Mitteltöne dunkler'})")
    if c != 1.0:
        tweaks.append(f"Kontrast x{c:.2f}")
    if s != 1.0:
        tweaks.append(f"Sättigung x{s:.2f}")
    tone = ", ".join(tweaks) if tweaks else "Farbe/Helligkeit unverändert"
    base = (f"Diffuse-Map {SOURCE_RES} ({src_w}x{src_h} px, quadratisch, nahtlos kachelbar) "
            f"auf {size}x{size} px verkleinert (Lanczos mit zyklischem Rand, kein Beschnitt – "
            f"bleibt kachelbar); {tone}")
    downloaded = dt.date.fromtimestamp(src_path.stat().st_mtime).isoformat()

    entries = []
    for ext, data in files.items():
        enc = (f"JPG q{JPG_QUALITY}, progressiv, optimiert, 4:2:0, ohne Metadaten" if ext == "jpg"
               else f"WebP q{WEBP_QUALITY} (lossy, method 6), ohne Metadaten")
        entries.append({
            "file": f"assets/wood/{role}.{ext}",
            "role": role,
            "use": spec["use"],
            "polyhavenId": asset_id,
            "name": info["name"],
            "authors": list(info.get("authors", {})),
            "license": LICENSE,
            "licenseUrl": LICENSE_URL,
            "url": f"https://polyhaven.com/a/{asset_id}",
            "apiInfo": f"{API}/info/{asset_id}",
            "sourceFile": src_entry["url"],
            "sourceMd5": src_entry["md5"],
            "downloaded": downloaded,
            "processing": f"{base}; {enc}.",
            "width": size,
            "height": size,
            "bytes": len(data),
            "tileable": True,
            "meanColor": mean_hex,
            **({"note": spec["note"]} if spec.get("note") else {}),
        })
    kb = {ext: f"{len(d) / 1024:.0f} KB" for ext, d in files.items()}
    print(f"  -> {size}px  jpg {kb['jpg']}  webp {kb['webp']}  Mittel {mean_hex}  L={lum:.2f}  "
          f"Naht {src_seam:.2f}->{out_seam:.2f}")
    return entries


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="API-Antworten neu laden statt Cache")
    ap.add_argument("--preview", nargs="+", metavar="ID", help="Kandidaten-Kontaktbogen erzeugen")
    args = ap.parse_args()

    if args.preview:
        preview(args.preview, args.refresh)
        return 0

    entries = []
    for spec in TEXTURES:
        entries += process(spec, args.refresh)
    # Schlichte Liste, ein Eintrag pro Datei (jpg + webp je Rolle).
    (OUT_DIR / "SOURCES.json").write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n", "utf-8")
    print(f"SOURCES.json: {len(entries)} Einträge")
    return 0


if __name__ == "__main__":
    sys.exit(main())

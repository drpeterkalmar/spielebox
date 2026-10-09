#!/usr/bin/env python3
"""Licht-Ebene für Holz und Filz vorbacken (Technik n9, Audit #5): eine Graustufen-Textur, die per
mix-blend-mode: soft-light über Spielfläche bzw. Filz liegt (50 % Grau = neutral). Sie vereint drei Dinge, die sonst
mehrere Verläufe bräuchten – und wird im Browser nur einmal gerastert (statische Deko-Ebene):
  1. Licht von links oben (sanfter Abfall nach rechts unten)
  2. Vignette (Ränder dunkler, elliptisch – passt sich per Streckung jeder Fläche an)
  3. Mikro-Normalen: feine Unebenheit (Höhenfeld aus weichgezeichnetem Rauschen, mit Licht von links oben schattiert)
Ausgabe: assets/wood/light-overlay.webp (512 × 512). Deterministisch (fester Seed). Nur Pillow + numpy.

Aufruf: python3 tools/bake_material.py [--preview]   (--preview: zusätzlich assets_src/preview/light-overlay.png)
Stärken (STRENGTH) sind Startwerte – abstimmen nur am Bild (A/B mit ?material=0|1).
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "wood" / "light-overlay.webp"
N = 512
SEED = 9
# Grauwert-Abweichung von 128 bei voller Wirkung. Abgestimmt am Bild (09.10., A/B-Collagen tests/shots/technik/mat_*):
# die Ebene liegt ZUSÄTZLICH über der bisherigen Randabdunklung (dk-vig/dk-feltvig) – allein wirkte sie flach und hell.
# Darum hier nur eine leichte zusätzliche Vignette, dafür deutlicheres Licht von links oben und feine Struktur.
STRENGTH = {"light": 30.0, "vignette": 14.0, "micro": 11.0}
LIGHT_DIR = np.array([-0.62, -0.78])   # Licht kommt von links oben (Bildkoordinaten: x nach rechts, y nach unten)


def light_falloff(n: int = N) -> np.ndarray:
    """-1 … +1: hell links oben, dunkel rechts unten (weich, linear entlang der Lichtrichtung)"""
    y, x = np.mgrid[0:n, 0:n] / (n - 1) - 0.5
    d = x * LIGHT_DIR[0] + y * LIGHT_DIR[1]           # +0,7 links oben … -0,7 rechts unten (LIGHT_DIR zeigt zum Licht)
    return np.clip(d / 0.7, -1, 1)


def vignette(n: int = N, inner: float = 0.55, outer: float = 1.0) -> np.ndarray:
    """0 (Mitte) … 1 (Ecke): elliptischer Abstand, weicher Übergang (smoothstep) zwischen inner und outer"""
    y, x = np.mgrid[0:n, 0:n] / (n - 1) * 2 - 1
    r = np.sqrt(x * x + y * y) / np.sqrt(2) * 1.25
    t = np.clip((r - inner) / (outer - inner), 0, 1)
    return t * t * (3 - 2 * t)


def micro_normals(n: int = N, seed: int = SEED) -> np.ndarray:
    """-1 … +1: Schattierung eines feinen Höhenfelds (zwei Oktaven), Licht von links oben; nahtlos kachelbar"""
    rng = np.random.default_rng(seed)
    h = np.zeros((n, n))
    for sigma, amp in ((1.6, 0.6), (5.0, 1.0)):
        noise = rng.random((n, n)).astype(np.float32)
        img = Image.fromarray((noise * 255).astype(np.uint8))
        # nahtlos: dreifach gekachelt weichzeichnen, Mitte nehmen
        big = Image.new("L", (3 * n, 3 * n))
        for i in range(3):
            for j in range(3):
                big.paste(img, (i * n, j * n))
        blur = np.asarray(big.filter(ImageFilter.GaussianBlur(sigma)), dtype=np.float64)[n:2 * n, n:2 * n] / 255
        h += amp * (blur - blur.mean()) / (blur.std() + 1e-9)
    gx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) / 2
    gy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) / 2
    shade = -(gx * LIGHT_DIR[0] + gy * LIGHT_DIR[1])
    return np.clip(shade / (3 * shade.std() + 1e-9), -1, 1)


def bake(strength: dict = STRENGTH, n: int = N) -> Image.Image:
    v = (128 + strength["light"] * light_falloff(n) - strength["vignette"] * vignette(n)
         + strength["micro"] * micro_normals(n))
    g = np.clip(np.round(v), 0, 255).astype(np.uint8)
    return Image.fromarray(g, "L").convert("RGB")


def main(argv: list[str]) -> int:
    img = bake()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "WEBP", quality=80, method=6)
    print(f"{OUT.relative_to(ROOT)}  {N}×{N}  {OUT.stat().st_size / 1024:.1f} KB  Mittel {np.asarray(img).mean():.1f} (128 = neutral)")
    if "--preview" in argv:
        prev = ROOT / "assets_src" / "preview" / "light-overlay.png"
        prev.parent.mkdir(parents=True, exist_ok=True)
        img.save(prev)
        print(prev)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

# Licht-Ebene (n9 E2, tools/bake_material.py): Richtung, Vignette, Mikro-Normalen, Datei – ohne Browser.
# Aufruf: python3 -m unittest tests/test_bake_material.py
import os
import sys
import unittest

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import bake_material as B  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class BakeMaterial(unittest.TestCase):
    def test_licht_links_oben(self):
        l = B.light_falloff(64)
        self.assertGreater(l[0, 0], 0.9)
        self.assertLess(l[-1, -1], -0.9)
        self.assertAlmostEqual(float(l[32, 32]), 0, delta=0.05)

    def test_vignette(self):
        v = B.vignette(64)
        self.assertEqual(float(v[32, 32]), 0.0)
        self.assertGreater(v[0, 0], 0.9)
        self.assertTrue((v >= 0).all() and (v <= 1).all())

    def test_mikro_normalen_nahtlos_und_mittelwertfrei(self):
        m = B.micro_normals(64, seed=3)
        self.assertLess(abs(float(m.mean())), 0.05)
        self.assertTrue((m >= -1).all() and (m <= 1).all())
        # nahtlos: Sprung über die Kante nicht größer als im Inneren
        inner = np.abs(np.diff(m, axis=1)).mean()
        edge = np.abs(m[:, 0] - m[:, -1]).mean()
        self.assertLess(edge, inner * 2)

    def test_bake_deterministisch(self):
        a, b = B.bake(n=64), B.bake(n=64)
        self.assertEqual(a.tobytes(), b.tobytes())

    def test_datei(self):
        p = os.path.join(ROOT, 'assets', 'wood', 'light-overlay.webp')
        im = Image.open(p)
        self.assertEqual(im.size, (B.N, B.N))
        self.assertLess(os.path.getsize(p), 40 * 1024)


if __name__ == '__main__':
    unittest.main()

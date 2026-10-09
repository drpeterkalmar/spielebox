# Icons verkleinern (n9, Audit #7): PSNR, Stufenwahl, Ergebnis unter 60 KB. Ohne Browser.
# Aufruf: python3 -m unittest tests/test_shrink_icons.py
import math
import os
import sys
import unittest

from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
import shrink_icons as S  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class ShrinkIcons(unittest.TestCase):
    def test_psnr(self):
        a = Image.new('RGBA', (4, 4), (100, 100, 100, 255))
        self.assertEqual(S.psnr(a, a.copy()), math.inf)
        # Farbe unsichtbarer Pixel zählt nicht
        t1, t2 = Image.new('RGBA', (2, 2), (0, 0, 0, 0)), Image.new('RGBA', (2, 2), (255, 0, 0, 0))
        self.assertEqual(S.psnr(t1, t2), math.inf)
        b = Image.new('RGBA', (4, 4), (110, 100, 100, 255))
        self.assertTrue(30 < S.psnr(a, b) < 40)

    def test_pick(self):
        big, small = b'x' * (70 * 1024), b'x' * (50 * 1024)
        # unter dem Ziel: die beste Qualität; keine unter dem Ziel: die kleinste
        self.assertEqual(S.pick([(big, 45, 256), (small, 39, 64), (b'x' * 55 * 1024, 41, 96)], 200 * 1024)[2], 96)
        self.assertEqual(S.pick([(big, 45, 256), (b'x' * 65 * 1024, 39, 64)], 200 * 1024)[2], 64)
        self.assertIsNone(S.pick([(big, 45, 256)], 60 * 1024))

    def test_glatte_flaeche_bleibt_gleich(self):
        im = Image.new('RGB', (64, 64), (200, 120, 40))
        data, db, n = S.shrink(im)
        self.assertTrue(db >= S.MIN_DB)

    def test_icons_klein(self):
        for name in ('icon-512.png', 'icon-maskable-512.png'):
            p = os.path.join(ROOT, 'icons', name)
            self.assertLess(os.path.getsize(p), 60 * 1024, name)
            im = Image.open(p)
            self.assertEqual(im.size, (512, 512), name)


if __name__ == '__main__':
    unittest.main()

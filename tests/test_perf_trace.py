# deko_perf.py (n9): Auswertung eines CDP-Traces und der sw.js-Listen – ohne Browser.
# Aufruf: python3 -m unittest tests/test_perf_trace.py
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
import deko_perf as D  # noqa: E402


class TraceSummary(unittest.TestCase):
    def test_zaehlt_und_findet_nicht_beschleunigte_animationen(self):
        ev = [
            {'name': 'Layout', 'ph': 'X', 'dur': 1500, 'args': {'beginData': {'stackTrace': [{'functionName': 'tick', 'url': 'http://x/src/ui/fx.js', 'lineNumber': 120}]}}},
            {'name': 'Layout', 'ph': 'X', 'dur': 500, 'args': {'beginData': {}}},
            {'name': 'Paint', 'ph': 'X', 'dur': 2000},
            {'name': 'Paint', 'ph': 'B'},   # nur vollständige Ereignisse zählen
            {'name': 'Animation', 'ph': 'n', 'args': {'data': {'compositeFailed': 8192, 'unsupportedProperties': ['stroke-width'], 'name': 'take'}}},
            {'name': 'Animation', 'ph': 'n', 'args': {'data': {'compositeFailed': 0}}},
        ]
        s = D.trace_summary(ev)
        self.assertEqual(s['main']['Layout']['count'], 2)
        self.assertEqual(s['main']['Layout']['ms'], 2.0)
        self.assertEqual(s['main']['Paint']['count'], 1)
        self.assertIn('tick@fx.js:120', next(iter(s['layout_sources'])))
        self.assertEqual(list(s['not_composited']), ['take: stroke-width (Code 8192)'])

    def test_sw_listen(self):
        sw = "const CORE_FILES = [\n  'index.html',\n  'src/app.js'\n];\nconst PRE = [\n  'assets/cards/atlas/de-a@2x.webp'\n];"
        self.assertEqual(D.sw_list(sw, 'CORE_FILES'), ['index.html', 'src/app.js'])
        self.assertEqual(D.sw_list(sw, 'PRE'), ['assets/cards/atlas/de-a@2x.webp'])
        self.assertEqual(D.sw_list(sw, 'ASSETS'), [])

    def test_szenen(self):
        names = [s[0] for s in D.SCENES]
        for n in ('lobby_idle', 'schnapsen_anim', 'halma_anim', 'vier_sieg'):
            self.assertIn(n, names)


if __name__ == '__main__':
    unittest.main()

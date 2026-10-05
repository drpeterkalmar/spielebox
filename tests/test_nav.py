# Navigation (Gutachten P2-8): schnelle Wechsel laufen nacheinander (nie zwei lebende Tisch-Sitzungen), ein Fehler
# beim Öffnen zeigt „Konnte nicht öffnen: …“ und führt zurück zur Lobby (keine unbehandelte Ausnahme).
# Aufruf: python3 tests/test_nav.py
import sys, time
sys.path.insert(0, 'tests')
from util import *

c = Checker()
with Server() as srv, sync_playwright() as pw:
    br = launch(pw)
    P = Page(br, srv.base, 'hoch').open()
    # 1) drei Wechsel ohne Warten: Solo Mühle → Lobby → Solo Dame
    P.ev("() => { __box.local('bot', 'muehle'); __box.lobby(); __box.local('bot', 'dame'); }")
    time.sleep(1.5)
    st = P.state()
    c.ok(st['screen'] == 'table' and st['table'] and st['table']['game'] == 'dame', f"am Ende Dame-Tisch ({st['screen']}, {st['table'] and st['table']['game']})")
    live = P.ev("() => __box.liveSessions()")
    c.ok(live == 1, f'genau eine lebende Tisch-Sitzung ({live})')
    # 2) Fehler beim Öffnen eines Online-Tisches (Hash mit 3 Wörtern, Krypto kaputt)
    P.ev("() => __box.lobby()")
    time.sleep(0.5)
    words = P.ev("async () => { const m = await import('./src/words.js'); return m.formatWords(m.randomWords(3)); }")
    P.ev("() => { crypto.subtle.digest = () => Promise.reject(new Error('Krypto kaputt')); }")
    P.ev("(w) => { location.hash = w; }", words)
    time.sleep(1.5)
    toasts = P.ev("() => [...document.querySelectorAll('.toasts *')].map((e) => e.textContent).join(' | ')")
    c.ok('Konnte nicht öffnen' in (toasts or ''), f'Toast „Konnte nicht öffnen“ ({toasts})')
    c.ok(P.state()['screen'] == 'lobby', 'zurück in der Lobby')
    errs = P.ev("() => __box.errors()")
    c.ok(not any('Krypto kaputt' in e for e in errs), f'keine unbehandelte Ausnahme ({errs})')
    c.ok(P.app_errors() == [], f'0 Seitenfehler {P.app_errors()}')
    P.close(); br.close()
print('\nNAVIGATION GRÜN' if not c.fails else f'\n{len(c.fails)} rot')
sys.exit(1 if c.fails else 0)

# Schnellcheck während der Entwicklung: Lobby laden, Solo-Mühle und Dame öffnen, Fehler + Screenshots.
import sys, time
sys.path.insert(0, 'tests')
from util import *
c = Checker()
with Server() as srv, sync_playwright() as pw:
    b = launch(pw)
    for dev in ['hoch', 'quer']:
        p = Page(b, srv.base, dev)
        p.open()
        p.ev("__box.setName('Peter')")
        time.sleep(0.5)
        p.shot(f'q_lobby_{dev}')
        p.ev("__box.local('bot', 'muehle', {}, 'weiss', 1)")
        time.sleep(0.8)
        p.tap_target(0)
        time.sleep(1.5)
        p.shot(f'q_muehle_{dev}')
        print(dev, p.state()['table'], p.board_check())
        p.ev("__box.local('hotseat', 'dame', {rules:'international'})")
        time.sleep(0.8)
        p.shot(f'q_dame10_{dev}')
        print(dev, p.board_check())
        c.ok(p.app_errors() == [], f'{dev}: 0 Fehler {p.app_errors()[:5]}')
        p.close()
    b.close()

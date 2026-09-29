# GATE Netz-E2E: zwei Browser-Kontexte (ein Browser) treten ECHT über die 3 Wörter und die öffentlichen
# Nostr-Relays bei und spielen eine Partie Mühle zu Ende; Zuschauer; Wiederaufnahme nach Reload (Gast und Host);
# dasselbe mit ?relay=1 (erzwungener Relay-Fallback, AES-GCM über Nostr).
# Aufruf: python3 tests/e2e_net.py [--nur-relay | --nur-direkt] [--url https://…/]
# Ergebnis: tests/out/e2e_net.json (Zeiten, Verbindungsart, Relay-Quote)
import sys, time, json, os, subprocess, argparse
sys.path.insert(0, 'tests')
from util import *

ap = argparse.ArgumentParser()
ap.add_argument('--nur-relay', action='store_true')
ap.add_argument('--nur-direkt', action='store_true')
ap.add_argument('--url', default=None)
ap.add_argument('--nur-fallback', type=int, default=0, help='nur das Auto-Fallback-Szenario N-mal (Diagnose)')
args = ap.parse_args()

c = Checker()
report = {'datum': time.strftime('%Y-%m-%d %H:%M'), 'szenarien': {}}
try:
    vpn = subprocess.run(['scutil', '--nc', 'list'], capture_output=True, text=True, timeout=10).stdout
    report['vpn'] = 'ProtonVPN verbunden' if ('Connected' in vpn and 'Proton' in vpn) else 'kein VPN erkannt'
except Exception as e:
    report['vpn'] = f'unbekannt ({e})'
print('VPN:', report['vpn'])


def wait(fn, timeout=60, what='Bedingung', step=0.1):
    t0 = time.time()
    while True:
        try:
            v = fn()
            if v: return v
        except Exception:
            pass
        if time.time() - t0 > timeout:
            raise TimeoutError('Zeitüberschreitung: ' + what)
        time.sleep(step)


def tbl(P):
    return P.state()['table']


def synced(pages):
    ts = [tbl(P) for P in pages]
    if not all(ts): return False
    return len(set((t['seq'], t['epoch'], t['nmoves']) for t in ts)) == 1 and not any(P.state()['pending'] for P in pages)


def open_table_ui(A, game_sel='[data-game="muehle"]'):
    """Host macht über die Oberfläche einen Online-Tisch auf; liefert die Wörter."""
    A.tap(game_sel)
    A.tap('[data-act="online"]')
    wait(lambda: A.state()['words'], 20, 'Wörter beim Host')
    A.pg.wait_for_selector('[data-overlay="wait"]', timeout=20000)
    return A.state()['words']


def type_words_ui(B, words):
    """Gast tippt die Wörter ein: Wort 1 halb + Vorschlag antippen, Wort 2 komplett, Wort 3 in anderer Schreibweise."""
    B.tap('#w0')
    target = words[2]                                     # Reihenfolge egal: mit dem dritten Wort anfangen
    B.pg.keyboard.type(target[:2], delay=40)
    for ch in target[2:]:
        time.sleep(0.12)
        if B.ev(f"!!document.querySelector('.chip[data-word=\"{target}\"]')"): break
        B.pg.keyboard.type(ch, delay=40)
    B.pg.wait_for_selector(f'.chip[data-word="{target}"]', timeout=5000)
    B.tap(f'.chip[data-word="{target}"]')
    B.pg.keyboard.type(words[0].capitalize(), delay=30)
    B.pg.keyboard.press('Enter')
    B.pg.keyboard.type(words[1].upper() + ' ', delay=30)
    wait(lambda: B.ev("!document.querySelector('[data-act=join]').disabled"), 5, 'Mitspielen aktiv')


def play_to_end(P0, P1, others=(), levels=(2, 1), taps=2, max_plies=600):
    """Spielt bis zum Ende; die ersten `taps` Züge je Seite per echtem Antippen. Liefert Latenzen (s)."""
    lat = []
    tapped = {0: 0, 1: 0}
    pages = [P0, P1] + list(others)
    for ply in range(max_plies):
        wait(lambda: synced(pages), 60, f'Gleichstand vor Halbzug {ply}')
        t = tbl(P0)
        if t['status'] == 'over':
            return lat
        mover = next(P for P in (P0, P1) if P.state()['mySeat'] == t['turn'])
        seat = t['turn']
        other = P1 if mover is P0 else P0
        n0 = t['nmoves']
        if tapped[seat] < taps:
            legal = mover.ev("__box.legal()")
            simple = [m for m in legal if 'remove' not in m and 'from' not in m]
            if simple:
                mover.tap_target(simple[0]['to'])
                tapped[seat] += 1
            else:
                mover.ev(f"__box.botMove({levels[seat]})")
        else:
            r = mover.ev(f"__box.botMove({levels[seat]})")
            if not r.get('ok'):
                raise RuntimeError('Zug abgelehnt: ' + json.dumps(r))
        t0 = time.time()
        wait(lambda: tbl(other)['nmoves'] > n0 or tbl(other)['status'] == 'over', 60, 'Gegenseite sieht Zug', step=0.01)
        lat.append(time.time() - t0)
    raise RuntimeError('Partie endet nicht')


def relay_summary(P):
    st = P.ev("__box.relayStats()")
    if not st: return None
    return [{k: r[k] for k in ('url', 'state', 'sent', 'ok', 'rejected', 'received', 'lastError')} for r in st['relays']]


def run(pw, srv_base, relay, name, rtc_all=True, full=True):
    # relay: ?relay=1 erzwingt den Fallback; rtc_all=False: Chrome darf nur die VPN-Route nutzen → Direktweg
    # scheitert wie bei ~10–20 % der echten Paare → automatischer Fallback; full=False: nur Beitritt + 6 Züge
    sc = {'relay': relay, 'rtc_alle_schnittstellen': rtc_all}
    b = launch(pw)
    q = '?nosw&relay=1' if relay else '?nosw'
    pages = []
    try:
        A = Page(b, srv_base, 'hoch', 'Host', rtc_all=rtc_all).open(q)
        B = Page(b, srv_base, 'hoch' if not relay else 'quer', 'Gast', rtc_all=rtc_all).open(q)
        pages += [A, B]
        A.ev("__box.setName('Peter')")
        # Gast gibt den Namen über die Oberfläche ein
        B.tap('#name'); B.pg.keyboard.type('Anna', delay=30)
        print(f'\n== {name}: Host öffnet Tisch')
        words = open_table_ui(A)
        print('   Wörter:', ' '.join(words))
        A.shot(f'e2e_{name}_host_woerter', 'dev')
        type_words_ui(B, words)
        B.shot(f'e2e_{name}_gast_eingabe', 'dev')
        t0 = time.time()
        B.tap('[data-act="join"]')
        wait(lambda: tbl(B) and tbl(B)['status'] == 'play' and tbl(A)['status'] == 'play', 120, 'Beitritt')
        sc['beitritt_s'] = round(time.time() - t0, 2)
        c.ok(True, f'{name}: Gast sitzt am Tisch nach {sc["beitritt_s"]} s')
        c.ok(sorted(B.state()['words']) == sorted(words), f'{name}: gleiche Wörter/Raum ({B.state()["roomId"][:12]}…)')
        net_a, net_b = A.state()['net'], B.state()['net']
        sc['verbindung'] = {'host': net_a['mode'], 'gast': net_b['mode']}
        if relay:
            c.ok(net_b['mode'] == 'relay' and not A.state()['link']['direct'], f'{name}: läuft über Relay (Host {net_a["mode"]}, Gast {net_b["mode"]})')
        elif rtc_all:
            wait(lambda: A.state()['net']['mode'] == 'direkt' and B.state()['net']['mode'] == 'direkt', 30, 'direkt')
            c.ok(True, f'{name}: direkt verbunden (WebRTC)')
        else:
            c.ok(net_b['mode'] == 'relay' and A.state()['link']['relayReason'], f'{name}: Direktweg scheitert → Relay-Fallback automatisch ({A.state()["link"]["relayReason"]} / {B.state()["link"]["relayReason"]})')
        if not full:
            n0 = tbl(A)['nmoves']
            for k in range(6):
                wait(lambda: synced([A, B]), 60, 'Gleichstand')
                mover = A if A.state()['mySeat'] == tbl(A)['turn'] else B
                n = tbl(A)['nmoves']
                t1 = time.time()
                mover.ev("__box.botMove(1)")
                wait(lambda: tbl(A)['nmoves'] == n + 1 and tbl(B)['nmoves'] == n + 1, 60, 'Zug angekommen')
                sc.setdefault('zug_s', []).append(round(time.time() - t1, 2))
            c.ok(tbl(B)['nmoves'] == n0 + 6, f'{name}: 6 Züge über den Fallback ({sc["zug_s"]} s)')
            errs = A.app_errors() + B.app_errors()
            sc['relay_verbindungsabbrueche'] = len(A.net_events()) + len(B.net_events())
            c.ok(errs == [], f'{name}: 0 App-Fehler {errs[:4]} (Relay-Verbindungsabbrüche: {sc["relay_verbindungsabbrueche"]})')
            report['szenarien'][name] = sc
            A.close(); B.close()
            return
        sc['link_host'] = A.state()['link']['stats']
        sc['link_gast'] = B.state()['link']['stats']
        # Zuschauer (nur im Direkt-Szenario, spart Speicher)
        W = None
        if not relay:
            W = Page(b, srv_base, 'quer', 'Zuschauer', rtc_all=rtc_all).open(q)
            W.ev("__box.setName('Oma')")
            W.ev(f"__box.join({json.dumps(words)}, 'watch')")
            wait(lambda: tbl(W) and tbl(W)['seq'] == tbl(A)['seq'], 60, 'Zuschauer bekommt Stand')
            c.ok(W.state()['mySeat'] is None, f'{name}: Zuschauer sitzt nicht, sieht aber den Tisch')
        # Partie zu Ende spielen
        t0 = time.time()
        others = (W,) if W else ()
        lat = play_to_end(A, B, others)
        sc['partie_s'] = round(time.time() - t0, 1)
        sc['link_nach_partie'] = {'host': A.state()['link']['stats'], 'gast': B.state()['link']['stats']}
        t = tbl(A)
        sc['halbzuege'] = t['nmoves']
        sc['ergebnis'] = t['result']
        sc['latenz_ms'] = {'median': round(sorted(lat)[len(lat) // 2] * 1000), 'max': round(max(lat) * 1000), 'n': len(lat)}
        wait(lambda: tbl(B)['status'] == 'over', 30, 'Ende beim Gast')
        c.ok(tbl(B)['result'] == t['result'] and tbl(B)['seq'] == t['seq'], f'{name}: Partie zu Ende gespielt ({t["nmoves"]} Halbzüge, {t["result"]["reason"]}), beide Stände gleich')
        c.ok(sc['latenz_ms']['max'] < 20000, f'{name}: Zug-Latenz Median {sc["latenz_ms"]["median"]} ms, max {sc["latenz_ms"]["max"]} ms')
        if W:
            wait(lambda: tbl(W)['seq'] == t['seq'], 30, 'Zuschauer synchron')
            c.ok(True, f'{name}: Zuschauer hat das Ende gesehen')
            W.shot(f'e2e_{name}_zuschauer_ende', 'dev')
            c.ok(W.app_errors() == [], f'{name}: Zuschauer 0 Fehler {W.app_errors()[:3]}')
            W.close()
        A.shot(f'e2e_{name}_host_ende', 'dev'); B.shot(f'e2e_{name}_gast_ende', 'dev')
        # Revanche und Wiederaufnahme
        B.tap('[data-act="rematch"]')
        wait(lambda: tbl(A)['round'] == 2 and tbl(A)['status'] == 'play' and tbl(B)['round'] == 2, 60, 'Revanche')
        c.ok(A.state()['mySeat'] == 1, f'{name}: Revanche mit getauschten Farben')
        for k in range(4):
            wait(lambda: synced([A, B]), 60, 'Gleichstand')
            mover = A if A.state()['mySeat'] == tbl(A)['turn'] else B
            n = tbl(A)['nmoves']
            mover.ev("__box.botMove(1)")
            wait(lambda: tbl(A)['nmoves'] == n + 1 and tbl(B)['nmoves'] == n + 1, 60, 'Zug angekommen')
        seq = tbl(A)['seq']
        # Gast lädt neu → setzt automatisch fort (Wörter im #-Teil, Stand in localStorage)
        t0 = time.time()
        B.pg.reload()
        B.pg.wait_for_function("window.__box && window.__box.ready", timeout=60000)
        wait(lambda: tbl(B) and tbl(B)['seq'] >= seq and B.state()['mySeat'] is not None, 90, 'Gast nach Reload')
        wait(lambda: B.state()['net']['mode'] in ('direkt', 'relay'), 90, 'Gast wieder verbunden')
        sc['reload_gast_s'] = round(time.time() - t0, 2)
        c.ok(True, f'{name}: Gast nach Reload wieder am Tisch in {sc["reload_gast_s"]} s ({B.state()["net"]["mode"]})')
        # weiterspielen nach Reload
        wait(lambda: synced([A, B]), 60, 'Gleichstand nach Reload')
        mover = A if A.state()['mySeat'] == tbl(A)['turn'] else B
        n = tbl(A)['nmoves']
        mover.ev("__box.botMove(1)")
        wait(lambda: tbl(A)['nmoves'] == n + 1 and tbl(B)['nmoves'] == n + 1, 60, 'Zug nach Gast-Reload')
        c.ok(True, f'{name}: Zug nach Gast-Reload kommt an')
        # Host lädt neu
        seq = tbl(B)['seq']
        t0 = time.time()
        A.pg.reload()
        A.pg.wait_for_function("window.__box && window.__box.ready", timeout=60000)
        wait(lambda: tbl(A) and A.state()['role'] == 'host' and tbl(A)['seq'] >= seq, 60, 'Host nach Reload')
        wait(lambda: A.state()['net']['mode'] in ('direkt', 'relay') and B.state()['net']['mode'] in ('direkt', 'relay'), 120, 'Host wieder verbunden')
        sc['reload_host_s'] = round(time.time() - t0, 2)
        wait(lambda: synced([A, B]), 60, 'Gleichstand nach Host-Reload')
        mover = A if A.state()['mySeat'] == tbl(A)['turn'] else B
        n = tbl(A)['nmoves']
        mover.ev("__box.botMove(1)")
        wait(lambda: tbl(A)['nmoves'] == n + 1 and tbl(B)['nmoves'] == n + 1, 60, 'Zug nach Host-Reload')
        c.ok(True, f'{name}: Host nach Reload wieder Schiedsrichter in {sc["reload_host_s"]} s, Partie geht weiter')
        # Host schließt den Tab → Gast sieht „getrennt“ und kann „Wiederverbinden“ antippen
        errs_a = A.app_errors()
        if not relay:
            A.close()
            t0 = time.time()
            wait(lambda: B.state()['net']['mode'] == 'getrennt', 60, 'Gast sieht getrennt')
            sc['getrennt_erkannt_s'] = round(time.time() - t0, 1)
            B.shot(f'e2e_{name}_gast_getrennt', 'dev')
            B.tap('[data-act="menu"]'); B.tap('[data-act="net"]'); B.tap('[data-act="reconnect"]')
            time.sleep(1.5)
            c.ok(B.pg.locator('.pill').inner_text().strip() in ('getrennt', 'wartet', 'über Relay'), f'{name}: Host weg → Gast zeigt „getrennt“ nach {sc["getrennt_erkannt_s"]} s, Wiederverbinden ohne Fehler')
            B.pg.keyboard.press('Escape')
        if relay:
            sc['relays_host'] = relay_summary(A)
            sc['relays_gast'] = relay_summary(B)
            rs = (sc['relays_host'] or []) + (sc['relays_gast'] or [])
            sent = sum(r['sent'] for r in rs); ok = sum(r['ok'] for r in rs)
            sc['relay_quote'] = f'{ok}/{sent} Events mit OK bestätigt'
            print('   Relay-Quote:', sc['relay_quote'])
        sc['zuege_gesendet_gast'] = B.state()['stats']
        sc['relay_verbindungsabbrueche'] = len(B.net_events()) + (0 if not relay else len(A.net_events()))
        errs = errs_a + B.app_errors()
        c.ok(errs == [], f'{name}: 0 Fehler in beiden Kontexten {errs[:4]}')
        A.close(); B.close()
    except Exception:
        # Diagnose: Verbindungsstand beider Seiten, Relay-Sockets, Netzprotokoll
        for P in pages:
            try:
                st = P.state()
                print(f'   [{P.name}] net={st["net"] and st["net"]["mode"]} link={json.dumps(st["link"], ensure_ascii=False)[:400]}')
                rs = P.ev("__box.relayStats()")
                if rs: print(f'   [{P.name}] relays ' + ', '.join(f"{r['url'][6:20]}:{r['state']}/{r['sent']}/{r['received']}/{(r['lastError'] or '')[:30]}" for r in rs['relays']))
                print(f'   [{P.name}] netlog ' + ' | '.join(P.ev("__box.netlog()")[-8:]))
                print(f'   [{P.name}] Netz-Ereignisse {len(P.net_events())}: ' + ' | '.join(e[:90] for e in P.net_events()[-3:]))
            except Exception as e2:
                print(f'   [{P.name}] Diagnose nicht möglich: {e2}')
        raise
    finally:
        b.close()
    report['szenarien'][name] = sc
    print('  ', json.dumps(sc, ensure_ascii=False)[:600])


def run_retry(pw, base, relay, name, tries=2, **kw):
    for k in range(tries):
        try:
            return run(pw, base, relay, name, **kw)
        except Exception as e:
            print(f'   ⚠️ {name} Versuch {k + 1} gescheitert: {e}', flush=True)
            report.setdefault('fehlversuche', []).append(f'{name}: {e}')
            if k == tries - 1:
                c.ok(False, f'{name}: {e}')


with Server() as srv, sync_playwright() as pw:
    base = args.url or srv.base
    t_all = time.time()
    if args.nur_fallback:
        for k in range(args.nur_fallback):
            run_retry(pw, base, False, f'auto-fallback-{k + 1}', tries=1, rtc_all=False, full=False)
    elif not args.nur_relay:
        run_retry(pw, base, False, 'direkt')
        run_retry(pw, base, False, 'auto-fallback', rtc_all=False, full=False)
    if not args.nur_direkt and not args.nur_fallback:
        run_retry(pw, base, True, 'relay')
    report['dauer_s'] = round(time.time() - t_all)

os.makedirs(os.path.join(ROOT, 'tests', 'out'), exist_ok=True)
json.dump(report, open(os.path.join(ROOT, 'tests', 'out', 'e2e_net.json'), 'w'), ensure_ascii=False, indent=1)
print('\nNETZ-E2E', 'GRÜN' if not c.fails else f'ROT ({len(c.fails)})', f'– {report.get("dauer_s")} s')
sys.exit(1 if c.fails else 0)

# Rauchtest n6 Schach-Trainer (Pixel 7 hoch/quer, Desktop) mit echten Taps: Lobby-Kachel, Eröffnung ansehen + lernen
# (mit absichtlichem Fehler → Hinweis) + gegen den Computer weiterspielen, Wiederholen, Taktik-Aufgabe (Fehlversuch →
# Hinweis, dann Lösung), Endspiel-Lektionen (Tabelle: Quadratregel als Weiß, Opposition halten als Schwarz; Bot: Tipp),
# Fortschritt + Zurücksetzen. Knöpfe ≥ 48 px, Brett ganz sichtbar, 0 Fehler. Screenshots → tests/shots/n6/.
# Aufruf: python3 tests/smoke_n6.py [--nur=hoch,quer,desktop] [--final]   (--final: ausgewählte Bilder nach tests/shots/final)
import sys, time, json
sys.path.insert(0, 'tests')
from util import *

c = Checker()
forms = ['hoch', 'quer', 'desktop']
final = '--final' in sys.argv
for a in sys.argv[1:]:
    if a.startswith('--nur='): forms = a.split('=', 1)[1].split(',')


def wait(fn, timeout=20, what='Bedingung'):
    t0 = time.time()
    while True:
        try:
            if fn(): return
        except Exception:
            pass
        if time.time() - t0 > timeout:
            raise TimeoutError(what)
        time.sleep(0.05)


def page(P):
    return P.ev("(() => { const t = __box.trainer(); const p = t && t.page(); return p ? JSON.parse(JSON.stringify(p)) : null; })()")


def status(P):
    return P.ev("(document.querySelector('.tr-status') || {}).textContent || ''")


def tap_sq(P, sq):
    x, y = P.ev(f"__box.trainer().target({json.dumps(sq)})")
    P.tap_xy(x, y)


def move(P, m):
    tap_sq(P, m['from'])
    tap_sq(P, m['to'])
    if m.get('promo'):
        k = 'qrbn'.index(m['promo'])
        x, y = P.ev(f"__box.trainer().promoTarget({json.dumps(m['to'])}, {k})")
        P.tap_xy(x, y)


def legal_now(P):
    return P.ev("document.querySelectorAll('.board .hint-dot, .board .hint-capture').length >= 0 && !!document.querySelector('.trainer-board')")


def check_board(P, label):
    sb = P.small_buttons()
    c.ok(sb == [], f'{label}: Knöpfe ≥ 48 px und im Bild {sb[:3]}')
    bc = P.ev("""() => { const m = __box.trainer().metrics(); const W = innerWidth, H = innerHeight;
      const svg = document.querySelector('svg.board'); const ctm = svg.getScreenCTM(); const vb = svg.viewBox.baseVal;
      const x0 = ctm.e + vb.x * ctm.a, y0 = ctm.f + vb.y * ctm.d, x1 = x0 + vb.width * ctm.a, y1 = y0 + vb.height * ctm.d;
      return { minTargetPx: m.minTargetPx, x0, y0, x1, y1, W, H, inside: x0 >= -1 && y0 >= -1 && x1 <= W + 1 && y1 <= H + 1, sizePx: x1 - x0 }; }""")
    c.ok(bc['inside'], f'{label}: Brett ganz sichtbar ({bc["x0"]:.0f},{bc["y0"]:.0f})–({bc["x1"]:.0f},{bc["y1"]:.0f}) in {bc["W"]}×{bc["H"]}')
    c.ok(bc['minTargetPx'] >= 48, f'{label}: Felder {bc["minTargetPx"]:.1f} px ≥ 48 (Brett {bc["sizePx"]:.0f} px)')
    return bc


def check_list(P, label):
    sb = P.small_buttons()
    c.ok(sb == [], f'{label}: Knöpfe ≥ 48 px {sb[:3]}')


def tap_text(P, sel, text):
    P.tap(f"{sel}:has-text({json.dumps(text)})")


def budget(P, form):
    # Lobby-Start lädt nichts vom Trainer (dynamischer Import erst beim Öffnen)
    tr = P.ev("performance.getEntriesByType('resource').filter(e => e.name.includes('/trainer/')).length")
    c.ok(tr == 0, f'{form}: Lobby-Start lädt keine Trainer-Dateien ({tr})')
    print(f'    Lobby bereit nach {P.boot_s:.2f} s')
    # Endspiel-Tabellen bei 4× gedrosselter CPU (≈ Mittelklasse-Handy) – baut beim ersten Öffnen einer Lektion
    cdp = P.ctx.new_cdp_session(P.pg)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    ms = P.ev("import('./src/trainer/tb.js').then(m => { const t = performance.now(); m.build('KQK'); m.build('KRK'); m.build('KPK'); return performance.now() - t; })")
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
    c.ok(ms < 2000, f'{form}: Endspiel-Tabellen K+D, K+T, K+B bei 4× gedrosselter CPU in {ms:.0f} ms')


def run(P, form):
    KEEP = ('0_lobby', '3_ansehen_pfeil', '4_lernen_hinweis', '8_taktik_hinweis', '11_endspiel_geschafft', '12_endspiel_tipp')
    def shot(n):
        P.shot(f'{form}_{n}', 'n6')
        if final and n in KEEP: P.shot(f'n6_{form}_{n}', 'final')
    if form == 'hoch': budget(P, form)
    # --- Lobby-Kachel ---
    P.pg.locator('[data-game="trainer"]').scroll_into_view_if_needed()
    time.sleep(0.3)
    shot('0_lobby')
    P.tap('[data-game="trainer"]')
    wait(lambda: page(P) and page(P)['kind'] == 'home', 15, 'Trainer-Übersicht')
    time.sleep(0.3)
    check_list(P, f'{form} Übersicht')
    shot('1_uebersicht')
    c.ok(P.ev("location.hash") == '#trainer', f'{form}: Adresse #trainer')

    # --- Eröffnungen: ansehen ---
    P.tap('[data-area="eroeffnungen"] .tr-card-main')
    wait(lambda: page(P)['kind'] == 'eroeffnungen', 10, 'Eröffnungsliste')
    check_list(P, f'{form} Eröffnungsliste')
    shot('2_eroeffnungen')
    P.tap('[data-line="it-piano"]')
    P.tap('.sheet [data-act="view"]')
    wait(lambda: page(P)['kind'] == 'ansehen', 10, 'Ansehen')
    for _ in range(5):
        P.tap('[data-act="next"]')
    time.sleep(0.6)
    c.ok(page(P)['ply'] == 5, f'{form}: Ansehen – 5× Vor ({page(P)["ply"]})')
    c.ok(P.ev("document.querySelectorAll('.board .arrow').length") == 1, f'{form}: Pfeil für den nächsten Zug sichtbar')
    check_board(P, f'{form} Ansehen')
    shot('3_ansehen_pfeil')
    P.tap('[data-act="prev"]')
    c.ok(page(P)['ply'] == 4, f'{form}: Zurück')

    # --- Lernen als Weiß mit Fehler ---
    P.tap('[data-act="learn"]')
    wait(lambda: page(P)['kind'] == 'lernen', 10, 'Lernen')
    moves = P.ev("import('./src/trainer/opening.js').then(m => m.lineMoves(m.lineById('it-piano')).map(x => ({from: x.from, to: x.to, promo: x.promo || null})))")
    # absichtlich falsch: a2-a3
    wait(lambda: page(P)['ply'] == 0, 5)
    move(P, {'from': 'a2', 'to': 'a3'})
    time.sleep(0.3)
    c.ok(page(P)['mistakes'] == 1 and page(P)['ply'] == 0, f'{form}: falscher Zug wird zurückgewiesen')
    c.ok(P.ev("document.querySelectorAll('.board .mark-sq.hint').length") == 1, f'{form}: Hinweis – Figur leuchtet auf')
    shot('4_lernen_hinweis')
    for i, m in enumerate(moves):
        if i % 2 == 1: continue
        wait(lambda: page(P)['ply'] == i, 15, f'Lernen: Zug {i}')
        time.sleep(0.15)
        move(P, m)
    wait(lambda: page(P)['done'], 15, 'Linie fertig')
    c.ok('geschafft' in status(P), f'{form}: Linie geschafft – „{status(P)}“')
    check_board(P, f'{form} Lernen fertig')
    shot('5_lernen_fertig')
    t = P.ev("JSON.parse(localStorage.getItem('sb.trainer'))")
    card = t['open'].get('it-piano:w')
    c.ok(card and card['box'] == 1, f'{form}: Karteikarte angelegt (Fach {card and card["box"]})')

    # --- Gegen den Computer weiterspielen ---
    P.tap('[data-act="play-on"]')
    P.tap('.sheet [data-level="2"]')
    wait(lambda: P.state()['table'] and P.state()['table']['game'] == 'schach', 15, 'Partie aus Stellung')
    n = P.ev("__box.table().gs.sans.length")
    c.ok(n >= len(moves), f'{form}: Partie läuft weiter mit den {len(moves)} Linienzügen in der Zugliste ({n})')
    shot('6_weiterspielen')

    # --- Wiederholen: Karte fällig machen ---
    P.ev("(() => { const t = JSON.parse(localStorage.getItem('sb.trainer')); t.open['it-piano:w'].due = 0; localStorage.setItem('sb.trainer', JSON.stringify(t)); })()")
    P.ev("__box.openTrainer('trainer')")
    wait(lambda: page(P) and page(P)['kind'] == 'home', 10, 'Übersicht 2')
    P.tap('.tr-card [data-act="review"]')
    wait(lambda: page(P)['kind'] == 'wiederholen', 10, 'Wiederholen')
    for i, m in enumerate(moves):
        if i % 2 == 1: continue
        wait(lambda: page(P)['ply'] == i, 15, f'Wiederholen: Zug {i}')
        time.sleep(0.12)
        move(P, m)
    wait(lambda: page(P)['done'], 15, 'Wiederholung fertig')
    t = P.ev("JSON.parse(localStorage.getItem('sb.trainer'))")
    c.ok(t['open']['it-piano:w']['box'] == 2, f'{form}: Wiederholen fehlerfrei → Fach 2')

    # --- Taktik ---
    P.ev("__box.openTrainer('trainer/taktik')")
    wait(lambda: page(P)['kind'] == 'taktik', 10, 'Taktik-Liste')
    check_list(P, f'{form} Taktik-Liste')
    shot('7_taktik_liste')
    P.tap('[data-motif="gabel"]')
    wait(lambda: page(P).get('id'), 10, 'Aufgabe')
    pz = page(P)
    wait(lambda: P.ev("document.querySelectorAll('.board .last-sq').length") == 2, 10, 'Gegnerzug gezeigt')
    time.sleep(0.3)
    sol = P.ev(f"import('./src/trainer/puzzle.js').then(m => {{ const p = m.puzzleObj(m.PUZZLE_BY_ID.get({json.dumps(pz['id'])})); return p.moves.map(m.parseUci); }})")
    wrong = P.ev(f"""Promise.all([import('./lib/chess.js'), import('./src/trainer/puzzle.js')]).then(([C, m]) => {{
      const p = m.puzzleObj(m.PUZZLE_BY_ID.get({json.dumps(pz['id'])})); const g = new C.Chess(m.fenBefore(p, 0));
      const e = m.expected(p, 0); const w = g.moves({{verbose: true}}).find(x => !(x.from === e.from && x.to === e.to) && !x.promotion && m.judge(p, 0, x) === 'wrong');
      return {{ from: w.from, to: w.to }}; }})""")
    move(P, wrong)
    time.sleep(0.3)
    c.ok(page(P)['mistakes'] == 1, f'{form}: Taktik – Fehlversuch erkannt')
    c.ok(P.ev("document.querySelectorAll('.board .mark-sq.hint').length") == 1, f'{form}: Taktik – Figur leuchtet auf')
    check_board(P, f'{form} Taktik')
    shot('8_taktik_hinweis')
    step = 0
    for i in range(1, len(sol), 2):
        wait(lambda: page(P)['step'] == step and P.ev("!!document.querySelector('[data-act=\"tip\"]:not([disabled])')"), 15, f'Taktik Schritt {step}')
        time.sleep(0.15)
        move(P, sol[i])
        step += 1
    wait(lambda: page(P)['done'], 15, 'Aufgabe gelöst')
    c.ok('Gelöst' in status(P), f'{form}: Aufgabe gelöst – „{status(P)}“')
    shot('9_taktik_geloest')
    t = P.ev("JSON.parse(localStorage.getItem('sb.trainer'))")
    c.ok(t['tac']['games'] >= 1 and t['tac']['done'].get(pz['id']) == 2, f'{form}: Wertung {t["tac"]["rating"]} nach {t["tac"]["games"]} Aufgabe(n), als „mit Hilfe“ gelöst')

    # --- Endspiel: Quadratregel (Tabelle) ---
    P.ev("__box.openTrainer('trainer/endspiele')")
    wait(lambda: page(P)['kind'] == 'endspiele', 10, 'Endspiel-Liste')
    check_list(P, f'{form} Endspiel-Liste')
    shot('10_endspiele')
    P.tap('[data-lesson="quadrat"]')
    wait(lambda: page(P).get('id') == 'quadrat', 10, 'Lektion Quadrat')
    for _ in range(12):
        pg = page(P)
        if pg['done']: break
        wait(lambda: not page(P)['busy'] and (page(P)['done'] or page(P)['fen'].split(' ')[1] == 'w'), 15, 'Quadrat: ich bin dran')
        if page(P)['done']: break
        bm = P.ev(f"import('./src/trainer/tb.js').then(m => m.bestMove({json.dumps(page(P)['fen'])}))")
        move(P, bm)
        time.sleep(0.2)
    wait(lambda: page(P)['done'], 15, 'Quadrat fertig')
    c.ok(page(P)['result'] and page(P)['result']['ok'], f'{form}: Quadratregel geschafft – „{status(P)}“')
    check_board(P, f'{form} Endspiel')
    shot('11_endspiel_geschafft')

    # --- Endspiel: Opposition halten als Schwarz (Brett gedreht), mit Tipp ---
    P.ev("__box.openTrainer('trainer/s/opp-halten')")
    wait(lambda: page(P).get('id') == 'opp-halten', 10, 'Lektion opp-halten')
    P.tap('[data-act="tip"]')
    time.sleep(0.3)
    c.ok(P.ev("document.querySelectorAll('.board .arrow.hint').length") == 1, f'{form}: Endspiel-Tipp zeigt Pfeil')
    shot('12_endspiel_tipp')
    for _ in range(30):
        if page(P)['done']: break
        wait(lambda: not page(P)['busy'] and (page(P)['done'] or page(P)['fen'].split(' ')[1] == 'b'), 15, 'opp-halten: ich bin dran')
        if page(P)['done']: break
        bm = P.ev(f"import('./src/trainer/tb.js').then(m => m.bestMove({json.dumps(page(P)['fen'])}))")
        move(P, bm)
        time.sleep(0.2)
    wait(lambda: page(P)['done'], 20, 'opp-halten fertig')
    c.ok(page(P)['result']['ok'], f'{form}: Remis gehalten – „{status(P)}“')
    t = P.ev("JSON.parse(localStorage.getItem('sb.trainer'))")
    c.ok(t['end'].get('quadrat') == 3 and t['end'].get('opp-halten') == 2, f'{form}: Sterne gespeichert {t["end"]}')

    # --- Bot-Lektion: Lucena, Tipp vom Computer ---
    if form == 'desktop':
        P.ev("__box.openTrainer('trainer/s/lucena')")
        wait(lambda: page(P).get('id') == 'lucena', 10, 'Lucena')
        P.tap('[data-act="tip"]')
        wait(lambda: P.ev("document.querySelectorAll('.board .arrow.hint').length") == 1, 15, 'Lucena-Tipp')
        c.ok(True, f'{form}: Lucena – Tipp vom Übungs-Computer')
        bm = P.ev("__box.trainer().page().fen")
        P.tap('[data-act="restart"]')

    # --- Fortschritt + Zurücksetzen ---
    P.ev("__box.openTrainer('trainer/fortschritt')")
    wait(lambda: page(P)['kind'] == 'fortschritt', 10, 'Fortschritt')
    check_list(P, f'{form} Fortschritt')
    shot('13_fortschritt')
    P.tap('[data-act="reset"]')
    P.tap('[data-act="reset-yes"]')
    time.sleep(0.3)
    c.ok(P.ev("localStorage.getItem('sb.trainer')") is None, f'{form}: Fortschritt zurückgesetzt')
    # zurück in die Lobby über ‹
    P.tap('[data-act="back"]')
    wait(lambda: page(P)['kind'] == 'home', 10, 'zurück zur Übersicht')
    P.tap('[data-act="back"]')
    wait(lambda: P.ev("document.body.dataset.screen") == 'lobby', 10, 'Lobby')
    errs = P.app_errors()
    c.ok(errs == [], f'{form}: 0 Fehler {errs[:3]}')


with Server() as S, sync_playwright() as pw:
    br = launch(pw)
    for form in forms:
        print(f'\n== {form} ==', flush=True)
        P = Page(br, S.base, form)
        try:
            P.open()
            P.ev("__box.setName('Peter')")
            t0 = time.time()
            run(P, form)
            print(f'    ({time.time() - t0:.0f} s)')
        except Exception as e:
            c.ok(False, f'{form}: Abbruch {type(e).__name__}: {e}')
            try: P.shot(f'{form}_abbruch', 'n6')
            except Exception: pass
            print('    Fehler:', P.app_errors()[:5])
        P.close()
    br.close()

print('\nErgebnis:', 'alles grün' if not c.fails else f'{len(c.fails)} Fehler')
sys.exit(1 if c.fails else 0)

# Rauchtest n3 (Pixel 7 hoch/quer): Computer-Tempo „gemütlich“ (Züge Schritt für Schritt, Denkzeit, Banner),
# Meldungs-Warteschlange, Einstellungen, Schnapsen-Stich-Blatt (genau die eigenen Karten, nie fremde – auch nicht im
# DOM/SVG), zu zweit mit Sichtschutz. Screenshots → tests/shots/n3/ (Auswahl in tests/shots/final/n3_*.jpg).
# Aufruf: python3 tests/smoke_n3.py [einst] [toast] [dame] [backgammon] [banner] [stiche] [zuzweit] [hoch] [quer]
import sys, time, json, shutil, os
sys.path.insert(0, 'tests')
from util import *

c = Checker()
ALL = ['einst', 'toast', 'dame', 'backgammon', 'banner', 'blackjack', 'stiche', 'zuzweit']
want = [a for a in sys.argv[1:] if a in ALL] or ALL
forms = [a for a in sys.argv[1:] if a in ('hoch', 'quer')] or ['hoch', 'quer']
SLOW = '?nosw&tempo=gemuetlich'
FAST = '?nosw&tempo=test'


def wait(fn, timeout=20, what='Bedingung'):
    t0 = time.time()
    while not fn():
        if time.time() - t0 > timeout:
            raise TimeoutError(what)
        time.sleep(0.04)
    return time.time() - t0


def final(P, name):
    src = P.shot(name, 'n3')
    dst = os.path.join(ROOT, 'tests', 'shots', 'final', f'n3_{name}.jpg')
    P.pg.screenshot(path=dst, type='jpeg', quality=84)
    return src


def rects(P):
    return P.ev("""() => { const b = document.querySelector('.banner'); const s = document.querySelector('svg.board');
      const r = (e) => { if (!e) return null; const x = e.getBoundingClientRect(); return { l: x.left, t: x.top, r: x.right, b: x.bottom, w: x.width, h: x.height }; };
      return { banner: b && !b.classList.contains('hidden') ? r(b) : null, board: r(s), text: b ? b.textContent : '' }; }""")


def banner_free(P, label):
    # Banner liegt über der Leiste des Gegners, nicht auf dem Brett
    r = rects(P)
    if not r['banner']:
        c.ok(False, f'{label}: Banner sichtbar')
        return
    bn, bd = r['banner'], r['board']
    overlap = max(0, min(bn['r'], bd['r']) - max(bn['l'], bd['l'])) * max(0, min(bn['b'], bd['b']) - max(bn['t'], bd['t']))
    c.ok(overlap <= 0.02 * bd['w'] * bd['h'], f'{label}: Banner „{r["text"]}“ verdeckt das Brett nicht (Überlappung {overlap:.0f} px²)')
    c.ok(bn['h'] >= 44 and bn['w'] >= 200, f'{label}: Banner gut lesbar ({bn["w"]:.0f}×{bn["h"]:.0f} px)')


# ---------- Einstellungen ----------
def einst(P, form):
    P.ev("__box.lobby()")
    time.sleep(0.3)
    P.tap('[data-act="settings"]')
    wait(lambda: P.ev("!!document.querySelector('[data-setting=tempo]')"), 5, 'Einstellungen offen')
    opts = P.ev("[...document.querySelectorAll('[data-setting=tempo] .seg-btn')].map(b => [b.dataset.v, b.classList.contains('on')])")
    c.ok([o[0] for o in opts] == ['gemuetlich', 'normal', 'flott'], f'{form}: Computer-Tempo mit 3 Stufen {opts}')
    c.ok(P.ev("localStorage.getItem('sb.settings')") is None or opts[0][1], f'{form}: gemütlich ist Standard')
    final(P, f'einstellungen_{form}')
    P.tap('[data-setting=tempo] [data-v=normal]')
    c.ok(json.loads(P.ev("localStorage.getItem('sb.settings')")).get('tempo') == 'normal', f'{form}: Auswahl gespeichert (normal)')
    P.tap('[data-setting=tempo] [data-v=gemuetlich]')
    P.ev("document.querySelectorAll('.sheet-wrap').forEach(e => e.remove())")


# ---------- Meldungen ----------
def toast(P, form):
    P.ev("import('./src/ui/dom.js').then(m => { m.toast('Erste Meldung'); m.toast('Zweite Meldung'); m.toast('Dritte Meldung'); })")
    time.sleep(0.4)
    vis = P.ev("[...document.querySelectorAll('.toast:not(.out)')].map(e => e.textContent)")
    c.ok(vis == ['Erste Meldung'], f'{form}: nur eine Meldung sichtbar, die anderen warten {vis}')
    P.shot(f'toast_{form}', 'n3')
    P.tap('.toast:not(.out)')
    time.sleep(0.5)
    vis = P.ev("[...document.querySelectorAll('.toast:not(.out)')].map(e => e.textContent)")
    c.ok(vis == ['Zweite Meldung'], f'{form}: Antippen schließt, die nächste kommt {vis}')
    t_shown = time.time() - 0.5
    time.sleep(3.6)
    still = P.ev("[...document.querySelectorAll('.toast:not(.out)')].map(e => e.textContent)")
    c.ok(still == ['Zweite Meldung'], f'{form}: Meldung steht noch nach {time.time() - t_shown:.1f} s {still}')
    wait(lambda: P.ev("[...document.querySelectorAll('.toast:not(.out)')].map(e => e.textContent)") == ['Dritte Meldung'], 3, 'dritte Meldung')
    c.ok(True, f'{form}: nach 5 s kommt die dritte Meldung')


# ---------- Dame: Sprungkette des Computers Station für Station ----------
def dame(P, form):
    P.ev("__box.local('bot', 'dame', {}, 'weiss', 1)")
    wait(lambda: P.ev("__box.legal().length") > 0, 10, 'Dame: ich bin dran')
    # Weiß: 37 (4,5), 44 (5,4), 56 (7,0); Schwarz: 19 (2,3), 1 (0,1). Weiß 37→28 erlaubt Schwarz 19×28×44 → 51.
    P.ev("""() => { const t = __box.table(); const b = t.gs.board.map(() => 0);
      b[37] = 1; b[44] = 1; b[56] = 1; b[19] = -1; b[1] = -1; t.gs.board = b; t.gs.turn = 0; t.gs.rep = {}; t.gs.over = null; __box.poke(); }""")
    time.sleep(0.4)
    m = P.ev("__box.legal().find(m => m.from === 37 && m.path.length === 1 && m.path[0] === 28)")
    c.ok(m is not None, f'{form}: Stellung für die Sprungkette gesetzt')
    t0 = time.time()
    P.ev(f"__box.move({json.dumps(m)})")
    wait(lambda: P.ev("__box.table().nmoves") >= 2, 12, 'Computer schlägt')
    think = time.time() - t0
    last = P.ev("__box.table().last.m")
    c.ok(len(last['path']) == 2 and len(last['cap']) == 2, f'{form}: Computer schlägt 2 Steine in einer Kette {last}')
    c.ok(think >= 1.6, f'{form}: Computer hat {think:.1f} s gedacht (gemütlich ≥ 1,5 s + eigener Zug)')
    time.sleep(0.5)   # erster Sprung (0,45 s) fertig, Halt an der Zwischenstation bis 1,05 s
    busy = P.ev("__box.busy()")
    hints = P.ev("document.querySelectorAll('.board .hint-can, .board .hint-dot').length")
    # Stein steht mitten in der Kette an der Zwischenstation (4,5) = Feld 37
    pos = P.ev("""() => { const el = document.querySelector('.board .pieces [data-i="51"]'); const r = el.getBoundingClientRect();
      const [x, y] = __box.target(37); return Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y); }""")
    P.shot(f'dame_kette_{form}', 'n3')
    c.ok(busy, f'{form}: Kette läuft noch nach 0,5 s')
    c.ok(hints == 0, f'{form}: während der Animation keine Zughinweise (kein Fehltipp)')
    c.ok(pos < 25, f'{form}: Stein hält an der Zwischenstation (Abstand {pos:.0f} px)')
    time.sleep(0.25)
    P.pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'final', f'n3_dame_kette2_{form}.jpg'), type='jpeg', quality=84)
    d = wait(lambda: not P.ev("__box.busy()"), 5, 'Kette fertig')
    c.ok(P.ev("__box.legal().length") > 0 or P.ev("__box.table().status") == 'over', f'{form}: danach wieder am Zug (nach weiteren {d:.1f} s)')
    ev = P.ev("__box.events().map(e => e.text)")
    c.ok(any('Computer schlägt 2 Steine' in e for e in ev), f'{form}: Ereignis „Computer schlägt 2 Steine“ {ev[-2:]}')


# ---------- Backgammon: erst würfeln, dann Teilzug für Teilzug ----------
def backgammon(P, form):
    P.ev("__box.local('bot', 'backgammon', {}, 'weiss', 1)")
    t_end = time.time() + 90
    got_roll = got_play = False
    while time.time() < t_end and not (got_roll and got_play):
        st = P.ev("""() => { const t = __box.table(); return { last: t.last, status: t.status, legal: __box.legal().length, busy: __box.busy(), me: __box.state().mySeat }; }""")
        if st['status'] != 'play':
            P.ev("__box.local('bot', 'backgammon', {}, 'weiss', 1)")
            continue
        last = st['last']
        if last and last['by'] != st['me'] and st['busy']:
            if last['m']['type'] == 'roll' and not got_roll:
                time.sleep(0.35)
                final(P, f'backgammon_wurf_{form}')
                got_roll = True
                c.ok(True, f'{form}: Computer würfelt sichtbar ({P.ev("__box.table().gs.dice")})')
                continue
            if last['m']['type'] == 'play' and len(last['m']['steps']) >= 2 and not got_play:
                time.sleep(0.9)   # 1. Teilzug fertig (0,6 s), Pause, 2. läuft
                shown = P.ev("""() => [...document.querySelectorAll('.board .pieces [data-p]')].length""")
                busy = P.ev("__box.busy()")
                acts = P.ev("[...document.querySelectorAll('.actions button')].map(b => b.dataset.act)")
                status = P.ev("document.querySelector('.status-t').textContent")
                final(P, f'backgammon_teilzug_{form}')
                c.ok(acts == [] and 'zieht' in status, f'{form}: während des Computerzugs keine Knöpfe {acts}, Status „{status}“')
                got_play = True
                c.ok(busy, f'{form}: Computerzug mit {len(last["m"]["steps"])} Teilzügen läuft Schritt für Schritt ({shown} Steine im Bild)')
                continue
        if st['legal'] and not st['busy']:
            P.ev("__box.botMove(1)")
        time.sleep(0.1)
    c.ok(got_roll and got_play, f'{form}: Backgammon Wurf + Teilzüge des Computers gesehen')


# ---------- Banner: Computer sagt 40 an ----------
FORCE_40 = """() => { const t = __box.table(); const g = t.gs; const me = __box.state().mySeat; const b = 1 - me; const A = g.atout;
  const where = (card) => { for (const s of [0, 1]) { const i = g.hands[s].indexOf(card); if (i >= 0) return ['h', s, i]; }
    const i = g.talon.indexOf(card); if (i >= 0) return ['t', i]; return g.atoutCard === card ? ['a'] : null; };
  const get = (w) => (w[0] === 'h' ? g.hands[w[1]][w[2]] : w[0] === 't' ? g.talon[w[1]] : g.atoutCard);
  const set = (w, v) => { if (w[0] === 'h') g.hands[w[1]][w[2]] = v; else if (w[0] === 't') g.talon[w[1]] = v; else g.atoutCard = v; };
  const swap = (c1, c2) => { const w1 = where(c1), w2 = where(c2); set(w1, c2); set(w2, c1); };
  if (g.atoutCard === A + 'K' || g.atoutCard === A + 'O') swap(g.atoutCard, [A + 'A', A + 'Z', A + 'U'].find((c) => c !== g.atoutCard));
  for (const card of [A + 'K', A + 'O']) { if (g.hands[b].includes(card)) continue; swap(card, g.hands[b].find((c) => c !== A + 'K' && c !== A + 'O')); }
  g.turn = b; g.trick = []; __box.poke(); return A; }"""


def banner(P, form):
    P.ev("__box.local('bot', 'schnapsen', {}, 'weiss', 2)")
    wait(lambda: P.ev("__box.table().gs.phase") == 'play', 10, 'Schnapsen ausgeteilt')
    time.sleep(0.3)
    P.ev(FORCE_40)
    t0 = time.time()
    wait(lambda: 'sagt 40 an' in (P.ev("__box.banner()") or ''), 12, 'Banner „Computer sagt 40 an“')
    dt = time.time() - t0
    time.sleep(0.4)
    final(P, f'banner_40_{form}')
    c.ok(True, f'{form}: Banner „{P.ev("__box.banner()")}“ nach {dt:.1f} s Denkzeit')
    banner_free(P, form)
    time.sleep(3.2)
    c.ok('sagt 40 an' in (P.ev("__box.banner()") or ''), f'{form}: Banner steht noch nach 3,6 s')
    # Status-Zeile antippen → letzte Ereignisse
    P.tap('[data-act="events"]')
    wait(lambda: P.ev("!!document.querySelector('[data-events]')"), 5, 'Ereignis-Liste')
    items = P.ev("[...document.querySelectorAll('[data-events] li .ev-t')].map(e => e.textContent)")
    c.ok(any('sagt 40 an' in x for x in items) and len(items) <= 5, f'{form}: Ereignis-Liste (Status antippen) {items}')
    P.shot(f'ereignisse_{form}', 'n3')
    P.ev("document.querySelectorAll('.sheet-wrap').forEach(e => e.remove())")


# ---------- Blackjack: Bank deckt Karte für Karte auf ----------
def blackjack(P, form):
    for attempt in range(6):
        P.ev("__box.local('bot', 'blackjack', {players: 3}, 'weiss', 1)")
        wait(lambda: P.ev("__box.legal().some(m => m.type === 'bet')"), 15, 'setzen')
        P.ev("__box.move({ type: 'bet', amount: 5 })")
        wait(lambda: P.ev("__box.legal().some(m => m.type === 'stand')") or P.ev("__box.table().gs.phase") == 'bet', 15, 'ausgeteilt')
        if not P.ev("__box.legal().some(m => m.type === 'stand')"):
            continue
        P.ev("__box.move({ type: 'stand' })")
        n = P.ev("__box.table().gs.lastRound.bankCards.length")
        if n < 3:
            continue
        wait(lambda: P.ev("document.querySelectorAll('svg.board-bj > g:nth-child(2) > .card').length") == n, 5, 'Bank-Karten gezeichnet')
        delays = P.ev("""[...document.querySelectorAll('svg.board-bj > g:nth-child(2) > .card')].map(e => e.getAnimations().map(a => a.effect.getTiming().delay)[0] ?? null)""")
        if n < 3:
            continue
        time.sleep(0.9)
        final(P, f'blackjack_bank_{form}')
        want_d = [None] + [k * 1000 for k in range(n - 1)]
        c.ok(delays == want_d, f'{form}: Bank deckt Karte für Karte auf, je 1 s Abstand {delays}')
        ev = P.ev("__box.events().map(e => e.text)")
        c.ok(any(e.startswith('Bank hat') for e in ev), f'{form}: Ereignis {ev[-1:]}')
        return
    c.ok(False, f'{form}: keine Runde mit ziehender Bank gefunden')


# ---------- Stich-Blatt ----------
LEAK = """() => { const t = __box.table(); const g = t.gs; const me = __box.state().mySeat; const o = 1 - me;
  const pub = new Set(); if (g.lastTrick) g.lastTrick.cards.forEach((x) => pub.add(x.card)); g.trick.forEach((x) => pub.add(x.card));
  if (g.atoutCard) pub.add(g.atoutCard);
  const secret = [...g.won[o], ...g.hands[o], ...g.talon].filter((c) => c && !pub.has(c));
  const html = document.documentElement.outerHTML;
  const leaks = secret.filter((c) => [`data-card="${c}"`, `/de/${c}.webp`, `/de/${c}@2x.webp`, `data-trick="${c}"`, `data-hand="${c}"`, `alt="`].some((p, k) => k < 5 && html.includes(p)));
  const sheet = [...document.querySelectorAll('[data-sheet=stiche] img[data-card]')].map((e) => e.dataset.card);
  const names = [...document.querySelectorAll('[data-sheet=stiche] img')].map((e) => e.alt);
  return { leaks, sheet, won: g.won[me], names, secretN: secret.length, tricks: g.tricks, phase: g.phase }; }"""


def play_until_tricks(P, n, timeout=40):
    t_end = time.time() + timeout
    while time.time() < t_end:
        st = P.ev("() => { const t = __box.table(); const me = __box.state().mySeat; return { tr: t.gs.tricks[me], ph: t.gs.phase, legal: __box.legal().map(m => m.type), status: t.status }; }")
        if st['status'] != 'play':
            return False
        if st['ph'] == 'play' and st['tr'] >= n and st['legal']:
            return True
        if st['legal']:
            if 'weiter' in st['legal']:
                P.ev("__box.move({ type: 'weiter' })")
            else:
                P.ev("() => { const l = __box.legal().filter(m => m.type === 'play'); return __box.move(l[l.length - 1]); }")
        time.sleep(0.05)
    return False


def stiche(P, form, augen=False):
    P.ev(f"__box.local('bot', 'schnapsen', {{ augenHilfe: {str(augen).lower()} }}, 'weiss', 1)")
    ok = False
    for _ in range(4):
        if play_until_tricks(P, 3):
            ok = True
            break
        P.ev(f"__box.local('bot', 'schnapsen', {{ augenHilfe: {str(augen).lower()} }}, 'weiss', 1)")
    c.ok(ok, f'{form}: Schnapsen gespielt bis ≥ 3 eigene Stiche')
    time.sleep(0.3)
    pile = P.ev("[...document.querySelectorAll('[data-pile]')].map(g => [g.dataset.pile, g.querySelector('.pile-label').textContent, g.querySelectorAll('.card:not(.back)').length, g.querySelectorAll('[data-card]').length])")
    c.ok(len(pile) == 2 and all(p[2] == 0 and p[3] == 0 for p in pile), f'{form}: Stichstapel verdeckt, nur Anzahl {pile}')
    bar = P.ev("document.querySelector('.pbar.bottom .pb-sub').textContent")
    c.ok(('Augen' in bar) == augen, f'{form}: Leiste „{bar}“ (Augen nur mit Augen-Hilfe)')
    x, y = P.ev("__box.target('pile')")
    P.tap_xy(x, y)
    wait(lambda: P.ev("!!document.querySelector('[data-sheet=stiche]')"), 5, 'Stich-Blatt offen')
    time.sleep(0.5)
    r = P.ev(LEAK)
    c.ok(r['sheet'] == r['won'] and len(r['sheet']) >= 6, f'{form}: Stich-Blatt zeigt genau won[ich] ({len(r["sheet"])} Karten, {r["tricks"]} Stiche)')
    c.ok(r['leaks'] == [], f'{form}: keine fremde Karte im DOM/SVG ({r["secretN"]} verdeckte geprüft) {r["leaks"]}')
    who = P.ev("[...document.querySelectorAll('[data-sheet=stiche] .sb-who')].map(e => e.textContent)")
    c.ok(all('ausgespielt' in w for w in who), f'{form}: je Stich, wer ausgespielt hat {who[:2]}')
    has_sum = P.ev("!!document.querySelector('[data-sheet=stiche] .sb-sum')")
    c.ok(has_sum == augen, f'{form}: Summe der Augen nur mit Augen-Hilfe ({has_sum})')
    if augen:
        s = P.ev("document.querySelector('[data-sheet=stiche] .sb-sum').textContent")
        pts = P.ev("() => { const g = __box.table().gs; const me = __box.state().mySeat; return g.augen[me] + (g.tricks[me] ? g.ansagen.filter(a => a.seat === me).reduce((x, a) => x + a.points, 0) : 0); }")
        c.ok(f'Summe: {pts} Augen' in s, f'{form}: „{s[:40]}“ = {pts}')
    final(P, f'stichblatt{"_augen" if augen else ""}_{form}')
    P.ev("document.querySelectorAll('.sheet-wrap').forEach(e => e.remove())")


# ---------- Zu zweit: Stiche erst hinter dem Sichtschutz ----------
def zuzweit(P, form):
    P.ev("__box.local('hotseat', 'schnapsen', {}, 'weiss')")
    wait(lambda: P.ev("!!document.querySelector('[data-overlay=handoff]')"), 10, 'Sichtschutz')
    c.ok(P.ev("__box.table().gs.phase") == 'play', f'{form}: zu zweit – erst Sichtschutz')
    c.ok(P.ev("!document.querySelector('[data-pile=me]')"), f'{form}: hinter dem Sichtschutz kein antippbarer eigener Stapel')
    P.tap('[data-act="unlock"]')
    time.sleep(0.4)
    c.ok(P.ev("!!document.querySelector('[data-pile=me]')"), f'{form}: nach „Karten zeigen“ eigener Stapel da')
    x, y = P.ev("__box.target('pile')")
    P.tap_xy(x, y)
    wait(lambda: P.ev("!!document.querySelector('[data-sheet=stiche]')"), 5, 'Stich-Blatt (noch leer)')
    c.ok(True, f'{form}: Stich-Blatt öffnet ({P.ev("document.querySelector(`[data-sheet=stiche] .sheet-body`).textContent.slice(0, 30)")})')
    P.ev("() => { const l = __box.legal().filter(m => m.type === 'play'); __box.move(l[0]); }")
    time.sleep(0.8)
    c.ok(P.ev("!document.querySelector('[data-sheet=stiche]')"), f'{form}: nach dem Zug schließt das Blatt (Sichtschutz)')
    c.ok(P.ev("!!document.querySelector('[data-overlay=handoff]')"), f'{form}: Sichtschutz „Gerät weitergeben“ steht')


with sync_playwright() as pw:
    b = launch(pw)
    with Server() as srv:
        for form in forms:
            print(f'\n=== {form} ===', flush=True)
            slow = Page(b, srv.base, form).open(SLOW) if set(want) & {'einst', 'toast', 'dame', 'backgammon', 'banner', 'blackjack'} else None
            for name in ['einst', 'toast', 'dame', 'backgammon', 'banner', 'blackjack']:
                if name in want:
                    try: globals()[name](slow, form)
                    except Exception as e: c.ok(False, f'{form} {name}: Ausnahme {e}')
            if slow:
                c.ok(slow.app_errors() == [], f'{form}: 0 App-Fehler (gemütlich) {slow.app_errors()[:3]}')
                slow.close()
            if set(want) & {'stiche', 'zuzweit'}:
                fast = Page(b, srv.base, form).open(FAST)
                for name, args in [('stiche', {}), ('stiche', {'augen': True}), ('zuzweit', {})]:
                    if name in want:
                        try: globals()[name](fast, form, **args)
                        except Exception as e: c.ok(False, f'{form} {name}: Ausnahme {e}')
                c.ok(fast.app_errors() == [], f'{form}: 0 App-Fehler {fast.app_errors()[:3]}')
                fast.close()
    b.close()

print('\nALLES GRÜN' if not c.fails else f'\n{len(c.fails)} FEHLER')
sys.exit(1 if c.fails else 0)

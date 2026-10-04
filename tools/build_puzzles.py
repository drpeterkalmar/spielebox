#!/usr/bin/env python3
"""Baut src/trainer/data/puzzles.js (Taktik-Aufgaben für den Schach-Trainer) aus der Lichess-Puzzle-Datenbank.

Quelle:  https://database.lichess.org/lichess_db_puzzle.csv.zst  (CC0, siehe Kopf der erzeugten Datei)
Aufruf:  python3 tools/build_puzzles.py
Danach:  node tests/node/trainer_puzzles.test.mjs   (prüft Legalität, Matt, judge() usw. mit chess.js)

Die CSV ist nach PuzzleId (praktisch zufällig) sortiert; die ersten 1,5 Mio. Zeilen reichen als Stichprobe.
Fehlt tools/.cache/puzzles_head.csv, wird sie per curl | zstd -dc | head geladen (nur ~1/4 der Datei).
Die Auswahl ist deterministisch (feste Sortierung, kein Zufall): gleiche CSV -> gleiche Ausgabe.
Nur Python-3-Standardbibliothek.
"""
import csv
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', '.cache', 'puzzles_head.csv')
OUT = os.path.join(ROOT, 'src', 'trainer', 'data', 'puzzles.js')
URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst'
HEAD_LINES = 1_500_000

# Filter
R_MIN, R_MAX = 600, 2000
RD_MAX = 90
POP_MIN = 85          # notfalls 80 (siehe POP_FALLBACK), wird nur genutzt, wenn ein Motiv zu wenige Kandidaten hat
POP_FALLBACK = 80
PLAYS_MIN = 300
PER_MOTIF = 25
MIN_PER_MOTIF = 15
MAX_TACTIC_STEPS = 3  # Motive 1–8: höchstens 3 Spielerzüge (Kinder, Handy)

# Motive in Anzeige-Reihenfolge. 'keys' = erlaubte Figur des Schlüsselzugs (erster Spielerzug), 'mate' = genau N Spielerzüge mit Matt.
MOTIFS = [
    dict(id='gabel', name='Gabel', themes=['fork'], keys='NP',
         intro='Bei einer Gabel greift eine einzige Figur zwei gegnerische Figuren gleichzeitig an. '
               'Der Gegner kann nur eine davon retten – die andere gewinnst du. Springer und Bauern sind dafür besonders geschickt.',
         hint='Suche einen Springer- oder Bauernzug, der zwei Figuren auf einmal angreift.'),
    dict(id='doppelangriff', name='Doppelangriff', themes=['fork'], keys='QRBK',
         intro='Auch Dame, Turm, Läufer und sogar der König können zwei Ziele auf einmal angreifen. '
               'Oft ist eines davon der König (Schach) – dann bleibt keine Zeit, die zweite Figur zu retten.',
         hint='Welcher Zug von Dame, Turm, Läufer oder König bedroht zwei Dinge gleichzeitig?'),
    dict(id='fesselung', name='Fesselung', themes=['pin'],
         intro='Eine Figur ist gefesselt, wenn sie nicht wegziehen kann oder darf, weil sonst eine wertvollere Figur dahinter – oft der König – angegriffen wäre. '
               'Gefesselte Figuren kann man gut angreifen, denn sie können nicht fliehen.',
         hint='Schau, welche gegnerische Figur vor ihrem König oder ihrer Dame steht und sich nicht bewegen kann.'),
    dict(id='spiess', name='Spieß', themes=['skewer'],
         intro='Der Spieß ist eine umgedrehte Fesselung: Du greifst eine wertvolle Figur an, sie muss ausweichen, '
               'und dahinter wird eine andere Figur frei, die du dann schlagen kannst.',
         hint='Suche eine Linie, auf der zwei gegnerische Figuren hintereinander stehen – die wertvollere vorne.'),
    dict(id='abzug', name='Abzug', themes=['discoveredAttack', 'discoveredCheck', 'doubleCheck'],
         intro='Beim Abzug zieht eine Figur zur Seite und gibt dabei den Weg für eine andere frei, die dahinter stand. '
               'So entstehen zwei Angriffe mit einem Zug. Ist der zweite Angriff ein Schach, heißt das Abzugsschach.',
         hint='Welche deiner Figuren steht einer anderen im Weg? Zieh sie mit Wirkung weg.'),
    # Lichess kennt kein Thema „overloading“ (Stand 10/2026). Nächstverwandt ist „capturingDefender“
    # (Verteidiger beseitigen), id 'verteidiger'.
    dict(id='verteidiger', name='Verteidiger beseitigen', themes=['capturingDefender'],
         intro='Manche Figur ist nur deshalb sicher, weil eine andere sie beschützt. Schlägst du diesen Beschützer, '
               'steht die Figur plötzlich ohne Schutz da – und du kannst sie im nächsten Zug gewinnen.',
         hint='Finde die gegnerische Figur, die eine andere bewacht, und schlage zuerst den Wächter.'),
    dict(id='ablenkung', name='Ablenkung', themes=['deflection'],
         intro='Bei der Ablenkung lockst oder zwingst du eine gegnerische Figur weg von ihrer wichtigen Aufgabe, '
               'zum Beispiel weg vom Schutz eines Feldes oder einer anderen Figur. Danach schlägt dein eigentlicher Plan zu.',
         hint='Welche gegnerische Figur hat eine wichtige Aufgabe? Zwinge sie, ihren Platz zu verlassen.'),
    dict(id='hinlenkung', name='Hinlenkung', themes=['attraction'],
         intro='Bei der Hinlenkung lockst du eine gegnerische Figur, oft den König, auf ein bestimmtes Feld – '
               'meist mit einem Opfer. Dort steht sie dann genau richtig für deinen nächsten Schlag.',
         hint='Überlege, auf welchem Feld du den gegnerischen König oder eine Figur gern hättest – und lock sie dorthin.'),
    dict(id='grundreihe', name='Grundreihenmatt', themes=['backRankMate'], max_steps=3,
         intro='Steht der König auf der hintersten Reihe und seine eigenen Bauern versperren ihm den Fluchtweg, '
               'genügt oft ein Turm oder eine Dame auf dieser Reihe zum Matt.',
         hint='Schau auf die hinterste Reihe des Gegners: Kann eine Dame oder ein Turm dorthin?'),
    dict(id='matt1', name='Matt in 1', themes=['mateIn1'], mate=1,
         intro='Hier gibt es ein Matt mit einem einzigen Zug. Prüfe alle Schachgebote: '
               'Bei welchem kann der König weder fliehen noch kann die Figur geschlagen oder der Angriff verstellt werden?',
         hint='Probiere in Gedanken jedes Schach aus und frage: Wohin könnte der König noch flüchten?'),
    dict(id='matt2', name='Matt in 2', themes=['mateIn2'], mate=2,
         intro='Matt in zwei Zügen: Dein erster Zug bereitet das Matt vor, oft mit Schach oder einem Opfer. '
               'Egal, wie der Gegner antwortet – dein zweiter Zug setzt matt.',
         hint='Beginne mit einem Zug, der dem Gegner kaum eine Wahl lässt, zum Beispiel einem Schach.'),
    dict(id='matt3', name='Matt in 3', themes=['mateIn3'], mate=3,
         intro='Matt in drei Zügen verlangt ein wenig Vorausdenken. Erzwungene Züge wie Schachgebote '
               'helfen dir, die Antworten des Gegners vorherzusehen.',
         hint='Suche ein Schach, nach dem der König nur wenige Felder hat – und denke von dort aus weiter.'),
]

PIECE_NAMES = {'N': 'Springer', 'P': 'Bauer', 'Q': 'Dame', 'R': 'Turm', 'B': 'Läufer', 'K': 'König'}


def ensure_cache():
    if os.path.exists(CACHE) and os.path.getsize(CACHE) > 0:
        return
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    print(f'Lade erste {HEAD_LINES} Zeilen von {URL} …', file=sys.stderr)
    tmp = CACHE + '.part'
    cmd = f'curl -s {URL} | zstd -dc 2>/dev/null | head -n {HEAD_LINES} > "{tmp}"'
    subprocess.run(['bash', '-c', cmd], check=False)
    if not os.path.exists(tmp) or os.path.getsize(tmp) == 0:
        sys.exit('Download fehlgeschlagen (curl/zstd vorhanden?)')
    os.replace(tmp, CACHE)


def board_from_fen(fen):
    """Feld (z. B. 'e4') -> Figurzeichen (FEN-Notation, Groß = Weiß)."""
    rows = fen.split()[0].split('/')
    b = {}
    for r, row in enumerate(rows):
        f = 0
        for ch in row:
            if ch.isdigit():
                f += int(ch)
            else:
                b['abcdefgh'[f] + str(8 - r)] = ch
                f += 1
    return b


def key_piece(fen, moves):
    """Figur (Großbuchstabe), die den ersten Spielerzug macht – nach Ausführung des Gegnerzugs."""
    b = board_from_fen(fen)
    opp = moves[0]
    fr, to = opp[:2], opp[2:4]
    pc = b.pop(fr, None)
    if pc is None:
        return None
    if pc in 'Kk' and abs(ord(fr[0]) - ord(to[0])) == 2:  # Rochade: Turm mitziehen
        rank = fr[1]
        if to[0] == 'g':
            b['f' + rank] = b.pop('h' + rank, None)
        else:
            b['d' + rank] = b.pop('a' + rank, None)
    b[to] = opp[4].upper() if len(opp) > 4 and pc.isupper() else (opp[4] if len(opp) > 4 else pc)
    p = b.get(moves[1][:2])
    return p.upper() if p else None


def load(pop_min):
    out = []
    with open(CACHE, newline='') as f:
        for r in csv.DictReader(f):
            try:
                rating, rd, pop, plays = int(r['Rating']), int(r['RatingDeviation']), int(r['Popularity']), int(r['NbPlays'])
            except (ValueError, KeyError):
                continue
            if not (R_MIN <= rating <= R_MAX and rd <= RD_MAX and pop >= pop_min and plays >= PLAYS_MIN):
                continue
            moves = r['Moves'].split()
            if len(moves) < 2 or len(moves) % 2:
                continue
            out.append(dict(id=r['PuzzleId'], fen=r['FEN'], moves=moves, rating=rating, pop=pop, plays=plays,
                            themes=set(r['Themes'].split()), game=r['GameUrl'].split('#')[0].split('/black')[0],
                            steps=len(moves) // 2))
    return out


def eligible(m, p):
    if not (p['themes'] & set(m['themes'])):
        return False
    if 'mate' in m:
        return p['steps'] == m['mate']
    if m['id'] == 'grundreihe':
        return p['steps'] <= m['max_steps']
    # Taktik-Motive 1–8: keine Matt-Aufgaben (die haben eigene Motive), kurz für Kinder/Handy
    if 'mate' in p['themes'] or p['steps'] > MAX_TACTIC_STEPS:
        return False
    if 'keys' in m:
        return key_piece(p['fen'], p['moves']) in m['keys']
    return True


def quality(p):
    return (-p['pop'], -p['plays'], p['id'])


def spread_pick(cands, n):
    """n Aufgaben gleichmäßig über R_MIN..R_MAX: je Zielwertung die beste Aufgabe im Fenster, Fenster bei Bedarf wachsen lassen."""
    width = (R_MAX - R_MIN) / n
    left = sorted(cands, key=quality)
    chosen = []
    for i in range(n):
        target = R_MIN + width * (i + 0.5)
        half = width / 2
        pick = None
        while pick is None and half <= (R_MAX - R_MIN):
            win = [p for p in left if abs(p['rating'] - target) <= half]
            if win:
                pick = win[0]  # left ist nach Qualität sortiert
            half *= 2
        if pick is None:
            break
        chosen.append(pick)
        left.remove(pick)
    return sorted(chosen, key=lambda p: (p['rating'], p['id']))


def main():
    ensure_cache()
    pool = {POP_MIN: load(POP_MIN)}
    used_ids, used_games = set(), set()
    result = {}
    for m in MOTIFS:
        pick = []
        for pop_min in (POP_MIN, POP_FALLBACK):
            if pop_min not in pool:
                pool[pop_min] = load(pop_min)
            cands = [p for p in pool[pop_min] if p['id'] not in used_ids and p['game'] not in used_games and eligible(m, p)]
            pick = spread_pick(cands, PER_MOTIF)
            if len(pick) >= PER_MOTIF:
                break
        if len(pick) < MIN_PER_MOTIF:
            sys.exit(f'Motiv {m["id"]}: nur {len(pick)} Aufgaben')
        for p in pick:
            used_ids.add(p['id'])
            used_games.add(p['game'])
        result[m['id']] = pick
        print(f'{m["id"]:14s} {len(pick):3d}  {pick[0]["rating"]}–{pick[-1]["rating"]}  (Kandidaten {len(cands)})', file=sys.stderr)
    write(result)


def js_str(s):
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"


def write(result):
    total = sum(len(v) for v in result.values())
    lines = [
        '// Taktik-Aufgaben für den Schach-Trainer – ERZEUGT mit tools/build_puzzles.py, nicht von Hand bearbeiten.',
        '//',
        f'// Quelle:  Lichess-Puzzle-Datenbank, {URL}',
        '//          (Übersicht: https://database.lichess.org/#puzzles)',
        '// Lizenz:  CC0 1.0. database.lichess.org schreibt (geprüft am 04.10.2026):',
        '//          „Database exports are released under the Creative Commons CC0 license.',
        '//           Use them for research, commercial purpose, publication, anything you like.“',
        '// Stand:   Export vom 02.10.2026 (Last-Modified laut Server), abgerufen am 04.10.2026;',
        f'//          Stichprobe = die ersten {HEAD_LINES:,} Zeilen der nach PuzzleId sortierten CSV.'.replace(',', '.'),
        f'// Filter:  Rating {R_MIN}–{R_MAX}, RatingDeviation ≤ {RD_MAX}, Popularity ≥ {POP_MIN} (notfalls ≥ {POP_FALLBACK}), NbPlays ≥ {PLAYS_MIN};',
        f'//          je Motiv bis {PER_MOTIF} Aufgaben, gleichmäßig über die Wertung gestreut (je Zielwertung die beliebteste),',
        '//          jede Aufgabe und jede Ursprungspartie nur einmal; Motive 1–8 ohne Matt-Aufgaben und mit höchstens',
        f'//          {MAX_TACTIC_STEPS} Spielerzügen, Grundreihenmatt höchstens 3, Matt in N genau N Spielerzüge.',
        '//          Gabel = Schlüsselzug mit Springer/Bauer, Doppelangriff = mit Dame/Turm/Läufer/König (beides Lichess „fork“).',
        '//          „verteidiger“ statt Überlastung: Lichess hat kein Thema „overloading“; verwendet wird „capturingDefender“ (Verteidiger beseitigen).',
        f'// Umfang:  {total} Aufgaben.',
        '//',
        '// PUZZLES-Zeile: [id, fen, uciMoves, rating, motifId]',
        '//   fen = Stellung VOR dem Gegnerzug; uciMoves: erster Zug = Gegner, danach abwechselnd Spieler / Antwort.',
        '',
        'export const MOTIFS = [',
    ]
    for m in MOTIFS:
        lines.append(f"  {{ id: {js_str(m['id'])}, name: {js_str(m['name'])}, themes: [{', '.join(js_str(t) for t in m['themes'])}],")
        lines.append(f"    intro: {js_str(m['intro'])},")
        lines.append(f"    hint: {js_str(m['hint'])} }},")
    lines.append('];')
    lines.append('')
    lines.append('// [id, fen, uciMoves (Leerzeichen-getrennt, erster = Gegnerzug), rating, motifId]')
    lines.append('export const PUZZLES = [')
    for m in MOTIFS:
        for p in result[m['id']]:
            lines.append(f"  [{js_str(p['id'])}, {js_str(p['fen'])}, {js_str(' '.join(p['moves']))}, {p['rating']}, {js_str(m['id'])}],")
    lines.append('];')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print(f'{os.path.relpath(OUT, ROOT)}: {total} Aufgaben, {os.path.getsize(OUT)} Bytes', file=sys.stderr)


if __name__ == '__main__':
    main()

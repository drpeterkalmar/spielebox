# Spielebox n11 – ehrliches „Wer gewinnt?“ und „💡 Tipp“

Stand 29.10.2026 · Spielen: https://drpeterkalmar.github.io/spielebox/
Auftrag: Peter 28.10.2026 – „Reversi-Gewinnberechnung ist irreführend“ und „Bitte einen Tipp einblenden, ich werde in
Serie vernichtet. Auch bei anderen Spielen XD“. Zwei Etappen, je ein eigener Release: **A = 0.11.0**, **B = 0.12.0**.

## Kurz (in Alltagssprache)

**Etappe A – „Wer gewinnt?“ sagt jetzt, was es weiß, und nur das:**
- **Sicher ist sicher.** Hat der Computer das Spielende durchgerechnet, steht da nicht mehr „75 % Gewinnchance“,
  sondern **„Sieg sicher bei bestem Spiel (+10)“**, „Niederlage droht (−8)“ oder „Remis bei bestem Spiel“. Der Balken
  steht dann bei 99 % bzw. 1 %. Das gilt für alle Spiele, die so etwas beweisen können (Reversi, Vier gewinnt,
  Schach-Matt).
- **Reversi rechnet viel früher genau:** bei 12 leeren Feldern (vorher 8) die genaue Steinzahl, und meist schon ab
  etwa 16 leeren Feldern, wer gewinnt. Das dauert am Handy höchstens etwa eine Fünftelsekunde. Danach gibt der Rechner
  auf und es bleibt bei der Schätzung.
- **Prozentzahlen gemessen statt geraten:** Wie sicher eine Schätzung ist, habe ich an 600 Reversi-Partien und je
  150–500 Partien der anderen Spiele nachgemessen. Wo die alte Umrechnung deutlich daneben lag, ist sie jetzt angepasst.
- **Richtige Wörter:** Reversi zeigt im Mittelspiel „Vorteil +5“ statt „+5 Steine“. Die Zahl ist eine Schätzung und kein
  Steinstand, deshalb passte „Steine“ nicht neben den echten Steinstand 9:20. Die Einheit steht nur noch, wo sie
  stimmt. Antippen/Hilfetext: „Schätzung; ab 12 leeren Feldern exakt gelöst, meist schon ab 16 bewiesen, wer gewinnt“.

**Etappe B – „💡 Tipp“ in allen 15 Spielen:**
- Neben „Wer gewinnt?“ steht der Knopf **„💡 Tipp“**. Antippen, kurz „denkt …“, dann leuchten auf dem Brett hellblaue
  Ringe: das Ziel (durchgezogen), bei Zügen von A nach B auch der Start (gestrichelt), rot, was geschlagen wird. Bei
  Würfel- und Kartenspielen leuchtet der Knopf bzw. das Feld („Würfeln“, „Stehen“, „Große Straße“, „Mitgehen“). In der
  Status-Zeile steht ein kurzer Grund, wenn er sicher stimmt: „a1: Ecke sichern“, „lässt dem Gegner nur 2 Züge“,
  „Dxf7#: setzt matt“, „schließt eine Mühle“/„verhindert eine Mühle“, „Große Straße: +40“, „gewinnt den Stich“,
  „Mitgehen – 43 % Chance, nötig 26 %“. Kein Satz ist besser als ein falscher, daher steht bei Halma oder Paare oft nur
  die Markierung.
- **Der Tipp zieht nie selbst.** Ziehen musst du; nach deinem Zug ist die Markierung weg.
- Quelle ist der **starke Computer** (Stufe 3, ohne absichtliche Fehler, gleiche Rechenzeit). Er sieht **nur, was du
  siehst**: keine fremden Karten, keine fremden Schiffe (geprüft: gleicher Tipp, egal wie die verdeckten Karten liegen).
  Beim Aufstellen der Schiffe gibt es keinen Tipp, weil jede erlaubte Aufstellung gleich gut ist.
- Gegen den Computer und zu zweit am Gerät immer da. **Online** nur, wenn der Gastgeber beim Tisch „Tipps am
  Online-Tisch erlauben“ einschaltet (Standard aus); dann sehen alle in der Spielerleiste, wie viele Tipps jemand
  genommen hat („💡 3“).
- Abschalten: *Einstellungen → Tipp-Knopf* (oder Link `?tipp=0`). Die Statistik zählt genutzte Tipps je Spiel.
- **Warum du „in Serie vernichtet“ wirst:** Die Lobby steht auf „Mittel“. Dagegen gewinnt ein schwacher Spieler in
  fast allen Spielen unter 10 % (Messung unten). Gegen **„Leicht“** gewinnt er jetzt überall mindestens 35 %
  (Backgammon und Paare habe ich dafür entschärft). Die Lobby schreibt das ehrlich dazu: Leicht „macht Fehler“, Mittel
  „schwer“, Stark „sehr stark“. **Empfehlung: „Leicht“ plus Tipp-Knopf.**

## Etappe A (0.11.0) – Messungen

### A1 Kennzeichen „exakt“
`evaluateInfo(state, seat)` liefert `{ x, exact }` (Reversi zusätzlich `wld`: nur Sieg/Remis/Niederlage bewiesen, ohne
Steinzahl), `evalPosition` liefert `{ x, p, exact }`. Exakt sind: Partie aus, Reversi gelöst, Vier gewinnt mit
bewiesenem Gewinn (bisher ±99), Schach mit gefundenem Matt (bisher ±99, „Matt in Sicht“ bleibt). Bei exakt: `p` = 99 % /
1 % / 50 %, Text ohne Prozentzahl (`evalText` in `src/evalpos.js`, auch im Schach-Trainer). Bewiesene Ergebnisse
stehen ohne das vorangestellte „Wer gewinnt?“, damit der Satz am Handy in eine Zeile passt.

### A2 Exakter Löser Reversi
Neuer Löser in `src/games/reversi/engine.js` (`solveExact`): Ecken zuerst, sonst „Fastest First“ (Züge, nach denen der
Gegner am wenigsten Antworten hat), ab 5 leeren Feldern ohne Sortierung. Statt einer Uhr gibt es ein **Knotenbudget**
(150 000 Knoten): Dieselbe Stellung ergibt auf jedem Gerät dasselbe, und das Budget passt zur Zeitvorgabe.
Messung `node tools/n11/rv_solve_bench.mjs` (Mac mini M1, Node 24, je 200 Stellungen aus Partien Stufe 2 gegen 2,
`docs/n11/rv_solve_bench.json`):

| leere Felder | Median ms | p95 ms | Median Knoten | p95 Knoten |
|---|---|---|---|---|
| 8 | 0,25 | 0,72 | 753 | 2 176 |
| 10 | 1,3 | 3,8 | 4 037 | 11 869 |
| 11 | 3,1 | 10,9 | 9 436 | 34 893 |
| **12** | **8,4** | **30,7** | 25 816 | 98 336 |
| 13 | 19,1 | 66,1 | 57 138 | 208 126 |
| 14 | 50,3 | 154,7 | 149 682 | 488 981 |
| 15 | 136,9 | 545,9 | 384 428 | 1 579 219 |

Mittelklasse-Handy ≈ 4× langsamer als der M1 (wie in n6/n9 mit 4× gedrosselter CPU): 200 ms am Handy ≈ 50 ms am Mac ≈
150 000 Knoten. **Ziel 12 erreicht:** p95 31 ms (≈ 125 ms am Handy); bei 12 leeren Feldern reicht das Budget in ≈ 99 %
der Stellungen. Bei 13 wäre p95 schon 66 ms (≈ 265 ms am Handy). Daher `SOLVE_EMPTIES = 12`.
**Zusatz:** Von 13 bis 18 leeren Feldern wird mit demselben Budget nur bewiesen, wer gewinnt („Nullfenster“, viel
schneller). Im Budget sind bei 14 leeren Feldern 99 %, bei 15 91 %, bei 16 73 %, bei 17 49 %, bei 18 30 %. Steht es fest,
zeigt die Anzeige „Sieg sicher bei bestem Spiel“ ohne Zahl. Regler: `?solve=N` (höchstens N leere Felder genau, bis
N+6 nur wer gewinnt; `?solve=0` = nur Schätzung). Der starke Computer (Stufe 3) ist unverändert.

### A3 Kalibrierung
Werkzeug: `node tools/n11/kalibrieren.mjs --game=<spiel> --n=<partien>` (Selbstspiel Stufe 3 gegen Stufe 2 und
Stufe 3, beide Seiten, Zufallszüge in der Eröffnung, Rechenzeit wie `tools/selfplay.mjs` 15/40/120 ms), Auswertung
`node tools/n11/kalib_fit.mjs` (Ergebnis `docs/n11/kalibrierung.json`). Die Kurve p = 1/(1+e^(−k·x)) wird per
Brier-Score auf der einen Hälfte der Partien angepasst und auf der **anderen Hälfte** geprüft (Brier = mittlerer
quadratischer Fehler der Prozentzahl gegen das Ergebnis: 0 = perfekt, 0,25 = immer 50 %).

**Reversi** (600 Partien, 36 585 Stellungen, davon 29 % bewiesen):

| Prüfhälfte | Brier |
|---|---|
| immer 50 % | 0,2459 |
| **vorher** (alte Zahl, bis 8 leere exakt, Kurve x/9 für alles) | **0,1759** |
| nur neue Exakt-Regel (12 genau + 13–18 wer gewinnt), alte Kurve | 0,1557 |
| + eine Steilheit für alles (k = 0,209) | 0,1526 |
| **+ Steilheit je Spielphase (eingebaut)** | **0,1491** (−15 %) |

| leere Felder | vorher | nachher | Steilheit k (vorher 0,111) |
|---|---|---|---|
| 13–16 | 0,152 | 0,051 | 0,118 |
| 17–20 | 0,160 | 0,140 | 0,254 |
| 21–28 | 0,177 | 0,160 | 0,296 |
| 29–36 | 0,194 | 0,173 | 0,296 |
| 37–44 | 0,217 | 0,207 | 0,238 |
| 45–60 | 0,246 | 0,245 | 0,064 |

Überraschung: Im Mittelspiel war die alte Kurve **zu vorsichtig**. Übersicher ist die Schätzung nur kurz vor dem Ende
und in der Eröffnung, also genau dort, wo Hermes den Fehler gesehen hat. Die eingebaute Kurve (Stützstellen in der
Mitte jeder Spalte, dazwischen linear, `RV_STEIL` in `src/evalpos.js`) trägt dem Rechnung.
Grenze der Messung: Kalibriert ist auf Computer gegen Computer. Gegen einen schwächeren Menschen sind dieselben Zahlen
eher zu vorsichtig, weil Fehler häufiger sind und die Seite, die vorne liegt, öfter gewinnt.

**Die anderen Spiele** (eine Steilheit je Spiel; „je Phase“ ist dort nicht übernommen: Die Phase war als Anteil an der
späteren Partielänge gemessen, und die kennt die App während der Partie nicht). Übernommen wird eine neue Kurve nur,
wenn der Brier-Score um mindestens 0,005 besser wird:

| Spiel | Partien | Stellungen | Brier vorher | Brier kalibriert | Brier eingebaut | k vorher → k neu | Entscheidung |
|---|---|---|---|---|---|---|---|
| Schach | 300 | 2755 | 0,0910 | 0,0703 | 0,0703 | 0,5756 → 0,1571 | übernommen |
| Mühle | 500 | 26628 | 0,1241 | 0,1176 | 0,1176 | 0,7 → 0,4304 | übernommen |
| Dame | 400 | 27464 | 0,1500 | 0,1441 | 0,1441 | 0,55 → 1,1081 | übernommen |
| Backgammon | 500 | 38126 | 0,2403 | 0,2290 | 0,2291 | 0,0714 → 0,0456 | übernommen |
| Halma | 500 | 39925 | 0,1401 | 0,1346 | 0,1346 | 0,1111 → 0,1562 | übernommen |
| Schnapsen | 150 | 33858 | 0,1493 | 0,1532 | 0,1493 | 0,55 → 0,2053 | bleibt |
| Ludo | 500 | 154813 | 0,2469 | 0,2165 | 0,2165 | 0,0714 → 0,019 | übernommen |
| Schiffe versenken | 500 | 39249 | 0,2174 | 0,2175 | 0,2174 | 0,2857 → 0,3275 | bleibt |
| Paare finden | 500 | 21638 | 0,1984 | 0,1897 | 0,1897 | 0,6667 → 0,396 | übernommen |
| Würfelglück | 500 | 50085 | 0,1830 | 0,1830 | 0,1830 | 0,0455 → 0,0431 | bleibt |
| Mau-Mau | 500 | 10582 | 0,2355 | 0,2245 | 0,2246 | 0,625 → 0,2023 | übernommen |
| Vier gewinnt | 500 | 17956 | 0,1742 | 0,1720 | 0,1742 | 0,125 → 0,0519 | bleibt |

Hold'em ist nicht dabei (dort ist die Zahl schon eine Gewinnchance aus Monte-Carlo). Einschränkungen: Schach nur jede
~8. Stellung (die Anzeige rechnet je Stellung 160 ms) und viele Remis zwischen Computern mit kurzer Denkzeit – die neue,
flachere Kurve (+1 Bauer ≈ 54 %, +4 ≈ 65 %) gilt für dieses Spielniveau; Schnapsen nur 150 Partien (je Partie bis
7 Bummerl). Vier gewinnt: 20 % der Stellungen sind bewiesen; die angepasste Kurve wäre nur 0,002 besser – bleibt.

### A4 Gate (Hermes' Probe)
`tools/n11/rv_eval_hermes.mjs` ist Hermes' Skript (3 Zufallspartien). Unverändert misst es nicht mehr das, was die App
zeigt: Es schickt jede Zahl durch die Kurve, auch die exakten (vorher/nachher: `docs/n11/rv_probe_hermes_*.txt`).
Deshalb dasselbe Verfahren über 300 Partien mit der echten Anzeige (`evalPosition().p`): `node tools/n11/rv_gate.mjs
--spiel=zufall|stufe2 [--root=<alter Stand>]`. „Echt“ heißt: Das bewiesene Ergebnis hat sich zwischen den beiden
Stellungen geändert, der Zug davor hat also einen Sieg verschenkt. Dann muss die Anzeige springen.

| 300 Partien | Zufallszüge vorher | Zufallszüge nachher | Stufe 2 vorher | Stufe 2 nachher |
|---|---|---|---|---|
| 9 → 8 leer: ohne Sprung > 25 Punkte | 62,7 % | 75,0 % | 59,2 % | **93,6 %** |
| 9 → 8 leer: ohne Sprung, ohne echte Wechsel | 67,1 % | **100 %** | 60,7 % | **100 %** |
| exakt gewonnene Stellungen mit ≥ 97 % | 15 % | **100 %** | 39 % | **100 %** |
| Übergang Schätzung → bewiesen: falsche Seite vorn (> 55 %) | 21,3 % | 12,3 % | 18,9 % | 19,5 % |

Gate „≥ 90 % ohne Sprung > 25 bei 9 → 8“: **erfüllt bei Spiel auf Stufe 2 (93,6 %)**. Bei reinen Zufallszügen sind es
75 %. Die restlichen 25 % sind ausschließlich echte Wechsel: Der Zufallsspieler verschenkt in einem Viertel der Partien
genau dort einen sicheren Sieg, und die Anzeige springt dann zu Recht. Anzeige-Sprünge ohne echten Grund gibt es von 9 auf
8 keine mehr (100 %). Gate „exakt gewonnen ≥ 97 %“: **erfüllt (100 %)**.
Ehrlich: Der Übergang von Schätzung zu „bewiesen“ liegt jetzt meist bei 14–17 leeren Feldern statt bei 9→8. Dort springt
der Balken weiterhin, typischerweise von 70–80 % auf „Sieg sicher“. Das ist ein Gewinn an Wissen und keine
Fehlanzeige. Dass die Schätzung davor auf der falschen Seite lag, kommt bei Stufe-2-Spiel in 19,5 % der Partien vor
(vorher 18,9 %). Das ist die Unsicherheit, die eine 60–80-%-Schätzung ehrlich hat.

### A5 Tests
`tests/node/n11_eval.test.mjs` (in `npm test`): Löser = einfacher Minimax ohne Schnitte (60 Stellungen 5–8 leer),
evaluateInfo exakt bis 12 / wer gewinnt 13–18 (Vorzeichen = volle Lösung) / darüber Schätzung, `?solve`, Knotenbudget,
Vier-Beweis, 99 %/1 %/50 % und Texte, „Vorteil“ statt „Steine“, alle Kurven monoton, symmetrisch, 50 % bei 0 (Reversi je
leere Felder 0–60). Browser: `python3 tests/smoke_n11.py eval` (Reversi bis ins Endspiel: „Vorteil …“, dann „Sieg sicher
bei bestem Spiel (+N)“ in einer Zeile, 0 Fehler), Bild `tests/shots/n11/eval_reversi_sicher.png`.

## Etappe B (0.12.0) – „💡 Tipp“

### B1 Aufbau
- `src/tipp.js` (rein, ohne DOM): `suggest(game, gs, seat)` gibt dem Computer **Stufe 3, `fehler: 0`, Rechenzeit wie
  Stufe 3** (`TIME[3]` = 1,2 s) die **Sicht des Spielers** (`viewFor` bei allen Spielen mit verdeckten Informationen) und
  liefert `{ move, marks, acts, els, text }`. `explain()` je Spiel macht daraus Markierungen (Feld/Karte/Stein über
  `view.target()`), leuchtende Knöpfe (`data-act`), leuchtende Felder (Würfelglück-Kategorie) und einen kurzen Grund. Gründe gibt es
  nur, wo sie sich sicher aus dem Zug ableiten lassen (Reversi Ecke / Gegner muss passen / nur N Züge / dreht N um; Schach
  SAN + matt/Schach/schlägt; Mühle schließt/verhindert eine Mühle; Dame schlägt N; Vier gewinnt sofort/verhindert eine Vier;
  Backgammon wirft raus; Ludo wirft raus; Würfelglück halten bzw. Feld + Punkte; Schnapsen gewinnt/gibt den Stich ab,
  20/40, Zudrehen; Mau-Mau Wunsch/„Mau“; Blackjack Summe gegen die offene Bankkarte; Hold'em Gewinnchance gegen
  zufällige Hände + Pot-Odds, aus den eigenen Karten und dem Board, mit festem Zufall je Sicht).
- Läuft im Bot-Worker (`botworker.js`, Nachricht `tipSeat`), ersatzweise im Hauptthread (`botclient.suggestMove`).
- Tisch (`src/ui/tablescreen.js`): Knopf „💡 Tipp“ neben „Wer gewinnt?“ in einer gemeinsamen Gruppe. Er ist nur aktiv, wenn
  ich am Zug bin, sein Platz bleibt sonst frei (kein Springen). Während der Rechnung steht „💡 denkt …“. Ergebnis:
  hellblaue pulsierende Ringe in einer Ebene über dem Brett (`pointer-events: none`, nur `transform`/`opacity` animiert),
  der Grund ersetzt den Status-Text. Ein neuer Stand (eigener Zug, Würfeln, Gegner) löscht alles. Hellblau statt Gold, weil
  Gold schon „letzter Zug“ heißt; bei Mühle sah man das im ersten Entwurf nicht auseinander.
- Sonderfälle: Blackjack setzt der Computer manchmal krumme Beträge (6). Der Tipp markiert dann den nächstliegenden
  Einsatz-Knopf (5). Schiffe versenken: beim Aufstellen kein Tipp (Hinweis „jede erlaubte Aufstellung ist gleich gut“).
- Online: Tisch-Option „Tipps am Online-Tisch erlauben“ (Gastgeber, Standard aus, gilt auch für „Anderes Spiel“ am
  selben Tisch). Jeder genutzte Tipp geht als Tisch-Kommando `tipp` an den Schiedsrichter. Der zählt nur, wenn erlaubt,
  und alle sehen „💡 N“ in der Spielerleiste. Gegen den Computer und zu zweit am Gerät zählt der Tipp ebenso (sichtbar),
  ist aber immer erlaubt. Neue Partie = Zähler auf 0.
- Einstellungen: „Tipp-Knopf zeigen“ (Standard an, `tipOn`), Link `?tipp=0`. Statistik: „💡 Tipps genutzt: Reversi 3, …“.
- Schach-Trainer: hat eigene Hilfen (Pfeil, leuchtende Figur) und **keinen** Tipp-Knopf. Die Texte von „Wer gewinnt?“ sind
  angeglichen (gleiche Wortwahl, `evalText`).
- Status-Zeile quer: Status-Text bricht im eigenen Knopf um (≤ 2 Zeilen, 48 px), „Wer gewinnt?“ schrumpft bei schmaler
  Seitenspalte (Schiffe versenken: 277 px), damit kein Knopf aus dem Bild ragt (gefunden von `smoke_n4.py schiffe`).

### B2 Zusatz-Messung „in Serie vernichtet“
`node tools/selfplay.mjs --pairs=0:1,0:2,-1:1 --n=200` je Spiel (Rechenzeit 15/40 ms wie n10, Fehlerquote der leichten
Stufe 0,15 wie in der App, `docs/n11/schwach_stufen.json`). Stufe 0 = **schwacher Spieler**: nimmt den Zug, der
nach der einfachen Stellungsbewertung der Engine sofort am besten aussieht, ohne vorauszurechnen. Für Spiele, in denen
das nichts Menschliches misst, gibt es einen eigenen Anfänger (¹): Paare merkt sich die letzten 2 Karten, Schiffe
schießt zufällig und nach einem Treffer auf die Nachbarfelder, Schnapsen sagt immer 20/40 an und sticht mit der
billigsten Karte, die den Stich holt. Ziel: gegen „Leicht“ ≥ 35 %. Prozent = Partien gewonnen (Remis ½), [95-%-Bereich].

| Spiel | schwacher Spieler gegen Leicht vorher | … nachher | gegen Mittel | Zufallszüge gegen Leicht | Änderung |
|---|---|---|---|---|---|
| Mühle | 42,0 % [35–49] | **42,0 % [35–49]** | 0,0 % [0–0] | 3,5 % [1–6] | – |
| Dame | 59,5 % [53–66] | **59,5 % [53–66]** | 0,0 % [0–0] | 57,0 % [50–64] | – |
| Schach | 36,5 % [30–43] | **36,5 % [30–43]** | 0,5 % [0–2] | 0,3 % [0–1] | – |
| Schnapsen | 96,5 % [94–99]¹ | **96,5 % [94–99]** | 0,5 % [0–2] | 0,0 % [0–0] | – |
| Backgammon | 17,5 % [12–23] | **42,5 % [36–49]** | 1,5 % [0–3] | 21,5 % [16–27] | Leicht wählt aus den besten 90 % statt 50 % der Züge |
| Halma | 100,0 % [100–100] | **100,0 % [100–100]** | 3,5 % [1–6] | 0,0 % [0–0] | – |
| Ludo | 69,5 % [63–76] | **69,5 % [63–76]** | 26,5 % [20–33] | 54,0 % [47–61] | – |
| Schiffe versenken | 56,5 % [50–63]¹ | **56,5 % [50–63]** | 7,0 % [4–10] | 1,5 % [0–3] | – |
| Vier gewinnt | 56,0 % [49–63] | **56,0 % [49–63]** | 0,0 % [0–0] | 0,0 % [0–0] | – |
| Mau-Mau | 52,5 % [46–59] | **52,5 % [46–59]** | 37,0 % [30–44] | 4,5 % [2–7] | – |
| Würfelglück | 58,8 % [52–66] | **58,8 % [52–66]** | 7,5 % [4–11] | 8,5 % [5–12] | – |
| Reversi | 93,2 % [90–97] | **93,2 % [90–97]** | 0,0 % [0–0] | 17,5 % [12–23] | – |
| Paare finden | 10,0 % [6–14]¹ | **50,0 % [43–57]** | 0,7 % [0–2] | 7,0 % [4–10] | Leicht merkt sich 2 statt 3 Karten |

¹ eigener Anfänger statt „gierig“ (siehe oben); „vorher“ mit demselben Anfänger gegen die alte leichte Stufe.
Nur Backgammon (17,5 %) und Paare (10 %) lagen unter dem Ziel; geändert ist nur Stufe 1, Stufe 2/3 sind unverändert.
Backgammon zum Vergleich mit 600 Partien: Auswahl aus den besten 50 % → 17 %, 75 % → 34,5 %, 80 % → 33,2 %, **90 % →
41,3 %** (übernommen). Schach liegt mit 36,5 % knapp über dem Ziel, Mühle 42 %.

### B3 Tests
- `tests/node/n11_tipp.test.mjs` (in `npm test`): **Tipp = Bot-Zug** (Stufe 3, `fehler 0`, `timeMs` = Stufe 3, Sicht =
  `viewFor`) für alle 15 Spiele (60 Stellungen); mit dem echten Computer erlaubter Zug, Markierung/Knopf/Text passend;
  **Tipp zieht nie** (Zustand bitgleich vorher/nachher); **Fair Play**: Schnapsen, Mau-Mau, Hold'em, Blackjack, Paare,
  Schiffe – verdeckte Karten/Talon/Schuh/Flotte vertauscht (Sicht bewiesen gleich): Computer bekommt dasselbe, Tipp
  identisch (Blackjack/Paare zusätzlich mit dem echten Computer), je 12 Stellungen; kein Tipp, wenn jemand anderes dran ist.
- `tests/node/online.test.mjs`: ohne Erlaubnis kein Tipp, mit Erlaubnis zählen beide Geräte mit, Revanche setzt zurück,
  gegen den Computer immer.
- Browser `python3 tests/smoke_n11.py [tipp] [alle] [eval]` (Pixel 7 hoch/quer, stumm): Reversi, Schach, Mühle, Schnapsen,
  Würfelglück per echtem Tippen hoch und quer – Markierung sichtbar, Züge vorher = nachher (zieht nicht), ich bleibe am
  Zug, Grund in der Status-Zeile, Brett und Status-Zeile springen nicht, Ringe im Bild und durchlässig, empfohlener
  Zug erlaubt, nach dem Zug weg, „💡 1“ in der Leiste; alle 15 Spiele hoch; 0 Seitenfehler. Grün, ebenso `smoke.py`,
  `smoke_n2.py`, `smoke_n4.py`, `smoke_n5.py` und `npm test` (alles inkl. Schwarm, 1 005 s).
- Bilder (selbst angesehen): `tests/shots/n11/n11_tipp_hoch.jpg`, `n11_tipp_quer.jpg`, `n11_tipp_alle.jpg`,
  `n11_eval_lobby.jpg`.

## Handy-Testhinweise (für Peter)
1. Lobby → Reversi → „Leicht“ (neu: Untertitel) → Spielen. Unten „💡 Tipp“ antippen: Ein hellblauer Ring zeigt das Feld,
   darüber z. B. „💡 a1: Ecke sichern“. Nichts wird gezogen. Ziehen, und der Ring ist weg. In der Leiste steht „💡 1“.
2. Reversi bis ins Endspiel: Ab etwa 16 leeren Feldern steht statt Prozent „Sieg sicher bei bestem Spiel“ bzw.
   „Niederlage droht“, ab 12 mit Steinzahl („(+10)“). Im Mittelspiel „Wer gewinnt? Vorteil +5“, nicht mehr „Steine“.
3. Würfelglück: nach dem Würfeln „Tipp“ → Ringe um die Würfel zum Halten, „Würfeln“ leuchtet, oder das Feld leuchtet.
4. Schnapsen/Hold'em: Der Tipp nennt nur, was du selbst siehst (Hold'em: „Mitgehen – 43 % Chance, nötig 26 %“).
5. Quer halten: Knopf und Ringe passen, nichts springt.
6. Online: Beim Tisch-Aufmachen „Tipps am Online-Tisch erlauben“; ohne das gibt es online keinen Tipp-Knopf.
7. Abschalten: ⋯ → Einstellungen → Tipp-Knopf „aus“.

## Grenzen
- Kalibriert ist auf Computer gegen Computer (kurze Denkzeit). Gegen Menschen ist die Prozentzahl eine gute Schätzung,
  kein Versprechen. Bewiesene Ergebnisse gelten nur bei bestem Spiel ab jetzt.
- Der Tipp rechnet bis zu 1,2 s (wie Stufe 3); in der Zeit steht „💡 denkt …“.
- Hermes' Probe-Skript misst die exakten Stellungen über die Kurve statt über die Anzeige, darum gibt es zusätzlich
  `tools/n11/rv_gate.mjs`.


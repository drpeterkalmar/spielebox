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

## Etappe B (0.12.0)

Folgt: „💡 Tipp“ in allen Spielen.


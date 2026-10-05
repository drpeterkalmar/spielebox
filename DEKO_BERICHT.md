# Spielebox – Verschönerung („Deko“), Bericht n7

Stand 05.10.2026 · Version **`e88d221e7e`** (live) · Spielen: https://drpeterkalmar.github.io/spielebox/

> **Etappe 1 + Teil 2 auf omen16 gebaut, Abschluss am Mac.** Etappe 1 (`65bce6a`) ging von omen16 aus live.
> Etappe 2 lag als Zwischenstand auf dem Zweig `omen-n7-wip` (`4d751eb`), als Peter den Rechner um ~19:05 abgeschaltet hat.
> Am Mac wurde dieser Stand übernommen, geprüft, an zwei Stellen repariert, gemessen und live gestellt (`d943f11`).

## Was ist neu (in Alltagssprache)

**Überall**
- Der Tisch ist jetzt **Filz mit warmem Licht von oben** und dunkleren Rändern statt einer flachen grünen Fläche.
- Die Bretter haben einen **Holzrahmen mit Schliff und Lackglanz**, die Steine **glänzen und werfen einen weichen Schatten**
  (Mühle, Dame, Reversi, Backgammon, Halma-Murmeln, Ludo-Kugeln, Vier-gewinnt-Scheiben). Die Würfel haben Tiefe.
- **Neuer Kartenrücken** (rot mit goldener Sonne), Karten mit weichem Schatten und Glanz. Bei „Paare finden“ drehen sich
  die Karten jetzt richtig um.
- **Kleine Effekte direkt im Spiel:** Staub beim Schlagen, Funken bei einer Mühle, einem Paar oder einer Gewinnreihe, Sterne,
  wenn eine Dame entsteht oder eine Ludo-Figur ins Ziel kommt, Explosion und Spritzer bei „Schiffe versenken“.
- **Sieg-Animation:** kurz Konfetti (≈ 3 s, nur einmal), dazu etwas Eigenes je Spiel (die Gewinnreihe hüpft, der König kippt,
  Chips oder Bohnen regnen …).
- **Karten fliegen im Bogen** (Mau-Mau, Schnapsen): Eine gespielte oder gezogene Karte hebt sich, dreht sich leicht und
  landet in einem flachen Bogen. Das dauert genauso lange wie vorher.

**Lobby (neu in Etappe 2)**
- Die Kacheln wirken **plastisch** (Papier mit Licht von oben, leichte Tiefe). Jede Spiel-Art hat einen eigenen,
  zarten **Lichtfleck**: grün für Kartenspiele, blau für Vier gewinnt und Schiffe, rot für Ludo.
- Die Bildchen haben **Glanz und eine helle Kante**. Beim ersten Öffnen erscheinen die Kacheln kurz nacheinander,
  einmal pro Sitzung.

**Einzelne Spiele (neu in Etappe 2)**
- **Blackjack:** Der Einsatz liegt als **Bohnen-Häufchen** neben den Karten.
- **Schnapsen:** „Atout: …“ steht auf einem **dunklen Schild mit Goldrand**.
- **Ludo:** Die Häuser haben eine eingelassene Kante. **Hold'em:** Die Chips sind vorgezeichnet (sehen gleich aus, sind sparsamer).
- **„Wer gewinnt?“-Leiste** am Brettrand ist **gedrechselt** statt ein flacher Strich. **Meldungen** haben einen warmen Rand.

**Unsichtbar, aber wichtig:** Häufige Steine, Kugeln, Chips, Bohnen und Würfel werden einmal als kleines Bild
vorgezeichnet. So muss das Handy pro Stein ein Bild malen statt bis zu sieben Formen mit Verläufen.

## Einstellungen und A/B-Vergleich

In der App unter **Einstellungen → Optik** (Lobby unten oder am Tisch über ⋯ → Computer-Tempo): *Verziert* (Standard), *Ruhig* (Licht und Material, keine Funken), *Klassisch* (altes Aussehen).
Bei „Bewegung reduzieren“ am Handy gibt es keine Funken und kein Wackeln. Ruckeln Effekte, nimmt die App sie selbst
stufenweise zurück.

Zum direkten Vergleich, gleiches Spiel in zwei Tabs:
- **Altes Aussehen:** https://drpeterkalmar.github.io/spielebox/?deko=0
- Nur Licht und Material: https://drpeterkalmar.github.io/spielebox/?deko=1
- **Neues Aussehen:** https://drpeterkalmar.github.io/spielebox/?deko=2 (oder ohne Zusatz)

## Messung (Budget: p95 höchstens +10 %, Ladegröße höchstens +1 MB)

Gemessen wird abwechselnd das alte Aussehen (`deko=0`) und das neue (`deko=2`) mit demselben Code, denselben Zügen
(fest gesäter Zufall) und je 2 Durchläufen (Median). Werkzeug: `tests/deko_perf.py`.

**Mac mini (Abschluss, 05.10. abends) – Pixel-7-Hochformat, CPU 4× gedrosselt, Chromium über Metal**

| Szene | p50 alt → neu | p95 alt → neu | p95 Änderung | lange Frames alt → neu | CPU gesamt* alt → neu |
|---|---|---|---|---|---|
| Dame, Computer spielt (12 s) | 15,6 → 14,9 ms | 31,6 → 29,7 ms | **−6 %** | 4,3 → 3,4 % | 22,0 → 21,1 % |
| Ludo, 4 Spieler (12 s) | 15,7 → 16,0 ms | 29,8 → 28,5 ms | **−4 %** | 3,6 → 3,8 % | 18,9 → 14,0 % |
| Hold'em, 6 Plätze (12 s) | 12,1 → 11,9 ms | 27,0 → 26,7 ms | **−1 %** | 0,7 → 0,3 % | 45,6 → 40,3 % |
| Vier gewinnt, Sieg mit Konfetti (6 s) | 11,4 → 13,4 ms | 27,1 → 27,8 ms | **+2,6 %** | 0,1 → 2,3 % | 34,8 → 19,9 % |
| Lobby, Leerlauf (10 s) | – | – | gleich | – | 0,3 → 0,1 % |
| Mühle-Tisch, Leerlauf (10 s) | – | – | gleich | – | 0,1 → 0,15 % |

\* CPU gesamt = alle Chromium-Prozesse (Hauptthread, Rastern, GPU), ungedrosselt gemessen. Das ist ein Maß dafür, wie warm das
Handy wird. Im Leerlauf gibt es mit und ohne Deko **keine Dauer-Animation** (≈ 0,1 % CPU).
Hinweis: Headless-Chromium am Mac taktet die Bildfolge unruhiger als ein Handy (daher p95 ≈ 27–35 ms in *beiden* Varianten).
Aussagekräftig ist der Vergleich alt gegen neu, nicht der absolute Wert.

**omen16 (Linux, RTX 3070, Etappe 2 vor dem Handoff) – GPU über Vulkan, *ohne* CPU-Drosselung**

| Szene | p50 / p95 alt → neu | lange Frames | CPU gesamt alt → neu |
|---|---|---|---|
| Dame | 16,7 / 16,7 → 16,7 / 16,7 ms | 0 % | 17,6 → 20,2 % |
| Ludo | 16,7 / 16,7 → 16,7 / 16,7 ms | 0 % | 12,7 → 10,6 % |
| Hold'em | 16,7 / 16,7 → 16,7 / 16,7 ms | 0 % | 25,1 → 22,8 % |

**Ladegröße** (alles, was der Service-Worker für offline vorab lädt, gzip):

| Stand | Dateien | gzip |
|---|---|---|
| vor der Deko (`6f1f7fb`) | 202 | 3 694 KB |
| nach Etappe 1 (`65bce6a`) | 207 | 3 723 KB |
| jetzt (`e88d221e7e`) | 208 | 3 730 KB (**+36 KB**) |

Keine neuen externen Anfragen und keine fremden Bilder. Alles wird im Browser gezeichnet (SVG/Canvas) und läuft offline.

**Ergebnis:** Das Budget hält. p95 ist in allen Spielszenen gleich oder besser als vorher, beim Sieg +2,6 % (erlaubt +10 %).
Die Ladegröße steigt um 36 KB (erlaubt 1 MB).

## Vergleichsbilder

`tests/shots/deko/vergleich_<szene>_hoch.jpg` und `…_quer.jpg` (21 Szenen, je links alt, rechts neu): Lobby, Spieleliste,
Schach-Trainer, alle 15 Spiele, Sieg bei Vier gewinnt und Paare, Ende einer Schnapsen-Runde.

Ehrliche Einschätzung beim Ansehen:
- **Deutlich schöner:** Lobby (Kacheln mit Tiefe statt flacher Kästen), Hold'em (Lederbande, Licht auf dem Filz),
  Blackjack (Bohnen, Kartenschuh), Ludo, Vier gewinnt, Sieg-Bilder mit Konfetti.
- **Dezent:** Dame, Mühle, Schach und Reversi. Der Unterschied steckt im Licht, im Rahmen und im Glanz der Steine.
  Wer genau hinsieht, sieht ihn. Das Brett selbst bleibt bewusst ruhig und gut lesbar.
- Text, Knöpfe und Tippflächen sind unverändert und frei, die Rauchtests messen das nach.

## Geprüft (am Mac)

- `npm test`: alle Node-Tests grün (874 s). Die Spiellogik ist nicht verändert.
- Rauchtests `smoke.py`, `smoke_n2`–`smoke_n6`, `test_ludo_dice_anim.py`, `check_flip.py`: alle grün, 0 Fehler auf der Seite,
  hoch, quer und Desktop.
- Deko-Rundgang: 21 Szenen hoch und quer, alt und neu, 0 Fehler auf der Seite. Bilder selbst angesehen, dazu Standbilder mitten
  im Karten-Bogenflug (Mau-Mau, Schnapsen).
- Live: `test_live.py` grün (Version live = lokal, HTTP 200, offline, PWA, Beitritt über drei Wörter mit Dame-Zügen).

**Am Mac gefunden und behoben:**
1. **Vier gewinnt:** Wenn die vorgezeichneten Steine fertig wurden, hat der Tisch einmal neu gezeichnet. Dabei ging die gerade
   angetippte Spalte verloren, der erste Tipp war also wirkungslos. Der Rauchtest war rot. Das Extra-Neuzeichnen ist weg.
   Bis zum nächsten Zug bleibt die gleich aussehende gezeichnete Form stehen.
2. **Mau-Mau:** Der Hinweis „Gezogene Karte legen – oder ‚Weiter‘“ lag über der Beschriftung „Stapel 13“. Das war schon vor der
   Deko so. Er steht jetzt frei über der Tischmitte.
3. Mess- und Bildskripte laufen jetzt auch am Mac (CPU-Zeit ohne `/proc`, Schrift für die Collagen). Die Linux-Einstellungen von
   omen16 gelten nur unter Linux, die Mac-Einstellungen sind unverändert.

## Worauf Peter am Handy achten soll

1. **Damit die neue Version kommt:** Die Spielebox-App einmal ganz schließen (aus der App-Übersicht wischen) und neu öffnen.
   Unten in der Lobby muss die Version **`e88d221e7e`** stehen.
2. **Wärme und Akku:** Eine längere Partie Hold'em oder Ludo spielen. Fühlt sich das Handy wärmer an als sonst, unter
   Einstellungen → Optik auf *Ruhig* stellen und mir Bescheid geben.
3. **Lobby:** Kommen die Kacheln beim ersten Öffnen weich nacheinander? Wirkt es stimmig oder zu verspielt?
4. **Blackjack:** Liegen die Bohnen-Häufchen gut neben den Karten, auch bei 5–6 Spielern? Bei mehr als drei Mitspielern bekommen
   deren Plätze aus Platzgründen kein Häufchen.
5. **Mau-Mau / Schnapsen:** Fühlt sich der Bogenflug der Karten angenehm an?
6. Zum Vergleich jederzeit `?deko=0` (siehe Links oben).

## Offen / nicht gemacht

- Bogenflug nur bei Mau-Mau und Schnapsen. Blackjack und Hold'em teilen weiter mit dem bisherigen Hereinfliegen aus.
  Das wäre ein kleiner nächster Schritt.
- Die Messung ersetzt kein echtes Handy. Die Werte stammen aus emuliertem Pixel 7 mit gedrosselter CPU.

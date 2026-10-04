# Spielebox n6 – Schach-Trainer (04.10.2026)

**Live:** https://drpeterkalmar.github.io/spielebox/ → Kachel **„Schach-Trainer“** gleich neben Schach (oder direkt `…/spielebox/#trainer`).
Allein üben, offline, ohne Konto. Der Fortschritt bleibt auf dem Gerät und lässt sich unter *Fortschritt* zurücksetzen.

## Was drin ist
| Bereich | Inhalt |
|---|---|
| **Eröffnungen** | 34 Hauptlinien in 19 Familien, je 8–12 Züge, mit deutschem Namen, 1–2 Sätzen Idee und Hinweisen zu Schlüsselzügen (97 Stück). Familien: Italienisch (Giuoco Piano, Pianissimo, Evans-Gambit), Zweispringerspiel (4.Sg5, 4.d3), Spanisch (Geschlossen, Berliner Mauer, Abtausch), Schottisch (4…Sf6, 4…Lc5), Vierspringerspiel, Königsgambit, Sizilianisch (Najdorf, Drache, Sweschnikow, Taimanow, Alapin), Französisch (Vorstoß, Winawer, Tarrasch), Caro-Kann (Klassisch, Vorstoß), Skandinavisch (3…Da5, 2…Sf6), Damengambit (angenommen, abgelehnt), Slawisch, Londoner System, Königsindisch, Grünfeld, Nimzoindisch, Damenindisch, Holländisch, Englisch |
| **Taktik** | 300 Aufgaben aus der Lichess-Datenbank, 12 Motive mit je 25 Aufgaben und einer kurzen Erklärung: Gabel, Doppelangriff, Fesselung, Spieß, Abzug/Abzugsschach, Verteidiger beseitigen, Ablenkung, Hinlenkung, Grundreihenmatt, Matt in 1/2/3. Lichess-Wertung 600–2000, innerhalb des Motivs aufsteigend sortiert |
| **Endspiele** | 11 Lektionen mit Ziel und 1–3 Sternen, in drei Gruppen: **Matt setzen** (K+D gegen K und K+T gegen K, beide auch mit „Andere Stellung“; K+2L gegen K „für Profis“), **Bauernendspiele** (Opposition gewinnen, Opposition halten, Quadratregel durchlaufen, Quadratregel einholen, Randbauer, Durchbruch), **Turmendspiele** (Lucena, Philidor) |

### Bedienung
- **Eröffnungen:**
  - *Ansehen:* Ein Pfeil zeigt den nächsten Zug, dazu Vor/Zurück und Von vorn.
  - *Lernen:* Farbe wählbar. Du ziehst deine Seite, der Trainer die andere. Bei einem falschen Zug leuchtet die richtige Figur auf, beim zweiten Fehler kommt ein Pfeil.
  - *Wiederholen* nach Leitner: 5 Fächer, Pausen von 1, 3, 7, 16 und 35 Tagen. Ein Fehler schickt die Linie zurück in Fach 1, und sie kommt nach 10 Minuten wieder.
  - Am Ende jeder Linie: *Gegen Computer weiterspielen* in Stufe 1–3. Das wird eine normale Partie; die Züge der Linie stehen in der Zugliste, PGN geht auch.
- **Taktik:**
  - Ablauf wie bei Lichess: Der Gegner zieht zuerst, du findest die Lösung. Jedes Matt zählt als richtig.
  - Fehlversuch: Hinweis zum Motiv und die richtige Figur leuchtet auf. Beim zweiten Fehlversuch kommt ein Pfeil.
  - *Lösung zeigen* spielt die Lösung vor.
  - Eigene Wertung (Start 1000, gewertet wird nur der erste Versuch) und eine Serie „richtig in Folge“.
  - *Gemischt* wählt Aufgaben passend zur Wertung.
- **Endspiele:**
  - *Tipp* zeigt den besten Zug als Pfeil.
  - *Zurück* nimmt einen Zug zurück und kostet einen Stern.
  - Verschenkt ein Zug den Gewinn, wird das sofort erkannt („Jetzt ist es nur noch Remis“), und du kannst ihn zurücknehmen.
- **„Wer gewinnt?“** lässt sich im Menü ⋯ einblenden. In den Tabellen-Endspielen ist es exakt („Du gewinnst – Matt in 7“, „Remis“).
- Brett so groß wie möglich, im Hoch- und Querformat. Felder auf dem Pixel 7 49 px groß, alle Knöpfe ≥ 48 px.

### Der Computer in den Endspielen
- **K+D, K+T und K+Bauer gegen K:** Die App berechnet beim ersten Öffnen selbst eine exakte Endspiel-Tabelle (Retrograd-Analyse, `src/trainer/tb.js`).
  - Bauzeit: zusammen ~0,12 s am Mac, ~0,33 s bei 4× gedrosselter CPU, je 512 KB Speicher.
  - Keine Online-Tablebase, keine heruntergeladenen Tabellen.
  - Der Computer verteidigt sich perfekt mit dem längsten Widerstand. In den Remis-Lektionen stellt er Fallen: Er wählt den Zug, nach dem du die wenigsten guten Antworten hast.
  - Bekannte Höchstwerte stimmen: K+D matt in höchstens 10 Zügen, K+T in 16, K+Bauer in 28 (inkl. Umwandlung).
- **K+2L, Durchbruch, Lucena, Philidor:** Hier spielt der vorhandene Übungs-Computer auf der stärksten Stufe, dazu kommt eine Ziel-Prüfung (Umwandlung gelungen, Remis gehalten, Material verloren). Für K+2L gibt es keine exakte Tabelle, weil sie mit 33 Mio. Stellungen zu groß fürs Handy wäre.

## Datenquellen und Lizenzen (am 04.10.2026 selbst geprüft)
- **Taktik-Aufgaben:** Lichess-Puzzle-Datenbank, https://database.lichess.org/#puzzles. Die Seite sagt wörtlich: „Database exports are released under the Creative Commons CC0 license. Use them for research, commercial purpose, publication, anything you like.“
  - Verwendet wurde der Datenstand vom 02.10.2026, davon nur die ersten 1,5 Mio. Zeilen gestreamt (nicht die ganze 307-MB-Datei).
  - Filter: Wertung 600–2000, Rating-Abweichung ≤ 90, Beliebtheit ≥ 85, mindestens 300 Mal gespielt.
  - Reproduzierbar mit `tools/build_puzzles.py`; ein zweiter Lauf erzeugt eine byte-gleiche Datei.
- **Eröffnungsnamen und ECO-Codes:** lichess-org/chess-openings, CC0 1.0 laut GitHub-API (`cc0-1.0`), Commit `5a13018` vom 03.10.2026, erzeugt mit `tools/build_openings.mjs`.
- **Eigene Arbeit:** Zugfolgen (gängige Theorie, alle mit chess.js geprüft), deutsche Namen, Ideen- und Motivtexte, Lektionen, Endspiel-Tabellen.
- Nachgetragen in `LICENSES.md`, README (Credits) und unter „Credits“ in der App.

## Tests
- **Node** (`npm test`): alle grün, 751 s inkl. aller bisherigen Spiele und Schwärme. Neu sind 70 Trainer-Tests:
  - **Endspiel-Tabellen (28 ✅):**
    - Je 3000 Zufallsstellungen pro Material, unabhängig gegen die Zugregeln von chess.js nachgerechnet.
    - Je 200 Partien K+D, K+T und K+Bauer, in denen beide Seiten best spielen: Matt jeweils genau in der optimalen Zugzahl.
    - Jeder Verteidigerzug ist der längste Widerstand.
    - 12 Lehrbuchstellungen und gespiegelte Farben.
  - **Aufgaben (12 ✅):** Alle 1432 Züge legal, die 100 Matt-Aufgaben enden mit Matt. Jedes andere sofortige Matt wird angenommen (7 Fälle in den Daten, dazu eine eigene Testaufgabe). Größe und Sortierung stimmen.
  - **Eröffnungen (12 ✅):** Alle 728 Halbzüge legal, Lichess-Name passt zur Familie, alle Pflichtfamilien sind dabei.
  - **Logik (18 ✅):**
    - Leitner: Fächer, Pausen und eine Simulation, in der eine wackelige Linie 29× statt 7× abgefragt wird.
    - Wertung: konvergiert bei einem 1500er-Spieler auf 1526.
    - Lektionen: bestes Spiel schafft jedes Ziel; 50 Zufallsstellungen K+D/K+T enden genau in der optimalen Zugzahl; Fehler, Patt, Figurverlust und Ziel-Prüfung der Bot-Lektionen werden erkannt; Sterne stimmen.
- **Browser:** `tests/smoke_n6.py` mit echten Taps auf Pixel 7 hoch, Pixel 7 quer und Desktop, je ~45 s, alles grün, 0 Fehler. Durchgespielt wurde:
  - Lobby-Kachel öffnen.
  - Eröffnung ansehen (Pfeil sichtbar).
  - Lernen mit absichtlichem Fehler (Figur leuchtet auf), danach die Linie zu Ende.
  - Gegen den Computer weiterspielen: 22 Linienzüge stehen in der Zugliste.
  - Wiederholen: Linie wandert in Fach 2.
  - Taktik-Aufgabe mit Fehlversuch und Hinweis, dann gelöst.
  - Quadratregel mit 3 Sternen, Opposition halten als Schwarz (Brett gedreht) mit Tipp-Pfeil.
  - Lucena-Tipp vom Computer.
  - Fortschritt ansehen und zurücksetzen, zurück in die Lobby.
- **Bestehende Tests:** `smoke_n4.py`, `smoke_n2.py schach` (die Brett-Ansicht hat jetzt Pfeile/Markierungen) und `smoke.py` sind grün.
- **Screenshots:** in `tests/shots/n6/`, selbst angesehen. Zwei Dinge habe ich daraufhin geändert:
  - Das Brett im Hochformat steht jetzt oben (vorher viel leerer Platz).
  - Fehlermeldungen stehen in der Hinweiszeile statt als Meldung über Kopf und Status.
  - Auswahl der Bilder: `tests/shots/final/n6_*`.
- **Ladebudget:** Neue und geänderte Dateien zusammen ~55 KB gzip, die Grenze war 500 KB.
  - Der Lobby-Start lädt keine Trainer-Datei (gemessen: 0); der Trainer kommt erst per Nachladen beim Öffnen.
  - Lobby bereit nach 0,1–0,25 s lokal.
- **Live:** Version `01ba91e395` war live mit 0 Fehlern. Geprüft: Ansehen, Taktik, K+D, Philidor, Listen. Danach kam noch eine Korrektur: „Matt in 2 Zügen“ hatte das „ü“ verloren (Version `7c47915dd7`).

## Abweichungen und Entscheidungen
- **„Überlastung“ gibt es bei Lichess nicht als Thema.** Stattdessen gibt es das nächstverwandte Motiv **„Verteidiger beseitigen“** (`capturingDefender`).
- **Gabel und Doppelangriff** stammen beide aus dem Lichess-Thema „fork“: Gabel = Schlüsselzug mit Springer oder Bauer, Doppelangriff = mit Dame, Turm, Läufer oder König.
- **Nur Deutsch:** Die Spielebox hat bisher keine englischen Texte, deshalb hat der Trainer auch keine. Englisch wäre ein eigener Auftrag für die ganze App.
- **Endspiel-Tabellen ohne Worker:** Sie rechnen im Hauptthread, weil sie so schnell fertig sind (0,1–0,3 s, einmal pro Sitzung).
- **Kein Stockfish:** Wie vorgegeben, zu groß fürs Handy. Partie-Analyse eigener Partien gehört nicht zu diesem Auftrag.
- **Theorie, bei der ein Blick von Peter gut wäre:** Der Lichess-Katalog reicht hier nicht tief genug, um die späten Züge zu bestätigen. Legal sind sie alle.
  - Schottisch klassisch ab 9.Ld3.
  - Caro-Kann Vorstoß mit 8.c4.
  - Skandinavisch 3…Da5 ab 10.a3.

## Bitte am Handy testen
1. **Damit die neue Version kommt:** Die Spielebox-App einmal ganz schließen (aus der App-Übersicht wischen) und neu öffnen. Die Versionsnummer unten in der Lobby muss **7c47915dd7 oder neuer** zeigen.
2. Kachel *Schach-Trainer* → *Eröffnungen* → z. B. Italienisch – Giuoco Piano → *Ansehen*, dann *Lernen*. Absichtlich einmal falsch ziehen, die Figur sollte aufleuchten.
3. *Taktik* → *Gabel*: Aufgaben lösen und beobachten, ob die Wertung und die Serie mitzählen.
4. *Endspiele* → *König + Dame gegen König*: Matt setzen. Der Computer wehrt sich perfekt; mit 3 Sternen gelingt das in höchstens 2 Zügen über dem kürzesten Weg.
5. Morgen noch einmal öffnen: Die gelernte Linie sollte unter *Wiederholen* fällig sein.

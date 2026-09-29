# Spielebox – Bericht Tagesspurt 29.09.2026 (Nacht 2 + 3 zusammen)

**Live:** https://drpeterkalmar.github.io/spielebox/ · **Stand:** alle fünf Wunsch-Spiele live, dazu „Wer gewinnt?“.
Alle Tests grün, jedes Spiel einzeln live geprüft (Version live = lokal).

Wichtig vorab: Zwischen ca. 15:35 und 16:40 lag eine Quota-Pause (kein Fehler, danach nahtlos weiter).

| Spiel | live um | Was geht |
|---|---|---|
| Schach | 16:58 | Computer 3 Stufen, zu zweit, online; Rochade/en passant/Umwandlung per Tipp, Remis, Aufgeben, PGN teilen |
| Schnapsen | 17:17 | echte Wirtshauskarten (Fotos), Computer, zu zweit mit Sichtschutz, online fair gemischt, Bummerl-Tafel |
| Backgammon | 17:27 | Verdopplungswürfel, Computer 3 Stufen, zu zweit, online fair gewürfelt (jeder Wurf geprüft) |
| Blackjack | 17:36 | 2–6 Plätze, Bank reihum, freie Plätze spielt der Computer, online mit mehreren getestet |
| Stern-Halma | 17:45 | 2, 3, 4 oder 6 Spieler, Computer auf freien Plätzen, „Lupe“ fürs Handy |
| „Wer gewinnt?“ | 18:12 | Balken am Brettrand + Zahl ↔ Prozent, Schalter im Menü |

## Was geht je Spiel
- **Schach:** chess.js 1.4.0 (BSD-2) gebündelt in `lib/chess.js`, cburnett-Figuren (BSD-3).
  - Brett im Holzstil, erlaubte Felder beim Antippen, letzter Zug, rote Schach-Markierung.
  - Umwandlung: Figur direkt auf dem Brett wählen.
  - Rochade: König auf g1/c1 oder König, dann eigenen Turm antippen.
  - Brett für Schwarz gedreht.
  - Automatisches Remis (Patt, zu wenig Material, 50 Züge, dreifache Wiederholung), Remis anbieten, Aufgeben, PGN über Menü.
  - Zugliste mit deutschen Buchstaben (S, L, T, D).
  - Bot: Alpha-Beta mit Figurentabellen im Web Worker; Stufe 3 rechnet höchstens 1,2 s.
  - **Bedenkzeit gibt es nicht** (war optional).
- **Schnapsen:** Regeln Wort für Wort nach Plan.
  - Knöpfe „20/40 ansagen“, „Atout-Unter tauschen“, „Zudrehen“ und „Ausmelden (66)“ erscheinen nur, wenn erlaubt.
  - Eigene Augen stehen sichtbar in der Leiste (samt „schwebend“ bei Ansage ohne Stich), vom Gegner nur die Stichzahl.
  - Karte antippen hebt sie an, nochmal tippen spielt sie aus (Schutz vor Fehltipps).
  - Nach jedem Spiel zeigt eine Ergebniskarte beide Augen; die Bummerl-Tafel steht im Menü.
  - **Karten:** Zákupák-Fotos (gemeinfrei), 20 Karten entzerrt, farbkorrigiert, runde Ecken (`tools/cards/crop_de.py`); Plan C (eigene SVG-Karten) war nicht nötig und steckt nur noch als Rückfall im Code.
  - **Regel-Entscheidung:** Irrtümliches Ausmelden gibt dem Gegner so viele Punkte, wie man selbst bekommen hätte (Wikipedia-Wortlaut).
    Der letzte Stich zählt wie Ausmelden nach den Augen des Gegners (Wikipedia nennt keine eigene Zahl).
- **Backgammon:**
  - Hochformat: Brett um 90° gedreht, damit jeder Punkt ≥ 48 px breit ist (49 px). Querformat: waagrecht (50 px).
  - Stein antippen → Ziele leuchten → Ziel antippen; ein Stein bleibt gewählt, solange er weiterziehen kann.
  - „Zurück“ nimmt Teilzüge im eigenen Wurf zurück, „Fertig“ schickt ab, „Abtragen“ als Knopf.
  - Würfel-Animation 0,65 s.
  - Der Bot verdoppelt und nimmt an; im Rennen gilt die 8-9-12-Regel.
- **Blackjack:**
  - Gespielt wird um Bohnen; die Bohnen-Summe bleibt immer erhalten (im Test nach jedem Schritt geprüft).
  - Nach der Runde bleiben alle Hände mit Ergebnis liegen (+/− Bohnen).
  - Die Bank zahlt aus eigenen Bohnen; die Einsätze sind so begrenzt, dass sie immer zahlen kann.
  - Solo sitzt du auf dem letzten Platz, damit du nicht zuerst 5 Runden Bank bist.
  - Die Computer-Spieler spielen Basic Strategy.
- **Stern-Halma:**
  - Sternbrett mit Zacken in den Spielerfarben; die Steine tragen zusätzlich ein Symbol (● ▲ ■ ◆ ★ ✚) für Farbenblinde.
  - Die eigene Zacke liegt immer unten.
  - Alle erreichbaren Ziele leuchten, auch die Enden langer Sprungketten. Ein Tipp aufs Ziel genügt, der Stein springt die Kette Sprung für Sprung ab.
  - Blockade-Regel wie bestellt.
  - Quelle: Weder en.wikipedia noch de.wikipedia nennen heute eine eigene Blockade-Regel. Umgesetzt ist deshalb die verbreitete Standardregel („Zielzacke voll + mindestens ein eigener Stein = Sieg“); sie steht so im Regeltext.
  - Zuglimit: 200 Züge je Spieler.
- **Gemeinsam:**
  - **Tisch für 2–6 Plätze:** Plätze füllen sich der Reihe nach, „Freie Plätze: Computer“ startet den Tisch.
  - **Aufgeben bei 3+ Spielern:** Der Computer übernimmt den Platz.
  - **Kartenspiele online:** Jeder bekommt nur seine Sicht (`viewFor`, gezielt an den einzelnen Peer gesendet), Zuschauer sehen keine Hand.
  - **Fair Play:** Hash-Ketten-Commits (`src/net/fair.js`) für Würfel und Mischen, Anzeige „✓ fair gemischt/gewürfelt (n geprüft)“.
  - **Zoom-Schutz:** `user-scalable=no`, `touch-action`, iOS-Gesten gesperrt, Eingabefelder ≥ 16 px.

## Tests (alle grün)
- **Node** (`npm test`, 384 s):
  - Regeln: Schach 17 (inkl. Schwarm 150 Zufallspartien, Bot-Stufen), Schnapsen 30, Backgammon 19, Blackjack 24, Halma 18.
  - Tisch-Protokoll 15, davon neu:
    - Schnapsen online: Gast und Zuschauer sehen nie eine Host-Karte; ganze Partie, alle Mischungen vom Gast geprüft.
    - Backgammon online: faire Würfel.
    - Manipulation wird erkannt.
    - Blackjack mit 4 Plätzen, 2 Gäste + Computer.
  - Fair Play 5: SHA-256 = Node-crypto; Würfel und Mischung gleichverteilt; falscher Wurf/Seed/Mischung wird erkannt.
  - evaluate 8: alle Engines, Symmetrie, Karten nur aus eigener Sicht.
  - **Schwärme** (die Zahl musste nirgends gesenkt werden):
    - Schnapsen: 10 000 Spiele, immer 120 Augen, plus 200 ganze Partien.
    - Backgammon: 10 000 Partien, immer 15 Steine je Seite.
    - Blackjack: 10 000 Partien, Bohnen-Summe erhalten.
    - Halma: 2 460 Partien für 2/3/4/6 Spieler.
    - Mühle/Dame unverändert grün.
- **Rauchtest neu** (`tests/smoke_n2.py`, Pixel 7 hoch/quer, Desktop):
  - Jedes Spiel mit echten Taps: Schach mit Rochade, Schnapsen-Karte, Backgammon-Teilzüge mit Zurück/Fertig, Blackjack-Runde, Halma 2 und 6.
  - Knöpfe ≥ 48 px, Brett ganz sichtbar, 0 Fehler.
  - Zoom: Doppeltipp per CDP ändert `visualViewport.scale` nicht.
  - Screenshots in `tests/shots/n2/` (Auswahl in `tests/shots/final/n2_*.jpg`), per Vision gesichtet.
- **Alter Rauchtest** (Mühle/Dame): grün, keine Rückschritte.
- **Netz-E2E** (`tests/e2e_n2.py`, echte öffentliche Relays, mit ProtonVPN):
  - Schnapsen Host + Gast + Zuschauer: direkt (Beitritt 0,7 s) und `--relay` (0,5 s). In 35 bzw. 41 Zügen sahen Gast und Zuschauer nie eine Host-Karte (Zustand und DOM); „✓ fair gemischt“ beim Gast.
  - Backgammon: 16 Würfe aus beiden Ketten, alle beim Gast geprüft.
  - Blackjack: Host + 2 Gäste tippen die Wörter über die Oberfläche ein (am Tisch nach 2,7 s), 3 Runden, gleiche Stände.
- **Live** (`tests/test_live.py`): nach jedem Spiel grün, Version live = lokal.

## Grenzen (ehrlich)
- **Halma am Handy:** 121 Löcher auf 404 px ergeben nur ~27 px Lochabstand. Abgefedert ist das auf zwei Wegen:
  - Ein Tipp trifft immer den nächsten sinnvollen Kandidaten (ziehbarer eigener Stein bzw. erlaubtes Ziel), nicht das nächste Loch.
  - „Lupe“ vergrößert das Brett auf 51 px Lochabstand (verschiebbar).
- **Verdeckte Karten:** Der Browser des Gastgebers kennt alle Karten (DevTools). Über den Relay-Fallback kann jeder, der die Wörter kennt, gezielte Nachrichten entschlüsseln. Das steht im Hilfetext. Pro-Sitz-Verschlüsselung (ECDH) ist offen.
- **Karten-Wiederaufnahme:** Nach einem Neuladen kann nur der Gastgeber eine Kartenpartie fortsetzen. Die Host-Übernahme durch einen Mitspieler ist bei Kartenspielen abgeschaltet, weil er die Karten nicht kennt.
- **Mischprüfung:**
  - Geprüft wird: Commit, Kette und dass die Mischung aus den Beiträgen aller folgt.
  - Nicht zusätzlich geprüft wird, ob die eigene ausgeteilte Hand zur veröffentlichten Mischung passt.
  - Geht ein Mitspieler verloren, würfelt/mischt der Gastgeber nach 12 s allein; das zählt als „ohne Mitspieler“ und ist ungeprüft.
- **Backgammon:** kein Match-Spiel (Punkte werden am Tisch addiert), keine Crawford-Regel.
- **Schach:** keine Bedenkzeit.
- **„Wer gewinnt?“ ist eine grobe Einschätzung:**
  - Schach: kurze Suche des Übungs-Bots.
  - Backgammon: nur die Pip-Differenz.
  - Schnapsen: Bummerl-Punkte plus eine Schätzung, nur aus dem, was du siehst.
  - Blackjack: bewusst keine Anzeige.

## Bitte am Handy testen
1. **Schnapsen online zu zweit:** Handy A macht den Tisch auf, Handy B tritt bei. Sind die Karten lesbar? Ist Doppeltipp zum Ausspielen gut, oder lieber Einzeltipp? Kommen die Knöpfe 20/40, Zudrehen und Ausmelden zur richtigen Zeit? Stimmt die Bummerl-Tafel?
2. **Zoom (iPhone/iPad, falls vorhanden):** Chrome am Android hält sich ohnehin an „kein Zoom“. Der eigentliche Fall ist iOS Safari: im Lobby-Feld Wörter tippen und doppelt auf Brett/Karten tippen. Zoomt irgendetwas?
3. **Backgammon im Hochformat:** Das Brett ist gedreht. Trefft ihr die Punkte? Ist das Abtragen per Knopf verständlich?
4. **Stern-Halma mit 3 oder 6:** Klappt das Treffen ohne Lupe? Ist die Lupe hilfreich?
5. **Blackjack mit 3 Handys** über dieselben Wörter, Rest Computer: Wie lange dauert eine Runde gefühlt?
6. **„Wer gewinnt?“:** Hilfreich oder störend? Unter dem Status antippen schaltet auf Prozent; im Menü abschaltbar.

## Offene Punkte
- Pro-Sitz-Verschlüsselung für Kartenspiele (ECDH), damit auch über das Relay nur der Empfänger die Karten lesen kann.
- Prüfung „eigene Hand passt zur veröffentlichten Mischung“.
- Schach-Bedenkzeit, Backgammon-Match mit Crawford.
- Die 12 übrigen doppeldeutschen Karten (IX, VIII, VII; nicht nötig für Schnapsen) sind mit der Pipeline jederzeit nachrüstbar.
- Aus Nacht 1: „Platz übernehmen“ von einem anderen Gerät, Töne.

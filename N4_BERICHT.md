# Spielebox – Bericht n4 (01.10.2026): mehr Spieleklassiker

**Live:** https://drpeterkalmar.github.io/spielebox/
**Wunsch (Peter, 29.09. abends):** „Mehr Spieleklassiker.“

Alle sechs bestellten Spiele sind live, dazu als Zusatz **Paare finden**. Jedes Spiel ging einzeln online, jeweils
mit grünen Tests und geprüfter Live-Version. Reihenfolge laut `REIHENFOLGE.md`, also mit Peters Umstellung:
Schiffe versenken kam direkt nach Ludo.

| Spiel | Commit | Spieler | Computer | Zu zweit an einem Gerät | Online |
|---|---|---|---|---|---|
| Ludo | cb56be6 | 2–4 | 3 Stufen | ja | ja, fair gewürfelt |
| Schiffe versenken | a29e99b | 2 | 3 Stufen | ja, mit Sichtschutz | ja, Flotte verdeckt |
| Vier in einer Reihe | 9e4881d | 2 | 3 Stufen (stark) | ja | ja |
| Mau-Mau | c5725d4 | 2–5 | 3 Stufen | ja, mit Sichtschutz | ja, fair gemischt |
| Würfelglück | b02913d | 1–6 | 3 Stufen | ja (auch allein) | ja, fair gewürfelt |
| Reversi | c796f99 | 2 | 3 Stufen | ja | ja |
| Paare finden (Zusatz) | ce0f5c2 | 1–4 | 3 Stufen | ja | ja, fair gemischt |

Nichts aus n3 ist zurückgedreht. Computer-Tempo, Banner, Ereignis-Liste und Meldungs-Warteschlange gelten auch für die
neuen Spiele. Auch „Wer gewinnt?“ gibt es bei allen sieben.

Unterbrechung: Mitten im Lauf gab es eine Quota-Pause. Danach ging es nahtlos weiter.

## Die Spiele

### 1. Ludo (Regeln wie „Mensch ärgere Dich nicht“)
- **Quelle:** offizielle Anleitung von Schmidt Spiele (Standardausgabe), ergänzend de.wikipedia.
- **Regeln:**
  - Laufbahn mit 40 Feldern, je Farbe 4 Häuschen und 4 Zielfelder.
  - Eine Figur steht am Anfang schon auf dem Startfeld (so steht es in der Anleitung).
  - Mit einer 6 muss eine Figur raus, und das Startfeld muss geräumt werden.
  - Nach einer 6 darf man nochmal würfeln.
  - Wer genau auf eine fremde Figur kommt, wirft sie raus. Ins Ziel geht es nur mit der passenden Zahl.
  - Zu zweit spielen Rot und Grün, die sich gegenübersitzen.
- **Schalter:**
  - *3× würfeln*: Standard an, aber nur, wenn keine Figur auf der Bahn ist und die Figuren im Ziel nicht weiterkönnen.
  - *Schlagpflicht*: Hausregel, Standard aus.
  - *Eine Figur startet draußen*: Standard an.
  - *Im Ziel überspringen*: Standard an, wie in der Anleitung.
- **Bedienung:**
  - Gewürfelt wird mit dem Knopf „Würfeln“ oder durch Antippen des Würfels neben dem eigenen Häuschen.
  - Dann leuchten die Figuren, die ziehen können, und ihr Zielfeld; ein Tipp auf die Figur oder ihr Ziel genügt.
  - Ist kein Zug möglich, geht es von selbst weiter, zum Beispiel „würfelt 3 – keine 6, noch 2 Versuche“.
  - Das Brett ist so gedreht, dass die eigene Farbe unten links steht.
- **Sichtbarer Ablauf:**
  - Der Würfel rollt.
  - Die Figur läuft Feld für Feld.
  - Eine geschlagene Figur fliegt erst danach ins Häuschen.
  - Dazu ein Banner, zum Beispiel „Computer 1 schlägt deine Figur!“.
- **Computer:**
  - Stufe 1 zieht meist zufällig, holt mit einer 6 aber eine Figur raus.
  - Stufe 2 nutzt Regeln: schlagen, sich ins Ziel retten, keine Figur in Gefahr bringen.
  - Stufe 3 rechnet die Gefahr über den nächsten Wurf der Gegner mit.
  - Gemessen zu zweit, je 400 Partien: Stufe 2 gegen 1 gewinnt 85 %, Stufe 3 gegen 1 87 %, Stufe 3 gegen 2 56 %. Ludo bleibt eben ein Würfelspiel.
- **Online:** Jeder Wurf ist ein fairer Würfel aus den Hash-Ketten aller Spieler. Der Gast prüft jeden Wurf („✓ fair gewürfelt“).

### 2. Schiffe versenken
- **Quelle:** de.wikipedia „Schiffe versenken“.
- **Regeln:**
  - 10×10-Feld, Zeilen A–J, Spalten 1–10.
  - Schiffe liegen gerade und dürfen sich nicht berühren, auch nicht über Eck.
  - Es wird abwechselnd geschossen. Die Antwort ist „Wasser“, „Treffer“ oder „Versenkt!“.
  - Rund um versenkte Schiffe sieht man das sichere Wasser.
- **Schalter:**
  - *Flotte*: klein mit 5 Schiffen (5, 4, 3, 3, 2) ist Standard, weil die Partien kürzer sind; groß mit 10 Schiffen wie in der Quelle.
  - *Schiffe dürfen sich berühren*: Hausregel.
  - *Nach Treffer nochmal*: Variante aus der Quelle.
- **Bedienung:**
  - Die Flotte liegt zufällig bereit, „Neu mischen“ würfelt neu.
  - Selbst setzen: Schiff antippen, dann ein Feld antippen. „Drehen“ (oder nochmal aufs Schiff tippen) dreht es.
  - Schiffe, die zu nah liegen, werden rot; „Fertig“ geht erst, wenn alles passt.
  - Schießen in zwei Schritten: Feld antippen zeigt ein Fadenkreuz, dann nochmal antippen oder „Feuer auf B7!“.
  - Ein Feld ist am Handy nur ~37 px groß, deshalb der Schutz vor Fehltipps.
  - Hochkant: oben groß das gegnerische Meer, unten klein das eigene Meer und die Flotten-Übersicht. Quer: nebeneinander.
- **Verdeckt bleibt verdeckt** (wie bei den Kartenspielen):
  - Jedes Gerät bekommt nur die eigene Flotte, fremde Schiffe erst, wenn sie versenkt sind.
  - Der Zug „Flotte setzen“ steht für die anderen ohne Koordinaten im Verlauf; neu im Tisch: `publicMove` der Engine.
  - Gleiche ehrliche Grenze wie bei den Karten: Der Gastgeber-Browser kennt beide Flotten. Der Fair-Play-Text ist ergänzt.
  - Zu zweit an einem Gerät: Sichtschutz vor jedem Zug. Darauf steht das Ergebnis des letzten Schusses („Spieler 1: D4: Wasser“), weil der Schütze sein Ergebnis sonst nicht mehr sähe.
- **Computer:**
  - Stufe 1 schießt zufällig.
  - Stufe 2 jagt: Nach einem Treffer sucht er die Nachbarfelder ab.
  - Stufe 3 rechnet eine Wahrscheinlichkeitskarte aus allen möglichen Schiffslagen.
  - Schüsse bis zum Versenken der kleinen Flotte: Stufe 1 ≈ 70, Stufe 2 ≈ 44, Stufe 3 ≈ 38.
  - Im Duell: Stufe 3 schlägt Stufe 2 in 78 % der Partien.

### 3. Vier in einer Reihe
- **Quelle:** de.wikipedia „Vier gewinnt“.
- **Regeln:** 7×6, Rot beginnt. Vier in einer Linie gewinnt (waagrecht, senkrecht, schräg), volles Brett = Remis.
- **Bedienung:**
  - Spalte antippen: Der Stein schwebt über der Spalte, und man sieht, wo er landet. Nochmal antippen wirft ein.
  - Der Stein fällt sichtbar mit kleinem Aufprall, auch bei eigenen Zügen.
  - Die Gewinnreihe leuchtet.
- **Computer (Alpha-Beta auf Bitboards):**
  - Stufe 1 rechnet 2 Züge tief mit viel Zufall. Sofortige Gewinne nimmt er, Drohungen blockt er meist.
  - Stufe 2 rechnet 7 Züge tief.
  - Stufe 3 vertieft schrittweise bis 1,2 s, in der Eröffnung etwa 13 Züge, später 20 und mehr; erzwungene Züge kosten keine Tiefe.
  - Stufe 3 gewann 8 von 8 gegen Stufe 1 und als Rot 4 von 4 gegen Stufe 2.
  - Ehrlich: Mit 250 ms Bedenkzeit verlor Stufe 3 im Test einmal gegen Stufe 2, deshalb hat sie in der App die vollen 1,2 s.
  - Perfekt spielt sie nicht (kein Eröffnungsbuch), für Kinder ist sie aber kaum zu schlagen.
- **„Wer gewinnt?“** beweist kurze erzwungene Gewinne („Gewinn in Sicht“ / „Verlust droht“), sonst eine Punkte-Schätzung.

### 4. Mau-Mau
- **Karten:** 32 Blatt doppeldeutsch. Die 12 fehlenden Karten (IX, VIII, VII) sind mit der vorhandenen Pipeline aus
  derselben Zákupák-Fotoserie geschnitten. Die 20 Schnapsen-Karten blieben bytegleich. E9 hat einen sichtbaren Knick.
- **Quelle:** de.wikipedia „Mau-Mau (Kartenspiel)“.
- **Regeln:**
  - Jeder bekommt 5 Karten. Man bedient Farbe oder Wert, sonst zieht man eine Karte; passt sie, darf man sie sofort legen.
  - Ist der Stapel leer, wird die Ablage gemischt.
  - Die erste offene Karte ist wirkungslos (so steht es in der Quelle).
- **Schalter (alle Standard an):**
  - *7 = zwei ziehen*: mit einer 7 kontern, dann vier.
  - *Unter wünscht*: Unter darf auf alles außer einen Unter.
  - *Daus = Aussetzen*: Hausregel aus dem Auftrag; die Quelle nennt meist die 8. Zu zweit ist man dann gleich nochmal dran.
  - *„Mau“ sagen*: Knopf „Mau sagen“ vor der vorletzten Karte, vergessen = 2 Strafkarten.
- **Bedienung:**
  - Passende Karten stehen etwas höher. Antippen hebt die Karte an, nochmal antippen legt sie.
  - Beim Unter kommen vier Farbknöpfe.
  - Ziehen: Stapel antippen oder „Karte ziehen“ („4 Karten ziehen“ bei Strafe). Nach dem Ziehen gibt es „Weiter“.
  - Wunschfarbe und offene Strafe stehen groß neben der Ablage.
  - Banner, zum Beispiel „Computer 2 legt ein Daus – du setzt aus“ oder „… legt eine 7 – du musst 2 ziehen oder kontern!“.
- **Gefunden und behoben – eine echte Lücke im Tisch:**
  - Der Tisch veröffentlichte beim „Austeilen“ die alten Mischungen. Das Nachmischen der Ablage lief zunächst ebenfalls als „Austeilen“.
  - So wäre mitten im Spiel die erste Mischung offen gewesen, und damit alle Starthände.
  - Jetzt heißt das Nachmischen `nachmischen`, und alle Mischungen werden erst nach dem Spiel offengelegt.
  - Ein Netz-Test mit Nachmischen prüft das.
- **Computer:**
  - Stufe 1 legt irgendeine passende Karte.
  - Stufe 2 hebt Unter auf, wünscht die häufigste eigene Farbe und setzt 7 und Daus gezielt gegen den, der wenig Karten hat.
  - Stufe 3 zählt zusätzlich mit, welche Karten schon weg sind, und spielt Stichproben durch.
  - Zu dritt (fair wären 33 %): Stufe 2 gegen zwei Stufe-1-Gegner gewinnt 50 %, Stufe 3 49–52 %.
  - Ehrlich: Stufe 3 ist bei kurzer Bedenkzeit kaum besser als Stufe 2. Mau-Mau hängt stark am Kartenglück.
- **Online:** Jeder sieht nur seine Hand, fair gemischt; nach dem Spiel steht beim Gast „✓ fair gemischt“.

### 5. Würfelglück (Regeln wie Kniffel/Yatzy, ohne Markennamen)
- **Quelle:** Schmidt-Anleitung (Grundregel und Meisterschaftsregel), ergänzend de.wikipedia.
- **Regeln:**
  - 5 Würfel, bis zu 3 Würfe, 13 Felder.
  - Bonus 35 ab 63 Punkten oben. Full House 25, kleine Straße 30, große Straße 40, Fünferpasch 50.
  - Streichen darf man nach der Grundregel nur, wenn nichts passt.
- **Schalter:**
  - *Weiterer Fünferpasch*: Grundregel (+50, beliebiges Feld mit Höchstwert), Meisterschaftsregel oder aus.
  - *Frei streichen*: Meisterschaftsregel.
  - 1–6 Spieler, auch allein.
- **Bedienung:**
  - Würfel antippen = halten (gelber Rahmen, „gehalten“).
  - Jedes freie Feld zeigt, was es mit dem Wurf bringen würde („+18“ oder „streichen“), ★ markiert den Vorschlag.
  - Feld antippen wählt es aus, nochmal antippen (oder „Eintragen“) trägt es ein.
  - Bei Computer-Zügen sieht man zu: Er würfelt, hält, und das eingetragene Feld blinkt.
  - Im Menü steht der „Spielblock“ aller Spieler.
- **Computer:**
  - Stufe 1 hält die häufigste Zahl und nimmt die meisten Punkte.
  - Stufe 2 hat eine bessere Haltestrategie und bewertet die Felder.
  - Stufe 3 sucht über die restlichen Würfe des Zugs den besten Erwartungswert aus allen 32 Haltemustern.
  - Durchschnitt allein, je 300 Partien: Stufe 1 158, Stufe 2 222, Stufe 3 240 Punkte.
- **Online:** Fair gewürfelt werden nur die nicht gehaltenen Würfel; die gehaltenen bleiben, das ist geprüft.

### 6. Reversi
- **Quelle:** Regeln der World Othello Federation, ergänzend de.wikipedia; kein Markenname.
- **Regeln:**
  - 8×8, Schwarz beginnt.
  - Man darf nur setzen, wenn man umdreht. Gepasst wird nur ohne möglichen Zug (Knopf „Passen“).
  - Die Partie endet, wenn keiner mehr kann.
- **Bedienung:**
  - Erlaubte Felder tragen einen Punkt; ein Tipp setzt.
  - Die eingeschlossenen Steine kippen ringweise nach außen um.
  - Felder messen am Handy 49 px.
- **Computer:**
  - Stufe 1 rechnet 1 Zug tief mit Zufall.
  - Stufe 2 rechnet 4 Züge tief mit Bewertung von Mobilität, Ecken und Stabilität.
  - Stufe 3 vertieft schrittweise und löst das Endspiel exakt.
  - Stufe 2 schlug Stufe 1 in 20 von 20 Partien, Stufe 3 schlug Stufe 2 in 10 von 10 Partien.

### Zusatz: Paare finden (Regeln wie Memory, ohne Markennamen)
- **Quelle:** de.wikipedia „Memory (Spiel)“.
- **Regeln und Bedienung:**
  - 8, 12 oder 18 Tierpaare (Emoji der Systemschrift, keine Bilddateien), 1–4 Spieler.
  - Zwei Karten umdrehen. Ein Paar behält man und darf nochmal.
  - Ein falsches Paar bleibt rot umrandet offen, bis der Nächste dreht; so können sich alle die Karten merken.
- **Verdeckt** ist hier für alle gleich: Jedes Gerät bekommt nur die offenen Karten, und es wird fair gemischt. Zu zweit an einem Gerät braucht es deshalb keinen Sichtschutz.
- **Computer:**
  - Er „merkt“ sich nur, was alle gesehen haben: Stufe 1 die letzten 3 Karten, Stufe 2 die letzten 12, Stufe 3 alles.
  - Stufe 3 deckt als zweite Karte lieber eine schon bekannte auf, statt dem Gegner neue Bilder zu zeigen.
  - Je 200 Partien: 3 gegen 1 193:1, 2 gegen 1 190:4, 3 gegen 2 95:83.

## Was sonst neu ist
- **Würfel mit beliebig vielen Würfeln:** In `fair.js` liefert `{ kind: 'dice', n }` jetzt n Würfel. Ludo nutzt 1, Würfelglück 1–5; Backgammon hat unverändert 2.
- **Spielerleiste mit Farbe aus dem Zustand:** Ludo zu zweit zeigt Rot/Grün. Farbnamen in der Lobby lauten je Spiel „Rot (beginnt)/Gelb“ bzw. „Schwarz (beginnt)/Weiß“.
- **Hochformat:** Die Tischspalte wird nie breiter als der Bildschirm. Das hohe Brett von Schiffe versenken schob sie sonst um 15 px auf.
- **Service-Worker:** `tools/update_sw.py` nimmt nur Dateien, die in Git stehen (erst `git add`, dann das Skript). Halbfertige Spiele landeten sonst in der Vorab-Liste, fehlten live, und die Installation wäre gescheitert.
- **Punkte am Tisch:** Bei Würfelglück und Mau-Mau zählt ein Sieg 1 Punkt. Die Endsumme bzw. die Restkarten stehen im Ergebnis.
- **Lobby:** neue Bildkacheln für alle sieben Spiele. Regeln je Spiel stehen als Daten in `src/games/<id>/rules.js`.

## Tests (alle grün)
- **Node (`npm test`)**, neu dazu:
  - Regeltests je Spiel: Ludo 23, Schiffe 24, Vier 28, Mau-Mau 23, Würfelglück 24, Reversi 25, Paare 16 – jeweils mit Belegen aus der Quelle, evaluate-Fällen und Bot-Stufen.
  - Schwarm-Selbstspiel: je 10 000 Partien mit Invarianten nach jedem Zug, zum Beispiel immer 32 verschiedene Karten, jede Viererreihe nachgezählt, jede Sicht ohne fremde Info, Müll-Züge abgelehnt.
  - Laufzeiten der Schwärme: Ludo 28 s, Schiffe 74 s, Vier 7 s, Mau-Mau 28 s, Würfelglück 16 s, Reversi 26 s, Paare 37 s.
  - `evaluate.test` deckt alle 14 Spiele ab: Start ausgeglichen, Symmetrie, bei verdeckten Infos gleich auf Sicht und vollem Zustand.
  - Tisch-Protokoll mit 6 neuen Online-Fällen:
    - Ludo 4 Plätze, 2 Gäste + Computer, 49 Würfe geprüft.
    - Schiffe: Gast sieht die Flotte nie, weder im Zustand noch im letzten Zug oder Verlauf.
    - Mau-Mau mit Nachmischen: keine Mischung vor Spielende offen, danach geprüft.
    - Würfelglück: gehaltene Würfel bleiben, n = nicht gehaltene.
    - Paare: Gast sieht genau die offenen Karten.
  - Die alten Schwärme und Tests sind unverändert grün; Schach 134 s.
- **Browser** (`tests/smoke_n4.py`, Pixel 7 hoch/quer und Desktop, echte Taps):
  - Jedes neue Spiel: Knöpfe ≥ 48 px, Brett ganz im Bild, 0 App-Fehler.
  - Ludo: Figur leicht daneben antippen trifft trotzdem; Würfeln per Knopf und per Würfel.
  - Schiffe: Schiff verschieben und drehen, Fadenkreuz + Feuer, im Bild nur die eigenen 5 Schiffe, Sichtschutz mit Ergebnis.
  - Vier: erster Tipp = Vorwahl, zweiter = Einwurf, der Stein fällt animiert.
  - Mau-Mau: nie eine fremde Karte im DOM, „Mau sagen“ ohne Strafkarte, Sichtschutz.
  - Würfelglück: Halten, gehaltene bleiben, ★-Vorschlag eintragen, Spielblock, allein.
  - Reversi: 4 Startfelder markiert, Kippen animiert.
  - Paare: am Anfang kein Bild im DOM, nur offene Bilder sichtbar.
  - Die Screenshots habe ich alle angesehen. Gefunden und behoben dabei:
    - Startfelder bei Ludo nicht eingefärbt.
    - „−0“ bei „Wer gewinnt?“.
    - Hochformat zu breit.
    - Stapel bei Mau-Mau schwarz und Namen winzig.
    - Würfelglück-Summe abgeschnitten.
    - Sichtschutz bei Schiffe sagte „Karten“.
- **Weiter grün:** `smoke.py`, `smoke_n2.py`, `smoke_n3.py`; keine Rückschritte bei den alten Spielen.
- **Netz-E2E** (`tests/e2e_n4.py`, echte öffentliche Relays): Schiffe (70 Züge), Mau-Mau (Gast sieht nichts Fremdes, nach dem Spiel „✓ fair gemischt“), Ludo („✓ fair gewürfelt (20 geprüft)“), direkt und mit `--relay`.
- **Live** (`tests/test_live.py`): grün nach Ludo und Schiffe; danach je Spiel Version live = lokal geprüft.
- **Screenshots:** `tests/shots/n4/`, Auswahl in `tests/shots/final/n4_*.jpg`.

## Bitte am Handy testen
1. **Ludo zu viert** (du + 3 Computer, „gemütlich“): Ist das Tempo beim Würfeln und Laufen gut? Trefft ihr die Figuren (Felder sind klein, der Tipp nimmt die nächste ziehbare)?
2. **Schiffe versenken zu zweit an einem Gerät:** Ist das Aufstellen (antippen, verschieben, drehen) verständlich? Hilft der Satz auf dem Sichtschutz („D4: Wasser“)? Oder lieber online auf zwei Handys.
3. **Vier in einer Reihe:** Ist „antippen, nochmal antippen“ angenehm, oder lieber direkt einwerfen? Stufe 3 ist sehr stark – für die Kinder Stufe 1 oder 2.
4. **Mau-Mau mit Kindern:** Wird der Knopf „Mau sagen“ verstanden? Sollen Hausregeln anders voreingestellt sein, zum Beispiel 8 statt Daus zum Aussetzen?
5. **Würfelglück:** Sind die Vorschläge (★, „+18“) hilfreich oder verraten sie zu viel? Ist die Grundregel „Streichen nur, wenn nichts passt“ richtig, oder lieber „Frei streichen“?
6. **Reversi und Paare finden:** Lesbarkeit der Tierbilder auf dem Handy (Emoji sehen auf Android und iPhone etwas verschieden aus).

## Offen / Ideen
- Watten, Käsekästchen und Kalaha (Zusatzliste) sind nicht gebaut.
- Vier in einer Reihe: ein Eröffnungsbuch würde Stufe 3 perfekt machen.
- Mau-Mau: Partie über mehrere Runden mit Minuspunkten, Richtungswechsel (9) als Option.
- Weiter offen aus n2/n3: Pro-Sitz-Verschlüsselung für verdeckte Infos (ECDH), Töne.

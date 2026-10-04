# Spielebox – Bericht n5 (04.10.2026): Texas Hold'em

**Live:** https://drpeterkalmar.github.io/spielebox/ – Kachel „Texas Hold'em“ (15. Spiel)
**Wunsch (Peter, 01.10.):** „Spielebox Texas Hold'em“

**Bitte am Handy testen** – hochkant und quer, am besten einmal gegen den Computer und einmal online mit der Familie.

Klassisches No-Limit Texas Hold'em als Turnier („Sit & Go“), **nur um Spielchips – kein Geld, keine Käufe**. Spielbar
wie alle anderen Spiele: online über die drei Wörter, gegen den Computer (3 Stufen) und zu mehreren an einem Gerät.

**Entstehung:** Teil 1–2 auf omen16 gebaut (Evaluator, Regeln, Computer, Tisch, Lobby, Tests; Commits `339c52e`,
`c818a3b`). Der Job dort brach am Ende mit einem Fehler ab, bevor die Blinds fertig eingestellt waren. Den unfertigen
Rest habe ich auf dem Mac übernommen, fertig gemacht und alles noch einmal vollständig geprüft.

## Was es kann
- **2–8 Plätze**, freie Plätze füllt der Computer. Alle starten mit gleich vielen Chips (Standard 1.000).
- **Regeln:** Dealer-Knopf, Small und Big Blind, zu zweit die Sonderregel (Dealer = Small Blind). Mindest-Erhöhung,
  unvollständiges All-in, Side-Pots, geteilte Pots, Rest-Chip nach Platzfolge. Showdown in der richtigen Reihenfolge,
  Verlierer dürfen verdeckt lassen. Wer keine Chips mehr hat, schaut zu. Am Ende gibt es eine Rangliste.
- **Blinds** starten bei 5/10 und steigen alle 20 Hände (langsam 30, schnell 12, nie).
  Gemessen mit 4 Spielern, Computer Stufe „mittel“, Tempo „gemütlich“: Eine Partie dauert im Mittel **24 min**, mit einem
  lockeren Mitspieler 27 min (die Hälfte aller Partien liegt zwischen 19 und 35 min). Zu acht sind es ~45 min.
- **Bedienung:** Aussteigen / Checken bzw. Mitgehen (mit Betrag) / Erhöhen mit Regler, ½ Pot, ¾ Pot, Pot, All-in, Plus/Minus.
  Wer nicht dran ist, kann vorab „Check/Fold“ oder „Call jeden Betrag“ antippen. Alle Knöpfe sind mindestens 48 px groß.
- **Hilfe:** Regel-Karte mit Hand-Rangliste (Kartenbilder), „Wie setze ich?“ in einfacher Sprache, Hinweis „nur Spielchips“.
  Auf Wunsch benennt die Hand-Hilfe die eigene Hand („Zwei Paare“). „Wer gewinnt?“ zeigt die Gewinnchance gegen
  *zufällige* Hände, denn fremde Karten kennt niemand.
- **Gegen den Computer ausgeschieden?** Dann erscheint „Neues Turnier“, sobald die Hand fertig ausgespielt ist.
  Alternativ kann man zuschauen, wie die Computer weiterspielen.
- **Online:** Jeder sieht nur seine eigenen Karten, Zuschauer sehen keine. Gemischt wird fair, und nach jeder Hand prüft
  jedes Gerät die Mischung („✓ fair gemischt“). Die Bedenkzeit ist einstellbar (Standard 30 s). Wer nicht handelt oder
  die Verbindung verliert, checkt bzw. steigt aus, bis er wieder da ist. Nach dem Neuladen geht es mit den eigenen
  Karten weiter. Ehrliche Grenze wie bei allen Kartenspielen: Der Browser des Gastgebers kennt alle Karten.

## Computer (3 Stufen, ohne fremde Karten zu kennen)
- **Leicht:** geht oft mit, blufft selten – gut zum Lernen.
- **Mittel:** entscheidet vor dem Flop nach Position und Starthand-Tabelle, danach nach der eigenen Gewinnchance
  (Simulation) und dem Preis zum Mitgehen; ab und zu ein Bluff.
- **Stark:** spielt mit wenig Chips nur noch „alles oder nichts“, schätzt die Hände der Gegner aus ihren Aktionen ab
  und merkt sich, wie die Mitspieler spielen.
- Gemessen, je 20 000 Hände mit gleichen Karten für beide Seiten (Chips je 100 Hände, Big Blind 10):
  mittel schlägt leicht mit +657 ± 161, stark schlägt mittel mit +799 ± 162 und leicht mit +1143 ± 138.
  Am 6er-Tisch: stark +1524, mittel +1031, leicht −2555. Alle Züge waren erlaubt, keine Hand blieb hängen.

## Geprüft
- `npm test` grün (alle Spiele): Evaluator (alle 7 462 Hand-Klassen, 1 Mio. 7-Karten-Hände gegen eine naive Referenz;
  dazu die Häufigkeiten aller 133 Mio. 7-Karten-Hände), Regelfälle, **10 000 ganze Turniere** ohne Hänger oder Fehler, 300 Turniere nur mit Computern.
- Browser-Rauchtest hoch/quer/Desktop: 0 Fehler, Knöpfe ≥ 48 px, nie eine fremde Karte im Bild, Side-Pot, Turniersieg,
  zu mehreren an einem Gerät mit Sichtschutz, „Neues Turnier“.
- Online-Test direkt **und** über Relay, mit 3 Geräten + Zuschauer: keine fremden Karten (Zustand und Bild geprüft),
  „✓ fair gemischt“ auf allen Geräten, Bedenkzeit sichtbar, Weiterspielen nach Neuladen.
- Bildschirmfotos (Preflop, Regler offen, Showdown mit Side-Pot, Turniersieg, ausgeschieden) hoch und quer selbst angesehen.

## Auf dem Mac gefunden und behoben
- Nach dem Neuladen fehlte bei einem Gast die Anzeige „✓ fair gemischt“ – die Prüfung lief, wurde aber nicht angezeigt.
  Das betraf alle Online-Kartenspiele.
- „Du bist raus“ und „Neues Turnier“ erschienen schon, während River und Showdown noch liefen, und verrieten so das Ergebnis.
- Computer hießen „Computer 0 … 4“, wenn man selbst auf dem letzten Platz sitzt (auch Blackjack) – jetzt ab 1.
- Das „BB“-Schild des obersten Platzes war hochkant oben angeschnitten.
- Die Statuszeile zeigte zu mehreren an einem Gerät „Spieler 2 (Spieler 2) ist am Zug“.
- Am Turnierende stand „Wer gewinnt? – nicht in dieser Hand“, jetzt steht dort „Turnier vorbei“.

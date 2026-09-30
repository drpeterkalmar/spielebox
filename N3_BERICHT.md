# Spielebox – Bericht n3 (30.09.2026): gemütlicher Computer, längere Meldungen, eigene Stiche

**Live:** https://drpeterkalmar.github.io/spielebox/
**Wunsch (Peter, 29.09. abends):** „Schnapsen: eigene Stiche sehen“ und „Computer langsamere Zuggeschwindigkeit,
Meldungen länger anzeigen“ – damit die Kinder mitbekommen, was der Computer macht, und in Ruhe nachdenken können.

Aufgebaut auf dem Schnellschuss vom 29.09. (1,5 s Denkzeit, 5 s Meldungen); nichts davon zurückgedreht, auch nicht
Mühle-Hausregel, Sichtschutz und Zoom-Schutz. Unterbrechung dazwischen: ein Netzausfall (Router-Neustart), danach nahtlos weiter.

## Was neu ist
**1. Computer-Tempo** (Lobby unten → *Einstellungen*, oder im Tisch-Menü → *Computer-Tempo*)
- Drei Stufen:
  - *gemütlich* (Standard): 1,5–2,0 s Denkzeit, leicht zufällig
  - *normal*: ca. 0,9 s
  - *flott*: 0,45 s, wie vor dem 29.09.
- Züge des Computers werden sichtbar ausgespielt (gemütlich):
  - Figuren und Steine gleiten 0,6 s; Karten fliegen aus der Gegnerhand in die Mitte.
  - **Dame- und Halma-Sprungketten** laufen Station für Station mit 0,6 s Halt. Geschlagene Steine verschwinden beim Überspringen.
  - **Backgammon:** erst sichtbar würfeln (die Augen wechseln ein paar Mal), dann jeder Teilzug einzeln mit Pause.
  - **Mühle:** erst Setzen oder Ziehen, dann nach einer Pause das Schlagen. Ein gesetzter Stein kommt vom Brettrand herein.
  - **Blackjack-Bank:** Die Karten werden eine nach der anderen aufgedeckt, 1 s Abstand; Summe und Ergebnisse erst danach.
  - **Schnapsen:** Ein fertiger Stich bleibt mindestens 2 s liegen, bevor der Computer neu ausspielt.
- Solange ein Computerzug läuft, steht „Computer zieht …“ bzw. „würfelt …“. Es gibt dann keine Knöpfe und Zughinweise,
  also keinen Fehltipp. Erst danach „Du bist am Zug“.
- Eigene Züge bleiben kurz, die hat man ja selbst gemacht.
- Am Online-Tisch: Wie lange der Computer denkt, bestimmt der Gastgeber. Das Ausspielen macht jedes Gerät in seinem eigenen Tempo.
- Alle Zeiten stehen an einer Stelle: `src/tempo.js`, die alten Werte im Kommentar.

**2. Meldungen länger und nicht verpassen**
- Meldungen kommen nacheinander aus einer Warteschlange statt übereinander. Jede steht mindestens 5 s, Antippen schließt sie.
- Am Tisch stehen sie oben (quer: über der Seitenspalte). So verdecken sie nie die Spielknöpfe unten; das hatte der Netztest aufgedeckt.
- **Banner** über der Leiste des Gegners, gut lesbar, verdeckt das Brett nicht. Es steht mindestens 4 s und bis zu deinem
  nächsten Zug (höchstens 15 s). Beispiele:
  - „Computer sagt 40 an (Herz)“, „Computer tauscht den Atout-Unter“, „Computer dreht zu“
  - „Schach!“, „Mühle – Computer nimmt einen Stein“, „Computer schlägt 2 Steine“
  - „Pasch! Computer würfelt 4 × 4“, „Bank hat 22 – überkauft – du gewinnst 5“
- Banner erscheinen erst, wenn der Zug fertig ausgespielt ist (sonst verriet „Bank hat 22“ das Ende, bevor die Karten lagen).
- **Was ist passiert?** Tipp auf die Status-Zeile (mit ⓘ) oder Menü → die letzten 5 Ereignisse.

**3. Schnapsen: eigene Stiche ansehen**
- Rechts neben der eigenen Hand liegt der eigene Stichstapel: verdeckt gefächert, mit Anzahl. Oben rechts liegt der Stapel
  des Gegners, nur mit Anzahl.
- Tipp auf den eigenen Stapel (oder Menü → *Deine Stiche ansehen*) öffnet das Stich-Blatt:
  - alle eigenen Stiche in Reihenfolge, je Stich beide Karten (die ausgespielte markiert)
  - „Du hast ausgespielt“ bzw. „Computer hat ausgespielt“
  - dazu die eigenen Ansagen (20/40)
- Neue Schnapsen-Optionen:
  - *Eigene Stiche ansehen*: Standard an; aus = Turnierregel.
  - *Augen-Hilfe*: Standard aus. Sie zeigt die Augensumme im Blatt und in der Leiste.
- **Entscheidung:** Die Augensumme stand bisher immer in der eigenen Leiste. Jetzt steht sie nur noch mit Augen-Hilfe dort.
  Sonst wäre das Mitzählen kein Teil des Spiels mehr, wie im Auftrag gewünscht. Wer die Summe immer sehen will, schaltet die
  Augen-Hilfe ein. Der Knopf „Ausmelden (66)“ erscheint weiterhin erst ab 66; das blieb bewusst so, damit sich die Kinder
  nicht irrtümlich ausmelden.
- Verdeckt bleibt verdeckt:
  - Das Blatt liest nur die eigenen gewonnenen Karten aus der eigenen Sicht (`ownTricks` in `engine.js`).
  - Fremde Stiche sind in der Sicht gar nicht vorhanden.
  - Zu zweit am Gerät geht es erst hinter dem Sichtschutz; nach dem eigenen Zug schließt das Blatt von selbst.
  - Im Netz bekommt jedes Gerät weiter nur seine eigene Sicht.
- In der Engine merkt sich jeder gewonnene Stich jetzt, wer ausgespielt hat (`wonTricks`). Alte Spielstände ohne diese Angabe
  laufen weiter; dort fehlt nur „wer hat ausgespielt“.

## Tests (alle grün)
- **Node** (`npm test`, 384 s), 21 Dateien, neu:
  - `tempo.test.mjs` (9 Tests):
    - Stufen und Denkzeiten
    - Schrittfolge von Dame-Kette, Halma, Backgammon, Mühle und Blackjack-Bank
    - „Stich bleibt 2 s liegen“
    - echter Tisch mit Tempo, per Uhr gemessen
    - Ereignistexte aller Spiele
  - `toastqueue.test.mjs` (4 Tests): nacheinander, 5 s, Antippen schließt, keine Doppelten.
  - Schnapsen (32 statt 30):
    - Das Stich-Blatt zeigt genau `won[ich]`, Stich für Stich und wer ausspielte, nie eine fremde Karte.
    - Geprüft in 3772 Sichten aus 120 Zufallsspielen, dazu Zuschauer und Sichtschutz.
- **Browser neu** (`tests/smoke_n3.py`, Pixel 7 hoch und quer, alles bei „gemütlich“):
  - Dame: Der Computer schlägt 2 Steine in einer Kette nach 1,9–2,1 s Denkzeit. Nach 0,5 s steht der Stein an der
    Zwischenstation (3–5 px genau); währenddessen keine Zughinweise.
  - Backgammon: Wurf des Computers sichtbar, Teilzüge einzeln. Währenddessen keine Knöpfe, Status „Computer zieht …“.
  - Blackjack: Die Bank deckt Karte für Karte auf (Verzögerung 0 / 1 / 2 s gemessen).
  - Banner „Computer sagt 40 an“:
    - lesbar (400×59 px hoch)
    - 0 px² Überlappung mit dem Brett
    - steht nach 3,6 s noch
    - Ereignis-Liste über die Status-Zeile
  - Meldungen: nur eine sichtbar, Antippen → nächste, jede ≥ 5 s.
  - Einstellungen: 3 Stufen, gemütlich Standard, Auswahl gespeichert.
  - Stich-Blatt:
    - zeigt genau die eigenen Karten
    - keine einzige verdeckte Karte des Gegners im ganzen DOM/SVG (Attribute und Bildpfade geprüft)
    - Augen-Summe nur mit Augen-Hilfe und dann richtig
  - Zu zweit: Stapel erst nach „Karten zeigen“; nach dem Zug schließt das Blatt, der Sichtschutz steht.
  - 0 App-Fehler.
- **Weiter grün:** `smoke_n2.py`, `smoke.py`, `e2e_n2.py` (Schnapsen/Backgammon/Blackjack online, 3 Geräte),
  `e2e_net.py` (direkt 0,7 s, Auto-Fallback 12,7 s, nur Relay 0,6 s; Partie, Zuschauer, Reload).
- Alle Tests laufen schnell mit `?tempo=test` (setzt `tests/util.py` automatisch).
- Screenshots: `tests/shots/n3/`, Auswahl in `tests/shots/final/n3_*.jpg`, per Bild geprüft.
- **Gefunden und behoben beim Prüfen:**
  - Der geschlagene Stein lag über dem springenden Dame-Stein.
  - „Würfeln“ erschien schon, während der Computer noch zog.
  - Der Tipp aufs Brett schloss das eben geöffnete Blatt gleich wieder.
  - Meldungen verdeckten unten die Knöpfe.
  - Das Bank-Ergebnis kam vor den Karten.

## Bitte am Handy testen
1. **Einstellungen → Computer-Tempo:** Ist „gemütlich“ für die Kinder richtig, oder eher „normal“?
2. **Dame gegen den Computer:** Kann man eine Sprungkette des Computers gut mitverfolgen (Halt an jeder Station)?
3. **Backgammon:** Erst würfelt der Computer, dann zieht er Stein für Stein. Zu langsam oder genau richtig?
4. **Schnapsen: auf deinen Stichstapel tippen** (rechts über deiner Hand):
   - Sind die Karten groß genug?
   - Ist „ausgespielt“ klar?
   - Soll die Augen-Hilfe standardmäßig an sein?
5. **Banner** „Computer sagt 40 an“: gut lesbar, lange genug? Status-Zeile antippen → „Was ist passiert?“
6. **Blackjack:** Bank deckt Karte für Karte auf. Passt der Abstand von 1 s?

## Offen / Ideen
- Tempo pro Spiel (z. B. Blackjack flotter als Dame) wäre einfach nachrüstbar (`src/tempo.js`).
- Töne zu Banner und Würfeln (Wunsch aus Nacht 1).

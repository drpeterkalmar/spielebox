# Spielebox – Schiffe versenken: echte Kriegsschiffe auf See (n8)

Stand 06.10.2026 · Version **`8528d8f3dd`** (live) · Spielen: https://drpeterkalmar.github.io/spielebox/

## Was ist neu (in Alltagssprache)

Statt grauer Kapseln fahren jetzt **richtige Kriegsschiffe von oben gesehen** über das Meer – im Stil des alten
Brettspiels, ohne Flaggen oder Hoheitszeichen. Jeder Typ hat seine eigene, erkennbare Form:

| Schiff | So sieht es aus |
|---|---|
| **Flugzeugträger** (kleine Flotte, 5) | flaches graues Flugdeck mit gestrichelter Mittellinie und Randlinien, zwei Aufzüge, seitliche „Insel“ mit Schornstein, drei geparkte Flugzeuge am Heck |
| **Schlachtschiff** (5 bzw. 4) | breiter Rumpf mit **Holzdeck (Planken)**, vier bzw. drei schwere **Drillingstürme** (zwei vorn, hinten einer oder zwei), große Brücke, dicker Schornstein |
| **Kreuzer** (große Flotte, 4) | schlanker Stahlrumpf, drei **Doppeltürme**, Brücke, **zwei Schornsteine** |
| **Zerstörer** (3) | schmal und spitz, je ein kleiner Turm vorn und hinten, Brücke, Schornstein, zwei Gruppen **Torpedorohre** |
| **U-Boot** (3 bzw. 2) | dunkle **Zigarrenform**, Turm in der Mitte, liegt flach im Wasser (halb überspült) |
| **Schnellboot** (2) | kurz und keilförmig, Glaskanzel, kleines Geschütz, Torpedorohre an den Seiten, **kräftiges Kielwasser** |

- Alle Schiffe haben einen **spitzen Bug mit Bugwelle** und **Kielwasser am Heck**. Jedes zweite Schiff fährt andersherum,
  damit die Flotte nicht wie aufgereiht wirkt. Bug und Bugwelle zeigen immer in Fahrtrichtung.
- **Versenkte Schiffe sind Wracks:** dunkel und verkohlt, mit Rußflecken und Riss. Sie liegen schief, das Heck und eine
  Seite sind schon unter Wasser. Auf „Verziert“ glüht es noch und eine Rauchfahne steigt auf. Die Treffer-Kreuze auf
  Wracks sind jetzt klein, damit man das Wrack sieht. Auf noch schwimmenden eigenen Schiffen bleibt der rote Treffer wie bisher.
- **Mini-Karte und Flottenleiste** (unter bzw. neben dem großen Meer): Statt Pillen stehen dort kleine **Typ-Silhouetten**,
  die Türme als Punkte, ohne Kleinteile. Versenkte Schiffe sind in der Leiste braun-verkohlt.
- **Aufstellen:** Auch hier die echten Schiffe. Das gewählte Schiff ist **gelb getönt und umrandet**, Schiffe, die zu nah
  liegen, sind **rot**. Beides liegt über der Silhouette und ist auf einen Blick klar.
- **Schaukeln („Dünung“):** Etwa alle 19 Sekunden läuft eine sanfte Welle von links nach rechts über das Meer. Jedes
  Schiff neigt sich nacheinander kurz hin und her und kommt wieder zur Ruhe: Es dreht sich ein wenig, Deck und Aufbauten
  wandern quer zum Rumpf (so sieht Rollen von oben aus), der Schatten bleibt liegen, die Bugwelle pulsiert. Jedes Schiff
  schaukelt anders stark, in eine andere Richtung und verschieden lang (1,3–1,7 s). Wracks schaukeln nur träge.
  Das gewählte Schiff beim Aufstellen bleibt ruhig. Das Brett selbst bewegt sich nie, Tippen trifft immer die Zelle.
- **Gegnerische Schiffe bleiben unsichtbar**, bis sie versenkt sind. Dort gibt es keine Bugwelle, keinen Schatten und
  kein Schaukeln. Ein Test prüft das.

Clip vom schaukelnden Meer (2,6 s, eine Dünung beim Aufstellen): **`tests/shots/schiffe-n8/schaukeln.mp4`**

## Warum „Dünung“ statt Dauer-Schaukeln (ehrlich)

Geplant war, dass jedes Schiff ständig schaukelt (Periode 4–7 s). Gemessen hat das das Budget gerissen:

- Dauer-Schaukeln per CSS kostete im Leerlauf **+18 bis +20 Prozentpunkte CPU** (Budget: +5).
- Der Grund: Solange irgendetwas dauernd animiert, zeichnet Chrome 60 Bilder pro Sekunde. Das kostet hier fast gleich viel,
  egal ob ein Schiff oder zehn schaukeln. Selbst ein einzelnes vom Grafikchip bewegtes Kästchen kostete +13 Punkte.
  Weniger Schiffe, kleinere Ausschläge oder eine statische Mini-Karte hätten also kaum geholfen.
- Ein gemeinsamer langsamer Takt (4–8 Bilder pro Sekunde) kostete noch +8 Punkte und hätte geruckelt.
- **Lösung:** Die Bewegung kommt in kurzen, weichen Dünungen (≈ 2 s), dazwischen steht alles still und Chrome zeichnet
  kein einziges Bild. Das ist im Budget.
- Auf die langsam treibenden Wellen im Meer habe ich aus demselben Grund verzichtet (optional laut Auftrag).

Größe des Ausschlags: Ein Rumpf darf laut Auftrag nicht näher als ~14 % an den Feldrand. Lange, breite Schiffe dürfen sich
deshalb nur um 0,5° drehen (Schnellboot 1,5°, höchstens 2,5 % eines Felds Versatz). Damit das Schaukeln trotzdem sichtbar
ist, rollen Deck und Aufbauten zusätzlich quer gegen den Rumpf. Ein Node-Test rechnet für jeden Typ nach, dass nichts über
die eigenen Felder ragt (knappster Abstand 13,3 % eines Felds, auch beim schiefen Wrack).

## Einstellungen und A/B-Vergleich

- **Altes Aussehen** (Kapseln): https://drpeterkalmar.github.io/spielebox/?deko=0
- **Kriegsschiffe ohne Bewegung** („Ruhig“): https://drpeterkalmar.github.io/spielebox/?deko=1
- **Kriegsschiffe mit Dünung, Glut und Rauch** („Verziert“, Standard): https://drpeterkalmar.github.io/spielebox/?deko=2

In der App: Einstellungen → Optik. Bei „Bewegung reduzieren“ am Handy schaukelt nichts. Ruckelt es, nimmt die App die
Dünung erst zurück (seltener) und schaltet sie dann ab.

## Messung

Werkzeug: `tests/schiffe_n8.py perf` (Pixel 7, Chromium über Metal). Frame-Zeiten mit CPU 4× gedrosselt, CPU gesamt
(alle Chromium-Prozesse) ungedrosselt. „Vorher“ = Stand vor dem Umbau (`e5300a1`), gemessen vor der ersten Änderung.

**Schießen, große Flotte, 3 eigene Treffer, 1 versenktes Gegner-Schiff, Computer spielt (12 s)**

| | p95 vorher → nachher | lange Frames vorher → nachher | CPU gesamt vorher → nachher |
|---|---|---|---|
| hoch (`deko=2`) | 27,30 → 27,30 ms | 2,5 → 2,6 % | 26,6 → 26,4 % |
| quer (`deko=2`) | 27,25 → 27,30 ms | 1,8 → 2,4 % | 26,1 → 26,2 % |
| zum Vergleich `deko=1`, gleicher Code, Wiederholungen | 27,3–28,5 ms | 1,8–3,1 % | 21–24 % |

p95 ist gleich. Die langen Frames schwanken schon beim *gleichen* Code zwischen 1,8 und 3,1 %. Die Unterschiede liegen
also im Messrauschen. Eine direkt verschränkte Messung (alter und neuer Stand abwechselnd im selben Browser, 4 Läufe)
zeigt den neuen Stand eher besser: p95 58 statt 67 ms, lange Frames 36 statt 71 %. Diese Messung lief aber unter der
unten beschriebenen nächtlichen Bremse, deshalb sind die Zahlen hoch.

**Leerlauf (nur Schaukeln), 25 s, CPU gesamt** – Budget: höchstens +5 Punkte gegen `?deko=1`

| Szene | `deko=1` | Dauer-Schaukeln per CSS (verworfen) | Dünung (gemessen, Zwischenstand) |
|---|---|---|---|
| Schießen, nichts tun, hoch | 0,3 % | 17,5 % (**+17**) | 5,1 % (**+4,8**) |
| Schießen, nichts tun, quer | 0,1 % | 19,0 % (**+19**) | 5,0 % (**+4,9**) |
| Aufstellen, hoch | 0,3 % | 19,2 % (**+19**) | 5,1 % (**+4,8**) |
| Aufstellen, quer | 0,1 % | 20,0 % (**+20**) | 5,1 % (**+5,0**) |

Die 25 s erwischen immer zwei Dünungen (eine direkt beim Öffnen). Auf Dauer ist es eine pro ~19 s, der Mittelwert liegt also
niedriger. Gemessen wurde der Zwischenstand mit 16–18,5 s Pause und 1,4–1,8 s Nachrollen. Danach habe ich für mehr Luft
die Pause auf 17,5–20 s verlängert und das Nachrollen auf 1,3–1,7 s verkürzt (etwa 10 % weniger Bewegungszeit). Das
konnte ich nicht mehr nachmessen: Ab etwa 3:20 Uhr hat der Mac mini Browser-Bilder nur noch im 15- bzw. 7,5-Hz-Takt
geliefert. Das betraf auch den unveränderten neuen Stand (p50 33–133 ms statt 13 ms), eine Thermik-Warnung gab es nicht.
Vermutlich war der angeschlossene Bildschirm nachts im Standby oder macOS hat im Hintergrund Medien analysiert.
Nachmessen bei Tag:
`python3 tests/schiffe_n8.py perf leerlauf_final --ab='deko=1|deko=2' --nur=leerlauf,aufstellen`.

**Ladegröße** (Vorab-Cache des Service-Workers, gzip): Kern 990,8 → 1 000,2 KB, **+9,4 KB** (Budget +30 KB). Bilder unverändert.
Keine neuen Dateien außer `src/games/schiffe/boats.js`, keine externen Anfragen. Der Clip liegt nicht im Cache.

## Bilder

- Vergleich vorher ↔ nachher: `tests/shots/schiffe-n8/vergleich_hoch.jpg`, `vergleich_quer.jpg` (Aufstellen, Schießen große und kleine Flotte).
- Alle Einzelbilder lokal in `tests/shots/schiffe-n8/nachher/` (bzw. `vorher/`): Aufstellen klein und groß, gewählt (gelb),
  zu nah (rot), Schießen, eigene Treffer (Ausschnitt Mini-Karte), Wrack (Ausschnitt großes Meer), jeweils hoch und quer.
  Dazu `schaukeln_*_a/b/c`: Ruhe, Ausschlag, Gegen-Ausschlag einer Dünung (großes Meer und Mini-Karte).
- Selbst angesehen: Die Typen sind klar zu unterscheiden, auch auf der Mini-Karte (Träger flach und grau, Schlachtschiff
  mit Holzdeck, U-Boote dunkel). Der Bug zeigt in Fahrtrichtung, nichts ragt über die Felder, die Treffer sitzen auf dem
  Schiff und schaukeln mit.

## Geprüft

- `npm test -- --schnell`: alle Node-Tests grün, dazu `schiffe.swarm.test.mjs` (Zufalls-Schwarm) und `schiffe.test.mjs` grün.
  Regeln, Engine, Bot, Netz und Speicher sind nicht verändert.
- Neu `tests/node/schiffe_boats.test.mjs` (läuft in `npm test`): jedes Schiff beider Flotten hat seinen Typ, Ränder beim
  Schaukeln und als Wrack, Wellen in den Feldern, Türme je Typ (4/3/3/2/1/1), Mini-Karte ohne Rohre, keine Flaggen oder Texte.
- Neu `python3 tests/schiffe_n8.py check`, alles grün:
  - Vor dem Versenken steht im Gegner-Meer kein Schiffsteil. Auch die Wasser-Ebene darunter enthält keins.
  - Danach steht dort genau das versenkte Schiff, an seiner Stelle und mit seinem Typ.
  - Die 3 eigenen Treffer hängen in der Schiffsgruppe.
  - Eine Dünung läuft und endet von selbst, zwischen den Dünungen gibt es 0 Animationen.
  - Ein Tipp während einer Dünung wählt das Schiff, das gewählte Schiff schaukelt nicht.
  - `?deko=0` zeigt die alten Kapseln ohne neue Teile, `?deko=1` zeigt Schiffe ohne Bewegung.
  - Bei „Bewegung reduzieren“ schaukelt nichts. 0 Seitenfehler.
- `smoke_n4.py schiffe` grün (hoch, quer, Desktop), auch mit `?deko=0` und `?deko=1`. `e2e_n4.py schiffe` grün: Der Gast sah
  die Flotte des Hosts nie (70 Züge: Zustand, Verlauf, Bild).
- Live: Version `8528d8f3dd` auf der Live-Seite = lokal, `boats.js` live abrufbar (Code-Marker „Flugzeugträger“).

## Worauf Peter am Handy achten soll

1. **Damit die neue Version kommt:** Die Spielebox-App ganz schließen (aus der App-Übersicht wischen) und neu öffnen.
   Unten in der Lobby muss **`8528d8f3dd`** stehen.
2. Eine Partie Schiffe versenken gegen den Computer starten. Beim Aufstellen sieht man die Schiffe groß. Nach ein bis zwei
   Sekunden und dann etwa alle 19 Sekunden läuft eine Dünung durch. **Ist das Schaukeln gut zu sehen, oder zu zart?**
   Wenn es dauernd schaukeln soll, kostet das Akku. Das wäre eine bewusste Entscheidung von dir.
3. Mini-Karte im Hochformat: **Kann man die Schiffstypen erkennen?** Ist die Flottenleiste (kleine Silhouetten statt Pillen) lesbar?
4. Ein Schiff versenken: Gefällt das schiefe, verkohlte Wrack mit Glut und Rauch?
5. Zum Vergleich jederzeit `?deko=0` (alte Kapseln) bzw. `?deko=1` (Schiffe ohne Bewegung).

## Offen / nicht gemacht

- Kein Dauer-Schaukeln (Budget, siehe oben), keine treibenden Wellen im Meer.
- Leerlauf-CPU der letzten, sparsameren Einstellung nicht mehr nachgemessen (nächtliche Bremse am Messrechner). Gemessen
  wurde der Zwischenstand mit +4,8 bis +5,0 Punkten. Der Endstand bewegt sich etwa 10 % kürzer.
- Die Messung ersetzt kein echtes Handy.

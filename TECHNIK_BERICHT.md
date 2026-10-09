# Spielebox – Technik-Nacht n9: sattes Material bei null Dauerlast

Stand 09.10.2026 · Version **`e85f75d76b`** (live) · Spielen: https://drpeterkalmar.github.io/spielebox/

## Kurz (in Alltagssprache)

- **Holz und Filz wirken satter.** Auf allen Brettern liegt jetzt eine einmal vorgebackene Licht-Ebene: Licht fällt von
  links oben ein, rechts unten wird das Holz tiefer, dazu eine feine Struktur. Die Kante des Holzrahmens hat eine
  schmale Lichtkante (Fase). Kostet beim Spielen nichts, weil diese Ebene nur einmal gezeichnet wird.
- **Steine sind sofort „echte“ Bilder.** Dame-, Backgammon-, Halma-Steine, Chips, Würfel und Bohnen werden einmal je
  Bildschirmgröße vorgezeichnet. Früher sah man sie bis zum ersten Zug als teure Vektorform, jetzt ab dem ersten
  Augenblick. Am Handy scharf, am Desktop scharf, kleine Halma-Kugeln kosten weniger.
- **Animationen rechnen die Seite nicht mehr neu.** Konfetti-Sieg bei Vier gewinnt: halb so viele Layout- und
  Malvorgänge wie vorher. Pulsieren, Leuchten und Überblenden laufen nur noch über Deckkraft und Verschieben.
- **Weniger zum Herunterladen.** Was die App für offline vorlädt, ist **388 KB kleiner** (gzip 3,76 → 3,37 MB) und
  besteht aus **151 statt 229 Dateien**. Bei den Bildern sind es **18 statt 99** Dateien: Die 84 Kartenbilder kommen
  jetzt in **2 Kartenpaketen**. Die App-Icons sind 395 KB kleiner, ohne sichtbaren Unterschied.
- **Kartenbilder sind unverändert, Bit für Bit.** Der erste Tisch ist ohne Cache eher schneller, mit Cache gleich
  schnell. Es gibt keine neue Dauer-Animation: In der Lobby und am ruhenden Tisch rechnet nichts.

**Ehrlich:** Das Ziel „−500 KB“ habe ich mit −388 KB verfehlt. Die fehlenden ~120 KB hätte der Karten-Atlas gebracht. Er
war aber im Browser schlechter, siehe E1: bis +100 MB Speicher am Kartentisch und dreimal so langsam beim ersten Tisch.
Er bleibt als Versuch erreichbar (`?atlas=1`), Standard sind die Kartenpakete.

## Regler zum Vergleichen

| Regler | Wirkung |
|---|---|
| `?material=0` | ohne Licht-Ebene und Fase (die Ebene wird dann gar nicht geladen) |
| `?sprites=0` | Steine als Vektorform statt vorgezeichneter Bilder |
| `?atlas=1` | Karten aus dem Atlas statt Einzelbildern (Versuch, nicht Standard) |
| `?deko=0` | altes, schlichtes Aussehen (wie bisher) |

Beispiel: https://drpeterkalmar.github.io/spielebox/?material=0

## Wie gemessen wurde (und eine Falle)

- **Profil Mittelklasse:** Pixel 7 hoch und quer (DPR 2,625), CPU 4× gedrosselt. Werkzeug: `tests/deko_perf.py`.
  **Vorher** (main `f2cbf5f`, als git worktree) und **nachher** liefen in **einem** Lauf abwechselnd Szene für Szene.
  So treffen Takt- und Wärmeschwankungen beide gleich.
- **Falle:** Der Bildschirm des Mac mini war gesperrt. Dann bremst macOS die Zeitgeber des Test-Browsers so stark, dass
  selbst eine leere Seite nur alle 70–150 ms ein Bild zeichnet. Probiert, ohne Erfolg: App-Nap-Schalter,
  Prozess-Priorität, Fenster-Modus, Chrome-Schalter. Die üblichen Bildabstände (p95 „27–32 ms“ aus dem Deko-Bericht)
  sind heute Nacht deshalb **nicht vergleichbar**. Ich messe darum zusätzlich die **Bildkosten**: die Zeit im
  Hauptthread vom Start eines Bildes bis nach Stil, Layout und Malen. Sie hängt nicht vom Bildtakt ab. Dazu kommen
  CPU-Last und CDP-Trace.
- Rohdaten: `docs/technik/messung_vorher.json` (E0), `messung_nachher.json` (E4), `e1_abnahme.json`, `e3_trace.json`.

## Ergebnis vorher → nachher

**Bildkosten p95 (ms, Hauptthread je Bild, CPU 4×)** und CPU aller Chrome-Prozesse (ungedrosselt):

| Szene | hoch p95 | quer p95 | CPU hoch | CPU quer |
|---|---|---|---|---|
| Lobby, Leerlauf | 0,15 → 0,10 | 0,10 → 0,15 | 0,3 → 0,3 % | 0,4 → 0,2 % |
| Vier gewinnt, Konfetti-Sieg* | 2,95 → **2,65** | 3,30 → 3,30 | 12,9 → **9,1 %** | 11,9 → **8,0 %** |
| Schnapsen, Karten spielen* | 3,05 → 3,00 | 3,80 → **3,40** | 21,0 → 19,2 % | 22,6 → 21,0 % |
| Halma, viele Steine | 3,15 → **2,95** | 6,40 → **3,90** | 9,7 → **6,7 %** | 10,3 → **8,0 %** |

\* 4 Wiederholungen. Der erste Lauf mit 2 Wiederholungen zeigte bei Vier hoch +0,25 ms und Schnapsen quer +0,4 ms. Mit
4 Wiederholungen ist das als Rauschen bestätigt. Halma hoch nach der Halma-Korrektur (eigener Lauf). Alles in
`messung_nachher.json`.

**Budget:** p95 gleich oder besser ✓ · keine neue Dauer-Animation ✓ (Lobby und ruhender Tisch ≈ 0,2–0,3 % CPU wie
vorher; rAF läuft weiter nur während Effekten. Die Sprites werden per `toBlob`-Rückruf getauscht, nicht per rAF).

**Laden:**

| | vorher | nachher |
|---|---|---|
| Vorab-Liste (offline) | 229 Dateien, davon 99 Bilder | **151 Dateien, davon 18 Bilder** |
| Vorab gzip | 3 760 KB | **3 372 KB (−388 KB)** |
| Lobby beim ersten Öffnen (gzip) | 813 KB, 149 Anfragen | 790 KB, 156 Anfragen (+3 kleine Module, +1 Licht-Ebene 9,5 KB) |
| Erster Tisch Schnapsen, kalt (ohne Cache) hoch / quer | 796 / 736 ms | **724 / 728 ms** |
| Erster Tisch, warm (Service-Worker) hoch / quer | 621 / 626 ms | 633 / 642 ms (Rauschen; Einzelläufe 618–637 ms) |

**CDP-Trace während Konfetti-Sieg (6 s):**

| | vorher | nachher |
|---|---|---|
| Layout | 52× / 6,7 ms | **25× / 4,4 ms** |
| Stil (UpdateLayoutTree) | 52× / 14,7 ms | 52× / **11,3 ms**, je 1 Element statt 4 |
| Malen (Paint) | 121× / 23,3 ms | **59× / 10,3 ms** |
| Rastern | 144× / 8,7 ms | **52× / 6,4 ms** |
| Animationen nicht auf transform/opacity | `stroke-width/stroke-opacity` (8×), `border-*-color` (4×) | **keine** |

Lobby (Leerlauf mit Kachel-Einblendung): Malen 15,4 → 9,6 ms, Layout 14 → 13.

## E0 – Messung vorher
- `tests/deko_perf.py` (Vorbau, im Browser abgenommen) mit `--form=hoch,quer`, den Szenen Lobby, Schnapsen,
  Halma und Konfetti-Finale, `--erster-tisch` (kalt/warm) und `--trace`.
- Von mir ergänzt:
  - **Bildkosten** je Bild (siehe Falle oben)
  - `--alt=<Ordner>` für vorher/nachher in einem Lauf
  - Gesamtzahl der Anfragen beim ersten Tisch
- Test-Browser laufen jetzt immer stumm (`--mute-audio` in `tests/util.py`).

## E1 – Laden: Atlas abgenommen, aber Kartenpakete genommen
Der Vorbau hatte Kartenblätter als 8 WebP-Atlanten gebaut (`tools/build_atlas.mjs`) und `cards.js` darauf umgestellt.
Abnahme im Browser (`tests/technik_n9.py karten|speicher`):

- **Pixel je Karte** (Einzelbild gegen Atlas, gleicher Spielstand, hoch/quer/Desktop):
  - Deutsches Blatt: ≥ 44 dB (kein Unterschied sichtbar).
  - Französisches Blatt: 28–33 dB, größte Abweichung 88. Ursache ist die Kantenglättung des Browsers. Die Atlas-Karten
    wirken in 3× Vergrößerung minimal schärfer, in Originalgröße sieht man nichts.
  - Zum Vergleich: Dieselbe Einzelkarte als HTML-`<img>` gegen SVG-`<image>` weicht im Browser schon um 20–42 dB ab.
- **Speicher:** Ein Atlas wird immer ganz dekodiert. Das kostet am Renderer gemessen:

  | Tisch | Einzelbilder | Atlas |
  |---|---|---|
  | Hold'em | 200 MB | 302 MB |
  | Blackjack | 179 MB | 279 MB |
  | Schnapsen | 174 MB | 211 MB |

  Rechnerisch belegen die Atlanten 84 MB statt 9 MB Bildspeicher. Für Mittelklasse-Handys ist das ein echtes Risiko.
- **Erster Tisch:**
  - Kalt: 2 222 ms statt 796 ms (950-KB-Atlas statt 6 kleiner Karten).
  - Warm: 758 statt 621 ms (großes Bild dekodieren).
- **Entscheidung:** Der Atlas ist nicht Standard, er bleibt als `?atlas=1`. Stattdessen habe ich den „Plan B“ des
  Vorbaus gebaut, die **Kartenpakete** (`tools/cardpack.py`):
  - Die 84 @2x-Karten liegen Byte für Byte hintereinander in `assets/cards/paket/de@2x.bin` und `fr@2x.bin`.
  - Der Service-Worker lädt nur diese 2 Dateien vorab und beantwortet jede Karten-Anfrage mit dem passenden Ausschnitt
    (`Blob.slice`, ohne Kopie).
  - Die Seite zeichnet die Einzelkarte wie vorher. Pixel und Speicher sind identisch, die Anfragen sinken trotzdem.
  - `update_sw.py` baut die Pakete selbst mit; `--check` schlägt fehl, wenn ein Paket nicht zu den Karten passt.
- **Geprüft:**
  - `tests/test_sw.py`:
    - Jede Probe-Karte kommt bitgleich (SHA-256) aus dem Paket, ohne Netzabruf.
    - Die Einzelkarten liegen nicht doppelt im Cache.
    - Das Update holt nur das geänderte Paket.
    - Offline gehen Schnapsen und Dame.
    - Der Umstieg von der alten Live-Version holt genau die 3 neuen Dateien und räumt die alten Einzelkarten weg.
  - `tests/node/cardpack.test.mjs` prüft jede Karte im Paket.
- **Icons:** `tools/shrink_icons.py` (nur Pillow; oxipng und pngquant gibt es auf dem Mac nicht) macht Palettenbilder:

  | Icon | vorher | nachher |
  |---|---|---|
  | icon-512 | 262 KB | 43 KB |
  | maskable-512 | 165 KB | 60 KB |
  | icon-192 | 52 KB | 10 KB |
  | apple-touch | 44 KB | 24 KB |

  Angesehen in `tests/shots/technik/icons_alt_neu.jpg`: keine sichtbaren Farbstufen.
- **AVIF** gibt es nicht: Dafür bräuchte es `avifenc` als zusätzliche Abhängigkeit und eine Format-Weiche je Karte.
  Bei bitgleichen Paketen bringt es ohnehin nichts.

## E2 – Plastizität (Material + Sprites)
- **Licht-Ebene** (`tools/bake_material.py`, eine 512²-WebP mit 9,5 KB, `mix-blend-mode: soft-light`):
  - Die Vorbau-Fassung **ersetzte** die Randabdunklung. Im A/B wirkte das Brett dadurch flacher und heller (erste
    Runde in den Collagen).
  - Jetzt liegt die Ebene **zusätzlich** über der bewährten Randabdunklung. Stärken: Licht 30, Vignette 14, Struktur 11.
  - Ergebnis: Dunkle Felder sind tiefer, das Holz wirkt satter, Licht kommt von links oben. Bei 1:1 keine Flecken oder
    Muster.
  - **Standard an** (`flags.js`); `?material=0` lädt die Ebene gar nicht erst.
  - Collagen: `tests/shots/technik/mat_*` (vorher | mat0 | mat1b).
- **Fase:** schmale Lichtkante am Holzrahmen (`dk-chamfer`) aus dem Vorbau, unverändert übernommen. Sie ist dezent.
- **Sprites je Größe** (Vorbau: Kachelstufen 48–288 px nach Brett-Maßstab):
  - Abgenommen, Halma am Handy ist genauso scharf wie vorher.
  - **Neu:** Steine blieben bis zum ersten Zug Vektor, weil das Bild erst kurz nach dem Zeichnen fertig ist. Jetzt
    tauscht `spriteLater()` die Vektor-Formen eines Steins an Ort und Stelle gegen das fertige Bild. Die Gruppe des
    Steins bleibt, mit Lage, Auswahl und laufender Animation.
  - `spriteImage()` tauscht außerdem eine Rückfall-Größe gegen die passende Kachel.
  - Gilt für Dame, Backgammon, Halma, Würfel, Hold'em-Chips, Vier und Blackjack-Bohnen.
  - Collagen: `e2_*`.
- **Leistung Material an gegen aus:** Bildkosten p95 −0,4 … +0,5 ms (Rauschen), CPU gleich.
- **Fehler gefunden und behoben** (beim Ansehen der Übersicht in E4):
  - Bei Halma lag seit dem E2-Push eine **graue Scheibe** hinter dem Stern. Außerhalb des Sterns hat das weiche Licht
    nichts zum Mischen.
  - Behoben in `0435b51`: Die Ebene ist auf den Stern beschnitten, die Mischart sitzt an der Gruppe.
  - Live war der Fehler rund eine Stunde (09:59–11:01). Alle anderen Spiele habe ich danach im Kontaktbogen geprüft,
    sie waren sauber.

## E3 – Nur Compositor
- **Vorbau-Änderungen, im Browser abgenommen:**
  - Puls-Ring als `::after` (transform/opacity).
  - Hinweis-Ringe Mühle/Dame/Schach und Hold'em-Zug pulsen über opacity statt über die Strichstärke.
  - Schalter per `translateX`, Bewertungsbalken per `scaleY` (Richtung geprüft: Füllung von unten, gleiche Höhe).
  - `will-change` nur während Animationen.
  - `contain` für Lobby-Kacheln, Seitenleiste und Spielerbalken.
- **Gefunden im Trace:** Nach dem Vorbau verdoppelten sich die Stil-Berechnungen während Konfetti (47 → 89).
  - Grund: In SVG läuft auch opacity **nicht** auf dem Compositor. Jedes animierte Element kostet je Bild eine
    Stil-Berechnung.
  - Das neue Leuchten der Gewinnreihe animierte 12 Ringe statt 4.
  - Jetzt pulsiert die Reihe als **eine Gruppe**.
- **Spielerbalken:** Rahmen und Hintergrund liefen als Farbübergang, das war die letzte Animation, die neu malte.
  Jetzt sind Grund- und Aktivfläche zwei Ebenen (`::after`/`::before`), die per opacity überblenden. Damit braucht der
  Balken kein `contain: paint` mehr (es hätte Rahmen und Schein beschnitten).
- **Lobby:** `content-visibility: auto` entfernt. Im Querformat sprang damit die Seitenhöhe beim Scrollen
  (1884 → 1819 px); bei 16 Kacheln spart es kaum etwas. `contain: layout paint style` bleibt.
- **Schiffe-Spritzer:** Der Ring wächst per scale. Der Strich bleibt dank `non-scaling-stroke` gleich dick wie vorher.
  Der Maßstab kommt aus der schon gemessenen Brettgröße, also ohne zusätzliches Layout.
- **Sichtbar anders, bewusst so:**
  - **Würfelglück-Aufblitzen:** Vorher wurde der Hintergrund kurz durchsichtig-gelb (über dem Filz olivgrün), nach 50 %
    sprang er zurück. Jetzt blitzt die Zeile hellgelb und blendet weich aus.
  - **Hinweis-Ringe** werden blasser statt dünner.
  - Der **„Mitspielen“-Knopf** behält beim Pulsieren seinen Schatten. Vorher hat die Animation ihn überschrieben.
- Serienbilder: `tests/shots/technik/e3_serie_puls.jpg`, `e3_serie_schiffe_ring.jpg`, `e3_serie_wuerfelglueck.jpg`;
  dazu Collagen `e3_*`.

## Bilder (selbst angesehen)
- `tests/shots/technik/uebersicht_hoch.jpg`, `uebersicht_quer.jpg` – 8 Szenen vorher | nachher.
- `mat_*` – Material A/B; `e2_*` – Sprites + Material; `e3_*` – Animationen; `e4_halma_*` – Halma nach der Korrektur.
- `icons_alt_neu.jpg`.

**Bewertung (ehrlich):**
- Der Unterschied ist **dezent**, nicht spektakulär. Auf Dame, Schach, Backgammon und Halma sieht man das Licht von links
  oben und die tieferen dunklen Felder deutlich. Auf dem Filz der Kartenspiele ist es nur ein Hauch.
- Steine und Karten sehen aus wie vorher; das war Absicht (Karten unverändert).
- Der größere Gewinn dieser Nacht liegt unter der Haube: Animationen ohne Neuberechnung der ganzen Seite, Steine ab dem
  ersten Bild als Sprite, weniger CPU, kleineres und schlankeres Vorladen.

## Tests
- Node, ganze Suite inkl. Schwarm: alle grün (917 s). Schnell-Suite nach E3: grün (241 s). CI auf GitHub grün.
- Browser:
  - `smoke.py`, `smoke_n3/n4/n5/n6.py` und `test_nav.py` grün.
  - `test_sw.py` grün, auch mit `SW_ALT` (Umstieg von der alten Live-Version).
  - `test_live.py` nach jedem Push grün.
  - `smoke_n5.py` war einmal rot: Der Knopf „Neues Turnier“ wurde zwischen „sichtbar“ und „antippen“ neu gezeichnet.
    Das ist ein seltener Wettlauf im Test, unabhängig von dieser Nacht. Danach war er zweimal grün.
- Neue Tests: `cardpack.test.mjs`; `test_sw.py` (Paket bitgleich, Umstieg genau); `material.test.mjs`
  (Standard an).

## Vorbau (Leicht-Spur) und Zusammenführung
- Branch `vorbau/spielebox-n9-technik` (9 Commits, ohne Browser gebaut) per `--no-ff` in main geholt, **ohne Konflikte**.
  Danach habe ich den Branch gelöscht und die Übergabe `VORBAU_spielebox-n9-technik.md` hier eingearbeitet und aus dem
  Repo entfernt.
- **Übernommen wie gebaut:** Mess-Skript (mit einem behobenen Fehler: alte Liste `ASSETS`), Atlas-Werkzeug und
  -Manifest, Icons, Sprites je Größe, Licht-Ebene samt Werkzeug, Fase, alle Compositor-Umbauten außer den unten
  genannten.
- **Im Browser geändert:**

  | Vorbau | jetzt | Grund |
  |---|---|---|
  | Atlas als Standard | Kartenpakete, Atlas nur `?atlas=1` | Speicher, erster Tisch (E1) |
  | Licht-Ebene ersetzt Randabdunklung, Standard aus | liegt zusätzlich darüber, neu abgestimmt, Standard an | Abnahme am Bild (E2) |
  | Halma-Licht als Kreis | auf den Stern beschnitten | graue Scheibe (E2) |
  | Leuchten als 12 einzeln pulsierende Ringe | eine pulsierende Gruppe | Trace (E3) |
  | `.pbar` mit `contain: paint`, Farbübergang | Überblendung zweier Ebenen | Trace, Beschneiden (E3) |
  | `content-visibility` auf Lobby-Kacheln | entfernt | Scrollhöhe sprang (E3) |
  | Spritzer-Strich wächst mit | gleich dick wie vorher | Abnahme am Bild (E3) |
  | Steine bis zum ersten Zug Vektor | sofort Sprite | `spriteLater` (E2) |

- **Nicht gemacht:**
  - AVIF (siehe E1).
  - Licht-Ebene für Ludo-Zonen und das Schiffe-Wasser; dort bleibt die bisherige Randabdunklung.
  - Messung auf echten Geräten (iPhone, Android); nur Emulation.

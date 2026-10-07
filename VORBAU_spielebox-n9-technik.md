# Vorbau `spielebox-n9-technik` (Leicht-Spur, 07.10.2026)

Branch `vorbau/spielebox-n9-technik` (von `origin/main` f2cbf5f), alles gepusht. **main ist unberührt.**
Ohne Browser, Server und Bundler gebaut. Geprüft mit Node-Unit-Tests, Python-unittest und CI. Bilder habe ich nur als Datei angesehen.
**Im Browser ist noch nichts abgenommen.** Das macht der Heavy-Job (Liste unten).

| Commit | Inhalt |
|---|---|
| 30882a3 | E1: Atlas-Build-Skript, 8 Atlanten, Manifest `src/ui/cardatlas.js` |
| 0db74bd | E1: Karten aus dem Atlas zeichnen, Precache auf Atlanten, Tests umgestellt |
| c2e48f4 | E1 #7: Icons als Palettenbilder (531 → 136 KB) |
| 68de6b4, caaa795 | E3: nur Compositor-Animationen, `will-change` nur während Animation, `contain`/`content-visibility` |
| 3a743cf | E0: `deko_perf.py` erweitert (nicht ausgeführt) |
| 355731f | E2: Stein-Sprites je Bildschirmgröße, `?sprites=0` |
| ecb8d37 | E2: vorgebackene Licht-Ebene + Fase, `?material=0\|1`, **Standard aus** |

**CI auf dem Branch:** Die Node-Schnell-Suite ist grün (310 s). Rot ist nur „Service-Worker-Version passt zum Inhalt“. Das ist gewollt:
`sw.js`/`src/build.js` neu erzeugen (`python3 tools/update_sw.py`) gehört laut Auftrag dem Heavy-Job.

**Precache, aus den Git-Ständen berechnet (nicht im Browser gemessen):** main 229 Dateien, davon 99 Bilder, gzip 3760 KB.
Branch 153 Dateien, davon 20 Bilder, gzip 3248 KB. Das sind **−512 KB**, Ziel war −500 KB.
Die Ersparnis kommt aus den Icons (−395 KB) und den Atlanten (−121 KB). Die Licht-Ebene kostet +5 KB.

---

## Hinweis zur Vorher-Messung (E0)
Das erweiterte Mess-Skript liegt nur auf dem Branch. Für die Vorher-Messung auf main:
```bash
git switch main && git show origin/vorbau/spielebox-n9-technik:tests/deko_perf.py > tests/deko_perf_n9.py
python3 tests/deko_perf_n9.py n9_vorher --form=hoch,quer --nur=lobby_idle,schnapsen_anim,halma_anim,vier_sieg --erster-tisch --trace
rm tests/deko_perf_n9.py      # Ergebnis: tests/out/perf_n9_vorher.json, Traces tests/out/trace_n9_vorher_*.json.gz
```
Das Skript braucht nur `tests/util.py` und `tests/deko_rundgang.py`, beide auf main identisch.

## E0 – Messung (Skript fertig, nicht ausgeführt)
- **Fertig:** `tests/deko_perf.py`
  - `--form=hoch,quer` mit Schlüssel `szene@quer`
  - neue Szenen `schnapsen_anim` (Kartentisch) und `halma_anim` (viele Steine); das Konfetti-Finale ist weiter `vier_sieg`
  - `--erster-tisch`: Schnapsen ab Navigationsstart, bis der Tisch steht und alle angefragten Bilder geladen und dekodiert sind. Kalt = ohne Cache, warm = Service-Worker von Hand registriert, wie in `test_sw.py`. CPU 4× gedrosselt. Ergebnis zusätzlich: Anfragen, KB, Atlas- und Einzelkarten-Anzahl.
  - `--trace`: Playwright `browser.start_tracing` für Konfetti und Lobby. Ausgewertet werden Summen für Layout/UpdateLayoutTree/Paint/PrePaint/Raster, die Layout-Auslöser (Stack) und Animationen mit `compositeFailed`/`unsupportedProperties`. Roh-Trace als `.json.gz`.
  - **Fehler auf main behoben:** `load_size()` las noch `const ASSETS = [`. Seit dem Umbau heißt die Liste `CORE_FILES` + `PRE`, das alte Skript wäre beim Teilen abgebrochen.
- **Geprüft:** `python3 -m unittest tests/test_perf_trace.py` (Trace-Auswertung, sw.js-Listen, Szenen), Syntax- und JS-Parse-Check.
- **Heavy-Job:** Das Skript ist im Browser ungetestet. Möglicher Haken: `trace_scene` mit Lobby lädt neu, um das Einblenden der Kacheln aufzuzeichnen, und `first_table` warm (SW-Registrierung über `?nosw`-Seite).
  Die Trace-Kategorie `blink.animations` liefert je nach Chrome-Version `compositeFailed` in `args.data`. Falls leer, gibt es den Rückfall: Layout-Zählung während Konfetti.

## E1 – Laden (Atlas + Icons)
**Fertig**
- `tools/build_atlas.mjs` und `tools/atlas_lib.mjs` (reine Funktionen). Je Blatt und Auflösung 2 WebP-Atlanten in `assets/cards/atlas/`:
  - `de-a` = 20 Schnapskarten (A Z K O U), `de-b` = 9/8/7 (nur Mau-Mau)
  - `fr-a` = Pik+Herz, `fr-b` = Karo+Kreuz
  - @2x: `de-a` 2560×3200, `fr-*` 3584×2944, alles ≤ 4096
  - Quellen sind die eingecheckten Einzelkarten. Sie bleiben im Repo, ebenso `SOURCES.md`.
- Pixeltreue, so gelöst:
  - Jede Karte beginnt auf dem 16-px-Blockraster von WebP, Gutter 16 px mit wiederholtem Rand gegen Mipmap-Ausbluten.
  - Als Eingabe dient `dwebp -nofancy`: Die Farbebene wird verdoppelt und von cwebp exakt zurückgemittelt.
  - Es gilt die kleinste Qualität, bei der jede Karte besteht. Kriterium: PSNR (vormultipliziert) der schlechtesten Karte in halber Größe ≥ 39,5 dB und Mittel in voller Größe ≥ 42 dB.
  - Ergebnis: de 43–44 dB (q84), fr Bildkarten 39,5–39,9 dB, Mittel 44–46 dB (q78–90).
  - Größe @2x: 2484 KB in 4 Dateien statt 2605 KB in 84 Dateien. 1×: +11 KB.
  - `node tools/build_atlas.mjs --check` prüft Atlas und Manifest gegen die Einzelkarten (Laufzeit ~30 s).
- `src/ui/cardsprite.js` (rein): Lage, SVG-Ausschnitt, CSS-Hintergrund mit Prozentlage, `?atlas=0`. Dazu `src/ui/flags.js` (`urlFlag`).
- `cards.js`: Vorderseiten als `<svg class="card-face" viewBox="Ausschnitt"><image href="Atlas"/></svg>`, gleiche Lage und Größe wie vorher das `<image>`. Mit `?atlas=0` oder bei unbekannter Karte: Einzeldatei wie bisher.
- HTML-Kartenbildchen bleiben `<img>`, damit Selektoren wie `img[data-card]` und `.sb-card img` weiter greifen. Sie haben ein 1×1-Platzhalter-GIF und den Atlas als Hintergrund samt `aspect-ratio`. Betroffen: Stich-Blatt Schnapsen, Hold'em-Rangliste, Hold'em „letzte Hand“; letztere nimmt am Handy jetzt @2x aus dem vorgeladenen Atlas statt 1× einzeln.
- CSS: Leuchten ausgewählter bzw. gezogener Karten jetzt `.card.sel > .card-face` (direktes Kind). Sonst hätte der Filter den ganzen Atlas getroffen und wäre am Ausschnitt abgeschnitten worden.
- `tools/update_sw.py`: vorab nur noch die 4 @2x-Atlanten statt 84 Einzelkarten. Einzelkarten und 1×-Atlanten kommen bei Bedarf in den Bilder-Cache.
- Tests umgestellt:
  - `test_sw.py`: geändertes Bild ist `atlas/de-a@2x.webp`, Offline-Abruf geht auf die Atlanten
  - `test_live.py`: Offline-Abruf auf Atlanten
  - `smoke_n4.py`: Atlas-Pfade nennen keine Karte, geprüft wird weiter `data-card`
- Icons: `tools/shrink_icons.py` (nur Pillow, oxipng/pngquant fehlen) wählt die Farbzahl mit PSNR ≥ 37,5 dB, Ziel < 60 KB. `make_icons.py` speichert künftig gleich so.
  - icon-512: 262 → 43 KB, 256 Farben, 37,7 dB
  - maskable: 165 → 60 KB, 64 Farben, 38,5 dB
  - icon-192: 52 → 10 KB
  - apple-touch: 44 → 24 KB
  - Beide 512er habe ich angesehen: kein sichtbares Banding.

**Geprüft:** `atlas.test.mjs` (Raster, Gutter, PSNR, PAM, Manifest gegen Dateien), `cardsprite.test.mjs` (Prozentlage für 30/60/133 px exakt, Regler), `tests/test_shrink_icons.py`. Die Spiel-Tests schnapsen, holdem, blackjack und maumau sind grün.

**Heavy-Job im Browser abnehmen**
1. **Pixelvergleich je Blatt:** `?atlas=0` gegen Standard bei Schnapsen, Mau-Mau, Blackjack und Hold'em, hoch und quer, Pixel 7 (DPR 2,625) und Desktop DPR 1. Am kritischsten sind die fr-Bildkarten J/Q (39,5 dB).
2. Leuchten der ausgewählten Karte: Wird der `drop-shadow` am inneren `<svg>` korrekt gezeichnet und nicht beschnitten? Karten-Flug (flyCard/flyIn) mit innerem `<svg>`.
3. Stich-Blatt, Hold'em-Rangliste und „letzte Hand“: Größe, Seitenverhältnis, runde Ecken (Hintergrund statt Bild).
4. **Speicher:** Ein dekodierter @2x-Atlas ist groß (de-a 33 MB, fr je 42 MB RGBA). Am Blackjack- oder Hold'em-Tisch Speicher und Dekodierzeit messen, auch für den ersten Tisch. Wird es zu viel, die fr-Gruppen in `DECKS.fr.groups` feiner teilen (z. B. 4 Farben). Das ist eine Zeile plus `node tools/build_atlas.mjs`.
5. `update_sw.py` ausführen und `test_sw.py`, `test_live.py`, `smoke_n3.py`, `smoke_n4.py` laufen lassen.
6. Icons beim Installieren ansehen (Android-Splash, maskable).

**Annahmen und Risiken**
- Pro Karte gibt es 2 Elemente statt 1 (`<svg>` + `<image>`).
- Die Lobby-Bildchen (Mini-Bretter) bleiben bewusst Einzeldateien in 1×. Mit Atlas würde die Lobby 377 KB laden statt 3 kleiner Karten.
- **AVIF nicht gemacht:** Dafür bräuchte es `avifenc` als weitere Abhängigkeit und im Browser eine Format-Weiche je Karte.
- **Plan B**, falls Speicher oder Pixel nicht passen: ein „Pack“ je Blatt (Einzel-WebPs bitgleich aneinandergehängt plus Index). Der Service-Worker beantwortet Einzelkarten-Anfragen dann daraus. So bleiben die Pixel identisch und auch der Speicher wie heute, die Anfragen sinken trotzdem. Nicht gebaut.

## E2 – Plastizität (Code fertig, Abstimmung am Bild offen)
**Ausgangslage:** Halma, Dame und Backgammon zeichnen ihre Steine schon über `piece()`/`ball()` als Sprites (Deko-Job). Ich habe nichts gedoppelt, nur verfeinert:
- **Sprites je Größe** (`src/ui/sprites.js`):
  - Kachel-Stufen 48/64/96/128/168/224/288 px nach Gerätepixeln je Brett-Einheit.
  - `tablescreen.js` misst den Maßstab per ResizeObserver am `.board-wrap`, ohne erzwungenes Layout, und misst nach jedem neuen Brett neu.
  - Bis eine neue Größe fertig ist, gilt die vorhandene, kein Vektor-Flackern.
  - Halma am Handy bekommt damit ~64 px statt 168, Dame am Desktop 224 statt hochskalierter 168.
  - **`?sprites=0`** zeichnet Vektor-Steine.
- **Licht-Ebene** (`tools/bake_material.py`, Pillow + numpy):
  - Licht links oben, elliptische Vignette und Mikro-Normalen (weichgezeichnetes Rauschen in 2 Oktaven, nahtlos) in **einer** Graustufen-WebP `assets/wood/light-overlay.webp` (512², 5 KB).
  - Sie liegt per `mix-blend-mode: soft-light` als Muster `dk-matlight` statt `dk-vig`/`dk-feltvig` auf: `inset` (Backgammon, Ludo, Mühle, Paare), `lacquer` (Dame, Schach), `feltRect`/`feltEllipse` (Kartenspiele, Reversi) und dem Halma-Kreis.
  - Alles in der statischen Deko-Ebene, wird also einmal gerastert.
- **Fase:** `woodFrame` bekommt eine 1,5-px-Lichtkante (`dk-chamfer`, oben links hell, unten rechts dunkel), ergänzend zum vorhandenen `dk-bevel`.
- **Regler `?material=0|1`, Standard AUS** (`MATERIAL_DEFAULT = false` in `src/ui/material.js`), weil ich es nicht sehen konnte.

**Geprüft:** `sprites.test.mjs` (Stufenwahl, Grenzen), `material.test.mjs` (Regler), `tests/test_bake_material.py` (Lichtrichtung, Vignette, nahtlos, deterministisch, Dateigröße). Die Spiel-Tests dame, halma und backgammon sind grün. Die Licht-Ebene habe ich als Datei angesehen.

**Heavy-Job im Browser abnehmen**
1. A/B-Collage `?material=0` gegen `?material=1` für Dame, Backgammon, Halma, Schnapsen-Filz und Hold'em, hoch und quer.
   - Stärken abstimmen in `STRENGTH` (light 26, vignette 34, micro 7) und Deckkraft. Danach `python3 tools/bake_material.py` (0,5 s).
   - Mittelwert der Ebene ist 114,7: Sie dunkelt insgesamt leicht ab. Eventuell `vignette` senken oder den Mittelwert auf ~124 anheben.
   - Nur wenn es besser aussieht: `MATERIAL_DEFAULT = true`.
2. Fase an der Rahmenkante: Breite und Stärke prüfen.
3. Sprites je Größe:
   - Schärfe von Halma (kleine Kacheln) und Dame am Desktop gegen vorher (`?sprites=0` zeigt nur Vektor, vorher = main).
   - Beim Drehen hoch↔quer kurz die alte Größe, das ist erwartet.
   - Hüpfen mit scale 1,16–1,22 skaliert die Kachel leicht hoch. Falls sichtbar weich: in `tileFor` 1,2 Reserve einrechnen.

## E3 – Nur Compositor (Code fertig)
**Fertig (`css/style.css`, `src/ui/svg.js`, `sieg.js`, `tablescreen.js`, `trainer/ui.js`, `vier/view.js`, `schiffe/view.js`)**
- Puls-Knopf (Lobby „Spielen“): Ring als `::after` mit transform/opacity statt `box-shadow`-Animation, die in jedem Frame neu gemalt hat. Läuft weiter endlos wie vorher, jetzt aber auf dem Compositor.
- `take` (Hinweis-Ringe Mühle/Dame, Vier-Gewinnreihe, Schach-Hinweisfeld) und `he-pulse` (Hold'em-Zug) pulsen über **opacity** statt `stroke-width`/`stroke-opacity`.
  - Sichtbar anders: Der Ring wird nicht mehr dünner, nur blasser.
  - Bei `mark-sq.hint` und `he-turn` pulsiert die Füllung mit.
- Würfelglück-Aufblitzen (`wg-cat.just`): Überlagerung `::after` (opacity) unter Text und Wert statt Hintergrund-Animation.
- Schalter-Knopf per `translateX` statt `left`. Bewertungsbalken per `scaleY` statt `height`; JS in `tablescreen.js` und `trainer/ui.js` angepasst.
- Vier gewinnt, Gewinnreihe: Das Leuchten waren `drop-shadow` am animierten Ring, jetzt zwei breite, blasse Ringe (`v4-win-glow`) ohne Filter.
- Schiffe, Schuss-Ring: wächst per `scale` statt über `r`. Der Spritzer-Strich wird dadurch anfangs dünner.
- `will-change`: nicht mehr dauerhaft auf `.board .pc` und `.board-cards .card`.
  - `svg.js trackWillChange()` setzt es nur während der Animation und gibt es nach finish/cancel der letzten Animation frei.
  - Eingebaut in `animatePath`, `animateSteps`, `flyCard`, `flyIn`, `animateDrop`, `fadeOut` und `hopWave`.
  - Die direkten `.animate()`-Aufrufe in einzelnen Views (Würfel, Paare-Umdrehen, Reversi-Kippen) habe ich nicht umgehängt. Sie laufen schon auf transform/opacity, und `will-change` auf SVG-Kindern ist ohnehin nur ein Hinweis.
- Eingrenzung:
  - `.games > .game`: `contain: layout paint style` + `content-visibility: auto` + `contain-intrinsic-size: auto 172px`
  - `.tside`: `contain: layout style` (ohne paint, damit nichts beschnitten wird)
  - `.pbar`: `contain: layout paint style`

**Geprüft:** `compositor.test.mjs`
- Alle `@keyframes` in `style.css` ändern nur transform/opacity. Das ist mit allen 11 Keyframes geprüft, und der Test schlägt bei `stroke-width` fehl.
- Alle `element.animate([…])`-Literale in svg/sieg/fxsvg und allen Views nutzen nur transform/opacity.
- `will-change` wird nach finish und cancel freigegeben.
- Die Spiel-Tests vier, schiffe und schiffe_boats sind grün.

**Heavy-Job im Browser abnehmen**
1. CDP-Trace vorher/nachher (`--trace`): Layout-Ereignisse während Konfetti und Lobby, Liste `not_composited` leer?
2. Ansehen:
   - Puls-Ring am Lobby-Knopf
   - Hinweis-Ringe (opacity statt Strichstärke)
   - Vier-Gewinnreihe: Glow gegen alten `drop-shadow`, Breiten in `.v4-win-glow.g0/.g1` abstimmen
   - Schiffe-Spritzer
   - Würfelglück-Aufblitzen
   - Schalter in den Einstellungen
   - Bewertungsbalken Schach und Trainer (Richtung unten → oben stimmt?)
3. Lobby mit `content-visibility`: Springt der Scrollbalken? Kachel-Einblendung beim ersten Öffnen und ganzseitige Screenshots in `deko_rundgang.py` prüfen.
   - Kacheln sind derzeit ≈ 150–180 px hoch; der Schätzwert ist 172 px.
   - Bei Problemen nur `content-visibility` entfernen, `contain` behalten.
4. `.pbar` mit `contain: paint`: Aktiv-Rahmen, Namen mit Ellipsis und Spieler-Chips in quer (`side-players`) nicht beschnitten?

## Nicht gemacht (und warum)
- **Alles mit Browser:** Vorher- und Nachher-Messung, Screenshots und Collagen, Pixelvergleich, Live-Check, Endbericht `TECHNIK_BERICHT.md`, Versionsnummer, `update_sw.py` und Cache-Busting. Das ist laut Vorbau-Split Sache des Heavy-Jobs.
- **AVIF:** siehe E1.
- Material-Ebene für Ludo-Zonen und Schiffe-Wasser: Diese haben eigene `dk-vig`-Flächen und sind nicht umgestellt; Schwerpunkt waren die großen Bretter.
- `content-visibility` für Seitenleisten: bewusst nicht, weil sie immer sichtbar sind; dort nur `contain`.

## Kurz: Was der Heavy-Job in welcher Reihenfolge tun sollte
1. Auf **main** die Vorher-Messung mit dem Skript vom Branch (Befehl oben).
2. Branch nach main holen (`git merge --ff-only origin/vorbau/spielebox-n9-technik` geht, solange main nicht weitergezogen ist), dann `node tools/build_atlas.mjs --check` und `python3 tools/update_sw.py`.
3. Browser-Abnahme nach den Listen oben. `?material=1` per A/B-Collage entscheiden.
4. Nachher-Messung, Bericht, Version, Push, Live-Check.

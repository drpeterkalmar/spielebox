# Spielebox – Code-Gutachten (Fable 5.1 max, 2026-10-05)

Stand: `main` @ fa6aa1a (Live-Screenshots nach n5), 40 Commits, kein offener Arbeitsstand.
Gelesen: alle Kernmodule (`src/app.js`, `src/store.js`, `src/net/*`, `src/ui/*`, `src/botclient.js`, `src/botworker.js`,
`src/tempo.js`, `src/events.js`, `src/evalpos.js`, `src/games/registry.js`), Hold'em-, Ludo- und Backgammon-Engine, Trainer-
Einstieg, `sw.js` + `tools/update_sw.py`, `index.html`, Manifest, CSS-Viewport, `tests/node/run_all.mjs`, `table.test.mjs`,
README, ENGINE_API. Ausgeführt (nur Node, kein Browser – Leicht-Spur): 19 Dateien der Schnell-Suite (alle grün) und ein
eigenes Belege-Skript `tests/out/audit_repro.mjs` (nicht eingecheckt, `tests/out` ist ignoriert).

## Kurzurteil

1. Der Code ist in gutem Zustand: reine Engines ohne DOM, Tisch-Protokoll ohne Netz testbar, 28 Test-Dateien mit rund 450
   Einzelprüfungen plus Zufalls-Schwärme, saubere Aufräum-Pfade in allen 15 Ansichten, konsequente deutsche Doku.
2. Das größte Risiko sitzt im Tisch-Protokoll (`src/net/table.js`): Die **Host-Übernahme** ist nur für Mühle gedacht und
   getestet. Bei Würfelspielen stürzt der neue Host beim ersten Würfeln ab (TypeError, nachgestellt), und zwei Mitspieler
   übernehmen gleichzeitig (Split-Brain, nachgestellt).
3. Zweites Risiko: Der Tisch-Zustand wächst mit dem Fair-Play-Protokoll unbegrenzt (Ludo zu viert ~165 KB am Partieende)
   und wird bei jedem Zug komplett an jeden Mitspieler geschickt – über den Relay-Fallback sehr wahrscheinlich ab ~64 KB
   nicht mehr zustellbar.
4. Drittes Risiko: Nach einem Service-Worker-Update laufen alte Seite und neue Dateien gemischt (Bot-Worker, Trainer werden
   erst später geladen) – nicht nachgestellt (Browser nötig), aber im Code eindeutig.
5. Wartbarkeit: drei Dateien tragen zu viel (`table.js` 912, `trainer/ui.js` 842, `tablescreen.js` 689 Zeilen), Spielwissen
   ist in `ui/gameui.js` (670) und `ui/lobby.js` dupliziert, alle Spiele laden beim Start (~1 MB JS, ~90 Module).
   Befunde: **5 × P1, 16 × P2, 12 × P3.**

## Steckbrief

| Bereich | Umfang | Anmerkung |
|---|---|---|
| App-JS (`src/`) | 1,01 MB, 22 000 Zeilen, 94 Module | davon 67 KB Trainer-Daten; alles ohne Bundler |
| Bibliotheken (`lib/`) | trystero 62 KB, chess.js 37 KB | einmalig gebündelt |
| Precache (Service-Worker) | 202 Dateien, 4,55 MB | davon 4,0 MB Spielkarten (@2x) |
| Tests Node | 28 Dateien Schnell-Suite + 15 Schwärme | 19 Dateien in 126 s grün, Rest abgebrochen (Zeitregel der Leicht-Spur) |
| Tests Browser | 13 Python/Playwright-Skripte | nicht ausgeführt (Leicht-Spur) |
| CI | keine | `sw.js`-Hash wird von Hand gepflegt |
| Deploy | GitHub Pages aus `main` | Version = Inhalts-Hash in `sw.js` und `src/build.js`; aktuell stimmig (nachgerechnet) |

Architektur-Kette: `index.html` → `src/app.js` (Routing über `#`, Debug-API) → `net/table.js` (`TableSession`, Host als
Schiedsrichter) → `net/netlink.js` (Trystero direkt / `relaychannel.js` über Nostr, `crypto.js`) → `ui/tablescreen.js`
(Anzeige-Warteschlange) → `ui/gameui.js` (je Spiel: Brett, Leisten, Knöpfe) → `games/<id>/{engine,view,bot}.js`.
Bots und „Wer gewinnt?“ laufen in einem Web-Worker (`botclient.js`/`botworker.js`). Zufall online über Hash-Ketten
(`net/fair.js`).

## Befunde P1 – drohende Bugs

### P1-1 Host-Übernahme bei Würfelspielen: TypeError, Tisch tot
- **Wo:** `src/net/table.js:879-889` (`_takeOver` legt kein `fairPriv` an), `:387` (`_linkOf` liest `t.fairPriv.pending`),
  `:474` (`_takeReveal` liest `t.fairPriv.last`), `:423` (Schreibzugriff `t.fairPriv.last`). `fairPriv` wird in
  `tableFor` (`:71`) absichtlich nie verschickt – ein Client, der Host wird, hat es also nie.
- **Beleg (nachgestellt, Backgammon, Gast + Zuschauer, Host trennt):** Gast übernimmt (epoch 2), beide ziehen weiter; beim
  ersten Würfeln: `submitMove` wirft synchron `TypeError: Cannot read properties of undefined (reading 'pending')`
  (`_linkOf`); kommt der Wurf vom zurückgekehrten alten Host, kracht es in `_hostOnMove` → `_takeReveal`
  (`reading 'last'`) – im Browser eine unbehandelte Ausnahme im Nachrichten-Callback, der Zug bleibt „pending“, jeder
  Wiederhol-Versuch (5 s) kracht erneut. Nach dem synchronen Fehler ist `t.gs` schon in Phase `rolling`, aber nicht
  committet: Anzeige hängt, jeder weitere Tipp „nicht am Zug“.
- **Mit-Ursache:** Die Übernahme-Bedingung (`:866`) schließt nur `HIDDEN`-Spiele aus, nicht Spiele mit `chance`.
  Außerdem passen die Commits der Computer-Sitze (vom alten Host mit dessen pid gebildet, `_seed` `:362-367`) nicht
  mehr zum neuen Host → selbst ohne Absturz schlüge die Fair-Prüfung fehl.
- **Vorschlag:** Übernahme = neue Zufallsrunde: in `_takeOver` `t.fair = null; t.fairPriv = null; t.fairNeed = null;
  this._ensureFair();` (Mitspieler schicken ihre Commits ohnehin neu, `_clientFair` `:502`). Zusätzlich jede Stelle, die
  `t.fairPriv` liest, über einen Helfer `_priv()` führen, der die Struktur bei Bedarf anlegt. `_needSince` in
  `_takeOver` setzen (siehe P2-16). Test in `table.test.mjs`: „Host weg bei Backgammon → Gast übernimmt → zwei Würfe →
  `fairCheck.ok` bei allen“.
- **Aufwand:** S. **Risiko:** gering (nur Übernahme-Pfad).

### P1-2 Zwei Mitspieler übernehmen gleichzeitig (Split-Brain)
- **Wo:** `src/net/table.js:864-868` (jeder sitzende Client übernimmt nach `hostGone`, alle im selben Sekundentakt),
  `:716-724` (ein Host gibt nur nach, wenn der andere Stand **neuer** ist; gleiche `(epoch, seq)` → beide bleiben Host).
- **Beleg (nachgestellt, Halma zu dritt, Host trennt):** nach 600 ms: G1 host epoch 2 seq 3, G2 host epoch 2 seq 3,
  jeder hält sich selbst für `hostPid`. Mit Computer-Sitz lassen beide Hosts den Computer ziehen; bei Würfelspielen
  würfeln beide Hosts verschieden (Computer-Glieder hängen an der Host-pid). Jeder ignoriert den anderen Stand dauerhaft
  (`newer <= 0`, `:646`).
- **Vorschlag:** (a) Gestaffelte Übernahme: Wartezeit `hostGone + Sitzindex × 5 s` (nur der erste freie Sitz springt
  sofort); (b) deterministischer Gleichstand-Entscheid in `_onMessage 'state'`: bei `newer === 0` gibt der Host mit der
  lexikographisch größeren pid nach. Test: Szenario oben → nach 2 s genau ein Host, beide Tische gleich.
- **Aufwand:** S. **Risiko:** gering.

### P1-3 Nach einem Service-Worker-Update laufen alte Seite und neue Module gemischt
- **Wo:** `index.html:28-35` (neu laden nur, wenn man beim `controllerchange` gerade in der Lobby steht), `sw.js:209-214`
  (`skipWaiting` + `clients.claim()` sofort), `src/botclient.js:29` (Worker wird erst beim ersten Computer-Zug erzeugt),
  `src/app.js:178` (Trainer per `import()` erst beim Öffnen). Alles, was die alte Seite **später** nachlädt, kommt aus dem
  **neuen** Cache (`sw.js:224`).
- **Beleg:** Code-Lesung (Browser-Nachstellung in dieser Spur nicht erlaubt; als offener Punkt unten). Szenario: Spieler A
  sitzt beim Update am Tisch; danach „Neue Partie gegen Computer“ → `botworker.js` + alle Bot-/Engine-Module in der neuen
  Version, Hauptthread in der alten. Bei geänderter Zug- oder Zustandsform liefert der Worker Züge, die `isLegal` ablehnt →
  `_applyMove` scheitert still (`table.js:584`), der Computer zieht nie wieder („Der Computer denkt nach …“).
- **Vorschlag:** (1) In `index.html` bei `controllerchange` nur ein Flag `window.__updateReady = true` setzen; `app.js`
  lädt beim nächsten Lobby-Aufruf (`showLobby`) neu, wenn das Flag steht. (2) Worker beim App-Start anlegen (ein
  `getWorker()` in `app.js` nach `ensureDefs()`), damit er zur Version der Seite gehört. (3) Optional: `BUILD` als
  Query an `import()`/Worker-URL hängen und im SW `ignoreSearch` für diese Pfade abschalten.
- **Aufwand:** S. **Risiko:** gering. **Offen:** Browser-Test mit zwei nacheinander deployten Versionen.

### P1-4 Tisch-Zustand wächst unbegrenzt und geht bei jedem Zug komplett an jeden
- **Wo:** `src/net/table.js:535-546` (`_broadcastState` sendet die ganze Tabelle, bei verdeckten Spielen je Empfänger
  einzeln), `:429-436` und `:443-451` (`fair.log` wächst je Wurf/Mischung), `src/store.js:66-84` (jede Änderung schreibt
  die ganze Tabelle synchron in `localStorage`), `src/net/relaychannel.js:366-377` (abgelehnte Events werden nur gezählt).
- **Beleg (gemessen):** Hold'em 8 Sitze: 733 B je Hand → 72 KB nach 100 Händen, 429 KB bei `MAX_HANDS` 600. Ludo 4 Sitze:
  317 B je Wurf; eine Partie braucht median 526, max 902 Würfe (60 Bot-Partien) → Stand am Ende ~165–290 KB, je Wurf ×3
  Empfänger. Trystero stückelt direkt (64 KB-Blöcke), aber öffentliche Nostr-Relays begrenzen Events üblicherweise auf
  64–128 KB (`tests/relay_live.mjs` hat nur bis 6 000 Zeichen gemessen). Über Relay hören Mitspieler dann mitten in der
  Partie auf, Stände zu bekommen; die Anzeige meldet weiter „über Relay“.
- **Vorschlag:** `fair.log` aus dem Normal-Stand nehmen: Stand trägt `fair: { round, commits, k, n }`; neue Einträge gehen
  als `fairDelta` (nur die seit `n` dazugekommenen) mit; ein Client mit Lücke fordert per `{t:'fairlog', from}` nach.
  Prüfung bleibt inkrementell (Würfel) bzw. am Ende (Mischung). Dazu `store.saveTable` entprellen (P2-6).
  Vorher mit `node tests/relay_live.mjs` die tatsächliche Grenze der sechs Relays bei 32/64/128 KB messen.
- **Aufwand:** M. **Risiko:** mittel (Protokolländerung → zusammen mit P2-3 Versionsfeld). Test: FakeLink, der
  Nachrichten > 64 KB verwirft; Ludo zu viert 600 Würfe → alle Clients bleiben synchron.

### P1-5 Zufalls-Kette hat 1 024 Glieder je Runde – bei Ludo zu viert erreichbar, dann Absturz im Zug
- **Wo:** `src/net/fair.js:66` (`CHAIN = 1024`), `src/net/table.js:404` (`throw new Error('Zufalls-Kette aufgebraucht')`
  mitten in `_applyMove`, nachdem `t.gs` schon ersetzt ist).
- **Beleg:** Messung oben (Bots Stufe 2: max 902 Würfe in 60 Partien; Menschen spielen langsamer und schlechter, die
  Grenze liegt im oberen Schwanz der Verteilung). Trifft es, gibt es keinen Commit, der Tisch hängt wie bei P1-1.
- **Vorschlag:** Nie werfen: bei `k > CHAIN` Host-Zufall mit `fallback: true` (wird als „ungeprüft“ gezeigt) **und**
  `CHAIN` auf 4 096 (Kosten: `chainLink` = `CHAIN − k` Hashes ≈ 3–4 ms je Aufruf auf einem Handy, unkritisch;
  `_clientFair` ruft es nur, solange der Commit fehlt).
- **Aufwand:** S. **Risiko:** gering. Test: `fair.test.mjs` mit kleinem `CHAIN` → Ereignis `CHAIN+1` ist `fallback`.

## Befunde P2 – Wartbarkeit und Robustheit

### P2-1 Aufgeben zu dritt+ bei Zufallsspielen: Fair-Prüfung schlägt bei allen fehl
- **Wo:** `src/net/table.js:278-287` (Computer übernimmt den Sitz), `:382-389` (`_linkOf` bildet für den Sitz nun die
  Computer-Kette, der Commit stammt aber vom Menschen).
- **Beleg (nachgestellt, Ludo zu dritt):** nach dem Aufgeben bei Host und Client `fairCheck.ok = false`,
  „Ereignis 6: Kette von Sitz 2 passt nicht zum Commit“ → Abzeichen „⚠ Prüfung fehlgeschlagen“ für den Rest der Partie.
- **Vorschlag:** Sitzwechsel = neue Zufallsrunde (derselbe Helfer wie P1-1: `_restartFair()`); Anzeige zählt
  „geprüft“ über Runden hinweg weiter. **Aufwand:** S. **Risiko:** gering. Test: Szenario → `ok: true`.

### P2-2 Unbestätigter Zug verschwindet still, wenn der Host zwischendurch etwas anderes committet
- **Wo:** `src/net/table.js:649` (jeder neuere Stand löscht `pendingMove`), `:621-625` (Host schickt bei veraltetem `seq`
  nur den Stand, kein `nack`).
- **Beleg:** Ablauf: Client sendet Zug bei seq N; Host committet seq N+1 (z. B. Commit/Glied eines dritten Spielers,
  `_hostOnFair` `:466`, oder Sitzwechsel); Zug kommt mit seq N an → ignoriert; Client bekommt N+1 → Vorschau zurück,
  Zug weg, keine Wiederholung, keine Meldung. Wahrscheinlich zu Rundenbeginn bei 3+ Spielern.
- **Vorschlag:** Host antwortet `{t:'nack', id, reason:'veraltet'}`; Client prüft den Zug auf dem neuen Stand und sendet
  ihn **einmal** automatisch neu; `pendingMove` wird nur durch `nack` oder durch einen Stand gelöscht, dessen `last` die
  eigene Zug-`id` trägt (`last.id`). **Aufwand:** S–M. **Risiko:** gering. Test: FakeLink mit gleichzeitigem Host-Commit.

### P2-3 Keine Versionskennung im Protokoll
- **Wo:** `src/net/table.js:770-776` (`hello` ohne Build), `:639-642` (`state` wird angenommen, sobald `v === 1`);
  unbekanntes `game` → `gameOf` wirft (`registry.js:259`) im `engine`-Getter.
- **Beleg:** Nach einem Update (P1-3) oder bei einem Mitspieler mit altem Cache gibt es keine Erklärung; ein neues Spiel-ID
  im Stand lässt die alte Seite in `tablescreen.draw` krachen.
- **Vorschlag:** `hello`/`state` tragen `build: BUILD`; bei Abweichung Toast „Mitspieler hat eine andere Version – bitte
  beide neu laden“; `_clientOnState` lehnt Stände mit unbekanntem Spiel ab (Toast statt Ausnahme).
  **Aufwand:** S. **Risiko:** gering.

### P2-4 Bot-Worker ohne Zeitlimit
- **Wo:** `src/botclient.js:44-53`, `src/net/table.js:569-591` (`botBusy` bleibt gesetzt, bis das Promise antwortet).
- **Beleg:** Hängt ein Bot (Endlosschleife, Worker tot ohne `onerror`), bleibt es für immer bei „Der Computer denkt nach …“.
- **Vorschlag:** Zeitlimit 10 s in `chooseBotMove`: danach `worker.terminate()`, neuer Worker, Zug per `quickMove` im
  Hauptthread. **Aufwand:** S. **Risiko:** gering. Test: Bot-Promise, das nie auflöst → Zug nach Zeitlimit.

### P2-5 „Wer gewinnt?“ konkurriert im selben Worker mit dem Computer-Zug
- **Wo:** `src/ui/tablescreen.js:579-591` (jede Stand-Änderung = neue Bewertung), `src/evalpos.js:42` (Hold'em: 4 000
  Monte-Carlo-Durchgänge), `src/botclient.js:61-69` (gleiche Warteschlange wie die Züge).
- **Beleg:** Hold'em-Bewertung ≈ 100–300 ms am Handy je Zug; bei mehreren Computer-Spielern stapeln sich veraltete
  Bewertungen vor dem nächsten Computer-Zug (Ergebnis wird verworfen, gerechnet wird trotzdem). Messung am iPhone offen.
- **Vorschlag:** Höchstens eine Bewertung in Arbeit, die neueste wartet (Koaleszenz); Hold'em am Handy 1 500 Durchgänge;
  optional zweiter Worker für Bewertungen. **Aufwand:** S. **Risiko:** gering.

### P2-6 `localStorage` bei jedem Stand synchron, inklusive Tisch-Liste
- **Wo:** `src/store.js:66-84` (zwei Schreibvorgänge je Aufruf), Aufrufer `table.js:524, 653`.
- **Beleg:** Bei großen Ständen (P1-4) mehrere hundert KB `JSON.stringify` + Schreiben im Hauptthread je Wurf, parallel zur
  Animation; 12 Tische × 300 KB überschreiten das 5-MB-Kontingent, `set` schluckt den Fehler still (`:18`) → Wiederaufnahme
  mit altem Stand.
- **Vorschlag:** `saveTable` entprellen (250 ms, Flush bei `pagehide`/`visibilitychange`), Liste nur bei Änderung von
  Sitzen/Status schreiben, älteste Tische bei Quota-Fehler verwerfen und melden. **Aufwand:** S. **Risiko:** gering.

### P2-7 Precache lädt 4,55 MB bei jedem Update neu; eine fehlende Datei kippt die ganze Installation
- **Wo:** `sw.js:209-211` (`addAll` mit `cache: 'reload'` für alle 202 Dateien), `tools/update_sw.py:9-20`.
- **Beleg:** Der Inhalts-Hash ändert sich bei jeder Code-Änderung → der neue Cache wird komplett neu gefüllt, auch die
  4,0 MB Karten, die sich nie ändern. Schlägt ein einziger Abruf fehl (Mobilfunk), bleibt die alte Version still aktiv.
- **Vorschlag:** Zwei Caches: `spielebox-core-<hash>` (HTML/CSS/JS/Icons, ~1,3 MB, `addAll`) und `spielebox-assets`
  (Karten/Holz/Figuren, versionslos, beim Aktivieren **nicht** gelöscht, cache-first mit Nachladen). `addAll` in Gruppen
  mit Einzel-Wiederholung. **Aufwand:** M. **Risiko:** mittel (Offline-Garantie für Karten prüfen).

### P2-8 Navigation nicht serialisiert, keine Fehlerbehandlung im Routing
- **Wo:** `src/app.js:46-53` (`leaveTable` wartet auf `link.close()`), `:81-100`, `:121-128`, `:208-232`; `grep catch`
  in `app.js`: 0 Treffer.
- **Beleg:** Zwei schnelle Taps (Weiterspielen → Zurück → Weiterspielen) oder ein `hashchange` während `openOnline`
  erzeugen zwei Sessions; `cur` zeigt nur auf die letzte, die erste behält Intervall-Timer und offenen WebRTC-Raum.
  Fehler in `openOnline` (z. B. `crypto.subtle` fehlt bei http) landen nur in `window.__errors`.
- **Vorschlag:** Navigations-Warteschlange (`nav = nav.then(fn).catch(report)`), ein `try/catch` mit Toast in `route()`.
  **Aufwand:** S. **Risiko:** gering.

### P2-9 Uhrenversatz > 5 Minuten trennt Mitspieler still
- **Wo:** `src/net/netlink.js:173` (`Date.now() - env.ts > 5 min` → Nachricht weg).
- **Beleg:** Ein Gerät mit falsch gestellter Uhr (Desktop ohne NTP) sieht alle Nachrichten der Gegenseite als „uralt“;
  es gibt keinen Hinweis, nur „wartet“.
- **Vorschlag:** Versatz je Gegenstelle aus der ersten `_hi`-Nachricht schätzen und relativ prüfen; Relay-Rückblick ist
  ohnehin über `since` begrenzt (`relaychannel.js:190-197`). Im Verbindungs-Blatt zählen und anzeigen.
  **Aufwand:** S. **Risiko:** gering.

### P2-10 Automatischer Zug nach 3 s „nicht erreichbar“ (Hold'em)
- **Wo:** `src/net/table.js:29-30` (`awayMove: 3000`), `:808-827`; `netlink.js:84-93, 237-243` (`weg`, sobald die
  Direktverbindung fällt und noch nie Relay gesehen wurde).
- **Beleg:** App-Wechsel oder Bildschirmsperre am iPhone beendet die WebRTC-Verbindung binnen Sekunden → der Platz wird
  nach 3 s gefoldet, obwohl der Spieler gleich zurück ist. Gewollt laut README, aber die Spanne ist kürzer als ein
  normaler Wiederaufbau (`relayAfter` 12 s).
- **Vorschlag:** `awayMove` ≥ 10 s **und** nur, wenn die Gegenstelle seit so lange tatsächlich stumm ist (`present.lastSeen`),
  nicht nur momentan ohne Direktweg. Entscheidung Peter. **Aufwand:** S. **Risiko:** gering.

### P2-11 `table.js` (912 Zeilen) vereint fünf Zuständigkeiten und kennt Engine-Phasen
- **Wo:** `src/net/table.js` gesamt; Engine-Wissen `:429-436` (`ph === 'deal' || ph === 'bet'`), ebenso
  `tablescreen.js:125` (`'spielende'`).
- **Beleg:** Host-Logik, Client-Logik, Fair-Play-Protokoll, Zeitlimit und Übernahme teilen sich Felder (`_isOptimistic`,
  `_confirmed`, `fairPriv`, `_needSince`); P1-1/P1-2/P2-1/P2-16 sind Folgen dieser Verflechtung.
- **Vorschlag:** Herauslösen von `net/fairhost.js` (Commits/Glieder/Log als reines Modul mit eigenem Zustand und Tests)
  und `net/takeover.js`; Engines liefern `secretPhases`/`publishChanceAfter(state)` statt hart kodierter Phasen.
  Erst nach den Tests aus P1-1/P1-2. **Aufwand:** L. **Risiko:** mittel.

### P2-12 Doppeltes Spielwissen außerhalb der Spiele
- **Wo:** `src/botclient.js:20-21` = `src/botworker.js:20-21` (`BOTS`, `TIME`); `src/ui/lobby.js:9-29` (`RULES`) =
  `UI.<id>.rules` in `src/ui/gameui.js`; `gameui.js` (670 Zeilen) und `lobby.js:34-127` (`miniBoard`, 15 Zweige) kennen
  jedes Spiel; `tablescreen.js:131-146` und `:156-159` (gleicher `onMove`-Code zweimal).
- **Vorschlag:** `src/games/<id>/ui.js` (Symbol, Unterzeile, Knöpfe, Regeln, Mini-Brett) und Eintrag `ui` in der
  Registry; eine gemeinsame `src/games/bots.js`-Liste für Hauptthread und Worker. Reine Verschiebungen.
  **Aufwand:** M. **Risiko:** gering.

### P2-13 Alle 15 Spiele laden beim Start (Engine + Bot + Ansicht)
- **Wo:** `src/games/registry.js:3-17`, `src/botclient.js:2-16`, `src/ui/gameui.js:5-44`; nur der Trainer ist lazy
  (`app.js:178`).
- **Beleg:** ~1 MB JS / ~90 Module werden bei jedem Kaltstart geparst, auch für „Mühle zu zweit“. Startzeit am iPhone nicht
  gemessen (offen).
- **Vorschlag:** Registry mit `load(id)` (Engine klein und eager, `view`/`bot`/`ui` per `import()`); Worker lädt nur den
  angeforderten Bot. Nach P2-12. **Aufwand:** M. **Risiko:** mittel (`quickMove`, `evaluateBoard`, Tests anpassen).

### P2-14 Keine CI, Schnell-Suite nicht schnell, `sw.js` von Hand
- **Wo:** kein `.github/`; `tests/node/run_all.mjs:9`; `tools/update_sw.py` ohne Prüfmodus.
- **Beleg:** `npm test -- --schnell` > 2 min (`vier.test.mjs` 47,6 s, `table.test.mjs` 24,8 s, `wuerfel.test.mjs`
  20,7 s, `maumau` 10,9 s); 3 von 40 Commits änderten App-Dateien ohne `sw.js` (eine WIP, eine Hold'em-Evaluator-Stufe).
- **Vorschlag:** GitHub-Actions-Workflow (`npm test -- --schnell` + `python3 tools/update_sw.py --check`, der nur
  vergleicht); Stufe `--smoke` (< 20 s: words, crypto, fair, tempo, toastqueue, table ohne Langläufer).
  **Aufwand:** S. **Risiko:** keines.

### P2-15 Testlücken an kritischen Stellen
- `src/net/netlink.js` (288 Zeilen: Peer-Buchführung, Dedupe, Sitzungswechsel, Relay-Zuschaltung) hat **keinen** Node-Test
  (`grep netlink tests/` leer); Übernahme nur mit Mühle (`table.test.mjs:230-252`); kein Test für Aufgeben→Computer bei
  Zufallsspielen, für gleichzeitige Übernahme, für veraltete `seq`, für Nachrichtengröße, für `_needSince`.
- **Vorschlag:** `netlink.test.mjs` mit Trystero-Attrappe (`joinRoom` injizierbar machen); die vier Szenarien aus
  `tests/out/audit_repro.mjs` als feste Tests. **Aufwand:** M. **Risiko:** keines.

### P2-16 `_needSince` nach Host-Neuladen oder Übernahme nie gesetzt → Fallback-Zufall kommt nie
- **Wo:** `src/net/table.js:411-412` (nur beim Anlegen von `fairNeed`), `:842` (`now - (this._needSince || now)` = 0).
- **Beleg (nachgestellt, erster Lauf):** Übernahme, während ein Wurf aussteht → der neue Host blieb dauerhaft in Phase
  `opening` („Es wird gewürfelt …“), kein Fallback nach `fairWait`.
- **Vorschlag:** in `_tick` `this._needSince ||= now`, sobald `t.fairNeed` steht. **Aufwand:** S. **Risiko:** keines.

## Befunde P3 – Kosmetik

- **P3-1** `bye` wird beim Schließen gesendet (`netlink.js:282`), aber nirgends ausgewertet (`table.js:704-752` kennt es
  nicht) → entweder auswerten (Gegenstelle sofort `weg`) oder streichen.
- **P3-2** Toter Schalter `?alle`: `LIVE` enthält alle Spiele (`registry.js:249`, `lobby.js:10`, `app.js:162`).
- **P3-3** `noteTimers` wächst unbegrenzt (`tablescreen.js:461-467`), abgelaufene Timer werden nie entfernt.
- **P3-4** `lobby.js:11-29`: `import` zwischen Anweisungen (funktioniert durch Hoisting, liest sich falsch).
- **P3-5** `index.html:5, 25-26`: `user-scalable=no` plus Gesten-Blockade → Zoom für Sehbehinderte aus; `touch-action` im
  CSS reicht gegen Doppeltipp-Zoom.
- **P3-6** `manifest.webmanifest:4` nennt nur „Mühle und Dame“.
- **P3-7** `table.js:25` liest `location.search` im Netz-Modul; doppelt mit `tempo.js:51-53` (`botms`).
- **P3-8** `docs/ENGINE_API.md` ist veraltet (kennt `publicMove`, `ACTS`/`applyAct`, `timeoutMove`, `phase`,
  `chance.n`, `winPoints`, `soloLast` nicht).
- **P3-9** `store.settings()` wird in heißen Pfaden gelesen (`tablescreen.js:127, 575-577`) – JSON-Parse je Zeichnung.
- **P3-10** Sechs Berichte (`NACHT1…N6_BERICHT.md`) liegen im Wurzelordner → `docs/berichte/`.
- **P3-11** `tests/out/*.log`, `relay_live.json` liegen (ignoriert) im Repo-Ordner; `tests/check_flip.py`,
  `test_ludo_dice_anim.py` fehlen in der README-Liste.
- **P3-12** `registry.js:194`: `x.players === 1 ? 'Spieler' : 'Spieler'` – beide Zweige gleich.

## Offene Punkte (brauchen Browser oder Netz, in dieser Spur nicht ausgeführt)

1. P1-3 nachstellen: zwei Versionen nacheinander deployen, Spieler bleibt am Tisch, danach Computer-Partie starten.
2. Relay-Grenze messen: `node tests/relay_live.mjs` mit 32/64/128 KB-Nachrichten gegen die sechs Relays (P1-4).
3. iPhone-Kaltstart (Lighthouse/Safari-Timeline) vor/nach P2-13; Hold'em-Bewertungsdauer im Worker (P2-5).
4. Playwright-Suiten (`smoke*.py`, `e2e*.py`) einmal komplett laufen lassen – die Node-Suite ist grün, die Browser-Suiten
   wurden hier nicht angefasst.

## Umbauplan – Reihenfolge in kleinen, einzeln testbaren Schritten

Jeder Schritt: Test zuerst (rot), Änderung, `npm test -- --schnell` grün, `python3 tools/update_sw.py`, Commit, Push.
Kein neues Verhalten außer Bugfixes.

1. **Tests für die Netz-Szenarien** (`tests/node/table.test.mjs`): Übernahme bei Backgammon; zwei Übernehmer;
   Aufgeben→Computer bei Ludo zu dritt; veraltetes `seq`; Übernahme mit ausstehendem Wurf. Erwartung: fünf rote Tests.
2. **Fair-Runde neu starten** (`table.js`): Helfer `_restartFair()`, aufgerufen in `_takeOver` und bei Sitzwechsel durch
   Aufgeben; `_needSince ||= now` in `_tick`; `_priv()`-Helfer. → P1-1, P2-1, P2-16 grün.
3. **Gleichstand und Staffelung der Übernahme** (`table.js`). → P1-2 grün.
4. **Veralteter Zug** (`table.js`): `nack 'veraltet'`, `last.id`, einmalige Wiederholung. → P2-2 grün.
5. **Kette nie aufbrauchen** (`fair.js`, `table.js`): Fallback statt `throw`, `CHAIN` 4 096. → P1-5.
6. **Versionsfeld** (`table.js`, `app.js`): `build` in `hello`/`state`, Toast bei Abweichung, unbekanntes Spiel abfangen.
   → P2-3.
7. **Bot-Worker härten** (`botclient.js`, `app.js`, `index.html`): Worker beim Start, Zeitlimit, Bewertungen koaleszieren,
   Update-Flag + Neuladen beim nächsten Lobby-Aufruf. → P1-3, P2-4, P2-5.
8. **Speichern entprellen** (`store.js`). → P2-6.
9. **Zeiten und Uhr** (`table.js`, `netlink.js`): `awayMove`, Uhrenversatz relativ. → P2-9, P2-10 (Peter fragen).
10. **Navigation serialisieren** (`app.js`). → P2-8.
11. **Fair-Log aus dem Stand** (`table.js`, `fair.js`): `fairDelta`, Nachfordern, FakeLink mit Größenlimit. → P1-4.
    Vorher Relay-Grenze messen (offener Punkt 2).
12. **CI und Smoke-Stufe** (`.github/workflows/test.yml`, `run_all.mjs --smoke`, `update_sw.py --check`). → P2-14.
13. **Spiel-UI je Spiel** (`src/games/<id>/ui.js`, Registry, `gameui.js` schrumpft auf Dispatcher, `lobby.js` ohne
    `RULES`/`miniBoard`-Zweige, gemeinsame Bot-Liste). → P2-12.
14. **Lazy Laden je Spiel** (Registry `load(id)`, Worker lädt gezielt). → P2-13. Startzeit messen (offener Punkt 3).
15. **Precache teilen** (`tools/sw.template.js`, `update_sw.py`). → P2-7. Offline-Test mit Karten.
16. **`table.js` zerlegen** (`fairhost.js`, `takeover.js`, Engine-Phasen abstrahieren). → P2-11. Zuletzt, mit der dann
    vollständigen Testabdeckung.
17. **netlink.test.mjs** (Trystero-Attrappe). → P2-15. Kann parallel zu 13–16 laufen.
18. P3-Punkte gesammelt in einem Aufräum-Commit (keine Verhaltensänderung).

## Anhang A – Belege (Auszug aus `tests/out/audit_repro.mjs`)

```
(a) Backgammon: Host verschwindet, Gast übernimmt, dann wird gewürfelt
   Gast ist Host, epoch 2 | fairPriv vorhanden: false
   alter Host (H) zieht "play" → {"ok":true,"pending":true}
   neuer Host (G) zieht "roll" → undefined | synchroner Fehler: TypeError: Cannot read properties of undefined (reading 'pending')
   neuer Host danach: seq 6 Phase rolling dice null
   (Variante: alter Host würfelt → uncaught TypeError … (reading 'last') at TableSession._takeReveal table.js:474
    ← _hostOnMove table.js:626; alter Host sieht pending true)
(f) Halma (3 Sitze): Host verschwindet, beide Gäste übernehmen
   Rollen nach 600 ms: G1 host epoch 2 seq 3 | G2 host epoch 2 seq 3 | hostPid G1-Sicht G1, G2-Sicht G2
(b) Ludo (3 Sitze) online: G1 gibt auf, Computer übernimmt den Platz
   vor Aufgabe: G2 fairCheck {"ok":true,"checked":4}
   nach Aufgabe: G2/H fairCheck {"ok":false,"checked":11,"bad":["Ereignis 6: Kette von Sitz 2 passt nicht zum Commit"]}
(c) Ludo 4 Spieler, Bots Stufe 2: 60 Partien: min 259, median 526, max 902 Würfe (CHAIN = 1024)
(d) Hold'em 8 Sitze: 733 B je Hand → 72 KB / 100 Hände, 429 KB / 600 Hände; Ludo 4 Sitze: 317 B je Wurf
```

## Anhang B – Testlauf (Schnell-Suite, abgebrochen nach 126 s wegen der Zeitregel)

```
✓ words 1,3 s (32) · crypto 0,1 s (11) · relaychannel 8,1 s (15) · muehle 2,6 s (28) · dame 0,3 s (40)
✓ table 24,8 s (22) · schnapsen 0,5 s (32) · backgammon 2,2 s (19) · blackjack 0,1 s (24) · halma 0,1 s (18)
✓ fair 0,6 s (5) · evaluate 0,5 s (16) · tempo 0,1 s (9) · toastqueue 0,0 s (4) · ludo 2,3 s (23)
✓ schiffe 2,9 s (24) · vier 47,6 s (28) · maumau 10,9 s (23) · wuerfel 20,7 s (24)   – alle grün, 0 ❌
nicht gelaufen: reversi, paare, trainer_*, holdem_eval, holdem, holdem_bot, Schwärme
```

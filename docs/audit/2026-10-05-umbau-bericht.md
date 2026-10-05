# Spielebox – Umbau nach Gutachten 2026-10-05 (P1 + P2) – Bericht

Stand 06.10.2026 · Ausgangspunkt `main` @ 06742be (Deko-Bericht) · Ende @ 9fc3033 + dieser Bericht ·
**live: Version `09fff17b71`** (vorher live: `e88d221e7e` aus der Deko-Etappe) · Gutachten: `docs/audit/2026-10-05-max-gutachten.md`

**Kurz:** Alle 17 Schritte sind erledigt, keiner ist offen. Jeder Schritt wurde einzeln committet und gepusht.
Behoben sind alle 5 P1-Befunde und alle 16 P2-Befunde. Die P3-Kosmetik gehörte nicht zum Auftrag.
`npm test` läuft komplett grün (47 Dateien, 663 Einzelprüfungen, 922 s inkl. Schwärme).
Die Browser-Rauchtests sind grün, ebenso Netz-E2E und Live-Test, ohne Seitenfehler.

## Vorab

- Die Deko-Jobs waren sauber abgeschlossen: `DEKO_BERICHT.md` liegt in `main`, und der WIP-Stand aus omen16 (4d751eb)
  ist in d943f11 aufgegangen. Eine Abarbeitung von `spielebox-n7b-abschluss` war deshalb nicht nötig. Die Deko blieb
  unangetastet, Schritt 13 hat ihre Mini-Brett-Ausgabe mitgenommen.
- `?deko=0`: `SB_Q=deko=0 python3 tests/smoke.py` und `smoke_n4.py` sind grün. `__box.deko()` meldet dabei `on: false`,
  alle 16 Mini-Bretter werden gezeichnet. Dafür gibt es neu die Umgebungsvariable `SB_Q` in `tests/util.py`.
- Peter wurde zu Schritt 9 gefragt (Notiz 05.10. abends), ob 10 s für den automatischen Zug passen. Eine Antwort kam
  nicht, deshalb gelten 10 s. Der Wert steht als eine Zeile in `src/net/tablebase.js` (`TIMING.awayMove`).

## Schritte

| Nr | Befund | Status | Test (neu/geändert) | Commit |
|---|---|---|---|---|
| 1 | Netz-Szenarien als Tests | erledigt | 5 Tests in `table.test.mjs`, zuerst rot | ff308df |
| 2 | Fair-Runde neu starten (P1-1, P2-1, P2-16) | erledigt | Tests 1, 3, 5 grün | 5692c87 |
| 3 | Staffelung + Gleichstand der Übernahme (P1-2) | erledigt | Test 2 + „gleichzeitige Übernahme“ | c43b87a |
| 4 | Veralteter Zug (P2-2) | erledigt | Test 4 (Zug kommt an, 1 Wiederholung, kein Toast) | c4a9406 |
| 5 | Kette nie aufbrauchen (P1-5) | erledigt | `fair.test.mjs`: CHAIN 3 → Ereignis 4 = fallback; Stützstellen = naiv | a78e862 |
| 6 | Versionsfeld (P2-3) | erledigt | `table.test.mjs`: einmal Toast, unbekanntes Spiel abgelehnt | 4cf5247 |
| 7 | Bot-Worker härten (P1-3, P2-4, P2-5) | erledigt | `botclient.test.mjs` (Worker-Attrappe) | 8b9acef |
| 8 | Speichern entprellen (P2-6) | erledigt | `store.test.mjs` (Zähler der Schreibvorgänge, Quota) | 785f9bb |
| 9 | Zeiten und Uhr (P2-9, P2-10) | erledigt | `table.test.mjs` (Hold'em: meldet sich → kein Auto-Zug) | caaf7b4 |
| 10 | Navigation serialisieren (P2-8) | erledigt | Browser `tests/test_nav.py` | c23aff0 |
| 11 | Fair-Log aus dem Stand (P1-4) | erledigt | Ludo zu viert 600 Würfe bei 64-KB-Grenze; Neuladen; Lücke | d268246 |
| 12 | CI und Smoke-Stufe (P2-14) | erledigt | `--smoke` 28 s; `update_sw.py --check`; GitHub Actions grün | b80dbfd |
| 13 | Spiel-UI je Spiel (P2-12) | erledigt | Mini-Bretter alt = neu; smoke, smoke_n2–n5 grün | e1c942e |
| 14 | Lazy Laden je Spiel (P2-13) | erledigt | smoke, n2–n6, test_nav, e2e_n2, e2e_net grün | 2ab48bb |
| 15 | Precache teilen (P2-7) | erledigt | `tests/test_sw.py` (lokal) + `test_live.py` offline mit Karten | a245bbc |
| 16 | table.js zerlegen (P2-11) | erledigt | `fairhost.test.mjs`; verschobene Methoden wörtlich verglichen | 9a7987e |
| 17 | netlink.test.mjs (P2-15) | erledigt | `netlink.test.mjs` (5 Fälle) | 9fc3033 |

## Was sich je Schritt geändert hat (nur, was nicht schon im Brief steht)

**2 – Fair-Runde.** Eine neue Zufallsrunde in derselben Partie hat das Feld `fair.gen` (Generation). Die
Kettenglieder hängen an der Generation, alte Glieder lassen sich also nie wiederverwenden. Die Fair-Nachricht
trägt `gen`, und der Host nimmt nur Commits der aktuellen Generation an. Das Abzeichen zählt die schon geprüften
Ereignisse über den Neustart weiter. Mischungen der alten Generation, die zum Zeitpunkt des Neustarts noch geheim
waren (Kartenspiel, jemand gibt mitten in der Hand auf), bleiben ungeprüft. Sie werden weder als geprüft noch als
Fehler gezählt. Zusätzlich lässt `_takeOver` den Computer weiterziehen, wenn er gerade dran ist: `_maybeBot` fehlte
dort, sonst blieb der Tisch stehen (Beleg (g) im Gutachten).

**3 – Übernahme.** Die Staffelung beträgt 5 s je Mensch (`TIMING.takeoverStep`). Bei Gleichstand fordert auch der
Herzschlag eines anderen Hosts dessen Stand an, falls eine Stand-Nachricht verloren ging. Testhinweis: In
`table.test.mjs` kommt der Herzschlag nur im 1-s-Takt, `hostGone` ist dort aber 400 ms. Der Halma-Test setzt
`hostGone` deshalb auf 1,5 s, sonst übernimmt der Unterlegene sofort wieder (ein Testartefakt, kein App-Fehler).

**4 – Veralteter Zug.** Der Host schickt zuerst den Stand und dann den `nack`. So erkennt der Client am Stand, ob
sein Zug schon drin ist (`last.id`, auch im Verlauf `hist`). Ein unbestätigter Zug gilt zusätzlich als erledigt, wenn
eine neue Runde beginnt oder die Partie vorbei ist. Gegenüber einem Host älterer Version (Züge ohne id) gilt die alte
Regel.

**5 – Kette.** Mit 4096 Gliedern kostete ein Glied in Node bis zu 20 ms (auf dem Handy mehr), nicht die 3–4 ms aus
dem Gutachten. `chainLink` legt deshalb je Seed Stützstellen alle 64 Hashes an (kleiner LRU, 32 Seeds). Danach kostet
ein Glied höchstens 63 Hashes. Das Ergebnis ist identisch (Test gegen die naive Rechnung), und die Tisch-Tests laufen
schneller als vorher.

**6 – Version.** Auch der Host-Zweig übernimmt keinen fremden Stand mit unbekanntem Spiel.

**7 – Bot-Worker.** Nach dem Zeitlimit werden alle offenen Anfragen im Hauptthread erledigt, und der nächste Aufruf
legt einen neuen Worker an. Bewertungen, die durch eine neuere ersetzt werden, werden als „veraltet“ abgelehnt; die
Aufrufer fangen das bereits ab. Hold'em rechnet weiter 4000 Durchgänge.

**8 – Speichern.** Geschrieben wird frühestens 250 ms nach der letzten Änderung und spätestens 2 s nach der ersten,
damit schnelle Computer-Partien nicht endlos verschieben. Sofort geschrieben wird bei `pagehide`,
`visibilitychange: hidden` und beim Verlassen des Tisches. Die Liste wird auch neu geschrieben, wenn der Tisch nicht
vorn steht oder die Zeitangabe älter als 30 s ist; so bleiben Sortierung und „gerade eben“ in der Lobby wie bisher.

**9 – Uhr.** Der Versatz wird aus jedem `_hi` der Gegenstelle gelernt. Das Verbindungs-Blatt zeigt verworfene
Nachrichten an: „… als zu alt verworfen – ist die Uhrzeit eines Geräts falsch gestellt?“.

**10 – Navigation.** Auch Fehler aus den Lobby-Knöpfen (Tisch aufmachen, Beitreten, Weiterspielen) führen zu
„Konnte nicht öffnen: …“ und zurück in die Lobby. Neu in der Debug-API: `__box.liveSessions()`.

**11 – Fair-Log.** Messung vorher mit `node tests/relay_live.mjs --groessen=…` (neue Option), am 05.10. vom Mac über
ProtonVPN, gegen die sechs Relays aus `src/net/relays.js`. Gemessen ist die Inhaltsgröße je Event, wie sie `seal()`
liefert (Base64):

| Relay | 16 KB | 18 KB | 20 KB | 32 KB | 48 KB | 64 KB | 96 KB | 128 KB | Meldung |
|---|---|---|---|---|---|---|---|---|---|
| basspistol.org | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | „blocked: content is too big“ |
| nostr-01.uid.ovh | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| relay.snort.social | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| relay.primal.net | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| relay.sigit.io | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | Verbindung getrennt (1006) |
| nostr.mom | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | Verbindung getrennt (1006) |

Folge: Ab etwa 64 KB kam ein Stand nur noch über drei Relays an, und zwei Relays trennten dabei sogar die Verbindung.
Deshalb gehen Log-Stücke mit **≤ 12 000 Zeichen JSON** statt ≤ 32 KB. Verschlüsselt sind das höchstens etwa 16 KB, so
passt jedes Stück über alle sechs Relays. Der Stand selbst (ohne Log) bleibt klein: Hold'em mit 8 Plätzen
erreichte über 177 Hände höchstens 8,8 KB, während das Log auf 127 KB wuchs (gemessen in Node).

Protokoll: Der Stand trägt `fair { round, gen, commits, k, n, log: [] }`. Das leere `log` hält ältere Versionen beim
Prüfen am Leben. Das erste Stück geht als `fairDelta` mit, weitere folgen als `{ t: 'fairlog', … }`. Der Host merkt
sich je Empfänger, wie viel dieser schon hat (gesendet bzw. aus `hello.have.fair`). Lücken fordert der Client nach.

Zum Test: Mit Computer-Spielern war die Partielänge nicht reproduzierbar, die Partien endeten nach 300 bis 500
Würfen. Der Test spielt deshalb mit vier Menschen, festen Geräte-Geheimnissen und einer „langsamen“ Zugwahl; das
ergibt reproduzierbar 600 Würfe und 187 KB Log. Mit dem alten Protokoll wird der Stand nach 192 Würfen verworfen
(65 644 Zeichen), und der Test bleibt hängen.

**12 – CI.** Der erste Lauf auf GitHub war grün und dauerte knapp 16 min. Unabhängig davon fielen am 05.10. zwischen
20:11 und 20:55 die Pages-Deployments aus („job was not acquired by Runner“, Störung bei GitHub). Danach liefen sie
wieder normal (40 s).

**13 – Spiel-UI.** `src/games/<id>/ui.js` enthält Symbol, Unterzeile, Hinweise, Knöpfe, Menü, Regeln und `mini()`.
Das Brett selbst steckt nicht darin: `gameui.js` gibt `view.js` dazu. Nur so lässt sich in Schritt 14 die Ansicht
nachladen, während die Lobby alle `ui.js` sofort hat. Halma zeigt in der Lobby wie bisher die Regeln ohne den Absatz
zur Blockade-Regel (`lobbyRules`). Gemeinsame Symbole liegen in `src/ui/gameicons.js`. Ergebnis: `gameui.js` schrumpft
von 670 auf 21 Zeilen, `lobby.js` von 388 auf 295.

**14 – Lazy Laden.** Engines und die leichten `ui.js` bleiben sofort geladen, denn die Lobby braucht Regeln und
Mini-Bretter aller Spiele. Ansicht und Bot werden nachgeladen:
- App: lädt die Ansicht vor dem Öffnen eines Tisches. Ein Gast ohne Stand oder ein Spielwechsel am Tisch zeigt kurz
  „Lade …“.
- Worker: lädt den Bot beim ersten Zug.
- `quickMove` und `__box.botMove` sind jetzt asynchron, `__box.local` wartet, bis der Tisch steht.

Messung mit Playwright, JS-Dateien beim Lobby-Start (Seite + Worker, Engines zählen doppelt):

| | Dateien | Größe |
|---|---|---|
| vorher | 176 | 1,63 MB |
| nachher | 128 | 1,19 MB |
| nach Öffnen von Mühle | 131 | |
| nach Öffnen von Hold'em | 133 | |

**15 – Precache.** Abweichung vom Brief zur Sicherheit: Der Bilder-Cache `spielebox-assets` ist versionslos und wird
beim Aktivieren nie gelöscht. Seine Einträge tragen aber den Inhalts-Hash der Datei (`?h=…`, aus `update_sw.py`). So
holt ein Update genau die geänderten Bilder; ohne Hash blieben geänderte Karten für immer alt.
- Fehlende Bilder kommen zuerst aus einem alten Cache, wenn der SHA-256 passt, sonst aus dem Netz.
- Der Umstieg vom bisherigen Service-Worker lädt deshalb kein einziges Bild neu: 0 Abrufe statt 4 MB
  (`SW_ALT=… python3 tests/test_sw.py`).
- Beim Aktivieren werden nur Fassungen entfernt, die zu keiner Datei mehr gehören.
- Bilder, die erst bei Bedarf geholt werden (1×-Karten), landen ebenfalls im Bilder-Cache.

**16 – Zerlegung.** Neu sind `fairhost.js` (300 Zeilen), `takeover.js` und `tablebase.js` (TIMING, `newer`,
`seatOf`, `clone`; ohne Ring-Import). Die Methoden werden in `TableSession` eingehängt, und `table.js` exportiert
wie bisher. `table.js` hat jetzt 806 Zeilen (vorher 1170 nach Schritt 11, 912 laut Gutachten). Die verschobenen
Methoden sind wörtlich gleich. Einzige gewollte Änderung: `publishShuffleNow(eng, gs)` mit dem Engine-Feld
`publishShuffleWhen`, beschrieben in `docs/ENGINE_API.md`.

**17 – netlink.** `NetLink` bekommt `joinRoom` und `makeRelay` als Konstruktor-Optionen. Damit testet
`netlink.test.mjs` Direktweg, Relay (inklusive „Relay sieht keinen Klartext“) und die Altersprüfung.

## Verifikation am Ende

- `npm test` komplett: grün, 47 Dateien, 0 ❌, 922 s. Das Log liegt unter `tests/out/full.log` (nicht eingecheckt).
- Browser, nacheinander und immer nur ein Browser:
  - `smoke.py`, `smoke_n4.py` und `e2e_net.py` (direkt, automatischer Rückfall, Relay): grün, je 0 Seiten- und
    App-Fehler.
  - Ebenfalls grün im Verlauf: `smoke_n2`, `smoke_n3`, `smoke_n5`, `smoke_n6`, `test_nav`, `test_sw`, `e2e_n2`,
    `e2e_n4` (auch `--relay`), und `smoke`/`smoke_n4` mit `?deko=0`.
- Live (`python3 tests/test_live.py`): grün.
  - HTTP 200, Version live `09fff17b71` = lokal, PWA installierbar, Service-Worker aktiv.
  - Offline neu geladen: Dame 10×10 zu zweit spielbar, **Karten und Holz kommen aus dem Bilder-Cache**.
  - Teilen-Link funktioniert, Live-Beitritt über die drei Wörter in 0,7 s, 0 Fehler.
- Keine Server und keine Browser offen. Die Screenshots, die die Tests überschreiben, sind auf den eingecheckten
  Stand zurückgesetzt.

## Offen (braucht Gerät oder Entscheidung)

1. **iPhone-Messungen** (wie im Gutachten offen): Dauer der Hold'em-Bewertung im Worker (P2-5; Durchgänge bewusst
   unverändert) und der Kaltstart vor/nach dem Nachladen (P2-13).
2. **Uhrenversatz über Relay:** Die App prüft das Alter jetzt relativ zur Gegenstelle. Das Relay-Abo (`since` in
   `relaychannel.js`, eigene Uhr − 60 s) filtert Events eines Geräts, dessen Uhr mehr als eine Minute nachgeht, aber
   schon beim Relay heraus. Direkt (WebRTC) ist das behoben, über Relay nicht. Das wäre ein eigener kleiner Schritt
   in `relaychannel.js`.
3. **P1-3 mit zwei echten Deployments** (Spieler bleibt am Tisch, Update kommt, danach Computer-Partie) ist nur
   mittelbar geprüft: `test_sw.py` simuliert das Update, der Worker wird jetzt beim Start angelegt, und neu geladen
   wird erst in der Lobby.
4. P3-Punkte aus dem Gutachten (Kosmetik) waren nicht Teil dieses Auftrags.

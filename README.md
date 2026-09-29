# Spielebox

Brett- und Kartenspiele übers Netz – ohne Konto, ohne Server, Zutritt mit drei Wörtern.
**Spielen:** https://drpeterkalmar.github.io/spielebox/

Handy zuerst (Hoch- und Querformat), als App installierbar (PWA), offline gegen den Computer oder zu zweit an einem Gerät.
**Spiele:** Mühle · Dame (Deutsch 8×8 / International 10×10) · Schach · Schnapsen · Backgammon · Blackjack (2–6) · Stern-Halma (2/3/4/6).
Jedes Spiel online über die drei Wörter, gegen den Computer (3 Stufen) oder an einem Gerät. Freie Plätze an Mehr-Personen-Tischen
füllt der Computer. Unter dem Brett steht auf Wunsch „Wer gewinnt?“ (Zahl in der Einheit des Spiels ↔ Gewinnchance in %).

## Idee
- **Tisch aufmachen:** Spiel wählen → die App zeigt drei Wörter, z. B. *Baum · Ball · Wolke*.
- **Beitreten:** Der Mitspieler tippt die drei Wörter ein (Autovervollständigung, Reihenfolge egal, Tippfehler und
  gleich klingende Schreibweisen wie „mehr“ statt „Meer“ werden erkannt) – oder öffnet den geteilten Link.
- Die Wörter lassen sich telefonisch diktieren: 1024 einfache deutsche Nomen, ohne Umlaute und ß, ohne Gleichklang,
  kein Wort ist Anfang eines anderen (`src/words.js`, selbst erstellt).
- **Zuschauen:** Mit denselben Wörtern „Zuschauen“ wählen. Wer keinen Platz mehr bekommt, schaut automatisch zu.
- **Weiterspielen:** Tab zu, Akku leer, neu geladen? Dieselben drei Wörter eingeben oder unter „Weiterspielen“ antippen –
  die Partie geht weiter (Zustand in localStorage, Schlüssel = Wort-Hash).
- **Solo:** Übungs-Computer in drei Stufen, oder zu zweit an einem Gerät (beides offline).

## Datenschutz in einem Satz
Es gibt keinen Server: Die Geräte verbinden sich direkt (WebRTC) oder – wenn das nicht klappt – schicken sich
AES-GCM-verschlüsselte Kurznachrichten über öffentliche Nostr-Relays, und diese Relays sehen nur einen Hash der
Wörter, nie die Wörter, Namen oder Züge im Klartext.

## Wie das Netz funktioniert
- Raum = SHA-256 der drei (sortierten) Wörter; `joinRoom({ appId: 'spielebox-v1', password: <Wörter> }, <Hash>)`
  mit [Trystero](https://github.com/dmotz/trystero) 0.25.4 (gebündelt in `lib/trystero.js`, kein CDN).
- Der Gastgeber ist **Schiedsrichter**: Sein Gerät prüft jeden Zug mit derselben Regel-Engine und verteilt den Zustand.
  Fällt er länger aus, übernimmt ein sitzender Mitspieler; kehrt er zurück, ordnet er sich unter.
- **Relay-Fallback:** Kommt 12 s lang keine Direktverbindung zustande (oder meldet Trystero „could not connect“),
  laufen die Züge verschlüsselt (Schlüssel per PBKDF2 aus den Wörtern) über sechs Relays parallel
  (`src/net/relays.js`, gemessen mit `tests/relay_live.mjs`). Zum Testen erzwingen: `?relay=1`.
- Oben rechts steht der Verbindungsstatus: **direkt verbunden**, **über Relay**, **getrennt** (Menü → Wiederverbinden) oder **wartet**.

## Fair Play und verdeckte Karten
- **Kartenspiele:** Jedes Gerät bekommt nur seine eigenen Karten geschickt (gezielt an den einzelnen Mitspieler),
  Zuschauer sehen keine Hand. Ehrliche Grenze: Der Browser des Gastgebers kennt alle Karten; über den Relay-Fallback sind
  gezielte Nachrichten mit dem gemeinsamen Schlüssel aus den Wörtern verschlüsselt. Gedacht für Familie und Freunde.
- **Würfel und Mischen** (`src/net/fair.js`): Jeder Spieler legt sich zu Beginn auf eine geheime Hash-Kette fest (Commit).
  Jeder Wurf bzw. jede Mischung ergibt sich aus den Kettengliedern aller Spieler – niemand, auch nicht der Gastgeber, kann
  sie steuern. Würfe prüft jedes Gerät sofort, Mischungen nach dem jeweiligen Spiel („✓ fair gemischt/gewürfelt“).
  Solo und an einem Gerät: normaler Zufall.
- **Zu zweit an einem Gerät** (Schnapsen): Sichtschutz „Gerät an … weitergeben“ zwischen den Zügen.

## Regeln und Schalter
**Mühle:** 9 Steine, erst setzen, dann ziehen; Mühle schließen = gegnerischen Stein nehmen (nicht aus einer
geschlossenen Mühle, außer alle stehen in Mühlen; auch bei Doppelmühle nur einen); mit 3 Steinen springen;
verloren hat, wer weniger als 3 Steine hat oder nicht ziehen kann; Remis bei dreifacher Wiederholung.
Hausregel gegen endlose Partien: 50 Züge je Spieler ohne Mühle = Remis.

**Dame – Umschalter:**
- *Deutsch (8×8, 12 Steine):* Steine ziehen und schlagen nur vorwärts; Schlagzwang mit freier Wahl; Mehrfachsprung
  bis zum Ende; Umwandlung zur Dame beendet den Zug; die Dame zieht beliebig weit, schlägt auf Distanz und landet
  direkt hinter dem geschlagenen Stein.
- *International (10×10, 20 Steine):* Steine schlagen auch rückwärts; fliegende Dame (landet beliebig weit dahinter);
  Mehrheits-Schlagzwang (Dame und Stein zählen gleich); Umwandlung nur, wenn der Zug auf der Grundlinie endet.
- *Hausregel „Kurze Dame“:* Die Dame zieht und schlägt nur ein Feld weit.
- *Hausregel „Pusten“:* Kein Schlagzwang – wer nicht schlägt, obwohl er könnte, dem darf der Gegner vor seinem Zug
  einen der Steine wegpusten, die hätten schlagen können.
- Ende: keine Steine oder keine Züge = verloren; Remis bei dreifacher Wiederholung oder 25 Zügen je Seite nur mit Damen ohne Schlagen.

**Schach:** FIDE-Regeln über chess.js; Rochade, en passant und Umwandlung per Tipp (Figur direkt auf dem Brett wählen),
automatisches Remis (Patt, zu wenig Material, 50 Züge, dreifache Wiederholung), Remis anbieten, Aufgeben, Partie als PGN teilen.

**Schnapsen** (österreichische Standardregel, de.wikipedia): 20 Blatt doppeldeutsch, Talon mit Atout, Ansagen 20/40,
Austauschen, Zudrehen, Ausmelden ab 66 (1/2/3 Punkte), Bummerl bis 7, Bummerl-Tafel. Schalter: *weich/hart*
(hart: bei einer Talonkarte kein Austauschen), *Schneider-Bummerl doppelt*, Partie auf *2 oder 3 Bummerl*.

**Backgammon:** Standardregeln inkl. Pflicht, beide Würfel zu nutzen (geht nur einer, der höhere), Pasch = 4 Züge,
Bar zuerst, Abtragen erst mit allen Steinen im Heimfeld; Verdopplungswürfel (abschaltbar), Gammon ×2, Backgammon ×3.

**Blackjack (Bank reihum):** 2–6 Plätze, Bank spielt automatisch (zieht bis 16, steht ab 17), Wechsel alle 5 Runden
(Schalter: Wechsel bei Black Jack), Schuh aus 2 Decks, neu gemischt unter 25 %, Black Jack 3:2, Verdoppeln auf 2 Karten,
einmal Teilen, keine Versicherung. Gespielt wird um Bohnen.

**Stern-Halma:** 121 Löcher, 10 Steine, Schritt oder Sprungkette (beliebig lang, kein Loch zweimal), kein Schlagen.
Blockade-Regel: Ist die Zielzacke voll und steht mindestens ein eigener Stein darin, ist das ein Sieg. Zuglimit 200 Züge je
Spieler (dann gewinnt der kürzeste Restweg). „Lupe“ vergrößert das Brett am Handy.

Quellen: de.wikipedia „Mühle (Spiel)“, „Dame (Spiel)“, „Schnapsen“, „Halma“, en.wikipedia „Chinese checkers“,
strategy-games.de (deutsche Dame), FMJD (international), FIDE (Schach).

## Entwickeln und testen
Vanilla-ES-Module ohne Build; esbuild nur einmalig für `lib/trystero.js` (`npm run build:lib`).
- `npm test` – Node: Wortliste, Krypto, Relay-Kanal, Regelfälle aller Spiele, Tisch-Protokoll (auch verdeckte Karten,
  faire Würfel/Mischung, Mehr-Sitz-Tisch), Fair Play, evaluate, Zufalls-Schwarm mit Invarianten (Mühle/Dame/Schnapsen/
  Backgammon/Blackjack 10 000 Partien, Halma 2 460, Schach 150 + Bot-Stufen); `npm test -- --schnell` ohne Schwarm.
- `python3 tests/smoke_n2.py` – Browser: neue Spiele per echtem Tipp (Pixel 7 hoch/quer, Desktop), Zoom-Schutz, „Wer gewinnt?“.
- `python3 tests/e2e_n2.py [--relay]` – Netz-E2E: Schnapsen (Gast/Zuschauer sehen die Host-Karten nie), Backgammon (faire Würfel),
  Blackjack mit 3 Kontexten über die 3 Wörter.
- `python3 tests/smoke.py` – Browser (Pixel 7 hoch/quer, Desktop): Lobby, 3-Wörter-Anzeige, Mühle/Dame per Tap,
  Knöpfe ≥ 48 px, Brett ganz sichtbar, 0 Fehler.
- `python3 tests/e2e_net.py` – Netz-E2E über die echten öffentlichen Relays: direkt, automatischer Fallback, `?relay=1`,
  Partie Mühle bis zum Ende, Zuschauer, Wiederaufnahme nach Reload.
- `python3 tests/test_live.py` – Live-Seite: HTTP 200, Version, PWA installierbar, offline, Teilen-Link, Live-Beitritt.
- Nach Änderungen an App-Dateien: `python3 tools/update_sw.py` (Service-Worker-Version = Inhalts-Hash).
- Debug-API im Browser: `window.__box` (Zustand, legale Züge, Züge, Tisch öffnen/beitreten).

## Credits
- Programm, Bretter, Steine, Icons, Wortliste: eigene Arbeit, MIT-Lizenz (© 2026 Peter Kalmar).
- Holztexturen: [Poly Haven](https://polyhaven.com), CC0 – „Silver Oak Veneer 01“ und „Walnut Veneer“ (Jenelle van Heerden),
  „Dark Wood“ (Dario Barresi, Dimitrios Savva, Rico Cilliers).
- Trystero (MIT, Dan Motzenbecker), @noble/secp256k1 (MIT, Paul Miller), chess.js (BSD-2, Jeff Hlywa).
- Schachfiguren: Colin M. L. Burnett (cburnett), Wikimedia Commons, BSD-3-Clause.
- Schnapskarten: Fotos von Zákupák (Wikimedia Commons, gemeinfrei), entzerrt mit `tools/cards/crop_de.py`.
- Französische Karten: Byron Knoll, „Vector Playing Cards“ (gemeinfrei).
- Alle Einzelheiten: [LICENSES.md](LICENSES.md); in der App unter „Credits“.

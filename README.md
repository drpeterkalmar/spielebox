# Spielebox

Brettspiele zu zweit übers Netz – ohne Konto, ohne Server, Zutritt mit drei Wörtern.
**Spielen:** https://drpeterkalmar.github.io/spielebox/

Handy zuerst (Hoch- und Querformat), als App installierbar (PWA), offline gegen den Computer oder zu zweit an einem Gerät.
Nacht 1: **Mühle** und **Dame** (Deutsch 8×8 / International 10×10). Geplant: Schach, Backgammon, Stern-Halma, Schnapsen, Blackjack.

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

Quellen: de.wikipedia „Mühle (Spiel)“ und „Dame (Spiel)“, strategy-games.de (deutsche Dame), FMJD (international).

## Entwickeln und testen
Vanilla-ES-Module ohne Build; esbuild nur einmalig für `lib/trystero.js` (`npm run build:lib`).
- `npm test` – Node: Wortliste, Krypto, Relay-Kanal, Regelfälle Mühle/Dame, Tisch-Protokoll, Zufalls-Schwarm
  (10 000 Partien je Spiel und Regelvariante mit Invarianten); `npm test -- --schnell` ohne Schwarm.
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
- Trystero (MIT, Dan Motzenbecker), @noble/secp256k1 (MIT, Paul Miller).
- Alle Einzelheiten: [LICENSES.md](LICENSES.md); in der App unter „Credits“.

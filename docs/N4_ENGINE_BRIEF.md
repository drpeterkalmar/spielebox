# n4 – gemeinsamer Auftrag für die Engine-Agenten (Spielebox)

Repo `~/dev/spielebox` (Vanilla-ES-Module, Node 24, keine Abhängigkeiten zur Laufzeit). Sprache in Code-Kommentaren,
Texten und Berichten: **Deutsch**. Stil wie die vorhandenen Engines (kurze deutsche Kommentare, reines JSON).

## Lies zuerst
- `docs/ENGINE_API.md` (Pflicht-API, `chance/applyChance`, `HIDDEN/viewFor`, `evaluate`, Bot-API, Test-Stil)
- Vorlagen: `src/games/backgammon/engine.js` (Würfeln als Zug `{type:'roll'}` + `chance`), `src/games/schnapsen/engine.js`
  (verdeckte Karten, `viewFor`, `phase`), `src/games/blackjack/engine.js` (N Sitze, Mischen), `src/games/dame/bot.js`
  (Alpha-Beta), Tests `tests/node/backgammon.test.mjs`, `tests/node/backgammon.swarm.test.mjs`, `tests/node/evaluate.test.mjs`.
- `src/net/fair.js`: `valueFor({kind:'dice', n})` liefert **n** Würfel (1–6) als Array (n fehlt → 2);
  `valueFor({kind:'shuffle', n})` eine Permutation von `[0..n-1]`. Tests: `valueFor(chance, hexString)` mit Zufalls-Hex aus `mulberry32`.

## Du schreibst NUR diese Dateien (sonst nichts anfassen, kein git!)
- `src/games/<id>/engine.js` – Regel-Engine nach `docs/ENGINE_API.md`, ohne DOM/Zufall/Uhr, deterministisch.
- `src/games/<id>/bot.js` – `export function chooseMove(state, { level = 2, rng = Math.random, timeMs = 400 })`,
  Stufen 1 (schwach, aber nicht dumm-zufällig wo es weh tut), 2 (solide), 3 (stark, nutzt `timeMs`, höchstens ~1,2 s).
  Bei `HIDDEN` bekommt der Bot nur `viewFor(state, seat)` – er darf nichts Verdecktes brauchen.
- `src/games/<id>/rules.js` – reine Daten ohne DOM: `export const RULES = { title, source: 'Quelle(n) mit URL', items: ['Regel-Satz', …], options: { <key>: 'Erklärung' } }`
  (kurze, kindgerechte deutsche Sätze; Hausregeln als Option kenntlich).
- `tests/node/<id>.test.mjs` – Regelfälle aus der Primärquelle (mind. 15 Tests), Stil wie `backgammon.test.mjs`
  (eigene `test()`-Funktion, `✅`/`❌`, Exit-Code 1 bei Fehlern). Dazu evaluate-Fälle (Vorzeichen, Symmetrie,
  bei HIDDEN `evaluate(viewFor(s,k),k) === evaluate(s,k)`) und Bot-Stufen (Stufe 3 schlägt Stufe 1 klar, Stufe 2 schlägt 1).
- `tests/node/<id>.swarm.test.mjs` – Schwarm-Selbstspiel: viele Zufallspartien (Ziel 10 000, bei teuren Spielen weniger,
  Zahl im Kommentar begründen) mit Invarianten nach jedem Zug (z. B. Steinzahl/Kartenzahl erhalten, nur legale Züge,
  jede Partie endet, `isLegal` lehnt Müll/verfälschte Züge ab, `positionKey` stabil, JSON-Rundreise gleich),
  bei HIDDEN zusätzlich: `viewFor` enthält keine fremde verdeckte Info, Längen stimmen. Laufzeit ≤ 60 s,
  **höchstens 2 Worker-Threads** (mehrere Agenten laufen parallel auf einem 8-GB-Mac).

## Pflicht-Details
- Exporte wie in `docs/ENGINE_API.md`: `id, title, PLAYERS, normalizeOptions, initialState, currentPlayer, legalMoves,
  isLegal, applyMove, result, describeMove, positionKey, evaluate` (+ `chance/applyChance`, `HIDDEN/viewFor`, `phase` falls passend).
- `result(state)` → `null` oder `{ winner: Sitz|null, reason: 'deutscher Text', points?: Zahl }`.
- `describeMove(state, move)` → kurzer deutscher Text für die Zugliste („Rot: Figur 2 auf Feld 17“, „Spalte 4“ …).
- `evaluate(state, seat)`: Zahl aus Sicht von `seat` in der natürlichen Einheit des Spiels (Einheit im Kopfkommentar nennen),
  bei 2 Spielern `evaluate(s,0) + evaluate(s,1) === 0`, Startstellung 0 (außer Zufall/Karten machen es unmöglich), immer endlich.
- `isLegal` wirft nie und lehnt unbekannte Felder/Typen ab. `applyMove` wirft bei illegalem Zug.
- Regeln **aus einer Primärquelle belegen** (WebFetch/WebSearch erlaubt: offizielle Spielanleitung des Verlags als PDF,
  sonst de.wikipedia). Quelle in `rules.js` und im Kopfkommentar der Engine. Hausregeln als Option, Standard = Quelle.
- Kein `Math.random` in der Engine. Bot darf `rng` nutzen.
- Die Oberfläche (view.js) baut die Hauptsession – du nicht. Aber: exportiere die Hilfsfunktionen, die eine Ansicht
  braucht (unten je Spiel genannt), und dokumentiere das Zustandsformat im Kopfkommentar der Engine.

## Abschluss
- `node tests/node/<id>.test.mjs` und `node tests/node/<id>.swarm.test.mjs` grün; die bestehende Suite nicht anfassen.
- Antworte am Ende knapp (Deutsch): Zustandsformat, Zug-Format, exportierte Hilfsfunktionen, Optionen (key, Standard),
  Regelquelle(n) mit URL und welche Regel-Entscheidungen du treffen musstest, Bot-Stufen (was sie tun, Messwerte
  Stufe-gegen-Stufe), Testzahlen und Laufzeiten.

# Engine-API der Spielebox (Stand Tagesspurt 29.09.)

Jede Engine liegt in `src/games/<id>/engine.js`, ist reines ES-Modul **ohne DOM, ohne Zufall, ohne Uhrzeit**
(deterministisch; Zufall kommt nur über `chance`/`applyChance` von außen). Zustände sind reines JSON und werden
nie verändert (`applyMove` gibt einen neuen Zustand zurück). Läuft in Node 24 und im Browser/Worker.

## Pflicht (wie Nacht 1, vgl. `src/games/muehle/engine.js`)
| Export | Bedeutung |
|---|---|
| `id`, `title` | z. B. `'schnapsen'`, `'Schnapsen'` |
| `PLAYERS` | Anzeigenamen je Sitz, z. B. `['Weiß','Schwarz']` bzw. `['Spieler 1', …]` (für N Sitze: Liste ≥ max. Sitze) |
| `normalizeOptions(opts)` | fehlende/ungültige Optionen → Standard; gibt immer ein vollständiges Objekt zurück |
| `initialState(opts)` | Startzustand (bei Zufallsspielen: Zustand, der zuerst `chance` verlangt) |
| `currentPlayer(state)` | Sitz (0…N-1), der jetzt eine Eingabe machen muss; `null`, wenn gerade niemand (Zufall ausstehend oder vorbei) |
| `legalMoves(state)` | Liste aller erlaubten Züge des `currentPlayer` (leer, wenn vorbei / Zufall ausstehend) |
| `isLegal(state, move)` | wirft nie; Müll → `false` |
| `applyMove(state, move)` | neuer Zustand; wirft bei illegalem Zug |
| `result(state)` | `null` oder `{ winner: Sitz|null, reason: 'Text', points?: Zahl }` (Ende der ganzen Partie) |
| `describeMove(state, move)` | kurzer deutscher Text für die Zugliste (aus Sicht vor dem Zug) |
| `positionKey(state)` | String der Stellung (Wiederholung, Tests) |
| `evaluate(state, seat)` | Zahl aus Sicht von `seat` in der natürlichen Einheit (+ = gut für `seat`); nur aus sichtbaren Infos von `seat` |

Züge sind kleine JSON-Objekte (z. B. `{ type: 'play', card: 'H-A' }`). `isLegal` muss unbekannte Felder ablehnen.

## Zufall (neu): `chance` / `applyChance`
- `chance(state)` → `null` oder `{ kind: 'dice' }` (zwei Würfel) bzw. `{ kind: 'shuffle', n: <Kartenzahl> }`.
- `applyChance(state, value)`: `dice` → `[d1, d2]` (je 1–6); `shuffle` → Permutation `[0..n-1]` (Reihenfolge des Stapels,
  Index 0 = oberste Karte). Wirft bei ungültigem Wert.
- Solange `chance(state) !== null`, ist `currentPlayer(state) === null` und `legalMoves` leer.
- Der Tisch (Host) ruft nach jedem Zug so lange `applyChance`, bis `chance` null ist. Lokal mit `crypto`-Zufall,
  online über `src/net/fair.js` (Hash-Ketten). Tests nutzen `mulberry32` aus `src/rng.js`.
- Mischungen bleiben online geheim, bis ihre Karten keine Rolle mehr spielen: Der Host veröffentlicht frühere Mischungen,
  sobald eine neue fällt und `publishShuffleWhen(state)` (optional) wahr ist; ohne das Feld gilt wie bisher
  `phase(state)` ist `'deal'` oder `'bet'` (ohne `phase`: immer). Umsetzung: `src/net/fairhost.js`.

## Verdeckte Information (Kartenspiele)
- `HIDDEN = true` exportieren.
- `viewFor(state, seat)` → Zustand, in dem alles, was `seat` nicht sehen darf, durch `null` ersetzt ist
  (fremde Hände, Talon/Schuh außer offenen Karten). `seat = null` (Zuschauer) sieht keine Hand.
  Längen bleiben erhalten (Kartenzahl sichtbar), damit die Oberfläche Rücken zeichnen kann.
- Auf `viewFor(state, currentPlayer)` müssen `currentPlayer`, `legalMoves`, `isLegal`, `result`, `describeMove`,
  `evaluate` genauso funktionieren wie auf dem vollen Zustand (Client prüft Züge vorab, Bot sieht nur die Sicht).
  `applyMove` braucht nur auf dem vollen Zustand zu funktionieren.
- `evaluate(viewFor(s, seat), seat) === evaluate(s, seat)` (Test!).

## Bot
`src/games/<id>/bot.js`: `chooseMove(state, { level = 2, rng = Math.random, timeMs = 400 })` → ein Zug aus `legalMoves(state)`.
Bei `HIDDEN` bekommt der Bot nur `viewFor(state, seat)`. Stufen 1–3 (1 = schwach/zufällig-plausibel).

## Tests
`tests/node/<id>.test.mjs` (Regelfälle) und `tests/node/<id>.swarm.test.mjs` (Zufallspartien mit Invarianten),
Stil wie `tests/node/muehle.test.mjs` (eigene `test()`-Funktion, Ausgabe `✅`/`❌`, Exit-Code 1 bei Fehlern).

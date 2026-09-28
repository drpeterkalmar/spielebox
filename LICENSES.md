# Lizenzen und Quellen

Alle fremden Dateien im Repo, mit Quelle, Autor und Lizenz. Programmcode, Bretter und Steine (SVG),
Icons und die Wortliste (`src/words.js`, 1024 selbst erstellte Nomen) sind eigene Arbeit (MIT, siehe `LICENSE`).

| Datei(en) | Quelle | Autor | Lizenz | URL |
|---|---|---|---|---|
| `assets/wood/light.jpg`, `assets/wood/light.webp` | Poly Haven, Textur „Silver Oak Veneer 01“ (`silver_oak_veneer_01`), Diffuse-Map 2k → 1024 px | Jenelle van Heerden | CC0 1.0 | https://polyhaven.com/a/silver_oak_veneer_01 |
| `assets/wood/dark.jpg`, `assets/wood/dark.webp` | Poly Haven, Textur „Walnut Veneer“ (`walnut_veneer`), Diffuse-Map 2k → 1024 px | Jenelle van Heerden | CC0 1.0 | https://polyhaven.com/a/walnut_veneer |
| `assets/wood/frame.jpg`, `assets/wood/frame.webp` | Poly Haven, Textur „Dark Wood“ (`dark_wood`), Diffuse-Map 2k → 1024 px | Dario Barresi, Dimitrios Savva, Rico Cilliers | CC0 1.0 | https://polyhaven.com/a/dark_wood |
| `lib/trystero.js` (gebündelt mit esbuild, Version gepinnt) | Trystero 0.25.4 inkl. `@trystero-p2p/core` und `@trystero-p2p/nostr` 0.25.4 | Dan Motzenbecker | MIT | https://github.com/dmotz/trystero (Lizenztexte: `lib/licenses/`) |
| `lib/trystero.js` (darin enthalten) | `@noble/secp256k1` 3.2.0 | Paul Miller | MIT | https://github.com/paulmillr/noble-secp256k1 (Lizenztext: `lib/licenses/LICENSE-noble-secp256k1.txt`) |

Die Icons (`icons/`) sind eigene Gestaltung; als Hintergrund dient die oben genannte CC0-Holztextur.
Details zur Aufbereitung der Texturen: `assets/wood/SOURCES.json` (Poly-Haven-API-Belege, md5 der Rohdateien).

## Regelquellen (keine Dateien übernommen)
- de.wikipedia „Mühle (Spiel)“ und „Dame (Spiel)“
- strategy-games.de (deutsche Dame, Kurze Dame)
- FMJD-Regeln (internationale Dame: Mehrheits-Schlagzwang, fliegende Dame, 25-Züge-Regel)

## Netz
Öffentliche Nostr-Relays (`src/net/relays.js`) dienen nur als Vermittlung bzw. Relay-Fallback; es werden keine
Inhalte der Relays übernommen.

## Eigener Code
MIT-Lizenz, © 2026 Peter Kalmar.

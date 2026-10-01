# Lizenzen und Quellen

Alle fremden Dateien im Repo, mit Quelle, Autor und Lizenz. Programmcode, Bretter und Steine (SVG),
Icons und die Wortliste (`src/words.js`, 1024 selbst erstellte Nomen) sind eigene Arbeit (MIT, siehe `LICENSE`).

| Datei(en) | Quelle | Autor | Lizenz | URL |
|---|---|---|---|---|
| `assets/wood/light.jpg`, `assets/wood/light.webp` | Poly Haven, Textur „Silver Oak Veneer 01“ (`silver_oak_veneer_01`), Diffuse-Map 2k → 1024 px | Jenelle van Heerden | CC0 1.0 | https://polyhaven.com/a/silver_oak_veneer_01 |
| `assets/wood/dark.jpg`, `assets/wood/dark.webp` | Poly Haven, Textur „Walnut Veneer“ (`walnut_veneer`), Diffuse-Map 2k → 1024 px | Jenelle van Heerden | CC0 1.0 | https://polyhaven.com/a/walnut_veneer |
| `assets/wood/frame.jpg`, `assets/wood/frame.webp` | Poly Haven, Textur „Dark Wood“ (`dark_wood`), Diffuse-Map 2k → 1024 px | Dario Barresi, Dimitrios Savva, Rico Cilliers | CC0 1.0 | https://polyhaven.com/a/dark_wood |
| `lib/trystero.js` (gebündelt mit esbuild, Version gepinnt) | Trystero 0.25.4 inkl. `@trystero-p2p/core` und `@trystero-p2p/nostr` 0.25.4 | Dan Motzenbecker | MIT | https://github.com/dmotz/trystero (Lizenztexte: `lib/licenses/`) |
| `lib/chess.js` (gebündelt mit esbuild, `tools/build_chess.mjs`, Version gepinnt) | chess.js 1.4.0 | Jeff Hlywa | BSD-2-Clause | https://github.com/jhlywa/chess.js (Lizenztext: `lib/licenses/LICENSE-chess.js.txt`) |
| `assets/pieces/*.svg` (12 Schachfiguren, unverändert) | Wikimedia Commons `File:Chess_{k,q,r,b,n,p}{l,d}t45.svg` | Colin M. L. Burnett (cburnett) | BSD-3-Clause (mehrfach lizenziert: BSD-3, GPL, GFDL, CC BY-SA 3.0; wir nutzen BSD-3) | https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces |
| `assets/cards/de/*.webp` (32 Karten: 20 Schnapskarten + Neuner/Achter/Siebener, entzerrt/zugeschnitten mit `tools/cards/crop_de.py`) | Wikimedia Commons `File:Červené v kartách.jpg`, `File:Kule v kartách.jpg`, `File:Zelené v kartách.jpg`, `File:Žaludy v kartách.jpg` | Zákupák | Public Domain | https://commons.wikimedia.org/wiki/User:Z%C3%A1kup%C3%A1k (Belege: `assets/cards/SOURCES.md`) |
| `assets/cards/fr/*.webp` (52 Karten, gerendert mit `tools/cards/build_fr.py`) | „Vector Playing Cards“, Repo `notpeter/Vector-Playing-Cards` (Commit 72cb5b2) | Byron Knoll | Public Domain | https://github.com/notpeter/Vector-Playing-Cards |
| `lib/trystero.js` (darin enthalten) | `@noble/secp256k1` 3.2.0 | Paul Miller | MIT | https://github.com/paulmillr/noble-secp256k1 (Lizenztext: `lib/licenses/LICENSE-noble-secp256k1.txt`) |

Die Icons (`icons/`) sind eigene Gestaltung; als Hintergrund dient die oben genannte CC0-Holztextur.
Details zur Aufbereitung der Texturen: `assets/wood/SOURCES.json` (Poly-Haven-API-Belege, md5 der Rohdateien).

## Regelquellen (keine Dateien übernommen)
- de.wikipedia „Mühle (Spiel)“ und „Dame (Spiel)“
- strategy-games.de (deutsche Dame, Kurze Dame)
- FIDE-Schachregeln (über chess.js)
- de.wikipedia „Schnapsen“, „Halma“; en.wikipedia „Chinese checkers“; Standardregeln Backgammon und Blackjack
- FMJD-Regeln (internationale Dame: Mehrheits-Schlagzwang, fliegende Dame, 25-Züge-Regel)

## Netz
Öffentliche Nostr-Relays (`src/net/relays.js`) dienen nur als Vermittlung bzw. Relay-Fallback; es werden keine
Inhalte der Relays übernommen.

## Eigener Code
MIT-Lizenz, © 2026 Peter Kalmar.

# Quellen und Lizenzen der Spielkarten-Grafiken

## `de/` – Doppeldeutsche Karten (tschechisches Bild, 20 Schnapskarten)

Ausgeschnitten, entzerrt und farbkorrigiert aus vier Fotos auf Wikimedia Commons
(Skript: `tools/cards/crop_de.py`, Ecken: `tools/cards/corners.json`):

| Farbe | Commons-Datei | Beschreibungsseite |
|---|---|---|
| Herz (H) | File:Červené v kartách.jpg | https://commons.wikimedia.org/wiki/File:%C4%8Cerven%C3%A9_v_kart%C3%A1ch.jpg |
| Schellen (S) | File:Kule v kartách.jpg | https://commons.wikimedia.org/wiki/File:Kule_v_kart%C3%A1ch.jpg |
| Laub (L) | File:Zelené v kartách.jpg | https://commons.wikimedia.org/wiki/File:Zelen%C3%A9_v_kart%C3%A1ch.jpg |
| Eichel (E) | File:Žaludy v kartách.jpg | https://commons.wikimedia.org/wiki/File:%C5%BDaludy_v_kart%C3%A1ch.jpg |

Lizenzbeleg (Commons-API `prop=imageinfo&iiprop=extmetadata`, abgefragt 2026-09-29),
für alle vier Dateien identisch:

- Artist: Zákupák (https://commons.wikimedia.org/wiki/User:Z%C3%A1kup%C3%A1k)
- Credit: Own work
- LicenseShortName: Public domain; License: `pd`; UsageTerms: Public domain
- DateTimeOriginal: 2011-11-20

Dateischema: `de/<Farbe><Rang>.webp` (240 px breit) und `de/<Farbe><Rang>@2x.webp` (480 px),
Farbe H/S/L/E, Rang A (Daus), Z (Zehner), K (König), O (Ober), U (Unter).

## `fr/` – Französische Karten (52 Karten, Blackjack)

Gerendert aus den SVGs von https://github.com/notpeter/Vector-Playing-Cards
(Ordner `cards-svg/`, Commit `72cb5b288ed61251ef344e369446687cd51281a4`),
Skript: `tools/cards/build_fr.py`. Ursprung: Byron Knoll, „vector-playing-cards“
(http://www.byronknoll.com/, https://code.google.com/p/vector-playing-cards/).

Lizenzsatz aus der README des Repos (wörtlich):

> These images, scripts and subsequent transformational output (e.g. custom sized PNGs) are released into the public domain or optionally licensed under the [WTFPL][2] in juristictions where the public domain is not a recognized legal concept.  Either way, do as you see fit: relicense, embed in commercial, non-commercial or open-source software, etc.
>
> The original source images were released by [Byron Knoll][3] into the public domain on Google Code as [vector-playing-cards][4] .

Dateischema: `fr/<Rang><Farbe>.webp` (240 px) und `fr/<Rang><Farbe>@2x.webp` (480 px),
Rang A 2 3 4 5 6 7 8 9 T J Q K, Farbe S H D C (z. B. `AS.webp`, `TH@2x.webp`).

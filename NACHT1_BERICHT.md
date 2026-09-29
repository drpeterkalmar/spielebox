# Spielebox – Bericht Nacht 1 (28./29.09.2026)

**Live:** https://drpeterkalmar.github.io/spielebox/ · **Repo:** https://github.com/drpeterkalmar/spielebox (öffentlich, MIT)
**Stand:** Nacht-1-Umfang komplett, alle Tests grün, live geprüft. Gate (Netz-E2E) bestanden.

Wichtig vorab: Die Nacht wurde gegen 02:40 von einem Netz-/Server-Ausfall unterbrochen und lief erst um 10:40 weiter.
Alles, was bis 02:40 fertig war, war schon live. Die letzten Prüfungen (Netz-E2E, Live-Test) sind von 10:40–10:50 nachgeholt.

## Was geht
- **Lobby:** Name, „Tisch aufmachen“ (Mühle oder Dame, Dame mit Umschalter und Hausregeln, Farbe Weiß/Schwarz/Zufall),
  „Beitreten“ mit 3 Feldern und Vorschlägen, „Zuschauen“, „Weiterspielen“ (laufende Tische und Solo-Partien).
- **3 Wörter:** groß zum Diktieren, dazu „Teilen“ (Android-Teilen-Menü) und „Kopieren“. Die Wörter stehen im `#`-Teil des Links.
  - Die Reihenfolge ist egal, weil die Wörter vor dem Hashen sortiert werden. Das habe ich bewusst eingebaut, weil man beim Diktieren leicht die Reihenfolge vertauscht.
  - Der Preis: 1024³/6 ≈ 179 Mio. Kombinationen statt 1 Mrd.
  - Tippfehler und gleich klingende Schreibweisen werden erkannt, z. B. „mehr“ → „Meer“.
- **Wortliste:** 1024 selbst erstellte Nomen. Keine Umlaute, kein ß, kein Gleichklang (eigener Klangschlüssel), und kein Wort ist Anfang eines anderen.
  - Die Sperrliste im Test hat 62 Gleichklang- und 36 Präfix-Paare, der Test ist grün.
  - Zusätzlich raus sind am Telefon verwechselbare Paare wie mond/mund oder gabel/kabel.
- **Netz:** Trystero 0.25.4 gebündelt (`lib/trystero.js`, 62 KB, kein CDN). Der Gastgeber ist Schiedsrichter und prüft jeden Zug mit derselben Engine.
  - **Wiederaufnahme:** Nach Reload, Tab zu oder Akku leer einfach dieselben Wörter eingeben oder „Weiterspielen“ antippen.
  - **Relay-Fallback:** AES-GCM, Schlüssel per PBKDF2 aus den Wörtern, 6 gemessene Relays parallel (`?relay=1` erzwingt ihn).
  - **Automatischer Fallback:** Er springt an, wenn der Gastgeber bzw. Mitspieler 12 s nicht direkt erreichbar ist oder Trystero „could not connect“ meldet.
  - **Statusanzeige:** direkt verbunden (grün), über Relay (gelb), getrennt (rot, mit Knopf „Wiederverbinden“), wartet.
  - **Wiederverbinden:** Hilft das Neuverbinden nach 12 s nicht, lädt die Seite neu. Der Stand bleibt dabei erhalten.
  - **Host-Ausfall:** Fehlt der Gastgeber 45 s und ist noch jemand am Tisch, übernimmt ein sitzender Mitspieler. Kommt der Gastgeber zurück, ordnet er sich unter.
- **Mühle:** Regeln wie bestellt. Dazu die Hausregel „50 Züge ohne Mühle = Remis“ gegen endlose Partien; sie ist im Regeltext so benannt.
- **Dame:** „Deutsch“ 8×8 / „International“ 10×10, Schalter „Kurze Dame“ und „Pusten“ exakt nach Plan.
  - Schlagfolgen tippt man Sprung für Sprung an oder direkt aufs Endfeld.
  - Beim Pusten blinken die pustbaren Steine rot.
- **Übungs-Bots:** Mühle und Dame in 3 Stufen (Web Worker), außerdem „zu zweit an einem Gerät“. Beides läuft auch offline.
- **Bretter:** eigene SVGs mit Poly-Haven-Holz (CC0), Steine mit Schatten und Rille, Damen mit Krone.
  - Letzter Zug markiert, geschlossene Mühle leuchtet, erlaubte Züge beim Antippen.
  - Zug-Animation: Stein gleitet bzw. fällt, geschlagene Steine blenden aus.
  - Für Schwarz ist das Brett gedreht.
- **Touch-Ziele:** Getroffen wird immer der nächste Punkt bzw. das nächste dunkle Feld. Hochformat (Pixel 7): Mühle 57 px, Dame 8×8 66 px, **Dame 10×10 56 px**.
- **PWA:** installierbar, offline (Service-Worker mit Inhalts-Hash als Version), Hoch- und Querformat, Debug-API `window.__box`.

## Gate: Netz-E2E (Playwright, 2 Kontexte in einem Browser, echte öffentliche Relays, **mit ProtonVPN**)
| Szenario | Beitritt | Partie Mühle bis zum Ende | Zug-Latenz | Reload Gast / Host |
|---|---|---|---|---|
| direkt (WebRTC) | 0,8 s | 31 Halbzüge, beide Stände gleich, Zuschauer synchron | Median 85 ms, max 1,2 s* | 1,6 s / 5,4 s |
| Auto-Fallback (Direktweg scheitert) | 12,9 s (Serie 4× 12,6–12,8 s) | 6 Züge, je 0,13–0,27 s | – | – |
| `?relay=1` (nur Relays) | 0,6 s | 33 Halbzüge, beide Stände gleich | Median 63 ms, max 137 ms | 0,3 s / 0,3 s |

\* Frühere Läufe lagen direkt bei 2 ms Median. Die Streuung kommt von der Last auf dem Mac, nicht vom Netz: 0 Relay-Nachrichten im Direkt-Lauf.

Außerdem geprüft:
- Revanche mit getauschten Farben.
- „Host schließt den Tab“: Der Gast zeigt nach 13 s „getrennt“, „Wiederverbinden“ läuft ohne Fehler.
- 0 App-Fehler in allen Kontexten.

**Relay-Erfolgsquote:**
- **Zustellung:** 100 %. Node-Messung der 6 gewählten Relays: je 20/20 Nachrichten, Median 39 ms. Im Spiel kam jeder Zug an, ohne Wiederholung.
- **OK-Bestätigungen:** 167/178 (94 %) im letzten Lauf. In Läufen davor waren es nur 30–70 %: primal, sigit und mom bestätigen die größeren Host-Nachrichten (ganzer Tischstand) oft nicht, liefern sie aber aus.
- **Trystero-Standardliste:** 9 der 28 Relays sind unbrauchbar (tot, bezahlpflichtig, ephemere Events gesperrt). Deshalb gilt die eigene, gemessene Liste (`src/net/relays.js`).

**VPN-Effekte (ehrlich):**
- In einer Störphase (ca. 02:25) scheiterten 6 Relay-Verbindungen. Der Direkt-Beitritt brauchte 46 s, und ein Fallback-Versuch lief erst im zweiten Anlauf durch.
- Ab ca. 02:40 war das Netz ganz weg (Unterbrechung). Danach war alles wieder grün.

**Testaufbau-Hinweis:** Auf diesem Mac nimmt Chrome ohne Kamera-/Mikro-Berechtigung nur die ProtonVPN-Route. Darüber erreichen sich zwei Kontexte nicht, nicht einmal zwei Verbindungen in derselben Seite.
- **Direkt-Szenario:** Die Testkontexte bekommen eine Schein-Berechtigung, dann nutzt Chrome LAN/Loopback.
- **Szenario ohne Berechtigung:** Es zeigt den automatischen Fallback.
- **App:** Sie braucht keine Kamera.

## Weitere Tests (alle grün)
- **Node** (`npm test`, 111 s):
  - Wortliste 32, Krypto 11, Relay-Kanal 15, Mühle-Regeln 28, Dame-Regeln 40, Tisch-Protokoll 11.
  - Mühle-Schwarm: 10 000 Partien, 806 000 Halbzüge, 1 Mio. Fuzz-Züge abgelehnt.
  - Dame-Schwarm: 8 Regelvarianten × 10 000 = 80 000 Partien, 11 Mio. Halbzüge, gegen einen unabhängigen Referenz-Zuggenerator geprüft.
  - Bots Stufe 2 gegen Zufall: 100 %.
- **Rauchtest** (`tests/smoke.py`, 87 Prüfungen): Pixel 7 hoch/quer, Desktop.
  - Mühle schließen und schlagen, Dame-Schläge, Pusten und Bot, alles per echtem Tap.
  - Knöpfe ≥ 48 px, Brett ganz sichtbar, Animation läuft, 0 Fehler.
- **Live** (`tests/test_live.py`):
  - HTTP 200, Version live = lokal.
  - PWA installierbar, offline neu geladen (Dame 10×10 offline spielbar).
  - Teilen-Link füllt die Wörter vor.
  - Echter Beitritt über die Live-Seite in 0,9 s.
- **Screenshots** in `tests/shots/final/` (hoch, quer, Desktop), per Vision gesichtet: Lobby, 3-Wörter-Karte, Mühle, Dame 8×8 und 10×10, Schwarz gedreht.

## Bitte mit einem zweiten Handy testen (Schritt für Schritt)
1. **Handy A** (du): https://drpeterkalmar.github.io/spielebox/ in Chrome öffnen → Name eintragen → „Mühle“ → „Online-Tisch aufmachen“.
2. „Teilen“ antippen und den Link per WhatsApp an Handy B schicken, **oder** die 3 Wörter am Telefon ansagen.
3. **Handy B:** Link öffnen (die Wörter stehen schon drin) bzw. Seite öffnen und die Wörter unter „Beitreten“ eintippen → Name → „Mitspielen“.
4. **Status oben rechts ablesen** und mir melden:
   - „direkt verbunden“ (grün) oder „über Relay“ (gelb)?
   - Am besten dreimal: beide im WLAN, beide über **Mobilfunk**, einmal mit ProtonVPN am Handy.
5. Ein paar Züge spielen, einmal eine Mühle schließen und einen Stein nehmen.
6. **Wiederaufnahme:** Auf Handy B den Chrome-Tab wegwischen, die Spielebox neu öffnen → „Weiterspielen“ antippen. Die Partie muss weitergehen.
7. **Handy A:** 1–2 Minuten sperren, entsperren → verbindet es sich wieder? Falls „getrennt“: „Wiederverbinden“ antippen.
8. **Relay erzwingen:** beide Handys mit https://drpeterkalmar.github.io/spielebox/?relay=1 → Status „über Relay“.
9. **Dame International 10×10 im Hochformat:**
   - Lassen sich die Felder gut treffen?
   - Einmal „Pusten“ einschalten und absichtlich nicht schlagen.
10. **Optional:**
    - ein drittes Gerät mit denselben Wörtern auf „Zuschauen“;
    - „App installieren“ im Chrome-Menü;
    - einmal quer halten.

## Offene Punkte
- **Direktverbindung zwischen zwei echten Handys über das Internet** (STUN/NAT) konnte ich nur auf einem Mac testen. Dein Test mit 2 Handys ist der eigentliche Beleg. Scheitert sie, übernimmt nach ~13 s das Relay.
- **Querformat im Chrome-Tab** mit Adressleiste (~350 px hoch):
  - Dame 10×10 hat dort 47 px Touch-Ziele statt ≥ 48 (10 Reihen in 340 px).
  - Hochformat (56 px) und installierte App (53 px) erfüllen die Vorgabe.
- **Relay-Aussetzer:** Trystero schaltet ein Relay nach mehreren Fehlschlägen innerhalb einer Sitzung dauerhaft ab. Dagegen hilft „Wiederverbinden“: Es lädt notfalls neu.
- **Host-Übernahme** greift nur, wenn außer dem Gastgeber noch jemand am Tisch ist. Einen Platz von einem **anderen** Gerät zurückholen geht noch nicht, weil die Spieler-ID pro Gerät gilt.
- **Grenzen:**
  - Die Bots sind Übungsgegner ohne Eröffnungsbuch.
  - Es gibt noch keine Töne.
  - Die Mühle-Hausregel „50 Züge ohne Mühle“ bitte bestätigen oder streichen.

## Vorschlag für Nacht 2 (laut Plan)
1. **Schach:** chess.js (BSD-2) + cburnett-Figuren (BSD-3, Nennung), Remis anbieten, Aufgeben, PGN-Export, Bedenkzeit optional.
2. **Backgammon:**
   - Hash-Ketten-Würfel (Fair Play) mit Doppler.
   - Eigene Tests für die Pflicht, beide Würfel zu nutzen.
3. **Stern-Halma für 2–6:** Dafür muss der Tisch mehr als 2 Sitze bekommen. Das Protokoll ist schon generisch; nur die Sitzanzahl kommt noch aus dem Spiel.
4. **Klein:**
   - Befunde aus deinem 2-Handy-Test.
   - Knopf „Platz übernehmen“ für ein neues Gerät.
   - Optional Zug-Töne.

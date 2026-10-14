# Spielebox n10 – Feinschliff nach Vorlagen

Stand 14.10.2026 · Version **`b35574f8ac`** (live, `package.json` 0.10.0) · Spielen: https://drpeterkalmar.github.io/spielebox/
Grundlage: internes Vorlagen-Datenblatt (Clean-Room, nur Abläufe und Zahlen, kein Code, keine Namen); Kurzfassung in
[VORLAGEN.md](VORLAGEN.md). Umgesetzt: alle Etappen E0–E4 in der vorgeschlagenen Reihenfolge, jede als eigener Release.

## Kurz (in Alltagssprache)

- **Man hört jetzt jeden Zug – leise.** Steine klacken beim Landen, Schlagen klingt tiefer mit einem zweiten Klick,
  Karten wischen, Würfel rattern, Wasser platscht bei Schiffe versenken. In allen 15 Spielen. Höchstens ein Ton alle
  0,12 Sekunden, alles im Mittelton und gut 12 dB unter der lautesten Stufe. Lautlos-Schalter am Handy gilt, und unter
  *Einstellungen → Ton* lässt sich alles abschalten.
- **Vibration nur bei großen Momenten:** eigener Sieg, „Schach!“, Mühle oder Rauswurf gegen dich, Schiff versenkt –
  kurz (30–35 ms), höchstens alle 1,5 s, abschaltbar. Am iPhone gibt es (Apple-bedingt) keine Vibration.
- **Spielzeug am Rand:** Wer auf den Holzrand tippt, hört ein „Tock“ und sieht ein paar Staubkörnchen. Nur, wenn der
  Tipp sonst nichts bewirkt hätte.
- **Ziehen statt nur Tippen:** Figuren (Schach, Dame, Mühle) und Karten (Schnapsen: nach oben in die Mitte, Mau-Mau:
  auf die Ablage) lassen sich mit dem Finger ziehen. Das Stück folgt dem Finger, neigt sich mit dem Tempo, am Start bleibt
  ein blasses Geisterbild, beim Loslassen „ploppt“ es ein. Antippen–Antippen geht wie bisher. Hold'em: die eigenen
  Karten lassen sich anfassen und springen zurück.
- **Kein verlorener Tipp mehr:** Tippt man, während der Computer noch zieht, wird der Tipp danach ausgeführt.
- **Online fairer und netter:**
  - **Revanche ist ein Angebot**: Der andere sieht „Ben möchte eine Revanche“ und einen pulsierenden Knopf
    „Revanche annehmen“ (oder „Nein danke“). Das Angebot gilt 60 s. Gegen den Computer: sofort wie bisher.
  - **6 Reaktionen** (😊 oben: 👋 Hallo, 👍 Guter Zug, 😮 Oha, 😅 Hoppla, 🙏 Danke, 🎉 Glückwunsch) als kleine
    Sprechblase über der Leiste. Kein freier Text; höchstens eine alle 3 s; abschaltbar.
  - **Computer springt ein**: Ist jemand 60 s lang weg, spielt der Computer (mittel) für ihn weiter – die Partie bricht
    nie ab. Kommt er zurück, spielt er sofort selbst weiter. In der Leiste steht dann „Computer vertritt“.
  - **Bedenkzeit** für Schach, Dame, Mühle, Reversi und Vier gewinnt: 3+2, 5+3, 10+5, 15+10 (Minuten + Sekunden je
    Zug), Standard „ohne“. Online kann man dem Gegner „+15 s“ schenken.
- **Würfel mit Spannung:** Die Augen wechseln erst schnell, dann rollt der Würfel aus (die letzten drei Wechsel
  120 → 180 → 260 ms). Die Dauer bleibt gemütlich 1,0 s. Eine Sechs bei Ludo bekommt einen kleinen Funkenring und Ton.
- **Auszeichnungen am Ende:** Ludo „Meiste Rauswürfe“ und „Meiste Sechsen“, Würfelglück „Höchster Wurf“, Mau-Mau
  „Meiste Siebener“. Gleichstand → alle. Ändert nie das Ergebnis.
- **Computer:**
  - Schnapsen „stark“ merkt sich die gespielten Stiche (wie ein aufmerksamer Spieler) und rechnet das Ende des
    Spiels exakt durch. Gegen die alte starke Stufe gewinnt er **62 %** der Partien.
  - Die **leichte Stufe** macht jetzt menschliche Fehler: Sie übersieht in 15 % der Fälle einen Schlag oder Gewinnzug
    und spielt dann den besten anderen Zug – nie absichtlich etwas Dummes.
- **Statistik** dieses Geräts unter *Einstellungen*: Siege, Niederlagen, Remis und längste Serie je Spiel und Gegner,
  zurücksetzbar.

**Ehrlich:**
- Der erste Versuch „Schnapsen exakt“ brachte nichts (49 %). Ohne Gedächtnis sind die gegnerischen Stiche auch am
  Ende unbekannt, die „exakte“ Rechnung bleibt dann Raten. Erst mit dem Gedächtnis kamen die 62 %.
- Seit E3 stand in Spielerleisten ohne Uhr rund 35 Minuten lang (08:56–09:30) das Wort „null“. Ich habe es beim Bild-Ansehen in E4
  bemerkt und sofort als eigenen Hotfix (`b981a74`) live gebracht.

## Regler (URL, „0“ = Verhalten vor n10)

| Regler | Wirkung | Standard |
|---|---|---|
| `?ton=0` | keine Klänge (wie Einstellung „Ton aus“) | an |
| `?haptik=0` | keine Vibration (wie Einstellung „Vibration aus“) | an |
| `?spielzeug=0` | kein Tock/Staub am Brettrand | an |
| `?ziehen=0` | nur Tippen, kein Ziehen | an |
| `?emotes=0` | keine Reaktionen (wie Einstellung „Reaktionen aus“) | an |
| `?vertretung=60` | Sekunden bis zur Computer-Vertretung, `0` = aus | 60 |
| `?ausrollen=0` | Würfel-Augen wechseln gleichmäßig wie bisher | an |
| `?ehrung=0` | keine Auszeichnungen am Ende | an |
| `?fehler=0.15` | Fehlerquote der leichten Stufe, `0` = wie bisher | 0,15 |
| Tisch-Option „Bedenkzeit“ | ohne / 3+2 / 5+3 / 10+5 / 15+10 | ohne |

Beispiel: https://drpeterkalmar.github.io/spielebox/?ziehen=0&ton=0

## Messtabelle: Vorlage-Ziel / vorher / nachher

| # | Messgröße | Vorlage-Ziel | vorher (n9) | nachher (n10) |
|---|---|---|---|---|
| 1 | Ton je Zug | 15/15 Spiele, ≤ 1 Ton je 120 ms, Spitze ≤ −12 dBFS, Hauptenergie 300–700 Hz | 1/15 (nur Hold'em-Chips) | **15/15** (Browser gezählt); kleinster Abstand 121 ms; Spitze −23,5 … −32,8 dBFS; Anteil 300–700 Hz: 65–100 % (Karte 65 %, Tock 82 %, Platsch 86 %, Sechs 78 %, sonst ≥ 95 %) |
| 2 | Ziehen | Tippen < 6 px nie Ziehen, ≥ 98 % richtig gelandet | nur Tippen | Wackeln 5 px (Finger) / 2,5 px (Maus) bleibt Tipp; **30/30** Schachzüge je Form mit ±30 % Feld-Streuung richtig (hoch, quer, Desktop) |
| 3 | Animationsdauer | eigene 200–260 ms, Computer gemütlich 600 ms | 230 / 600 ms | unverändert 230 / 600 ms (`tempo.test.mjs`) |
| 4 | Revanche | online nie ohne Annahme, gegen Computer 1 Tipp | sofort, einseitig | Angebot + Annahme (Node + E2E über echte Relays); Computer/ein Gerät: 1 Tipp |
| 5 | Vertretung | nach 60 ± 2 s, Rückkehr ≤ 1 Zug, 0 Abbrüche in 50 Läufen | gab es nicht (nur Hold'em: Auto-Check) | **59,9 s** (E2E, echte Relays), Rückkehr nach 0,5 s, danach zieht Ben selbst; **50/50** Läufe regulär beendet (Node) |
| 6 | Reaktionen | ≤ 1 je 3 s, nur 6 feste Werte, Schiedsrichter prüft | – | Node: Fälschungen (Wert 9, Text, Flut) abgewiesen, Zuschauer nicht; E2E: zweite in 3 s kommt nicht an |
| 7 | Schnapsen-Stärke | Stufe 3 neu gegen alt ≥ 55 % | 50 % | **62,3 %** aus 1 200 Partien (3 × 400: 62,7 / 61,8 / 62,3 %; 95 %-Intervall gesamt ≈ 59–65 %) |
| 8 | Stufen-Abstand | 2 schlägt 1 ≥ 70 %, 3 schlägt 2 ≥ 60 % (Glück ≥ 55 %) | siehe unten | siehe unten – **2 Spiele verfehlt** (schon vor n10) |
| 9 | Würfel-Spannung | gemütlich 1,0 ± 0,1 s, letzte 3 Wechsel länger | gleichmäßig in den ersten 0,6 s | Plan 60 … 380, 500, 680, 940 ms (Node genau); Browser 14/14 Computer-Würfe 821–988 ms, Auslauf länger |
| 10 | Ehrungen | Ergebnis identisch mit/ohne | – | **10 000** Zufallspartien: Ergebnis und Endstellung identisch; 13 297 Ehrungen, 1 946 geteilt |
| 11 | Leistung | Bildkosten ≤ n9 · 1,05; Ladegröße ≤ +40 KB gzip | siehe unten | siehe unten |

**Messgröße 8 – Selbstspiel** (`tools/selfplay.mjs`, je 100 Partien mit Platztausch, Rechenzeit 1/10 der App;
`docs/n10/selfplay_vorher.json` / `selfplay_nachher.json`):

| Spiel | 2 : 1 vorher → nachher | 3 : 2 vorher → nachher |
|---|---|---|
| Mühle | 100 → 100 % | 98 → 98 % |
| Dame | 100 → 100 % | 100 → 100 % |
| Schach | 100 → 99,5 % | 72 → 70,5 % |
| Schnapsen | 100 → 100 % | **90 → 97 %** |
| Backgammon | 88 → 89 % | **49 → 49 %** ✗ |
| Halma | 100 → 100 % | 100 → 100 % |
| Ludo | 82 → 85 % | 62 → 59 % |
| Schiffe | 99 → 99 % | 76 → 76 % |
| Vier | 99 → 99 % | 85,5 → 86,5 % |
| Mau-Mau | 72 → 72 % | 67 → 61 % (Rauschen, ±9 %) |
| Würfelglück | 84 → 84 % | 60,5 → 60,5 % |
| Reversi | 100 → 100 % | 100 → 100 % |
| Paare | 96 → 96 % | **53,5 → 53,5 %** ✗ |

Backgammon (3 gegen 2) und Paare (3 gegen 2) verfehlen das Abstands-Ziel, und zwar schon vor n10. Das liegt an diesen
Computern, nicht an n10. Ich habe es nicht angefasst, weil das Datenblatt dafür keine Mechanik vorsieht. Vorschlag:
eigener kleiner Auftrag (Backgammon Stufe 3 mit 2-Zug-Vorschau, Paare Stufe 3 mit vollständigem Gedächtnis).

**Messgröße 11 – Leistung** (Pixel 7, CPU 4× gedrosselt; `tests/deko_perf.py --alt` mit n9-Stand `e724841` als
Worktree, vorher/nachher abwechselnd in einem Lauf; Rohdaten `docs/n10/perf_n10_*.json`):

| Szene | Bildkosten p95 hoch | Bildkosten p95 quer |
|---|---|---|
| Lobby, Leerlauf | 0,10 → 0,10 ms | – |
| Vier gewinnt, Konfetti-Sieg | 2,90 → 2,45 ms | 3,30 → 2,95 ms |
| Schnapsen, Karten spielen | 2,55 → 2,65 ms (+4 %, 4 Wdh.; erster Lauf 3,45 = Ausreißer) | 3,00 → 3,15 ms (+5 %) |
| Halma, viele Steine | 3,75 → 3,95 ms (+5 %) | 4,80 → 4,40 ms |

Ladegröße: Vorab-Cache (offline) 3 372 → **3 396 KB gzip (+24 KB)**, 151 → 158 Dateien. Lobby beim ersten Öffnen
633 → 655 KB gzip (+22 KB, 101 → 109 Anfragen; dreimal gleich gemessen). Der Messlauf zeigte einmal +134 KB; das waren
zeitabhängig mitgezählte Nachlade-Dateien (Gegenprobe mit fester Liste). Ziel ≤ +40 KB: erfüllt.
Keine neue Dauer-Animation: Uhr tickt nur, solange eine Bedenkzeit läuft; Lobby CPU 0,2 → 0,1 %.

## Was in welcher Etappe passiert ist

- **E0** (`030b762`): `VORLAGEN.md` (Vorlagen nur als „Vorlage A … I“), `tools/selfplay.mjs` (Selbstspiel aller
  Stufen), Messung vorher.
- **E1** (`9a96ad6`): `src/movesound.js` (welcher Ton wann, testbar ohne Browser), `src/ui/sound.js` (alle Klänge als
  `synth()`, auch offline renderbar), `src/ui/haptik.js`, `src/ui/spielzeug.js`; Einstellungen „Ton“, „Vibration“.
  Fund unterwegs: Mühle nimmt Tipps am Rand für den nächsten Punkt. Darum reagiert das Spielzeug nur, wenn das Brett
  nach dem Tipp unverändert ist.
- **E2** (`f178e16`): Ziehen zentral in `onTap` (`src/ui/svg.js`, `src/ui/drag.js`): Ziehen = „Stück antippen“ +
  „Ziel antippen“. So entscheidet jedes Spiel mit seiner bewährten Logik, und Tippen bleibt unverändert. Nach einem
  gezogenen Zug gleitet das Stück nicht noch einmal vom Start. Brett mit Ziehen: `touch-action: none` (in der Halma-Lupe
  bleibt Schieben möglich).
- **E3** (`2e01c1b`, Hotfix `b981a74`): `src/net/extras.js` (Revanche, Reaktionen, Vertretung, Uhr) im
  Schiedsrichter-Protokoll. Vertretene Plätze bekommen ihre Zufallskette vom Gastgeber (sonst wartete jeder Wurf 12 s).
  Die Frist läuft ab dem Verbindungsabbruch, nicht ab der letzten Nachricht (erster E2E: 54,9 s, danach 59,9 s).
  Der Gastgeber sieht bei Vertretung nicht mehr „Verbindung weg / Wiederverbinden“, sondern „Mitspieler weg“.
- **E4** (`3d1e264`): `tempo.diceSchedule`, `src/ehrung.js`, `src/games/fehler.js`, Schnapsen-Gedächtnis + exakte
  Endphase (`solve()`, gegen Vollsuche auf 300 Stellungen geprüft, Ø 0,4 ms), Statistik (`sb.stats`). „Wer gewinnt?“ ist
  nach Partie-Ende ausgeblendet (machte im Querformat Platz für die Auszeichnungen).

## Nicht gemacht (bewusst)

- Öffentlicher Lobby-Raum: weggelassen (Entscheidung Hermes, Zutritt bleibt per drei Wörter).
- Aufhol-Regeln: weggelassen (ändern die Regeln).
- Wirkung 2 laut Datenblatt, nicht umgesetzt: Vorab-Zug (Schach/Vier), Zeitbank Hold'em, Vier-Farben-Blatt,
  ISMCTS-Versuch für Mau-Mau/Schnapsen. Umgesetzt aus Wirkung 2, weil billig: Eingabe-Puffer, Haptik, Brett-Spielzeug.
- Echte Handys: alles mit Pixel-7-Emulation (hoch/quer) und Desktop getestet, nicht auf echten Geräten.

## Handy-Testhinweise für Peter

1. **Ton:** Ein Spiel gegen den Computer, Handy *nicht* lautlos. Jeder Zug klackt leise. Lautlos-Schalter → still.
   *Einstellungen → Ton: aus* → still.
2. **Vibration (Android):** Schach gegen „leicht“ spielen, bis der Computer Schach gibt → kurzes Summen. Gewinnen →
   kurzes Summen.
3. **Spielzeug:** In Mühle auf die Holzecke tippen → „Tock“ und Staub.
4. **Ziehen:** Schach: Bauer mit dem Finger von e2 nach e4 ziehen. Schnapsen: Karte nach oben in die Tischmitte ziehen.
   Kurz antippen funktioniert weiter.
5. **Online (zwei Handys):** Schach mit Bedenkzeit 5+3 aufmachen. 😊 oben → 👍 schicken. Ein Handy in den Hintergrund
   legen bzw. WLAN aus. Nach etwa einer Minute spielt der Computer für es weiter. Zurück → man spielt selbst weiter. Am
   Ende „Revanche anbieten“, auf dem anderen Handy „Revanche annehmen“.
6. **Würfel:** Ludo gegen den Computer, Tempo gemütlich – der Würfel des Computers rollt sichtbar aus. Am Ende:
   Auszeichnungen unter der Status-Zeile. *Einstellungen → Statistik*.

## Tests

- Node: `npm test` komplett grün (Schnell-Suite 279 s; alle Schwärme einzeln grün, inkl. neuem
  `ehrung.swarm.test.mjs` mit 10 000 Partien). Neu: `klang`, `drag`, `online`, `spannung`, `schnapsen_exakt`.
  Angepasst: `table.test.mjs` (Revanche nimmt der andere an).
- Browser (stumm, `--mute-audio`): `smoke_n10.py klang|ziehen|online|spannung` grün. Regression grün: `smoke.py`,
  `smoke_n2–n6`, `test_nav.py`, `test_ludo_dice_anim.py`.
  - `smoke_n5.py`: ein schon vor n10 bestehender Wettlauf im Test („Neues Turnier“ wird gerade neu gezeichnet) –
    auf dem n9-Stand nachgestellt, im Test mit Wiederholung behoben.
- Netz: `e2e_n10.py` (3 Geräte, echte Relays) grün; `e2e_net.py --nur-direkt` grün (nimmt die Revanche jetzt an).
- Live: `test_live.py` nach jeder Etappe grün.
- Bilder (selbst angesehen): `tests/shots/n10/e1_e3_collage_hoch.jpg` (Spielzeug, Einstellungen, Bedenkzeit, Uhr),
  `e2_collage_hoch.jpg` (Ziehen: Geisterbild + Figur bzw. geneigte Karte), `e3_collage_hoch.jpg` (Reaktion,
  Vertretung, Revanche-Angebot), `e4_collage.jpg` (Würfel-Bildfolge, Auszeichnung, Statistik).

## Recht

Clean-Room: gearbeitet nur aus dem Datenblatt. Keine Vorbild-Quelle geöffnet, kein Code, keine Assets, keine Klänge
(alle Töne werden in der App erzeugt), keine Namen von Vorbildern in Spiel, Code, Commits oder diesem Bericht (dort nur
„Vorlage A … I“). Emoji kommen aus der Systemschrift.

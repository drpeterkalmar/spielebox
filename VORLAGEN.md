# Vorlagen für den Feinschliff (n10) – Kurzfassung

Stand 14.10.2026. Grundlage ist ein internes Datenblatt (Clean-Room): Aus quelloffenen Spiel-Engines, dokumentierten
Online-Plattformen und Vorträgen wurden **nur Abläufe und Zahlen** in eigenen Worten übernommen. Kein Code, keine
Grafiken, keine Klänge, keine Namen. Die Vorbilder heißen hier nur „Vorlage A, B, …“.

| Vorlage | Art | Was wir daraus lernen |
|---|---|---|
| A | quelloffener Online-Schachserver | Revanche als Angebot, Zeit schenken, Fischer-Bedenkzeit |
| B | quelloffenes Schachbrett-Modul | Zug-Animation ≈ 200 ms, Ziehen ab 3 px, Geisterfigur am Start |
| C | quelloffene Patience-Sammlung | Karten fliegen 0,15–0,6 s, Eingaben während der Animation nicht verlieren |
| D | Bibliothek für Spiel-KI | Baumsuche mit Stichproben: Konstante, Zahl der Simulationen |
| E | Lehrplattform für Schnapsen-KI | Spielphase 2 (Talon leer) exakt durchrechnen |
| F | Entwickler-Doku einer Brettspiel-Plattform | Ausgestiegene Spieler vertreten (Stufe „gierig“), Partie nie abbrechen |
| G | Partyspiel-Wiki | Würfel-Spannung, Auszeichnungen am Ende (ändern nie das Ergebnis) |
| H | Vortrag über greifbare Spieloberflächen | Karten heben/neigen sich, landen mit Gewicht; feste Kurz-Reaktionen statt Chat |
| I | übliche Poker-Bedienung | Zeitbank, Vorab-Knöpfe, Vier-Farben-Blatt |

## Was übernommen wird (Wirkung ≥ 3, Reihenfolge der Etappen)

| Etappe | Mechanik | Startwert | Regler |
|---|---|---|---|
| E1 | Zug- und Karten-Klänge in allen 15 Spielen | Klack 400–600 Hz/60 ms, Schlagen tiefer + 2. Klick, Karte „Wisch“ 80 ms, Würfel 3–5 Klicks, höchstens 1 Ton je 120 ms | Einstellung „Ton“, `?ton=0` |
| E1 | Haptik nur bei großen Momenten | 35 ms eigener Sieg, 30 ms bei Schach/Mühle/Rauswurf gegen mich, Abstand ≥ 1,5 s | Einstellung „Vibration“, `?haptik=0` |
| E1 | Brett-Spielzeug | Rand antippen → Holz-„Tock“ + 6 Staubkörner, höchstens 1 je 0,5 s | `?spielzeug=0` |
| E2 | Ziehen statt nur Tippen (Tippen–Tippen bleibt) | Ziehen ab 3 px (Finger 6 px), Geisterbild am Start, Neigung ±8°, Landung 120 ms (1,06 → 1) | `?ziehen=0` |
| E2 | Tipp während einer Animation | wird gemerkt (höchstens 1) statt verworfen | – |
| E3 | Revanche als Angebot (online) | Angebot 60 s sichtbar, Knopf beim Gegner pulsiert; gegen Computer sofort | – |
| E3 | Reaktionen | 6 feste: 👋 👍 😮 😅 🙏 🎉, 1 je 3 s, Blase 2,5 s, stummschaltbar | `?emotes=0` |
| E3 | Vertretung bei Verbindungsabbruch | nach 60 s spielt der Computer (Stufe 2) für den Platz, Rückkehr übernimmt sofort | `?vertretung=60` (0 = aus) |
| E3 | Bedenkzeit (Fischer) für Schach, Dame, Mühle, Reversi, Vier | Standard aus; 3+2, 5+3, 10+5, 15+10; „+15 s schenken“ | Tisch-Option |
| E4 | Würfel-Spannung | die letzten 3 Wechsel 120 → 180 → 260 ms, gemütlich gesamt 1,0 s | `?ausrollen=0` |
| E4 | Auszeichnungen am Ende | Ludo, Würfelglück, Mau-Mau; nur Anzeige | `?ehrung=0` |
| E4 | Schnapsen: Phase 2 exakt | Talon leer → vollständige Suche | – |
| E4 | Kinder-Stufe mit menschlichen Fehlern | Stufe 1 übersieht 15 % der Schläge/Gewinnzüge | `?fehler=0.15` |
| E4 | Statistik je Gerät | Siege/Niederlagen/Remis je Spiel und Gegner, längste Serie | Einstellungen → zurücksetzen |

**Weggelassen:** Aufhol-Regeln (ändern die Regeln), öffentlicher Lobby-Raum (Zutritt bleibt per drei Wörter).
Wirkung 2 (nur wenn billig mitzunehmen): Vorab-Zug, Zeitbank Hold'em, Vier-Farben-Blatt, ISMCTS-Versuch.

## Messgrößen (Ziel)
1. 15/15 Spiele mit Zug-Ton, ≤ 1 Ton je 120 ms, Spitze ≤ −12 dBFS, Hauptenergie 300–700 Hz.
2. Tippen < 6 px wird nie Ziehen; Ziehen landet in ≥ 98 % richtig.
3. Animationen unverändert (eigene 230 ms, Computer gemütlich 600 ms).
4. Online-Revanche nie ohne Annahme; gegen Computer 1 Tipp.
5. Vertretung nach 60 ± 2 s, Rückkehr übernimmt in ≤ 1 Zug, keine Partie bricht ab.
6. Reaktionen ≤ 1 je 3 s, nur die 6 festen Werte (Schiedsrichter prüft).
7. Schnapsen Stufe 3 neu gegen alt ≥ 55 %.
8. Stufe 2 schlägt 1 in ≥ 70 %, Stufe 3 schlägt 2 in ≥ 60 % (Glücksspiele ≥ 55 %).
9. Würfel gemütlich 1,0 ± 0,1 s, letzte 3 Wechsel länger als die ersten 3.
10. Ergebnis mit und ohne Auszeichnungen identisch.
11. Bildkosten ≤ n9 · 1,05, Ladegröße + ≤ 40 KB gzip.

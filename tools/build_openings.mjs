// Baut src/trainer/data/openings.js (Eröffnungs-Katalog des Schach-Trainers) vollständig neu.
// Aufruf: node tools/build_openings.mjs
//
// - Die Linien (Zugfolgen, deutsche Namen, Ideen, Hinweise) stehen unten in diesem Skript.
// - Namensquelle: lichess-org/chess-openings (CC0 1.0), auf einen Commit gepinnt. Die TSV-Dateien a–e
//   werden einmal nach tools/.cache/ geladen (nicht im Repo) und danach nur noch aus dem Cache gelesen.
// - Jede Linie wird mit chess.js gespielt (illegaler Zug = Abbruch). eco/lichess/lichessPly ist der
//   lichess-Eintrag, dessen Stellung (EPD = FEN ohne Zugzähler) am tiefsten in der Linie vorkommt –
//   Zugumstellungen werden so mit erkannt.
// - Hinweise (notes) werden hier mit Zugnummer + SAN geschrieben ('4.c3', '9...h6') und beim Bauen
//   gegen die Linie geprüft; in der Datendatei stehen sie als 0-basierter Halbzugindex.
// - Idempotent: gleicher Commit + gleiche Linien ergeben eine byte-gleiche Datei.
import { Chess } from '../lib/chess.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = {
  repo: 'lichess-org/chess-openings',
  url: 'https://github.com/lichess-org/chess-openings',
  commit: '5a13018164f6bd88f48b3dc31a8e2a39f31a060a',
  fetched: '04.10.2026',
  license: 'CC0 1.0'
};
const CACHE = join(root, 'tools', '.cache', `chess-openings-${SRC.commit.slice(0, 7)}`);
const OUT = join(root, 'src', 'trainer', 'data', 'openings.js');

// ---------------------------------------------------------------------------------------------
// Familien (Reihenfolge = Anzeige-Reihenfolge)
const FAMILIES = [
  { id: 'italienisch', name: 'Italienisch', side: 'w', intro: 'Weiß stellt den Läufer nach c4 und zielt auf den Schwachpunkt f7. Eine der ältesten Eröffnungen – ideal, um Zentrum und schnelle Entwicklung zu lernen.' },
  { id: 'zweispringer', name: 'Zweispringerspiel', side: 'b', intro: 'Schwarz antwortet auf Lc4 mit …Sf6 und greift sofort den Bauern e4 an. Je nach weißer Antwort wird es sehr scharf (4.Sg5) oder ruhig (4.d3).' },
  { id: 'spanisch', name: 'Spanisch', side: 'w', intro: 'Weiß greift mit Lb5 den Springer an, der den Bauern e5 verteidigt. Die wichtigste Eröffnung nach 1.e4 e5 – auf allen Spielstärken.' },
  { id: 'schottisch', name: 'Schottisch', side: 'w', intro: 'Weiß öffnet mit 3.d4 sofort das Zentrum. Klares Figurenspiel statt langer Manöver.' },
  { id: 'vierspringer', name: 'Vierspringerspiel', side: 'w', intro: 'Beide Seiten entwickeln zuerst die Springer. Ruhig und klassisch – gut, um die Grundprinzipien zu üben.' },
  { id: 'koenigsgambit', name: 'Königsgambit', side: 'w', intro: 'Weiß opfert den f-Bauern für schnelles Angriffsspiel auf der f-Linie. Romantisch, scharf und sehr lehrreich.' },
  { id: 'sizilianisch', name: 'Sizilianisch', side: 'b', intro: 'Schwarz antwortet auf 1.e4 mit …c5 und kämpft asymmetrisch um das Feld d4. Die beliebteste Antwort auf 1.e4 – scharf und kampfbetont.' },
  { id: 'franzoesisch', name: 'Französisch', side: 'b', intro: 'Schwarz baut mit …e6 und …d5 ein festes Zentrum. Die Bauernketten bestimmen die Pläne: Man greift die Kette an ihrer Basis an.' },
  { id: 'carokann', name: 'Caro-Kann', side: 'b', intro: 'Schwarz bereitet …d5 mit …c6 vor. So solide wie Französisch, aber der Läufer c8 kommt vor der Bauernkette heraus.' },
  { id: 'skandinavisch', name: 'Skandinavisch', side: 'b', intro: 'Schwarz greift den Bauern e4 sofort mit …d5 an. Einfache Pläne und wenig Theorie – gut für den Einstieg.' },
  { id: 'damengambit', name: 'Damengambit', side: 'w', intro: 'Weiß bietet den c-Bauern an, um den schwarzen Zentrumsbauern d5 wegzulocken. Kein echtes Opfer – der Bauer kommt fast immer zurück.' },
  { id: 'slawisch', name: 'Slawisch', side: 'b', intro: 'Schwarz deckt d5 mit dem c-Bauern statt mit …e6. So bleibt der Läufer c8 frei – eine der solidesten Antworten auf das Damengambit.' },
  { id: 'londoner', name: 'Londoner System', side: 'w', intro: 'Ein Aufbausystem für Weiß: d4, Lf4, e3, c3 – fast gegen jede Verteidigung spielbar. Wenig Theorie, klare Pläne.' },
  { id: 'koenigsindisch', name: 'Königsindisch', side: 'b', intro: 'Schwarz überlässt Weiß zunächst das Zentrum, stellt den Läufer nach g7 und schlägt später mit …e5 zurück. Dynamisch und kampfstark.' },
  { id: 'gruenfeld', name: 'Grünfeld-Indisch', side: 'b', intro: 'Schwarz lässt Weiß ein großes Bauernzentrum bauen und greift es dann mit Figuren und …c5 an.' },
  { id: 'nimzoindisch', name: 'Nimzoindisch', side: 'b', intro: 'Schwarz fesselt mit …Lb4 den Springer c3 und kämpft so um das Feld e4. Eine der angesehensten Verteidigungen gegen 1.d4.' },
  { id: 'damenindisch', name: 'Damenindisch', side: 'b', intro: 'Schwarz kontrolliert e4 mit dem Läufer-Fianchetto auf b7 oder greift c4 mit …La6 an. Die solide Antwort, wenn Weiß Sc3 vermeidet.' },
  { id: 'hollaendisch', name: 'Holländisch', side: 'b', intro: 'Schwarz spielt 1…f5 und kämpft so von Beginn an um das Feld e4 – eine kämpferische Antwort auf 1.d4.' },
  { id: 'englisch', name: 'Englisch', side: 'w', intro: 'Weiß beginnt mit 1.c4 und kontrolliert d5 von der Seite. Flexibel, meist mit dem Läufer auf g2.' }
];

// ---------------------------------------------------------------------------------------------
// Linien. moves = SAN (englisch), durch Leerzeichen getrennt. notes: { 'Zugnummer.SAN': Text }.
const LINES = [
  // Italienisch
  { id: 'it-piano', family: 'italienisch', name: 'Giuoco Piano', side: 'w',
    moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Bd2 Bxd2+ Nbxd2 d5 exd5 Nxd5 Qb3 Nce7 O-O O-O',
    idea: 'Weiß bereitet mit c3 den Vorstoß d4 vor und baut ein breites Bauernzentrum. Schwarz tauscht Läufer und schlägt mit …d5 zurück, damit das Zentrum nicht erdrückend wird.',
    notes: { '4.c3': 'Bereitet d4 vor – der Bauer soll das Zentrum erobern.', '8...d5': 'Der wichtige Befreiungszug: Schwarz greift das weiße Zentrum sofort an.', '10.Qb3': 'Die Dame greift den Springer d5 an und zielt zugleich auf b7.' } },
  { id: 'it-pianissimo', family: 'italienisch', name: 'Giuoco Pianissimo', side: 'w',
    moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O a6 a4 Ba7 Re1 O-O h3 h6 Nbd2 Re8',
    idea: 'Ruhiger Aufbau mit d3: Weiß schützt e4 und manövriert langsam, oft mit dem Springer über d2 und f1 nach g3. Wichtig sind kleine Vorbeugezüge wie a4 und h3.',
    notes: { '5.d3': 'Kein sofortiges d4 – Weiß deckt e4 und hält die Spannung.', '7.a4': 'Verhindert …b5, das den Läufer mit Tempo vertreiben würde.', '9.h3': 'Nimmt dem Läufer c8 das Feld g4 – keine Fesselung des Springers f3.' } },
  { id: 'it-evans', family: 'italienisch', name: 'Evans-Gambit', side: 'w',
    moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 d6 Qb3 Qd7 dxe5 dxe5 O-O Bb6 Ba3 Na5 Nxe5',
    idea: 'Weiß opfert den b-Bauern, um mit c3 und d4 Zeit für Zentrum und Entwicklung zu gewinnen. Dame b3 und Läufer c4 zielen gemeinsam auf f7.',
    notes: { '4.b4': 'Das Gambit: Der Bauer lenkt den Läufer ab, c3 und d4 kommen mit Tempo.', '7.Qb3': 'Doppelangriff auf f7 – Schwarz muss genau verteidigen.', '11.Nxe5': 'Weiß holt den Bauern zurück und behält die aktiveren Figuren.' } },

  // Zweispringerspiel
  { id: 'zs-sg5', family: 'zweispringer', name: 'Springerangriff 4.Sg5', side: 'b',
    moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6 Be2 h6 Nf3 e4 Ne5 Bd6',
    idea: 'Weiß greift mit Sg5 sofort f7 an. Schwarz gibt einen Bauern, vertreibt den Läufer mit …Sa5 und gewinnt mit …h6 und …e4 viel Zeit für die Entwicklung.',
    notes: { '4.Ng5': 'Doppelangriff auf f7 mit Springer und Läufer.', '5...Na5': 'Nicht 5…Sxd5, dann droht Sxf7 (Gebratene Leber). Schwarz greift lieber den Läufer an.', '9...e4': 'Vertreibt den Springer erneut – das ist die Entschädigung für den Bauern.' } },
  { id: 'zs-d3', family: 'zweispringer', name: 'Ruhig mit 4.d3', side: 'w',
    moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Bb3 d6 c3 Na5 Bc2 c5 Re1 Nc6 Nbd2 Re8 Nf1 h6',
    idea: 'Weiß verzichtet auf scharfe Varianten, deckt e4 mit d3 und baut langsam auf. Typisch ist die Springerwanderung d2–f1–g3 wie im Spanier.',
    notes: { '4.d3': 'Deckt e4 und vermeidet die scharfen Linien nach 4.Sg5 oder 4.d4.', '7...Na5': 'Schwarz jagt den starken Läufer – Weiß behält ihn auf c2.', '11.Nf1': 'Der Springer wandert über f1 nach g3 Richtung Königsflügel.' } },

  // Spanisch
  { id: 'sp-geschlossen', family: 'spanisch', name: 'Geschlossene Variante (Tschigorin)', side: 'w',
    moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Na5 Bc2 c5 d4 Qc7 Nbd2',
    idea: 'Weiß setzt mit dem Läufer den Verteidiger von e5 unter Druck und bereitet langsam d4 vor. Schwarz hält e5 fest und spielt am Damenflügel mit …b5 und …c5.',
    notes: { '3.Bb5': 'Greift den Springer an, der den Bauern e5 verteidigt.', '9.h3': 'Verhindert …Lg4, damit d4 in Ruhe vorbereitet werden kann.', '9...Na5': 'Tschigorin-Plan: Der Springer vertreibt den Läufer und macht Platz für …c5.' } },
  { id: 'sp-berlin', family: 'spanisch', name: 'Berliner Verteidigung (Berliner Mauer)', side: 'b',
    moves: 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8 Nc3 Ke8 h3 h5 Bf4 Be7',
    idea: 'Schwarz nimmt den Bauern e4 und tauscht früh die Damen. Im entstehenden Endspiel hat Schwarz das Läuferpaar und eine sehr feste Stellung; der König steht in der Mitte sicher.',
    notes: { '4...Nxe4': 'Schwarz schlägt den Bauern und gibt ihn nach d4 mit Tempo zurück.', '8.Qxd8+': 'Damentausch – die „Berliner Mauer“ ist schon im 8. Zug ein Endspiel.', '9...Ke8': 'Der König geht zurück; Turm und Läufer kommen später ins Spiel.' } },
  { id: 'sp-abtausch', family: 'spanisch', name: 'Abtauschvariante', side: 'w',
    moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6 d4 exd4 Nxd4 c5 Nb3 Qxd1 Rxd1 Bg4 f3 Be6 Nc3 Bd6',
    idea: 'Weiß tauscht den Läufer gegen den Springer und verdirbt die schwarze Bauernstruktur (Doppelbauer auf der c-Linie). Im Endspiel hat Weiß die gesunde Mehrheit am Königsflügel.',
    notes: { '4.Bxc6': 'Schwarz bekommt das Läuferpaar, aber Doppelbauern.', '5.O-O': 'Erst rochieren – danach ist der Bauer e5 wirklich bedroht.', '8...Qxd1': 'Damentausch: Weiß spielt auf das bessere Endspiel.' } },

  // Schottisch
  { id: 'sc-mieses', family: 'schottisch', name: 'Mieses-Variante (4…Sf6)', side: 'w',
    moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4 Ba6 b3 g6',
    idea: 'Weiß tauscht auf c6 und vertreibt den Springer f6 mit e5. Schwarz bekommt Doppelbauern, aber aktive Figuren; die Damen stehen sich auf der e-Linie gegenüber.',
    notes: { '6.e5': 'Raumgewinn mit Tempo – der Springer muss weichen.', '7.Qe2': 'Deckt e5 und neutralisiert den Druck der Dame e7.', '8...Ba6': 'Schwarz fesselt den Bauern c4 an die weiße Dame.' } },
  { id: 'sc-klassisch', family: 'schottisch', name: 'Klassische Variante (4…Lc5)', side: 'w',
    moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Nxc6 Qf6 Qd2 dxc6 Nc3 Be6 Na4 Rd8 Bd3 Bd4 O-O Ne7 c3 Bb6',
    idea: 'Schwarz entwickelt den Läufer aktiv nach c5 und droht mit …Df6 auf f2. Weiß jagt den Läufer mit Sa4, um das Läuferpaar zu bekommen; Schwarz setzt auf schnelle Entwicklung.',
    notes: { '5...Qf6': 'Zwischenzug mit Mattdrohung auf f2.', '8.Na4': 'Der Springer jagt den Läufer c5 – Weiß will das Läuferpaar.' } },

  // Vierspringerspiel
  { id: 'vs-spanisch', family: 'vierspringer', name: 'Spanische Variante', side: 'w',
    moves: 'e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bb4 O-O O-O d3 d6 Bg5 Bxc3 bxc3 Qe7 Re1 Nd8 d4 Ne6',
    idea: 'Beide Seiten entwickeln die Springer symmetrisch. Weiß fesselt mit Lg5 den Springer f6; Schwarz befreit sich mit …De7 und dem Springermanöver d8–e6.',
    notes: { '4.Bb5': 'Spanische Idee: Druck auf den Springer c6.', '8...Qe7': 'Die Dame löst die Fesselung des Springers f6 vorbereitend.', '9...Nd8': 'Der Springer geht über d8 nach e6 und stellt den Läufer g5 zur Rede.' } },

  // Königsgambit
  { id: 'kg-angenommen', family: 'koenigsgambit', name: 'Angenommen (Kieseritzky)', side: 'w',
    moves: 'e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5 Nf6 Bc4 d5 exd5 Bd6 d4 Nh5 O-O',
    idea: 'Weiß opfert den f-Bauern, um die f-Linie und das Zentrum zu öffnen. Schwarz hält den Mehrbauern mit …g5; Weiß bricht die Bauernkette mit h4 auf und rochiert in die offene f-Linie.',
    notes: { '2.f4': 'Das Gambit: Weiß bietet den f-Bauern für schnelles Spiel an.', '4.h4': 'Kieseritzky: Weiß greift die Bauernkette g5–f4 sofort an.', '5.Ne5': 'Der Springer steht im Zentrum stark und zielt auf f7 und g4.' } },

  // Sizilianisch
  { id: 'si-najdorf', family: 'sizilianisch', name: 'Najdorf (Englischer Angriff)', side: 'b',
    moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7 g4 b5 g5 b4',
    idea: 'Mit …a6 hält sich Schwarz alle Pläne offen und nimmt dem Springer das Feld b5. Im Englischen Angriff rochieren beide Seiten entgegengesetzt und stürmen mit Bauern auf den König.',
    notes: { '5...a6': 'Der Najdorf-Zug: kontrolliert b5 und bereitet …e5 oder …b5 vor.', '6...e5': 'Schwarz gewinnt Raum im Zentrum; d5 wird zum Schlüsselfeld.', '11.g4': 'Bauernsturm am Königsflügel – Schwarz antwortet mit …b5 am Damenflügel.' } },
  { id: 'si-drache', family: 'sizilianisch', name: 'Drache (Jugoslawischer Angriff)', side: 'b',
    moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 Bc4 Bd7 O-O-O Rc8 Bb3 Ne5 h4 h5',
    idea: 'Schwarz stellt den Läufer nach g7 – wie ein Drache zielt er über die lange Diagonale auf den weißen Damenflügel. Im Jugoslawischen Angriff rochiert Weiß lang und stürmt mit h4–h5.',
    notes: { '5...g6': 'Der Drachen-Läufer kommt nach g7.', '9.Bc4': 'Der Läufer verhindert …d5 und zielt auf f7.', '12...h5': 'Soltis-Variante: Schwarz bremst den Bauernsturm h4–h5.' } },
  { id: 'si-sweschnikow', family: 'sizilianisch', name: 'Sweschnikow', side: 'b',
    moves: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5 Bxf6 gxf6 Nd5 f5 Bd3 Be6 O-O Bxd5',
    idea: 'Schwarz spielt früh …e5 und nimmt ein Loch auf d5 in Kauf, um schnell aktiv zu werden. Nach dem Tausch auf f6 hat Schwarz das Läuferpaar und den Hebel …f5.',
    notes: { '5...e5': 'Vertreibt den Springer mit Tempo, schwächt aber das Feld d5.', '9.Bxf6': 'Weiß zerstört die Bauernstruktur und kämpft um d5.', '10...f5': 'Gegenschlag gegen das weiße Zentrum.' } },
  { id: 'si-taimanow', family: 'sizilianisch', name: 'Taimanow', side: 'b',
    moves: 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be3 a6 Qd2 Nf6 O-O-O Bb4 f3 Ne5 Nb3 b5',
    idea: 'Schwarz spielt flexibel mit …e6, …Sc6 und …Dc7 und hält die Zentrumsbauern zurück. Gegen den Englischen Angriff kontert Schwarz mit Lb4 und …b5 am Damenflügel.',
    notes: { '5...Qc7': 'Die Dame kontrolliert e5 und die c-Linie.', '8...Bb4': 'Fesselt den Springer c3 und erhöht den Druck auf e4.' } },
  { id: 'si-alapin', family: 'sizilianisch', name: 'Alapin (2.c3)', side: 'w',
    moves: 'e4 c5 c3 d5 exd5 Qxd5 d4 Nf6 Nf3 Bg4 Be2 e6 h3 Bh5 O-O Nc6 Be3 cxd4 cxd4 Be7 Nc3 Qd6',
    idea: 'Weiß verhindert mit c3 die offene Sizilianische und will mit d4 ein volles Bauernzentrum. Schwarz kontert sofort mit …d5; oft bekommt Weiß einen isolierten d-Bauern.',
    notes: { '2.c3': 'Bereitet d4 vor, um nach …cxd4 mit dem Bauern zurückzuschlagen.', '2...d5': 'Schwarz greift e4 an, bevor d4 kommt.', '10.cxd4': 'Isolierter d-Bauer: Schwäche im Endspiel, aber freies Figurenspiel.' } },

  // Französisch
  { id: 'fr-vorstoss', family: 'franzoesisch', name: 'Vorstoßvariante', side: 'b',
    moves: 'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 Be2 cxd4 cxd4 Nh6 Nc3 Nf5 Na4 Qa5+ Bd2 Bb4 Bc3 b5',
    idea: 'Weiß gewinnt mit e5 Raum. Schwarz greift die Bauernkette an ihrer Basis d4 an: …c5, …Sc6, …Db6 und …Sf5 erhöhen den Druck Schritt für Schritt.',
    notes: { '3...c5': 'Angriff auf die Basis der Bauernkette.', '5...Qb6': 'Dritter Angreifer auf d4 und Druck auf b2.', '7...Nh6': 'Der Springer will über h6 nach f5 und d4 noch einmal angreifen.' } },
  { id: 'fr-winawer', family: 'franzoesisch', name: 'Winawer (vergifteter Bauer)', side: 'b',
    moves: 'e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4 Qc7 Qxg7 Rg8 Qxh7 cxd4 Ne2 Nbc6 f4 dxc3',
    idea: 'Schwarz fesselt den Springer c3 und tauscht ihn, um die weiße Bauernstruktur zu schwächen. Im vergifteten Bauern gibt Schwarz die Königsflügelbauern für Gegenspiel im Zentrum.',
    notes: { '3...Bb4': 'Fesselt den Springer, der e4 deckt.', '7.Qg4': 'Die Dame greift g7 an – ohne Läufer f8 ein Schwachpunkt.', '9...cxd4': 'Gegenspiel statt Verteidigung: Schwarz greift das Zentrum an.' } },
  { id: 'fr-tarrasch', family: 'franzoesisch', name: 'Tarrasch-Variante', side: 'b',
    moves: 'e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3 c5 c3 Nc6 Ne2 cxd4 cxd4 f6 exf6 Nxf6 Nf3 Bd6 O-O Qc7',
    idea: 'Weiß stellt den Springer nach d2, damit keine Fesselung mit …Lb4 möglich ist. Schwarz greift die Kette mit …c5 und …f6 an und bekommt aktive Figuren für den Bauern e6.',
    notes: { '3.Nd2': 'Keine Fesselung möglich – dafür steht der Springer dem Läufer c1 im Weg.', '8...f6': 'Der zweite Hebel: Schwarz löst die Bauernkette auf.' } },

  // Caro-Kann
  { id: 'ck-klassisch', family: 'carokann', name: 'Klassische Variante (4…Lf5)', side: 'b',
    moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3 e6 Bd2 Ngf6 O-O-O Be7',
    idea: 'Schwarz bereitet …d5 mit …c6 vor und entwickelt den Läufer nach f5, bevor …e6 ihn einsperrt. Weiß jagt den Läufer mit h4–h5 und gewinnt Raum; Schwarz steht sehr solide.',
    notes: { '1...c6': 'Bereitet …d5 vor, ohne den Läufer c8 einzusperren.', '6.h4': 'Droht h5 mit Läuferfang – Schwarz antwortet mit …h6.', '9...Bxd3': 'Tausch des aktiven weißen Läufers – die schwarze Stellung bleibt kompakt.' } },
  { id: 'ck-vorstoss', family: 'carokann', name: 'Vorstoßvariante', side: 'b',
    moves: 'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3 Nd7 O-O Ne7 c4 dxc4 Na3 Nd5 Nxc4',
    idea: 'Weiß gewinnt mit e5 Raum. Schwarz bringt den Läufer vor …e6 nach f5 – der große Vorteil gegenüber Französisch – und greift die Bauernkette dann mit …c5 an.',
    notes: { '3...Bf5': 'Der Läufer kommt heraus, bevor …e6 ihn einsperrt.', '5...c5': 'Der Hebel gegen d4 – Schwarz spielt den c-Bauern in zwei Schritten.', '8.c4': 'Weiß öffnet das Spiel, solange der schwarze König noch in der Mitte steht.' } },

  // Skandinavisch
  { id: 'sk-da5', family: 'skandinavisch', name: 'Hauptvariante 3…Da5', side: 'b',
    moves: 'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 Bd2 e6 Qe2 Bb4 O-O-O Nbd7 a3 Bxc3 Bxc3 Qc7',
    idea: 'Schwarz schlägt sofort auf d5 und bringt die Dame nach a5. Danach folgen …Sf6, …c6 und …Lf5 – ein solider Aufbau ähnlich wie im Caro-Kann.',
    notes: { '2...Qxd5': 'Die Dame kommt früh heraus – nach Sc3 muss sie wieder ziehen.', '3...Qa5': 'Auf a5 steht die Dame sicher und fesselt den Springer c3, solange d2 frei ist.', '5...c6': 'Gibt der Dame ein Rückzugsfeld und stützt den Aufbau.' } },
  { id: 'sk-sf6', family: 'skandinavisch', name: 'Moderne Variante 2…Sf6', side: 'b',
    moves: 'e4 d5 exd5 Nf6 d4 Nxd5 Nf3 g6 c4 Nb6 Nc3 Bg7 h3 O-O Be3 Nc6 Qd2 e5 d5 Ne7',
    idea: 'Schwarz schlägt erst mit dem Springer auf d5 zurück und entwickelt dabei eine Figur. Weiß baut mit c4 ein großes Zentrum, Schwarz greift es mit dem Läufer g7 und …e5 an.',
    notes: { '2...Nf6': 'Schwarz holt den Bauern später mit dem Springer zurück.', '5.c4': 'Weiß vertreibt den Springer und baut ein großes Zentrum.', '9...e5': 'Der typische Gegenstoß gegen das Zentrum.' } },

  // Damengambit
  { id: 'dg-angenommen', family: 'damengambit', name: 'Angenommen', side: 'b',
    moves: 'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6 a4 Nc6 Qe2 cxd4 Rd1 Be7 exd4 O-O Nc3 Nd5',
    idea: 'Schwarz nimmt den Bauern c4, versucht aber nicht, ihn zu halten. Stattdessen greift er mit …c5 das Zentrum an; Weiß bekommt oft einen isolierten d-Bauern.',
    notes: { '2...dxc4': 'Schwarz gibt das Zentrum auf und will es mit …c5 angreifen.', '5...c5': 'Der typische Gegenangriff auf d4.', '10.exd4': 'Isolierter d-Bauer: aktive weiße Figuren, für Schwarz das Blockadefeld d5.' } },
  { id: 'dg-abgelehnt', family: 'damengambit', name: 'Abgelehnt (Orthodoxe Verteidigung)', side: 'w',
    moves: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7 Rc1 c6 Bd3 dxc4 Bxc4 Nd5 Bxe7 Qxe7 O-O Nxc3 Rxc3 e5',
    idea: 'Schwarz hält mit …e6 den Stützpunkt d5. Weiß fesselt den Springer mit Lg5 und kämpft um jedes Tempo; Schwarz befreit sich mit Abtausch über d5 und …e5 (Capablanca).',
    notes: { '2...e6': 'Fest: Schwarz deckt d5, sperrt aber den Läufer c8 ein.', '9...Nd5': 'Capablancas Befreiungsmanöver: Figurentausch schafft Platz.', '12...e5': 'Jetzt kommt endlich auch der Läufer c8 ins Spiel.' } },

  // Slawisch
  { id: 'sl-hauptvariante', family: 'slawisch', name: 'Hauptvariante (4…dxc4 5.a4 Lf5)', side: 'b',
    moves: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O O-O Qe2 Nbd7 e4 Bg6 Bd3 Bh5 e5 Nd5',
    idea: 'Schwarz stützt d5 mit dem c-Bauern und hält so den Läufer c8 frei. In der Hauptvariante nimmt Schwarz auf c4 und entwickelt den Läufer nach f5, bevor …e6 folgt.',
    notes: { '2...c6': 'Deckt d5, ohne den Läufer c8 einzusperren.', '4...dxc4': 'Schwarz nimmt den Bauern, Weiß holt ihn mit a4 und e3 zurück.', '5.a4': 'Verhindert …b5, mit dem Schwarz den Bauern halten würde.' } },

  // Londoner System
  { id: 'lo-system', family: 'londoner', name: 'Grundaufbau gegen …d5 und …c5', side: 'w',
    moves: 'd4 d5 Nf3 Nf6 Bf4 c5 e3 Nc6 Nbd2 e6 c3 Bd6 Bg3 O-O Bd3 b6 Ne5 Bb7 f4',
    idea: 'Weiß bringt den Läufer nach f4, bevor e3 ihn einsperrt, und baut mit e3, c3 und Sd2 eine feste Pyramide. Später folgen oft Se5 und f4 für einen Königsangriff.',
    notes: { '3.Bf4': 'Der Läufer kommt vor e3 heraus – das Herz des Londoner Systems.', '7.Bg3': 'Weiß weicht dem Läufertausch aus und behält die Diagonale.', '10.f4': 'Der Springer e5 steht fest gestützt, der Angriff folgt am Königsflügel.' } },

  // Königsindisch
  { id: 'ki-klassisch', family: 'koenigsindisch', name: 'Klassische Hauptvariante', side: 'b',
    moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7 Ne1 Nd7 Be3 f5 f3 f4 Bf2 g5',
    idea: 'Schwarz überlässt Weiß zunächst das Zentrum und greift es dann mit …e5 an. Nach d5 ist das Zentrum geschlossen: Weiß spielt am Damenflügel, Schwarz stürmt mit …f5, …f4 und …g5 auf den König.',
    notes: { '6...e5': 'Der Angriff auf das weiße Zentrum.', '9.Ne1': 'Der Springer macht Platz für f3 und will über d3 den Vorstoß c5 unterstützen.', '10...f5': 'Der wichtigste Hebel: Schwarz greift am Königsflügel an.' } },

  // Grünfeld
  { id: 'gr-abtausch', family: 'gruenfeld', name: 'Abtauschvariante (8.Tb1)', side: 'b',
    moves: 'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5 Rb1 O-O Be2 cxd4 cxd4 Qa5+ Bd2 Qxa2 O-O',
    idea: 'Schwarz lässt Weiß ein großes Bauernzentrum bauen und greift es dann mit dem Läufer g7 und …c5 an. In der Abtauschvariante setzt Weiß auf Raum und Initiative.',
    notes: { '3...d5': 'Der Grünfeld-Zug: Schwarz fordert das Zentrum sofort heraus.', '7...c5': 'Angriff auf d4, unterstützt vom Läufer g7.', '10...Qa5+': 'Schwarz tauscht ab und holt sich den Bauern a2 – Weiß bekommt Entwicklung.' } },

  // Nimzoindisch
  { id: 'ni-rubinstein', family: 'nimzoindisch', name: 'Rubinstein-Variante (4.e3)', side: 'b',
    moves: 'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6 a3 Bxc3 bxc3 dxc4 Bxc4 Qc7',
    idea: 'Schwarz fesselt den Springer c3 und kämpft so um das Feld e4. Oft gibt Schwarz das Läuferpaar ab und bekommt dafür Doppelbauern auf der c-Linie als Angriffsziel.',
    notes: { '3...Bb4': 'Fesselung: Der Springer c3 kann e4 nicht mehr kontrollieren.', '8...Bxc3': 'Tausch: Weiß bekommt das Läuferpaar, aber Doppelbauern.', '10...Qc7': 'Schwarz bereitet …e5 vor.' } },

  // Damenindisch
  { id: 'di-la6', family: 'damenindisch', name: 'Hauptvariante 4.g3 La6', side: 'b',
    moves: 'd4 Nf6 c4 e6 Nf3 b6 g3 Ba6 b3 Bb4+ Bd2 Be7 Bg2 c6 Bc3 d5 Ne5 Nfd7 Nxd7 Nxd7 Nd2 O-O O-O',
    idea: 'Schwarz greift mit …La6 den Bauern c4 an und zwingt Weiß zu b3. Nach dem Läuferschach auf b4 befreit sich Schwarz mit …c6 und …d5.',
    notes: { '4...Ba6': 'Greift c4 an – nach b3 ist die lange Diagonale geschwächt.', '5...Bb4+': 'Das Schach lenkt den weißen Läufer nach d2, wo er schlechter steht.' } },

  // Holländisch
  { id: 'ho-leningrad', family: 'hollaendisch', name: 'Leningrader System', side: 'b',
    moves: 'd4 f5 c4 Nf6 g3 g6 Bg2 Bg7 Nf3 O-O O-O d6 Nc3 Qe8 d5 a5',
    idea: 'Schwarz kontrolliert e4 mit dem f-Bauern und stellt den Läufer nach g7 – eine Mischung aus Holländisch und Königsindisch. Schwarz bereitet …e5 vor und spielt auf Königsangriff.',
    notes: { '1...f5': 'Kontrolliert e4 und bereitet Spiel am Königsflügel vor.', '7...Qe8': 'Die Dame unterstützt …e5 und kann später nach h5 oder f7.' } },

  // Englisch
  { id: 'en-umgekehrt', family: 'englisch', name: 'Umgekehrt Sizilianisch (1…e5)', side: 'w',
    moves: 'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6 O-O Be7 d3 O-O a3 Be6 b4',
    idea: 'Weiß spielt Sizilianisch mit vertauschten Farben und einem Tempo mehr. Der Läufer g2 drückt über die lange Diagonale, mit a3 und b4 folgt Spiel am Damenflügel.',
    notes: { '1...e5': 'Schwarz besetzt das Zentrum – wie Weiß im Sizilianer.', '4.g3': 'Fianchetto: Der Läufer g2 zielt auf d5 und b7.', '10.b4': 'Raumgewinn am Damenflügel; b5 soll den Springer c6 vertreiben.' } }
];

// ---------------------------------------------------------------------------------------------
const FILES = ['a', 'b', 'c', 'd', 'e'];
const epd = (fen) => fen.split(' ').slice(0, 4).join(' ');
const sans = (pgn) => pgn.split(/\s+/).filter((t) => t && !/^\d+\.+$/.test(t));

async function loadTsv(f) {
  const file = join(CACHE, `${f}.tsv`);
  if (!existsSync(file)) {
    const url = `https://raw.githubusercontent.com/${SRC.repo}/${SRC.commit}/${f}.tsv`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download fehlgeschlagen: ${url} (${res.status})`);
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, await res.text());
    console.log(`geladen: ${url}`);
  }
  return readFileSync(file, 'utf8');
}

// EPD → erster lichess-Eintrag mit dieser Stellung
const byEpd = new Map();
let catalogSize = 0;
for (const f of FILES) {
  const rows = (await loadTsv(f)).split('\n').slice(1).filter(Boolean);
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t');
    const c = new Chess();
    for (const s of sans(pgn)) c.move(s);
    const k = epd(c.fen());
    catalogSize++;
    if (!byEpd.has(k)) byEpd.set(k, { eco, name, plies: sans(pgn).length });
  }
}

const fam = new Map(FAMILIES.map((f) => [f.id, f]));
const ids = new Set();
const seen = new Map();
const out = [];
for (const L of LINES) {
  const err = (m) => { throw new Error(`${L.id}: ${m}`); };
  if (ids.has(L.id)) err('ID doppelt');
  ids.add(L.id);
  if (!fam.has(L.family)) err(`Familie ${L.family} fehlt`);
  if (!['w', 'b'].includes(L.side)) err('side muss w oder b sein');
  if (!L.idea || L.idea.length >= 300) err(`idea leer oder zu lang (${L.idea.length})`);
  const ms = L.moves.split(' ');
  if (ms.length < 12 || ms.length > 24) err(`${ms.length} Halbzüge (erlaubt 12–24)`);
  if (seen.has(L.moves)) err(`identisch mit ${seen.get(L.moves)}`);
  seen.set(L.moves, L.id);
  const c = new Chess();
  let hit = null;
  ms.forEach((s, i) => {
    let m;
    try { m = c.move(s); } catch { m = null; }
    if (!m) err(`illegaler Zug ${s} in Halbzug ${i}`);
    if (m.san !== s) err(`SAN nicht kanonisch: ${s} (chess.js: ${m.san})`);
    const e = byEpd.get(epd(c.fen()));
    if (e) hit = { ...e, ply: i };
  });
  if (!hit) err('kein lichess-Name gefunden');
  const notes = {};
  for (const [k, text] of Object.entries(L.notes || {})) {
    const mm = /^(\d+)(\.\.\.|\.)(\S+)$/.exec(k);
    if (!mm) err(`Hinweis-Schlüssel ${k} unlesbar`);
    const ply = (Number(mm[1]) - 1) * 2 + (mm[2] === '...' ? 1 : 0);
    if (ms[ply] !== mm[3]) err(`Hinweis ${k}: Halbzug ${ply} ist ${ms[ply]}`);
    notes[ply] = text;
  }
  out.push({ id: L.id, family: L.family, name: L.name, eco: hit.eco, lichess: hit.name, lichessPly: hit.ply,
    side: L.side, moves: L.moves, idea: L.idea, notes });
}

// ---------------------------------------------------------------------------------------------
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const obj = (o) => '{ ' + Object.entries(o).map(([k, v]) => {
  const key = /^[A-Za-z_]\w*$|^\d+$/.test(k) ? k : q(k);
  if (typeof v === 'number') return `${key}: ${v}`;
  if (v && typeof v === 'object') return `${key}: ${obj(v)}`;
  return `${key}: ${q(v)}`;
}).join(', ') + ' }';

const head = `// Eröffnungs-Katalog des Schach-Trainers – ERZEUGT von tools/build_openings.mjs, nicht von Hand ändern.
// Namensquelle (eco, lichess): ${SRC.repo} (${SRC.license}), ${SRC.url}
//   Commit ${SRC.commit}, abgerufen am ${SRC.fetched}.
//   eco/lichess = Katalogeintrag, dessen Stellung (EPD) am tiefsten in der Linie erreicht wird
//   (Zugumstellungen eingeschlossen); lichessPly = 0-basierter Halbzugindex, nach dem diese Stellung steht.
// Zugfolgen: gängige Eröffnungstheorie, beim Bauen Zug für Zug mit chess.js geprüft (SAN englisch).
// Deutsche Namen, Ideen und Hinweise: eigene Arbeit. notes: { 0-basierter Halbzugindex: Hinweis }.
// side: Farbe, die diese Linie typischerweise lernt ('w' Weiß, 'b' Schwarz).
`;
const body = head +
  '\nexport const FAMILIES = [\n' + FAMILIES.map((f) => '  ' + obj(f)).join(',\n') + '\n];\n' +
  '\nexport const LINES = [\n' + out.map((l) => '  ' + obj(l)).join(',\n') + '\n];\n';
mkdirSync(dirname(OUT), { recursive: true });
const before = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
if (before !== body) writeFileSync(OUT, body);
console.log(`${OUT.slice(root.length + 1)}: ${out.length} Linien, ${FAMILIES.length} Familien, ${statSync(OUT).size} Bytes` +
  ` (lichess-Katalog ${catalogSize} Einträge${before === body ? ', unverändert' : ''})`);
for (const l of out) console.log(`  ${l.id.padEnd(17)} ${l.side} ${String(l.moves.split(' ').length).padStart(2)} Hz  ${l.eco} @${String(l.lichessPly).padStart(2)}  ${l.lichess}`);

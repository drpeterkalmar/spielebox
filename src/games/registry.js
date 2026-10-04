// Spiele-Verzeichnis: Engine, Anzeige-Namen und Optionen je Spiel.
// Engines sind rein (ohne DOM); Ansicht und Bot werden getrennt geladen.
import * as muehle from './muehle/engine.js';
import * as dame from './dame/engine.js';
import * as schach from './schach/engine.js';
import * as schnapsen from './schnapsen/engine.js';
import * as backgammon from './backgammon/engine.js';
import * as blackjack from './blackjack/engine.js';
import * as halma from './halma/engine.js';
import * as ludo from './ludo/engine.js';
import * as schiffe from './schiffe/engine.js';
import * as vier from './vier/engine.js';
import * as maumau from './maumau/engine.js';
import * as wuerfel from './wuerfel/engine.js';
import * as reversi from './reversi/engine.js';
import * as paare from './paare/engine.js';
import * as holdem from './holdem/engine.js';

export const GAMES = {
  muehle: {
    id: 'muehle',
    colors: true,
    title: 'Mühle',
    engine: muehle,
    blurb: '9 Steine, Mühlen schließen, Springen ab 3',
    seats: 2,
    // Beschreibung der Optionen für das Auswahlblatt (Mühle hat keine)
    options: [],
    variantName: () => 'Mühle',
    draws: true
  },
  dame: {
    id: 'dame',
    colors: true,
    title: 'Dame',
    engine: dame,
    blurb: 'Deutsch 8×8 oder International 10×10',
    seats: 2,
    options: [
      { key: 'rules', type: 'choice', label: 'Regeln', choices: [
        { value: 'deutsch', label: 'Deutsch', sub: '8×8, 12 Steine' },
        { value: 'international', label: 'International', sub: '10×10, 20 Steine' }
      ] },
      { key: 'kurz', type: 'switch', label: 'Kurze Dame', sub: 'Dame zieht und schlägt nur 1 Feld weit' },
      { key: 'pusten', type: 'switch', label: 'Pusten', sub: 'Kein Schlagzwang – wer nicht schlägt, wird gepustet' }
    ],
    variantName: (o) => {
      const opts = dame.normalizeOptions(o);
      const parts = [opts.rules === 'international' ? 'International 10×10' : 'Deutsch 8×8'];
      if (opts.kurz) parts.push('Kurze Dame');
      if (opts.pusten) parts.push('Pusten');
      return parts.join(' · ');
    },
    draws: true
  },
  schach: {
    id: 'schach',
    colors: true,
    title: 'Schach',
    engine: schach,
    blurb: 'Klassisch, mit Remis-Angebot und PGN',
    seats: 2,
    options: [],
    variantName: () => 'Schach',
    draws: true
  },
  schnapsen: {
    id: 'schnapsen',
    title: 'Schnapsen',
    engine: schnapsen,
    blurb: '20 Blatt doppeldeutsch, Bummerl-Tafel',
    seats: 2,
    cards: true,
    options: [
      { key: 'bummerl', type: 'choice', label: 'Partie', choices: [
        { value: 2, label: 'Auf 2 Bummerl' }, { value: 3, label: 'Auf 3 Bummerl' }] },
      { key: 'hart', type: 'switch', label: 'Hart', sub: 'Bei nur einer Talonkarte auch kein Austauschen' },
      { key: 'schneider', type: 'switch', label: 'Schneider-Bummerl doppelt', sub: '7:0 zählt zwei Bummerl' },
      { key: 'stiche', type: 'switch', label: 'Eigene Stiche ansehen', sub: 'Auf den eigenen Stichstapel tippen (aus = Turnierregel)', dflt: true },
      { key: 'augenHilfe', type: 'switch', label: 'Augen-Hilfe', sub: 'Zeigt die Summe deiner Augen (sonst selbst mitzählen)' }
    ],
    variantName: (o) => { const x = schnapsen.normalizeOptions(o); return [`${x.bummerl} Bummerl`, x.hart ? 'hart' : 'weich', x.schneider ? 'Schneider doppelt' : '', x.stiche ? '' : 'Stiche verdeckt', x.augenHilfe ? 'Augen-Hilfe' : ''].filter(Boolean).join(' · '); }
  },
  backgammon: {
    id: 'backgammon',
    colors: true,
    title: 'Backgammon',
    engine: backgammon,
    blurb: 'Mit Verdopplungswürfel, fair gewürfelt',
    seats: 2,
    options: [
      { key: 'cube', type: 'switch', label: 'Verdopplungswürfel', sub: 'Doppeln, Annehmen oder Aufgeben', dflt: true }
    ],
    variantName: (o) => (backgammon.normalizeOptions(o).cube ? 'mit Doppler' : 'ohne Doppler')
  },
  blackjack: {
    id: 'blackjack',
    title: 'Blackjack',
    engine: blackjack,
    blurb: '2–6 Spieler, Bank reihum, Bohnen statt Geld',
    soloLast: true,
    seats: (o) => o.players,
    cards: true,
    options: [
      { key: 'players', type: 'choice', label: 'Plätze am Tisch', choices: [2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) })), dflt: 4 },
      { key: 'wechselBJ', type: 'switch', label: 'Bankwechsel bei Black Jack', sub: 'Wer Black Jack hat, wird Bank (alte Hausregel)' }
    ],
    variantName: (o) => { const x = blackjack.normalizeOptions(o); return `${x.players} Plätze${x.wechselBJ ? ' · Bank bei Black Jack' : ''}`; }
  },
  halma: {
    id: 'halma',
    title: 'Stern-Halma',
    engine: halma,
    blurb: '2, 3, 4 oder 6 Spieler, Sprungketten',
    seats: (o) => o.players,
    options: [
      { key: 'players', type: 'choice', label: 'Spieler', choices: [2, 3, 4, 6].map((n) => ({ value: n, label: String(n) })), dflt: 2 }
    ],
    variantName: (o) => `${halma.normalizeOptions(o).players} Spieler`
  },
  ludo: {
    id: 'ludo',
    title: 'Ludo',
    engine: ludo,
    blurb: '2–4 Spieler, mit 6 raus, rauswerfen',
    seats: (o) => o.players,
    options: [
      { key: 'players', type: 'choice', label: 'Spieler', choices: [2, 3, 4].map((n) => ({ value: n, label: String(n) })), dflt: 4 },
      { key: 'dreimal', type: 'switch', label: '3× würfeln', sub: 'Keine Figur auf der Bahn: dreimal würfeln für eine 6', dflt: true },
      { key: 'schlagpflicht', type: 'switch', label: 'Schlagpflicht', sub: 'Wer schlagen kann, muss schlagen' },
      { key: 'startfigur', type: 'switch', label: 'Eine Figur startet draußen', sub: 'Wie in der Anleitung: eine Figur steht schon auf dem Startfeld', dflt: true },
      { key: 'zielspringen', type: 'switch', label: 'Im Ziel überspringen', sub: 'Aus: Im Ziel darf keine Figur übersprungen werden', dflt: true }
    ],
    variantName: (o) => { const x = ludo.normalizeOptions(o); return [`${x.players} Spieler`, x.dreimal ? '3× würfeln' : '', x.schlagpflicht ? 'Schlagpflicht' : ''].filter(Boolean).join(' · '); }
  },
  schiffe: {
    id: 'schiffe',
    title: 'Schiffe versenken',
    engine: schiffe,
    blurb: 'Flotte verstecken, Feld für Feld suchen',
    seats: 2,
    options: [
      { key: 'flotte', type: 'choice', label: 'Flotte', choices: [
        { value: 'klein', label: 'Klein', sub: '5 Schiffe' },
        { value: 'gross', label: 'Groß', sub: '10 Schiffe' }] },
      { key: 'beruehren', type: 'switch', label: 'Schiffe dürfen sich berühren', sub: 'Hausregel (sonst mit Abstand, auch über Eck)' },
      { key: 'nochmal', type: 'switch', label: 'Nach Treffer nochmal', sub: 'Wer trifft, schießt gleich noch einmal' }
    ],
    variantName: (o) => { const x = schiffe.normalizeOptions(o); return [x.flotte === 'gross' ? 'große Flotte' : 'kleine Flotte', x.beruehren ? 'berühren erlaubt' : '', x.nochmal ? 'nochmal nach Treffer' : ''].filter(Boolean).join(' · '); }
  },
  vier: {
    id: 'vier',
    colors: true,
    colorNames: ['Rot (beginnt)', 'Gelb'],
    title: 'Vier in einer Reihe',
    engine: vier,
    blurb: '7 × 6, Steine fallen, vier in einer Linie',
    seats: 2,
    options: [],
    variantName: () => 'Vier in einer Reihe'
  },
  maumau: {
    id: 'maumau',
    title: 'Mau-Mau',
    engine: maumau,
    blurb: '2–5 Spieler, 32 Blatt doppeldeutsch',
    seats: (o) => o.players,
    cards: true,
    winPoints: 1,
    options: [
      { key: 'players', type: 'choice', label: 'Spieler', choices: [2, 3, 4, 5].map((n) => ({ value: n, label: String(n) })), dflt: 3 },
      { key: 'sieben', type: 'switch', label: '7 = zwei ziehen', sub: 'Mit einer 7 kontern: dann vier usw.', dflt: true },
      { key: 'unter', type: 'switch', label: 'Unter wünscht', sub: 'Unter auf jede Karte (nicht auf Unter), Farbe wünschen', dflt: true },
      { key: 'ass', type: 'switch', label: 'Daus = Aussetzen', sub: 'Der Nächste muss aussetzen', dflt: true },
      { key: 'mau', type: 'switch', label: '„Mau“ sagen', sub: 'Bei der vorletzten Karte – vergessen = 2 Strafkarten', dflt: true }
    ],
    variantName: (o) => { const x = maumau.normalizeOptions(o); return [`${x.players} Spieler`, ...['sieben', 'unter', 'ass', 'mau'].filter((k) => !x[k]).map((k) => `ohne ${{ sieben: '7er', unter: 'Unter', ass: 'Daus', mau: 'Mau' }[k]}`)].join(' · '); }
  },
  wuerfel: {
    id: 'wuerfel',
    title: 'Würfelglück',
    engine: wuerfel,
    blurb: '1–6 Spieler, 5 Würfel, 13 Felder',
    seats: (o) => o.players,
    winPoints: 1,
    options: [
      { key: 'players', type: 'choice', label: 'Spieler', choices: [1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) })), dflt: 2 },
      { key: 'joker', type: 'choice', label: 'Weiterer Fünferpasch', choices: [
        { value: 'grund', label: 'Grundregel', sub: '+50, Feld frei wählen' },
        { value: 'meister', label: 'Meister', sub: '+50, normal eintragen' },
        { value: 'aus', label: 'Aus', sub: 'kein Extra' }] },
      { key: 'freiStreichen', type: 'switch', label: 'Frei streichen', sub: 'Jedes Feld darf jederzeit gestrichen werden (Meisterschaftsregel)' }
    ],
    variantName: (o) => { const x = wuerfel.normalizeOptions(o); return [`${x.players} ${x.players === 1 ? 'Spieler' : 'Spieler'}`, x.joker === 'meister' ? 'Meisterregel' : x.joker === 'aus' ? 'ohne Extra-Fünferpasch' : '', x.freiStreichen ? 'frei streichen' : ''].filter(Boolean).join(' · '); }
  },
  reversi: {
    id: 'reversi',
    colors: true,
    colorNames: ['Schwarz (beginnt)', 'Weiß'],
    title: 'Reversi',
    engine: reversi,
    blurb: '8 × 8, einschließen und umdrehen',
    seats: 2,
    options: [],
    variantName: () => 'Reversi'
  },
  paare: {
    id: 'paare',
    title: 'Paare finden',
    engine: paare,
    blurb: '1–4 Spieler, Tierbilder merken',
    seats: (o) => o.players,
    cards: true,
    options: [
      { key: 'paare', type: 'choice', label: 'Karten', choices: [
        { value: 8, label: '8 Paare', sub: '4 × 4' }, { value: 12, label: '12 Paare', sub: '4 × 6' }, { value: 18, label: '18 Paare', sub: '6 × 6' }], dflt: 12 },
      { key: 'players', type: 'choice', label: 'Spieler', choices: [1, 2, 3, 4].map((n) => ({ value: n, label: String(n) })), dflt: 2 }
    ],
    variantName: (o) => { const x = paare.normalizeOptions(o); return `${x.paare} Paare · ${x.players} Spieler`; }
  },
  holdem: {
    id: 'holdem',
    title: "Texas Hold'em",
    engine: holdem,
    blurb: '2–8 Spieler, No-Limit, nur Spielchips',
    soloLast: true,
    seats: (o) => o.players,
    cards: true,
    winPoints: 1,
    options: [
      { key: 'players', type: 'choice', label: 'Plätze am Tisch', choices: [2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: String(n) })), dflt: 4 },
      { key: 'start', type: 'choice', label: 'Chips am Anfang', choices: [
        { value: 500, label: '500', sub: 'kurz' }, { value: 1000, label: '1.000', sub: 'normal' }, { value: 2000, label: '2.000' }, { value: 5000, label: '5.000', sub: 'lang' }], dflt: 1000 },
      { key: 'blinds', type: 'choice', label: 'Blinds steigen', choices: [
        { value: 'langsam', label: 'Langsam', sub: 'alle 15 Hände' }, { value: 'normal', label: 'Normal', sub: 'alle 10' },
        { value: 'schnell', label: 'Schnell', sub: 'alle 6' }, { value: 'aus', label: 'Nie' }], dflt: 'normal' },
      { key: 'timer', type: 'choice', label: 'Bedenkzeit online', choices: [
        { value: 15, label: '15 s' }, { value: 30, label: '30 s' }, { value: 60, label: '60 s' }, { value: 0, label: 'unbegrenzt' }], dflt: 30 }
    ],
    variantName: (o) => {
      const x = holdem.normalizeOptions(o);
      return [`${x.players} Plätze`, `${holdem.fmtChips(x.start)} Chips`, x.blinds === 'aus' ? 'Blinds fest' : `Blinds ${x.blinds}`].join(' · ');
    }
  }
};

export const GAME_LIST = [GAMES.muehle, GAMES.dame, GAMES.schach, GAMES.schnapsen, GAMES.backgammon, GAMES.blackjack, GAMES.halma, GAMES.ludo, GAMES.schiffe, GAMES.vier, GAMES.maumau, GAMES.wuerfel, GAMES.reversi, GAMES.paare, GAMES.holdem];
// in der Lobby sichtbar (Spiele werden einzeln freigeschaltet, sobald Oberfläche und Tests stehen)
export const LIVE = new Set(['muehle', 'dame', 'schach', 'schnapsen', 'backgammon', 'blackjack', 'halma', 'ludo', 'schiffe', 'vier', 'maumau', 'wuerfel', 'reversi', 'paare']);

// Sitzanzahl eines Spiels (fest oder aus den Optionen, z. B. Blackjack 2–6)
export function seatCount(g, opts) {
  if (typeof g === 'string') g = gameOf(g);
  return typeof g.seats === 'function' ? g.seats(g.engine.normalizeOptions(opts)) : g.seats;
}

export function gameOf(id) {
  const g = GAMES[id];
  if (!g) throw new Error('Unbekanntes Spiel: ' + id);
  return g;
}

// Spiele-Verzeichnis: Engine, Anzeige-Namen und Optionen je Spiel.
// Engines sind rein (ohne DOM); Ansicht und Bot werden getrennt geladen.
import * as muehle from './muehle/engine.js';
import * as dame from './dame/engine.js';
import * as schach from './schach/engine.js';
import * as schnapsen from './schnapsen/engine.js';
import * as backgammon from './backgammon/engine.js';
import * as blackjack from './blackjack/engine.js';
import * as halma from './halma/engine.js';

export const GAMES = {
  muehle: {
    id: 'muehle',
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
      { key: 'schneider', type: 'switch', label: 'Schneider-Bummerl doppelt', sub: '7:0 zählt zwei Bummerl' }
    ],
    variantName: (o) => { const x = schnapsen.normalizeOptions(o); return [`${x.bummerl} Bummerl`, x.hart ? 'hart' : 'weich', x.schneider ? 'Schneider doppelt' : ''].filter(Boolean).join(' · '); }
  },
  backgammon: {
    id: 'backgammon',
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
  }
};

export const GAME_LIST = [GAMES.muehle, GAMES.dame, GAMES.schach, GAMES.schnapsen, GAMES.backgammon, GAMES.blackjack, GAMES.halma];
// in der Lobby sichtbar (Spiele werden einzeln freigeschaltet, sobald Oberfläche und Tests stehen)
export const LIVE = new Set(['muehle', 'dame', 'schach', 'schnapsen', 'backgammon']);

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

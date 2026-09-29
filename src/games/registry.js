// Spiele-Verzeichnis: Engine, Anzeige-Namen und Optionen je Spiel.
// Engines sind rein (ohne DOM); Ansicht und Bot werden getrennt geladen.
import * as muehle from './muehle/engine.js';
import * as dame from './dame/engine.js';
import * as schach from './schach/engine.js';

export const GAMES = {
  muehle: {
    id: 'muehle',
    title: 'Mühle',
    engine: muehle,
    blurb: '9 Steine, Mühlen schließen, Springen ab 3',
    seats: 2,
    // Beschreibung der Optionen für das Auswahlblatt (Mühle hat keine)
    options: [],
    variantName: () => 'Mühle'
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
    }
  },
  schach: {
    id: 'schach',
    title: 'Schach',
    engine: schach,
    blurb: 'Klassisch, mit Remis-Angebot und PGN',
    seats: 2,
    options: [],
    variantName: () => 'Schach'
  }
};

export const GAME_LIST = [GAMES.muehle, GAMES.dame, GAMES.schach];

export function gameOf(id) {
  const g = GAMES[id];
  if (!g) throw new Error('Unbekanntes Spiel: ' + id);
  return g;
}

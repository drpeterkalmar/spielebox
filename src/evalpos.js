// „Wer gewinnt?“: Einschätzung einer Stellung aus Sicht eines Sitzes, in der Einheit des Spiels, plus Gewinnchance.
// Läuft im Bot-Worker (≤ ~200 ms). Schach: kurze Suche des Übungs-Bots (Centipawns), sonst evaluate() der Engine.
// Kartenspiele bekommen nur die Sicht des Spielers (viewFor), nie verdeckte Karten.
import { GAMES } from './games/registry.js';
import { chooseMove as schachBot, stats as schachStats } from './games/schach/bot.js';

// Einheit, Nachkommastellen und Steilheit der logistischen Abbildung auf eine Gewinnchance
export const EVAL = {
  schach: { unit: 'Bauern', digits: 1, pct: (x) => 1 / (1 + 10 ** (-x / 4)) },
  muehle: { unit: 'Steine', digits: 0, pct: (x) => 1 / (1 + Math.exp(-0.7 * x)) },
  dame: { unit: 'Steine', digits: 0, pct: (x) => 1 / (1 + Math.exp(-0.55 * x)) },
  backgammon: { unit: 'Pips', digits: 0, pct: (x) => 1 / (1 + Math.exp(-x / 14)) },
  halma: { unit: 'Felder', digits: 0, pct: (x) => 1 / (1 + Math.exp(-x / 9)) },
  schnapsen: { unit: 'Punkte', digits: 1, pct: (x) => 1 / (1 + Math.exp(-0.55 * x)) },
  ludo: { unit: 'Felder', digits: 0, pct: (x) => 1 / (1 + Math.exp(-x / 14)) },
  schiffe: { unit: 'Felder', digits: 0, pct: (x) => 1 / (1 + Math.exp(-x / 3.5)) },
  reversi: { unit: 'Steine', digits: 0, pct: (x) => 1 / (1 + Math.exp(-x / 9)) },
  wuerfel: { unit: 'Punkte', digits: 0, pct: (x) => 1 / (1 + Math.exp(-x / 22)) },
  maumau: { unit: 'Karten', digits: 1, pct: (x) => 1 / (1 + Math.exp(-x / 1.6)) },
  vier: { unit: 'Punkte', digits: 0, pct: (x) => 1 / (1 + Math.exp(-x / 8)), win: ['Gewinn in Sicht', 'Verlust droht'] }
};

export function evalPosition(game, gs, seat) {
  const E = GAMES[game].engine;
  let x;
  const over = E.result(gs);
  if (game === 'schach' && !over) {
    schachBot(gs, { level: 2, timeMs: 160 });
    const cp = schachStats.score;   // aus Sicht der Seite am Zug
    x = Math.max(-99, Math.min(99, (gs.turn === seat ? cp : -cp) / 100));
    if (Math.abs(cp) > 90000) x = (gs.turn === seat) === cp > 0 ? 99 : -99;   // Matt in Sicht
  } else {
    x = E.evaluate(gs, seat);
  }
  let p = EVAL[game] ? EVAL[game].pct(x) : 0.5;
  if (over) p = over.winner === null || over.winner === undefined ? 0.5 : over.winner === seat ? 1 : 0;
  return { x, p };
}

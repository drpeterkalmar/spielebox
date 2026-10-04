// „Wer gewinnt?“: Einschätzung einer Stellung aus Sicht eines Sitzes, in der Einheit des Spiels, plus Gewinnchance.
// Läuft im Bot-Worker (≤ ~200 ms). Schach: kurze Suche des Übungs-Bots (Centipawns), sonst evaluate() der Engine.
// Kartenspiele bekommen nur die Sicht des Spielers (viewFor), nie verdeckte Karten.
import { GAMES } from './games/registry.js';
import { chooseMove as schachBot, stats as schachStats } from './games/schach/bot.js';
import { equity as holdemEquity } from './games/holdem/equity.js';
import { liveSeats as holdemLive } from './games/holdem/engine.js';

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
  paare: { unit: 'Paare', digits: 0, pct: (x) => 1 / (1 + Math.exp(-x / 1.5)) },
  reversi: { unit: 'Steine', digits: 0, pct: (x) => 1 / (1 + Math.exp(-x / 9)) },
  wuerfel: { unit: 'Punkte', digits: 0, pct: (x) => 1 / (1 + Math.exp(-x / 22)) },
  maumau: { unit: 'Karten', digits: 1, pct: (x) => 1 / (1 + Math.exp(-x / 1.6)) },
  vier: { unit: 'Punkte', digits: 0, pct: (x) => 1 / (1 + Math.exp(-x / 8)), win: ['Gewinn in Sicht', 'Verlust droht'] },
  // Hold'em: Gewinnchance der eigenen Hand gegen zufällige Hände der Mitspieler, die noch dabei sind (fremde Karten
  // kennt niemand – es ist eine Schätzung, kein Wissen)
  holdem: {
    unit: '%', digits: 0, pct: (x) => x / 100,
    label: (r) => (r.over ? 'Wer gewinnt? – Turnier vorbei' : r.none ? 'Wer gewinnt? – nicht in dieser Hand' : `Wer gewinnt? ${Math.round(r.x)} % gegen ${r.opp === 1 ? 'eine zufällige Hand' : `${r.opp} zufällige Hände`}`),
    title: 'Gewinnchance deiner Hand, wenn die anderen irgendwelche Karten hätten (Monte-Carlo, 4000 Durchgänge)'
  }
};

export function evalPosition(game, gs, seat) {
  const E = GAMES[game].engine;
  let x;
  const over = E.result(gs);
  if (game === 'holdem') {
    const hole = gs.holes && gs.holes[seat];
    const opp = gs.phase === 'bet' ? holdemLive(gs).filter((q) => q !== seat).length : 0;
    if (over) return { x: over.winner === seat ? 100 : 0, p: over.winner === seat ? 1 : 0, none: true, over: true };
    if (!hole || hole.length !== 2 || !hole[0] || gs.folded[seat] || !opp) return { x: 0, p: 0.5, none: true };
    const { eq } = holdemEquity(hole, gs.board, Array(opp).fill(null), { iters: 4000 });
    return { x: eq * 100, p: eq, opp };
  }
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

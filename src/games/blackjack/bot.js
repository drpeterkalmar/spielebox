// Übungs-Bot für Blackjack (rein, ohne DOM). Bekommt nur die Sicht (viewFor) des Sitzes am Zug.
// level 1 = leicht: setzt 5 Bohnen, zieht unter 12 immer, bis 16 nur gegen starke Bankkarte (7–Ass),
//           verdoppelt und teilt nie
// level 2 = mittel: setzt ~6 % der Bohnen, spielt Basic Strategy (2 Decks, Bank steht auf weicher 17)
// level 3 = stark: Basic Strategy, Einsatz nach Hi-Lo-Zählung der offen abgelegten Karten (4–10 %)
import * as E from './engine.js';

// Zeilen: Spielerwert, Spalten: Bankkarte 2 3 4 5 6 7 8 9 T A (Index 0–9)
// H = ziehen, S = stehen, D = verdoppeln (sonst ziehen), Ds = verdoppeln (sonst stehen), P = teilen
const col = up => (up === 1 ? 9 : up - 2);
const HARD = {
  8: 'HHHHHHHHHH', 9: 'DDDDDHHHHH', 10: 'DDDDDDDDHH', 11: 'DDDDDDDDDD',
  12: 'HHSSSHHHHH', 13: 'SSSSSHHHHH', 14: 'SSSSSHHHHH', 15: 'SSSSSHHHHH', 16: 'SSSSSHHHHH'
};
const SOFT = {   // weicher Gesamtwert
  12: 'HHHHHHHHHH', 13: 'HHHDDHHHHH', 14: 'HHHDDHHHHH', 15: 'HHDDDHHHHH', 16: 'HHDDDHHHHH',
  17: 'HDDDDHHHHH', 18: 'SXXXXSSHHH', 19: 'SSSSSSSSSS'   // X = Ds
};
const PAIR = {   // Wert einer Karte des Paars → 'Y' teilen
  1: 'YYYYYYYYYY', 2: 'YYYYYYNNNN', 3: 'YYYYYYNNNN', 4: 'NNNYYNNNNN', 5: 'NNNNNNNNNN',
  6: 'YYYYYNNNNN', 7: 'YYYYYYNNNN', 8: 'YYYYYYYYYY', 9: 'YYYYYNYYNN', 10: 'NNNNNNNNNN'
};

export function strategy(cards, upValue, { canDouble = true, canSplit = true } = {}) {
  const v = E.handValue(cards), c = col(upValue);
  if (canSplit && cards.length === 2 && E.cardValue(cards[0]) === E.cardValue(cards[1]) &&
      PAIR[E.cardValue(cards[0])][c] === 'Y') return 'split';
  let a;
  if (v.soft) a = v.total >= 19 ? 'S' : SOFT[v.total][c];
  else a = v.total >= 17 ? 'S' : v.total <= 8 ? 'H' : HARD[v.total][c];
  if (a === 'X') return canDouble ? 'double' : 'stand';
  if (a === 'D') return canDouble ? 'double' : 'hit';
  return a === 'S' ? 'stand' : 'hit';
}

// Hi-Lo: 2–6 = +1, 7–9 = 0, 10/Ass = −1; echte Zählung = laufende / verbleibende Decks
export function trueCount(view) {
  let rc = 0;
  for (const c of view.discard || []) {
    if (!c) continue;
    const v = E.cardValue(c);
    if (v >= 2 && v <= 6) rc++;
    else if (v === 10 || v === 1) rc--;
  }
  return rc / Math.max(0.5, (view.shoe || []).length / 52);
}

export function chooseMove(view, { level = 2, rng = Math.random } = {}) {
  const moves = E.legalMoves(view);
  if (moves.length <= 1) return moves.length ? moves[0] : null;
  const seat = E.currentPlayer(view);
  if (view.phase === 'bet') {
    const max = Math.max(...moves.map(m => m.amount)), beans = view.beans[seat];
    let want;
    if (level <= 1) want = 5;
    else if (level === 2) want = Math.round(beans * (0.05 + 0.02 * (typeof rng === 'function' ? rng() : 0.5)));
    else {
      const tc = trueCount(view);
      want = Math.round(beans * (tc >= 3 ? 0.1 : tc >= 1.5 ? 0.08 : tc <= -1 ? 0.04 : 0.06));
    }
    return { type: 'bet', amount: Math.max(1, Math.min(max, want)) };
  }
  const h = view.hands[seat][view.hand], up = E.cardValue(view.bankCards[0]);
  const has = t => moves.some(m => m.type === t);
  if (level <= 1) {
    const t = E.handValue(h.cards).total;
    return { type: t < 12 || (t <= 16 && (up >= 7 || up === 1)) ? 'hit' : 'stand' };
  }
  const a = strategy(h.cards, up, { canDouble: has('double'), canSplit: has('split') });
  return has(a) ? { type: a } : { type: 'hit' };
}

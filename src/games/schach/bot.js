// Schach-Übungs-Bot: Alpha-Beta mit iterativer Vertiefung, Ruhesuche (Schläge), Figurentabellen
// (vereinfachte Tabellen nach Tomasz Michniewski). Rechnet direkt auf der internen 0x88-Darstellung von chess.js
// (_moves/_makeMove/_undoMove), weil move() jeden Zug erneut erzeugt und prüft.
// Stufe 1: 1 Halbzug + Zufall, Stufe 2: ~0,4 s, Stufe 3: bis 1,2 s (Zeitlimit).
import { Chess } from '../../../lib/chess.js';

const V = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// Tabellen aus Sicht von Weiß, Index 0 = a8 … 63 = h1
const PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  ke: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50]
};
const MATE = 100000;
const CAPTURE = 2, PROMOTION = 16;

// 0x88 → 0..63 (a8 = 0); für Schwarz gespiegelt
const idx = (sq, color) => {
  const r = sq >> 4, f = sq & 7;
  return color === 'w' ? r * 8 + f : (7 - r) * 8 + f;
};

export const stats = { depth: 0, nodes: 0, ms: 0, score: 0 };

// Bewertung aus Sicht der Seite am Zug (Zentibauern)
function evalBoard(c) {
  const b = c._board;
  let mat = 0, pst = 0, nonPawn = 0;
  let wk = -1, bk = -1;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const p = b[sq];
    if (!p) continue;
    const sgn = p.color === 'w' ? 1 : -1;
    mat += sgn * V[p.type];
    if (p.type === 'k') { if (p.color === 'w') wk = sq; else bk = sq; continue; }
    if (p.type !== 'p') nonPawn += V[p.type];
    pst += sgn * PST[p.type][idx(sq, p.color)];
  }
  const endgame = nonPawn <= 1300;
  const kt = endgame ? PST.ke : PST.k;
  if (wk >= 0) pst += kt[idx(wk, 'w')];
  if (bk >= 0) pst -= kt[idx(bk, 'b')];
  const score = mat + pst;
  return c._turn === 'w' ? score : -score;
}

function order(moves) {
  for (const m of moves) {
    m._o = (m.captured ? 10 * V[m.captured] - V[m.piece] + 1000 : 0) + (m.flags & PROMOTION ? 800 : 0);
  }
  return moves.sort((a, b) => b._o - a._o);
}

class Timeout extends Error {}

export function chooseMove(state, { level = 2, rng = Math.random, timeMs = 400 } = {}) {
  const c = new Chess(state.fen);
  const root = c._moves({ legal: true });
  if (!root.length) return null;
  const t0 = Date.now();
  const limit = level <= 1 ? 1e9 : Math.min(timeMs, level >= 3 ? 1200 : 450);
  const maxDepth = level <= 1 ? 1 : level === 2 ? 3 : 6;
  let nodes = 0;
  const check = () => { if ((++nodes & 1023) === 0 && Date.now() - t0 > limit) throw new Timeout(); };

  function quiesce(alpha, beta, qd) {
    check();
    const stand = evalBoard(c);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (qd > 6) return stand;
    const caps = order(c._moves({ legal: true }).filter((m) => m.flags & (CAPTURE | PROMOTION | 8)));
    for (const m of caps) {
      c._makeMove(m);
      const sc = -quiesce(-beta, -alpha, qd + 1);
      c._undoMove();
      if (sc >= beta) return sc;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  function search(depth, alpha, beta, ply) {
    check();
    const moves = c._moves({ legal: true });
    if (!moves.length) return c._isKingAttacked(c._turn) ? -MATE + ply : 0;
    if (c._halfMoves >= 100) return 0;
    if (depth <= 0) return quiesce(alpha, beta, 0);
    let best = -Infinity;
    for (const m of order(moves)) {
      c._makeMove(m);
      const sc = -search(depth - 1, -beta, -alpha, ply + 1);
      c._undoMove();
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Wiederholungen vermeiden, wenn wir besser stehen: Stellungen der Partie merken
  let bestMove = root[0], bestScore = -Infinity, depthDone = 0;
  let ordered = order(root.slice());
  try {
    for (let d = 1; d <= maxDepth; d++) {
      let alpha = -Infinity, curBest = null, curScore = -Infinity;
      const scored = [];
      for (const m of ordered) {
        c._makeMove(m);
        let sc = -search(d - 1, -Infinity, -alpha, 1);
        c._undoMove();
        // Stufe 1: grobes Rauschen, damit der Bot schlagbar bleibt
        if (level <= 1) sc += (rng() - 0.5) * 160;
        scored.push([m, sc]);
        if (sc > curScore) { curScore = sc; curBest = m; }
        if (sc > alpha) alpha = sc;
      }
      bestMove = curBest;
      bestScore = curScore;
      depthDone = d;
      ordered = scored.sort((a, b) => b[1] - a[1]).map((x) => x[0]);
      if (Math.abs(curScore) > MATE - 100) break;
      if (Date.now() - t0 > limit * 0.45) break; // nächste Tiefe würde nicht fertig
    }
  } catch (e) {
    if (!(e instanceof Timeout)) throw e;
  }
  stats.depth = depthDone;
  stats.nodes = nodes;
  stats.ms = Date.now() - t0;
  stats.score = bestScore;
  const m = bestMove;
  const alg = (sq) => 'abcdefgh'[sq & 7] + (8 - (sq >> 4));
  const out = { from: alg(m.from), to: alg(m.to) };
  if (m.promotion) out.promo = m.promotion;
  return out;
}

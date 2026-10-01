// Bot für Ludo (rein, ohne DOM).
// level 1 = leicht: meist zufällig, holt aber mit einer 6 immer eine Figur raus
// level 2 = mittel: bewertet jede Folgestellung (Fortschritt, Schlagen, Ziel, Gefahr durch Gegner 1–6 Felder dahinter)
// level 3 = stark: Expectimax über die nächsten Würfe (Gegner spielen wie Stufe 2), iterativ vertiefend in timeMs
import * as E from './engine.js';

const { TRACK, GOAL } = E;
const WIN = 10000;

// Wert einer Figur in „Feldern“: draußen sein ist viel wert (eine 6 abzuwarten kostet Züge), Ziel ist sicher
export const _P = { out: 8, goal: 14, risk: 0.8, lead: 0.4 };
const pieceValue = p => (p < 0 ? 0 : p >= GOAL ? p + _P.goal : p + _P.out);

// Bedrohung je absolutem Bahnfeld: Anzahl verschiedener Würfelzahlen, mit denen ein Gegner von `seat` dort landen kann
function threats(state, seat) {
  const n = state.n, cnt = new Array(TRACK).fill(0), seen = new Array(TRACK).fill(0);
  for (let s = 0; s < n; s++) {
    if (s === seat) continue;
    seen.fill(0);   // je Gegner eigene Würfelzahlen
    const c = state.colors[s] * 10, ps = state.pieces[s];
    let inHouse = false, startOwn = false;
    for (const p of ps) {
      if (p < 0) inHouse = true;
      else if (p === 0) startOwn = true;
      if (p < 0 || p >= TRACK) continue;
      for (let d = 1; d <= 6 && p + d < TRACK; d++) {
        const a = (c + p + d) % TRACK, bit = 1 << d;
        if (!(seen[a] & bit)) { seen[a] |= bit; cnt[a]++; }
      }
    }
    // Rauskommen mit 6 auf das eigene Startfeld schlägt dort
    if (inHouse && !startOwn) {
      const a = c % TRACK, bit = 1 << 6;
      if (!(seen[a] & bit)) { seen[a] |= bit; cnt[a]++; }
    }
  }
  return cnt;
}

const RISK = [0, 1 / 6, 11 / 36, 0.42, 0.52, 0.6, 0.67, 0.72, 0.77, 0.8, 0.83, 0.86, 0.88];

function seatValue(state, s) {
  const cnt = threats(state, s), c = state.colors[s] * 10;
  let v = 0;
  for (const p of state.pieces[s]) {
    const pv = pieceValue(p);
    v += pv;
    if (p >= 0 && p < TRACK) v -= _P.risk * RISK[Math.min(12, cnt[(c + p) % TRACK])] * pv;
  }
  return v;
}

// Statische Bewertung aus Sicht von `me`
export function heuristic(state, me) {
  if (state.winner !== null) return state.winner === me ? WIN : -WIN;
  const vs = [];
  for (let s = 0; s < state.n; s++) vs.push(seatValue(state, s));
  let sum = 0, max = -Infinity;
  for (let s = 0; s < state.n; s++) if (s !== me) { sum += vs[s]; max = Math.max(max, vs[s]); }
  const others = state.n === 2 ? sum : (1 - _P.lead) * sum / (state.n - 1) + _P.lead * max;
  return vs[me] - others;
}

function greedy(state, seat, rng) {
  const moves = E.legalMoves(state);
  if (moves.length === 1) return moves[0];
  let best = null, bv = -Infinity;
  for (const m of moves) {
    const v = heuristic(E.applyMove(state, m), seat) + (rng ? rng() * 1e-3 : 0);
    if (v > bv) { bv = v; best = m; }
  }
  return best;
}

class Timeout extends Error {}

// Erwartungswert nach `layers` weiteren Würfen (Zustand in Phase 'roll' oder 'over')
function expect(state, me, layers, ctx) {
  if (state.winner !== null) return state.winner === me ? WIN : -WIN;
  if (layers === 0) return heuristic(state, me);
  if (++ctx.nodes % 64 === 0 && performance.now() > ctx.deadline) throw new Timeout();
  const r = E.applyMove(state, { type: 'roll' });
  let sum = 0;
  for (let d = 1; d <= 6; d++) {
    const t = E.applyChance(r, [d]);
    if (t.phase !== 'move') { sum += expect(t, me, layers - 1, ctx); continue; }
    const moves = E.legalMoves(t);
    if (t.turn === me) {
      let best = -Infinity;
      for (const m of moves) best = Math.max(best, expect(E.applyMove(t, m), me, layers - 1, ctx));
      sum += best;
    } else sum += expect(E.applyMove(t, greedy(t, t.turn)), me, layers - 1, ctx);
  }
  return sum / 6;
}

function search(state, me, timeMs, rng, maxLayers = 4) {
  const moves = E.legalMoves(state);
  const ctx = { deadline: performance.now() + Math.min(1100, Math.max(5, timeMs)), nodes: 0 };
  let best = greedy(state, me, rng);
  for (let layers = 1; layers <= maxLayers; layers++) {
    try {
      let bm = null, bv = -Infinity;
      for (const m of moves) {
        const v = expect(E.applyMove(state, m), me, layers, ctx) + rng() * 1e-6;
        if (v > bv) { bv = v; bm = m; }
      }
      best = bm;
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
    if (performance.now() > ctx.deadline) break;
  }
  return best;
}

export function chooseMove(state, { level = 2, rng = Math.random, timeMs = 400, depth = 4 } = {}) {
  const moves = E.legalMoves(state);
  if (moves.length <= 1) return moves.length ? moves[0] : null;
  const me = E.currentPlayer(state);
  if (level <= 1) {
    const out = moves.filter(m => state.pieces[me][m.piece] < 0);
    if (out.length) return out[0];
    return moves[Math.floor(rng() * moves.length)];
  }
  if (level === 2) return greedy(state, me, rng);
  return search(state, me, timeMs, rng, depth);
}

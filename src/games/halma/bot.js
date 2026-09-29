// Übungs-Bot für Stern-Halma (rein, ohne DOM).
//   Stufe 1 leicht:  zufällig unter den Zügen mit Fortschritt (Abstand zur Zielspitze sinkt).
//   Stufe 2 mittel:  gierig nach Wert-Gewinn; Wert je Stein = Abstand zur Zielspitze + Nachzügler-Aufschlag
//                    (quadratisch) + Randabweichung außerhalb des Ziels. Sprungketten kommen vollständig
//                    aus der Zugsuche; die Zielzacke füllt sich dadurch von der Spitze her.
//   Stufe 3 stark:   eigene 2-Zug-Planung (bester Folgezug nach jedem eigenen Zug), bei 2 Spielern zusätzlich
//                    Abzug für den besten Antwortzug des Gegners; Zeitlimit timeMs.
// Zurück kommt immer ein Objekt aus legalMoves(state).
import {
  legalMoves, targetCamp, NEIGHBORS, JUMPS, HOLES, TIPS, DIST, CAMP_OF, SIZE
} from './engine.js';

const ALPHA = 0.04;    // Nachzügler-Aufschlag (d²)
const LAT = 0.25;      // Randabweichung außerhalb der Zielzacke
const EPS = 1e-9;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// G[k][h] = „Kosten“ eines Steins auf Loch h mit Zielzacke k (kleiner = besser)
const G = TIPS.map((tip, k) => {
  const t = HOLES[tip], len = Math.hypot(t.x, t.y), ux = t.x / len, uy = t.y / len;
  return Float64Array.from(HOLES, (p, h) => {
    const d = DIST[k][h];
    const lat = CAMP_OF[h] === k ? 0 : Math.abs(p.x * uy - p.y * ux);
    return d + ALPHA * d * d + LAT * lat;
  });
});

// Alle Züge (from, to) eines Sitzes auf einem Brett-Array; jeweils einmal je Ziel
const PREV = new Uint8Array(SIZE);
function genPairs(board, seat, out) {
  out.length = 0;
  const queue = [];
  for (let from = 0; from < SIZE; from++) {
    if (board[from] !== seat) continue;
    const nb = NEIGHBORS[from];
    for (let d = 0; d < 6; d++) {
      const t = nb[d];
      if (t >= 0 && board[t] === -1) out.push(from, t);
    }
    PREV.fill(0);
    PREV[from] = 1;
    queue.length = 0;
    let cur = from, head = -1;
    for (;;) {
      const jn = NEIGHBORS[cur], jp = JUMPS[cur];
      for (let d = 0; d < 6; d++) {
        const land = jp[d];
        if (land < 0 || board[land] !== -1 || PREV[land]) continue;
        const over = jn[d];
        if (over === from || board[over] === -1) continue;
        PREV[land] = 1;
        queue.push(land);
        out.push(from, land);
      }
      if (++head >= queue.length) break;
      cur = queue[head];
    }
  }
  return out;
}

// Bester Gewinn (G[from] − G[to]) eines Sitzes auf dem Brett
function bestGain(board, seat, g, buf) {
  genPairs(board, seat, buf);
  let best = -Infinity;
  for (let i = 0; i < buf.length; i += 2) {
    const v = g[buf[i]] - g[buf[i + 1]];
    if (v > best) best = v;
  }
  return best;
}

export function chooseMove(state, { level = 2, rng = Math.random, timeMs = 400 } = {}) {
  const moves = legalMoves(state);
  if (moves.length <= 1) return moves.length ? moves[0] : null;
  const r = typeof rng === 'function' ? rng : Math.random;
  const seat = state.turn, k = targetCamp(state.n, seat);
  const pick = list => list[Math.floor(r() * list.length)];
  const dest = m => m.path[m.path.length - 1];

  if (level <= 1) {
    const dist = DIST[k];
    const fwd = moves.filter(m => dist[dest(m)] < dist[m.from]);
    return pick(fwd.length ? fwd : moves);
  }

  const g = G[k];
  const scores = moves.map(m => g[m.from] - g[dest(m)]);
  if (level >= 3) {
    const t0 = now(), ms = Number.isFinite(timeMs) && timeMs > 0 ? timeMs : 400;
    const board = state.board.slice(), buf = [];
    const opp = state.n === 2 ? 1 - seat : -1;
    const og = opp >= 0 ? G[targetCamp(state.n, opp)] : null;
    // Reihenfolge nach Sofortgewinn: bei Zeitnot sind die aussichtsreichsten Züge schon geprüft
    const order = moves.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
    const deep = scores.slice();
    for (const i of order) {
      if (now() - t0 > ms) break;
      const m = moves[i], to = dest(m);
      board[m.from] = -1;
      board[to] = seat;
      const g2 = bestGain(board, seat, g, buf);
      let v = scores[i] + Math.max(0, g2) * 0.9;
      if (og) v -= 0.3 * Math.max(0, bestGain(board, opp, og, buf));
      deep[i] = v + scores[i] * 0.01;   // bei Gleichstand den sofortigen Fortschritt vorziehen
      board[to] = -1;
      board[m.from] = seat;
    }
    return pickBest(moves, deep, pick);
  }
  return pickBest(moves, scores, pick);
}

function pickBest(moves, scores, pick) {
  let best = -Infinity;
  for (const s of scores) if (s > best) best = s;
  const top = [];
  for (let i = 0; i < moves.length; i++) if (scores[i] >= best - EPS) top.push(moves[i]);
  return pick(top);
}

export const _G = G;

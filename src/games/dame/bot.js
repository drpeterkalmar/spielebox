// Übungs-Bot für Dame (rein, ohne DOM).
// level 1 = leicht: meist zufällig, schlägt und pustet aber bevorzugt
// level 2 = mittel: Alpha-Beta Tiefe 4 mit Schlag-Verlängerung (deterministisch bei gleichem rng)
// level 3 = stark: iterative Vertiefung bis timeMs
import { legalMoves, normalizeOptions, positionKey, _gen, _play } from './engine.js';

const WIN = 1000000;
const ABORT = { abbruch: true };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function chooseMove(state, { level = 2, rng = Math.random, timeMs = 400 } = {}) {
  const moves = legalMoves(state);
  if (moves.length <= 1) return moves.length ? moves[0] : null;
  const r = typeof rng === 'function' ? rng : Math.random;
  if (level <= 1) return easy(moves, r);
  const ms = Number.isFinite(timeMs) && timeMs > 0 ? timeMs : 400;
  return think(state, moves, level >= 3 ? 3 : 2, r, ms);
}

// ---------- level 1 ----------

function easy(moves, rng) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const puste = moves.filter((m) => m.puste !== undefined);
  if (puste.length && rng() < 0.9) return pick(puste);
  const caps = moves.filter((m) => m.cap && m.cap.length);
  if (caps.length && rng() < 0.9) {
    const most = Math.max(...caps.map((m) => m.cap.length));
    return pick(caps.filter((m) => m.cap.length === most));
  }
  return pick(moves);
}

// ---------- Bewertung ----------

const TABLES = {};

// Feldwerte je Brett und Regel: Material, Vorrücken, Zentrum, Grundlinie, lange Diagonale
function tables(n, o) {
  const key = `${n}|${o.rules}|${o.kurz}`;
  if (TABLES[key]) return TABLES[key];
  const N = n * n, K = o.kurz ? 180 : o.rules === 'international' ? 350 : 300;
  const manW = new Int16Array(N), manB = new Int16Array(N), king = new Int16Array(N);
  const row = new Int8Array(N), col = new Int8Array(N), dark = [];
  const adv = (k) => Math.round(k * k * 0.35 + k * 1.5);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if ((r + c) % 2 !== 1) continue;
      const i = r * n + c;
      dark.push(i);
      row[i] = r;
      col[i] = c;
      const center = c >= 2 && c <= n - 3 ? 3 : 0;
      manW[i] = 100 + adv(n - 1 - r) + center + (r === n - 1 ? 5 : 0);
      manB[i] = 100 + adv(r) + center + (r === 0 ? 5 : 0);
      king[i] = K + (r + c === n - 1 ? 6 : 0) + (r >= 2 && r <= n - 3 && center ? 3 : 0);
    }
  }
  return (TABLES[key] = { K, manW, manB, king, row, col, dark, endgame: n === 10 ? 12 : 8 });
}

function evaluate(ctx, nd) {
  const b = nd.board, T = ctx.T, dark = T.dark;
  let w = 0, bl = 0, wm = 0, bm = 0, wk = 0, bk = 0;
  for (let t = 0; t < dark.length; t++) {
    const i = dark[t], v = b[i];
    if (v === 0) continue;
    if (v === 1) { w += T.manW[i]; wm++; }
    else if (v === -1) { bl += T.manB[i]; bm++; }
    else if (v === 2) { w += T.king[i]; wk++; }
    else { bl += T.king[i]; bk++; }
  }
  let score = w - bl;
  const mw = wm * 100 + wk * T.K, mb = bm * 100 + bk * T.K;
  score += ((mw - mb) * 150) / (mw + mb + 1);            // bei Vorteil abtauschen
  if (mw !== mb && (wk || bk) && wm + bm + wk + bk <= T.endgame) score += hunt(b, T, mw > mb ? 1 : -1);
  return nd.turn === 0 ? score : -score;
}

// Endspiel: Damen der stärkeren Seite rücken an gegnerische Figuren heran (aus Sicht Weiß)
function hunt(b, T, side) {
  const dark = T.dark, row = T.row, col = T.col;
  let sum = 0;
  for (let t = 0; t < dark.length; t++) {
    const i = dark[t];
    if (b[i] !== 2 * side) continue;
    let best = 99;
    for (let u = 0; u < dark.length; u++) {
      const j = dark[u];
      if (b[j] * side >= 0) continue;
      const d = Math.max(Math.abs(row[i] - row[j]), Math.abs(col[i] - col[j]));
      if (d < best) best = d;
    }
    if (best < 99) sum += best;
  }
  return -3 * sum * side;
}

// ---------- Suche ----------

function nodeMoves(ctx, nd) {
  const gen = _gen(nd.board, ctx.n, nd.turn, ctx.o);
  if (!nd.pb || nd.pusted) return gen;
  const out = nd.pb.map((i) => ({ puste: i }));
  for (const m of gen) out.push(m);
  return out;
}

// Folgeknoten; beim Pusten zieht dieselbe Seite weiter
function child(ctx, nd, m, full) {
  if (m.puste !== undefined) {
    const b = nd.board.slice();
    b[m.puste] = 0;
    return { board: b, turn: nd.turn, pb: null, pusted: true };
  }
  let pb = null;
  if (ctx.o.pusten && m.cap.length === 0) {
    for (const x of full) {
      if (x.puste !== undefined || !x.cap.length) continue;
      const sq = x.from === m.from ? m.path[0] : x.from;
      if (!pb) pb = [sq];
      else if (!pb.includes(sq)) pb.push(sq);
    }
  }
  return { board: _play(nd.board, ctx.n, m), turn: 1 - nd.turn, pb, pusted: false };
}

function prio(ctx, nd, m) {
  if (m.puste !== undefined) return 1e7;
  if (m.cap.length) return 1e6 * m.cap.length;
  const v = nd.board[m.from], to = m.path[0], r = (to / ctx.n) | 0;
  if ((v === 1 && r === 0) || (v === -1 && r === ctx.n - 1)) return 5e5;
  return ctx.hist[m.from * ctx.N + to];
}

function ordered(ctx, nd, moves) {
  const keyed = moves.map((m) => [prio(ctx, nd, m), m]);
  keyed.sort((a, b) => b[0] - a[0]);
  return keyed.map((x) => x[1]);
}

function search(ctx, nd, depth, alpha, beta, ply) {
  if ((++ctx.nodes & 255) === 0 && now() > ctx.deadline) throw ABORT;
  const full = nodeMoves(ctx, nd);
  if (full.length === 0) return -WIN + ply;                  // keine Züge → verloren
  let moves = full, best = -Infinity;
  if (depth <= 0) {
    if (!ctx.o.pusten) {
      // Schlag-Verlängerung: nur weiter, solange geschlagen werden muss
      if (full[0].cap.length === 0 || ply >= ctx.qmax) return evaluate(ctx, nd);
    } else {
      const stand = evaluate(ctx, nd);
      if (ply >= ctx.qmax || stand >= beta) return stand;
      moves = full.filter((m) => m.puste !== undefined || m.cap.length > 0);
      if (!moves.length) return stand;
      best = stand;
      if (stand > alpha) alpha = stand;
    }
  }
  if (moves.length > 1) moves = ordered(ctx, nd, moves);
  for (const m of moves) {
    const c = child(ctx, nd, m, full);
    const v = m.puste !== undefined
      ? search(ctx, c, depth, alpha, beta, ply + 1)
      : -search(ctx, c, depth - 1, -beta, -alpha, ply + 1);
    if (v > best) {
      best = v;
      if (v > alpha) {
        alpha = v;
        if (alpha >= beta) {
          if (m.puste === undefined && !m.cap.length && depth > 0) ctx.hist[m.from * ctx.N + m.path[0]] += depth * depth;
          break;
        }
      }
    }
  }
  return best;
}

function think(state, rootMoves, level, rng, timeMs) {
  const t0 = now();
  const o = normalizeOptions(state.opts), n = state.n;
  const ctx = { n, N: n * n, o, T: tables(n, o), deadline: t0 + timeMs, nodes: 0, qmax: 0, hist: new Int32Array(n * n * n * n) };
  const root = { board: state.board.slice(), turn: state.turn, pb: null, pusted: !!state.pusted };

  // Wurzelzüge mit rng mischen: Abwechslung, bei gleichem rng reproduzierbar
  const order = rootMoves.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  // Züge, die sofort Remis ergeben (Wiederholung, 25-Züge-Regel), zählen 0
  const drawn = new Set();
  for (const m of rootMoves) {
    if (m.puste !== undefined || m.cap.length || Math.abs(state.board[m.from]) !== 2) continue;
    const key = positionKey({ n, board: _play(state.board, n, m), turn: 1 - state.turn });
    if (((state.rep && state.rep[key]) || 0) + 1 >= 3 || (state.quiet | 0) + 1 >= 50) drawn.add(m);
  }

  let best = order[0];
  const maxDepth = level === 2 ? 4 : 64;
  for (let depth = 1; depth <= maxDepth; depth++) {
    ctx.qmax = depth + 12;
    let alpha = -Infinity, iterBest = null, iterScore = -Infinity;
    try {
      for (const m of order) {
        let v = 0;
        if (!drawn.has(m)) {
          const c = child(ctx, root, m, rootMoves);
          v = m.puste !== undefined
            ? search(ctx, c, depth, alpha, Infinity, 1)
            : -search(ctx, c, depth - 1, -Infinity, -alpha, 1);
        }
        if (v > iterScore) {
          iterScore = v;
          iterBest = m;
          if (v > alpha) alpha = v;
        }
      }
    } catch (e) {
      if (e !== ABORT) throw e;
      break;                                      // Zeit um: letzte vollständige Tiefe gilt
    }
    best = iterBest;
    order.splice(order.indexOf(best), 1);
    order.unshift(best);
    if (Math.abs(iterScore) >= WIN - 1000) break; // Gewinn/Verlust sicher
    if (level === 3 && now() - t0 > timeMs * 0.45) break;
  }
  return best;
}

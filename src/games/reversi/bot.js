// Übungs-Bot für Reversi (rein, ohne DOM), rechnet auf Bitbrettern der Engine.
// level 1 = leicht: Tiefe 1 – nimmt meist die Ecke, sonst halb zufällig, halb „möglichst viele umdrehen“
// level 2 = mittel: Alpha-Beta Tiefe 4 mit Bewertung (Mobilität, Ecken, X/C-Felder, Stabilität, Steine)
// level 3 = stark: iterative Vertiefung bis timeMs (höchstens 1,2 s), ab 12 leeren Feldern exakt bis zum Ende
import { legalMoves, flipsFor, _bits, _moves, _flips, _M, _F, _pop, _heur, _final } from './engine.js';

const WIN = 1000;           // gewonnene Endstellung: WIN + Differenz (immer besser als jede Schätzung)
const SOLVE = 12;           // Stufe 3: exakt ab so vielen leeren Feldern
const MAX_MS = 1200;
const ABORT = { abbruch: true };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Feldgewichte nur für die Zugsortierung und Stufe 1
const W = [
  100, -20, 10, 5, 5, 10, -20, 100,
  -20, -50, -2, -2, -2, -2, -50, -20,
  10, -2, 1, 1, 1, 1, -2, 10,
  5, -2, 1, 0, 0, 1, -2, 5,
  5, -2, 1, 0, 0, 1, -2, 5,
  10, -2, 1, 1, 1, 1, -2, 10,
  -20, -50, -2, -2, -2, -2, -50, -20,
  100, -20, 10, 5, 5, 10, -20, 100,
];
const CORNER = new Set([0, 7, 56, 63]), XSQ = new Set([9, 14, 49, 54]);

export function chooseMove(state, { level = 2, rng = Math.random, timeMs = 400 } = {}) {
  const moves = legalMoves(state);
  if (moves.length <= 1) return moves.length ? moves[0] : null;
  const r = typeof rng === 'function' ? rng : Math.random;
  if (level <= 1) return easy(state, moves, r);
  const [bh, bl, wh, wl] = _bits(state.board);
  const p = state.turn === 0 ? [bh, bl, wh, wl] : [wh, wl, bh, bl];
  const sq = shuffle(moves.map((m) => m.i), r).sort((a, b) => W[b] - W[a]);
  const best = level >= 3
    ? strong(p, sq, Math.min(MAX_MS, Number.isFinite(timeMs) && timeMs > 0 ? timeMs : 400))
    : fixed(p, sq, 4);
  return { i: best };
}

function shuffle(a, rng) {
  for (let k = a.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [a[k], a[j]] = [a[j], a[k]];
  }
  return a;
}

// ---------- level 1 ----------

function easy(state, moves, rng) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const corners = moves.filter((m) => CORNER.has(m.i));
  if (corners.length && rng() < 0.75) return pick(corners);
  if (rng() < 0.5) {
    const n = moves.map((m) => flipsFor(state, m.i).length), most = Math.max(...n);
    return pick(moves.filter((_, k) => n[k] === most));
  }
  let m = pick(moves);
  if (XSQ.has(m.i) && rng() < 0.6) m = pick(moves);   // X-Feld meist vermeiden
  return m;
}

// ---------- Suche ----------

let deadline = Infinity, nodes = 0;
// Zuglisten je Suchtiefe (keine Speicheranforderung im Suchbaum)
const SQ = Array.from({ length: 128 }, () => new Int8Array(40));
const KEY = Array.from({ length: 128 }, () => new Float64Array(40));

function tick() {
  if ((++nodes & 1023) === 0 && now() > deadline) throw ABORT;
}

// Zugfelder in SQ[ply] sammeln und sortieren; liefert Anzahl. sorted: Gegner-Mobilität (fastest first)
function gather(ph, pl, oh, ol, mh, ml, ply, sorted) {
  const sq = SQ[ply], key = KEY[ply];
  let n = 0;
  while (ml) {
    const b = ml & -ml;
    sq[n++] = 31 - Math.clz32(b);
    ml ^= b;
  }
  while (mh) {
    const b = mh & -mh;
    sq[n++] = 63 - Math.clz32(b);
    mh ^= b;
  }
  for (let k = 0; k < n; k++) {
    const s = sq[k];
    let v = W[s];
    if (sorted) {
      _flips(ph, pl, oh, ol, s);
      const nph = ph | _F.h | (s >= 32 ? 1 << (s - 32) : 0), npl = pl | _F.l | (s < 32 ? 1 << s : 0);
      _moves(oh & ~_F.h, ol & ~_F.l, nph, npl);
      v -= 15 * (_pop(_M.h) + _pop(_M.l));
    }
    key[k] = v;
  }
  // Einfügesortierung absteigend
  for (let a = 1; a < n; a++) {
    const s = sq[a], v = key[a];
    let b = a - 1;
    while (b >= 0 && key[b] < v) {
      sq[b + 1] = sq[b];
      key[b + 1] = key[b];
      b--;
    }
    sq[b + 1] = s;
    key[b + 1] = v;
  }
  return n;
}

function terminal(ph, pl, oh, ol) {
  const f = _final(ph, pl, oh, ol);
  return f > 0 ? WIN + f : f < 0 ? -WIN + f : 0;
}

// Alpha-Beta (Negamax) mit Schätzung an den Blättern
function search(ph, pl, oh, ol, depth, alpha, beta, ply) {
  tick();
  _moves(ph, pl, oh, ol);
  const mh = _M.h, ml = _M.l;
  if (!(mh | ml)) {
    _moves(oh, ol, ph, pl);
    if (!(_M.h | _M.l)) return terminal(ph, pl, oh, ol);
    return -search(oh, ol, ph, pl, depth, -beta, -alpha, ply + 1);   // Passen kostet keine Tiefe
  }
  if (depth <= 0) return _heur(ph, pl, oh, ol);
  const n = gather(ph, pl, oh, ol, mh, ml, ply, depth >= 3);
  const sq = SQ[ply];
  let best = -Infinity;
  for (let k = 0; k < n; k++) {
    const s = sq[k];
    _flips(ph, pl, oh, ol, s);
    const fh = _F.h, fl = _F.l;
    const v = -search(oh & ~fh, ol & ~fl, ph | fh | (s >= 32 ? 1 << (s - 32) : 0), pl | fl | (s < 32 ? 1 << s : 0),
      depth - 1, -beta, -alpha, ply + 1);
    if (v > best) {
      best = v;
      if (v > alpha) {
        alpha = v;
        if (alpha >= beta) break;
      }
    }
  }
  return best;
}

// exakte Endspiel-Suche (Ergebnis in Steinen, ohne WIN-Aufschlag)
function exact(ph, pl, oh, ol, alpha, beta, passed, ply, empty) {
  tick();
  _moves(ph, pl, oh, ol);
  const mh = _M.h, ml = _M.l;
  if (!(mh | ml)) {
    if (passed) return _final(ph, pl, oh, ol);
    return -exact(oh, ol, ph, pl, -beta, -alpha, true, ply + 1, empty);
  }
  const n = gather(ph, pl, oh, ol, mh, ml, ply, empty > 6);
  const sq = SQ[ply];
  let best = -Infinity;
  for (let k = 0; k < n; k++) {
    const s = sq[k];
    _flips(ph, pl, oh, ol, s);
    const fh = _F.h, fl = _F.l;
    const v = -exact(oh & ~fh, ol & ~fl, ph | fh | (s >= 32 ? 1 << (s - 32) : 0), pl | fl | (s < 32 ? 1 << s : 0),
      -beta, -alpha, false, ply + 1, empty - 1);
    if (v > best) {
      best = v;
      if (v > alpha) {
        alpha = v;
        if (alpha >= beta) break;
      }
    }
  }
  return best;
}

// Wurzel: bester Zug aus der Liste (Reihenfolge = Vorsortierung, bei Gleichstand gewinnt der frühere)
function root(p, list, fn) {
  const [ph, pl, oh, ol] = p;
  let best = list[0], alpha = -Infinity;
  for (const s of list) {
    _flips(ph, pl, oh, ol, s);
    const fh = _F.h, fl = _F.l;
    const v = -fn(oh & ~fh, ol & ~fl, ph | fh | (s >= 32 ? 1 << (s - 32) : 0), pl | fl | (s < 32 ? 1 << s : 0), -alpha);
    if (v > alpha) {
      alpha = v;
      best = s;
    }
  }
  return best;
}

function fixed(p, list, depth) {
  deadline = Infinity;
  return root(p, list, (a, b, c, d, beta) => search(a, b, c, d, depth - 1, -Infinity, beta, 1));
}

function strong(p, list, ms) {
  const t0 = now();
  deadline = t0 + ms;
  nodes = 0;
  const empty = 64 - _pop(p[0]) - _pop(p[1]) - _pop(p[2]) - _pop(p[3]);
  if (empty <= SOLVE) {
    try {
      return root(p, list, (a, b, c, d, beta) => exact(a, b, c, d, -65, Math.min(65, beta), false, 1, empty - 1));
    } catch (e) {
      if (e !== ABORT) throw e;
      deadline = Infinity;
      return fixed(p, list, 4);                 // Zeit aus → solide Schätzung
    }
  }
  let best = list[0], order = list.slice();
  for (let depth = 1; depth <= empty; depth++) {
    try {
      best = root(p, order, (a, b, c, d, beta) => search(a, b, c, d, depth - 1, -Infinity, beta, 1));
    } catch (e) {
      if (e !== ABORT) throw e;
      break;
    }
    order = [best, ...order.filter((s) => s !== best)];
    if (now() - t0 > ms * 0.45) break;          // nächste Tiefe passt nicht mehr in die Zeit
  }
  deadline = Infinity;
  return best;
}

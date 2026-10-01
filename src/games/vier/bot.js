// Bot für Vier in einer Reihe (rein, ohne DOM).
// Alpha-Beta (Negamax) auf Bitboards, Zugsortierung Mitte zuerst + Anzahl neuer Gewinnfelder,
// Transpositionstabelle, erzwungene Züge ohne Tiefenverlust, Züge unter gegnerischen Gewinnfeldern gestrichen.
// level 1 = leicht: Tiefe 2 mit viel Zufall, gewinnt sofort, blockt meist (90 %)
// level 2 = mittel: Tiefe 7
// level 3 = stark: iterative Vertiefung bis timeMs (höchstens 1,2 s)
// Bei gleich guten Zügen entscheidet rng (Abwechslung, bei gleichem rng reproduzierbar).
import { legalMoves, COLS, ROWS, _bb } from './engine.js';

const { popcount, hasBit, winCells, toBits } = _bb;
const MATE = 1000;            // Gewinn mit Stein Nr. k: MATE − k
const ABORT = { abbruch: true };
const ORDER = [3, 2, 4, 1, 5, 0, 6];
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Transpositionstabelle (bleibt zwischen Zügen erhalten; Schlüssel = Stellung + Maske, eindeutig)
const TT_SIZE = 1 << 20;
const ttKey = new Float64Array(TT_SIZE);
const ttVal = new Int16Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Int8Array(TT_SIZE);      // 0 leer, 1 exakt, 2 untere Schranke, 3 obere Schranke
const ttMove = new Int8Array(TT_SIZE);

const COL_MASK = c => (0x3f << ((c % 4) * 7));   // in lo (c < 4) bzw. hi (c ≥ 4, c − 4)
const C3 = COL_MASK(3), C2 = COL_MASK(2), C1 = COL_MASK(1), C4 = 0x3f, C5 = 0x3f << 7;

let H = new Int8Array(COLS);
let deadline = Infinity, nodes = 0;

function centre(lo, hi) {
  return 3 * popcount(lo & C3) + 2 * (popcount(lo & C2) + popcount(hi & C4)) + (popcount(lo & C1) + popcount(hi & C5));
}

// Gewinnfelder je Spalte (Zugzwang nach Allis, vereinfacht): zählt vor allem das unterste Feld einer Spalte.
// Rot nützen Felder in ungeraden Reihen (Index 0, 2, 4), Gelb in geraden (Index 1, 3, 5).
// Ein Feld über dem untersten gegnerischen Gewinnfeld derselben Spalte ist fast wertlos.
const W_GOOD = 16, W_BAD = 5, W_HIGH = 1;

function threatScore(al, ah, bl, bh, seatA) {
  let v = 0;
  for (let c = 0; c < COLS; c++) {
    const lo = c < 4, sh = lo ? c * 7 : (c - 4) * 7;
    const ca = ((lo ? al : ah) >>> sh) & 0x3f, cb = ((lo ? bl : bh) >>> sh) & 0x3f;
    if (!ca) continue;
    const lowA = 31 - Math.clz32(ca & -ca), lowB = cb ? 31 - Math.clz32(cb & -cb) : 9;
    if (lowA < lowB) v += (lowA & 1) === seatA ? W_GOOD : W_BAD;
    else v += W_HIGH;
    v += W_HIGH * (popcount(ca) - 1);
  }
  return v;
}

// Heuristik aus Sicht des Spielers am Zug (n Steine liegen → Sitz n % 2)
function leaf(cl, ch, ol, oh, wl, wh, xl, xh, n) {
  const s = n & 1;
  return threatScore(wl, wh, xl, xh, s) - threatScore(xl, xh, wl, wh, 1 - s) + centre(cl, ch) - centre(ol, oh);
}

const kids = new Int8Array(64 * 8), kidScore = new Int16Array(64 * 8);

function negamax(cl, ch, ml, mh, n, depth, alpha, beta) {
  if ((++nodes & 1023) === 0 && now() > deadline) throw ABORT;
  winCells(cl, ch, ml, mh);
  const wl = _bb.RL, wh = _bb.RH;
  for (let c = 0; c < COLS; c++) if (H[c] < ROWS && hasBit(wl, wh, c * 7 + H[c])) return MATE - n - 1;
  if (n >= 41) return 0;                                  // letzter Stein gewinnt nicht → Remis
  const ol = ml ^ cl, oh = mh ^ ch;
  winCells(ol, oh, ml, mh);
  const xl = _bb.RL, xh = _bb.RH;
  let forced = -1, nForced = 0;
  for (let c = 0; c < COLS; c++) if (H[c] < ROWS && hasBit(xl, xh, c * 7 + H[c])) { nForced++; forced = c; }
  if (nForced > 1) return -(MATE - n - 2);
  // Kandidaten
  const base = n * 8;
  let k = 0;
  if (nForced === 1) kids[base + k++] = forced;
  else {
    for (const c of ORDER) {
      if (H[c] >= ROWS) continue;
      if (H[c] < ROWS - 1 && hasBit(xl, xh, c * 7 + H[c] + 1)) continue;
      kids[base + k++] = c;
    }
  }
  if (k === 0) return -(MATE - n - 2);
  if (depth <= 0 && nForced === 0) return leaf(cl, ch, ol, oh, wl, wh, xl, xh, n);
  const max = MATE - n - 3;                               // frühester eigener Gewinn
  if (beta > max) { beta = max; if (alpha >= beta) return beta; }
  const a0 = alpha;
  // Transpositionstabelle
  const key = (ch + mh) * 268435456 + (cl + ml);
  const slot = key % TT_SIZE;
  let ttm = -1;
  if (ttKey[slot] === key && ttFlag[slot]) {
    ttm = ttMove[slot];
    if (ttDepth[slot] >= depth) {                         // nur Schnitte, Fenster bleibt (Schranken-Flags exakt)
      const v = ttVal[slot], f = ttFlag[slot];
      if (f === 1 || (f === 2 && v >= beta) || (f === 3 && v <= alpha)) return v;
    }
  }
  // Sortieren: TT-Zug zuerst, dann Anzahl eigener Gewinnfelder nach dem Zug, dann Mitte
  if (k > 1) {
    for (let i = 0; i < k; i++) {
      const c = kids[base + i], b = c * 7 + H[c];
      let pl = cl, ph = ch, nl = ml, nh = mh;
      if (b < 28) { pl |= 1 << b; nl |= 1 << b; } else { ph |= 1 << (b - 28); nh |= 1 << (b - 28); }
      winCells(pl, ph, nl, nh);
      kidScore[base + i] = c === ttm ? 1000 : popcount(_bb.RL) + popcount(_bb.RH);
    }
    for (let i = 1; i < k; i++) {                         // Einfügesortierung, stabil
      const c = kids[base + i], s = kidScore[base + i];
      let j = i - 1;
      while (j >= 0 && kidScore[base + j] < s) {
        kids[base + j + 1] = kids[base + j];
        kidScore[base + j + 1] = kidScore[base + j];
        j--;
      }
      kids[base + j + 1] = c;
      kidScore[base + j + 1] = s;
    }
  }
  const nd = nForced === 1 ? depth : depth - 1;           // erzwungener Zug kostet keine Tiefe
  let best = -Infinity, bestCol = kids[base];
  for (let i = 0; i < k; i++) {
    const c = kids[base + i], b = c * 7 + H[c];
    let nl = ml, nh = mh;
    if (b < 28) nl |= 1 << b; else nh |= 1 << (b - 28);
    H[c]++;
    const v = -negamax(ol, oh, nl, nh, n + 1, nd, -beta, -alpha);
    H[c]--;
    if (v > best) {
      best = v;
      bestCol = c;
      if (v > alpha) {
        alpha = v;
        if (alpha >= beta) break;
      }
    }
  }
  ttKey[slot] = key;
  ttVal[slot] = best;
  ttDepth[slot] = depth;
  ttFlag[slot] = best <= a0 ? 3 : best >= beta ? 2 : 1;
  ttMove[slot] = bestCol;
  return best;
}

// Wurzel: jeder legale Zug wird bewertet (Fenster best − 1, damit Gleichstände exakt sind)
function rootSearch(root, cols, depth) {
  const { cl, ch, ml, mh, n } = root;
  let best = -Infinity, ties = [];
  for (const c of cols) {
    const b = c * 7 + H[c];
    let pl = cl, ph = ch, nl = ml, nh = mh;
    if (b < 28) { pl |= 1 << b; nl |= 1 << b; } else { ph |= 1 << (b - 28); nh |= 1 << (b - 28); }
    let v;
    if (_bb.won(pl, ph)) v = MATE - n - 1;
    else if (n + 1 >= 42) v = 0;
    else {
      H[c]++;
      try {
        v = -negamax(ml ^ cl, mh ^ ch, nl, nh, n + 1, depth - 1, -Infinity, -(best - 1));
      } finally {
        H[c]--;
      }
    }
    if (v > best) { best = v; ties = [c]; } else if (v === best) ties.push(c);
  }
  return { best, ties };
}

function prepare(state) {
  const bits = toBits(state);
  H = bits.h;
  const me = state.turn;
  return {
    cl: me === 0 ? bits.p0l : bits.p1l, ch: me === 0 ? bits.p0h : bits.p1h,
    ml: bits.ml, mh: bits.mh, n: bits.n
  };
}

// Stufe 1: sofort gewinnen, meist blocken, sonst Tiefe 2 mit viel Rauschen
function easy(state, moves, rng) {
  const root = prepare(state);
  const { cl, ch, ml, mh, n } = root;
  winCells(cl, ch, ml, mh);
  const wl = _bb.RL, wh = _bb.RH;
  for (const m of moves) if (hasBit(wl, wh, m.col * 7 + H[m.col])) return m;
  winCells(ml ^ cl, mh ^ ch, ml, mh);
  const xl = _bb.RL, xh = _bb.RH;
  const blocks = moves.filter(m => hasBit(xl, xh, m.col * 7 + H[m.col]));
  if (blocks.length) {
    if (rng() < 0.9) return blocks[Math.floor(rng() * blocks.length)];
    return moves[Math.floor(rng() * moves.length)];   // übersieht die Drohung
  }
  deadline = Infinity;
  let best = -Infinity, pick = moves[0];
  for (const m of moves) {
    const c = m.col, b = c * 7 + H[c];
    let nl = ml, nh = mh;
    if (b < 28) nl |= 1 << b; else nh |= 1 << (b - 28);
    H[c]++;
    let v = n + 1 >= 42 ? 0 : -negamax(ml ^ cl, mh ^ ch, nl, nh, n + 1, 1, -Infinity, Infinity);
    H[c]--;
    if (Math.abs(v) < MATE - 100) v += rng() * 40;   // Rauschen nur bei offenen Stellungen
    if (v > best) { best = v; pick = m; }
  }
  return pick;
}

function think(state, moves, level, rng, timeMs) {
  const t0 = now();
  const root = prepare(state);
  let cols = moves.map(m => m.col);
  // rng-Mischung, dann Mitte zuerst (stabil) → Gleichstände zufällig, Sortierung gut
  for (let i = cols.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cols[i], cols[j]] = [cols[j], cols[i]];
  }
  cols.sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3));
  const maxDepth = level === 2 ? 7 : 42 - root.n;
  deadline = t0 + (level === 2 ? Math.max(timeMs, 1500) : timeMs);
  nodes = 0;
  let ties = [cols[0]], reached = 0, score = 0;
  for (let d = 1; d <= maxDepth; d++) {
    let r;
    try {
      r = rootSearch(root, cols, d);
    } catch (e) {
      if (e !== ABORT) throw e;
      break;                                             // Zeit um: letzte vollständige Tiefe gilt
    }
    ties = r.ties;
    reached = d;
    score = r.best;
    cols = [...r.ties, ...cols.filter(c => !r.ties.includes(c))];
    if (Math.abs(r.best) >= MATE - 42) break;            // Gewinn/Verlust sicher
    if (level === 3 && now() - t0 > timeMs * 0.6) break; // nächste Tiefe passt nicht mehr
  }
  lastInfo = { depth: reached, nodes, ms: now() - t0, score };
  const col = ties[Math.floor(rng() * ties.length)];
  return moves.find(m => m.col === col);
}

// Für Tests: Tiefe/Knoten der letzten Suche
export let lastInfo = { depth: 0, nodes: 0, ms: 0, score: 0 };

export function chooseMove(state, { level = 2, rng = Math.random, timeMs = 400 } = {}) {
  const moves = legalMoves(state);
  if (moves.length <= 1) return moves.length ? moves[0] : null;
  const r = typeof rng === 'function' ? rng : Math.random;
  if (level <= 1) return easy(state, moves, r);
  const ms = Number.isFinite(timeMs) && timeMs > 0 ? Math.min(timeMs, 1200) : 400;
  return think(state, moves, level >= 3 ? 3 : 2, r, ms);
}

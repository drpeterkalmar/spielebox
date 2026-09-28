// Übungs-Bot für Mühle.
//   Stufe 1 leicht: meist zufällig, nimmt aber sofortige Mühlen mit und blockt manchmal.
//   Stufe 2 mittel: Alpha-Beta mit fester Tiefe 3 (bei gleichem rng deterministisch).
//   Stufe 3 stark:  iterative Vertiefung mit Transpositionstabelle bis timeMs.
// Intern Bitbretter (24 Bit je Farbe) mit make/unmake; zurück kommt immer ein Objekt aus legalMoves.
import { MILLS, ADJ, legalMoves } from './engine.js';
import { mulberry32 } from '../../rng.js';

const NONE = 31;            // kein from (Setzen) bzw. kein remove
const CLOSE = 1 << 15;      // Zug schließt eine Mühle
const FULL = 0xffffff;
const WIN = 1000000;
const MATE = WIN - 1000;    // Werte jenseits davon sind entschiedene Partien
const INF = 2000000000;
const MAX_PLY = 64;
const MAX_DEPTH = 40;
const MAXM = 640;           // Züge je Ebene (tatsächlich höchstens ca. 330)
const QUIET_LIMIT = 100;    // wie Engine: 100 Halbzüge ohne Mühle = Remis
const EXACT = 1, LOWER = 2, UPPER = 3;
const ABORT = Symbol('abort');
const now = () => performance.now();

// Tabellen
const BIT = Int32Array.from({ length: 24 }, (_, i) => 1 << i);
const MILL = Int32Array.from(MILLS, m => (1 << m[0]) | (1 << m[1]) | (1 << m[2]));
const MA = new Int32Array(24), MB = new Int32Array(24);   // die beiden Mühlen durch jeden Punkt
const ADJM = new Int32Array(24);
for (let k = 0; k < 16; k++) {
  for (const i of MILLS[k]) {
    if (MA[i]) MB[i] = MILL[k];
    else MA[i] = MILL[k];
  }
}
for (let i = 0; i < 24; i++) for (const j of ADJ[i]) ADJM[i] |= 1 << j;

// Zobrist-Schlüssel (zwei 32-Bit-Hälften), fest geseedet
const Z1 = new Int32Array(48), Z2 = new Int32Array(48), ZH1 = new Int32Array(20), ZH2 = new Int32Array(20);
let ZT1 = 0, ZT2 = 0;
{
  const r = mulberry32(0x6d75686c);
  const r32 = () => (r() * 4294967296) | 0;
  for (let i = 0; i < 48; i++) { Z1[i] = r32(); Z2[i] = r32(); }
  for (let i = 0; i < 20; i++) { ZH1[i] = r32(); ZH2[i] = r32(); }
  ZT1 = r32();
  ZT2 = r32();
}

function pc(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}
const low = x => 31 - Math.clz32(x & -x);   // Index des niedrigsten gesetzten Bits

// Suchstellung (modulweit, der Bot rechnet synchron)
const bb = new Int32Array(2), hand = new Int32Array(2), cnt = new Int32Array(2);
let side = 0, quiet = 0, h1 = 0, h2 = 0;
const hist = new Set();     // Partie-Stellungen seit dem letzten unumkehrbaren Zug

const MV = new Int32Array(MAX_PLY * MAXM), SC = new Int32Array(MAX_PLY * MAXM);
const STK = new Int32Array((MAX_PLY + 2) * 10);
const PH1 = new Int32Array(MAX_PLY + 2), PH2 = new Int32Array(MAX_PLY + 2), LI = new Int32Array(MAX_PLY + 2);
const K1 = new Int32Array(MAX_PLY + 2), K2 = new Int32Array(MAX_PLY + 2);
const HIST = new Int32Array(2048);
const ROOT = new Int32Array(MAXM);
let nodes = 0, deadline = 0, useTT = false, rootDone = 0, rootBest = 0;
export const stats = { level: 0, depth: 0, nodes: 0, ms: 0 };   // Diagnose des letzten Aufrufs

// Transpositionstabelle (nur Stufe 3, bei Bedarf angelegt)
const TT_SIZE = 1 << 17, TT_MASK = TT_SIZE - 1;
let ttKey = null, ttScore = null, ttMove = null, ttDepth = null, ttFlag = null;
function ttClear() {
  if (!ttKey) {
    ttKey = new Int32Array(TT_SIZE);
    ttScore = new Int32Array(TT_SIZE);
    ttMove = new Int32Array(TT_SIZE);
    ttDepth = new Int8Array(TT_SIZE);
    ttFlag = new Int8Array(TT_SIZE);
  } else ttFlag.fill(0);
}

function hashOf(b0, b1, hd0, hd1, t) {
  let a = ZH1[hd0] ^ ZH1[10 + hd1], c = ZH2[hd0] ^ ZH2[10 + hd1];
  for (let m = b0; m; m &= m - 1) { const i = low(m); a ^= Z1[i]; c ^= Z2[i]; }
  for (let m = b1; m; m &= m - 1) { const i = low(m); a ^= Z1[24 + i]; c ^= Z2[24 + i]; }
  if (t) { a ^= ZT1; c ^= ZT2; }
  return [a, c];
}
const hkey = (a, c) => (a >>> 0) * 2097152 + (c & 0x1fffff);   // exakt < 2^53

// positionKey der Engine ('w..b…:turn:hand0:hand1') → Hash
function keyHash(key) {
  const [s, t, x, y] = key.split(':');
  if (!s || s.length !== 24) return -1;
  let b0 = 0, b1 = 0;
  for (let i = 0; i < 24; i++) {
    if (s[i] === 'w') b0 |= 1 << i;
    else if (s[i] === 'b') b1 |= 1 << i;
  }
  const [a, c] = hashOf(b0, b1, +x | 0, +y | 0, +t | 0);
  return hkey(a, c);
}

function load(state) {
  bb[0] = bb[1] = 0;
  for (let i = 0; i < 24; i++) {
    const c = state.board[i];
    if (c === 0 || c === 1) bb[c] |= 1 << i;
  }
  hand[0] = state.hand[0];
  hand[1] = state.hand[1];
  cnt[0] = pc(bb[0]);
  cnt[1] = pc(bb[1]);
  side = state.turn;
  quiet = state.sinceMill | 0;
  [h1, h2] = hashOf(bb[0], bb[1], hand[0], hand[1], side);
  hist.clear();
  for (const key of Object.keys(state.rep || {})) {
    const k = keyHash(key);
    if (k >= 0) hist.add(k);
  }
  LI[0] = 0;
  PH1[0] = h1;
  PH2[0] = h2;
}

function removableMask(o) {
  const s = bb[o];
  let inMill = 0;
  for (let k = 0; k < 16; k++) {
    const m = MILL[k];
    if ((s & m) === m) inMill |= m;
  }
  return (s & ~inMill) || s;
}

function add(base, n, from, to, own2, remMask) {
  const code = from | (to << 5);
  if ((own2 & MA[to]) !== MA[to] && (own2 & MB[to]) !== MB[to]) {
    MV[base + n] = code | (NONE << 10);
    return n + 1;
  }
  if (!remMask) {   // Mühle, aber Gegner hat keinen Stein auf dem Brett
    MV[base + n] = code | (NONE << 10) | CLOSE;
    return n + 1;
  }
  for (let m = remMask; m; m &= m - 1) MV[base + n++] = code | (low(m) << 10) | CLOSE;
  return n;
}

// Alle Züge der Seite am Zug nach MV[ply*MAXM …]; liefert die Anzahl
function gen(ply) {
  const p = side, own = bb[p], empty = ~(own | bb[p ^ 1]) & FULL, base = ply * MAXM;
  const remMask = removableMask(p ^ 1);
  let n = 0;
  if (hand[p] > 0) {
    for (let t = empty; t; t &= t - 1) {
      const to = low(t);
      n = add(base, n, NONE, to, own | BIT[to], remMask);
    }
    return n;
  }
  const jump = cnt[p] <= 3;
  for (let f = own; f; f &= f - 1) {
    const from = low(f), rest = own & ~BIT[from];
    for (let t = jump ? empty : ADJM[from] & empty; t; t &= t - 1) {
      const to = low(t);
      n = add(base, n, from, to, rest | BIT[to], remMask);
    }
  }
  return n;
}

function canMove(p) {
  const occ = bb[0] | bb[1];
  if (occ === FULL) return false;
  if (hand[p] > 0 || cnt[p] <= 3) return true;
  const empty = ~occ & FULL;
  for (let m = bb[p]; m; m &= m - 1) if (ADJM[low(m)] & empty) return true;
  return false;
}

function make(mv, ply) {
  const o = ply * 10;
  STK[o] = bb[0]; STK[o + 1] = bb[1]; STK[o + 2] = hand[0]; STK[o + 3] = hand[1];
  STK[o + 4] = cnt[0]; STK[o + 5] = cnt[1]; STK[o + 6] = side; STK[o + 7] = quiet;
  STK[o + 8] = h1; STK[o + 9] = h2;
  const p = side, q = p ^ 1, from = mv & 31, to = (mv >> 5) & 31, rem = (mv >> 10) & 31;
  const counting = hand[0] === 0 && hand[1] === 0;
  if (from === NONE) {
    const hi = p * 10 + hand[p];
    h1 ^= ZH1[hi] ^ ZH1[hi - 1];
    h2 ^= ZH2[hi] ^ ZH2[hi - 1];
    hand[p]--;
    cnt[p]++;
  } else {
    bb[p] ^= BIT[from];
    h1 ^= Z1[p * 24 + from];
    h2 ^= Z2[p * 24 + from];
  }
  bb[p] |= BIT[to];
  h1 ^= Z1[p * 24 + to];
  h2 ^= Z2[p * 24 + to];
  if (rem !== NONE) {
    bb[q] ^= BIT[rem];
    cnt[q]--;
    h1 ^= Z1[q * 24 + rem];
    h2 ^= Z2[q * 24 + rem];
  }
  side = q;
  h1 ^= ZT1;
  h2 ^= ZT2;
  quiet = mv & CLOSE ? 0 : counting ? quiet + 1 : 0;
  LI[ply + 1] = from === NONE || rem !== NONE ? ply + 1 : LI[ply];
}

function unmake(ply) {
  const o = ply * 10;
  bb[0] = STK[o]; bb[1] = STK[o + 1]; hand[0] = STK[o + 2]; hand[1] = STK[o + 3];
  cnt[0] = STK[o + 4]; cnt[1] = STK[o + 5]; side = STK[o + 6]; quiet = STK[o + 7];
  h1 = STK[o + 8]; h2 = STK[o + 9];
}

// Wiederholung im Suchpfad oder in der Partie → in der Suche schon als Remis werten
function isRep(ply) {
  const li = LI[ply];
  for (let i = ply - 2; i >= li; i -= 2) if (PH1[i] === h1 && PH2[i] === h2) return true;
  return li === 0 && hist.size > 0 && hist.has(hkey(h1, h2));
}

// Bewertung aus Sicht des Spielers am Zug; Gewichte je Phase [setzen, ziehen, springen]
const W_MILL = [8, 18, 4], W_TWO = [14, 5, 10], W_MOB = [1, 5, 0];
const W_STONE = 100, W_TEMPO = 80, W_DOUBLE = 70, W_THREAT = 12, W_STUCK = 150;

const phaseOf = p => (hand[p] > 0 ? 0 : cnt[p] <= 3 ? 2 : 1);

function mobility(own, empty) {
  let m = 0;
  for (let x = own; x; x &= x - 1) m += pc(ADJM[low(x)] & empty);
  return m;
}

function evaluate() {
  const p = side, q = p ^ 1, own = bb[p], opp = bb[q];
  const empty = ~(own | opp) & FULL, fp = phaseOf(p), fq = phaseOf(q);
  let s = (cnt[p] + hand[p] - cnt[q] - hand[q]) * W_STONE;
  let tp = 0, tq = 0;   // Punkte, auf denen ein Zug sofort eine Mühle schließt
  for (let k = 0; k < 16; k++) {
    const m = MILL[k], a = own & m, b = opp & m;
    if (b === 0) {
      if (a === m) s += W_MILL[fp];
      else if (a & (a - 1)) {   // zwei eigene, dritter Punkt frei
        s += W_TWO[fp];
        const e = m ^ a;
        if (fp !== 1 || ADJM[low(e)] & own & ~m) tp |= e;
      }
    } else if (a === 0) {
      if (b === m) s -= W_MILL[fq];
      else if (b & (b - 1)) {
        s -= W_TWO[fq];
        const e = m ^ b;
        if (fq !== 1 || ADJM[low(e)] & opp & ~m) tq |= e;
      }
    }
  }
  if (fp !== 2) s += W_MOB[fp] * mobility(own, empty);
  if (fq !== 2) {
    const mq = mobility(opp, empty);
    s -= W_MOB[fq] * mq;
    if (fq === 1 && mq === 0) s += W_STUCK;                        // Gegner eingesperrt
  }
  if (tp) s += W_TEMPO;                                            // schließt gleich eine Mühle
  else if (tq) {
    if (tq & (tq - 1)) s -= W_DOUBLE;                              // zwei Drohungen
    else if (fp === 1 && !(ADJM[low(tq)] & own)) s -= W_DOUBLE;    // Drohung nicht erreichbar
    else s -= W_THREAT;
  }
  return s;
}

// Wert eines gegnerischen Steins beim Schlagen (Seite am Zug schlägt)
function remValue(r) {
  const own = bb[side], opp = bb[side ^ 1], empty = ~(own | opp) & FULL;
  let v = 4 * pc(ADJM[r] & empty);
  for (let k = 0; k < 2; k++) {
    const m = k ? MB[r] : MA[r];
    if (pc(opp & m) === 2 && m & empty) v += 40;   // bricht eine gegnerische Zweierreihe
    if (pc(own & m) === 2) v += 30;                // gibt eine eigene Mühle frei
  }
  return v;
}

function orderScore(mv, ttm, k1, k2, hb) {
  if (mv === ttm) return 1 << 30;
  if (mv & CLOSE) {
    const r = (mv >> 10) & 31;
    return (1 << 26) + (r === NONE ? 0 : remValue(r));
  }
  if (mv === k1) return 1 << 25;
  if (mv === k2) return (1 << 25) - 1;
  return HIST[hb + (mv & 1023)];
}

// Auswahl-Sortierung: bester verbleibender Zug an Stelle i
function nextMove(base, i, n) {
  let bi = i, bs = SC[base + i];
  for (let j = i + 1; j < n; j++) if (SC[base + j] > bs) { bs = SC[base + j]; bi = j; }
  if (bi !== i) {
    const t = MV[base + i];
    MV[base + i] = MV[base + bi];
    MV[base + bi] = t;
    SC[base + bi] = SC[base + i];
    SC[base + i] = bs;
  }
  return MV[base + i];
}

function search(depth, alpha, beta, ply) {
  if ((++nodes & 1023) === 0 && deadline && now() >= deadline) throw ABORT;
  const p = side;
  if (cnt[p] + hand[p] < 3 || !canMove(p)) return ply - WIN;
  PH1[ply] = h1;
  PH2[ply] = h2;
  if (quiet >= QUIET_LIMIT || isRep(ply)) return 0;
  if (depth <= 0 || ply >= MAX_PLY - 1) return evaluate();
  let ttm = -1, ti = 0;
  if (useTT) {
    ti = h1 & TT_MASK;
    if (ttFlag[ti] && ttKey[ti] === h2) {
      ttm = ttMove[ti];
      if (ttDepth[ti] >= depth) {
        let s = ttScore[ti];
        if (s > MATE) s -= ply;
        else if (s < -MATE) s += ply;
        const f = ttFlag[ti];
        if (f === EXACT || (f === LOWER && s >= beta) || (f === UPPER && s <= alpha)) return s;
      }
    }
  }
  const n = gen(ply), base = ply * MAXM, hb = p * 1024, k1 = K1[ply], k2 = K2[ply];
  if (!n) return ply - WIN;   // (durch canMove ausgeschlossen, nur zur Sicherheit)
  for (let i = 0; i < n; i++) SC[base + i] = orderScore(MV[base + i], ttm, k1, k2, hb);
  const alpha0 = alpha;
  let best = -INF, bestMv = 0;
  for (let i = 0; i < n; i++) {
    const mv = nextMove(base, i, n);
    make(mv, ply);
    let s;
    if (i === 0) s = -search(depth - 1, -beta, -alpha, ply + 1);
    else {
      s = -search(depth - 1, -alpha - 1, -alpha, ply + 1);   // Nullfenster (PVS)
      if (s > alpha && s < beta) s = -search(depth - 1, -beta, -alpha, ply + 1);
    }
    unmake(ply);
    if (s > best) {
      best = s;
      bestMv = mv;
      if (s > alpha) {
        alpha = s;
        if (s >= beta) {
          if (!(mv & CLOSE)) {
            if (K1[ply] !== mv) { K2[ply] = K1[ply]; K1[ply] = mv; }
            const hi = hb + (mv & 1023);
            HIST[hi] += depth * depth;
            if (HIST[hi] > 1 << 20) for (let j = 0; j < 2048; j++) HIST[j] >>= 1;
          }
          break;
        }
      }
    }
  }
  if (useTT) {
    ttKey[ti] = h2;
    ttMove[ti] = bestMv;
    ttDepth[ti] = depth;
    ttFlag[ti] = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT;
    ttScore[ti] = best > MATE ? best + ply : best < -MATE ? best - ply : best;
  }
  return best;
}

// Wurzel: Züge in der Reihenfolge `order` durchsuchen; merkt Fortschritt für Zeitabbruch
function rootSearch(codes, order, depth) {
  let alpha = -INF;
  rootDone = 0;
  rootBest = order[0];
  for (let j = 0; j < order.length; j++) {
    const i = order[j];
    make(codes[i], 0);
    const s = -search(depth - 1, -INF, -alpha, 1);
    unmake(0);
    ROOT[i] = s;
    if (s > alpha) { alpha = s; rootBest = i; }
    rootDone = j + 1;
  }
  return alpha;
}

// Zufällig mischen (Gleichstände), dann Mühlen/Schlagen nach vorn
function rootOrder(codes, rng) {
  const order = codes.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const key = codes.map(mv => orderScore(mv, -1, 0, 0, 0));
  return order.sort((a, b) => key[b] - key[a]);   // stabil
}

function resetHeuristics() {
  K1.fill(0);
  K2.fill(0);
  HIST.fill(0);
  nodes = 0;
}

function chooseFixed(codes, rng, depth) {
  resetHeuristics();   // vor rootOrder: Stufe 2 hängt nur vom rng ab
  const order = rootOrder(codes, rng);
  useTT = false;
  deadline = 0;
  rootSearch(codes, order, depth);
  return rootBest;
}

function chooseTimed(codes, rng, timeMs) {
  const t0 = now();
  resetHeuristics();
  let order = rootOrder(codes, rng), best = order[0];
  ttClear();
  useTT = true;
  deadline = t0 + timeMs;
  try {
    for (let d = 1; d <= MAX_DEPTH; d++) {
      let s;
      try {
        s = rootSearch(codes, order, d);
      } catch (e) {
        if (e !== ABORT) throw e;
        if (rootDone > 0) best = rootBest;   // bisheriger Bester war schon fertig durchsucht
        break;
      }
      best = rootBest;
      stats.depth = d;
      if (s > MATE || s < -MATE) break;      // Partie entschieden
      if (now() - t0 > timeMs * 0.6) break;  // nächste Tiefe wird nicht mehr fertig
      order = order.slice().sort((a, b) => ROOT[b] - ROOT[a]);
    }
  } finally {
    deadline = 0;
    useTT = false;
  }
  return best;
}

// Zahl der Punkte, auf denen die Seite am Zug sofort eine Mühle schließen könnte
function closingTargets(ply) {
  const n = gen(ply), base = ply * MAXM;
  let t = 0;
  for (let i = 0; i < n; i++) {
    const mv = MV[base + i];
    if (mv & CLOSE) t |= 1 << ((mv >> 5) & 31);
  }
  return pc(t);
}

function chooseEasy(codes, rng) {
  const n = codes.length, mills = [];
  for (let i = 0; i < n; i++) if (codes[i] & CLOSE) mills.push(i);
  if (mills.length) return mills[Math.floor(rng() * mills.length)];
  if (rng() < 0.5) {   // manchmal eine gegnerische Mühle verhindern
    side ^= 1;
    const before = closingTargets(1);
    side ^= 1;
    if (before > 0) {
      let bestN = before, cand = [];
      for (let i = 0; i < n; i++) {
        make(codes[i], 0);
        const t = closingTargets(1);
        unmake(0);
        if (t < bestN) { bestN = t; cand = [i]; } else if (t === bestN && t < before) cand.push(i);
      }
      if (cand.length) return cand[Math.floor(rng() * cand.length)];
    }
  }
  return Math.floor(rng() * n);
}

function encode(m) {
  const from = m.from === undefined ? NONE : m.from, to = m.to;
  const rem = m.remove === undefined ? NONE : m.remove;
  const own2 = (from === NONE ? bb[side] : bb[side] & ~BIT[from]) | BIT[to];
  const closes = (own2 & MA[to]) === MA[to] || (own2 & MB[to]) === MB[to];
  return from | (to << 5) | (rem << 10) | (closes ? CLOSE : 0);
}

function decode(mv) {
  const from = mv & 31, to = (mv >> 5) & 31, rem = (mv >> 10) & 31;
  const m = from === NONE ? { to } : { from, to };
  if (rem !== NONE) m.remove = rem;
  return m;
}

// Liefert einen Zug aus legalMoves(state) oder null, wenn die Partie vorbei ist
export function chooseMove(state, { level = 2, rng = Math.random, timeMs = 400 } = {}) {
  const moves = legalMoves(state);
  if (moves.length <= 1) return moves[0] || null;
  const t0 = now();
  const rand = typeof rng === 'function' ? rng : Math.random;
  const lv = level >= 3 ? 3 : level <= 1 ? 1 : 2;
  load(state);
  const codes = moves.map(encode);
  stats.level = lv;
  stats.depth = lv === 2 ? 3 : 0;
  nodes = 0;
  let i;
  if (lv === 1) i = chooseEasy(codes, rand);
  else if (lv === 2) i = chooseFixed(codes, rand, 3);
  else i = chooseTimed(codes, rand, Math.max(1, Number(timeMs) || 400));
  stats.nodes = nodes;
  stats.ms = now() - t0;
  return moves[i];
}

// Nur für Tests: interne Zugerzeugung im Engine-Format (muss legalMoves entsprechen)
export function _moves(state) {
  load(state);
  const n = gen(0), out = [];
  for (let i = 0; i < n; i++) out.push(decode(MV[i]));
  return out;
}

// Nur für Tests: erkennt der Bot die aktuelle Stellung im Verlauf rep wieder? (positionKey-Format)
export function _knowsRep(state) {
  load(state);
  return hist.has(hkey(h1, h2));
}

// Vier in einer Reihe – reine Regel-Engine ohne DOM (gemeinsame Spiel-API der Spielebox).
// Regeln nach de.wikipedia „Vier gewinnt“ (https://de.wikipedia.org/wiki/Vier_gewinnt):
//   7 Spalten × 6 Reihen, abwechselnd einwerfen, der Stein fällt auf den untersten freien Platz,
//   vier (oder mehr) eigene Steine waagerecht, senkrecht oder diagonal gewinnen, volles Brett = unentschieden.
// Rot (Sitz 0) beginnt. Keine Optionen (Farbwahl macht die Lobby).
//
// Zustand (reines JSON):
//   { cols: 7 × [Sitz, …] (je Spalte von unten nach oben), turn: 0|1, ply,
//     win: null | { seat, line: [[c, r], …] (alle Steine in Viererlinien, ≥ 4, sortiert) },
//     over: null | { winner: 0|1|null, reason } }
//   c = Spalte 0..6 (links → rechts), r = Reihe 0..5 (unten → oben).
// Zug: { col: 0..6 }
// Hilfen für die Ansicht: dropRow(state, col), winLine(state), COLS, ROWS.
// evaluate: Einheit „Punkte“ (offene Dreier ×5, Zweier ×1, Mittelspalte ×1, etwa −30…+30), Gewinn ±99.
// Bitboard-Kern (_bb) wird vom Bot mitbenutzt: Spalte c belegt die Bits c·7 … c·7+5 (Bit c·7+6 bleibt frei),
// aufgeteilt in zwei 32-Bit-Wörter: lo = Spalten 0–3 (Bits 0–27), hi = Spalten 4–6 (Bits 28–48).

export const id = 'vier';
export const title = 'Vier in einer Reihe';
export const PLAYERS = ['Rot', 'Gelb'];
export const COLS = 7;
export const ROWS = 6;

const MOVE_FIELDS = new Set(['col']);
const REASON_WIN = 'vier in einer Reihe';
const REASON_DRAW = 'Brett voll – unentschieden';

// Alle 69 Viererfenster als Zellenlisten [[c, r] × 4]
const WINDOWS = (() => {
  const w = [];
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      for (const [dc, dr] of dirs) {
        const ec = c + 3 * dc, er = r + 3 * dr;
        if (ec < 0 || ec >= COLS || er < 0 || er >= ROWS) continue;
        w.push([0, 1, 2, 3].map(k => [c + k * dc, r + k * dr]));
      }
    }
  }
  return w;
})();

const isCol = v => Number.isInteger(v) && v >= 0 && v < COLS;
const cell = (cols, c, r) => (r < cols[c].length ? cols[c][r] : -1);

function validState(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.cols) || s.cols.length !== COLS) return false;
  if (s.turn !== 0 && s.turn !== 1) return false;
  for (const col of s.cols) {
    if (!Array.isArray(col) || col.length > ROWS) return false;
    for (const v of col) if (v !== 0 && v !== 1) return false;
  }
  return true;
}

// Sieger und alle Gewinnsteine (Brett durchsuchen); null = keine Viererlinie
function findWin(cols) {
  let seat = -1;
  const set = new Set();
  for (const w of WINDOWS) {
    const v = cell(cols, w[0][0], w[0][1]);
    if (v < 0) continue;
    let ok = true;
    for (let k = 1; k < 4; k++) if (cell(cols, w[k][0], w[k][1]) !== v) { ok = false; break; }
    if (!ok) continue;
    if (seat < 0) seat = v;
    if (v !== seat) continue;          // kommt in echten Partien nicht vor
    for (const [c, r] of w) set.add(c * ROWS + r);
  }
  if (seat < 0) return null;
  const line = [...set].sort((a, b) => a - b).map(i => [Math.floor(i / ROWS), i % ROWS]);
  return { seat, line };
}

function stones(cols) {
  let n = 0;
  for (const col of cols) n += col.length;
  return n;
}

function finish(state) {
  state.win = findWin(state.cols);
  if (state.win) state.over = { winner: state.win.seat, reason: REASON_WIN };
  else if (stones(state.cols) >= COLS * ROWS) state.over = { winner: null, reason: REASON_DRAW };
  else state.over = null;
  return state;
}

export function normalizeOptions() {
  return {};   // keine Optionen; Farbwahl macht die Lobby
}

export function initialState() {
  return { cols: Array.from({ length: COLS }, () => []), turn: 0, ply: 0, win: null, over: null };
}

// Teststellung: cols als 7 Texte aus 'R'/'G' (oder Listen aus 0/1), unten → oben.
// Am Zug: Rot bei gleicher Steinzahl, sonst Gelb.
export function setup(cols) {
  if (!Array.isArray(cols) || cols.length !== COLS) throw new Error('setup: 7 Spalten erwartet');
  const out = cols.map(col => {
    const list = typeof col === 'string' ? [...col].map(ch => (ch === 'R' ? 0 : ch === 'G' ? 1 : -1)) : col;
    if (!Array.isArray(list) || list.length > ROWS || list.some(v => v !== 0 && v !== 1)) {
      throw new Error('setup: ungültige Spalte');
    }
    return list.slice();
  });
  let n0 = 0, n1 = 0;
  for (const col of out) for (const v of col) v === 0 ? n0++ : n1++;
  if (n0 !== n1 && n0 !== n1 + 1) throw new Error('setup: Steinzahl passt nicht (Rot beginnt)');
  return finish({ cols: out, turn: n0 === n1 ? 0 : 1, ply: n0 + n1, win: null, over: null });
}

export function currentPlayer(state) {
  return state.over ? null : state.turn;
}

export function result(state) {
  return state.over || null;
}

export function legalMoves(state) {
  if (state.over) return [];
  const out = [];
  for (let c = 0; c < COLS; c++) if (state.cols[c].length < ROWS) out.push({ col: c });
  return out;
}

// Prüft Form und Regeln; wirft nie (Müll → false)
export function isLegal(state, move) {
  try {
    if (!validState(state) || state.over) return false;
    if (move === null || typeof move !== 'object' || Array.isArray(move)) return false;
    for (const k of Object.keys(move)) if (!MOVE_FIELDS.has(k)) return false;
    return isCol(move.col) && state.cols[move.col].length < ROWS;
  } catch {
    return false;
  }
}

// Neuer Zustand; state bleibt unverändert. Wirft bei illegalem Zug.
export function applyMove(state, move) {
  if (!isLegal(state, move)) {
    let t = '?';
    try { t = JSON.stringify(move); } catch { /* egal */ }
    throw new Error(`Illegaler Zug: ${t}`);
  }
  const cols = state.cols.map((col, c) => (c === move.col ? [...col, state.turn] : col.slice()));
  return finish({ cols, turn: 1 - state.turn, ply: state.ply + 1, win: null, over: null });
}

// Reihe, in die ein Stein in Spalte col fallen würde; -1 = Spalte voll/ungültig
export function dropRow(state, col) {
  if (!state || !Array.isArray(state.cols) || !isCol(col) || !Array.isArray(state.cols[col])) return -1;
  const h = state.cols[col].length;
  return h < ROWS ? h : -1;
}

// Gewinnsteine [[c, r], …] oder null
export function winLine(state) {
  if (!state || !Array.isArray(state.cols)) return null;
  const w = state.win || findWin(state.cols);
  return w ? w.line.map(([c, r]) => [c, r]) : null;
}

export function describeMove(state, move) {
  if (!move || typeof move !== 'object' || !isCol(move.col)) return '?';
  const who = state && (state.turn === 0 || state.turn === 1) ? `${PLAYERS[state.turn]}: ` : '';
  return `${who}Spalte ${move.col + 1}`;
}

// z. B. '01/1//0///:0' – Spalten von unten nach oben, dann Spieler am Zug
export function positionKey(state) {
  return state.cols.map(col => col.join('')).join('/') + ':' + state.turn;
}

// ---------- Bitboard-Kern (auch für den Bot) ----------

const M28 = 0x0fffffff, M21 = 0x1fffff;
const SPLIT = 268435456;   // 2^28
// Für Verschiebungen (Rückgabe über RL/RH, ohne Speicher anzulegen)
let RL = 0, RH = 0;

function popcount(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24);
}

// Felder ohne Rand-Bit (je Spalte Bits 0–5)
const BOARD_LO = 0x3f | 0x3f << 7 | 0x3f << 14 | 0x3f << 21;
const BOARD_HI = 0x3f | 0x3f << 7 | 0x3f << 14;

function bitOf(c, r) { return c * 7 + r; }
function hasBit(lo, hi, b) { return b < 28 ? (lo >>> b) & 1 : (hi >>> (b - 28)) & 1; }

// Viererlinie im Bitboard (lo, hi)?
function won(lo, hi) {
  for (let i = 0; i < 4; i++) {
    const s = i === 0 ? 1 : i === 1 ? 7 : i === 2 ? 6 : 8;
    const ml = lo & ((lo >>> s) | ((hi << (28 - s)) & M28));
    const mh = hi & (hi >>> s);
    const t = 2 * s;
    if ((ml & ((ml >>> t) | ((mh << (28 - t)) & M28))) | (mh & (mh >>> t))) return true;
  }
  return false;
}

// Leere Felder, auf denen (pl, ph) eine Viererlinie vollenden würde → RL/RH
function winCells(pl, ph, ml, mh) {
  // senkrecht: drei darunter
  let rl = (pl << 1) & (pl << 2) & (pl << 3) & M28;
  let rh = (ph << 1) & (ph << 2) & (ph << 3) & M21;
  for (let i = 0; i < 3; i++) {
    const s = i === 0 ? 7 : i === 1 ? 6 : 8;
    // links verschoben um s, 2s, 3s; rechts um s, 2s, 3s
    const l1l = (pl << s) & M28, l1h = ((ph << s) | (pl >>> (28 - s))) & M21;
    const l2l = (pl << 2 * s) & M28, l2h = ((ph << 2 * s) | (pl >>> (28 - 2 * s))) & M21;
    const l3l = (pl << 3 * s) & M28, l3h = ((ph << 3 * s) | (pl >>> (28 - 3 * s))) & M21;
    const r1l = ((pl >>> s) | (ph << (28 - s))) & M28, r1h = ph >>> s;
    const r2l = ((pl >>> 2 * s) | (ph << (28 - 2 * s))) & M28, r2h = ph >>> 2 * s;
    const r3l = ((pl >>> 3 * s) | (ph << (28 - 3 * s))) & M28, r3h = ph >>> 3 * s;
    let al = l1l & l2l, ah = l1h & l2h;
    rl |= (al & l3l) | (al & r1l);
    rh |= (ah & l3h) | (ah & r1h);
    al = r1l & r2l; ah = r1h & r2h;
    rl |= (al & l1l) | (al & r3l);
    rh |= (ah & l1h) | (ah & r3h);
  }
  RL = rl & (BOARD_LO & ~ml);
  RH = rh & (BOARD_HI & ~mh);
}

// Zustand → Bitboards { p0l, p0h, p1l, p1h, ml, mh, h: Höhen, n: Steine }
function toBits(state) {
  let p0l = 0, p0h = 0, p1l = 0, p1h = 0, n = 0;
  const h = new Int8Array(COLS);
  for (let c = 0; c < COLS; c++) {
    const col = state.cols[c];
    h[c] = col.length;
    for (let r = 0; r < col.length; r++) {
      const b = bitOf(c, r);
      n++;
      if (b < 28) { if (col[r] === 0) p0l |= 1 << b; else p1l |= 1 << b; }
      else if (col[r] === 0) p0h |= 1 << (b - 28); else p1h |= 1 << (b - 28);
    }
  }
  return { p0l, p0h, p1l, p1h, ml: p0l | p1l, mh: p0h | p1h, h, n };
}

export const _bb = {
  M28, M21, SPLIT, BOARD_LO, BOARD_HI, popcount, bitOf, hasBit, won, winCells, toBits,
  get RL() { return RL; }, get RH() { return RH; }
};

// ---------- Bewertung ----------

// Kurze Beweis-Suche (fest begrenzt, deterministisch): +1 = Spieler am Zug gewinnt erzwungen, −1 = verliert, 0 = offen
const PROOF_DEPTH = 8, PROOF_NODES = 40000;
const PROOF_ORDER = [3, 2, 4, 1, 5, 0, 6];
let proofNodes = 0;

function prove(cl, ch, ml, mh, h, n, depth) {
  if (++proofNodes > PROOF_NODES || n >= 42) return 0;
  winCells(cl, ch, ml, mh);
  const wl = RL, wh = RH;
  for (let c = 0; c < COLS; c++) if (h[c] < ROWS && hasBit(wl, wh, bitOf(c, h[c]))) return 1;
  if (depth <= 1) return 0;
  const ol = ml ^ cl, oh = mh ^ ch;
  winCells(ol, oh, ml, mh);
  const xl = RL, xh = RH;
  let forced = -1, nForced = 0;
  for (let c = 0; c < COLS; c++) {
    if (h[c] < ROWS && hasBit(xl, xh, bitOf(c, h[c]))) { nForced++; forced = c; }
  }
  if (nForced > 1) return -1;
  let best = -1;
  for (const c of PROOF_ORDER) {
    if (h[c] >= ROWS || (nForced === 1 && c !== forced)) continue;
    const b = bitOf(c, h[c]);
    if (h[c] < ROWS - 1 && hasBit(xl, xh, b + 1)) continue;   // unter gegnerischem Gewinnfeld = verloren
    let nl = ml, nh = mh;
    if (b < 28) nl |= 1 << b; else nh |= 1 << (b - 28);
    h[c]++;
    const v = -prove(ml ^ cl, mh ^ ch, nl, nh, h, n + 1, depth - 1);
    h[c]--;
    if (v > best) best = v;
    if (best === 1) break;
  }
  return best;
}

// Heuristik aus Sicht Rot: Fenster mit nur einer Farbe (Dreier ×5, Zweier ×1) + Steine in der Mittelspalte
function heuristic(cols) {
  let v = 0;
  for (const w of WINDOWS) {
    let a = 0, b = 0;
    for (const [c, r] of w) {
      const x = cell(cols, c, r);
      if (x === 0) a++;
      else if (x === 1) b++;
    }
    if (a && b) continue;
    if (a === 3) v += 5; else if (a === 2) v += 1;
    if (b === 3) v -= 5; else if (b === 2) v -= 1;
  }
  for (const x of cols[3]) v += x === 0 ? 1 : -1;
  return v;
}

// Zahl aus Sicht von seat in „Punkten“ (+ = gut für seat); gewonnen ±99, Remis 0
export function evaluate(state, seat) {
  const sign = seat === 1 ? -1 : 1;
  let red;
  if (state.over) {
    const w = state.over.winner;
    red = w === 0 ? 99 : w === 1 ? -99 : 0;
  } else {
    const bits = toBits(state);
    const mover = state.turn;
    const cl = mover === 0 ? bits.p0l : bits.p1l, ch = mover === 0 ? bits.p0h : bits.p1h;
    // Beweis auf dem Brett und seinem Spiegelbild (beide korrekt) → Ergebnis spiegelsymmetrisch
    proofNodes = 0;
    let p = prove(cl, ch, bits.ml, bits.mh, bits.h, bits.n, PROOF_DEPTH);
    if (p === 0) {
      const m = toBits({ cols: state.cols.slice().reverse() });
      proofNodes = 0;
      p = prove(mover === 0 ? m.p0l : m.p1l, mover === 0 ? m.p0h : m.p1h, m.ml, m.mh, m.h, m.n, PROOF_DEPTH);
    }
    if (p !== 0) red = (mover === 0 ? p : -p) * 99;
    else {
      const raw = heuristic(state.cols);
      red = Math.round(30 * Math.tanh(raw / 30) * 10) / 10;
    }
  }
  return sign * red + 0;   // + 0: keine −0
}

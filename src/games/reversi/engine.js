// Reversi – reine Spiel-Engine ohne DOM, ohne Zufall, ohne Uhr (gemeinsamer Spiele-Vertrag der Spielebox).
// Regeln nach der World Othello Federation (WOF, „Official Rules“,
// https://www.worldothello.org/about/about-othello/othello-rules/official-rules/english) und
// de.wikipedia „Othello (Spiel)“ (https://de.wikipedia.org/wiki/Othello_(Spiel)):
//   8×8, Schwarz beginnt; Start d4/e5 weiß, d5/e4 schwarz; ein Stein muss in mindestens einer der 8 Richtungen
//   gegnerische Steine einschließen, alle eingeschlossenen Linien werden umgedreht; Passen nur, wenn kein Zug
//   möglich ist (dann Pflicht); kann keiner mehr setzen, ist die Partie aus: mehr Steine gewinnt, gleich = Remis.
//
// Brett: i = r * 8 + c, r = 0 obere Reihe, c = 0 linke Spalte. Feldnamen nach Othello-Konvention:
//   Spalten a–h von links, Reihen 1–8 von OBEN (a1 = oben links = 0, h8 = unten rechts = 63).
//
// Zustand (reines JSON):
//   { board: 64 Einträge (null leer, 0 Schwarz, 1 Weiß), turn: 0|1, ply, passes (Pässe in Folge),
//     last: null | { seat, i (null beim Passen), flipped: [Felder] },
//     over: null | { winner: 0|1|null, reason, score: [schwarz, weiß] } }
// Züge: { i } (Feld 0–63, dreht mindestens einen Stein um) oder { pass: true } (nur, wenn kein Feld geht).
// Ergebnis ohne `points`: der Tisch würde `points` als Partiepunkte zählen; der Steinstand steht in score/reason.
// evaluate: Einheit „Steine“ = geschätzte End-Differenz (leere Felder zählen für den Sieger wie im Turnier),
//   am Ende echt, ab 8 leeren Feldern exakt gelöst, sonst Steine + Mobilität/Ecken/Stabilität, etwa −64…+64.

export const id = 'reversi';
export const title = 'Reversi';
export const PLAYERS = ['Schwarz', 'Weiß'];
export const BLACK = 0, WHITE = 1;

const SOLVE_EMPTIES = 8;    // evaluate löst ab so wenigen leeren Feldern exakt (wenige ms; bei 10 schon ~100 ms)

export function normalizeOptions() {
  return {};
}

// ---------- Felder ----------

export function squareName(i) {
  if (!Number.isInteger(i) || i < 0 || i > 63) return '';
  return String.fromCharCode(97 + (i & 7)) + ((i >> 3) + 1);
}

export function squareIndex(name) {
  const m = /^([a-h])([1-8])$/.exec(String(name).trim().toLowerCase());
  return m ? (m[2].charCodeAt(0) - 49) * 8 + (m[1].charCodeAt(0) - 97) : -1;
}

// ---------- Bitbretter: 64 Bit als zwei 32-Bit-Hälften (lo = Felder 0–31, hi = 32–63) ----------

const NOT_A = 0xfefefefe | 0, NOT_H = 0x7f7f7f7f;
let SH = 0, SL = 0;   // Ergebnis von sh()

// alle Bits einen Schritt in Richtung d schieben (Randüberlauf abgeschnitten)
function sh(h, l, d) {
  switch (d) {
    case 0: SH = ((h << 1) | (l >>> 31)) & NOT_A; SL = (l << 1) & NOT_A; break;    // Osten  +1
    case 1: SH = (h >>> 1) & NOT_H; SL = ((l >>> 1) | (h << 31)) & NOT_H; break;   // Westen −1
    case 2: SH = (h << 8) | (l >>> 24); SL = l << 8; break;                        // Süden  +8
    case 3: SH = h >>> 8; SL = (l >>> 8) | (h << 24); break;                       // Norden −8
    case 4: SH = ((h << 9) | (l >>> 23)) & NOT_A; SL = (l << 9) & NOT_A; break;    // Südost +9
    case 5: SH = ((h << 7) | (l >>> 25)) & NOT_H; SL = (l << 7) & NOT_H; break;    // Südwest +7
    case 6: SH = (h >>> 7) & NOT_A; SL = ((l >>> 7) | (h << 25)) & NOT_A; break;   // Nordost −7
    default: SH = (h >>> 9) & NOT_H; SL = ((l >>> 9) | (h << 23)) & NOT_H;         // Nordwest −9
  }
}

export function _pop(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

// Zugfelder von P gegen O → _M.h/_M.l
export const _M = { h: 0, l: 0 };
export function _moves(ph, pl, oh, ol) {
  const eh = ~(ph | oh), el = ~(pl | ol);
  let mh = 0, ml = 0;
  for (let d = 0; d < 8; d++) {
    sh(ph, pl, d);
    let th = SH & oh, tl = SL & ol;
    for (let k = 0; k < 5; k++) {
      sh(th, tl, d);
      th |= SH & oh;
      tl |= SL & ol;
    }
    sh(th, tl, d);
    mh |= SH & eh;
    ml |= SL & el;
  }
  _M.h = mh;
  _M.l = ml;
}

// umgedrehte Steine, wenn P auf sq setzt → _F.h/_F.l (0/0 = kein Zug)
export const _F = { h: 0, l: 0 };
export function _flips(ph, pl, oh, ol, sq) {
  const bh = sq >= 32 ? 1 << (sq - 32) : 0, bl = sq < 32 ? 1 << sq : 0;
  let fh = 0, fl = 0;
  for (let d = 0; d < 8; d++) {
    sh(bh, bl, d);
    let ch = SH, cl = SL, xh = 0, xl = 0;
    while ((ch & oh) | (cl & ol)) {
      xh |= ch;
      xl |= cl;
      sh(ch, cl, d);
      ch = SH;
      cl = SL;
    }
    if ((ch & ph) | (cl & pl)) {
      fh |= xh;
      fl |= xl;
    }
  }
  _F.h = fh;
  _F.l = fl;
}

// Bits → Feldliste (aufsteigend)
export function _list(h, l, out = []) {
  while (l) {
    const b = l & -l;
    out.push(31 - Math.clz32(b));
    l ^= b;
  }
  while (h) {
    const b = h & -h;
    out.push(63 - Math.clz32(b));
    h ^= b;
  }
  return out;
}

// Zustand → Bits je Farbe [sh, sl, wh, wl]
export function _bits(board) {
  let bh = 0, bl = 0, wh = 0, wl = 0;
  for (let i = 0; i < 64; i++) {
    const v = board[i];
    if (v === 0) {
      if (i < 32) bl |= 1 << i;
      else bh |= 1 << (i - 32);
    } else if (v === 1) {
      if (i < 32) wl |= 1 << i;
      else wh |= 1 << (i - 32);
    }
  }
  return [bh, bl, wh, wl];
}

// Endstand aus Sicht von P: Differenz, leere Felder zählen für den Sieger (WOF-Turnierwertung)
export function _final(ph, pl, oh, ol) {
  const p = _pop(ph) + _pop(pl), o = _pop(oh) + _pop(ol), d = p - o, e = 64 - p - o;
  return d > 0 ? d + e : d < 0 ? d - e : 0;
}

// ---------- Bewertung (Einheit Steine, aus Sicht von P) ----------

const CORNER_H = 0x81000000 | 0, CORNER_L = 0x81;
// X-Felder (b2, g2, b7, g7) und C-Felder je Ecke: [Ecke, X, C1, C2]
const CORNERS = [[0, 9, 1, 8], [7, 14, 6, 15], [56, 49, 57, 48], [63, 54, 62, 55]];
// Kanten ab jeder Ecke: [Ecke, Schritt entlang Kante 1, Schritt entlang Kante 2]
const EDGES = [[0, 1, 8], [7, -1, 8], [56, 1, -8], [63, -1, -8]];
const at = (h, l, i) => (i < 32 ? (l >>> i) & 1 : (h >>> (i - 32)) & 1);

// stabile Kantensteine: zusammenhängend von einer eigenen Ecke aus (Näherung), ohne Doppelzählung
function edgeStable(h, l) {
  let sh2 = 0, sl2 = 0;
  for (const [c, s1, s2] of EDGES) {
    if (!at(h, l, c)) continue;
    for (const s of [s1, s2]) {
      for (let k = 0, i = c; k < 8 && at(h, l, i); k++, i += s) {
        if (i < 32) sl2 |= 1 << i;
        else sh2 |= 1 << (i - 32);
      }
    }
  }
  return _pop(sh2) + _pop(sl2);
}

// heuristische End-Differenz (Steine) ohne Suche; symmetrisch: _heur(P,O) = −_heur(O,P)
export function _heur(ph, pl, oh, ol) {
  const dp = _pop(ph) + _pop(pl), dO = _pop(oh) + _pop(ol), empty = 64 - dp - dO;
  _moves(ph, pl, oh, ol);
  const mp = _pop(_M.h) + _pop(_M.l);
  _moves(oh, ol, ph, pl);
  const mo = _pop(_M.h) + _pop(_M.l);
  const corners = _pop(ph & CORNER_H) + _pop(pl & CORNER_L) - _pop(oh & CORNER_H) - _pop(ol & CORNER_L);
  let xs = 0, cs = 0;
  for (const [c, x, c1, c2] of CORNERS) {
    if (at(ph, pl, c) || at(oh, ol, c)) continue;      // nur bei leerer Ecke gefährlich
    xs += at(ph, pl, x) - at(oh, ol, x);
    cs += at(ph, pl, c1) + at(ph, pl, c2) - at(oh, ol, c1) - at(oh, ol, c2);
  }
  // Front: eigene Steine neben leeren Feldern (wenige = gut)
  const eh = ~(ph | oh), el = ~(pl | ol);
  let nh = 0, nl = 0;
  for (let d = 0; d < 8; d++) {
    sh(eh, el, d);
    nh |= SH;
    nl |= SL;
  }
  const front = _pop(ph & nh) + _pop(pl & nl) - _pop(oh & nh) - _pop(ol & nl);
  const stable = edgeStable(ph, pl) - edgeStable(oh, ol);
  const phase = (60 - empty) / 60, discW = phase * phase;
  const v = 8 * corners - 3.5 * xs - 1.2 * cs + 1.0 * (mp - mo) * (1 - 0.5 * phase) - 0.4 * front + 1.2 * stable +
    discW * (dp - dO);
  return 64 * Math.tanh(v / 64);
}

// exakte End-Differenz bei perfektem Spiel (für wenige leere Felder), P am Zug
function solve(ph, pl, oh, ol, alpha, beta, passed) {
  _moves(ph, pl, oh, ol);
  const mh = _M.h, ml = _M.l;
  if (!(mh | ml)) {
    if (passed) return _final(ph, pl, oh, ol);
    return -solve(oh, ol, ph, pl, -beta, -alpha, true);
  }
  let best = -Infinity;
  for (const sq of _list(mh, ml)) {
    _flips(ph, pl, oh, ol, sq);
    const fh = _F.h, fl = _F.l;
    const nph = ph | fh | (sq >= 32 ? 1 << (sq - 32) : 0), npl = pl | fl | (sq < 32 ? 1 << sq : 0);
    const v = -solve(oh & ~fh, ol & ~fl, nph, npl, -beta, -alpha, false);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

// ---------- Zustand ----------

function makeOver(board) {
  let b = 0, w = 0;
  for (const v of board) {
    if (v === 0) b++;
    else if (v === 1) w++;
  }
  const winner = b > w ? 0 : w > b ? 1 : null;
  return { winner, reason: winner === null ? `gleich viele Steine (${b}:${w})` : `mehr Steine (${b}:${w})`, score: [b, w] };
}

// kann Sitz `seat` auf diesem Brett setzen?
function canMove(bits, seat) {
  const [bh, bl, wh, wl] = bits;
  if (seat === 0) _moves(bh, bl, wh, wl);
  else _moves(wh, wl, bh, bl);
  return (_M.h | _M.l) !== 0;
}

function finish(s) {
  const bits = _bits(s.board);
  if (!canMove(bits, s.turn) && !canMove(bits, 1 - s.turn)) s.over = makeOver(s.board);
  return s;
}

export function initialState() {
  const board = new Array(64).fill(null);
  board[squareIndex('d4')] = WHITE;
  board[squareIndex('e5')] = WHITE;
  board[squareIndex('d5')] = BLACK;
  board[squareIndex('e4')] = BLACK;
  return { board, turn: BLACK, ply: 0, passes: 0, last: null, over: null };
}

// Teststellung: 8 Zeilen von oben (Reihe 1) nach unten, 'x' = Schwarz, 'o' = Weiß, '.' = leer
export function setup(rows, turn = BLACK) {
  if (!Array.isArray(rows) || rows.length !== 8) throw new Error('setup: 8 Zeilen erwartet');
  const board = [];
  for (const row of rows) {
    const t = String(row).replace(/\s+/g, '');
    if (t.length !== 8) throw new Error(`setup: Zeile „${row}“ hat nicht 8 Felder`);
    for (const ch of t) board.push(ch === 'x' || ch === 'X' ? BLACK : ch === 'o' || ch === 'O' ? WHITE : null);
  }
  return finish({ board, turn: turn === WHITE ? WHITE : BLACK, ply: 0, passes: 0, last: null, over: null });
}

function validState(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.board) || s.board.length !== 64) return false;
  if (s.turn !== 0 && s.turn !== 1) return false;
  for (let i = 0; i < 64; i++) {
    const v = s.board[i];
    if (v !== null && v !== 0 && v !== 1) return false;
  }
  return true;
}

export function currentPlayer(state) {
  if (!validState(state) || state.over) return null;
  return state.turn;
}

// Bits aus Sicht des Spielers am Zug: [ph, pl, oh, ol]
function sideBits(state) {
  const [bh, bl, wh, wl] = _bits(state.board);
  return state.turn === 0 ? [bh, bl, wh, wl] : [wh, wl, bh, bl];
}

function squares(state) {
  const [ph, pl, oh, ol] = sideBits(state);
  _moves(ph, pl, oh, ol);
  return _list(_M.h, _M.l);
}

export function legalMoves(state) {
  if (!validState(state) || state.over) return [];
  const sq = squares(state);
  return sq.length ? sq.map((i) => ({ i })) : [{ pass: true }];
}

// Form prüfen: genau { i: 0..63 } oder genau { pass: true }
function wellFormed(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  const keys = Object.keys(m);
  if (keys.length !== 1) return false;
  if (keys[0] === 'pass') return m.pass === true;
  return keys[0] === 'i' && Number.isInteger(m.i) && m.i >= 0 && m.i < 64;
}

export function isLegal(state, move) {
  try {
    if (!validState(state) || state.over || !wellFormed(move)) return false;
    const sq = squares(state);
    return move.pass ? sq.length === 0 : sq.includes(move.i);
  } catch {
    return false;
  }
}

// Felder, die der Spieler am Zug mit einem Stein auf i umdrehen würde ([] = kein Zug)
export function flipsFor(state, i) {
  if (!validState(state) || state.over || !Number.isInteger(i) || i < 0 || i > 63 || state.board[i] !== null) return [];
  const [ph, pl, oh, ol] = sideBits(state);
  _flips(ph, pl, oh, ol, i);
  return _list(_F.h, _F.l);
}

// Steinzahl [Schwarz, Weiß]
export function counts(state) {
  let b = 0, w = 0;
  if (state && Array.isArray(state.board)) {
    for (const v of state.board) {
      if (v === 0) b++;
      else if (v === 1) w++;
    }
  }
  return [b, w];
}

export function applyMove(state, move) {
  if (!validState(state)) throw new Error('Ungültiger Spielzustand');
  if (state.over) throw new Error('Die Partie ist beendet');
  if (!isLegal(state, move)) throw new Error('Ungültiger Zug');
  const seat = state.turn, board = state.board.slice();
  let last;
  if (move.pass) last = { seat, i: null, flipped: [] };
  else {
    const flipped = flipsFor(state, move.i);
    board[move.i] = seat;
    for (const f of flipped) board[f] = seat;
    last = { seat, i: move.i, flipped };
  }
  return finish({
    board, turn: 1 - seat, ply: (state.ply | 0) + 1, passes: move.pass ? (state.passes | 0) + 1 : 0, last, over: null,
  });
}

export function result(state) {
  return state && state.over ? state.over : null;
}

// 'd3, dreht 2 um' bzw. 'passt' (aus Sicht vor dem Zug)
export function describeMove(state, move) {
  if (!wellFormed(move)) return '?';
  if (move.pass) return 'passt';
  const n = flipsFor(state, move.i).length;
  return n ? `${squareName(move.i)}, dreht ${n} um` : squareName(move.i);
}

export function positionKey(state) {
  let s = '';
  for (const v of state.board) s += v === 0 ? 'x' : v === 1 ? 'o' : '.';
  return `${s}|${state.turn}`;
}

// geschätzte End-Differenz in Steinen aus Sicht von seat (siehe Kopfkommentar)
export function evaluate(state, seat) {
  let v;
  if (state.over) {
    const [b, w] = counts(state), d = b - w, e = 64 - b - w;
    v = d > 0 ? d + e : d < 0 ? d - e : 0;
  } else {
    const [bh, bl, wh, wl] = _bits(state.board);
    const empty = 64 - _pop(bh) - _pop(bl) - _pop(wh) - _pop(wl);
    if (empty <= SOLVE_EMPTIES) {
      v = state.turn === 0 ? solve(bh, bl, wh, wl, -65, 65, false) : -solve(wh, wl, bh, bl, -65, 65, false);
    } else v = Math.round(_heur(bh, bl, wh, wl) * 10) / 10;
  }
  return (seat === 1 ? -v : v) + 0;
}

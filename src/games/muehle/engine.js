// Mühle – reine Regel-Engine ohne DOM (gemeinsame Spiel-API der Spielebox).
// Der Host prüft jeden Zug mit genau dieser Engine und verteilt den neuen Zustand.
//
// Zustand (reines JSON):
//   { board: 24 × (-1 leer | 0 Weiß | 1 Schwarz), turn: 0|1, hand: [w, s], lost: [w, s],
//     ply, sinceMill, rep: { [positionKey]: Anzahl }, over: null | { winner, reason },
//     last: null | Zug }
//   rep enthält nur Stellungen seit dem letzten unumkehrbaren Zug (Setzen oder Schlagen).
// Zug: { to } beim Setzen, { from, to } beim Ziehen/Springen,
//      jeweils zusätzlich remove, wenn eine Mühle geschlossen und geschlagen wird.

export const id = 'muehle';
export const title = 'Mühle';
export const PLAYERS = ['Weiß', 'Schwarz'];

const STONES = 9;          // Steine je Spieler
const QUIET_LIMIT = 100;   // Hausregel: 50 Züge je Spieler (100 Halbzüge) ohne Mühle
const MOVE_FIELDS = new Set(['from', 'to', 'remove']);

const freezeRows = rows => Object.freeze(rows.map(r => Object.freeze(r)));

// Geometrie: Index 0..23 → [x, y] im 7×7-Raster (y = 0 oben)
export const POINTS = freezeRows([
  [0, 0], [3, 0], [6, 0],
  [1, 1], [3, 1], [5, 1],
  [2, 2], [3, 2], [4, 2],
  [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3],
  [2, 4], [3, 4], [4, 4],
  [1, 5], [3, 5], [5, 5],
  [0, 6], [3, 6], [6, 6]
]);

// Feldnamen: Spalte a–g, Reihe 1–7 (1 = unten)
export const NAMES = Object.freeze(POINTS.map(([x, y]) => 'abcdefg'[x] + (7 - y)));

// 16 Mühlen: 8 Reihen, 8 Spalten
export const MILLS = freezeRows([
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
  [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23]
]);

// Nachbarn: aufeinanderfolgende Punkte einer Mühle (32 Kanten, keine Diagonalen)
export const ADJ = freezeRows(POINTS.map((_, i) => {
  const n = [];
  for (const [a, b, c] of MILLS) {
    if (i === b) n.push(a, c);
    else if (i === a || i === c) n.push(b);
  }
  return n.sort((x, y) => x - y);
}));

const MILLS_AT = POINTS.map((_, i) => MILLS.filter(m => m.includes(i)));   // je Punkt genau 2
const INDEX = new Map(NAMES.map((n, i) => [n, i]));

const isIdx = v => Number.isInteger(v) && v >= 0 && v < 24;

function rawText(v) {
  try {
    return typeof v === 'string' ? JSON.stringify(v) : String(v);
  } catch {
    return '?';
  }
}

function countBoard(board) {
  let n0 = 0, n1 = 0;
  for (let i = 0; i < 24; i++) {
    if (board[i] === 0) n0++;
    else if (board[i] === 1) n1++;
  }
  return [n0, n1];
}

// Wird Stein p auf `to` Teil einer vollständigen eigenen Reihe? (`from` gilt als geräumt, -1 = Setzen)
function formsMill(board, p, from, to) {
  for (const m of MILLS_AT[to]) {
    let ok = true;
    for (const q of m) {
      if (q !== to && (q === from || board[q] !== p)) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

function inMill(board, i) {
  const c = board[i];
  if (c !== 0 && c !== 1) return false;
  for (const m of MILLS_AT[i]) {
    if (board[m[0]] === c && board[m[1]] === c && board[m[2]] === c) return true;
  }
  return false;
}

// Schlagbare Steine von o: nicht aus Mühlen, außer alle stehen in Mühlen; [] = keine auf dem Brett
function removable(board, o) {
  const all = [], free = [];
  for (let i = 0; i < 24; i++) {
    if (board[i] !== o) continue;
    all.push(i);
    if (!inMill(board, i)) free.push(i);
  }
  return free.length ? free : all;
}

// Phase eines Spielers: 'setzen' | 'ziehen' | 'springen'
export function phase(state, player = state.turn) {
  if (state.hand[player] > 0) return 'setzen';
  return countBoard(state.board)[player] <= 3 ? 'springen' : 'ziehen';
}

function genMoves(state) {
  const p = state.turn, b = state.board, ph = phase(state, p), moves = [];
  let rem = null;   // hängt nicht vom eigenen Zug ab → einmal berechnen
  const add = (from, to) => {
    if (formsMill(b, p, from, to)) {
      if (!rem) rem = removable(b, 1 - p);
      if (rem.length) {
        for (const r of rem) moves.push(from < 0 ? { to, remove: r } : { from, to, remove: r });
        return;
      }
    }
    moves.push(from < 0 ? { to } : { from, to });
  };
  if (ph === 'setzen') {
    for (let to = 0; to < 24; to++) if (b[to] === -1) add(-1, to);
    return moves;
  }
  for (let from = 0; from < 24; from++) {
    if (b[from] !== p) continue;
    if (ph === 'springen') {
      for (let to = 0; to < 24; to++) if (b[to] === -1) add(from, to);
    } else {
      for (const to of ADJ[from]) if (b[to] === -1) add(from, to);
    }
  }
  return moves;
}

function hasMove(state, n) {
  const p = state.turn, b = state.board;
  if (state.hand[p] > 0 || n[p] <= 3) return b.includes(-1);
  for (let i = 0; i < 24; i++) {
    if (b[i] !== p) continue;
    for (const t of ADJ[i]) if (b[t] === -1) return true;
  }
  return false;
}

function computeResult(state) {
  const p = state.turn, o = 1 - p, n = countBoard(state.board);
  if (n[p] + state.hand[p] < 3) return { winner: o, reason: 'weniger als 3 Steine' };
  if (n[o] + state.hand[o] < 3) return { winner: p, reason: 'weniger als 3 Steine' };
  if (!hasMove(state, n)) return { winner: o, reason: 'zugunfähig' };
  if (state.rep && state.rep[positionKey(state)] >= 3) {
    return { winner: null, reason: 'dreifache Wiederholung' };
  }
  if (state.sinceMill >= QUIET_LIMIT) return { winner: null, reason: '50 Züge ohne Mühle' };
  return null;
}

function validState(s) {
  return !!s && typeof s === 'object' && Array.isArray(s.board) && s.board.length === 24 &&
    (s.turn === 0 || s.turn === 1) && Array.isArray(s.hand) && s.hand.length === 2 &&
    Array.isArray(s.lost) && s.lost.length === 2;
}

// Rep neu anlegen und Ergebnis berechnen (Anfangs- und Teststellungen)
function finish(state) {
  state.rep = { [positionKey(state)]: 1 };
  state.over = computeResult(state);
  return state;
}

export function normalizeOptions() {
  return {};   // Mühle hat (noch) keine Optionen
}

export function initialState() {
  return finish({
    board: Array(24).fill(-1), turn: 0, hand: [STONES, STONES], lost: [0, 0],
    ply: 0, sinceMill: 0, rep: {}, over: null, last: null
  });
}

// Teststellung: w/b als Namen ('a1') oder Indizes; geschlagen = 9 − Brett − Hand, Zähler 0
export function setup({ w = [], b = [], hand = [0, 0], turn = 0 } = {}) {
  const board = Array(24).fill(-1);
  const put = (list, p) => {
    for (const x of list) {
      const i = typeof x === 'string' ? INDEX.get(x.trim().toLowerCase()) : x;
      if (!isIdx(i)) throw new Error(`setup: unbekannter Punkt ${rawText(x)}`);
      if (board[i] !== -1) throw new Error(`setup: Punkt ${NAMES[i]} doppelt belegt`);
      board[i] = p;
    }
  };
  put(w, 0);
  put(b, 1);
  if (turn !== 0 && turn !== 1) throw new Error('setup: turn muss 0 oder 1 sein');
  if (!Array.isArray(hand) || hand.length !== 2) throw new Error('setup: hand muss [w, s] sein');
  const n = countBoard(board);
  const lost = [0, 1].map(p => {
    if (!Number.isInteger(hand[p]) || hand[p] < 0) throw new Error('setup: ungültige Handsteine');
    const l = STONES - n[p] - hand[p];
    if (l < 0) throw new Error(`setup: mehr als ${STONES} Steine für ${PLAYERS[p]}`);
    return l;
  });
  return finish({
    board, turn, hand: [hand[0], hand[1]], lost, ply: 0, sinceMill: 0, rep: {}, over: null, last: null
  });
}

export function currentPlayer(state) {
  return state.turn;
}

// null | { winner: 0|1|null, reason } – gespeichertes Ende (auch z. B. Aufgabe) hat Vorrang
export function result(state) {
  return state.over || computeResult(state);
}

export function legalMoves(state) {
  if (result(state)) return [];
  return genMoves(state);
}

// Kanonischer Schlüssel: 'd7', 'a1-a4', 'a1-a4xd7', 'd7xa1'; Ungültiges mit '!' (kollidiert nie)
export function moveKey(move) {
  try {
    if (move === null || typeof move !== 'object' || Array.isArray(move)) return '!' + rawText(move);
    const f = v => (isIdx(v) ? NAMES[v] : '!' + rawText(v));
    let k = move.from !== undefined ? f(move.from) + '-' + f(move.to) : f(move.to);
    if (move.remove !== undefined) k += 'x' + f(move.remove);
    for (const extra of Object.keys(move).sort()) {
      if (!MOVE_FIELDS.has(extra) && move[extra] !== undefined) k += '!' + extra;
    }
    return k;
  } catch {
    return '!?';
  }
}

// Prüft Form und Regeln; wirft nie (Müll → false)
export function isLegal(state, move) {
  try {
    if (!validState(state) || result(state)) return false;
    if (move === null || typeof move !== 'object' || Array.isArray(move)) return false;
    for (const k of Object.keys(move)) {
      if (!MOVE_FIELDS.has(k) && move[k] !== undefined) return false;
    }
    const { from, to, remove } = move;
    const p = state.turn, b = state.board, ph = phase(state, p);
    if (!isIdx(to) || b[to] !== -1) return false;
    if (ph === 'setzen') {
      if (from !== undefined) return false;
    } else {
      if (!isIdx(from) || b[from] !== p) return false;
      if (ph === 'ziehen' && !ADJ[from].includes(to)) return false;
    }
    if (!formsMill(b, p, from === undefined ? -1 : from, to)) return remove === undefined;
    const rem = removable(b, 1 - p);
    if (!rem.length) return remove === undefined;   // Gegner hat nichts auf dem Brett
    return isIdx(remove) && rem.includes(remove);
  } catch {
    return false;
  }
}

// Neuer Zustand; state bleibt unverändert. Wirft bei illegalem Zug.
export function applyMove(state, move) {
  if (!isLegal(state, move)) throw new Error(`Illegaler Zug: ${moveKey(move)}`);
  const p = state.turn, o = 1 - p;
  const placing = move.from === undefined;
  const from = placing ? -1 : move.from | 0, to = move.to | 0;
  const remove = move.remove === undefined ? -1 : move.remove | 0;
  const board = state.board.slice(), hand = state.hand.slice(), lost = state.lost.slice();
  const counting = hand[0] === 0 && hand[1] === 0;   // 50-Züge-Zähler läuft erst ohne Handsteine
  if (placing) hand[p]--;
  else board[from] = -1;
  board[to] = p;
  const mill = formsMill(board, p, -1, to);
  if (remove >= 0) {
    board[remove] = -1;
    lost[o]++;
  }
  const last = placing ? { to } : { from, to };
  if (remove >= 0) last.remove = remove;
  const next = {
    board, turn: o, hand, lost, ply: state.ply + 1,
    sinceMill: mill ? 0 : counting ? state.sinceMill + 1 : 0,
    rep: null, over: null, last
  };
  const key = positionKey(next);
  next.rep = placing || remove >= 0 ? {} : { ...state.rep };   // unumkehrbar → Verlauf leeren
  next.rep[key] = (next.rep[key] || 0) + 1;
  next.over = computeResult(next);
  return next;
}

// Anzeige: 'd7', 'a1–a4', 'a1–a4 ×d7', 'd7 ×a1' (state = Stellung vor dem Zug)
export function describeMove(state, move) {
  if (move === null || typeof move !== 'object') return '?';
  const n = v => (isIdx(v) ? NAMES[v] : '?');
  let s = move.from !== undefined ? `${n(move.from)}–${n(move.to)}` : n(move.to);
  if (move.remove !== undefined) s += ` ×${n(move.remove)}`;
  return s;
}

// Brett + Spieler am Zug + Handsteine, z. B. 'w..b....................:1:7:6'
export function positionKey(state) {
  let s = '';
  for (let i = 0; i < 24; i++) {
    const c = state.board[i];
    s += c === 0 ? 'w' : c === 1 ? 'b' : '.';
  }
  return `${s}:${state.turn}:${state.hand[0]}:${state.hand[1]}`;
}

// Alle Punkte, die gerade in einer geschlossenen Mühle stehen (beide Farben), aufsteigend
export function millsAt(state) {
  const b = state.board, set = new Set();
  for (const m of MILLS) {
    const c = b[m[0]];
    if ((c === 0 || c === 1) && b[m[1]] === c && b[m[2]] === c) m.forEach(i => set.add(i));
  }
  return [...set].sort((x, y) => x - y);
}

export function countStones(state) {
  return { board: countBoard(state.board), hand: [state.hand[0], state.hand[1]], lost: [state.lost[0], state.lost[1]] };
}

// Bewertung aus Sicht von seat in „Steinen“: eigene minus gegnerische (Brett + Hand); Ende = ±10 / 0
export function evaluate(state, seat) {
  if (state.over) return state.over.winner === null || state.over.winner === undefined ? 0 : state.over.winner === seat ? 10 : -10;
  const c = countStones(state);
  const mine = c.board[seat] + c.hand[seat], theirs = c.board[1 - seat] + c.hand[1 - seat];
  return mine - theirs;
}

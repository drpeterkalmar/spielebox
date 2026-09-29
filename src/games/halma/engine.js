// Stern-Halma (Chinese Checkers) für 2, 3, 4 oder 6 Spieler – reine Regel-Engine ohne DOM
// (gemeinsame Spiel-API der Spielebox, vgl. docs/ENGINE_API.md). Kein Zufall, keine verdeckte Info.
//
// Brett: 121 Löcher = Sechseck mit Kantenlänge 5 (61 Löcher) + 6 Zacken à 10 Löcher.
//   HOLES[i] = { x, y } in Bildkoordinaten: gleichseitiges Dreiecksgitter, Abstand benachbarter Löcher 1,
//   Ursprung = Brettmitte (Loch 60), x nach rechts, y nach unten. Ausdehnung: x ∈ [−6, 6],
//   y ∈ [−4√3, 4√3] ≈ [−6,93, 6,93] (EXTENT). Reihenfolge: Reihen von oben nach unten, in der Reihe von links
//   nach rechts (Reihenlängen 1,2,3,4,13,12,11,10,9,10,11,12,13,4,3,2,1).
//   Intern axiale Koordinaten (q, r): x = q + r/2, y = r·√3/2 (HOLE_QR).
//   NEIGHBORS[i][d] mit d = 0 O, 1 SO, 2 SW, 3 W, 4 NW, 5 NO (-1 = kein Loch); JUMPS[i][d] = Landeloch
//   eines Sprungs in Richtung d (über NEIGHBORS[i][d] hinweg) oder -1.
//   Zacken im Uhrzeigersinn (wie auf dem Bildschirm): 0 unten, 1 links unten, 2 links oben, 3 oben,
//   4 rechts oben, 5 rechts unten. CAMP[k] = 10 Löcher, Spitze zuerst, dann nach Abstand zur Spitze.
//   OPPOSITE[k] = (k + 3) % 6.
//   Sitz i startet in CAMPS[n][i] und zieht in die gegenüberliegende Zacke.
//
// Zustand (reines JSON):
//   { n, board: 121 × (-1 leer | Sitz), turn, ply, moves: [Züge je Sitz], over: null | { winner, reason },
//     last: null | { seat, from, path } | { seat, pass: true } }
// Züge: { from, path: [l1, l2, …] } – path = Landelöcher der Reihe nach (Schritt: genau ein Nachbarloch;
//   Sprungkette: jedes Glied springt über einen direkt benachbarten Stein beliebiger Farbe auf das freie
//   Loch direkt dahinter; kein Loch zweimal, das Startloch zählt als besucht; Schritt und Sprung nie gemischt).
//   { pass: true } nur, wenn der Spieler keinen Zug hat (dann einziger legaler Zug).
//   legalMoves liefert je (from, Ziel) genau einen Zug (kürzester Pfad); isLegal akzeptiert jede gültige Kette.
//
// Sieg: alle 10 eigenen Steine in der Zielzacke – oder Blockade-Regel (siehe BLOCK_RULE_TEXT): Die Zielzacke
//   ist vollständig besetzt und mindestens ein Stein darin gehört dem Spieler. Wer zuerst fertig ist, gewinnt;
//   die Partie endet sofort (auch bei 3–6 Spielern).
//   Quelle: Die verbreitete Anti-Spoiling-Regel („If a player's destination is completely filled and at least
//   one of the pieces is the player's own, that player wins“ – Standardregel vieler Online-Regelwerke und
//   älterer Fassungen des en.wikipedia-Artikels „Chinese checkers“). Geprüft am 29.09.2026: Die aktuellen
//   Artikel en.wikipedia „Chinese checkers“ und de.wikipedia „Halma“ nennen keine eigene Blockade-Regel
//   (en: „if a player's opponent occupies the home corner, the player may need to wait for opponent pieces to
//   clear before filling the home vacancies“; de: „Sieger ist, wem dies zuerst gelingt“). Umgesetzt ist deshalb
//   die im Auftrag genannte Standardregel.
// Zuglimit: Haben alle Spieler 200 Züge gemacht (Aussetzen zählt mit), endet die Partie; es gewinnt der
//   kleinste Restweg (distance), bei Gleichstand niemand.

export const id = 'halma';
export const title = 'Stern-Halma';
export const PLAYERS = ['Rot', 'Blau', 'Grün', 'Gelb', 'Lila', 'Orange'];

export const STONES = 10;          // Steine je Spieler
export const MOVE_LIMIT = 200;     // Züge je Spieler bis zum Abbruch
export const SIZE = 121;
export const CAMPS = Object.freeze({
  2: Object.freeze([0, 3]),
  3: Object.freeze([0, 2, 4]),
  4: Object.freeze([0, 1, 3, 4]),
  6: Object.freeze([0, 1, 2, 3, 4, 5])
});
export const BLOCK_RULE_TEXT = 'Blockade-Regel: Ist deine Zielzacke vollständig besetzt und steht mindestens einer ' +
  'deiner eigenen Steine darin, hast du gewonnen – fremde Steine, die dort stehen bleiben, können deinen Sieg ' +
  'also nicht verhindern.';
export const REASON_HOME = 'alle Steine im Ziel';
export const REASON_BLOCK = 'Zielzacke voll besetzt (Blockade-Regel)';
export const REASON_LIMIT = 'Zuglimit – kürzester Restweg';

const MOVE_FIELDS = new Set(['from', 'path']);
const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];   // O, SO, SW, W, NW, NO
const H = Math.sqrt(3) / 2;

// ---------- Geometrie ----------

const QR = [];
for (let r = -8; r <= 8; r++) {
  for (let q = -8; q <= 8; q++) {
    const s = -q - r;
    if ((q <= 4 && r <= 4 && s <= 4) || (q >= -4 && r >= -4 && s >= -4)) QR.push([q, r]);
  }
}
const indexOf = new Map(QR.map(([q, r], i) => [q * 100 + r, i]));
const at = (q, r) => {
  const i = indexOf.get(q * 100 + r);
  return i === undefined ? -1 : i;
};

export const HOLE_QR = Object.freeze(QR.map(p => Object.freeze(p.slice())));
export const HOLES = Object.freeze(QR.map(([q, r]) => Object.freeze({ x: q + r / 2, y: r * H })));
export const EXTENT = Object.freeze({ minX: -6, maxX: 6, minY: -8 * H, maxY: 8 * H });
export const CENTER = at(0, 0);
export const NEIGHBORS = Object.freeze(QR.map(([q, r]) => Object.freeze(DIRS.map(([dq, dr]) => at(q + dq, r + dr)))));
export const JUMPS = Object.freeze(QR.map(([q, r]) => Object.freeze(DIRS.map(([dq, dr]) =>
  at(q + dq, r + dr) < 0 ? -1 : at(q + 2 * dq, r + 2 * dr)))));

export function hexDistance(a, b) {
  const dq = QR[a][0] - QR[b][0], dr = QR[a][1] - QR[b][1];
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// Zacke eines Lochs (0–5) oder -1 für das Mittel-Sechseck
function campOfQR(q, r) {
  const s = -q - r;
  if (r >= 5) return 0;
  if (q <= -5) return 1;
  if (s >= 5) return 2;
  if (r <= -5) return 3;
  if (q >= 5) return 4;
  if (s <= -5) return 5;
  return -1;
}
const TIP_QR = [[-4, 8], [-8, 4], [-4, -4], [4, -8], [8, -4], [4, 4]];
export const TIPS = Object.freeze(TIP_QR.map(([q, r]) => at(q, r)));
export const CAMP_OF = Object.freeze(QR.map(([q, r]) => campOfQR(q, r)));
export const CAMP = Object.freeze([0, 1, 2, 3, 4, 5].map(k => {
  const list = [];
  for (let i = 0; i < SIZE; i++) if (CAMP_OF[i] === k) list.push(i);
  list.sort((a, b) => hexDistance(a, TIPS[k]) - hexDistance(b, TIPS[k]) || a - b);
  return Object.freeze(list);
}));
export const OPPOSITE = Object.freeze([3, 4, 5, 0, 1, 2]);

// Summe der Abstände zur Zielspitze bei voller Zacke (0 + 2·1 + 3·2 + 4·3 = 20)
const MIN_SUM = CAMP[0].reduce((s, h) => s + hexDistance(h, TIPS[0]), 0);
// DIST[k][i] = Hex-Abstand von Loch i zur Spitze der Zacke k
export const DIST = Object.freeze(TIPS.map(t => Object.freeze(QR.map((_, i) => hexDistance(i, t)))));

export const startCamp = (n, seat) => CAMPS[n][seat];
export const targetCamp = (n, seat) => OPPOSITE[CAMPS[n][seat]];
export const holeLabel = i => String(i + 1);   // Anzeige: Lochnummer 1–121

// ---------- Hilfen ----------

const isIdx = v => Number.isInteger(v) && v >= 0 && v < SIZE;

function validState(s) {
  return !!s && typeof s === 'object' && CAMPS[s.n] !== undefined && Array.isArray(s.board) &&
    s.board.length === SIZE && Number.isInteger(s.turn) && s.turn >= 0 && s.turn < s.n &&
    Array.isArray(s.moves) && s.moves.length === s.n;
}

// Sprungbaum von `from` (Startloch gilt als geräumt und besucht): prev[x] = Vorgänger, -2 = nicht erreicht.
// Liefert die Landelöcher in BFS-Reihenfolge (→ kürzeste Ketten).
function jumpBfs(board, from, prev) {
  prev.fill(-2);
  prev[from] = -1;
  const order = [];
  let head = -1, cur = from;
  for (;;) {
    const nb = NEIGHBORS[cur], jp = JUMPS[cur];
    for (let d = 0; d < 6; d++) {
      const land = jp[d];
      if (land < 0 || board[land] !== -1 || prev[land] !== -2) continue;
      const over = nb[d];
      if (over === from || board[over] === -1) continue;
      prev[land] = cur;
      order.push(land);
    }
    if (++head >= order.length) break;
    cur = order[head];
  }
  return order;
}

function pathTo(prev, to) {
  const path = [];
  for (let x = to; prev[x] !== -1; x = prev[x]) path.push(x);
  return path.reverse();
}

const PREV = new Int16Array(SIZE);

function genMoves(board, seat) {
  const moves = [];
  for (let from = 0; from < SIZE; from++) {
    if (board[from] !== seat) continue;
    const nb = NEIGHBORS[from];
    for (let d = 0; d < 6; d++) {
      const t = nb[d];
      if (t >= 0 && board[t] === -1) moves.push({ from, path: [t] });
    }
    for (const to of jumpBfs(board, from, PREV)) moves.push({ from, path: pathTo(PREV, to) });
  }
  return moves;
}

function hasMove(board, seat) {
  for (let from = 0; from < SIZE; from++) {
    if (board[from] !== seat) continue;
    const nb = NEIGHBORS[from], jp = JUMPS[from];
    for (let d = 0; d < 6; d++) {
      if (nb[d] < 0) continue;
      if (board[nb[d]] === -1) return true;
      if (jp[d] >= 0 && board[jp[d]] === -1) return true;
    }
  }
  return false;
}

// 'step' | 'jump' | null – Kette von `from` über `path` (from muss belegt sein; wird als geräumt behandelt)
function chainKind(board, from, path) {
  if (!Array.isArray(path) || path.length < 1 || path.length > SIZE) return null;
  for (const x of path) if (!isIdx(x)) return null;
  if (path.length === 1) {
    const t = path[0];
    if (NEIGHBORS[from].includes(t)) return board[t] === -1 ? 'step' : null;
  }
  const seen = new Set([from]);
  let cur = from;
  for (const land of path) {
    if (seen.has(land) || board[land] !== -1) return null;
    const d = JUMPS[cur].indexOf(land);
    if (d < 0) return null;
    const over = NEIGHBORS[cur][d];
    if (over === from || board[over] === -1) return null;
    seen.add(land);
    cur = land;
  }
  return 'jump';
}

function winReason(board, n, seat) {
  let own = 0, full = true;
  for (const h of CAMP[targetCamp(n, seat)]) {
    const c = board[h];
    if (c === -1) full = false;
    else if (c === seat) own++;
  }
  if (own >= STONES) return REASON_HOME;
  if (full && own > 0) return REASON_BLOCK;
  return null;
}

function distanceOf(board, n, seat) {
  const dist = DIST[targetCamp(n, seat)];
  let sum = 0, cnt = 0;
  for (let i = 0; i < SIZE; i++) {
    if (board[i] === seat) {
      sum += dist[i];
      cnt++;
    }
  }
  // Mindestsumme für cnt Steine (Zacke von der Spitze her gefüllt); bei 10 Steinen 20
  let min = 0;
  const camp = CAMP[0];
  for (let k = 0; k < cnt && k < camp.length; k++) min += DIST[0][camp[k]];
  return sum - min;
}

function computeResult(state) {
  const { n, board } = state;
  const mover = (state.turn - 1 + n) % n;   // der zuletzt Ziehende hat Vorrang
  for (let k = 0; k < n; k++) {
    const seat = (mover + k) % n;
    const reason = winReason(board, n, seat);
    if (reason) return { winner: seat, reason };
  }
  if (state.moves.every(m => m >= MOVE_LIMIT)) {
    let best = Infinity, winner = null;
    for (let seat = 0; seat < n; seat++) {
      const d = distanceOf(board, n, seat);
      if (d < best) {
        best = d;
        winner = seat;
      } else if (d === best) winner = null;
    }
    return { winner, reason: REASON_LIMIT };
  }
  return null;
}

// ---------- API ----------

export function normalizeOptions(opts) {
  const p = Number(opts && opts.players);
  return { players: CAMPS[p] ? p : 2 };
}

export function initialState(opts) {
  const { players: n } = normalizeOptions(opts);
  const board = Array(SIZE).fill(-1);
  for (let seat = 0; seat < n; seat++) for (const h of CAMP[CAMPS[n][seat]]) board[h] = seat;
  return { n, board, turn: 0, ply: 0, moves: Array(n).fill(0), over: null, last: null };
}

// Teststellung: pieces[seat] = Lochindizes (je Sitz 0–10 Steine), moves = Züge je Sitz (Default 0)
export function setup({ players = 2, pieces = [], turn = 0, moves } = {}) {
  const n = Number(players);
  if (!CAMPS[n]) throw new Error('setup: players muss 2, 3, 4 oder 6 sein');
  const board = Array(SIZE).fill(-1);
  pieces.forEach((list, seat) => {
    if (seat >= n) throw new Error(`setup: Sitz ${seat} gibt es nicht`);
    if (list.length > STONES) throw new Error(`setup: mehr als ${STONES} Steine für Sitz ${seat}`);
    for (const h of list) {
      if (!isIdx(h)) throw new Error(`setup: unbekanntes Loch ${h}`);
      if (board[h] !== -1) throw new Error(`setup: Loch ${h} doppelt belegt`);
      board[h] = seat;
    }
  });
  if (!Number.isInteger(turn) || turn < 0 || turn >= n) throw new Error('setup: ungültiger turn');
  const mv = moves ? moves.slice() : Array(n).fill(0);
  if (mv.length !== n) throw new Error('setup: moves braucht einen Eintrag je Sitz');
  const state = { n, board, turn, ply: mv.reduce((a, b) => a + b, 0), moves: mv, over: null, last: null };
  state.over = computeResult(state);
  return state;
}

// null | { winner: Sitz | null, reason }
export function result(state) {
  return state.over || computeResult(state);
}

export function currentPlayer(state) {
  return result(state) ? null : state.turn;
}

export function legalMoves(state) {
  if (result(state)) return [];
  const moves = genMoves(state.board, state.turn);
  return moves.length ? moves : [{ pass: true }];
}

// Prüft Form und Regeln; wirft nie (Müll → false)
export function isLegal(state, move) {
  try {
    if (!validState(state) || result(state)) return false;
    if (move === null || typeof move !== 'object' || Array.isArray(move)) return false;
    if (move.pass !== undefined) {
      return move.pass === true && Object.keys(move).length === 1 && !hasMove(state.board, state.turn);
    }
    for (const k of Object.keys(move)) if (!MOVE_FIELDS.has(k)) return false;
    const { from, path } = move;
    if (!isIdx(from) || state.board[from] !== state.turn) return false;
    return chainKind(state.board, from, path) !== null;
  } catch {
    return false;
  }
}

// Neuer Zustand; state bleibt unverändert. Wirft bei illegalem Zug.
export function applyMove(state, move) {
  if (!isLegal(state, move)) throw new Error(`Illegaler Zug: ${safeJson(move)}`);
  const seat = state.turn, n = state.n;
  const board = state.board.slice(), moves = state.moves.slice();
  let last;
  if (move.pass) last = { seat, pass: true };
  else {
    const path = move.path.slice();
    board[move.from] = -1;
    board[path[path.length - 1]] = seat;
    last = { seat, from: move.from, path };
  }
  moves[seat]++;
  const next = { n, board, turn: (seat + 1) % n, ply: state.ply + 1, moves, over: null, last };
  next.over = computeResult(next);
  return next;
}

// Mögliche Schrittziele des Steins auf `from` (für die Oberfläche)
export function stepTargets(state, from) {
  if (!validState(state) || result(state) || !isIdx(from) || state.board[from] !== state.turn) return [];
  return NEIGHBORS[from].filter(t => t >= 0 && state.board[t] === -1);
}

// Nächste Sprunglöcher der Kette: visited = bisherige Landelöcher (leer = Kette beginnt bei from)
export function jumpTargets(state, from, visited = []) {
  try {
    if (!validState(state) || result(state) || !isIdx(from) || state.board[from] !== state.turn) return [];
    if (!Array.isArray(visited)) return [];
    const b = state.board;
    if (visited.length && chainKind(b, from, visited) !== 'jump') return [];
    const seen = new Set([from, ...visited]);
    const cur = visited.length ? visited[visited.length - 1] : from;
    const out = [];
    for (let d = 0; d < 6; d++) {
      const land = JUMPS[cur][d], over = NEIGHBORS[cur][d];
      if (land < 0 || b[land] !== -1 || seen.has(land) || over === from || b[over] === -1) continue;
      out.push(land);
    }
    return out;
  } catch {
    return [];
  }
}

function safeJson(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return '?';
  }
}

// Anzeige (Lochnummern 1–121): 'zieht 12 → 13', 'springt 12 → 34', 'springt 3× (12 → 34 → 56 → 78)', 'setzt aus'
export function describeMove(state, move) {
  if (move === null || typeof move !== 'object') return '?';
  if (move.pass) return 'setzt aus';
  if (!isIdx(move.from) || !Array.isArray(move.path) || !move.path.length) return '?';
  const lab = v => (isIdx(v) ? holeLabel(v) : '?');
  const chain = [move.from, ...move.path].map(lab).join(' → ');
  const step = move.path.length === 1 && NEIGHBORS[move.from].includes(move.path[0]);
  if (step) return `zieht ${chain}`;
  return move.path.length === 1 ? `springt ${chain}` : `springt ${move.path.length}× (${chain})`;
}

// z. B. '2:...0011...:1'
export function positionKey(state) {
  let s = '';
  for (let i = 0; i < SIZE; i++) {
    const c = state.board[i];
    s += c < 0 ? '.' : String(c);
  }
  return `${state.n}:${s}:${state.turn}`;
}

// Restweg in Feldern: Summe der Hex-Abstände der eigenen Steine zur Zielspitze minus Mindestsumme
// (volle Zacke = 0). Monoton: jeder Schritt Richtung Spitze senkt ihn um 1.
export function distance(state, seat) {
  if (!validState(state) || !Number.isInteger(seat) || seat < 0 || seat >= state.n) return 0;
  return distanceOf(state.board, state.n, seat);
}

// (Durchschnitt Restweg der Gegner) − eigener Restweg, Einheit Felder
export function evaluate(state, seat) {
  if (!validState(state) || !Number.isInteger(seat) || seat < 0 || seat >= state.n) return 0;
  const n = state.n;
  let opp = 0;
  for (let s = 0; s < n; s++) if (s !== seat) opp += distanceOf(state.board, n, s);
  return opp / (n - 1) - distanceOf(state.board, n, seat);
}

// Steine je Sitz (Tests/Anzeige)
export function countStones(state) {
  const c = Array(state.n).fill(0);
  for (const v of state.board) if (v >= 0) c[v]++;
  return c;
}

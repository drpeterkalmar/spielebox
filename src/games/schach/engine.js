// Schach – Regel-Engine der Spielebox als dünne Hülle um chess.js (BSD-2, gepinnt in lib/chess.js).
// Zustand (reines JSON): { fen, turn: 0 Weiß | 1 Schwarz, sans: [SAN …], rep: { stellung: Anzahl },
//   over: null | { winner, reason } }
// rep zählt Stellungen (Figuren, Zugrecht, Rochaderechte, en passant) seit dem letzten Bauernzug/Schlag.
// Zug: { from: 'e2', to: 'e4' } bzw. mit promo: 'q'|'r'|'b'|'n' bei der Umwandlung.
// Remis automatisch: Patt, zu wenig Material, 50-Züge-Regel (100 Halbzüge), dreifache Stellungswiederholung.
import { Chess } from '../../../lib/chess.js';

export const id = 'schach';
export const title = 'Schach';
export const PLAYERS = ['Weiß', 'Schwarz'];
export const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const PROMOS = new Set(['q', 'r', 'b', 'n']);
const SQ = /^[a-h][1-8]$/;
// deutsche Figurenbuchstaben für die Zugliste (PGN-Export bleibt englisch)
const DE = { N: 'S', B: 'L', R: 'T', Q: 'D', K: 'K' };
export const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const key = (fen) => fen.split(' ').slice(0, 4).join(' ');

export function normalizeOptions() {
  return {};
}

export function initialState() {
  return fromFen(START);
}

// Stellung aus FEN (Tests, Aufgaben)
export function fromFen(fen) {
  const c = new Chess(fen);
  const f = c.fen();
  const s = { fen: f, turn: c.turn() === 'w' ? 0 : 1, sans: [], rep: { [key(f)]: 1 }, over: null, start: f === START ? undefined : f };
  s.over = judge(c, s.rep);
  return s;
}

function judge(c, rep) {
  if (c.isCheckmate()) return { winner: c.turn() === 'w' ? 1 : 0, reason: 'Schachmatt' };
  if (c.isStalemate()) return { winner: null, reason: 'Patt' };
  if (c.isInsufficientMaterial()) return { winner: null, reason: 'zu wenig Material' };
  if (rep[key(c.fen())] >= 3) return { winner: null, reason: 'dreifache Stellungswiederholung' };
  if (Number(c.fen().split(' ')[4]) >= 100) return { winner: null, reason: '50-Züge-Regel' };
  return null;
}

export function currentPlayer(state) {
  return state.turn;
}

export function result(state) {
  return state.over;
}

export function legalMoves(state) {
  if (state.over) return [];
  const c = new Chess(state.fen);
  return c.moves({ verbose: true }).map((m) => (m.promotion ? { from: m.from, to: m.to, promo: m.promotion } : { from: m.from, to: m.to }));
}

export function isLegal(state, move) {
  try {
    if (!state || typeof state.fen !== 'string' || state.over) return false;
    if (!move || typeof move !== 'object' || Array.isArray(move)) return false;
    for (const k of Object.keys(move)) if (!['from', 'to', 'promo'].includes(k) && move[k] !== undefined) return false;
    if (!SQ.test(move.from) || !SQ.test(move.to)) return false;
    if (move.promo !== undefined && !PROMOS.has(move.promo)) return false;
    const c = new Chess(state.fen);
    const ms = c.moves({ square: move.from, verbose: true }).filter((m) => m.to === move.to);
    if (!ms.length) return false;
    if (ms[0].promotion) return PROMOS.has(move.promo);
    return move.promo === undefined;
  } catch {
    return false;
  }
}

export function applyMove(state, move) {
  if (!isLegal(state, move)) throw new Error('Illegaler Zug: ' + JSON.stringify(move));
  const c = new Chess(state.fen);
  const m = c.move({ from: move.from, to: move.to, promotion: move.promo });
  const fen = c.fen();
  const irreversible = m.piece === 'p' || !!m.captured;
  const rep = irreversible ? {} : { ...state.rep };
  rep[key(fen)] = (rep[key(fen)] || 0) + 1;
  const next = { fen, turn: 1 - state.turn, sans: [...state.sans, m.san], rep, over: null };
  if (state.start) next.start = state.start;
  next.over = judge(c, rep);
  return next;
}

export function moveKey(move) {
  return move.from + move.to + (move.promo || '');
}

// SAN mit deutschen Figurenbuchstaben (S, L, T, D, K)
export function sanDe(san) {
  return san.replace(/^[NBRQK]/, (x) => DE[x]).replace(/=([NBRQ])/, (_, x) => '=' + DE[x]);
}

export function describeMove(state, move) {
  const c = new Chess(state.fen);
  const m = c.move({ from: move.from, to: move.to, promotion: move.promo });
  return sanDe(m.san);
}

export function positionKey(state) {
  return key(state.fen);
}

// Brett als 8×8 (Reihe 0 = 8. Reihe): null | { color: 'w'|'b', type: 'p'… }
export function board(state) {
  return new Chess(state.fen).board().map((row) => row.map((p) => (p ? { color: p.color, type: p.type } : null)));
}

export function inCheck(state) {
  return new Chess(state.fen).isCheck();
}

export function kingSquare(state, color) {
  const b = new Chess(state.fen).board();
  for (const row of b) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  return null;
}

// Material (Bauerneinheiten) je Farbe
export function material(state) {
  const out = [0, 0];
  for (const row of board(state)) for (const p of row) if (p) out[p.color === 'w' ? 0 : 1] += VALUE[p.type];
  return out;
}

// Bewertung aus Sicht von seat in Bauern: Material + kleine Stellungsanteile; Matt = ±100, Remis = 0
export function evaluate(state, seat) {
  if (state.over) {
    if (state.over.winner === null) return 0;
    return state.over.winner === seat ? 100 : -100;
  }
  const [w, b] = material(state);
  const d = w - b;
  return seat === 0 ? d : -d;
}

// PGN mit Kopfzeilen (englische Notation, wie jedes Schachprogramm es erwartet)
export function pgn(state, { white = 'Weiß', black = 'Schwarz', date = new Date() } = {}) {
  const res = !state.over ? '*' : state.over.winner === 0 ? '1-0' : state.over.winner === 1 ? '0-1' : '1/2-1/2';
  const d = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  const head = [['Event', 'Spielebox'], ['Site', 'https://drpeterkalmar.github.io/spielebox/'], ['Date', d], ['White', white], ['Black', black], ['Result', res]];
  if (state.start) head.push(['SetUp', '1'], ['FEN', state.start]);
  const startBlack = state.start && state.start.split(' ')[1] === 'b';
  const startNo = state.start ? Number(state.start.split(' ')[5]) || 1 : 1;
  let body = '';
  state.sans.forEach((san, i) => {
    const ply = i + (startBlack ? 1 : 0);
    const no = startNo + Math.floor(ply / 2);
    if (ply % 2 === 0) body += `${no}. `;
    else if (i === 0) body += `${no}... `;
    body += san + ' ';
  });
  return head.map(([k, v]) => `[${k} "${String(v).replace(/"/g, "'")}"]`).join('\n') + '\n\n' + (body + res).trim() + '\n';
}

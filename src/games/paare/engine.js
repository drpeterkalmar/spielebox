// Paare finden (Regeln wie das bekannte Gedächtnisspiel) – reine Regel-Engine ohne DOM, ohne Zufall.
// Quelle der Regeln: de.wikipedia „Memory (Spiel)“ (https://de.wikipedia.org/wiki/Memory_(Spiel)):
//   Bildpaare liegen verdeckt; wer dran ist, deckt zwei Karten auf. Gleiche Bilder: Paar behalten und nochmal;
//   verschieden: wieder umdrehen, der Nächste ist dran. Wer am Ende die meisten Paare hat, gewinnt.
//
// Verdeckt sind die Bilder für ALLE (auch den, der dran ist) – deshalb HIDDEN wie bei Kartenspielen: Jeder bekommt
// nur die offenen Karten. Gemischt wird über chance { kind: 'shuffle', n: 2 × Paare } (fair im Netz).
//
// Zustand (reines JSON):
//   { n: Spieler, opts: { paare, players }, phase: 'deal'|'play'|'over', cards: [Motiv 0…paare−1 je Feld],
//     found: [null | Sitz je Feld], open: [Feld] (diese Runde aufgedeckt, 0 oder 1), shown: [a, b] | null
//     (zuletzt aufgedecktes falsches Paar – bleibt offen, bis der Nächste die erste Karte dreht),
//     turn, scores: [Paare je Sitz], memory: [[Feld, Motiv], …] (alles, was schon einmal offen lag und noch nicht gefunden ist, in der
//     Reihenfolge des Aufdeckens – öffentlich, alle haben es gesehen; braucht der Computer zum „Merken“),
//     last: null | { seat, a, b?, match }, flips: Züge, ply }
// Zug: { flip: Feld }
// evaluate: Einheit „Paare“ – eigene Paare minus die meisten eines anderen (allein: 0).

export const id = 'paare';
export const title = 'Paare finden';
export const PLAYERS = ['Spieler 1', 'Spieler 2', 'Spieler 3', 'Spieler 4'];
export const HIDDEN = true;
export const MOTIFS = Object.freeze(['🐶', '🐱', '🐭', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🦉', '🐢']);
export const MOTIF_NAMES = Object.freeze(['Hund', 'Katze', 'Maus', 'Hase', 'Fuchs', 'Bär', 'Panda', 'Koala', 'Tiger', 'Löwe', 'Kuh', 'Schwein', 'Frosch', 'Affe', 'Huhn', 'Pinguin', 'Eule', 'Schildkröte']);
export const SIZES = Object.freeze({ 8: [4, 4], 12: [4, 6], 18: [6, 6] });   // Paare → [Spalten, Reihen]

const isInt = (x) => Number.isInteger(x);

export function normalizeOptions(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const p = Number(o.paare), n = Number(o.players);
  return { paare: [8, 12, 18].includes(p) ? p : 12, players: isInt(n) && n >= 1 && n <= 4 ? n : 2 };
}

export function initialState(opts) {
  const o = normalizeOptions(opts);
  const k = 2 * o.paare;
  return {
    n: o.players, opts: o, phase: 'deal', cards: Array(k).fill(null), found: Array(k).fill(null), open: [], shown: null,
    turn: 0, scores: Array(o.players).fill(0), memory: [], last: null, flips: 0, ply: 0
  };
}

export function phase(state) {
  return state.phase;
}

export function chance(state) {
  return state && state.phase === 'deal' ? { kind: 'shuffle', n: state.cards.length } : null;
}

// perm[i] = Karte i des sortierten Satzes (0,0,1,1,2,2,…) liegt auf Feld i
export function applyChance(state, perm) {
  if (!chance(state)) throw new Error('Kein Zufall ausstehend');
  const k = state.cards.length;
  if (!Array.isArray(perm) || perm.length !== k || new Set(perm).size !== k || perm.some((x) => !isInt(x) || x < 0 || x >= k)) throw new Error('Ungültige Permutation');
  return { ...state, phase: 'play', cards: perm.map((x) => Math.floor(x / 2)) };
}

export function currentPlayer(state) {
  return state && state.phase === 'play' ? state.turn : null;
}

const flippable = (state, i) => isInt(i) && i >= 0 && i < state.cards.length && state.found[i] === null && !state.open.includes(i);

export function legalMoves(state) {
  if (!state || state.phase !== 'play') return [];
  const out = [];
  for (let i = 0; i < state.cards.length; i++) if (flippable(state, i)) out.push({ flip: i });
  return out;
}

export function isLegal(state, move) {
  try {
    if (!state || state.phase !== 'play' || !move || typeof move !== 'object' || Array.isArray(move)) return false;
    const keys = Object.keys(move);
    return keys.length === 1 && keys[0] === 'flip' && flippable(state, move.flip);
  } catch {
    return false;
  }
}

// zuletzt Gesehenes ans Ende (Computer der Stufe 1/2 merken sich nur die letzten Einträge)
function remember(s, i, m) {
  s.memory = s.memory.filter(([f]) => f !== i);
  s.memory.push([i, m]);
}

export function applyMove(state, move) {
  if (!isLegal(state, move)) throw new Error('Illegaler Zug: ' + JSON.stringify(move));
  if (state.cards[move.flip] === null) throw new Error('Verdeckte Karte (Sicht statt vollem Zustand?)');
  const i = move.flip, p = state.turn;
  const s = { ...state, found: state.found.slice(), open: state.open.slice(), scores: state.scores.slice(), memory: state.memory.slice(), ply: state.ply + 1 };
  if (!s.open.length) {
    // erste Karte des Zugs: das falsche Paar des Vorgängers wird wieder verdeckt
    s.shown = null;
    s.open = [i];
    remember(s, i, state.cards[i]);
    s.last = { seat: p, a: i, match: null };
    return s;
  }
  const a = s.open[0];
  s.flips = state.flips + 1;
  s.open = [];
  if (state.cards[a] === state.cards[i]) {
    s.found[a] = p;
    s.found[i] = p;
    s.scores[p]++;
    s.memory = s.memory.filter(([f]) => f !== a && f !== i);
    s.last = { seat: p, a, b: i, match: true, motif: state.cards[i] };
    if (s.found.every((x) => x !== null)) s.phase = 'over';
  } else {
    remember(s, i, state.cards[i]);
    s.shown = [a, i];
    s.last = { seat: p, a, b: i, match: false };
    s.turn = (p + 1) % s.n;
  }
  return s;
}

export function result(state) {
  if (!state || state.phase !== 'over') return null;
  if (state.n === 1) return { winner: 0, reason: `alle Paare in ${state.flips} Zügen` };
  const best = Math.max(...state.scores);
  const top = state.scores.map((x, q) => (x === best ? q : -1)).filter((q) => q >= 0);
  return top.length === 1 ? { winner: top[0], reason: `${best} von ${state.opts.paare} Paaren` } : { winner: null, reason: `Gleichstand mit je ${best} Paaren` };
}

const fieldName = (state, i) => {
  const [cols] = SIZES[state.opts.paare];
  return `Reihe ${Math.floor(i / cols) + 1}, Feld ${(i % cols) + 1}`;
};

export function describeMove(state, move) {
  try {
    const m = state.cards[move.flip];
    const what = m === null || m === undefined ? '' : ` (${MOTIF_NAMES[m]})`;
    if (!state.open.length) return `deckt auf: ${fieldName(state, move.flip)}${what}`;
    const a = state.cards[state.open[0]];
    if (m !== null && a === m) return `findet ein Paar${what}`;
    return `deckt auf: ${fieldName(state, move.flip)}${what} – kein Paar`;
  } catch {
    return '?';
  }
}

export function positionKey(state) {
  return JSON.stringify([state.phase, state.turn, state.cards, state.found, state.open, state.shown]);
}

// Sicht: nur offene Karten (gefunden, gerade aufgedeckt, zuletzt falsches Paar); gleich für alle Sitze
export function viewFor(state, seat) {
  const vis = (i) => state.found[i] !== null || state.open.includes(i) || (state.shown && state.shown.includes(i)) || state.phase === 'over';
  return { ...state, cards: state.cards.map((c, i) => (vis(i) ? c : null)), found: state.found.slice(), open: state.open.slice(), scores: state.scores.slice(), memory: state.memory.map((x) => x.slice()) };
}

export function evaluate(state, seat) {
  if (!state || !state.scores || state.n < 2) return 0;
  let other = -Infinity;
  for (let q = 0; q < state.n; q++) if (q !== seat) other = Math.max(other, state.scores[q]);
  return state.scores[seat] - other;
}

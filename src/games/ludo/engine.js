// Ludo (Regeln wie das bekannte deutsche Würfel-Laufspiel) – reine Regel-Engine ohne DOM, ohne Zufall.
// Würfel kommen über chance/applyChance ({ kind:'dice', n:1 } → [d]).
//
// Quelle: offizielle Spielanleitung von Schmidt Spiele (Standardausgabe 49020/49021),
//   https://www.schmidtspiele.de/files/Produkte/4/49020%20-%20Standardausgabe/49020_49021_Mensch_aergere_Dich_nicht_DE.pdf
//   ergänzend https://de.wikipedia.org/wiki/Mensch_%C3%A4rgere_Dich_nicht
//
// Brett: Laufbahn mit 40 Feldern (absolut 0..39), Startfeld (A-Feld) der Farbe f = Feld f*10.
// Farben fest: 0 Rot, 1 Blau, 2 Grün, 3 Gelb. Sitzfarben: 2 Spieler → [0,2], 3 → [0,1,2], 4 → [0,1,2,3].
// Je Farbe 4 Häuschen (B-Felder) und 4 Zielfelder (a–d).
//
// Zustand (reines JSON):
//   { n: Sitzzahl, opts: { players, schlagpflicht, dreimal, startfigur, zielspringen },
//     colors: [Farbe je Sitz], pieces: [[p,p,p,p] je Sitz], turn: Sitz,
//     phase: 'roll' | 'rolling' | 'move' | 'over', die: null | 1..6,
//     tries: Fehlwürfe in diesem Zug (für 3× würfeln), sixes: Sechsen in Folge in diesem Zug,
//     lastRoll: null | { seat, value, moved: boolean, reason? },
//     last: null | { seat, piece, from, to, capture: null | { seat, piece } }   (letzter Figurenzug, für die Ansicht),
//     winner: null | Sitz, ply }
//   p = -1 im Haus (B-Feld), 0..39 Schritte ab eigenem Startfeld (0 = auf dem eigenen Startfeld),
//   40..43 Zielfelder (40 = erstes Zielfeld a). Absolutes Bahnfeld = (Farbe*10 + p) % 40 → absField().
//   roll    – `turn` muss { type:'roll' } spielen
//   rolling – Wurf ausstehend (chance)
//   move    – `turn` zieht mit `die`: { type:'move', piece: k } (k = 0..3)
//   Ist nach einem Wurf kein Zug möglich, schaltet applyChance selbst weiter (nächster Versuch beim
//   3×-Würfeln bzw. nächster Sitz) und setzt lastRoll.moved = false mit kurzem Grund.
//
// Regel-Entscheidungen (Quelle Schmidt, Grundregeln; Varianten als Option):
// - Start: eine Figur steht schon auf dem Startfeld, drei im Haus (Quelle). Option startfigur:false = alle vier im Haus.
// - Mit einer 6 muss eine Figur aus dem Haus aufs Startfeld, solange Figuren im Haus sind und das Startfeld nicht
//   von einer eigenen Figur besetzt ist; eine fremde Figur dort wird geschlagen.
// - Startfeld räumen: Solange Figuren im Haus warten, muss die eigene Figur auf dem Startfeld weiterziehen,
//   sobald sie kann (bei jeder Augenzahl). Diese Pflichten gehen vor der Schlagpflicht.
// - Nach einer 6 (mit Zug) wird noch einmal gewürfelt. Ohne möglichen Zug gibt es keinen Extrawurf.
// - Schlagen: wer genau auf eine fremde Figur trifft, schickt sie ins Haus. Kein Schlagzwang (Option schlagpflicht:
//   Variante der Anleitung, hier nur erlaubte Schlag-Züge statt „Pusten“).
// - Eigene Figuren nicht auf dasselbe Feld; überspringen auf der Bahn erlaubt.
// - Zielfelder werden einzeln gezählt, nur exakt erreichbar; fremde Zielfelder nie. Überspringen im Ziel ist nach
//   den Grundregeln erlaubt; Option zielspringen:false = Variante „Überspringen im Ziel verboten“.
// - 3× würfeln (Variante der Anleitung, hier Standard an): wer keine Figur auf der Bahn hat und im Ziel nicht mehr
//   vorrücken kann, hat bis zu drei Würfe für eine 6.
// - Wer zuerst alle vier Figuren im Ziel hat, gewinnt; die Partie endet dann. Sitz 0 beginnt.
//
// evaluate: Einheit „Felder“ – eigener Fortschritt minus Durchschnitt der anderen. Fortschritt einer Figur:
//   Haus 0, sonst p + 1 (Startfeld 1, Zielfelder 41..44).

export const id = 'ludo';
export const title = 'Ludo';
export const PLAYERS = ['Rot', 'Blau', 'Grün', 'Gelb'];
export const COLORS = PLAYERS;

export const TRACK = 40;
export const GOAL = 40;        // erstes Zielfeld (relativ)
export const LAST = 43;        // letztes Zielfeld (relativ)
export const HOME = -1;
const SEAT_COLORS = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };
const PHASES = new Set(['roll', 'rolling', 'move', 'over']);

const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isDie = v => Number.isInteger(v) && v >= 1 && v <= 6;

function rawText(v) {
  try { return JSON.stringify(v) ?? String(v); } catch { return '?'; }
}

// ---------- Optionen, Start ----------

export function normalizeOptions(opts) {
  const o = isPlain(opts) ? opts : {};
  const b = (k, d) => (typeof o[k] === 'boolean' ? o[k] : d);
  const players = [2, 3, 4].includes(Number(o.players)) ? Number(o.players) : 4;
  return {
    players,
    schlagpflicht: b('schlagpflicht', false),
    dreimal: b('dreimal', true),
    startfigur: b('startfigur', true),
    zielspringen: b('zielspringen', true)
  };
}

export function initialState(opts) {
  const o = normalizeOptions(opts), n = o.players;
  const first = o.startfigur ? 0 : HOME;
  return {
    n, opts: o, colors: SEAT_COLORS[n].slice(),
    pieces: Array.from({ length: n }, () => [first, HOME, HOME, HOME]),
    turn: 0, phase: 'roll', die: null, tries: 0, sixes: 0,
    lastRoll: null, last: null, winner: null, ply: 0
  };
}

// Teststellung: pieces je Sitz, sonst wie initialState
export function setup({ players = 4, pieces, turn = 0, phase = 'roll', die = null, tries = 0, options } = {}) {
  const s = initialState({ ...(options || {}), players });
  if (pieces) s.pieces = pieces.map(a => a.slice());
  return { ...s, turn, phase: die ? 'move' : phase, die, tries };
}

// ---------- Hilfen ----------

export const colorOf = (state, seat) => state.colors[seat];
export const seatName = (state, seat) => PLAYERS[state.colors[seat]] ?? `Sitz ${seat + 1}`;
export const startField = color => color * 10;

// relatives p → absolutes Bahnfeld 0..39 (Haus/Ziel → null)
export function absField(state, seat, p) {
  if (!Number.isInteger(p) || p < 0 || p >= TRACK) return null;
  return (state.colors[seat] * 10 + p) % TRACK;
}

// Wer steht auf dem absoluten Bahnfeld a? → { seat, piece } | null
export function occupant(state, a) {
  for (let s = 0; s < state.n; s++) {
    const c = state.colors[s] * 10, ps = state.pieces[s];
    for (let k = 0; k < 4; k++) {
      const p = ps[k];
      if (p >= 0 && p < TRACK && (c + p) % TRACK === a) return { seat: s, piece: k };
    }
  }
  return null;
}

// Alle Zielkandidaten für Sitz s und Würfel d (ohne Pflichten): [{ piece, from, to, capture }]
function rawMoves(state, s, d) {
  const mine = state.pieces[s], out = [];
  for (let k = 0; k < 4; k++) {
    const p = mine[k];
    let q;
    if (p < 0) {
      if (d !== 6) continue;
      q = 0;
    } else {
      q = p + d;
      if (q > LAST) continue;
    }
    if (mine.includes(q)) continue;   // eigene Figur auf dem Zielfeld
    if (q >= GOAL && !state.opts.zielspringen) {
      let jump = false;
      for (let r = Math.max(GOAL, p + 1); r < q; r++) if (mine.includes(r)) jump = true;
      if (jump) continue;
    }
    let capture = null;
    if (q < TRACK) {
      const o = occupant(state, (state.colors[s] * 10 + q) % TRACK);
      if (o && o.seat !== s) capture = o;
    }
    out.push({ piece: k, from: p, to: q, capture });
  }
  return out;
}

// Legale Züge (mit Rauskomm-, Räum- und ggf. Schlagpflicht) für Sitz s mit Würfel d
function genMoves(state, s, d) {
  let list = rawMoves(state, s, d);
  const mine = state.pieces[s];
  const inHouse = mine.some(p => p < 0);
  if (inHouse) {
    const enter = list.filter(m => m.from < 0);
    if (enter.length) list = enter;                       // mit 6 raus (Pflicht)
    else {
      const clear = list.filter(m => m.from === 0);
      if (clear.length) list = clear;                     // Startfeld räumen
    }
  }
  if (state.opts.schlagpflicht) {
    const caps = list.filter(m => m.capture);
    if (caps.length) list = caps;
  }
  return list;
}

// Darf der Sitz 3× würfeln? Keine Figur auf der Bahn, und keine Figur im Ziel kann noch vorrücken.
export function mayRollThrice(state, s = state.turn) {
  if (!state.opts.dreimal) return false;
  const mine = state.pieces[s];
  if (mine.some(p => p >= 0 && p < TRACK)) return false;
  for (let d = 1; d <= 3; d++) if (rawMoves(state, s, d).some(m => m.from >= GOAL)) return false;
  return true;
}

const CACHE = new WeakMap();
function movesFor(state) {
  let m = CACHE.get(state);
  if (!m) {
    m = state.phase === 'move' && isDie(state.die) ? genMoves(state, state.turn, state.die) : [];
    CACHE.set(state, m);
  }
  return m;
}

function validState(s) {
  return isPlain(s) && Number.isInteger(s.n) && s.n >= 2 && s.n <= 4 && Array.isArray(s.pieces) &&
    s.pieces.length === s.n && Array.isArray(s.colors) && s.colors.length === s.n && isPlain(s.opts) &&
    Number.isInteger(s.turn) && s.turn >= 0 && s.turn < s.n && PHASES.has(s.phase);
}

// ---------- API ----------

export function currentPlayer(state) {
  return state.phase === 'roll' || state.phase === 'move' ? state.turn : null;
}

export function chance(state) {
  return state.phase === 'rolling' ? { kind: 'dice', n: 1 } : null;
}

const next = state => (state.turn + 1) % state.n;

export function applyChance(state, value) {
  if (!chance(state)) throw new Error('Kein Zufall ausstehend');
  if (!Array.isArray(value) || value.length !== 1 || !isDie(value[0])) throw new Error(`Ungültiger Wurf: ${rawText(value)}`);
  const d = value[0], s = state.turn;
  const moves = genMoves(state, s, d);
  const sixes = d === 6 ? state.sixes + 1 : 0;
  if (moves.length) {
    return { ...state, phase: 'move', die: d, sixes, lastRoll: { seat: s, value: d, moved: false } };
  }
  // kein Zug möglich → selbst weiterschalten
  const thrice = mayRollThrice(state, s);
  const tries = state.tries + 1;
  const allHome = state.pieces[s].every(p => p < 0 || p >= GOAL);
  if (thrice && tries < 3) {
    const left = 3 - tries;
    return {
      ...state, phase: 'roll', die: null, tries, sixes: 0,
      lastRoll: { seat: s, value: d, moved: false, reason: `keine 6 – noch ${left} ${left === 1 ? 'Versuch' : 'Versuche'}` }
    };
  }
  const reason = thrice ? 'keine 6 in drei Versuchen' : allHome && d !== 6 ? 'keine 6' : 'kein Zug möglich';
  return {
    ...state, turn: next(state), phase: 'roll', die: null, tries: 0, sixes: 0,
    lastRoll: { seat: s, value: d, moved: false, reason }
  };
}

export function legalMoves(state) {
  if (state.phase === 'roll') return [{ type: 'roll' }];
  if (state.phase === 'move') return movesFor(state).map(m => ({ type: 'move', piece: m.piece }));
  return [];
}

function findMove(state, move) {
  if (state.phase !== 'move' || !Number.isInteger(move.piece)) return null;
  return movesFor(state).find(m => m.piece === move.piece) || null;
}

// wirft nie; Müll → false
export function isLegal(state, move) {
  try {
    if (!validState(state) || state.winner !== null || !isPlain(move)) return false;
    const keys = Object.keys(move).filter(k => move[k] !== undefined);
    if (move.type === 'roll') return keys.length === 1 && state.phase === 'roll';
    if (move.type === 'move') {
      if (keys.length !== 2 || !keys.includes('piece')) return false;
      return !!findMove(state, move);
    }
    return false;
  } catch {
    return false;
  }
}

export function applyMove(state, move) {
  if (!isLegal(state, move)) throw new Error(`Illegaler Zug: ${rawText(move)}`);
  const s = state.turn, ply = state.ply + 1;
  if (move.type === 'roll') return { ...state, phase: 'rolling', die: null, ply };
  const m = findMove(state, move);
  const pieces = state.pieces.map(a => a.slice());
  pieces[s][m.piece] = m.to;
  if (m.capture) pieces[m.capture.seat][m.capture.piece] = HOME;
  const last = { seat: s, piece: m.piece, from: m.from, to: m.to, capture: m.capture ? { ...m.capture } : null };
  const lastRoll = { seat: s, value: state.die, moved: true };
  const base = { ...state, pieces, die: null, tries: 0, last, lastRoll, ply };
  if (pieces[s].every(p => p >= GOAL)) return { ...base, phase: 'over', winner: s, sixes: 0 };
  if (state.die === 6) return { ...base, phase: 'roll' };          // nach einer 6 nochmal
  return { ...base, turn: next(state), phase: 'roll', sixes: 0 };
}

export function result(state) {
  if (state.winner === null || state.winner === undefined) return null;
  return { winner: state.winner, reason: `${seatName(state, state.winner)} hat alle vier Figuren im Ziel` };
}

// ---------- Hilfen für die Ansicht ----------

// Legale Figurenzüge mit Feldern: { piece, from, to, fromAbs, toAbs, capture }
export function targets(state) {
  if (state.phase !== 'move') return [];
  const s = state.turn;
  return movesFor(state).map(m => ({
    piece: m.piece, from: m.from, to: m.to,
    fromAbs: absField(state, s, m.from), toAbs: absField(state, s, m.to),
    capture: m.capture ? { ...m.capture } : null
  }));
}

const pieceProgress = p => (p < 0 ? 0 : p + 1);

// Fortschritt in Feldern (Haus 0, Startfeld 1, letztes Zielfeld 44; höchstens 4 × 44 − 6 = 170)
export function progress(state, seat) {
  let n = 0;
  for (const p of state.pieces[seat]) n += pieceProgress(p);
  return n;
}

export function evaluate(state, seat) {
  const me = progress(state, seat);
  let sum = 0;
  for (let s = 0; s < state.n; s++) if (s !== seat) sum += progress(state, s);
  return me - sum / (state.n - 1);
}

const fieldText = (state, seat, p) =>
  p < 0 ? 'ins Haus' : p >= GOAL ? `ins Ziel (Feld ${p - GOAL + 1})` : p === 0 ? 'aufs Startfeld' : `auf Feld ${absField(state, seat, p) + 1}`;

export function describeMove(state, move) {
  try {
    if (!isPlain(move)) return '?';
    const name = seatName(state, state.turn);
    if (move.type === 'roll') return `${name}: würfelt`;
    if (move.type === 'move') {
      const m = findMove(state, move);
      if (!m) return '?';
      let t = `${name}: Figur ${m.piece + 1} ` + (m.from < 0 ? 'raus aufs Startfeld' : fieldText(state, state.turn, m.to));
      if (m.capture) t += `, schlägt ${seatName(state, m.capture.seat)}`;
      return t;
    }
  } catch { /* unten */ }
  return '?';
}

export function positionKey(state) {
  return `${state.n}|${state.pieces.map(a => a.join(',')).join('/')}|${state.turn}|${state.phase}|` +
    `${state.die ?? '-'}|${state.tries}`;
}

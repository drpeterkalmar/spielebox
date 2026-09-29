// Backgammon – reine Regel-Engine ohne DOM, ohne Zufall (Würfel kommen über chance/applyChance).
//
// Brett (absolut, aus Sicht von Weiß): Punkte 1–24, points[i] = Punkt i+1, + = Weiß, − = Schwarz.
//   Weiß (Sitz 0) zieht 24 → 1, Heimfeld 1–6.  Schwarz (Sitz 1) zieht 1 → 24, Heimfeld 19–24.
//
// Zustand (reines JSON):
//   { points: 24 Zahlen, bar: [w, s], off: [w, s], turn: 0|1,
//     phase: 'opening' | 'rolling' | 'roll' | 'double' | 'move' | 'over',
//     dice: null | [a, b], cube: { value, owner: null|0|1 }, options: { cube },
//     ply, over: null | { winner, reason, points }, last: null | {...} }
//   opening  – Eröffnungswurf ausstehend (chance): [a, b] = Würfel Weiß, Würfel Schwarz
//   rolling  – Wurf des Spielers `turn` ausstehend (chance)
//   roll     – `turn` wählt { type:'roll' } oder { type:'double' }
//   double   – Gegner von `turn` wählt { type:'take' } oder { type:'drop' }
//   move     – `turn` spielt den Wurf `dice`
//
// Zug im Brettspiel: { type:'play', steps:[{ from, to, die? }, …] }
//   from: Punkt 1–24 oder 'bar';  to: Punkt 1–24 oder 'off' (Abtragen); Punkte immer absolut (wie points).
//   die (optional) legt den verwendeten Würfel fest (nur beim Abtragen mit höherer Zahl mehrdeutig).
//   Kein Zug möglich → einziger legaler Zug { type:'play', steps:[] }.
//
// Intern rechnet die Engine relativ zum Spieler am Zug (Array `pos` mit 52 Zahlen):
//   pos[r] (r 0..25) = eigene Steine auf relativem Punkt r (r = Pips bis zum Abtragen; 25 = Bar, 0 = ab),
//   pos[26 + q]      = gegnerische Steine auf meinem relativen Punkt q (q = 0: gegnerische Bar, 25: gegnerisch ab).
//   Der Gegner zieht in meinen Koordinaten aufwärts; Umdrehen = flip(pos).

export const id = 'backgammon';
export const title = 'Backgammon';
export const PLAYERS = ['Weiß', 'Schwarz'];

const CHECKERS = 15;
const MAX_CUBE = 64;
const O = 26;   // Versatz der Gegnerhälfte in pos

// ---------- interne Stellung ----------

// Punkt (1–24) ↔ relativer Punkt für Spieler p
const rel = (p, point) => (p === 0 ? point : 25 - point);

export function _pos(state, p) {
  const pos = new Array(52).fill(0);
  for (let i = 0; i < 24; i++) {
    const v = state.points[i], r = rel(p, i + 1);
    const w = v > 0 ? v : 0, b = v < 0 ? -v : 0;
    pos[r] = p === 0 ? w : b;
    pos[O + r] = p === 0 ? b : w;
  }
  pos[25] = state.bar[p];
  pos[0] = state.off[p];
  pos[O] = state.bar[1 - p];
  pos[O + 25] = state.off[1 - p];
  return pos;
}

// pos (aus Sicht p) → { points, bar, off }
function fromPos(pos, p) {
  const points = new Array(24).fill(0);
  for (let r = 1; r <= 24; r++) {
    const i = rel(p, r) - 1;
    const mine = pos[r], theirs = pos[O + r];
    const w = p === 0 ? mine : theirs, b = p === 0 ? theirs : mine;
    points[i] = w - b;
  }
  const bar = [0, 0], off = [0, 0];
  bar[p] = pos[25]; off[p] = pos[0];
  bar[1 - p] = pos[O]; off[1 - p] = pos[O + 25];
  return { points, bar, off };
}

// Sicht des Gegners: eigene/gegnerische Hälfte tauschen und spiegeln
export function _flip(pos) {
  const n = new Array(52);
  for (let i = 0; i < 26; i++) {
    n[i] = pos[O + 25 - i];
    n[O + i] = pos[25 - i];
  }
  return n;
}

export const _key = pos => String.fromCharCode(...pos.map(v => 48 + v));

// Steine außerhalb des Heimfelds (inkl. Bar)
function outside(pos) {
  let n = 0;
  for (let r = 7; r <= 25; r++) n += pos[r];
  return n;
}

// Darf ein Stein von r mit Würfel d ziehen? (Bar-Pflicht wird vom Aufrufer beachtet)
function canStep(pos, r, d) {
  if (pos[r] <= 0) return false;
  if (pos[25] > 0 && r !== 25) return false;
  const t = r - d;
  if (t >= 1) return pos[O + t] < 2;
  if (outside(pos) > 0) return false;
  if (t === 0) return true;
  for (let q = r + 1; q <= 6; q++) if (pos[q] > 0) return false;   // höher besetzter Punkt → nicht überziehen
  return true;
}

// Führt einen (geprüften) Schritt aus; gibt [neue pos, Schlag?] zurück
function doStep(pos, r, d) {
  const n = pos.slice(), t = Math.max(0, r - d);
  n[r]--;
  n[t]++;
  let hit = false;
  if (t >= 1 && n[O + t] === 1) {
    n[O + t] = 0;
    n[O]++;
    hit = true;
  }
  return [n, hit];
}

const distinct = rem => [...new Set(rem)];
const without = (rem, d) => {
  const i = rem.indexOf(d), n = rem.slice();
  n.splice(i, 1);
  return n;
};

// Alle vollständigen Züge zu pos und Wurf: { maxLen, list:[{ steps:[[r,t,d,hit],…], pos, key }], keys:Set }
// Endstellungen dedupliziert; Zwischenstellungen je Restwürfel nur einmal besucht (Pasch bleibt schnell).
export function _gen(pos, dice) {
  const all = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]];
  const seen = new Set(), leaves = new Map();
  let maxLen = 0;
  const dfs = (p, rem, steps) => {
    const k = _key(p);
    const sk = k + ':' + rem.slice().sort().join('');
    if (seen.has(sk)) return;
    seen.add(sk);
    let moved = false;
    if (rem.length) {
      for (const d of distinct(rem)) {
        for (let r = 25; r >= 1; r--) {
          if (!canStep(p, r, d)) continue;
          moved = true;
          const [n, hit] = doStep(p, r, d);
          dfs(n, without(rem, d), steps.concat([[r, Math.max(0, r - d), d, hit]]));
        }
      }
    }
    if (!moved) {
      const len = steps.length;
      if (len > maxLen) { maxLen = len; leaves.clear(); }
      if (len === maxLen && !leaves.has(k)) leaves.set(k, { steps, pos: p, key: k });
    }
  };
  dfs(pos, all, []);
  let list = [...leaves.values()];
  // Nur ein Würfel spielbar (verschiedene Zahlen): der höhere ist Pflicht, falls möglich
  if (maxLen === 1 && dice[0] !== dice[1]) {
    const hi = Math.max(dice[0], dice[1]);
    const withHi = list.filter(m => m.steps[0][2] === hi);
    if (withHi.length) list = withHi;
  }
  return { maxLen, list, keys: new Set(list.map(m => m.key)), dice: all };
}

// Schritte (relativ, [r, t, d|undefined]) auf pos anwenden; alle möglichen Würfelzuordnungen
// → Liste { pos, rem, steps:[[r,t,d,hit],…] } (nur Zweige, in denen alle Schritte gehen)
function branches(pos, all, rsteps) {
  const out = [], seen = new Set();
  const go = (p, rem, i, done) => {
    if (i === rsteps.length) {
      const k = _key(p) + ':' + rem.slice().sort().join('');
      if (!seen.has(k)) { seen.add(k); out.push({ pos: p, rem, steps: done }); }
      return;
    }
    const [r, t, want] = rsteps[i];
    for (const d of distinct(rem).sort((a, b) => a - b)) {
      if (want !== undefined && d !== want) continue;
      if (t >= 1 ? r - d !== t : r - d > 0) continue;
      if (!canStep(p, r, d)) continue;
      const [n, hit] = doStep(p, r, d);
      go(n, without(rem, d), i + 1, done.concat([[r, t, d, hit]]));
    }
  };
  go(pos, all, 0, []);
  return out;
}

// Kann von p mit rem in genau `need` weiteren Schritten eine legale Endstellung erreicht werden?
function reachable(p, rem, need, keys, memo) {
  if (need === 0) return keys.has(_key(p));
  if (rem.length < need) return false;
  const mk = _key(p) + ':' + rem.slice().sort().join('');
  if (memo.has(mk)) return memo.get(mk);
  let ok = false;
  for (const d of distinct(rem)) {
    for (let r = 25; r >= 1 && !ok; r--) {
      if (canStep(p, r, d) && reachable(doStep(p, r, d)[0], without(rem, d), need - 1, keys, memo)) ok = true;
    }
    if (ok) break;
  }
  memo.set(mk, ok);
  return ok;
}

// ---------- Hilfen ----------

function rawText(v) {
  try {
    return typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v) ?? String(v);
  } catch {
    return '?';
  }
}

const isPoint = v => Number.isInteger(v) && v >= 1 && v <= 24;
const isDie = v => Number.isInteger(v) && v >= 1 && v <= 6;
const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Absoluter Schritt → relativ [r, t, die]; null bei ungültiger Form
function relStep(p, s) {
  if (!isPlain(s)) return null;
  for (const k of Object.keys(s)) if (!['from', 'to', 'die'].includes(k) && s[k] !== undefined) return null;
  let r, t;
  if (s.from === 'bar') r = 25;
  else if (isPoint(s.from)) r = rel(p, s.from);
  else return null;
  if (s.to === 'off') t = 0;
  else if (isPoint(s.to)) t = rel(p, s.to);
  else return null;
  if (t >= r) return null;
  if (s.die !== undefined && !isDie(s.die)) return null;
  return [r, t, s.die];
}

// Relativer Schritt → absolut { from, to }
const absStep = (p, r, t) => ({ from: r === 25 ? 'bar' : rel(p, r), to: t === 0 ? 'off' : rel(p, t) });

function validState(s) {
  return isPlain(s) && Array.isArray(s.points) && s.points.length === 24 && Array.isArray(s.bar) &&
    Array.isArray(s.off) && (s.turn === 0 || s.turn === 1) && typeof s.phase === 'string' && isPlain(s.cube);
}

// Zug-Cache je (unveränderlichem) Zustand
const CACHE = new WeakMap();
export function _genFor(state) {
  return genFor(state);
}
function genFor(state) {
  let g = CACHE.get(state);
  if (!g) {
    g = _gen(_pos(state, state.turn), state.dice);
    CACHE.set(state, g);
  }
  return g;
}

function stepsOf(p, list) {
  return list.map(([r, t]) => absStep(p, r, t));
}

// ---------- API ----------

export function normalizeOptions(opts) {
  const o = isPlain(opts) ? opts : {};
  return { cube: typeof o.cube === 'boolean' ? o.cube : true };
}

const START = { 24: 2, 13: 5, 8: 3, 6: 5 };   // Weiß; Schwarz gespiegelt (25 − Punkt)

export function initialState(opts) {
  const points = new Array(24).fill(0);
  for (const [pt, n] of Object.entries(START)) {
    points[pt - 1] += n;
    points[25 - pt - 1] -= n;
  }
  return {
    points, bar: [0, 0], off: [0, 0], turn: 0, phase: 'opening', dice: null,
    cube: { value: 1, owner: null }, options: normalizeOptions(opts), ply: 0, over: null, last: null
  };
}

// Teststellung: w/b = { punkt: anzahl } (absolut), bar = [w, s]; ab = 15 − Brett − Bar.
// phase 'move' braucht dice; sonst 'roll' (oder die angegebene Phase).
export function setup({ w = {}, b = {}, bar = [0, 0], turn = 0, dice = null, phase, cube = { value: 1, owner: null }, options } = {}) {
  const points = new Array(24).fill(0);
  const put = (map, sign) => {
    for (const [k, n] of Object.entries(map)) {
      const pt = Number(k);
      if (!isPoint(pt) || !Number.isInteger(n) || n < 0) throw new Error(`setup: ungültig ${k}:${n}`);
      if (n && points[pt - 1] !== 0) throw new Error(`setup: Punkt ${pt} doppelt belegt`);
      points[pt - 1] = sign * n;
    }
  };
  put(w, 1);
  put(b, -1);
  const on = [0, 0];
  for (const v of points) { if (v > 0) on[0] += v; else on[1] -= v; }
  const off = [0, 1].map(p => {
    const n = CHECKERS - on[p] - bar[p];
    if (n < 0) throw new Error(`setup: mehr als 15 Steine für ${PLAYERS[p]}`);
    return n;
  });
  const ph = phase || (dice ? 'move' : 'roll');
  return {
    points, bar: bar.slice(), off, turn, phase: ph, dice: dice ? dice.slice() : null,
    cube: { ...cube }, options: normalizeOptions(options), ply: 0, over: null, last: null
  };
}

export function chance(state) {
  return state.phase === 'opening' || state.phase === 'rolling' ? { kind: 'dice' } : null;
}

export function applyChance(state, value) {
  if (!chance(state)) throw new Error('Kein Zufall ausstehend');
  if (!Array.isArray(value) || value.length !== 2 || !isDie(value[0]) || !isDie(value[1])) {
    throw new Error(`Ungültiger Wurf: ${rawText(value)}`);
  }
  const [a, b] = value;
  if (state.phase === 'opening') {
    if (a === b) return { ...state, last: { type: 'opening', dice: [a, b], tie: true } };
    const turn = a > b ? 0 : 1;
    return { ...state, turn, phase: 'move', dice: [a, b], last: { type: 'opening', dice: [a, b], seat: turn } };
  }
  return { ...state, phase: 'move', dice: [a, b] };
}

export function currentPlayer(state) {
  switch (state.phase) {
    case 'roll': case 'move': return state.turn;
    case 'double': return 1 - state.turn;
    default: return null;
  }
}

export function result(state) {
  return state.over || null;
}

function canDouble(state) {
  const c = state.cube;
  return state.options.cube && state.phase === 'roll' && (c.owner === null || c.owner === state.turn) &&
    c.value < MAX_CUBE;
}

export function legalMoves(state) {
  switch (state.phase) {
    case 'roll': return canDouble(state) ? [{ type: 'roll' }, { type: 'double' }] : [{ type: 'roll' }];
    case 'double': return [{ type: 'take' }, { type: 'drop' }];
    case 'move': {
      const g = genFor(state);
      return g.list.map(m => ({ type: 'play', steps: stepsOf(state.turn, m.steps) }));
    }
    default: return [];
  }
}

// Prüft einen Brettzug; liefert den passenden Zweig (mit Würfeln und Schlägen) oder null
function matchPlay(state, move) {
  if (!Array.isArray(move.steps) || move.steps.length > 4) return null;
  for (const k of Object.keys(move)) if (k !== 'type' && k !== 'steps' && move[k] !== undefined) return null;
  const p = state.turn, rs = [];
  for (const s of move.steps) {
    const r = relStep(p, s);
    if (!r) return null;
    rs.push(r);
  }
  const g = genFor(state);
  if (rs.length !== g.maxLen) return null;
  const br = branches(_pos(state, p), g.dice, rs);
  return br.find(b => g.keys.has(_key(b.pos))) || null;
}

// wirft nie; Müll → false
export function isLegal(state, move) {
  try {
    if (!validState(state) || state.over || !isPlain(move)) return false;
    const t = move.type;
    if (t === 'play') return state.phase === 'move' && !!matchPlay(state, move);
    if (Object.keys(move).some(k => k !== 'type' && move[k] !== undefined)) return false;
    if (t === 'roll') return state.phase === 'roll';
    if (t === 'double') return canDouble(state);
    if (t === 'take' || t === 'drop') return state.phase === 'double';
    return false;
  } catch {
    return false;
  }
}

// Wertung bei regulärem Ende: 1 / 2 (Gammon) / 3 (Backgammon)
function multiplier(pos) {
  if (pos[O + 25] > 0) return 1;                       // Gegner hat abgetragen
  if (pos[O] > 0) return 3;                            // Gegner auf der Bar
  for (let q = 1; q <= 6; q++) if (pos[O + q] > 0) return 3;   // Gegner in meinem Heimfeld
  return 2;
}
const REASON = { 1: 'alle Steine abgetragen', 2: 'Gammon (×2)', 3: 'Backgammon (×3)' };

export function applyMove(state, move) {
  if (!isLegal(state, move)) throw new Error(`Illegaler Zug: ${rawText(move)}`);
  const p = state.turn, o = 1 - p, ply = state.ply + 1;
  switch (move.type) {
    case 'roll':
      return { ...state, phase: 'rolling', dice: null, ply, last: { type: 'roll', seat: p } };
    case 'double':
      return { ...state, phase: 'double', ply, last: { type: 'double', seat: p, value: state.cube.value * 2 } };
    case 'take':
      return {
        ...state, phase: 'roll', cube: { value: state.cube.value * 2, owner: o }, ply,
        last: { type: 'take', seat: o }
      };
    case 'drop': {
      const over = { winner: p, reason: 'Verdopplung abgelehnt', points: state.cube.value };
      return { ...state, phase: 'over', ply, over, last: { type: 'drop', seat: o } };
    }
  }
  const b = matchPlay(state, move);
  const board = fromPos(b.pos, p);
  const steps = b.steps.map(([r, t, d, hit]) => ({ ...absStep(p, r, t), die: d, hit }));
  const last = { type: 'play', seat: p, dice: state.dice.slice(), steps };
  if (b.pos[0] === CHECKERS) {
    const m = multiplier(b.pos);
    const over = { winner: p, reason: REASON[m], points: m * state.cube.value };
    return { ...state, ...board, phase: 'over', ply, over, last };
  }
  return { ...state, ...board, turn: o, phase: 'roll', dice: null, ply, last };
}

// ---------- Hilfen für die Oberfläche ----------

function relSteps(state, steps) {
  if (!Array.isArray(steps)) throw new Error('steps muss eine Liste sein');
  return steps.map(s => {
    const r = relStep(state.turn, s);
    if (!r) throw new Error(`Ungültiger Schritt: ${rawText(s)}`);
    return r;
  });
}

// Erlaubte nächste Einzelschritte { from, to, die }, die zu mindestens einem vollständigen legalen Zug passen.
// Beim Abtragen mit höherer Zahl kann derselbe from/to mit verschiedenen Würfeln vorkommen (kleinerer zuerst).
export function partialSteps(state, stepsSoFar = []) {
  if (state.phase !== 'move' || state.over) return [];
  const p = state.turn, g = genFor(state);
  let rs;
  try { rs = relSteps(state, stepsSoFar); } catch { return []; }
  if (rs.length >= g.maxLen) return [];
  const out = [], seen = new Set(), memo = new Map();
  for (const b of branches(_pos(state, p), g.dice, rs)) {
    for (const d of distinct(b.rem).sort((x, y) => x - y)) {
      for (let r = 25; r >= 1; r--) {
        if (!canStep(b.pos, r, d)) continue;
        const t = Math.max(0, r - d), k = `${r}/${t}/${d}`;
        if (seen.has(k)) continue;
        const n = doStep(b.pos, r, d)[0];
        if (!reachable(n, without(b.rem, d), g.maxLen - rs.length - 1, g.keys, memo)) continue;
        seen.add(k);
        out.push({ ...absStep(p, r, t), die: d });
      }
    }
  }
  return out;
}

// Zwischenstellung nach Teilschritten (ohne Zugwechsel); wirft bei unmöglichen Schritten.
// Rückgabe: Zustand mit neuem Brett, `used` = verbrauchte Würfel, `rest` = übrige Würfel, `hits`.
export function applySteps(state, steps) {
  if (state.phase !== 'move') throw new Error('Kein Brettzug am Zug');
  const p = state.turn, g = genFor(state), rs = relSteps(state, steps);
  const br = branches(_pos(state, p), g.dice, rs);
  if (!br.length) throw new Error('Schritte nicht ausführbar');
  const memo = new Map();
  const b = br.find(x => reachable(x.pos, x.rem, g.maxLen - rs.length, g.keys, memo)) || br[0];
  return {
    ...state, ...fromPos(b.pos, p),
    used: b.steps.map(s => s[2]), rest: b.rem.slice(), hits: b.steps.filter(s => s[3]).length
  };
}

export function isComplete(state, steps) {
  return isLegal(state, { type: 'play', steps });
}

export function pips(state, seat) {
  const pos = _pos(state, seat);
  let n = 0;
  for (let r = 1; r <= 25; r++) n += r * pos[r];
  return n;
}

export function evaluate(state, seat) {
  return pips(state, 1 - seat) - pips(state, seat);
}

// ---------- Anzeige ----------

// Standardnotation aus Sicht des Ziehenden (eigene Punkte 24 → 1), z. B. „6-5: 24/18 13/8*“
function notation(p, dice, steps) {
  const hi = Math.max(dice[0], dice[1]), lo = Math.min(dice[0], dice[1]);
  if (!steps.length) return `${hi}-${lo}: kein Zug möglich`;
  // Ketten desselben Steins zusammenfassen (24/18 18/13 → 24/13, mit Schlag unterwegs 24/18*/13)
  const chains = [];
  for (const [r, t, , hit] of steps) {
    const c = chains.find(x => x.end === r);
    if (c) {
      c.end = t;
      if (c.hitEnd) c.via.push(r);
      c.hitEnd = hit;
    } else chains.push({ r, end: t, via: [], hitEnd: hit });
  }
  const name = r => (r === 25 ? 'bar' : r === 0 ? 'off' : String(r));
  const parts = chains.map(c => ({
    r: c.r, s: [name(c.r), ...c.via.map(v => name(v) + '*'), name(c.end) + (c.hitEnd ? '*' : '')].join('/')
  }));
  parts.sort((a, b) => b.r - a.r);
  const grouped = [];
  for (const x of parts) {
    const g = grouped.find(y => y.s === x.s && !x.s.includes('*'));
    if (g) g.n++;
    else grouped.push({ s: x.s, n: 1 });
  }
  return `${hi}-${lo}: ` + grouped.map(g => (g.n > 1 ? `${g.s}(${g.n})` : g.s)).join(' ');
}

export function describeMove(state, move) {
  try {
    if (!isPlain(move)) return '?';
    switch (move.type) {
      case 'roll': return 'würfelt';
      case 'double': return `verdoppelt auf ${state.cube.value * 2}`;
      case 'take': return 'nimmt an';
      case 'drop': return 'gibt auf';
      case 'play': {
        const b = matchPlay(state, move);
        if (b) return notation(state.turn, state.dice, b.steps);
        return '?';
      }
    }
  } catch { /* unten */ }
  return '?';
}

export function positionKey(state) {
  const d = state.dice ? state.dice.join('') : '-';
  return `${state.points.join(',')}|${state.bar.join(',')}|${state.off.join(',')}|${state.turn}|${state.phase}|${d}|` +
    `${state.cube.value}${state.cube.owner === null ? '' : state.cube.owner}`;
}

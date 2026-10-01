// Würfelglück (Regeln wie das bekannte Würfelspiel mit 5 Würfeln und Spielblock) – reine Regel-Engine ohne DOM,
// ohne Zufall. Würfel kommen über chance/applyChance ({ kind:'dice', n } → n Werte 1..6).
//
// Quelle: offizielle Spielanleitung von Schmidt Spiele (Ausgabe 49203, Grundregel + „Meisterschaftsregel“),
//   https://www.schmidtspiele.de/files/Produkte/4/49203%20-%20Kniffel%C2%AE/49203_Kniffel_DE.pdf
//   ergänzend https://de.wikipedia.org/wiki/Kniffel (Punkte-Tabellen, Bonus, Yahtzee-Unterschiede)
//
// Ablauf: Reihum hat jeder Spieler einen Zug, 13 Runden. Ein Zug hat bis zu 3 Würfe: der erste mit allen 5 Würfeln,
// danach darf man beliebige Würfel liegen lassen (halten) und den Rest neu würfeln; vorher gehaltene Würfel dürfen
// wieder mitgewürfelt werden (Wikipedia). Spätestens nach dem 3. Wurf wird genau ein freies Feld eingetragen.
//
// Punkte: oben Einser..Sechser = Summe dieser Zahl; Bonus 35 bei oben ≥ 63. Unten: Dreierpasch/Viererpasch
// (mind. 3/4 gleiche) = Summe aller Augen, Full House (3 gleiche + 2 gleiche, andere Zahl) 25, kleine Straße
// (4 in Folge) 30, große Straße (5 in Folge) 40, Fünferpasch (5 gleiche) 50, Chance = Summe aller Augen.
// Fünf gleiche sind kein Full House (beide Quellen: „zwei gleiche, andere Zahlen“) – außer über die Joker-Regel.
//
// Regel-Entscheidungen:
// - Streichen (= 0 eintragen): Grundregel Schmidt: nur wenn der Wurf in KEINEM freien Feld Punkte bringt, darf (muss)
//   ein beliebiges freies Feld gestrichen werden. Option freiStreichen (Meisterschaftsregel und Wikipedia):
//   jedes freie Feld darf jederzeit gewählt werden, ein unpassendes zählt dann 0.
// - Option joker (weiterer Fünferpasch, nur wenn das Fünferpasch-Feld schon mit 50 belegt ist – ein gestrichener
//   Fünferpasch zählt nicht als „erster“):
//     'grund'   (Standard, Schmidt-Grundregel): +50 Zusatzpunkte, dazu darf in ein beliebiges freies Feld dessen
//               Höchstpunktzahl eingetragen werden (CATMAX, „egal mit welchem Würfelergebnis“).
//     'meister' (Schmidt-Meisterschaftsregel): +50, der Wurf wird normal in ein passendes Feld eingetragen
//               (oben nur bei seiner Zahl, Dreier-/Viererpasch, Chance); ist keins frei, wird gestrichen.
//     'aus'     ohne Zusatzregel, ein weiterer Fünferpasch wird ganz normal gewertet.
//   Die Yahtzee-Variante (+100) gibt es nicht, weil die deutsche Quelle 50 nennt.
// - Es gibt keinen Leerwurf: ein Wurf mit allen 5 gehaltenen Würfeln ist nicht erlaubt (dann einfach eintragen).
// - Sitz 0 beginnt (die Anleitung lässt den höchsten Wurf beginnen – das macht der Tisch über die Sitzreihenfolge).
//
// Zustand (reines JSON):
//   { n: Sitzzahl, opts: { players, joker, freiStreichen }, turn: Sitz am Zug, round: 1..13,
//     dice: null | [5 Zahlen 1..6], held: [5 bool] (Haltemuster des letzten Wurfs), rolls: 0..3 schon gewürfelt
//     (zählt ab dem roll-Zug, also schon während 'rolling'),
//     phase: 'roll' | 'rolling' | 'choose' | 'over',
//     sheets: [je Sitz { einser … chance: Zahl | null, extra: Zusatzpunkte weiterer Fünferpasch }],
//     last: null | { seat, cat, points, extra, dice } (letzter Eintrag), ply }
//   roll    – vor dem ersten Wurf des Zugs: nur { type:'roll', hold:[false×5] }
//   rolling – Wurf ausstehend: chance = { kind:'dice', n: Zahl der nicht gehaltenen Würfel };
//             applyChance(state, [Werte]) füllt die nicht gehaltenen Würfel der Reihe nach (Index aufsteigend)
//   choose  – nach einem Wurf: { type:'roll', hold:[5 bool] } (nur wenn rolls < 3, nicht alle gehalten)
//             oder { type:'score', cat } (freies, erlaubtes Feld)
//   over    – alle Blöcke voll
//
// evaluate: Einheit „Punkte“ – erwartete eigene Endsumme minus die beste erwartete Endsumme der anderen
//   (aktuelle Summe + Durchschnittswert je freies Feld + geschätzter Bonus). 1 Spieler: (Erwartung − 200) / 10.

export const id = 'wuerfel';
export const title = 'Würfelglück';
export const PLAYERS = ['Spieler 1', 'Spieler 2', 'Spieler 3', 'Spieler 4', 'Spieler 5', 'Spieler 6'];

export const ROUNDS = 13;
export const BONUS = 35;
export const BONUS_AT = 63;
export const EXTRA = 50;

export const CATS = Object.freeze([
  { key: 'einser', name: 'Einser', section: 'oben', hint: 'Nur die Einsen zählen' },
  { key: 'zweier', name: 'Zweier', section: 'oben', hint: 'Nur die Zweien zählen' },
  { key: 'dreier', name: 'Dreier', section: 'oben', hint: 'Nur die Dreien zählen' },
  { key: 'vierer', name: 'Vierer', section: 'oben', hint: 'Nur die Vieren zählen' },
  { key: 'fuenfer', name: 'Fünfer', section: 'oben', hint: 'Nur die Fünfen zählen' },
  { key: 'sechser', name: 'Sechser', section: 'oben', hint: 'Nur die Sechsen zählen' },
  { key: 'dreierpasch', name: 'Dreierpasch', section: 'unten', hint: 'Mindestens 3 gleiche: alle Augen zählen' },
  { key: 'viererpasch', name: 'Viererpasch', section: 'unten', hint: 'Mindestens 4 gleiche: alle Augen zählen' },
  { key: 'fullhouse', name: 'Full House', section: 'unten', hint: '3 gleiche und 2 andere gleiche: 25 Punkte' },
  { key: 'kleine', name: 'Kleine Straße', section: 'unten', hint: '4 Zahlen in Folge: 30 Punkte' },
  { key: 'grosse', name: 'Große Straße', section: 'unten', hint: '5 Zahlen in Folge: 40 Punkte' },
  { key: 'fuenferpasch', name: 'Fünferpasch', section: 'unten', hint: '5 gleiche: 50 Punkte' },
  { key: 'chance', name: 'Chance', section: 'unten', hint: 'Jeder Wurf: alle Augen zählen' }
].map(Object.freeze));
export const CAT_KEYS = Object.freeze(CATS.map(c => c.key));
const CAT_SET = new Set(CAT_KEYS);
export const UPPER = Object.freeze({ einser: 1, zweier: 2, dreier: 3, vierer: 4, fuenfer: 5, sechser: 6 });
export const CAT_NAME = Object.freeze(Object.fromEntries(CATS.map(c => [c.key, c.name])));
// Höchstpunktzahl je Feld (Joker-Grundregel)
export const CATMAX = Object.freeze({
  einser: 5, zweier: 10, dreier: 15, vierer: 20, fuenfer: 25, sechser: 30,
  dreierpasch: 30, viererpasch: 30, fullhouse: 25, kleine: 30, grosse: 40, fuenferpasch: 50, chance: 30
});
// Durchschnittspunkte je Feld bei guter Solo-Strategie (Verhoeff/Holderness, optimale Solo-Strategie ≈ 254 P.);
// für evaluate und als Opportunitätskosten der Bots
export const EXPECTED = Object.freeze({
  einser: 1.88, zweier: 5.28, dreier: 8.57, vierer: 12.16, fuenfer: 15.69, sechser: 19.19,
  dreierpasch: 21.66, viererpasch: 13.10, fullhouse: 22.59, kleine: 29.46, grosse: 32.71, fuenferpasch: 16.87,
  chance: 22.01
});

const JOKERS = new Set(['grund', 'meister', 'aus']);
const PHASES = new Set(['roll', 'rolling', 'choose', 'over']);
const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isDie = v => Number.isInteger(v) && v >= 1 && v <= 6;
const NO_HOLD = Object.freeze([false, false, false, false, false]);

function rawText(v) {
  try { return JSON.stringify(v) ?? String(v); } catch { return '?'; }
}

// ---------- Wertung ----------

function counts(dice) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d]++;
  return c;
}
const sum = dice => dice.reduce((a, b) => a + b, 0);
function longestRun(c) {
  let best = 0, run = 0;
  for (let v = 1; v <= 6; v++) { run = c[v] ? run + 1 : 0; if (run > best) best = run; }
  return best;
}
const isFive = dice => Array.isArray(dice) && dice.length === 5 && dice.every(d => d === dice[0]);

// Grundwertung ohne Joker
function baseScore(dice, cat) {
  const c = counts(dice), max = Math.max(...c);
  if (cat in UPPER) return c[UPPER[cat]] * UPPER[cat];
  switch (cat) {
    case 'dreierpasch': return max >= 3 ? sum(dice) : 0;
    case 'viererpasch': return max >= 4 ? sum(dice) : 0;
    case 'fullhouse': return c.includes(3) && c.includes(2) ? 25 : 0;
    case 'kleine': return longestRun(c) >= 4 ? 30 : 0;
    case 'grosse': return longestRun(c) >= 5 ? 40 : 0;
    case 'fuenferpasch': return max === 5 ? 50 : 0;
    case 'chance': return sum(dice);
  }
  return 0;
}

// Ist dieser Wurf ein weiterer Fünferpasch mit Zusatzregel?
function jokerActive(dice, sheet, opts) {
  return !!(sheet && opts && opts.joker !== 'aus' && sheet.fuenferpasch === 50 && isFive(dice));
}

// Punkte, die `cat` mit diesen Würfeln bringt (mit sheet/opts inkl. Joker-Grundregel)
export function scoreFor(dice, cat, sheet, opts) {
  if (!CAT_SET.has(cat) || !Array.isArray(dice) || dice.length !== 5) return 0;
  const o = opts ? normalizeOptions(opts) : null;
  if (o && o.joker === 'grund' && jokerActive(dice, sheet, o)) return CATMAX[cat];
  return baseScore(dice, cat);
}

// Zusatzpunkte für einen weiteren Fünferpasch (0 oder 50)
export function extraFor(dice, sheet, opts) {
  return jokerActive(dice, sheet, normalizeOptions(opts)) ? EXTRA : 0;
}

// Freie Felder, in die mit diesen Würfeln eingetragen werden darf (Streich-Regel beachtet)
export function allowedCats(dice, sheet, opts) {
  const o = normalizeOptions(opts);
  const free = CAT_KEYS.filter(k => sheet[k] === null);
  if (o.freiStreichen) return free;
  const fit = free.filter(k => scoreFor(dice, k, sheet, o) > 0);
  return fit.length ? fit : free;
}

// Summen eines Blocks
export function totals(sheet) {
  let oben = 0, unten = 0;
  for (const c of CATS) {
    const v = sheet[c.key];
    if (typeof v !== 'number') continue;
    if (c.section === 'oben') oben += v; else unten += v;
  }
  const bonus = oben >= BONUS_AT ? BONUS : 0;
  const extra = typeof sheet.extra === 'number' ? sheet.extra : 0;
  return { oben, bonus, unten, extra, gesamt: oben + bonus + unten + extra };
}

const emptySheet = () => ({ ...Object.fromEntries(CAT_KEYS.map(k => [k, null])), extra: 0 });
const isFull = sheet => CAT_KEYS.every(k => sheet[k] !== null);

// ---------- API ----------

export function normalizeOptions(opts) {
  const o = isPlain(opts) ? opts : {};
  const p = Number(o.players);
  return {
    players: Number.isInteger(p) && p >= 1 && p <= 6 ? p : 2,
    joker: JOKERS.has(o.joker) ? o.joker : 'grund',
    freiStreichen: typeof o.freiStreichen === 'boolean' ? o.freiStreichen : false
  };
}

export function initialState(opts) {
  const o = normalizeOptions(opts);
  return {
    n: o.players, opts: o, turn: 0, round: 1, dice: null, held: NO_HOLD.slice(), rolls: 0, phase: 'roll',
    sheets: Array.from({ length: o.players }, emptySheet), last: null, ply: 0
  };
}

// Teststellung: { sheets?: [teilweise Blöcke], turn, round, dice, rolls, opts }
export function setup({ opts, sheets = [], turn = 0, round = 1, dice = null, rolls, held } = {}) {
  const s = initialState(opts);
  s.sheets = s.sheets.map((e, i) => ({ ...e, ...(sheets[i] || {}) }));
  s.turn = turn;
  s.round = round;
  if (dice) {
    s.dice = dice.slice();
    s.rolls = rolls ?? 1;
    s.phase = 'choose';
  }
  if (held) s.held = held.slice();
  return s;
}

function validState(s) {
  return isPlain(s) && Number.isInteger(s.n) && s.n >= 1 && s.n <= 6 && Array.isArray(s.sheets) &&
    s.sheets.length === s.n && Number.isInteger(s.turn) && s.turn >= 0 && s.turn < s.n && PHASES.has(s.phase) &&
    Number.isInteger(s.rolls) && isPlain(s.opts);
}

export function chance(state) {
  if (state.phase !== 'rolling') return null;
  return { kind: 'dice', n: state.held.filter(h => !h).length };
}

export function applyChance(state, value) {
  const ch = chance(state);
  if (!ch) throw new Error('Kein Zufall ausstehend');
  if (!Array.isArray(value) || value.length !== ch.n || !value.every(isDie)) {
    throw new Error(`Ungültiger Wurf: ${rawText(value)} (erwartet ${ch.n} Würfel)`);
  }
  const dice = state.dice ? state.dice.slice() : [0, 0, 0, 0, 0];
  let k = 0;
  for (let i = 0; i < 5; i++) if (!state.held[i]) dice[i] = value[k++];
  return { ...state, dice, phase: 'choose' };
}

export function currentPlayer(state) {
  return state.phase === 'roll' || state.phase === 'choose' ? state.turn : null;
}

const HOLDS = [];
for (let m = 0; m < 32; m++) HOLDS.push([0, 1, 2, 3, 4].map(i => !!(m & (1 << i))));

export function legalMoves(state) {
  if (state.phase === 'roll') return [{ type: 'roll', hold: NO_HOLD.slice() }];
  if (state.phase !== 'choose') return [];
  const out = [];
  if (state.rolls < 3) for (let m = 0; m < 31; m++) out.push({ type: 'roll', hold: HOLDS[m].slice() });
  for (const cat of allowedCats(state.dice, state.sheets[state.turn], state.opts)) out.push({ type: 'score', cat });
  return out;
}

// wirft nie; Müll → false
export function isLegal(state, move) {
  try {
    if (!validState(state) || !isPlain(move)) return false;
    if (move.type === 'roll') {
      if (Object.keys(move).some(k => k !== 'type' && k !== 'hold')) return false;
      const h = move.hold;
      if (!Array.isArray(h) || h.length !== 5 || !h.every(x => typeof x === 'boolean')) return false;
      if (state.phase === 'roll') return h.every(x => !x);
      if (state.phase !== 'choose') return false;
      return state.rolls < 3 && !h.every(x => x);
    }
    if (move.type === 'score') {
      if (Object.keys(move).some(k => k !== 'type' && k !== 'cat')) return false;
      if (state.phase !== 'choose' || typeof move.cat !== 'string' || !CAT_SET.has(move.cat)) return false;
      const sheet = state.sheets[state.turn];
      if (sheet[move.cat] !== null) return false;
      return allowedCats(state.dice, sheet, state.opts).includes(move.cat);
    }
    return false;
  } catch {
    return false;
  }
}

export function applyMove(state, move) {
  if (!isLegal(state, move)) throw new Error(`Illegaler Zug: ${rawText(move)}`);
  const ply = state.ply + 1;
  if (move.type === 'roll') {
    return { ...state, phase: 'rolling', held: move.hold.slice(), rolls: state.rolls + 1, ply };
  }
  const p = state.turn, sheet = state.sheets[p];
  const points = scoreFor(state.dice, move.cat, sheet, state.opts);
  const extra = extraFor(state.dice, sheet, state.opts);
  const sheets = state.sheets.slice();
  sheets[p] = { ...sheet, [move.cat]: points, extra: sheet.extra + extra };
  const last = { seat: p, cat: move.cat, points, extra, dice: state.dice.slice() };
  const next = (p + 1) % state.n;
  const wrap = next === 0;
  const done = wrap && state.round >= ROUNDS;
  return {
    ...state, sheets, last, ply, turn: next, round: wrap && !done ? state.round + 1 : state.round,
    dice: null, held: NO_HOLD.slice(), rolls: 0, phase: done ? 'over' : 'roll'
  };
}

export function result(state) {
  if (state.phase !== 'over') return null;
  const sums = state.sheets.map(s => totals(s).gesamt);
  const best = Math.max(...sums);
  if (state.n === 1) return { winner: 0, reason: `${best} Punkte`, points: best };
  const top = sums.map((v, i) => (v === best ? i : -1)).filter(i => i >= 0);
  return top.length === 1
    ? { winner: top[0], reason: `hat die meisten Punkte (${best})`, points: best }
    : { winner: null, reason: `Gleichstand mit je ${best} Punkten`, points: best };
}

// ---------- Hilfen für die Ansicht ----------

// Wert eines Eintrags: Punkte minus Durchschnittswert des Felds, oben mit Blick auf den Bonus
function utility(sheet, cat, points, extra) {
  let u = points + extra - EXPECTED[cat];
  if (cat in UPPER) {
    const t = totals(sheet);
    if (t.oben < BONUS_AT) u += 0.6 * (points - 3 * UPPER[cat]);
  }
  return u;
}

// Freie (erlaubte) Felder mit ihren Punkten, sortiert nach Nutzen (bester Vorschlag zuerst)
export function suggestions(state) {
  if (state.phase !== 'choose' || !state.dice) return [];
  const sheet = state.sheets[state.turn];
  const extra = extraFor(state.dice, sheet, state.opts);
  return allowedCats(state.dice, sheet, state.opts)
    .map(cat => {
      const points = scoreFor(state.dice, cat, sheet, state.opts);
      return { cat, points, extra, value: utility(sheet, cat, points, extra) };
    })
    .sort((a, b) => b.value - a.value || b.points - a.points || CAT_KEYS.indexOf(a.cat) - CAT_KEYS.indexOf(b.cat))
    .map(({ cat, points, extra: x }) => ({ cat, points, extra: x }));
}

// grobe Wahrscheinlichkeit für den oberen Bonus
export function bonusChance(sheet) {
  const t = totals(sheet);
  if (t.oben >= BONUS_AT) return 1;
  const free = Object.keys(UPPER).filter(k => sheet[k] === null);
  if (!free.length) return 0;
  const need = BONUS_AT - t.oben;
  let mu = 0, v = 0;
  for (const k of free) { mu += EXPECTED[k]; v += (1.1 * UPPER[k]) ** 2; }
  const x = (mu - need) / Math.sqrt(v);
  return 1 / (1 + Math.exp(-1.7 * x));
}

// erwartete Endsumme eines Blocks
export function expectedTotal(sheet) {
  const t = totals(sheet);
  let e = t.oben + t.unten + t.extra;
  for (const k of CAT_KEYS) if (sheet[k] === null) e += EXPECTED[k];
  return e + BONUS * bonusChance(sheet);
}

export function evaluate(state, seat) {
  const exp = state.sheets.map(expectedTotal);
  if (state.n === 1) return (exp[0] - 200) / 10;
  let other = -Infinity;
  for (let i = 0; i < state.n; i++) if (i !== seat && exp[i] > other) other = exp[i];
  const v = exp[seat] - other;
  return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : 0;
}

export function describeMove(state, move) {
  try {
    if (!isPlain(move)) return '?';
    if (move.type === 'roll') {
      if (state.phase === 'roll' || !state.dice) return 'würfelt';
      const kept = state.dice.filter((_, i) => move.hold[i]);
      const k = 5 - kept.length;
      if (!kept.length) return 'würfelt alle neu';
      return `hält ${kept.join(' ')}, würfelt ${k === 1 ? '1 Würfel' : `${k} Würfel`} neu`;
    }
    if (move.type === 'score') {
      const sheet = state.sheets[state.turn];
      const pts = scoreFor(state.dice, move.cat, sheet, state.opts);
      const extra = extraFor(state.dice, sheet, state.opts);
      const name = CAT_NAME[move.cat] || '?';
      const base = pts === 0 ? `streicht ${name}` : `${name}: ${pts} ${pts === 1 ? 'Punkt' : 'Punkte'}`;
      return extra ? `${base} + ${extra} für den weiteren Fünferpasch` : base;
    }
  } catch { /* unten */ }
  return '?';
}

export function positionKey(state) {
  const sh = state.sheets.map(s => CAT_KEYS.map(k => (s[k] === null ? '-' : s[k])).join(',') + '+' + s.extra).join('/');
  return `${state.turn}|${state.round}|${state.phase}|${state.dice ? state.dice.join('') : '-'}|` +
    `${state.held.map(h => (h ? 1 : 0)).join('')}|${state.rolls}|${sh}`;
}

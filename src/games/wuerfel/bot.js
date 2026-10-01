// Bot Würfelglück.
// Stufe 1: hält die häufigste Zahl, würfelt immer dreimal (außer bei Fünferpasch) und nimmt das Feld mit den
//          meisten Punkten (bei Gleichstand das „billigste“ Feld, damit z. B. Einser statt Fünferpasch gestrichen wird).
// Stufe 2: Halte-Regeln für Straßen, Full House und Pasch, hört bei fertigen Figuren auf; Feldwahl nach
//          Punkte minus Durchschnittswert des Felds (oben mit Blick auf den Bonus).
// Stufe 3: exakte Erwartungswert-Suche über die restlichen Würfe dieses Zugs (alle 32 Halte-Muster, Würfel als
//          Multimengen mit exakten Wahrscheinlichkeiten). Endwert eines Wurfs = bestes Feld mit
//          Punkte + Zusatzpunkte + Bonus-Änderung − Opportunitätskosten (Durchschnittswert des Felds).
import {
  legalMoves, isLegal, scoreFor, extraFor, allowedCats, totals, bonusChance,
  EXPECTED, UPPER, CAT_KEYS, BONUS
} from './engine.js';

const NO_HOLD = [false, false, false, false, false];
const counts = dice => { const c = [0, 0, 0, 0, 0, 0, 0]; for (const d of dice) c[d]++; return c; };

// ---------- Stufe 1 ----------

function pickMax(state, dice, valueOf) {
  const sheet = state.sheets[state.turn];
  let best = null, bv = -Infinity;
  for (const cat of allowedCats(dice, sheet, state.opts)) {
    const v = valueOf(cat, scoreFor(dice, cat, sheet, state.opts));
    if (v > bv) { bv = v; best = cat; }
  }
  return best;
}

function level1(state) {
  const { dice } = state;
  const c = counts(dice);
  const five = Math.max(...c) === 5;
  if (state.rolls < 3 && !five) {
    let v = 6;
    for (let x = 6; x >= 1; x--) if (c[x] > c[v]) v = x;
    return { type: 'roll', hold: dice.map(d => d === v) };
  }
  // meiste Punkte, bei Gleichstand das Feld mit dem kleinsten Durchschnittswert
  return { type: 'score', cat: pickMax(state, dice, (cat, p) => p * 1000 - EXPECTED[cat]) };
}

// ---------- Stufe 2 ----------

function value2(sheet, cat, points, extra) {
  let u = points + extra - EXPECTED[cat];
  if (cat in UPPER && totals(sheet).oben < 63) u += 0.6 * (points - 3 * UPPER[cat]);
  return u;
}

function holdValues(dice, wanted) {
  const left = wanted.slice();
  return dice.map(d => {
    const i = left.indexOf(d);
    if (i < 0) return false;
    left.splice(i, 1);
    return true;
  });
}

function level2(state) {
  const { dice, opts } = state;
  const sheet = state.sheets[state.turn];
  const free = k => sheet[k] === null;
  const c = counts(dice);
  const max = Math.max(...c);
  const extra = extraFor(dice, sheet, opts);
  const best = () => pickMax(state, dice, (cat, p) => value2(sheet, cat, p, extra));
  if (state.rolls >= 3) return { type: 'score', cat: best() };

  // fertige Figuren sofort eintragen
  const s = cat => scoreFor(dice, cat, sheet, opts);
  if (max === 5 && (free('fuenferpasch') || extra)) return { type: 'score', cat: best() };
  if (free('grosse') && s('grosse') === 40) return { type: 'score', cat: 'grosse' };
  if (free('kleine') && s('kleine') === 30 && !free('grosse')) return { type: 'score', cat: 'kleine' };
  if (free('fullhouse') && s('fullhouse') === 25 && !(max === 3 && dice.includes(6) && c[6] === 3 && free('sechser'))) {
    return { type: 'score', cat: 'fullhouse' };
  }

  // Straßen: vier in Folge → auf die große gehen; drei in Folge, wenn kein Pasch lockt
  if (free('grosse') || free('kleine')) {
    for (const run of [[2, 3, 4, 5], [3, 4, 5, 6], [1, 2, 3, 4]]) {
      if (run.every(v => c[v])) {
        if (free('grosse')) return { type: 'roll', hold: holdValues(dice, run) };
      }
    }
    if (max <= 2 && free('kleine')) {
      for (const run of [[3, 4, 5], [2, 3, 4], [4, 5, 6], [1, 2, 3]]) {
        if (run.every(v => c[v])) return { type: 'roll', hold: holdValues(dice, run) };
      }
    }
  }
  // Full House: zwei Paare halten
  const pairs = [1, 2, 3, 4, 5, 6].filter(v => c[v] === 2);
  if (free('fullhouse') && pairs.length === 2) {
    return { type: 'roll', hold: holdValues(dice, [pairs[0], pairs[0], pairs[1], pairs[1]]) };
  }
  // Pasch sammeln: Zahl mit dem besten Nutzen (Anzahl, Feld oben frei, Augen)
  const paschFree = free('dreierpasch') || free('viererpasch') || free('fuenferpasch');
  let v = 0, bw = -Infinity;
  for (let x = 1; x <= 6; x++) {
    if (!c[x]) continue;
    const useful = free(Object.keys(UPPER)[x - 1]) || paschFree;
    const w = c[x] * 10 + (useful ? 20 : 0) + x;
    if (w > bw) { bw = w; v = x; }
  }
  if (c[v] === 1 && !free(Object.keys(UPPER)[v - 1])) return { type: 'roll', hold: NO_HOLD.slice() };
  return { type: 'roll', hold: dice.map(d => d === v) };
}

// ---------- Stufe 3: Erwartungswert ----------

// Multimengen als Zählvektor, Schlüssel = Σ c[v]·6^(v−1)
const POW = [1, 6, 36, 216, 1296, 7776];
const keyOf = c => c[1] + 6 * c[2] + 36 * c[3] + 216 * c[4] + 1296 * c[5] + 7776 * c[6];
const FACT = [1, 1, 2, 6, 24, 120];

// alle Multimengen der Größe k: [{ key, cnt, p }]
const MULTI = [];
for (let k = 0; k <= 5; k++) {
  const list = [];
  const c = [0, 0, 0, 0, 0, 0, 0];
  const rec = (v, left) => {
    if (v === 6) {
      c[6] = left;
      let w = FACT[k];
      for (let i = 1; i <= 6; i++) w /= FACT[c[i]];
      list.push({ key: keyOf(c), cnt: c.slice(), p: w / 6 ** k });
      return;
    }
    for (let x = 0; x <= left; x++) { c[v] = x; rec(v + 1, left - x); }
  };
  rec(1, k);
  MULTI.push(list);
}
const FINALS = MULTI[5];   // 252 Endwürfe
const diceOf = cnt => { const d = []; for (let v = 1; v <= 6; v++) for (let i = 0; i < cnt[v]; i++) d.push(v); return d; };
const FINAL_DICE = new Map(FINALS.map(f => [f.key, diceOf(f.cnt)]));

// Teilmengen (als Schlüssel) einer Multimenge
const SUBS = new Map();
function subKeys(cnt) {
  const k = keyOf(cnt);
  let s = SUBS.get(k);
  if (s) return s;
  s = [];
  const rec = (v, acc) => {
    if (v === 7) { s.push(acc); return; }
    for (let x = 0; x <= cnt[v]; x++) rec(v + 1, acc + x * POW[v - 1]);
  };
  rec(1, 0);
  SUBS.set(k, s);
  return s;
}
const sizeOfKey = key => { let n = 0; for (let v = 0; v < 6; v++) { n += key % 6; key = Math.floor(key / 6); } return n; };

// Endwert je Endwurf (bestes erlaubtes Feld)
function finalValues(sheet, opts) {
  const pb = bonusChance(sheet);
  const V = new Map();
  for (const f of FINALS) {
    const dice = FINAL_DICE.get(f.key);
    const extra = extraFor(dice, sheet, opts);
    let best = -Infinity;
    for (const cat of allowedCats(dice, sheet, opts)) {
      const pts = scoreFor(dice, cat, sheet, opts);
      let v = pts + extra - EXPECTED[cat];
      if (cat in UPPER) v += BONUS * (bonusChance({ ...sheet, [cat]: pts }) - pb);
      if (v > best) best = v;
    }
    V.set(f.key, best);
  }
  return V;
}

// Erwartungswert, wenn K gehalten und der Rest gewürfelt wird, danach Wert W
function keepEV(K, W, memo) {
  let e = memo.get(K);
  if (e !== undefined) return e;
  e = 0;
  for (const o of MULTI[5 - sizeOfKey(K)]) e += o.p * W.get(K + o.key);
  memo.set(K, e);
  return e;
}

// Wert eines Endwurfs mit einem Wurf übrig: aufhören oder bestes Halten
function oneLeft(V) {
  const memo = new Map(), W = new Map();
  for (const f of FINALS) {
    let best = V.get(f.key);
    for (const K of subKeys(f.cnt)) {
      if (K === f.key) continue;
      const e = keepEV(K, V, memo);
      if (e > best) best = e;
    }
    W.set(f.key, best);
  }
  return W;
}

function level3(state) {
  const { dice, opts } = state;
  const sheet = state.sheets[state.turn];
  const V = finalValues(sheet, opts);
  const bestCat = () => {
    const extra = extraFor(dice, sheet, opts), pb = bonusChance(sheet);
    let bc = null, bv = -Infinity;
    for (const cat of allowedCats(dice, sheet, opts)) {
      const pts = scoreFor(dice, cat, sheet, opts);
      let v = pts + extra - EXPECTED[cat];
      if (cat in UPPER) v += BONUS * (bonusChance({ ...sheet, [cat]: pts }) - pb);
      if (v > bv) { bv = v; bc = cat; }
    }
    return { type: 'score', cat: bc };
  };
  if (state.rolls >= 3) return bestCat();
  // Wert nach dem nächsten Wurf: bei 1 Restwurf V, bei 2 Restwürfen oneLeft(V)
  const W = state.rolls === 2 ? V : oneLeft(V);
  const memo = new Map();
  const cnt = counts(dice);
  let bestHold = null, bv = V.get(keyOf(cnt));
  for (let m = 0; m < 31; m++) {
    const hold = [0, 1, 2, 3, 4].map(i => !!(m & (1 << i)));
    const kc = [0, 0, 0, 0, 0, 0, 0];
    dice.forEach((d, i) => { if (hold[i]) kc[d]++; });
    const e = keepEV(keyOf(kc), W, memo);
    if (e > bv + 1e-9) { bv = e; bestHold = hold; }
  }
  return bestHold ? { type: 'roll', hold: bestHold } : bestCat();
}

export function chooseMove(state, { level = 2, rng = Math.random, timeMs = 400 } = {}) {   // eslint-disable-line no-unused-vars
  const moves = legalMoves(state);
  if (!moves.length) return null;
  if (state.phase === 'roll') return { type: 'roll', hold: NO_HOLD.slice() };
  const m = level <= 1 ? level1(state) : level === 2 ? level2(state) : level3(state);
  return m && isLegal(state, m) ? m : moves[moves.length - 1];
}

export const _internal = { finalValues, oneLeft, MULTI, CAT_KEYS };

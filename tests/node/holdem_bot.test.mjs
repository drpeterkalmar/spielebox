// Hold'em-Computer: Plausibilität (Asse nie weggeworfen, Nuts nie weggeworfen, 7-2 gegen All-in weg, Push mit wenig
// Chips), nur legale Züge aus der Sicht (ohne fremde Karten), Equity-Modul gegen bekannte Werte, kurzer Stufen-
// Vergleich im Duplicate-Selbstspiel (ausführlich: tools/holdem_selfplay.mjs).
import * as E from '../../src/games/holdem/engine.js';
import { chooseMove } from '../../src/games/holdem/bot.js';
import { equity, rangeTop, handClass, PERCENTILE, preflopEquity } from '../../src/games/holdem/equity.js';
import { mulberry32 } from '../../src/rng.js';

let passed = 0, failed = 0;
function test(name, fn) {
  const t = performance.now();
  try {
    const info = fn();
    passed++;
    console.log(`✅ ${name}${info ? ` (${info})` : ''} – ${((performance.now() - t) / 1000).toFixed(1)} s`);
  } catch (e) {
    failed++;
    console.log(`❌ ${name}\n   ${String((e && e.stack) || e).split('\n').slice(0, 6).join('\n   ')}`);
  }
}
const fail = (m) => { throw new Error(m); };
const near = (a, b, tol, m) => { if (Math.abs(a - b) > tol) fail(`${m}: ${a.toFixed(3)} statt ~${b}`); };

function perm(state, holes, board = '') {
  const n = state.opts.players, order = [];
  for (let p = state.sb, k = 0; k < n; k++, p = (p + 1) % n) if (state.out[p] === null) order.push(p);
  const want = [];
  const H = {};
  for (const p of order) H[p] = (holes[p] || '').split(' ').filter(Boolean);
  for (let r = 0; r < 2; r++) for (const p of order) want.push(H[p][r] || null);
  const b = board.split(' ').filter(Boolean);
  want.push(null, b[0] || null, b[1] || null, b[2] || null, null, b[3] || null, null, b[4] || null);
  const used = new Set(want.filter(Boolean));
  const rest = E.DECK.filter((c) => !used.has(c));
  return want.map((c) => c || rest.shift()).concat(rest).map((c) => E.DECK.indexOf(c));
}
const mv = (s, type, to) => E.applyMove(s, to === undefined ? { type } : { type, to });

test('Equity: bekannte Werte (AA vs KK ~82 %, AKs vs 22 ~50 %, Flush-Draw + Overcard am Flop ~45 % gegen QQ)', () => {
  const rng = mulberry32(3);
  const kk = rangeTop(100).filter(([x, y]) => handClass(x, y) === 'KK');
  near(equity(['AS', 'AH'], [], [kk], { iters: 40000, rng }).eq, 0.82, 0.015, 'AA vs KK');
  const tt = rangeTop(100).filter(([x, y]) => handClass(x, y) === '22');
  near(equity(['AS', 'KS'], [], [tt], { iters: 40000, rng }).eq, 0.50, 0.02, 'AKs vs 22');
  near(equity(['AS', 'AH'], [], [null], { iters: 40000, rng }).eq, 0.852, 0.01, 'AA vs zufällig');
  near(preflopEquity('AA', 1), 0.852, 0.005, 'Tabelle AA');
  const pair = rangeTop(100).filter(([x, y]) => handClass(x, y) === 'QQ');
  near(equity(['AH', '5H'], ['KH', '9H', '2C'], [pair], { iters: 40000, rng }).eq, 0.45, 0.025, 'Nut-Flush-Draw + Overcard vs QQ (12 Outs)');
  if (!(PERCENTILE.AA < 1 && PERCENTILE['32o'] > 99 && PERCENTILE['72o'] > 95)) fail(`Perzentile ${PERCENTILE['72o']}`);
});

test('Asse werden vor dem Flop nie weggeworfen (alle Stufen, viele Lagen)', () => {
  const rng = mulberry32(11);
  let n = 0;
  for (let i = 0; i < 300; i++) {
    const players = 2 + Math.floor(rng() * 7);
    let s = E.initialState({ players });
    const p = [...Array(52).keys()];
    for (let k = 51; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [p[k], p[j]] = [p[j], p[k]]; }
    s = E.applyChance(s, p);
    // ein paar zufällige Züge vor uns
    while (s.phase === 'bet' && rng() < 0.6) {
      const lm = E.legalMoves(s).filter((m) => m.type !== 'fold');
      s = E.applyMove(s, lm[Math.floor(rng() * lm.length)]);
    }
    if (s.phase !== 'bet' || s.street !== 0) continue;
    s.holes = s.holes.slice();
    const used = new Set(s.holes.flat().filter((c, k) => Math.floor(k / 2) !== s.turn));
    if (used.has('AS') || used.has('AH')) continue;
    s.holes[s.turn] = ['AS', 'AH'];
    for (const level of [1, 2, 3]) {
      const m = chooseMove(E.viewFor(s, s.turn), { level, rng, iters: 200 });
      if (m.type === 'fold') fail(`Stufe ${level} wirft Asse weg`);
      n++;
    }
  }
  return `${n} Entscheidungen`;
});

test('Nuts am River vor einem Einsatz: nie aussteigen (mittel/stark), meist erhöhen', () => {
  let raises = 0, n = 0;
  for (let seed = 0; seed < 40; seed++) {
    let s = E.initialState({ players: 2 });
    s = E.applyChance(s, perm(s, { 0: 'AH KH', 1: '7C 7D' }, 'QH JH TH 2C 3S'));
    s = mv(s, 'call'); s = mv(s, 'check');
    s = mv(s, 'check'); s = mv(s, 'check'); s = mv(s, 'check'); s = mv(s, 'check');
    s = mv(s, 'raise', 20 + 10 * (seed % 5));   // BB setzt am River
    for (const level of [2, 3]) {
      const m = chooseMove(E.viewFor(s, 0), { level, rng: mulberry32(seed), iters: 300 });
      if (m.type === 'fold') fail('Royal Flush weggeworfen');
      if (m.type === 'raise') raises++;
      n++;
    }
  }
  if (raises < n * 0.8) fail(`nur ${raises}/${n} Erhöhungen mit dem Royal Flush`);
  return `${raises}/${n} erhöht`;
});

test('7-2 gegen All-in mit 100 Big Blinds: mittel/stark steigen aus', () => {
  for (let seed = 0; seed < 30; seed++) {
    let s = E.initialState({ players: 3, start: 2000 });
    s = E.applyChance(s, perm(s, { 0: '7C 2D', 1: 'QS JS', 2: 'AS AD' }));
    s = mv(s, 'raise', 2000);   // Knopf? Reihenfolge: UTG = Knopf (0) bei 3 Spielern → 0 zuerst
    if (s.turn !== 1) { /* 0 war am Zug: weiterer Fall */ }
    const who = s.turn;
    s.holes[who] = ['7H', '2S'];
    for (const level of [2, 3]) {
      const m = chooseMove(E.viewFor(s, who), { level, rng: mulberry32(seed), iters: 300 });
      if (m.type !== 'fold') fail(`Stufe ${level} geht mit 7-2 All-in: ${JSON.stringify(m)}`);
    }
  }
});

test('Wenige Chips (5 Big Blinds), niemand vor mir: stark geht mit A-K All-in, wirft 7-2 weg', () => {
  for (let seed = 0; seed < 20; seed++) {
    let s = E.initialState({ players: 4 });
    s.stacks = [100, 1000, 1000, 1000];
    s.startStacks = s.stacks.slice();
    // Platz 0 ist Knopf; UTG = 3 zuerst → 3 steigt aus, dann Knopf
    s = E.applyChance(s, perm(s, { 0: 'AS KD' }));
    s = mv(s, 'fold');
    const m = chooseMove(E.viewFor(s, 0), { level: 3, rng: mulberry32(seed), iters: 200 });
    if (!(m.type === 'raise' && m.to === 100)) fail(`kein All-in mit AK: ${JSON.stringify(m)}`);
    s.holes[0] = ['7C', '2D'];
    const m2 = chooseMove(E.viewFor(s, 0), { level: 3, rng: mulberry32(seed), iters: 200 });
    if (m2.type !== 'fold') fail(`7-2 nicht weggeworfen: ${JSON.stringify(m2)}`);
  }
});

test('Sicht ohne fremde Karten reicht; gleiche Zufallsfolge = gleicher Zug', () => {
  const rng = mulberry32(5);
  let s = E.initialState({ players: 6 });
  let checked = 0;
  for (let h = 0; h < 40 && s.phase !== 'over'; h++) {
    if (E.chance(s)) { const p = [...Array(52).keys()].sort(() => rng() - 0.5); s = E.applyChance(s, p); }
    while (s.phase === 'bet') {
      const v = E.viewFor(s, s.turn);
      for (let q = 0; q < 6; q++) if (q !== s.turn && !s.shown[q] && v.holes[q].some(Boolean)) fail('Sicht verrät Karten');
      const level = 1 + (checked % 3);
      const a = chooseMove(v, { level, rng: mulberry32(checked), iters: 150 });
      const b = chooseMove(JSON.parse(JSON.stringify(v)), { level, rng: mulberry32(checked), iters: 150 });
      if (JSON.stringify(a) !== JSON.stringify(b)) fail('nicht reproduzierbar');
      if (!E.isLegal(s, a)) fail(`ungültig ${JSON.stringify(a)}`);
      s = E.applyMove(s, a);
      checked++;
    }
  }
  return `${checked} Entscheidungen`;
});

// kurzer Duplicate-Vergleich Heads-up (je Mischung beide Sitzordnungen)
function duel(a, b, decks, seed) {
  let tot = 0;
  const xs = [];
  for (let d = 0; d < decks; d++) {
    const r = mulberry32(seed + d);
    const p = [...Array(52).keys()];
    for (let i = 51; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    let deck = 0;
    for (const lv of [[a, b], [b, a]]) {
      let s = E.initialState({ players: 2, start: 2000, blinds: 'aus' });
      s = E.applyChance(s, p);
      const rng = mulberry32(seed * 7 + d);
      while (s.phase === 'bet') s = E.applyMove(s, chooseMove(E.viewFor(s, s.turn), { level: lv[s.turn], rng, iters: 250 }));
      deck += lv[0] === a ? s.lastHand.delta[0] : s.lastHand.delta[1];
    }
    xs.push(deck / 2);
    tot += deck / 2;
  }
  const mean = tot / decks;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (decks - 1));
  return { per100: mean * 100, ci: 1.96 * sd / Math.sqrt(decks) * 100 };
}

test('Stufen-Vergleich (kurz, je 3 000 Hände Heads-up duplicate): stark > leicht, mittel > leicht, stark > mittel', () => {
  const out = [];
  for (const [a, b] of [[3, 1], [2, 1], [3, 2]]) {
    const r = duel(a, b, 1500, 1000 * a + b);
    if (r.per100 - r.ci <= 0) fail(`Stufe ${a} gegen ${b}: ${r.per100.toFixed(0)} ± ${r.ci.toFixed(0)} Chips/100`);
    out.push(`${a}>${b}: +${Math.round(r.per100)} ± ${Math.round(r.ci)}`);
  }
  return out.join(', ');
});

console.log(`\n${passed} ✅, ${failed} ❌`);
process.exit(failed ? 1 : 0);

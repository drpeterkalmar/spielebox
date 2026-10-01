// Regeltests Würfelglück: Wertung (Beispiele aus Wikipedia und der Schmidt-Anleitung), Wurf-Ablauf, Halten,
// Streich-Regel, weiterer Fünferpasch (Joker-Varianten), Ende/Sieger, Hilfen für die Ansicht, evaluate, Bot-Stufen.
// Aufruf: node tests/node/wuerfel.test.mjs
import assert from 'node:assert/strict';
import * as W from '../../src/games/wuerfel/engine.js';
import { chooseMove } from '../../src/games/wuerfel/bot.js';
import { RULES } from '../../src/games/wuerfel/rules.js';
import { mulberry32, randInt, pick } from '../../src/rng.js';
import { valueFor } from '../../src/net/fair.js';

const t0 = performance.now();
let passed = 0, failed = 0;
function test(name, fn) {
  try {
    const info = fn();
    passed++;
    console.log(`✅ ${name}${info ? ` (${info})` : ''}`);
  } catch (e) {
    failed++;
    console.log(`❌ ${name}\n   ${String((e && e.stack) || e).split('\n').slice(0, 5).join('\n   ')}`);
  }
}

const deepFreeze = o => {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
};
const sc = (dice, cat) => W.scoreFor(dice, cat);
const roll = hold => ({ type: 'roll', hold });
const NONE = [false, false, false, false, false];
const hex = rng => Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(rng() * 16)]).join('');

// Partie mit Bots/Zufall zu Ende spielen; liefert Endzustand
function playOut(opts, policy, seed) {
  const rng = mulberry32(seed);
  let s = W.initialState(opts);
  while (!W.result(s)) {
    const ch = W.chance(s);
    if (ch) { s = W.applyChance(s, Array.from({ length: ch.n }, () => 1 + randInt(rng, 6))); continue; }
    s = W.applyMove(s, policy(s, rng));
  }
  return s;
}

// ---------- Grundlagen ----------

test('Exporte, Startzustand, Optionen', () => {
  assert.equal(W.id, 'wuerfel');
  assert.equal(W.title, 'Würfelglück');
  assert.equal(W.PLAYERS.length, 6);
  assert.equal(W.CATS.length, 13);
  assert.deepEqual(W.CATS.map(c => c.key), ['einser', 'zweier', 'dreier', 'vierer', 'fuenfer', 'sechser',
    'dreierpasch', 'viererpasch', 'fullhouse', 'kleine', 'grosse', 'fuenferpasch', 'chance']);
  assert.ok(W.CATS.every(c => c.name && c.hint && (c.section === 'oben' || c.section === 'unten')));
  assert.ok(!W.CATS.some(c => /kniffel|yahtzee|yatzy/i.test(c.name + c.hint)), 'kein Markenname');
  assert.deepEqual(W.normalizeOptions({}), { players: 2, joker: 'grund', freiStreichen: false });
  assert.deepEqual(W.normalizeOptions({ players: 9, joker: 'x', freiStreichen: 1 }), { players: 2, joker: 'grund', freiStreichen: false });
  assert.deepEqual(W.normalizeOptions({ players: 6, joker: 'meister', freiStreichen: true }), { players: 6, joker: 'meister', freiStreichen: true });
  assert.equal(W.normalizeOptions({ players: 1 }).players, 1);
  const s = W.initialState({ players: 3 });
  assert.equal(s.n, 3); assert.equal(s.sheets.length, 3); assert.equal(s.phase, 'roll');
  assert.equal(s.round, 1); assert.equal(s.rolls, 0); assert.equal(s.dice, null);
  assert.equal(W.currentPlayer(s), 0);
  assert.deepEqual(W.legalMoves(s), [roll(NONE)]);
  assert.ok(RULES.title && RULES.source.includes('schmidtspiele.de') && RULES.items.length >= 10);
  assert.deepEqual(Object.keys(RULES.options).sort(), ['freiStreichen', 'joker', 'players']);
  assert.ok(!/kniffel|yahtzee/i.test(RULES.items.join(' ')), 'Regeltexte ohne Markennamen');
});

test('Oberer Block: Beispiele aus der Wikipedia-Tabelle', () => {
  assert.equal(sc([1, 1, 1, 3, 4], 'einser'), 3);
  assert.equal(sc([2, 2, 2, 5, 6], 'zweier'), 6);
  assert.equal(sc([3, 3, 3, 3, 4], 'dreier'), 12);
  assert.equal(sc([4, 4, 5, 5, 5], 'vierer'), 8);
  assert.equal(sc([1, 1, 2, 2, 6], 'fuenfer'), 0);
  assert.equal(sc([2, 3, 6, 6, 6], 'sechser'), 18);
  // Schmidt-Beispiel Melanie: drei Fünfen, zwei Dreien
  const d = [5, 3, 5, 3, 5];
  assert.equal(sc(d, 'fuenfer'), 15); assert.equal(sc(d, 'dreier'), 6);
  assert.equal(sc(d, 'dreierpasch'), 21); assert.equal(sc(d, 'fullhouse'), 25);
});

test('Pasch: Summe aller Augen, sonst 0', () => {
  assert.equal(sc([2, 3, 4, 4, 4], 'dreierpasch'), 17);
  assert.equal(sc([4, 5, 5, 5, 5], 'viererpasch'), 24);
  assert.equal(sc([4, 5, 5, 5, 5], 'dreierpasch'), 24, 'vier gleiche sind auch ein Dreierpasch');
  assert.equal(sc([2, 2, 4, 4, 6], 'dreierpasch'), 0);
  assert.equal(sc([4, 4, 4, 5, 5], 'viererpasch'), 0);
  assert.equal(sc([6, 6, 6, 6, 6], 'viererpasch'), 30);
});

test('Full House 25; fünf gleiche sind kein Full House', () => {
  assert.equal(sc([2, 2, 5, 5, 5], 'fullhouse'), 25);
  assert.equal(sc([1, 4, 1, 4, 4], 'fullhouse'), 25);
  assert.equal(sc([3, 3, 3, 3, 3], 'fullhouse'), 0);
  assert.equal(sc([3, 3, 3, 3, 2], 'fullhouse'), 0);
  assert.equal(sc([1, 1, 2, 2, 3], 'fullhouse'), 0);
});

test('Straßen: kleine 30, große 40', () => {
  assert.equal(sc([1, 3, 4, 5, 6], 'kleine'), 30);
  assert.equal(sc([1, 2, 3, 4, 3], 'kleine'), 30);
  assert.equal(sc([6, 2, 5, 3, 4], 'kleine'), 30, 'große Straße zählt auch als kleine');
  assert.equal(sc([1, 2, 4, 5, 6], 'kleine'), 0);
  assert.equal(sc([1, 2, 3, 4, 5], 'grosse'), 40);
  assert.equal(sc([2, 3, 4, 5, 6], 'grosse'), 40);
  assert.equal(sc([1, 2, 3, 4, 6], 'grosse'), 0);
  assert.equal(sc([1, 3, 4, 5, 6], 'grosse'), 0);
});

test('Fünferpasch 50, Chance = Summe', () => {
  assert.equal(sc([1, 1, 1, 1, 1], 'fuenferpasch'), 50);
  assert.equal(sc([6, 6, 6, 6, 5], 'fuenferpasch'), 0);
  assert.equal(sc([1, 1, 3, 3, 5], 'chance'), 13);
  assert.equal(sc([6, 6, 6, 6, 6], 'chance'), 30);
});

test('Bonus 35 ab 63 oben; totals', () => {
  const sheet = { ...W.initialState().sheets[0], einser: 3, zweier: 6, dreier: 9, vierer: 12, fuenfer: 15, sechser: 18 };
  assert.deepEqual(W.totals(sheet), { oben: 63, bonus: 35, unten: 0, extra: 0, gesamt: 98 });
  const s62 = { ...sheet, einser: 2, chance: 20, extra: 50 };
  assert.deepEqual(W.totals(s62), { oben: 62, bonus: 0, unten: 20, extra: 50, gesamt: 132 });
  // Höchstwerte (Wikipedia: 375 ohne Zusatzpunkte)
  const max = Object.fromEntries(W.CAT_KEYS.map(k => [k, W.CATMAX[k]]));
  assert.equal(W.totals({ ...max, extra: 0 }).gesamt, 375);
});

// ---------- Ablauf ----------

test('Wurf-Ablauf: erster Wurf alle 5, Halten füllt nur freie Würfel in Reihenfolge', () => {
  let s = W.initialState({ players: 1 });
  assert.equal(W.isLegal(s, roll([true, false, false, false, false])), false, 'erster Wurf ohne Halten');
  s = W.applyMove(s, roll(NONE));
  assert.equal(s.phase, 'rolling'); assert.equal(s.rolls, 1);
  assert.deepEqual(W.chance(s), { kind: 'dice', n: 5 });
  assert.equal(W.currentPlayer(s), null); assert.deepEqual(W.legalMoves(s), []);
  s = W.applyChance(s, [6, 2, 6, 3, 6]);
  assert.equal(s.phase, 'choose'); assert.deepEqual(s.dice, [6, 2, 6, 3, 6]);
  assert.equal(W.legalMoves(s).filter(m => m.type === 'roll').length, 31);
  s = W.applyMove(s, roll([true, false, true, false, true]));
  assert.deepEqual(W.chance(s), { kind: 'dice', n: 2 });
  s = W.applyChance(s, [4, 5]);
  assert.deepEqual(s.dice, [6, 4, 6, 5, 6]);
  // gehaltene Würfel dürfen wieder mitgewürfelt werden
  s = W.applyMove(s, roll([false, true, false, true, false]));
  assert.deepEqual(W.chance(s), { kind: 'dice', n: 3 });
  s = W.applyChance(s, [1, 2, 3]);
  assert.deepEqual(s.dice, [1, 4, 2, 5, 3]);
  assert.equal(s.rolls, 3);
  const ms = W.legalMoves(s);
  assert.ok(ms.every(m => m.type === 'score'), 'nach 3 Würfen nur noch eintragen');
  assert.equal(W.isLegal(s, roll(NONE)), false);
  s = W.applyMove(s, { type: 'score', cat: 'grosse' });
  assert.equal(s.sheets[0].grosse, 40);
  assert.equal(s.phase, 'roll'); assert.equal(s.round, 2); assert.equal(s.rolls, 0); assert.equal(s.dice, null);
  assert.deepEqual(s.last, { seat: 0, cat: 'grosse', points: 40, extra: 0, dice: [1, 4, 2, 5, 3] });
});

test('applyChance lehnt falsche Würfe ab', () => {
  let s = W.applyMove(W.initialState(), roll(NONE));
  for (const v of [[1, 2, 3, 4], [1, 2, 3, 4, 7], [0, 1, 2, 3, 4], [1, 2, 3, 4, 5, 6], 'abc', null, [1.5, 2, 3, 4, 5]]) {
    assert.throws(() => W.applyChance(s, v), /Ungültiger Wurf/);
  }
  s = W.applyChance(s, [1, 2, 3, 4, 5]);
  assert.throws(() => W.applyChance(s, [1, 2, 3, 4, 5]), /Kein Zufall/);
});

test('Fair-Würfel: valueFor liefert genau n Würfel für den Wurf', () => {
  const rng = mulberry32(5);
  let s = W.applyMove(W.initialState(), roll(NONE));
  const v = valueFor(W.chance(s), hex(rng));
  assert.equal(v.length, 5);
  s = W.applyChance(s, v);
  s = W.applyMove(s, roll([true, true, false, true, false]));
  const v2 = valueFor(W.chance(s), hex(rng));
  assert.equal(v2.length, 2);
  s = W.applyChance(s, v2);
  assert.ok(s.dice.every(d => d >= 1 && d <= 6));
});

test('isLegal lehnt Müll und verfälschte Züge ab, applyMove wirft', () => {
  const s = W.setup({ opts: { players: 2 }, dice: [2, 2, 3, 4, 5], rolls: 1, sheets: [{ chance: 15 }] });
  const bad = [
    null, 'roll', 42, [], {}, { type: 'roll' }, roll([true, false, false, false]), roll([true, false, false, false, false, false]),
    roll([1, 0, 0, 0, 0]), roll('xxxxx'), roll([true, true, true, true, true]), { type: 'roll', hold: NONE, x: 1 },
    { type: 'score' }, { type: 'score', cat: 'kniffel' }, { type: 'score', cat: 'chance' }, { type: 'score', cat: 'extra' },
    { type: 'score', cat: 'toString' }, { type: 'score', cat: 'einser', extra: 1 }, { type: 'pass' }, { type: 'score', cat: 3 }
  ];
  for (const m of bad) {
    assert.equal(W.isLegal(s, m), false, JSON.stringify(m));
    assert.throws(() => W.applyMove(s, m), /Illegaler Zug/);
  }
  assert.equal(W.isLegal(null, roll(NONE)), false);
  assert.equal(W.isLegal({ phase: 'choose' }, roll(NONE)), false);
  assert.equal(W.isLegal(s, roll(NONE)), true);
  assert.equal(W.isLegal(s, { type: 'score', cat: 'kleine' }), true);
  // vor dem ersten Wurf kein Eintragen
  assert.equal(W.isLegal(W.initialState(), { type: 'score', cat: 'chance' }), false);
  // während des Wurfs nichts
  assert.equal(W.isLegal(W.applyMove(s, roll(NONE)), roll(NONE)), false);
});

test('Streichen (Grundregel): nur wenn kein freies Feld passt', () => {
  // 1-2-4-5-6: passt in Einser, Zweier, Vierer, Fünfer, Sechser, Chance – Fünferpasch darf nicht gestrichen werden
  let s = W.setup({ opts: { players: 1 }, dice: [1, 2, 4, 5, 6], rolls: 3 });
  assert.equal(W.isLegal(s, { type: 'score', cat: 'fuenferpasch' }), false);
  assert.deepEqual(W.legalMoves(s).map(m => m.cat).sort(), ['chance', 'einser', 'fuenfer', 'sechser', 'vierer', 'zweier']);
  // nichts passt mehr → jedes freie Feld darf gestrichen werden
  const full = { einser: 1, zweier: 2, vierer: 4, fuenfer: 5, sechser: 6, chance: 20 };
  s = W.setup({ opts: { players: 1 }, dice: [1, 2, 4, 5, 6], rolls: 3, sheets: [full] });
  const cats = W.legalMoves(s).map(m => m.cat).sort();
  assert.deepEqual(cats, ['dreier', 'dreierpasch', 'fuenferpasch', 'fullhouse', 'grosse', 'kleine', 'viererpasch']);
  const n = W.applyMove(s, { type: 'score', cat: 'fuenferpasch' });
  assert.equal(n.sheets[0].fuenferpasch, 0);
  assert.equal(W.describeMove(s, { type: 'score', cat: 'fuenferpasch' }), 'streicht Fünferpasch');
});

test('Option freiStreichen (Meisterschaftsregel): jedes freie Feld, unpassend = 0', () => {
  const s = W.setup({ opts: { players: 1, freiStreichen: true }, dice: [1, 2, 4, 5, 6], rolls: 2 });
  assert.equal(W.isLegal(s, { type: 'score', cat: 'fuenferpasch' }), true);
  assert.equal(W.legalMoves(s).filter(m => m.type === 'score').length, 13);
  assert.equal(W.applyMove(s, { type: 'score', cat: 'fullhouse' }).sheets[0].fullhouse, 0);
});

test('Weiterer Fünferpasch, Grundregel: +50 und Höchstpunktzahl in beliebigem Feld', () => {
  const s = W.setup({ opts: { players: 1 }, dice: [1, 1, 1, 1, 1], rolls: 2, sheets: [{ fuenferpasch: 50 }] });
  assert.equal(W.extraFor(s.dice, s.sheets[0], s.opts), 50);
  assert.equal(W.isLegal(s, { type: 'score', cat: 'grosse' }), true);
  let n = W.applyMove(s, { type: 'score', cat: 'grosse' });
  assert.equal(n.sheets[0].grosse, 40); assert.equal(n.sheets[0].extra, 50);
  assert.deepEqual(n.last, { seat: 0, cat: 'grosse', points: 40, extra: 50, dice: [1, 1, 1, 1, 1] });
  n = W.applyMove(s, { type: 'score', cat: 'sechser' });
  assert.equal(n.sheets[0].sechser, 30, 'egal mit welchem Würfelergebnis');
  assert.equal(W.applyMove(s, { type: 'score', cat: 'fullhouse' }).sheets[0].fullhouse, 25);
  assert.equal(W.totals(n.sheets[0]).gesamt, 50 + 30 + 50);
  assert.equal(W.describeMove(s, { type: 'score', cat: 'grosse' }), 'Große Straße: 40 Punkte + 50 für den weiteren Fünferpasch');
  // gestrichener Fünferpasch: kein Zusatz, normale Wertung
  const z = W.setup({ opts: { players: 1 }, dice: [1, 1, 1, 1, 1], rolls: 2, sheets: [{ fuenferpasch: 0 }] });
  assert.equal(W.extraFor(z.dice, z.sheets[0], z.opts), 0);
  assert.equal(W.isLegal(z, { type: 'score', cat: 'grosse' }), false);
  assert.equal(W.applyMove(z, { type: 'score', cat: 'einser' }).sheets[0].einser, 5);
  // erster Fünferpasch: normal ins Fünferpasch-Feld
  const f = W.setup({ opts: { players: 1 }, dice: [4, 4, 4, 4, 4], rolls: 1 });
  const g = W.applyMove(f, { type: 'score', cat: 'fuenferpasch' });
  assert.equal(g.sheets[0].fuenferpasch, 50); assert.equal(g.sheets[0].extra, 0);
});

test('Weiterer Fünferpasch, Meisterschaftsregel: +50, nur passende Felder', () => {
  const opts = { players: 1, joker: 'meister' };
  const s = W.setup({ opts, dice: [4, 4, 4, 4, 4], rolls: 1, sheets: [{ fuenferpasch: 50 }] });
  const cats = W.legalMoves(s).filter(m => m.type === 'score').map(m => m.cat).sort();
  assert.deepEqual(cats, ['chance', 'dreierpasch', 'vierer', 'viererpasch'], 'Beispiel aus der Anleitung');
  const n = W.applyMove(s, { type: 'score', cat: 'vierer' });
  assert.equal(n.sheets[0].vierer, 20); assert.equal(n.sheets[0].extra, 50);
  // kein passendes Feld frei → streichen, Zusatzpunkte gibt es trotzdem
  const full = { fuenferpasch: 50, vierer: 8, dreierpasch: 20, viererpasch: 22, chance: 19 };
  const t = W.setup({ opts, dice: [4, 4, 4, 4, 4], rolls: 3, sheets: [full] });
  const c2 = W.legalMoves(t).map(m => m.cat);
  assert.ok(c2.includes('grosse') && c2.includes('einser'));
  const u = W.applyMove(t, { type: 'score', cat: 'grosse' });
  assert.equal(u.sheets[0].grosse, 0); assert.equal(u.sheets[0].extra, 50);
});

test('Option joker aus: weiterer Fünferpasch normal', () => {
  const s = W.setup({ opts: { players: 1, joker: 'aus' }, dice: [6, 6, 6, 6, 6], rolls: 1, sheets: [{ fuenferpasch: 50 }] });
  assert.equal(W.extraFor(s.dice, s.sheets[0], s.opts), 0);
  const n = W.applyMove(s, { type: 'score', cat: 'sechser' });
  assert.equal(n.sheets[0].sechser, 30); assert.equal(n.sheets[0].extra, 0);
  assert.equal(W.isLegal(s, { type: 'score', cat: 'fullhouse' }), false);
});

test('Reihenfolge, Runden und Ende nach 13 Runden; Sieger, Gleichstand, Solo', () => {
  // 3 Spieler, immer Chance zuerst … (Bot Stufe 1)
  const s = playOut({ players: 3 }, st => chooseMove(st, { level: 1 }), 7);
  assert.equal(s.phase, 'over'); assert.equal(s.round, 13);
  assert.ok(s.sheets.every(sh => W.CAT_KEYS.every(k => typeof sh[k] === 'number')));
  assert.equal(s.ply >= 3 * 13 * 2, true);
  const r = W.result(s), sums = s.sheets.map(x => W.totals(x).gesamt), best = Math.max(...sums);
  assert.equal(r.points, best);
  if (sums.filter(x => x === best).length === 1) assert.equal(r.winner, sums.indexOf(best));
  assert.equal(W.currentPlayer(s), null); assert.deepEqual(W.legalMoves(s), []);
  // Gleichstand
  const sheet = Object.fromEntries(W.CAT_KEYS.map(k => [k, 0]));
  const tie = { ...W.initialState({ players: 2 }), phase: 'over', round: 13, sheets: [{ ...sheet, chance: 20, extra: 0 }, { ...sheet, chance: 20, extra: 0 }] };
  assert.deepEqual(W.result(tie), { winner: null, reason: 'Gleichstand mit je 20 Punkten', points: 20 });
  const win = { ...tie, sheets: [tie.sheets[0], { ...tie.sheets[1], einser: 3 }] };
  assert.deepEqual(W.result(win), { winner: 1, reason: 'hat die meisten Punkte (23)', points: 23 });
  // Solo
  const solo = playOut({ players: 1 }, st => chooseMove(st, { level: 2 }), 3);
  const rs = W.result(solo);
  assert.equal(rs.winner, 0); assert.equal(rs.points, W.totals(solo.sheets[0]).gesamt);
  assert.equal(rs.reason, `${rs.points} Punkte`);
  assert.equal(W.result(W.initialState()), null);
  // Zugwechsel: Sitz 0 → 1 in derselben Runde, dann Runde 2
  let t = W.setup({ opts: { players: 2 }, dice: [1, 2, 3, 4, 5], rolls: 1 });
  t = W.applyMove(t, { type: 'score', cat: 'grosse' });
  assert.equal(t.turn, 1); assert.equal(t.round, 1);
  t = W.applyChance(W.applyMove(t, roll(NONE)), [2, 2, 2, 3, 3]);
  t = W.applyMove(t, { type: 'score', cat: 'fullhouse' });
  assert.equal(t.turn, 0); assert.equal(t.round, 2);
});

test('Unveränderlichkeit, JSON-Rundreise, positionKey', () => {
  let s = deepFreeze(W.initialState({ players: 2 }));
  s = deepFreeze(W.applyMove(s, roll(NONE)));
  s = deepFreeze(W.applyChance(s, [3, 3, 5, 1, 3]));
  const j = JSON.parse(JSON.stringify(s));
  assert.deepEqual(j, s);
  assert.equal(W.positionKey(j), W.positionKey(s));
  assert.deepEqual(W.legalMoves(j), W.legalMoves(s));
  const n = W.applyMove(s, { type: 'score', cat: 'dreier' });
  assert.notEqual(W.positionKey(n), W.positionKey(s));
  assert.equal(s.sheets[0].dreier, null);
});

test('describeMove: deutsche Texte', () => {
  const s0 = W.initialState();
  assert.equal(W.describeMove(s0, roll(NONE)), 'würfelt');
  const s = W.setup({ dice: [5, 2, 5, 6, 5], rolls: 1 });
  assert.equal(W.describeMove(s, roll([true, false, true, false, true])), 'hält 5 5 5, würfelt 2 Würfel neu');
  assert.equal(W.describeMove(s, roll([true, true, true, true, false])), 'hält 5 2 5 6, würfelt 1 Würfel neu');
  assert.equal(W.describeMove(s, roll(NONE)), 'würfelt alle neu');
  assert.equal(W.describeMove(s, { type: 'score', cat: 'fuenfer' }), 'Fünfer: 15 Punkte');
  assert.equal(W.describeMove(W.setup({ dice: [1, 2, 2, 3, 4], rolls: 1 }), { type: 'score', cat: 'einser' }), 'Einser: 1 Punkt');
  assert.equal(W.describeMove(s, null), '?');
});

test('suggestions: nur erlaubte freie Felder, sortiert nach Nutzen', () => {
  const s = W.setup({ dice: [2, 3, 4, 5, 6], rolls: 1, sheets: [{ kleine: 30 }] });
  const sg = W.suggestions(s);
  assert.equal(sg[0].cat, 'grosse'); assert.equal(sg[0].points, 40);
  assert.ok(!sg.some(x => x.cat === 'kleine'));
  assert.deepEqual(sg.map(x => x.cat).sort(), W.legalMoves(s).filter(m => m.type === 'score').map(m => m.cat).sort());
  for (const x of sg) assert.equal(x.points, W.scoreFor(s.dice, x.cat, s.sheets[0], s.opts));
  const fh = W.suggestions(W.setup({ dice: [6, 6, 6, 1, 1], rolls: 3 }));
  assert.equal(fh[0].cat, 'fullhouse');
  assert.deepEqual(W.suggestions(W.initialState()), []);
  // weiterer Fünferpasch: Vorschläge mit Zusatzpunkten und Höchstpunktzahl, Sechser (Bonus) oder Große Straße vorn
  const j = W.suggestions(W.setup({ dice: [2, 2, 2, 2, 2], rolls: 1, sheets: [{ fuenferpasch: 50 }] }));
  assert.ok(['sechser', 'grosse'].includes(j[0].cat), j[0].cat);
  assert.ok(j.every(x => x.extra === 50 && x.points === W.CATMAX[x.cat]));
});

test('evaluate: Start 0, Symmetrie, Vorzeichen, Solo', () => {
  const s = W.initialState({ players: 2 });
  assert.equal(W.evaluate(s, 0), 0); assert.equal(W.evaluate(s, 1), 0);
  const a = W.setup({ opts: { players: 2 }, sheets: [{ grosse: 40, fuenferpasch: 50 }, { grosse: 0, fuenferpasch: 0 }], turn: 0, round: 3 });
  assert.ok(W.evaluate(a, 0) > 50, String(W.evaluate(a, 0)));
  assert.ok(Math.abs(W.evaluate(a, 0) + W.evaluate(a, 1)) < 1e-9);
  // 3 Spieler: gegen den besten anderen
  const b = W.setup({ opts: { players: 3 }, sheets: [{ chance: 30 }, { chance: 10 }, { chance: 20 }] });
  assert.ok(W.evaluate(b, 0) > 0 && W.evaluate(b, 1) < 0 && W.evaluate(b, 2) < 0);
  assert.ok(Math.abs(W.evaluate(b, 0) - 10) < 0.01);
  // Solo: (erwartete Summe − 200) / 10, leerer Block ≈ (220 + 35 · ½ − 200) / 10
  const solo = W.initialState({ players: 1 });
  assert.ok(W.evaluate(solo, 0) > 3 && W.evaluate(solo, 0) < 5, String(W.evaluate(solo, 0)));
  // Endstand: genau die Differenz der Summen
  const end = playOut({ players: 2 }, st => chooseMove(st, { level: 2 }), 21);
  const t = end.sheets.map(x => W.totals(x).gesamt);
  assert.equal(W.evaluate(end, 0), t[0] - t[1]);
  // Zufallspartie: immer endlich, symmetrisch
  const rng = mulberry32(9);
  let x = W.initialState({ players: 2 });
  for (let i = 0; i < 200 && !W.result(x); i++) {
    const ch = W.chance(x);
    x = ch ? W.applyChance(x, valueFor(ch, hex(rng))) : W.applyMove(x, pick(rng, W.legalMoves(x)));
    const v = [W.evaluate(x, 0), W.evaluate(x, 1)];
    assert.ok(v.every(Number.isFinite)); assert.ok(Math.abs(v[0] + v[1]) < 1e-9);
  }
});

test('Bot: Stufe 3 hält 5 gleiche bzw. die Straße, nimmt die Große Straße', () => {
  const s = W.setup({ dice: [2, 3, 4, 5, 6], rolls: 1 });
  for (const level of [2, 3]) assert.deepEqual(chooseMove(s, { level }), { type: 'score', cat: 'grosse' });
  const f = W.setup({ dice: [3, 3, 3, 3, 3], rolls: 1 });
  for (const level of [1, 2, 3]) assert.deepEqual(chooseMove(f, { level }), { type: 'score', cat: 'fuenferpasch' });
  // vier in Folge, große Straße frei → Straße halten
  const k = W.setup({ dice: [2, 3, 4, 5, 5], rolls: 1 });
  const m = chooseMove(k, { level: 3 });
  assert.equal(m.type, 'roll');
  assert.deepEqual(k.dice.filter((_, i) => m.hold[i]).sort(), [2, 3, 4, 5]);
  // vor dem ersten Wurf: würfeln
  assert.deepEqual(chooseMove(W.initialState(), { level: 3 }), roll(NONE));
  // nichts mehr am Zug
  assert.equal(chooseMove({ ...W.initialState(), phase: 'rolling' }, { level: 3 }), null);
});

test('Bot-Stufen: Durchschnittspunkte über je 300 Solo-Partien', () => {
  const avg = {};
  let worst = 0;
  for (const level of [1, 2, 3]) {
    let tot = 0;
    for (let g = 0; g < 300; g++) {
      const s = playOut({ players: 1 }, (st, rng) => {
        const t = performance.now();
        const m = chooseMove(st, { level, rng, timeMs: 400 });
        worst = Math.max(worst, performance.now() - t);
        assert.ok(W.isLegal(st, m));
        return m;
      }, 1000 + g);
      tot += W.result(s).points;
    }
    avg[level] = tot / 300;
  }
  assert.ok(avg[3] >= 220, `Stufe 3 nur ${avg[3]}`);
  assert.ok(avg[2] > avg[1] + 30, `Stufe 2 ${avg[2]} vs Stufe 1 ${avg[1]}`);
  assert.ok(avg[3] > avg[2], `Stufe 3 ${avg[3]} vs Stufe 2 ${avg[2]}`);
  assert.ok(worst < 1200, `Bedenkzeit ${worst} ms`);
  return `Ø Stufe 1 ${avg[1].toFixed(1)}, Stufe 2 ${avg[2].toFixed(1)}, Stufe 3 ${avg[3].toFixed(1)}; max ${worst.toFixed(0)} ms je Zug`;
});

test('Bot-Stufen im Duell: 3 schlägt 1 klar, 2 schlägt 1', () => {
  const duel = (a, b, games) => {
    let wins = 0, draws = 0;
    for (let g = 0; g < games; g++) {
      const swap = g % 2 === 1;   // Startspieler abwechseln
      const lv = swap ? [b, a] : [a, b];
      const s = playOut({ players: 2 }, (st, rng) => chooseMove(st, { level: lv[st.turn], rng }), 5000 + g);
      const r = W.result(s);
      if (r.winner === null) draws++;
      else if (r.winner === (swap ? 1 : 0)) wins++;
    }
    return (wins + draws / 2) / games;
  };
  const r31 = duel(3, 1, 200), r21 = duel(2, 1, 200), r32 = duel(3, 2, 200);
  assert.ok(r31 > 0.8, `3 vs 1: ${r31}`);
  assert.ok(r21 > 0.7, `2 vs 1: ${r21}`);
  assert.ok(r32 > 0.5, `3 vs 2: ${r32}`);
  return `3:1 ${(r31 * 100).toFixed(0)} %, 2:1 ${(r21 * 100).toFixed(0)} %, 3:2 ${(r32 * 100).toFixed(0)} % (je 200 Partien)`;
});

console.log(`\n${passed} ✅, ${failed} ❌ (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(failed ? 1 : 0);

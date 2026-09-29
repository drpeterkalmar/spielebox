// Regeltests Backgammon: Würfelzwang, Bar, Abtragen, Wertung, Verdopplungswürfel, Oberflächen-Hilfen, Bot.
// Aufruf: node tests/node/backgammon.test.mjs
import assert from 'node:assert/strict';
import * as B from '../../src/games/backgammon/engine.js';
import { chooseMove } from '../../src/games/backgammon/bot.js';
import { mulberry32, pick, randInt } from '../../src/rng.js';

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

// Hilfen: Zug aus Text '24/18 13/8' (absolute Punkte, 'bar'/'off')
const pt = x => (x === 'bar' || x === 'off' ? x : Number(x));
const play = text => ({
  type: 'play',
  steps: text ? text.split(' ').map(s => { const [a, b] = s.split('/'); return { from: pt(a), to: pt(b) }; }) : []
});
// Zug → sortierter Text zum Vergleichen
const txt = m => m.steps.map(s => `${s.from}/${s.to}`).join(' ');
const texts = moves => moves.map(txt).sort();
const deepFreeze = o => {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
};
const count = (s, p) => {
  let n = s.bar[p] + s.off[p];
  for (const v of s.points) if (p === 0 ? v > 0 : v < 0) n += Math.abs(v);
  return n;
};
const finalKey = (s, m) => { const n = B.applySteps(s, m.steps); return `${n.points}|${n.bar}|${n.off}`; };

// Zufallsstellung in Phase 'move' (Zufallspartie, cube aus)
function randomMoveState(seed, plays) {
  const rng = mulberry32(seed);
  let s = B.initialState({ cube: false }), n = 0;
  for (;;) {
    if (B.chance(s)) { s = B.applyChance(s, [1 + randInt(rng, 6), 1 + randInt(rng, 6)]); continue; }
    if (s.over) return null;
    if (s.phase === 'move' && n++ >= plays) return s;
    s = B.applyMove(s, pick(rng, B.legalMoves(s)));
  }
}

// ---------- Grundlagen ----------

test('Startaufstellung, Pips 167:167, Exporte', () => {
  const s = B.initialState();
  assert.equal(B.id, 'backgammon');
  assert.deepEqual(B.PLAYERS, ['Weiß', 'Schwarz']);
  assert.equal(s.points[23], 2); assert.equal(s.points[12], 5); assert.equal(s.points[7], 3); assert.equal(s.points[5], 5);
  assert.equal(s.points[0], -2); assert.equal(s.points[11], -5); assert.equal(s.points[16], -3); assert.equal(s.points[18], -5);
  assert.equal(count(s, 0), 15); assert.equal(count(s, 1), 15);
  assert.equal(B.pips(s, 0), 167); assert.equal(B.pips(s, 1), 167);
  assert.equal(B.evaluate(s, 0), 0);
  assert.deepEqual(s.cube, { value: 1, owner: null });
  assert.deepEqual(B.normalizeOptions(), { cube: true });
  assert.deepEqual(B.normalizeOptions({ cube: false }), { cube: false });
  assert.deepEqual(B.normalizeOptions({ cube: 'ja', x: 1 }), { cube: true });
  assert.deepEqual(B.chance(s), { kind: 'dice' });
  assert.equal(B.currentPlayer(s), null);
  assert.deepEqual(B.legalMoves(s), []);
});

test('Eröffnung: Gleichstand → nochmal würfeln; Höherer beginnt mit genau diesen Zahlen', () => {
  let s = deepFreeze(B.initialState());
  s = deepFreeze(B.applyChance(s, [3, 3]));
  assert.equal(s.phase, 'opening');
  assert.deepEqual(B.chance(s), { kind: 'dice' });
  assert.equal(B.currentPlayer(s), null);
  const w = B.applyChance(s, [6, 1]);
  assert.equal(w.turn, 0); assert.equal(w.phase, 'move'); assert.deepEqual(w.dice, [6, 1]);
  assert.equal(B.chance(w), null);
  assert.equal(B.currentPlayer(w), 0);
  assert.ok(B.legalMoves(w).some(m => txt(m) === '13/7 8/7'), '6-1: 13/7 8/7 fehlt');
  const b = B.applyChance(s, [2, 5]);
  assert.equal(b.turn, 1); assert.deepEqual(b.dice, [2, 5]); assert.equal(B.currentPlayer(b), 1);
  assert.ok(B.legalMoves(b).every(m => m.steps.every(st => st.to > st.from)), 'Schwarz zieht aufwärts');
  assert.throws(() => B.applyChance(s, [0, 3]), /Ungültiger Wurf/);
  assert.throws(() => B.applyChance(s, [1, 2, 3]));
  assert.throws(() => B.applyChance(b, [1, 2]), /Kein Zufall/);
});

test('Eröffnung 6-5: 7 verschiedene Züge, Notation 24/13', () => {
  const s = B.applyChance(B.initialState(), [6, 5]);
  const moves = B.legalMoves(s);
  assert.equal(moves.length, 7);
  const d = moves.map(m => B.describeMove(s, m)).sort();
  assert.ok(d.includes('6-5: 24/13'), d.join(', '));
  assert.ok(d.includes('6-5: 24/18 13/8'));
  // Schwarz in eigener Perspektive: absolute 1 → 12 heißt „24/13“
  const b = B.applyChance(B.initialState(), [5, 6]);
  assert.equal(B.describeMove(b, play('1/7 7/12')), '6-5: 24/13');
  assert.equal(B.describeMove(b, play('1/12')), '?');
});

// ---------- Würfelzwang (Literaturfälle) ----------

test('Nur ein Würfel spielbar (beide einzeln möglich, nicht zusammen) → höherer Pflicht', () => {
  // Weiß: 1 Stein auf 12, 14 ab; Schwarz blockiert Punkt 1. 12/6 → 6/1 zu; 12/7 → 7/1 zu.
  const s = B.setup({ w: { 12: 1 }, b: { 1: 2, 20: 13 }, dice: [6, 5] });
  assert.deepEqual(texts(B.legalMoves(s)), ['12/6']);
  assert.equal(B.isLegal(s, play('12/7')), false, 'niedrigerer Würfel trotz möglichem höheren');
  assert.equal(B.isLegal(s, play('12/6')), true);
  assert.equal(B.describeMove(s, play('12/6')), '6-5: 12/6');
});

test('Höherer Würfel blockiert (Prime) → niedriger wird gespielt, sonst nichts', () => {
  // Schwarzer 6er-Prime 13–18, Weiß nur auf 24: 24/18 zu, 24/22 geht, 22/16 zu
  const s = B.setup({ w: { 24: 1 }, b: { 13: 2, 14: 2, 15: 2, 16: 2, 17: 2, 18: 2 }, dice: [6, 2] });
  assert.deepEqual(texts(B.legalMoves(s)), ['24/22']);
  // hinter dem Prime mit 6-6: gar nichts
  const t = B.setup({ w: { 24: 1 }, b: { 13: 2, 14: 2, 15: 2, 16: 2, 17: 2, 18: 2 }, dice: [6, 6] });
  assert.deepEqual(B.legalMoves(t), [{ type: 'play', steps: [] }]);
  assert.equal(B.isLegal(t, play('')), true);
  assert.equal(B.describeMove(t, play('')), '6-6: kein Zug möglich');
  const n = B.applyMove(t, play(''));
  assert.equal(n.turn, 1); assert.equal(n.phase, 'roll');
});

test('Beide Würfel nur in bestimmter Reihenfolge → beide Pflicht', () => {
  // Weiß auf 12, Schwarz blockiert 6: 12/6 zu, aber 12/9/3 geht
  const s = B.setup({ w: { 12: 1 }, b: { 6: 2, 20: 13 }, dice: [6, 3] });
  assert.deepEqual(texts(B.legalMoves(s)), ['12/9 9/3']);
  assert.equal(B.isLegal(s, play('12/9')), false, 'nur ein Würfel, obwohl beide gehen');
  assert.equal(B.isLegal(s, play('12/6 6/3')), false, 'über blockierten Punkt');
  assert.equal(B.isLegal(s, play('12/3')), false, 'Sprung ohne Zwischenpunkt ist kein Schritt');
  assert.equal(B.describeMove(s, play('12/9 9/3')), '6-3: 12/3');
  assert.deepEqual(B.partialSteps(s, []), [{ from: 12, to: 9, die: 3 }]);
});

test('Pasch nur teilweise spielbar → so viele wie möglich', () => {
  // 4-4, Weiß auf 24, Schwarz blockiert 12: 24/20/16, dann zu
  const s = B.setup({ w: { 24: 1 }, b: { 12: 2, 1: 13 }, dice: [4, 4] });
  assert.deepEqual(texts(B.legalMoves(s)), ['24/20 20/16']);
  assert.equal(B.isLegal(s, play('24/20')), false);
  assert.equal(B.describeMove(s, play('24/20 20/16')), '4-4: 24/16');
  // voller Pasch: 4 Teilzüge
  const f = B.applyChance(B.applyMove(B.applyMove(B.applyChance(B.initialState(), [2, 1]), play('13/11 6/5')), { type: 'roll' }), [3, 3]);
  assert.ok(B.legalMoves(f).every(m => m.steps.length === 4));
  assert.ok(B.isLegal(f, play('17/20 17/20 19/22 19/22')));
  assert.equal(B.describeMove(f, play('17/20 17/20 19/22 19/22')), '3-3: 8/5(2) 6/3(2)');
});

test('Bar-Pflicht: erst einwürfeln; geschlossenes Heimfeld → kein Zug', () => {
  const closed = B.setup({ w: { 13: 14 }, b: { 19: 2, 20: 2, 21: 2, 22: 2, 23: 2, 24: 2 }, bar: [1, 0], dice: [6, 5] });
  assert.deepEqual(B.legalMoves(closed), [{ type: 'play', steps: [] }]);
  assert.equal(B.isLegal(closed, play('13/7 13/8')), false);
  // Punkt 19 (6) zu, 20 (5) offen: einwürfeln mit 5, dann 6 frei
  const s = B.setup({ w: { 13: 14 }, b: { 19: 2, 1: 13 }, bar: [1, 0], dice: [6, 5] });
  const moves = B.legalMoves(s);
  assert.ok(moves.length > 1);
  for (const m of moves) assert.deepEqual(m.steps[0], { from: 'bar', to: 20 });
  assert.equal(B.isLegal(s, play('13/7 bar/20')), false, 'Bar nicht zuerst');
  assert.equal(B.isLegal(s, play('bar/20 20/14')), true);
  // zwei auf der Bar, nur 5 geht rein → nur ein Stein, 6 verfällt
  const two = B.setup({ w: { 13: 13 }, b: { 19: 2, 1: 13 }, bar: [2, 0], dice: [6, 5] });
  assert.deepEqual(texts(B.legalMoves(two)), ['bar/20']);
  assert.equal(B.describeMove(two, play('bar/20')), '6-5: bar/20');
});

test('Schlagen: Blot → Bar, Notation mit *', () => {
  const s = B.setup({ w: { 13: 15 }, b: { 8: 1, 1: 14 }, dice: [5, 2] });
  assert.ok(B.isLegal(s, play('13/8 13/11')));
  assert.equal(B.describeMove(s, play('13/8 13/11')), '5-2: 13/8* 13/11');
  assert.equal(B.describeMove(s, play('13/8 8/6')), '5-2: 13/8*/6');
  const n = B.applyMove(s, play('13/8 8/6'));
  assert.deepEqual(n.bar, [0, 1]);
  assert.equal(n.points[7], 0); assert.equal(n.points[5], 1);
  assert.equal(n.last.steps[0].hit, true);
  assert.equal(count(n, 1), 15);
  // Schwarz muss nun einwürfeln (Weiß-Heimfeld 1–6): mit 6-6 auf Punkt 6 (weißer Blot) → schlägt
  const r = B.applyChance(B.applyMove(n, { type: 'roll' }), [6, 6]);
  assert.ok(B.legalMoves(r).every(m => m.steps[0].from === 'bar' && m.steps[0].to === 6));
});

test('Abtragen mit höherer Zahl vom höchsten Punkt; genauer Punkt zuerst', () => {
  // Weiß: 3 auf 4, 2 auf 2; 6-5 → beide vom 4er
  const s = B.setup({ w: { 4: 3, 2: 2 }, b: { 24: 15 }, dice: [6, 5] });
  assert.deepEqual(texts(B.legalMoves(s)), ['4/off 4/off']);
  assert.equal(B.isLegal(s, play('2/off 4/off')), false, 'nicht vom niedrigeren Punkt');
  // Überziehen nur, wenn kein höherer Stein steht: 5 und 3 besetzt, Wurf 4-4 → 5/1, dann 3/off, 1/off
  const t = B.setup({ w: { 5: 1, 3: 1 }, b: { 24: 15 }, dice: [4, 4] });
  assert.equal(B.isLegal(t, play('3/off 5/1 1/off')), false, '3/off mit 4, obwohl 5 besetzt');
  assert.equal(B.isLegal(t, play('5/1 3/off 1/off')), true);
  assert.deepEqual(B.partialSteps(t, []), [{ from: 5, to: 1, die: 4 }]);
});

test('Abtragen verboten, solange ein Stein außerhalb steht (Reihenfolge zählt)', () => {
  const s = B.setup({ w: { 7: 1, 6: 5, 5: 5, 4: 4 }, b: { 24: 15 }, dice: [6, 2] });
  assert.equal(B.isLegal(s, play('6/off 7/5')), false);
  assert.equal(B.isLegal(s, play('7/5 6/off')), true);
  const first = B.partialSteps(s, []);
  assert.ok(!first.some(x => x.to === 'off'), 'Abtragen im ersten Schritt angeboten');
  assert.ok(B.partialSteps(s, [{ from: 7, to: 5 }]).some(x => x.from === 6 && x.to === 'off'));
  // Schwarz spiegelbildlich: Heimfeld 19–24, Abtragen nach 'off'
  const b = B.setup({ w: { 1: 15 }, b: { 18: 1, 19: 14 }, turn: 1, dice: [6, 1] });
  assert.ok(B.isLegal(b, play('18/19 19/off')));
  assert.equal(B.isLegal(b, play('19/off 18/19')), false);
});

test('Wertung: normal, Gammon, Backgammon, × Würfelwert', () => {
  const end = (b, bar, cube = 1) => {
    const s = B.setup({ w: { 1: 1 }, b, bar, dice: [2, 1], cube: { value: cube, owner: 1 } });
    return B.applyMove(s, play('1/off')).over;
  };
  assert.deepEqual(end({ 20: 14 }, [0, 0]), { winner: 0, reason: 'alle Steine abgetragen', points: 1 });
  assert.deepEqual(end({ 20: 15 }, [0, 0]), { winner: 0, reason: 'Gammon (×2)', points: 2 });
  assert.deepEqual(end({ 20: 14, 3: 1 }, [0, 0]), { winner: 0, reason: 'Backgammon (×3)', points: 3 });
  assert.deepEqual(end({ 20: 14 }, [0, 1]), { winner: 0, reason: 'Backgammon (×3)', points: 3 });
  assert.deepEqual(end({ 20: 15 }, [0, 0], 4), { winner: 0, reason: 'Gammon (×2)', points: 8 });
  // Schwarz gewinnt: Weiß-Steine im schwarzen Heimfeld (19–24) → Backgammon
  const s = B.setup({ w: { 22: 1, 10: 14 }, b: { 24: 1 }, turn: 1, dice: [3, 1] });
  const o = B.applyMove(s, play('24/off')).over;
  assert.deepEqual(o, { winner: 1, reason: 'Backgammon (×3)', points: 3 });
  const done = B.applyMove(s, play('24/off'));
  assert.equal(B.currentPlayer(done), null);
  assert.deepEqual(B.legalMoves(done), []);
  assert.equal(B.chance(done), null);
  assert.deepEqual(B.result(done), o);
});

test('Verdoppeln, Annehmen, Würfelbesitz, Aufgeben', () => {
  let s = B.applyChance(B.initialState(), [3, 1]);
  s = B.applyMove(s, play('8/5 6/5'));
  assert.equal(B.currentPlayer(s), 1);
  assert.deepEqual(B.legalMoves(s), [{ type: 'roll' }, { type: 'double' }]);
  assert.equal(B.describeMove(s, { type: 'double' }), 'verdoppelt auf 2');
  const d = deepFreeze(B.applyMove(s, { type: 'double' }));
  assert.equal(d.phase, 'double');
  assert.equal(B.currentPlayer(d), 0);
  assert.deepEqual(B.legalMoves(d), [{ type: 'take' }, { type: 'drop' }]);
  assert.equal(B.describeMove(d, { type: 'take' }), 'nimmt an');
  assert.equal(B.describeMove(d, { type: 'drop' }), 'gibt auf');
  // Aufgeben: Verdoppler gewinnt den bisherigen Wert
  assert.deepEqual(B.applyMove(d, { type: 'drop' }).over, { winner: 1, reason: 'Verdopplung abgelehnt', points: 1 });
  // Annehmen: Würfel 2 bei Weiß, Schwarz würfelt (darf nicht erneut verdoppeln)
  let t = B.applyMove(d, { type: 'take' });
  assert.deepEqual(t.cube, { value: 2, owner: 0 });
  assert.equal(B.currentPlayer(t), 1);
  assert.deepEqual(B.legalMoves(t), [{ type: 'roll' }]);
  assert.equal(B.isLegal(t, { type: 'double' }), false);
  t = B.applyChance(B.applyMove(t, { type: 'roll' }), [2, 1]);
  t = B.applyMove(t, B.legalMoves(t)[0]);
  // Weiß besitzt den Würfel → darf auf 4 verdoppeln
  assert.deepEqual(B.legalMoves(t), [{ type: 'roll' }, { type: 'double' }]);
  assert.equal(B.describeMove(t, { type: 'double' }), 'verdoppelt auf 4');
  const t2 = B.applyMove(B.applyMove(t, { type: 'double' }), { type: 'take' });
  assert.deepEqual(t2.cube, { value: 4, owner: 1 });
  // Würfel aus / bei 64: kein Verdoppeln
  const off = B.applyMove(B.applyChance(B.initialState({ cube: false }), [3, 1]), play('8/5 6/5'));
  assert.deepEqual(B.legalMoves(off), [{ type: 'roll' }]);
  const max = B.setup({ w: { 6: 15 }, b: { 19: 15 }, cube: { value: 64, owner: null } });
  assert.deepEqual(B.legalMoves(max), [{ type: 'roll' }]);
  // Würfeln → chance → move
  const r = B.applyMove(off, { type: 'roll' });
  assert.equal(r.phase, 'rolling'); assert.equal(B.currentPlayer(r), null); assert.deepEqual(B.chance(r), { kind: 'dice' });
  assert.equal(B.describeMove(off, { type: 'roll' }), 'würfelt');
});

test('isLegal wirft nie, lehnt Müll und fremde Felder ab', () => {
  const s = B.applyChance(B.initialState(), [6, 5]);
  const junk = [null, undefined, 0, 'play', [], {}, { type: 'play' }, { type: 'play', steps: null },
    { type: 'play', steps: [null] }, { type: 'play', steps: [{ from: 24 }] }, { type: 'play', steps: [{ from: 24, to: 18, x: 1 }] },
    { type: 'play', steps: [{ from: 24, to: 18 }, { from: 18, to: 13 }], extra: 1 },
    { type: 'play', steps: [{ from: '24', to: 18 }, { from: 18, to: 13 }] }, { type: 'play', steps: [{ from: 25, to: 19 }] },
    { type: 'play', steps: [{ from: 13, to: 18 }, { from: 13, to: 19 }] }, { type: 'play', steps: [{ from: 'off', to: 'bar' }] },
    { type: 'play', steps: [{ from: 24, to: 18, die: 7 }, { from: 18, to: 13 }] },
    { type: 'play', steps: [{ from: 24, to: 18, die: 5 }, { from: 18, to: 13 }] },
    { type: 'roll' }, { type: 'double' }, { type: 'take' }, { type: 'roll', x: 1 }, { type: 'play', steps: Array(5).fill({ from: 24, to: 23 }) }];
  for (const m of junk) {
    assert.equal(B.isLegal(s, m), false, JSON.stringify(m));
    assert.throws(() => B.applyMove(s, m), /Illegaler Zug/);
  }
  for (const bad of [null, {}, { points: 3 }, 'x']) assert.equal(B.isLegal(bad, { type: 'roll' }), false);
  assert.equal(B.isLegal(s, { type: 'play', steps: [{ from: 24, to: 18, die: 6 }, { from: 18, to: 13, die: 5 }] }), true);
  return `${junk.length} Müll-Züge`;
});

test('partialSteps / applySteps / isComplete passen zu legalMoves (Zufallsstellungen)', () => {
  let states = 0, finals = 0;
  for (let seed = 1; states < 120; seed++) {
    const s = randomMoveState(seed, seed % 40);
    if (!s) continue;
    states++;
    const legal = B.legalMoves(s);
    const want = new Set(legal.map(m => finalKey(s, m)));
    // Baum der Teilschritte bis zur vollen Länge durchlaufen
    const got = new Set(), max = legal[0].steps.length;
    const walk = (steps) => {
      const next = B.partialSteps(s, steps);
      if (steps.length === max) {
        assert.equal(next.length, 0);
        assert.ok(B.isComplete(s, steps), 'Blatt nicht vollständig');
        got.add(finalKey(s, { steps }));
        return;
      }
      assert.ok(next.length > 0, 'Sackgasse in partialSteps');
      assert.equal(B.isComplete(s, steps), false, 'unvollständig als fertig gemeldet');
      const mid = B.applySteps(s, steps);
      assert.equal(mid.turn, s.turn);
      assert.equal(count(mid, 0), 15); assert.equal(count(mid, 1), 15);
      for (const st of next) walk([...steps, st]);
    };
    walk([]);
    assert.deepEqual([...got].sort(), [...want].sort());
    // jeder legale Zug: jeder Präfix-Schritt wird angeboten
    for (const m of legal) {
      for (let i = 0; i < m.steps.length; i++) {
        const off = B.partialSteps(s, m.steps.slice(0, i));
        assert.ok(off.some(x => x.from === m.steps[i].from && x.to === m.steps[i].to), `Schritt ${i} von ${txt(m)} fehlt`);
      }
      assert.ok(B.isComplete(s, m.steps));
    }
    finals += want.size;
  }
  return `${states} Stellungen, ${finals} Endstellungen`;
});

test('applyMove verändert den Zustand nicht; positionKey unterscheidet Würfel und Phase', () => {
  const s = deepFreeze(B.applyChance(B.initialState(), [4, 2]));
  const n = B.applyMove(s, play('8/4 6/4'));
  assert.equal(n.points[3], 2);
  assert.equal(n.last.type, 'play');
  assert.deepEqual(n.last.dice, [4, 2]);
  const a = B.applyChance(B.initialState(), [4, 2]), b = B.applyChance(B.initialState(), [4, 1]);
  assert.notEqual(B.positionKey(a), B.positionKey(b));
  assert.notEqual(B.positionKey(B.initialState()), B.positionKey(a));
  assert.equal(B.evaluate(n, 0), B.pips(n, 1) - B.pips(n, 0));
  assert.equal(B.evaluate(n, 0), 6);
});

// ---------- Bot ----------

test('Bot: liefert legale Züge in allen Phasen, alle Stufen', () => {
  const rng = mulberry32(5);
  let n = 0;
  for (let seed = 1; seed <= 12; seed++) {
    let s = B.initialState(), guard = 0;
    while (!s.over && guard++ < 60) {
      if (B.chance(s)) { s = B.applyChance(s, [1 + randInt(rng, 6), 1 + randInt(rng, 6)]); continue; }
      const m = chooseMove(s, { level: 1 + (guard % 3), rng, timeMs: 50 });
      assert.ok(B.isLegal(s, m), `Bot-Zug illegal: ${JSON.stringify(m)}`);
      s = B.applyMove(s, m);
      n++;
    }
  }
  return `${n} Bot-Züge`;
});

test('Bot: schlägt und macht Punkte (Stufe 2), verdoppelt/gibt auf im klaren Rennen', () => {
  // Eröffnung 3-1: Stufe 2 macht den 5er-Punkt
  const s = B.applyChance(B.initialState(), [3, 1]);
  assert.equal(txt(chooseMove(s, { level: 2 })), '8/5 6/5');
  assert.equal(txt(chooseMove(s, { level: 3, timeMs: 300 })), '8/5 6/5');
  // Rennen, Weiß 40 Pips vorn → verdoppelt; Schwarz gibt auf
  const race = B.setup({ w: { 6: 5, 5: 5, 4: 5 }, b: { 19: 5, 20: 5, 13: 5 }, cube: { value: 1, owner: null } });
  assert.deepEqual(chooseMove(race, { level: 2 }), { type: 'double' });
  const d = B.applyMove(race, { type: 'double' });
  assert.deepEqual(chooseMove(d, { level: 2 }), { type: 'drop' });
  // knappes Rennen → würfelt nur; bei Verdopplung Annahme
  const close = B.setup({ w: { 6: 5, 5: 5, 4: 5 }, b: { 19: 5, 20: 5, 21: 5 } });
  assert.deepEqual(chooseMove(close, { level: 2 }), { type: 'roll' });
  assert.deepEqual(chooseMove(B.applyMove(close, { type: 'double' }), { level: 2 }), { type: 'take' });
});

test('Bot Stufe 3 hält das Zeitlimit ein', () => {
  const rng = mulberry32(11);
  let worst = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = randomMoveState(seed * 7, 3 + seed);
    if (!s) continue;
    const t = performance.now();
    const m = chooseMove(s, { level: 3, rng, timeMs: 200 });
    worst = Math.max(worst, performance.now() - t);
    assert.ok(B.isLegal(s, m));
  }
  assert.ok(worst < 1500, `Stufe 3 brauchte ${worst.toFixed(0)} ms`);
  return `max ${worst.toFixed(0)} ms bei timeMs 200`;
});

console.log(`\n${passed} ✅, ${failed} ❌ (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(failed ? 1 : 0);

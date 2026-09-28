// Regeltests Mühle: Engine-Regeln an echten Stellungen (setup) und Grundfunktionen des Bots.
// Aufruf: node tests/node/muehle.test.mjs
import assert from 'node:assert/strict';
import * as M from '../../src/games/muehle/engine.js';
import { chooseMove, _moves, _knowsRep } from '../../src/games/muehle/bot.js';
import { mulberry32, pick } from '../../src/rng.js';

const t0 = performance.now();
let passed = 0, failed = 0;
function test(name, fn) {
  try {
    const info = fn();   // optionaler Zusatz für die Ausgabezeile
    passed++;
    console.log(`✅ ${name}${info ? ` (${info})` : ''}`);
  } catch (e) {
    failed++;
    console.log(`❌ ${name}\n   ${String((e && e.stack) || e).split('\n').slice(0, 5).join('\n   ')}`);
  }
}

// Hilfen: Feldname → Index, Zug aus Text ('d7', 'a1-a4', 'a1-a4xd7', 'd7xa1')
const P = name => {
  const i = M.NAMES.indexOf(name);
  if (i < 0) throw new Error(`unbekanntes Feld ${name}`);
  return i;
};
function mv(text) {
  const [main, rem] = text.split('x');
  const [a, b] = main.split('-');
  const m = b ? { from: P(a), to: P(b) } : { to: P(a) };
  if (rem) m.remove = P(rem);
  return m;
}
const names = list => list.map(i => M.NAMES[i]).sort();
const deepFreeze = o => {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};
// Zufallspartie bis Halbzug `plies` (oder Ende)
function randomState(seed, plies) {
  const rng = mulberry32(seed);
  let s = M.initialState();
  while (!s.over && s.ply < plies) s = M.applyMove(s, pick(rng, M.legalMoves(s)));
  return s;
}

// Standardstellungen
const ZUG = () => M.setup({ w: ['a7', 'd7', 'g4', 'd3'], b: ['b6', 'c5', 'e3', 'f2'] });   // Zugphase, Weiß am Zug
const PENDEL = () => M.setup({ w: ['a7', 'c5', 'e3', 'b2'], b: ['g7', 'f6', 'a1', 'd3'] }); // ruhige Zugphase

test('Geometrie: Namen/Koordinaten laut Tabelle, 16 Mühlen, 32 symmetrische Kanten', () => {
  assert.deepEqual([...M.NAMES], 'a7 d7 g7 b6 d6 f6 c5 d5 e5 a4 b4 c4 e4 f4 g4 c3 d3 e3 b2 d2 f2 a1 d1 g1'.split(' '));
  assert.deepEqual(M.POINTS.map(p => [...p]), [
    [0, 0], [3, 0], [6, 0], [1, 1], [3, 1], [5, 1], [2, 2], [3, 2], [4, 2],
    [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3], [2, 4], [3, 4], [4, 4],
    [1, 5], [3, 5], [5, 5], [0, 6], [3, 6], [6, 6]
  ]);
  assert.deepEqual(M.MILLS.map(m => [...m]), [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
    [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23]
  ]);
  for (let i = 0; i < 24; i++) assert.equal(M.MILLS.filter(m => m.includes(i)).length, 2);
  let edges = 0;
  M.ADJ.forEach((nb, i) => {
    for (const j of nb) {
      edges++;
      assert.ok(M.ADJ[j].includes(i), `Kante ${i}-${j} nicht symmetrisch`);
      assert.ok(M.MILLS.some(m => (m[0] === i && m[1] === j) || (m[1] === i && m[2] === j) ||
        (m[0] === j && m[1] === i) || (m[1] === j && m[2] === i)), `Kante ${i}-${j} nicht aus einer Mühle`);
    }
  });
  assert.equal(edges / 2, 32);
  assert.deepEqual(names(M.ADJ[P('d6')]), ['b6', 'd5', 'd7', 'f6']);
  assert.deepEqual(names(M.ADJ[P('a1')]), ['a4', 'd1']);
  assert.ok(Object.isFrozen(M.MILLS) && Object.isFrozen(M.ADJ[0]) && Object.isFrozen(M.POINTS[0]));
});

test('Anfangsstellung: Weiß beginnt, 24 legale Setzzüge, je 9 Steine in der Hand', () => {
  const s = M.initialState({});
  assert.equal(M.id, 'muehle');
  assert.equal(M.title, 'Mühle');
  assert.deepEqual(M.PLAYERS, ['Weiß', 'Schwarz']);
  assert.deepEqual(M.normalizeOptions({ egal: 1 }), {});
  assert.deepEqual(M.normalizeOptions(), {});
  assert.equal(M.currentPlayer(s), 0);
  const ms = M.legalMoves(s);
  assert.equal(ms.length, 24);
  assert.ok(ms.every(m => Object.keys(m).join() === 'to'));
  assert.equal(M.phase(s, 0), 'setzen');
  assert.equal(M.phase(s, 1), 'setzen');
  assert.deepEqual(M.countStones(s), { board: [0, 0], hand: [9, 9], lost: [0, 0] });
  assert.equal(M.result(s), null);
  assert.deepEqual(M.millsAt(s), []);
  assert.equal(M.positionKey(s), '........................:0:9:9');
  const n = M.applyMove(s, mv('d6'));
  assert.equal(M.currentPlayer(n), 1);
  assert.deepEqual(n.last, { to: P('d6') });
  assert.equal(M.legalMoves(n).length, 23);
});

test('Schlagregel: Stein in geschlossener Mühle ist geschützt', () => {
  const s = M.setup({ w: ['a7', 'd7'], b: ['a1', 'd1', 'g1', 'f4'], hand: [5, 5] });
  assert.deepEqual(M.legalMoves(s).filter(m => m.to === P('g7')), [mv('g7xf4')]);
  for (const t of ['g7xa1', 'g7xd1', 'g7xg1', 'g7']) assert.equal(M.isLegal(s, mv(t)), false, t);
  const n = M.applyMove(s, mv('g7xf4'));
  assert.deepEqual(M.countStones(n), { board: [3, 3], hand: [4, 5], lost: [2, 1] });
  assert.deepEqual(names(M.millsAt(n)), ['a1', 'a7', 'd1', 'd7', 'g1', 'g7']);
  assert.equal(Object.keys(n.rep).length, 1);   // Setzen/Schlagen leert den Wiederholungsverlauf
});

test('Schlagregel-Ausnahme: stehen alle gegnerischen Steine in Mühlen, darf aus der Mühle geschlagen werden', () => {
  const s = M.setup({ w: ['a7', 'd7'], b: ['a1', 'd1', 'g1', 'b6', 'd6', 'f6'], hand: [5, 3] });
  const rem = M.legalMoves(s).filter(m => m.to === P('g7')).map(m => m.remove);
  assert.deepEqual(names(rem), ['a1', 'b6', 'd1', 'd6', 'f6', 'g1']);
  assert.ok(M.isLegal(s, mv('g7xd6')));
  // ein freier Stein dazu → nur dieser ist schlagbar
  const t = M.setup({ w: ['a7', 'd7'], b: ['a1', 'd1', 'g1', 'b6', 'd6', 'f6', 'c3'], hand: [5, 2] });
  assert.deepEqual(M.legalMoves(t).filter(m => m.to === P('g7')), [mv('g7xc3')]);
  assert.equal(M.isLegal(t, mv('g7xd6')), false);
});

test('Doppelmühle schlägt nur einen Stein', () => {
  const s = M.setup({ w: ['a7', 'd7', 'g4', 'g1'], b: ['b6', 'c5', 'e3'], hand: [3, 4] });
  const ms = M.legalMoves(s).filter(m => m.to === P('g7'));
  assert.deepEqual(ms.map(M.moveKey).sort(), ['g7xb6', 'g7xc5', 'g7xe3']);
  assert.equal(M.isLegal(s, { to: P('g7'), remove: [P('b6'), P('c5')] }), false);
  const n = M.applyMove(s, mv('g7xc5'));
  assert.deepEqual(names(M.millsAt(n)), ['a7', 'd7', 'g1', 'g4', 'g7']);
  assert.deepEqual(M.countStones(n), { board: [5, 2], hand: [2, 4], lost: [2, 3] });
  assert.equal(n.over, null);
});

test('Setzen mit Mühle ohne gegnerische Steine auf dem Brett: Zug ohne remove', () => {
  const s = M.setup({ w: ['a7', 'd7'], b: [], hand: [7, 9] });
  const ms = M.legalMoves(s);
  assert.ok(ms.some(m => M.moveKey(m) === 'g7'));
  assert.ok(ms.every(m => m.remove === undefined));
  for (let r = 0; r < 24; r++) assert.equal(M.isLegal(s, { to: P('g7'), remove: r }), false);
  const n = M.applyMove(s, mv('g7'));
  assert.equal(n.over, null);
  assert.deepEqual(M.countStones(n), { board: [3, 0], hand: [6, 9], lost: [0, 0] });
  assert.deepEqual(M.millsAt(n), [0, 1, 2]);
});

test('Springen: nur wer genau 3 Steine und keine in der Hand hat (mit 4 nicht)', () => {
  const s = M.setup({ w: ['a7', 'd5', 'f2'], b: ['b6', 'b4', 'c4', 'g1'] });
  assert.equal(M.phase(s, 0), 'springen');
  assert.equal(M.phase(s, 1), 'ziehen');
  assert.equal(M.legalMoves(s).length, 3 * 17);   // jeder Stein auf jeden freien Punkt
  assert.ok(M.isLegal(s, mv('a7-g4')));
  const t = M.setup({ w: ['a7', 'd5', 'f2'], b: ['b6', 'b4', 'c4', 'g1'], turn: 1 });
  assert.equal(M.isLegal(t, mv('b6-g7')), false);
  assert.ok(M.isLegal(t, mv('b6-d6')));
  assert.ok(M.legalMoves(t).every(m => M.ADJ[m.from].includes(m.to)));
  // 3 auf dem Brett, aber noch einer in der Hand → setzen
  const u = M.setup({ w: ['a7', 'd5', 'f2'], b: ['b6', 'b4', 'c4'], hand: [1, 0] });
  assert.equal(M.phase(u, 0), 'setzen');
  assert.equal(M.phase(u, 1), 'springen');
  assert.ok(M.legalMoves(u).every(m => m.from === undefined));
});

test('Springen mit Mühle und Schlagen', () => {
  const s = M.setup({ w: ['a7', 'd7', 'd6', 'f4'], b: ['a1', 'd1', 'e5'], turn: 1 });
  const ms = M.legalMoves(s).filter(m => m.from === P('e5') && m.to === P('g1'));
  assert.deepEqual(ms.map(M.moveKey).sort(), ['e5-g1xa7', 'e5-g1xd6', 'e5-g1xd7', 'e5-g1xf4']);
  assert.equal(M.isLegal(s, mv('e5-g1')), false);
  const n = M.applyMove(s, mv('e5-g1xd6'));
  assert.equal(M.phase(n, 0), 'springen');   // Weiß hat jetzt auch nur noch 3
  assert.equal(n.over, null);
  assert.equal(M.describeMove(s, mv('e5-g1xd6')), 'e5–g1 ×d6');
});

test('Verlust bei weniger als 3 Steinen (Zugphase)', () => {
  const s = ZUG();
  const t = M.setup({ w: ['a7', 'd7', 'g4', 'd3'], b: ['b6', 'c5', 'e3'] });
  assert.equal(s.over, null);
  assert.equal(t.over, null);
  const n = M.applyMove(t, mv('g4-g7xb6'));
  assert.deepEqual(n.over, { winner: 0, reason: 'weniger als 3 Steine' });
  assert.deepEqual(M.result(n), n.over);
  assert.deepEqual(M.legalMoves(n), []);
  assert.equal(M.isLegal(n, mv('c5-d5')), false);
  assert.throws(() => M.applyMove(n, mv('c5-d5')), /Illegaler Zug/);
});

test('Verlust bei weniger als 3 Steinen zählt Brett + Hand (Setzphase)', () => {
  const s = M.setup({ w: ['a7', 'd7'], b: ['b6', 'c5'], hand: [1, 1] });
  assert.equal(s.over, null);   // Schwarz: 2 + 1 = 3
  const n = M.applyMove(s, mv('g7xb6'));
  assert.deepEqual(M.countStones(n), { board: [3, 1], hand: [0, 1], lost: [6, 7] });
  assert.deepEqual(n.over, { winner: 0, reason: 'weniger als 3 Steine' });
  const t = M.setup({ w: ['a7', 'd7'], b: ['b6', 'c5', 'e3'], turn: 1 });
  assert.deepEqual(t.over, { winner: 1, reason: 'weniger als 3 Steine' });
});

test('Zugunfähigkeit verliert (eingesperrte Stellung, auch durch Einsperren per Zug)', () => {
  const s = M.setup({ w: ['a4', 'd6', 'g4', 'd1'], b: ['a7', 'd7', 'g7', 'a1'], turn: 1 });
  assert.deepEqual(s.over, { winner: 0, reason: 'zugunfähig' });
  assert.deepEqual(M.legalMoves(s), []);
  const t = M.setup({ w: ['a4', 'd5', 'g4', 'd1'], b: ['a7', 'd7', 'g7', 'a1'] });
  assert.equal(t.over, null);
  const n = M.applyMove(t, mv('d5-d6'));
  assert.deepEqual(n.over, { winner: 0, reason: 'zugunfähig' });
  // mit 3 Steinen wird gesprungen → nicht eingesperrt
  const u = M.setup({ w: ['a4', 'd6', 'g4', 'd1'], b: ['a7', 'd7', 'g7'], turn: 1 });
  assert.equal(u.over, null);
  assert.equal(M.legalMoves(u).length, 3 * 17);
});

test('Remis durch dreifache Wiederholung (Hin-und-her-Ziehen)', () => {
  let s = PENDEL();
  const key0 = M.positionKey(s);
  for (let round = 0; round < 2; round++) {
    for (const t of ['a7-d7', 'g7-g4', 'd7-a7', 'g4-g7']) {
      assert.equal(s.over, null, `schon vor Halbzug ${s.ply + 1} beendet`);
      s = M.applyMove(s, mv(t));
    }
    assert.equal(s.rep[key0], round + 2);
  }
  assert.equal(s.ply, 8);
  assert.deepEqual(s.over, { winner: null, reason: 'dreifache Wiederholung' });
  assert.equal(Object.keys(s.rep).length, 4);
  assert.deepEqual(M.legalMoves(s), []);
});

test('50-Züge-Regel: Remis nach 100 Halbzügen ohne Mühle, Zähler erst ohne Handsteine', () => {
  // Zähler: 99 → noch offen, 100 → Remis
  const n99 = M.applyMove({ ...PENDEL(), sinceMill: 98 }, mv('a7-d7'));
  assert.equal(n99.sinceMill, 99);
  assert.equal(n99.over, null);
  const n100 = M.applyMove(n99, mv('g7-g4'));
  assert.deepEqual(n100.over, { winner: null, reason: '50 Züge ohne Mühle' });
  // geschlossene Mühle setzt zurück
  const m = M.applyMove({ ...ZUG(), sinceMill: 99 }, mv('g4-g7xb6'));
  assert.equal(m.sinceMill, 0);
  assert.equal(m.over, null);
  // solange jemand Steine in der Hand hat, läuft der Zähler nicht
  const h = M.applyMove(M.setup({ w: ['a7', 'c5', 'e3', 'b2'], b: ['g7', 'f6'], hand: [0, 2] }), mv('a7-d7'));
  assert.equal(h.sinceMill, 0);
  let s = M.initialState();
  const rng = mulberry32(3);
  while (!s.over && s.hand[0] + s.hand[1] > 0) {
    s = M.applyMove(s, pick(rng, M.legalMoves(s)));
    assert.equal(s.sinceMill, 0);
  }
  // echte Folge: 100 ruhige Halbzüge ohne Wiederholungsremis
  s = PENDEL();
  for (let i = 1; i <= 100; i++) {
    const cand = M.legalMoves(s).filter(m => {
      if (m.remove !== undefined) return false;
      const o = M.applyMove(s, m).over;
      return i < 100 ? !o : o && o.reason === '50 Züge ohne Mühle';
    });
    assert.ok(cand.length, `kein ruhiger Zug bei Halbzug ${i}`);
    s = M.applyMove(s, pick(rng, cand));
    assert.equal(s.sinceMill, i);
  }
  assert.deepEqual(s.over, { winner: null, reason: '50 Züge ohne Mühle' });
});

test('isLegal lehnt Müll ab, ohne zu werfen', () => {
  const s = ZUG();
  const junk = [null, undefined, 0, 1, 'g4-g7', '', true, NaN, [], [14, 2], {}, () => 1, Object.create(null),
    { to: NaN }, { to: 1.5 }, { to: -1 }, { to: 24 }, { to: '13' }, { to: Infinity }, { to: null },
    { from: 14 }, { from: '14', to: 13 }, { from: 14.5, to: 13 }, { from: null, to: 13 }, { from: -1, to: 13 },
    { from: 14, to: 13, remove: null }, { from: 14, to: 13, extra: 1 }, { from: 14, to: 13, player: 0 },
    { from: 14, to: 2, remove: '3' }, { from: 14, to: 2, remove: 3.5 }, { from: 14, to: 2, remove: [3] },
    { from: 14, to: 2, remove: -1 }, { from: 14, to: 2, remove: 24 }, { from: 14, to: 2, remove: NaN },
    { from: [14], to: 13 }, { from: { valueOf: () => 14 }, to: 13 }, { from: 14n, to: 13 }];
  for (const m of junk) {
    assert.equal(M.isLegal(s, m), false, M.moveKey(m));
    assert.throws(() => M.applyMove(s, m), /Illegaler Zug/);
  }
  for (const st of [null, undefined, {}, 'x', { board: [] }, { ...s, turn: 2 }, { ...s, board: s.board.slice(1) }]) {
    assert.equal(M.isLegal(st, { to: 0 }), false);
  }
  assert.ok(M.isLegal(s, mv('g4-f4')));
  assert.ok(M.isLegal(s, { from: 14, to: 13, remove: undefined }));   // undefined zählt als fehlend
  assert.ok(M.isLegal(JSON.parse(JSON.stringify(s)), JSON.parse('{"to":2,"from":14,"remove":3}')));
});

test('isLegal lehnt fremde Steine, falschen Spieler, besetzte Felder, Nicht-Nachbarn und falsches remove ab', () => {
  const s = ZUG();
  const sb = M.setup({ w: ['a7', 'd7', 'g4', 'd3'], b: ['b6', 'c5', 'e3', 'f2'], turn: 1 });
  assert.equal(M.isLegal(s, mv('b6-d6')), false, 'fremder Stein');
  assert.ok(M.isLegal(sb, mv('b6-d6')));
  assert.equal(M.isLegal(sb, mv('g4-f4')), false, 'falscher Spieler');
  assert.equal(M.isLegal(s, mv('a7-d7')), false, 'besetzt (eigener Stein)');
  assert.equal(M.isLegal(s, mv('d3-e3')), false, 'besetzt (fremder Stein)');
  assert.equal(M.isLegal(s, mv('a7-g7')), false, 'kein Nachbar');
  assert.equal(M.isLegal(s, mv('d3-d1')), false, 'kein Nachbar');
  assert.equal(M.isLegal(s, mv('g4-g7')), false, 'remove fehlt');
  assert.ok(M.isLegal(s, mv('g4-g7xb6')));
  assert.equal(M.isLegal(s, mv('g4-g7xa7')), false, 'eigenen Stein schlagen');
  assert.equal(M.isLegal(s, mv('g4-g7xa4')), false, 'leeres Feld schlagen');
  assert.equal(M.isLegal(s, mv('g4-f4xb6')), false, 'überflüssiges remove');
  assert.equal(M.isLegal(s, mv('g1')), false, 'Setzen in der Zugphase');
  const p = M.setup({ w: ['a7'], b: ['g1'], hand: [5, 5] });
  assert.equal(M.isLegal(p, mv('a7-d7')), false, 'Ziehen in der Setzphase');
  assert.equal(M.isLegal(p, mv('g1')), false, 'Setzen auf besetztes Feld');
  assert.ok(M.isLegal(p, mv('d7')));
});

test('applyMove wirft bei illegalem Zug und verändert den Eingabezustand nicht', () => {
  const states = [M.initialState(), ZUG(), PENDEL(), randomState(11, 12), randomState(12, 40),
    M.setup({ w: ['a7', 'd7', 'd6', 'f4'], b: ['a1', 'd1', 'e5'], turn: 1 })];
  for (const s of states) {
    const before = structuredClone(s);
    for (const m of M.legalMoves(s)) {
      const n = M.applyMove(s, m);
      assert.notEqual(n, s);
      assert.notEqual(n.board, s.board);
      assert.notEqual(n.rep, s.rep);
    }
    for (const m of [null, { to: 99 }, { from: 0, to: 0 }, mv('g7-a1xd7')]) {
      assert.throws(() => M.applyMove(s, m), /Illegaler Zug/);
    }
    assert.deepStrictEqual(s, before);
  }
  const f = deepFreeze(ZUG());   // eingefroren: jede Schreibabsicht würde werfen
  for (const m of M.legalMoves(f)) M.applyMove(f, m);
});

test('JSON-Rundreise: Zustand bleibt gleich und spielt identisch weiter', () => {
  for (const seed of [1, 2, 3]) {
    const rng = mulberry32(seed);
    let s = M.initialState();
    while (!s.over) {
      const j = JSON.parse(JSON.stringify(s));
      assert.deepStrictEqual(j, s);
      assert.equal(M.positionKey(j), M.positionKey(s));
      assert.deepEqual(M.legalMoves(j), M.legalMoves(s));
      const m = pick(rng, M.legalMoves(s));
      const a = M.applyMove(s, m), b = M.applyMove(j, JSON.parse(JSON.stringify(m)));
      assert.deepStrictEqual(a, b);
      s = a;
    }
    assert.deepStrictEqual(JSON.parse(JSON.stringify(s)), s);
  }
});

test('describeMove: Setzen, Ziehen/Springen, mit Schlagen', () => {
  assert.equal(M.describeMove(M.initialState(), mv('d7')), 'd7');
  const a = M.setup({ w: ['a1', 'c5', 'e3', 'b2'], b: ['d7', 'e5', 'f6', 'g7'] });
  assert.ok(M.isLegal(a, mv('a1-a4')));
  assert.equal(M.describeMove(a, mv('a1-a4')), 'a1–a4');
  const b = M.setup({ w: ['a1', 'b4', 'c4', 'g1'], b: ['d7', 'e5', 'f6', 'g7'] });
  assert.ok(M.isLegal(b, mv('a1-a4xd7')));
  assert.equal(M.describeMove(b, mv('a1-a4xd7')), 'a1–a4 ×d7');
  const c = M.setup({ w: ['a7', 'g7'], b: ['a1', 'b2', 'c3'], hand: [3, 3] });
  assert.ok(M.isLegal(c, mv('d7xa1')));
  assert.equal(M.describeMove(c, mv('d7xa1')), 'd7 ×a1');
  assert.equal(M.describeMove(c, null), '?');
});

test('moveKey: gleiche Züge ⇔ gleicher Schlüssel; isLegal ⇔ Schlüssel unter den legalen', () => {
  assert.equal(M.moveKey({ to: 1 }), 'd7');
  assert.equal(M.moveKey({ from: 21, to: 9, remove: 1 }), 'a1-a4xd7');
  assert.equal(M.moveKey({ remove: 1, to: 9, from: 21 }), M.moveKey({ from: 21, to: 9, remove: 1 }));
  assert.equal(M.moveKey({ to: 1, remove: undefined }), 'd7');
  assert.notEqual(M.moveKey({ to: '1' }), M.moveKey({ to: 1 }));
  assert.notEqual(M.moveKey({ to: 1, extra: 1 }), M.moveKey({ to: 1 }));
  assert.notEqual(M.moveKey({ from: null, to: 1 }), M.moveKey({ to: 1 }));
  const rng = mulberry32(99);
  const vals = [undefined, undefined, null, -1, 24, 1.5, '3', ...Array.from({ length: 24 }, (_, i) => i)];
  for (let g = 0; g < 30; g++) {
    const s = randomState(500 + g, 5 + 3 * g);
    const legal = M.legalMoves(s), set = new Set(legal.map(M.moveKey));
    assert.equal(set.size, legal.length, 'Schlüssel nicht eindeutig');
    for (let k = 0; k < 200; k++) {
      const m = {};
      for (const f of ['from', 'to', 'remove']) {
        const v = pick(rng, vals);
        if (v !== undefined || rng() < 0.2) m[f] = v;
      }
      assert.equal(M.isLegal(s, m), set.has(M.moveKey(m)), M.moveKey(m));
    }
  }
});

test('positionKey, millsAt, countStones, phase', () => {
  const a = M.setup({ w: ['a7'], b: ['g1'], hand: [5, 5] });
  const b = M.setup({ w: ['a7'], b: ['g1'], hand: [5, 5], turn: 1 });
  const c = M.setup({ w: ['a7'], b: ['g1'], hand: [4, 5] });
  assert.equal(new Set([a, b, c].map(M.positionKey)).size, 3);
  assert.equal(M.positionKey(a), 'w' + '.'.repeat(22) + 'b:0:5:5');
  assert.equal(M.positionKey(structuredClone(a)), M.positionKey(a));
  const s = M.setup({ w: ['a7', 'd7', 'g7', 'a4'], b: ['c3', 'd3', 'e3', 'g4'] });
  assert.deepEqual(names(M.millsAt(s)), ['a7', 'c3', 'd3', 'd7', 'e3', 'g7']);
  assert.deepEqual(M.countStones(s), { board: [4, 4], hand: [0, 0], lost: [5, 5] });
  assert.equal(M.phase(s, 0), 'ziehen');
  assert.equal(M.phase(s), 'ziehen');
});

test('setup prüft Eingaben', () => {
  assert.throws(() => M.setup({ w: ['z9'] }));
  assert.throws(() => M.setup({ w: ['a7', 'a7'] }));
  assert.throws(() => M.setup({ w: ['a7'], b: ['a7'] }));
  assert.throws(() => M.setup({ w: [24] }));
  assert.throws(() => M.setup({ w: ['a7'], hand: [9, 0] }));   // 10 Steine
  assert.throws(() => M.setup({ turn: 2 }));
  assert.throws(() => M.setup({ hand: [-1, 0] }));
  const s = M.setup({ w: [0, 'D7'], b: ['g1'], hand: [2, 3], turn: 1 });
  assert.deepEqual(M.countStones(s), { board: [2, 1], hand: [2, 3], lost: [5, 5] });
  assert.equal(s.ply, 0);
  assert.equal(s.sinceMill, 0);
  assert.deepEqual(s.rep, { [M.positionKey(s)]: 1 });
});

test('Bot: legale Züge auf allen Stufen, null bei Partieende', () => {
  const states = [M.initialState(), ZUG(), PENDEL(), randomState(7, 10), randomState(8, 30),
    M.setup({ w: ['a7', 'd5', 'f2'], b: ['b6', 'b4', 'c4', 'g1'] }),
    M.setup({ w: ['a7', 'd7', 'd6', 'f4'], b: ['a1', 'd1', 'e5'], turn: 1 })];
  for (const s of states) {
    for (const level of [1, 2, 3]) {
      const m = chooseMove(s, { level, rng: mulberry32(level), timeMs: 30 });
      assert.ok(M.isLegal(s, m), `Stufe ${level}: ${M.moveKey(m)}`);
    }
    assert.ok(M.isLegal(s, chooseMove(s)));   // Standardwerte
  }
  const over = M.setup({ w: ['a4', 'd6', 'g4', 'd1'], b: ['a7', 'd7', 'g7', 'a1'], turn: 1 });
  assert.equal(chooseMove(over, { level: 3, timeMs: 20 }), null);
});

test('Bot: Stufe 1 und 2 bei gleichem rng deterministisch', () => {
  for (const seed of [21, 22, 23, 24, 25]) {
    const s = randomState(seed, 6 + seed % 30);
    for (const level of [1, 2]) {
      const a = chooseMove(s, { level, rng: mulberry32(seed) });
      chooseMove(randomState(seed + 100, 25), { level: 3, timeMs: 10 });   // Zwischenaufruf darf nichts ändern
      const b = chooseMove(s, { level, rng: mulberry32(seed) });
      assert.deepEqual(a, b, `Stufe ${level}, Seed ${seed}`);
    }
  }
});

test('Bot: nimmt eine sofortige Mühle mit (Stufe 1 immer, Stufe 2/3 wenn sie entscheidet)', () => {
  const s = M.setup({ w: ['a7', 'd7'], b: ['a1', 'd1', 'g1', 'f4'], hand: [5, 5] });
  for (let seed = 1; seed <= 20; seed++) {
    assert.equal(M.moveKey(chooseMove(s, { level: 1, rng: mulberry32(seed) })), 'g7xf4');
  }
  // Stufe 2 darf hier auch erst eine Doppeldrohung bauen (d5) – Stufe 3 schlägt sofort
  assert.equal(M.moveKey(chooseMove(s, { level: 3, rng: mulberry32(1), timeMs: 50 })), 'g7xf4');
  const t = M.setup({ w: ['a7', 'd7', 'g4', 'd3'], b: ['b6', 'c5', 'e3'] });
  for (const level of [2, 3]) {
    for (let seed = 1; seed <= 3; seed++) {
      const m = chooseMove(t, { level, rng: mulberry32(seed), timeMs: 50 });
      assert.deepEqual(M.applyMove(t, m).over, { winner: 0, reason: 'weniger als 3 Steine' }, M.moveKey(m));
    }
  }
});

test('Bot: verhindert eine gegnerische Mühle (Stufe 2/3 immer, Stufe 1 manchmal)', () => {
  const s = M.setup({ w: ['c5'], b: ['a1', 'd1'], hand: [8, 7] });
  for (let seed = 1; seed <= 5; seed++) {
    assert.equal(M.moveKey(chooseMove(s, { level: 2, rng: mulberry32(seed) })), 'g1');
    assert.equal(M.moveKey(chooseMove(s, { level: 3, rng: mulberry32(seed), timeMs: 40 })), 'g1');
  }
  let blocks = 0;
  for (let seed = 1; seed <= 40; seed++) {
    if (M.moveKey(chooseMove(s, { level: 1, rng: mulberry32(seed) })) === 'g1') blocks++;
  }
  assert.ok(blocks > 5 && blocks < 40, `Stufe 1 blockt ${blocks}/40`);
});

test('Bot: findet den Sieg durch Einsperren', () => {
  const t = M.setup({ w: ['a4', 'd5', 'g4', 'd1'], b: ['a7', 'd7', 'g7', 'a1'] });
  assert.equal(M.moveKey(chooseMove(t, { level: 2, rng: mulberry32(1) })), 'd5-d6');
  assert.equal(M.moveKey(chooseMove(t, { level: 3, rng: mulberry32(1), timeMs: 50 })), 'd5-d6');
});

test('Bot: Stufe 3 antwortet innerhalb von timeMs + 50 ms', () => {
  const states = [M.initialState(), randomState(31, 9), randomState(32, 18), randomState(33, 26), PENDEL(),
    M.setup({ w: ['a7', 'd5', 'f2'], b: ['b6', 'b4', 'c4', 'g1', 'e4'] })];
  let worst = 0;
  for (const s of states) {
    for (const timeMs of [100, 250]) {
      const t = performance.now();
      const m = chooseMove(s, { level: 3, timeMs });
      const dt = performance.now() - t;
      worst = Math.max(worst, dt - timeMs);
      assert.ok(M.isLegal(s, m));
      assert.ok(dt <= timeMs + 50, `${dt.toFixed(1)} ms bei timeMs ${timeMs}`);
    }
  }
  return `größte Überschreitung ${worst.toFixed(1)} ms`;
});

test('Bot: interne Zugerzeugung entspricht legalMoves, Verlauf rep wird erkannt', () => {
  let n = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const rng = mulberry32(seed);
    let s = M.initialState();
    while (!s.over) {
      assert.deepEqual(_moves(s).map(M.moveKey).sort(), M.legalMoves(s).map(M.moveKey).sort(), M.positionKey(s));
      assert.ok(_knowsRep(JSON.parse(JSON.stringify(s))), `rep-Schlüssel nicht erkannt: ${M.positionKey(s)}`);
      n++;
      s = M.applyMove(s, pick(rng, M.legalMoves(s)));
    }
  }
  assert.ok(n > 1000);
  return `${n} Stellungen`;
});

const secs = ((performance.now() - t0) / 1000).toFixed(2);
console.log(`\nMühle-Regeltests: ${passed} bestanden, ${failed} fehlgeschlagen – Laufzeit ${secs} s`);
process.exitCode = failed ? 1 : 0;

// Regeltests Vier in einer Reihe: Einwerfen, Gewinnlinien, Remis, Müll-Züge, Ansicht-Hilfen, evaluate, Bot-Stufen.
// Quelle der Regeln: https://de.wikipedia.org/wiki/Vier_gewinnt
// Aufruf: node tests/node/vier.test.mjs
import assert from 'node:assert/strict';
import * as V from '../../src/games/vier/engine.js';
import { RULES } from '../../src/games/vier/rules.js';
import { chooseMove, lastInfo } from '../../src/games/vier/bot.js';
import { mulberry32, pick } from '../../src/rng.js';

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
// Spalten 1-basiert wie auf dem Brett: play(s, 4, 4, 3) = Spalte 4, 4, 3
const play = (s, ...cols) => cols.reduce((t, c) => V.applyMove(t, { col: c - 1 }), s);
const start = () => V.initialState(V.normalizeOptions({}));

// Partie Bot gegen Bot; liefert Sieger (0, 1, null)
function match(red, yellow, seed) {
  const rng = mulberry32(seed);
  let s = start();
  while (!V.result(s)) {
    const cfg = s.turn === 0 ? red : yellow;
    s = V.applyMove(s, chooseMove(s, { ...cfg, rng }));
  }
  return V.result(s).winner;
}

// ---------- Grundlagen ----------

test('Exporte, Startstellung leer, Rot beginnt', () => {
  assert.equal(V.id, 'vier');
  assert.equal(V.title, 'Vier in einer Reihe');
  assert.deepEqual(V.PLAYERS, ['Rot', 'Gelb']);
  for (const f of ['normalizeOptions', 'initialState', 'currentPlayer', 'legalMoves', 'isLegal', 'applyMove',
    'result', 'describeMove', 'positionKey', 'evaluate', 'dropRow', 'winLine']) assert.equal(typeof V[f], 'function', f);
  const s = start();
  assert.deepEqual(s, { cols: [[], [], [], [], [], [], []], turn: 0, ply: 0, win: null, over: null });
  assert.equal(V.currentPlayer(s), 0);
  assert.equal(V.result(s), null);
});

test('Keine Optionen: normalizeOptions liefert immer {} (auch start wird verworfen)', () => {
  assert.deepEqual(V.normalizeOptions(), {});
  assert.deepEqual(V.normalizeOptions({ start: 1 }), {});
  assert.deepEqual(V.normalizeOptions('Müll'), {});
  assert.equal(V.initialState({ start: 1 }).turn, 0);
});

test('Start: 7 Züge, Spalte 1…7', () => {
  assert.deepEqual(V.legalMoves(start()), [0, 1, 2, 3, 4, 5, 6].map(col => ({ col })));
});

test('Stein fällt auf den untersten freien Platz, Zustand bleibt unverändert', () => {
  const s = deepFreeze(start());
  assert.equal(V.dropRow(s, 3), 0);
  const a = V.applyMove(s, { col: 3 });
  assert.deepEqual(a.cols[3], [0]);
  assert.equal(a.turn, 1);
  assert.equal(a.ply, 1);
  assert.equal(V.dropRow(a, 3), 1);
  const b = deepFreeze(V.applyMove(a, { col: 3 }));
  assert.deepEqual(b.cols[3], [0, 1]);
  assert.equal(V.dropRow(b, 3), 2);
  assert.deepEqual(s.cols[3], []);
});

test('Abwechselnd: Rot, Gelb, Rot …', () => {
  let s = start();
  for (let i = 0; i < 10; i++) {
    assert.equal(V.currentPlayer(s), i % 2);
    s = V.applyMove(s, { col: i % 7 });
  }
});

test('Volle Spalte: nicht mehr spielbar, dropRow −1', () => {
  const s = play(start(), 1, 1, 1, 1, 1, 1);
  assert.equal(s.cols[0].length, 6);
  assert.equal(V.dropRow(s, 0), -1);
  assert.equal(V.isLegal(s, { col: 0 }), false);
  assert.throws(() => V.applyMove(s, { col: 0 }));
  assert.deepEqual(V.legalMoves(s).map(m => m.col), [1, 2, 3, 4, 5, 6]);
  assert.equal(V.dropRow(s, 9), -1);
  assert.equal(V.dropRow(null, 0), -1);
});

// ---------- Gewinn ----------

test('Waagerecht gewinnt (Reihe 1)', () => {
  const s = play(start(), 1, 1, 2, 2, 3, 3, 4);
  assert.deepEqual(V.result(s), { winner: 0, reason: 'vier in einer Reihe' });
  assert.deepEqual(s.win, { seat: 0, line: [[0, 0], [1, 0], [2, 0], [3, 0]] });
  assert.deepEqual(V.winLine(s), [[0, 0], [1, 0], [2, 0], [3, 0]]);
  assert.equal(V.currentPlayer(s), null);
  assert.deepEqual(V.legalMoves(s), []);
});

test('Senkrecht gewinnt (Gelb)', () => {
  const s = play(start(), 1, 7, 2, 7, 1, 7, 2, 7);
  assert.equal(V.result(s).winner, 1);
  assert.deepEqual(V.winLine(s), [[6, 0], [6, 1], [6, 2], [6, 3]]);
});

test('Diagonal ↗ gewinnt', () => {
  // Rot: a1 b2 c3 d4
  const s = V.setup(['R', 'GR', 'RGR', 'RGG', '', '', 'G']);
  assert.equal(s.turn, 0);
  assert.equal(V.result(s), null);
  const t = V.applyMove(s, { col: 3 });
  assert.equal(V.result(t).winner, 0);
  assert.deepEqual(V.winLine(t), [[0, 0], [1, 1], [2, 2], [3, 3]]);
});

test('Diagonal ↘ gewinnt', () => {
  // Gelb: d4 f2 g1, fehlt e3
  const s = V.setup(['', '', '', 'RGRG', 'RR', 'RG', 'G']);
  assert.equal(s.turn, 1);
  assert.equal(V.result(s), null);
  const t = V.applyMove(s, { col: 4 });
  assert.equal(V.result(t).winner, 1);
  assert.deepEqual(V.winLine(t), [[3, 3], [4, 2], [5, 1], [6, 0]]);
});

test('Vier oder mehr: Lücke schließen ergibt fünf in einer Reihe', () => {
  const s = V.setup(['RG', 'RG', '', 'RG', 'R', 'G', '']);
  assert.equal(s.turn, 0);
  const t = play(s, 3);              // Rot schließt die Lücke in Spalte 3
  assert.equal(V.result(t).winner, 0);
  assert.deepEqual(V.winLine(t), [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
});

test('Zwei Linien zugleich: alle Gewinnsteine markiert', () => {
  // waagerecht Reihe 1 (Spalten 1–4) und diagonal d1–g4 zugleich
  const s = V.setup(['R', 'R', 'R', '', 'GR', 'GGR', 'GGGR']);
  assert.equal(s.turn, 0);
  assert.equal(V.result(s), null);
  const t = play(s, 4);
  assert.equal(V.result(t).winner, 0);
  assert.equal(V.winLine(t).length, 7);
});

test('Drei in einer Reihe und Vier mit Lücke gewinnen nicht', () => {
  assert.equal(V.result(V.setup(['RG', 'RG', 'R', '', 'G', '', ''])), null);
  assert.equal(V.result(V.setup(['RG', 'RG', '', 'RG', 'R', 'G', ''])), null);
  assert.equal(V.winLine(start()), null);
});

test('Volles Brett ohne Viererlinie: unentschieden', () => {
  const full = ['000111', '111000', '000111', '111000', '000111', '111000', '000111'].map(t => [...t].map(Number));
  full[0].pop();                     // oberster Stein Spalte 1 (Gelb) fehlt noch
  const s = V.setup(full);
  assert.equal(s.turn, 1);
  assert.equal(V.result(s), null);
  assert.deepEqual(V.legalMoves(s), [{ col: 0 }]);
  const t = V.applyMove(s, { col: 0 });
  assert.deepEqual(V.result(t), { winner: null, reason: 'Brett voll – unentschieden' });
  assert.equal(t.win, null);
  assert.equal(t.ply, 42);
  assert.equal(V.evaluate(t, 0), 0);
});

test('Nach Spielende: keine Züge, isLegal false, applyMove wirft', () => {
  const s = play(start(), 1, 1, 2, 2, 3, 3, 4);
  assert.equal(V.isLegal(s, { col: 5 }), false);
  assert.throws(() => V.applyMove(s, { col: 5 }), /Illegaler Zug/);
});

test('isLegal lehnt Müll ab und wirft nie', () => {
  const s = start();
  const junk = [null, undefined, 3, '3', [], [3], {}, { col: 7 }, { col: -1 }, { col: '3' }, { col: 3.5 }, { col: NaN },
    { col: 3, x: 1 }, { col: 3, type: 'drop' }, { type: 'drop' }, Object.create(null)];
  for (const m of junk) assert.equal(V.isLegal(s, m), false, JSON.stringify(m));
  for (const bad of [null, {}, { cols: [] }, { cols: [[], [], [], [], [], [], [2]], turn: 0 }, { ...s, turn: 2 }]) {
    assert.equal(V.isLegal(bad, { col: 0 }), false);
  }
  assert.equal(V.isLegal(s, { col: 6 }), true);
  assert.throws(() => V.applyMove(s, { col: 3, extra: true }));
});

test('describeMove, positionKey, JSON-Rundreise', () => {
  const s = start();
  assert.equal(V.describeMove(s, { col: 3 }), 'Rot: Spalte 4');
  const a = play(s, 4);
  assert.equal(V.describeMove(a, { col: 0 }), 'Gelb: Spalte 1');
  assert.equal(V.describeMove(a, { col: 'x' }), '?');
  assert.equal(V.positionKey(s), '//////:0');
  assert.equal(V.positionKey(play(s, 4, 4, 1)), '0///01///:1');
  assert.notEqual(V.positionKey(play(s, 1, 2)), V.positionKey(play(s, 2, 1)));
  const b = play(s, 4, 4, 3, 5, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(b)), b);
  assert.equal(V.positionKey(JSON.parse(JSON.stringify(b))), V.positionKey(b));
});

test('setup: Steinzahl wird geprüft, Gelb am Zug bei einem Stein mehr für Rot', () => {
  assert.throws(() => V.setup(['GG', '', '', '', '', '', '']));
  assert.throws(() => V.setup(['RRR', '', '', '', '', '', '']));
  assert.throws(() => V.setup(['RRRRRRR', '', '', '', '', '', '']));
  assert.equal(V.setup(['R', '', '', '', '', '', '']).turn, 1);
});

test('rules.js: Titel, Quelle mit URL, Regelsätze', () => {
  assert.equal(RULES.title, 'Vier in einer Reihe');
  assert.match(RULES.source, /https:\/\/de\.wikipedia\.org\/wiki\/Vier_gewinnt/);
  assert.ok(RULES.items.length >= 5);
  assert.ok(!/vier gewinnt/i.test(RULES.title));
});

// ---------- evaluate ----------

test('evaluate: Start 0, Vorzeichen, Gewinn ±99, Remis 0', () => {
  const s = start();
  assert.equal(V.evaluate(s, 0), 0);
  assert.equal(V.evaluate(s, 1), 0);
  // Rot mit offenem Zweier in der Mitte, Gelb am Rand
  const a = V.setup(['G', '', 'R', 'R', '', '', 'G']);
  assert.ok(V.evaluate(a, 0) > 0, `a=${V.evaluate(a, 0)}`);
  const won = play(start(), 1, 1, 2, 2, 3, 3, 4);
  assert.equal(V.evaluate(won, 0), 99);
  assert.equal(V.evaluate(won, 1), -99);
  // Rot am Zug mit sofortigem Gewinn
  const thr = V.setup(['RG', 'RG', 'RG', '', '', '', '']);
  assert.equal(V.evaluate(thr, 0), 99);
  // Gelb am Zug, Rot hat zwei Gewinnfelder (offener Dreier) → Gelb verliert
  const dbl = V.setup(['G', '', 'R', 'R', 'R', '', 'G']);
  assert.equal(dbl.turn, 1);
  assert.equal(V.evaluate(dbl, 1), -99);
});

test('evaluate: Symmetrie (Summe 0), Spiegelung, Bereich, ≤ 150 ms', () => {
  const rng = mulberry32(11);
  let maxMs = 0, n = 0, maxAbs = 0;
  for (let g = 0; g < 60; g++) {
    let s = start();
    while (!V.result(s)) {
      const t = performance.now();
      const e0 = V.evaluate(s, 0), e1 = V.evaluate(s, 1);
      maxMs = Math.max(maxMs, (performance.now() - t) / 2);
      assert.ok(Number.isFinite(e0) && Math.abs(e0) <= 99);
      assert.ok(Object.is(e0 + e1, 0), `${e0} ${e1}`);
      if (Math.abs(e0) < 99) maxAbs = Math.max(maxAbs, Math.abs(e0));
      const mirror = { ...s, cols: s.cols.slice().reverse() };
      assert.equal(V.evaluate(mirror, 0), e0, 'Spiegelung');
      n++;
      s = V.applyMove(s, pick(rng, V.legalMoves(s)));
    }
  }
  assert.ok(maxMs <= 150, `${maxMs.toFixed(1)} ms`);
  assert.ok(maxAbs <= 30.0001, `max ${maxAbs}`);
  return `${n} Stellungen, max ${maxMs.toFixed(1)} ms, |Heuristik| ≤ ${maxAbs}`;
});

// ---------- Bot ----------

test('Bot: liefert legale Züge auf allen Stufen, einziger Zug sofort', () => {
  const rng = mulberry32(5);
  let s = play(start(), 4, 4, 3);
  for (const level of [1, 2, 3]) assert.ok(V.isLegal(s, chooseMove(s, { level, rng, timeMs: 50 })));
  const full = ['000111', '111000', '000111', '111000', '000111', '111000', '000111'].map(t => [...t].map(Number));
  full[0].pop();
  assert.deepEqual(chooseMove(V.setup(full), { level: 3, rng }), { col: 0 });
  assert.equal(chooseMove(play(start(), 1, 1, 2, 2, 3, 3, 4), { level: 3 }), null);
});

test('Stufe 1: gewinnt sofort immer, blockt meist, verpasst gelegentlich', () => {
  const win = V.setup(['RG', 'RG', 'RG', '', '', '', '']);
  const blk = V.setup(['RRR', '', '', '', '', '', 'GG']);
  let blocked = 0;
  for (let i = 0; i < 200; i++) {
    assert.deepEqual(chooseMove(win, { level: 1, rng: mulberry32(i) }), { col: 3 });
    if (chooseMove(blk, { level: 1, rng: mulberry32(1000 + i) }).col === 0) blocked++;
  }
  assert.ok(blocked >= 160 && blocked < 200, `geblockt ${blocked}/200`);
  return `geblockt ${blocked}/200`;
});

test('Stufe 3: Taktik-Aufgaben (Gewinn, Block, Doppeldrohung bauen und verhindern)', () => {
  const rng = mulberry32(9);
  const cases = [
    [V.setup(['RG', 'RG', 'RG', '', '', '', '']), [3], 'sofortiger Gewinn'],
    [V.setup(['RRR', '', '', '', '', '', 'GG']), [0], 'Block senkrecht'],
    [V.setup(['', '', 'R', 'R', '', '', 'GG']), [1, 4], 'Doppeldrohung bauen'],
    [V.setup(['', '', 'R', 'R', '', '', 'G']), [1, 4], 'Doppeldrohung verhindern']
  ];
  for (const [s, ok, name] of cases) {
    const m = chooseMove(s, { level: 3, rng, timeMs: 300 });
    assert.ok(ok.includes(m.col), `${name}: Spalte ${m.col + 1}`);
  }
  // Doppeldrohung bauen: danach gewinnt Rot gegen beste Verteidigung
  let s = cases[2][0];
  while (!V.result(s)) s = V.applyMove(s, chooseMove(s, { level: 3, rng, timeMs: 200 }));
  assert.equal(V.result(s).winner, 0);
  assert.equal(s.ply, 7, `ply ${s.ply}`);
});

test('Stufe 3: Tiefe ≥ 12 in der Mitte (1,2 s), Zeitgrenze eingehalten', () => {
  const s = play(start(), 4, 4, 3, 5, 4, 3);
  const t = performance.now();
  chooseMove(s, { level: 3, rng: mulberry32(2), timeMs: 1200 });
  const ms = performance.now() - t;
  assert.ok(lastInfo.depth >= 12, `Tiefe ${lastInfo.depth}`);
  assert.ok(ms < 1400, `${ms.toFixed(0)} ms`);
  const t2 = performance.now();
  chooseMove(s, { level: 3, rng: mulberry32(3), timeMs: 99999 });
  assert.ok(performance.now() - t2 < 1400, 'timeMs wird auf 1,2 s begrenzt');
  return `Tiefe ${lastInfo.depth}, ${lastInfo.nodes} Knoten, ${ms.toFixed(0)} ms`;
});

test('Stufe 2 schlägt Stufe 1 klar (20 Partien, Farben wechseln)', () => {
  let w = 0, d = 0, l = 0;
  for (let i = 0; i < 20; i++) {
    const two = i % 2;
    const r = match(two === 0 ? { level: 2 } : { level: 1 }, two === 0 ? { level: 1 } : { level: 2 }, 100 + i);
    if (r === two) w++; else if (r === null) d++; else l++;
  }
  assert.ok(w >= 16 && l <= 2, `${w}:${d}:${l}`);
  return `Stufe 2 gewinnt ${w}, remis ${d}, verliert ${l}`;
});

test('Stufe 3 schlägt Stufe 1 fast immer (8 Partien, Farben wechseln)', () => {
  let w = 0, d = 0, l = 0;
  for (let i = 0; i < 8; i++) {
    const three = i % 2;
    const r = match(three === 0 ? { level: 3, timeMs: 100 } : { level: 1 }, three === 0 ? { level: 1 } : { level: 3, timeMs: 100 }, 200 + i);
    if (r === three) w++; else if (r === null) d++; else l++;
  }
  assert.ok(w >= 7 && l === 0, `${w}:${d}:${l}`);
  return `Stufe 3 gewinnt ${w}, remis ${d}, verliert ${l}`;
});

test('Stufe 3 als Rot verliert nicht gegen Stufe 2 (4 Seeds)', () => {
  let w = 0, d = 0, l = 0;
  for (let i = 0; i < 4; i++) {
    const r = match({ level: 3, timeMs: 1200 }, { level: 2 }, 300 + i);
    if (r === 0) w++; else if (r === null) d++; else l++;
  }
  assert.equal(l, 0, `${w}:${d}:${l}`);
  return `Rot (Stufe 3) gewinnt ${w}, remis ${d}, verliert ${l}`;
});

console.log(`\n${passed} grün, ${failed} rot (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(failed ? 1 : 0);

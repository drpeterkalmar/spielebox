// Regeltests Stern-Halma: Geometrie, Sprungketten, Sieg/Blockade/Zuglimit/Aussetzen, evaluate und Bot.
// Aufruf: node tests/node/halma.test.mjs
import assert from 'node:assert/strict';
import * as E from '../../src/games/halma/engine.js';
import { chooseMove } from '../../src/games/halma/bot.js';
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

// Loch aus axialen Koordinaten (q, r); x = q + r/2, y = r·√3/2
const H = (q, r) => {
  const i = E.HOLE_QR.findIndex(([a, b]) => a === q && b === r);
  if (i < 0) throw new Error(`kein Loch (${q}, ${r})`);
  return i;
};
const deepFreeze = o => {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};
const dest = m => m.path[m.path.length - 1];
const pdist = (a, b) => Math.hypot(E.HOLES[a].x - E.HOLES[b].x, E.HOLES[a].y - E.HOLES[b].y);
// Füllsteine weit weg vom Geschehen (Zacken, die in der Stellung sonst keine Rolle spielen)
const filler = (camp, k = 10) => E.CAMP[camp].slice(0, k);

// ---------- Geometrie ----------

test('Geometrie: 121 Löcher, Reihen, Mitte, Hexagon 61, 6 disjunkte Zacken à 10', () => {
  assert.equal(E.HOLES.length, 121);
  const rows = new Map();
  for (const p of E.HOLES) rows.set(p.y, (rows.get(p.y) || 0) + 1);
  assert.deepEqual([...rows.values()], [1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1]);
  assert.deepEqual([...rows.keys()], [...rows.keys()].slice().sort((a, b) => a - b), 'Reihen oben → unten');
  assert.equal(E.CENTER, 60);
  assert.deepEqual({ ...E.HOLES[60] }, { x: 0, y: 0 });
  assert.equal(E.CAMP_OF.filter(c => c === -1).length, 61, 'Mittel-Sechseck');
  const all = new Set();
  for (let k = 0; k < 6; k++) {
    assert.equal(E.CAMP[k].length, 10);
    for (const h of E.CAMP[k]) {
      assert.ok(!all.has(h), `Loch ${h} in zwei Zacken`);
      all.add(h);
      assert.equal(E.CAMP_OF[h], k);
    }
    assert.equal(E.CAMP[k][0], E.TIPS[k], 'Spitze zuerst');
    assert.deepEqual(E.CAMP[k].map(h => E.hexDistance(h, E.TIPS[k])), [0, 1, 1, 2, 2, 2, 3, 3, 3, 3]);
    assert.equal(E.OPPOSITE[k], (k + 3) % 6);
  }
  assert.equal(all.size, 60);
  // Ausdehnung und Lage der Zacken (0 unten, dann im Uhrzeigersinn)
  const xs = E.HOLES.map(p => p.x), ys = E.HOLES.map(p => p.y);
  assert.equal(Math.min(...xs), E.EXTENT.minX);
  assert.equal(Math.max(...xs), E.EXTENT.maxX);
  assert.equal(Math.min(...ys), E.EXTENT.minY);
  assert.equal(Math.max(...ys), E.EXTENT.maxY);
  assert.ok(Math.abs(E.EXTENT.maxY - 4 * Math.sqrt(3)) < 1e-12);
  const tip = E.TIPS.map(t => E.HOLES[t]);
  const ang = tip.map(p => Math.round(Math.atan2(p.y, p.x) * 180 / Math.PI));
  assert.deepEqual(ang, [90, 150, -150, -90, -30, 30], 'unten, links unten, links oben, oben, rechts oben, rechts unten');
  assert.ok(Object.isFrozen(E.HOLES) && Object.isFrozen(E.HOLES[0]) && Object.isFrozen(E.CAMP[0]) && Object.isFrozen(E.NEIGHBORS[0]));
});

test('Geometrie: Nachbarschaft symmetrisch, Abstand 1, Sprünge geradlinig, keine Löcher näher als 1', () => {
  let edges = 0;
  for (let i = 0; i < 121; i++) {
    assert.equal(E.NEIGHBORS[i].length, 6);
    for (let d = 0; d < 6; d++) {
      const j = E.NEIGHBORS[i][d];
      if (j < 0) continue;
      edges++;
      assert.equal(E.NEIGHBORS[j][(d + 3) % 6], i, `Kante ${i}-${j} nicht symmetrisch`);
      assert.ok(Math.abs(pdist(i, j) - 1) < 1e-9);
      const l = E.JUMPS[i][d];
      if (l >= 0) {
        assert.equal(E.NEIGHBORS[j][d], l);
        assert.ok(Math.abs(pdist(i, l) - 2) < 1e-9);
      }
    }
    for (let j = i + 1; j < 121; j++) {
      const dd = pdist(i, j);
      assert.ok(dd > 1 - 1e-9, 'Löcher zu nah');
      if (dd < 1 + 1e-9) assert.ok(E.NEIGHBORS[i].includes(j), `fehlende Kante ${i}-${j}`);
    }
  }
  for (const t of E.TIPS) assert.equal(E.NEIGHBORS[t].filter(x => x >= 0).length, 2, 'Spitze hat 2 Nachbarn');
  assert.equal(E.NEIGHBORS[60].filter(x => x >= 0).length, 6);
  return `${edges / 2} Kanten`;
});

test('Startstellung: je Sitz 10 Steine in CAMPS[n][i], Zielzacke gegenüber, Sitz 0 beginnt', () => {
  assert.deepEqual(E.CAMPS[2], [0, 3]);
  assert.deepEqual(E.CAMPS[3], [0, 2, 4]);
  assert.deepEqual(E.CAMPS[4], [0, 1, 3, 4]);
  assert.deepEqual(E.CAMPS[6], [0, 1, 2, 3, 4, 5]);
  for (const n of [2, 3, 4, 6]) {
    const s = E.initialState({ players: n });
    assert.equal(s.n, n);
    assert.equal(s.turn, 0);
    assert.equal(E.currentPlayer(s), 0);
    assert.deepEqual(s.moves, Array(n).fill(0));
    assert.deepEqual(E.countStones(s), Array(n).fill(10));
    for (let seat = 0; seat < n; seat++) {
      for (const h of E.CAMP[E.CAMPS[n][seat]]) assert.equal(s.board[h], seat);
      assert.equal(E.targetCamp(n, seat), (E.CAMPS[n][seat] + 3) % 6);
    }
    assert.equal(E.result(s), null, 'volle, fremde Zielzacke ist kein Sieg');
    assert.ok(E.legalMoves(s).length > 0);
  }
  assert.deepEqual(E.normalizeOptions({ players: 6 }), { players: 6 });
  assert.deepEqual(E.normalizeOptions({ players: '4' }), { players: 4 });
  assert.deepEqual(E.normalizeOptions({ players: 5 }), { players: 2 });
  assert.deepEqual(E.normalizeOptions(), { players: 2 });
  assert.equal(E.initialState().n, 2);
  assert.equal(E.PLAYERS.length, 6);
});

test('Startzüge 2 Spieler: Schritte und Sprünge der vorderen Reihe', () => {
  const s = E.initialState();
  const ms = E.legalMoves(s);
  assert.ok(ms.every(m => E.isLegal(s, m)));
  const keys = new Set(ms.map(m => `${m.from}>${dest(m)}`));
  assert.equal(keys.size, ms.length, 'je (from, Ziel) nur ein Zug');
  // Nur vordere Reihe (4 Steine) kann schreiten; Sprünge aus der 2. Reihe über die vordere
  const steps = ms.filter(m => m.path.length === 1 && E.NEIGHBORS[m.from].includes(m.path[0]));
  assert.equal(steps.length, 8, "4 Steine vorne × 2 Felder");
  return `${ms.length} Züge`;
});

// ---------- Sprungketten ----------

// Parallelogramm aus Sprüngen um den eigenen Stein auf der Mitte:
// (0,0) → (2,0) über (1,0), → (2,2) über (2,1), → (0,2) über (1,2); (0,2) → (0,0) über (0,1)
const C = H(0, 0), A = H(2, 0), B = H(2, 2), D = H(0, 2);
function ring() {
  return E.setup({
    players: 2,
    pieces: [
      [C, ...filler(0, 9)],
      [H(1, 0), H(2, 1), H(1, 2), H(0, 1), ...filler(3, 6)]
    ]
  });
}

test('Sprungkette mit Richtungswechsel über fremde Steine, kürzester Pfad in legalMoves', () => {
  const s = ring();
  const mine = E.legalMoves(s).filter(m => m.from === C);
  const toD = mine.filter(m => dest(m) === D);
  assert.equal(toD.length, 1);
  assert.deepEqual(toD[0].path, [D], 'kürzester Weg: direkt über (0,1)');
  const toB = mine.find(m => dest(m) === B);
  assert.equal(toB.path.length, 2);
  assert.ok(E.isLegal(s, { from: C, path: [A, B, D] }), 'längere gültige Kette');
  assert.ok(E.isLegal(s, { from: C, path: [D, B, A] }), 'andersherum');
  assert.ok(E.isLegal(s, { from: C, path: [A, B] }));
  assert.equal(E.describeMove(s, { from: C, path: [A, B, D] }), `springt 3× (61 → ${A + 1} → ${B + 1} → ${D + 1})`);
  assert.equal(E.describeMove(s, { from: C, path: [A] }), `springt 61 → ${A + 1}`);
  const n = E.applyMove(s, { from: C, path: [A, B, D] });
  assert.equal(n.board[C], -1);
  assert.equal(n.board[D], 0);
  assert.deepEqual(n.last, { seat: 0, from: C, path: [A, B, D] });
  assert.equal(n.turn, 1);
  assert.deepEqual(n.moves, [1, 0]);
});

test('Keine Schleifen: Startloch und Löcher nicht zweimal, kein Sprung über Leeres', () => {
  const s = ring();
  assert.ok(!E.isLegal(s, { from: C, path: [A, B, D, C] }), 'zurück aufs Startloch');
  assert.ok(!E.isLegal(s, { from: C, path: [A, B, D, B] }), 'Loch zweimal');
  assert.ok(!E.isLegal(s, { from: C, path: [A, A] }));
  assert.ok(!E.isLegal(s, { from: C, path: [H(-2, 0)] }), 'über leeres Loch');
  assert.ok(!E.isLegal(s, { from: C, path: [H(1, 0)] }), 'auf besetztes Nachbarloch');
  assert.ok(!E.isLegal(s, { from: C, path: [H(4, 0)] }), 'zu weit');
  assert.ok(!E.isLegal(s, { from: C, path: [] }));
  // jumpTargets folgt der Kette und schließt Besuchtes aus
  assert.deepEqual(E.jumpTargets(s, C).sort((a, b) => a - b), [A, D].sort((a, b) => a - b));
  assert.deepEqual(E.jumpTargets(s, C, [A]), [B]);
  assert.deepEqual(E.jumpTargets(s, C, [A, B]), [D]);
  assert.deepEqual(E.jumpTargets(s, C, [A, B, D]), [], 'Start zählt als besucht');
  assert.deepEqual(E.jumpTargets(s, C, [B]), [], 'ungültige Vorkette');
});

test('Schritt und Sprung nicht mischbar', () => {
  const s = ring();
  const W = H(-1, 0);   // freies Nachbarloch
  assert.ok(E.stepTargets(s, C).includes(W));
  assert.ok(E.isLegal(s, { from: C, path: [W] }));
  assert.equal(E.describeMove(s, { from: C, path: [W] }), `zieht 61 → ${W + 1}`);
  // Nach einem Schritt kein Sprung: von W über (0,0)? (0,0) ist nach dem Wegziehen leer; über (-1,1)…
  const s2 = E.setup({ players: 2, pieces: [[C, ...filler(0, 9)], [H(-1, 1), H(1, 0), ...filler(3, 8)]] });
  assert.ok(E.isLegal(s2, { from: C, path: [W] }));
  assert.ok(E.isLegal(s2, { from: C, path: [A] }), 'Sprung über (1,0)');
  assert.ok(!E.isLegal(s2, { from: C, path: [W, H(-1, 2)] }), 'Schritt + Sprung');
  assert.ok(!E.isLegal(s2, { from: C, path: [A, H(3, 0)] }), 'Sprung + Schritt');
  assert.deepEqual(E.jumpTargets(s2, C, [W]), [], 'nach Schritt keine Sprungziele');
  assert.deepEqual(E.stepTargets(s2, H(1, 0)), [], 'fremder Stein');
});

test('Sprung über eigene und fremde Steine gleichermaßen, eigener Startstein zählt nicht als Brücke', () => {
  for (const owner of [0, 1]) {
    const pieces = [[C, ...filler(0, 8)], [...filler(3, 9)]];
    pieces[owner].push(H(1, 0));
    const s = E.setup({ players: 2, pieces });
    assert.ok(E.isLegal(s, { from: C, path: [A] }), `über Sitz ${owner}`);
  }
  // Rückweg über das eigene (geräumte) Startloch geht nicht: A → C wäre Sprung über (1,0) auf C (besucht)
  const s = ring();
  assert.ok(!E.jumpTargets(s, C, [A]).includes(C));
});

test('isLegal wirft nie und lehnt Müll ab; applyMove wirft bei illegal, verändert nichts', () => {
  const s = deepFreeze(ring());
  const evil = {};
  Object.defineProperty(evil, 'from', { enumerable: true, get() { throw new Error('böse'); } });
  const junk = [null, undefined, 42, 'x', [], {}, { from: C }, { path: [A] }, { from: C, path: 'A' },
    { from: C, path: [1.5] }, { from: C, path: [-1] }, { from: C, path: [121] }, { from: C, path: [A], x: 1 },
    { from: C, path: [A], pass: true }, { pass: true }, { pass: 1 }, { from: H(1, 0), path: [H(3, 0)] },
    { from: 999, path: [A] }, { from: '60', path: [A] }, { from: C, path: [String(A)] }, evil,
    { from: C, path: new Array(200).fill(A) }];
  for (const m of junk) {
    assert.equal(E.isLegal(s, m), false, String(junk.indexOf(m)));
    assert.throws(() => E.applyMove(s, m));
  }
  for (const bad of [null, undefined, {}, { n: 2 }, { ...s, board: [] }, { ...s, turn: 5 }, 7]) {
    assert.equal(E.isLegal(bad, { from: C, path: [A] }), false);
  }
  assert.deepEqual(E.stepTargets(null, C), []);
  assert.deepEqual(E.jumpTargets(s, C, 'x'), []);
  const n = E.applyMove(s, { from: C, path: [A] });   // eingefroren: würde bei Schreibversuch werfen
  assert.equal(n.board[A], 0);
  assert.equal(s.board[A], -1);
});

// ---------- Sieg, Blockade, Zuglimit, Aussetzen ----------

test('Sieg: alle 10 Steine im Ziel beendet die Partie sofort', () => {
  const camp3 = E.CAMP[3];   // Ziel von Sitz 0 (2 Spieler)
  const hole = camp3[9], outside = E.NEIGHBORS[hole].find(x => x >= 0 && E.CAMP_OF[x] === -1);
  const s = E.setup({ players: 2, pieces: [[...camp3.slice(0, 9), outside], filler(1)] });
  assert.equal(E.result(s), null);
  assert.ok(E.distance(s, 0) === 1);
  const n = E.applyMove(s, { from: outside, path: [hole] });
  assert.deepEqual(E.result(n), { winner: 0, reason: 'alle Steine im Ziel' });
  assert.equal(E.distance(n, 0), 0);
  assert.equal(E.currentPlayer(n), null);
  assert.deepEqual(E.legalMoves(n), []);
  assert.equal(E.isLegal(n, E.legalMoves(s)[0]), false);
  // Mehr Spieler: wer zuerst fertig ist, gewinnt – auch wenn andere noch unterwegs sind
  const s6 = E.setup({ players: 6, turn: 3, pieces: [[], [], [], [...E.CAMP[0].slice(0, 9), E.NEIGHBORS[E.CAMP[0][9]].find(x => x >= 0 && E.CAMP_OF[x] === -1)]] });
  const m6 = E.legalMoves(s6).find(m => dest(m) === E.CAMP[0][9]);
  assert.deepEqual(E.result(E.applyMove(s6, m6)), { winner: 3, reason: E.REASON_HOME });
});

test('Blockade-Regel: volle Zielzacke mit mindestens einem eigenen Stein gewinnt', () => {
  const camp3 = E.CAMP[3];
  const hole = camp3[9], outside = E.NEIGHBORS[hole].find(x => x >= 0 && E.CAMP_OF[x] === -1);
  // Sitz 1 lässt einen Stein auf der Spitze stehen (Spoiling)
  const s = E.setup({ players: 2, pieces: [[...camp3.slice(1, 9), outside, H(0, 0)], [camp3[0], ...filler(1, 9)]] });
  assert.equal(E.result(s), null);
  const n = E.applyMove(s, { from: outside, path: [hole] });
  assert.deepEqual(E.result(n), { winner: 0, reason: E.REASON_BLOCK });
  assert.ok(E.distance(n, 0) > 0, 'Restweg ist nicht 0, trotzdem Sieg');
  // Voll, aber kein eigener Stein → kein Sieg (4 Spieler: Ziel von Sitz 0 ist Zacke 3 = Start von Sitz 2)
  const s4 = E.setup({ players: 4, turn: 1, pieces: [[H(0, 0)], [...camp3.slice(5, 9), outside], [...camp3.slice(0, 5)], []] });
  const n4 = E.applyMove(s4, { from: outside, path: [hole] });
  assert.equal(E.result(n4), null, 'nur fremde Steine');
  // Mit einem eigenen Stein unter lauter fremden: Sieg auch dann, wenn ein anderer die Lücke füllt
  const s4b = E.setup({ players: 4, turn: 1, pieces: [[camp3[0]], [...camp3.slice(5, 9), outside], [...camp3.slice(1, 5)], []] });
  const n4b = E.applyMove(s4b, { from: outside, path: [hole] });
  assert.deepEqual(E.result(n4b), { winner: 0, reason: E.REASON_BLOCK });
  assert.ok(E.BLOCK_RULE_TEXT.length > 20 && E.BLOCK_RULE_TEXT.length < 300);
});

test('Zuglimit: nach 200 Zügen je Spieler gewinnt der kürzeste Restweg, Gleichstand → niemand', () => {
  const base = E.initialState();
  const s = E.setup({ players: 2, pieces: [[...E.CAMP[0]], [...E.CAMP[3]]], moves: [199, 199] });
  assert.equal(s.ply, 398);
  const m0 = E.legalMoves(s)[0];
  // Sitz 0 ist mit einem Stein auf der Mitte weiter (Restweg 112 statt 120) → gewinnt am Limit
  const a = E.setup({ players: 2, pieces: [[...E.CAMP[0].slice(1), H(0, 0)], [...E.CAMP[3]]], moves: [199, 199] });
  const a1 = E.applyMove(a, E.legalMoves(a)[0]);
  assert.equal(E.result(a1), null, 'Sitz 1 hat erst 199 Züge');
  const s2 = E.applyMove(a1, E.legalMoves(a1)[0]);
  assert.ok(E.distance(s2, 0) < E.distance(s2, 1));
  assert.deepEqual(E.result(s2), { winner: 0, reason: 'Zuglimit – kürzester Restweg' });
  assert.equal(E.currentPlayer(s2), null);
  assert.deepEqual(E.legalMoves(s2), []);
  // Punktsymmetrischer Zug (q, r) → (−q, −r): gleicher Restweg → Unentschieden
  const mirror = h => H(-E.HOLE_QR[h][0], -E.HOLE_QR[h][1]);
  const t1 = E.applyMove(s, m0);
  const t2 = E.applyMove(t1, { from: mirror(m0.from), path: m0.path.map(mirror) });
  assert.equal(E.distance(t2, 0), E.distance(t2, 1));
  assert.deepEqual(E.result(t2), { winner: null, reason: E.REASON_LIMIT });
  assert.equal(base.moves[0], 0);
});

test('Aussetzen: ohne legalen Zug ist {pass:true} der einzige Zug', () => {
  // 4 Spieler: Sitz 2 (Zacke 3, oben) hat nur einen Stein auf der Spitze, rundum zugestellt
  const tip = E.TIPS[3];
  const s = E.setup({
    players: 4, turn: 2,
    pieces: [[H(4, -7), H(3, -7)], [H(4, -6), H(2, -6)], [tip], []]
  });
  assert.equal(E.currentPlayer(s), 2);
  assert.deepEqual(E.legalMoves(s), [{ pass: true }]);
  assert.ok(E.isLegal(s, { pass: true }));
  assert.ok(!E.isLegal(s, { pass: true, from: tip }));
  assert.ok(!E.isLegal(s, { from: tip, path: [H(4, -7)] }));
  assert.equal(E.describeMove(s, { pass: true }), 'setzt aus');
  const n = E.applyMove(s, { pass: true });
  assert.equal(n.turn, 3);
  assert.deepEqual(n.moves, [0, 0, 1, 0]);
  assert.deepEqual(n.last, { seat: 2, pass: true });
  assert.deepEqual(n.board, s.board);
  assert.equal(chooseMove(s, { level: 2 }).pass, true);
  // Mit Zügen ist Aussetzen verboten
  assert.ok(!E.isLegal(E.initialState(), { pass: true }));
});

// ---------- evaluate / distance / Sonstiges ----------

test('evaluate: Start 0, Vorzeichen, Summe 0 bei 2 Spielern', () => {
  for (const n of [2, 3, 4, 6]) {
    const s = E.initialState({ players: n });
    for (let seat = 0; seat < n; seat++) {
      assert.equal(E.evaluate(s, seat), 0);
      assert.equal(E.distance(s, seat), E.distance(s, 0));
    }
  }
  let s = E.initialState();
  const jump = E.legalMoves(s).find(m => m.path.length === 1 && !E.NEIGHBORS[m.from].includes(m.path[0]) &&
    E.DIST[3][dest(m)] < E.DIST[3][m.from]);
  s = E.applyMove(s, jump);
  assert.ok(E.evaluate(s, 0) > 0 && E.evaluate(s, 1) < 0);
  assert.equal(E.evaluate(s, 0), 2, 'Sprung nach vorn = 2 Felder');
  const rng = mulberry32(7);
  for (let i = 0; i < 300; i++) {
    s = E.applyMove(s, pick(rng, E.legalMoves(s)));
    assert.equal(E.evaluate(s, 0) + E.evaluate(s, 1), 0);
    assert.equal(E.evaluate(s, 0), E.distance(s, 1) - E.distance(s, 0));
  }
  // Restweg-Metrik: jeder Schritt auf die Spitze zu senkt ihn um genau 1
  assert.equal(E.distance(E.initialState(), 0), 120);
});

test('positionKey, describeMove, Unveränderlichkeit bei Zufallspartien', () => {
  const s = E.initialState({ players: 3 });
  assert.equal(E.positionKey(s).length, 2 + 121 + 2);
  assert.ok(E.positionKey(s).startsWith('3:'));
  const rng = mulberry32(11);
  let st = deepFreeze(s);
  const seen = new Set([E.positionKey(st)]);
  for (let i = 0; i < 60; i++) {
    const m = pick(rng, E.legalMoves(st));
    assert.ok(/^(zieht|springt) /.test(E.describeMove(st, m)));
    st = deepFreeze(E.applyMove(st, m));
    seen.add(E.positionKey(st));
  }
  assert.ok(seen.size > 50);
  assert.equal(E.describeMove(s, null), '?');
});

// ---------- Bot ----------

test('Bot: jede Stufe liefert legalen Zug, gleicher Seed → gleicher Zug', () => {
  for (const n of [2, 3, 4, 6]) {
    const rng = mulberry32(n);
    let s = E.initialState({ players: n });
    for (let i = 0; i < 30; i++) s = E.applyMove(s, pick(rng, E.legalMoves(s)));
    for (const level of [1, 2, 3]) {
      const m = chooseMove(s, { level, rng: mulberry32(5), timeMs: 50 });
      assert.ok(E.isLegal(s, m), `Stufe ${level}`);
      assert.deepEqual(chooseMove(s, { level, rng: mulberry32(5), timeMs: 50 }), m);
    }
  }
});

test('Bot: Stufe 2 nimmt den Siegzug und füllt das Endspiel sauber auf', () => {
  const camp3 = E.CAMP[3];
  const hole = camp3[9], outside = E.NEIGHBORS[hole].find(x => x >= 0 && E.CAMP_OF[x] === -1);
  const s = E.setup({ players: 2, pieces: [[...camp3.slice(0, 9), outside], filler(1)] });
  for (const level of [2, 3]) assert.deepEqual(E.result(E.applyMove(s, chooseMove(s, { level, rng: mulberry32(1) }))).winner, 0);
  // Endspiel: Spitze und zweite Reihe leer, Steine vorne und außerhalb → Bot füllt in wenigen Zügen auf
  let st = E.setup({ players: 2, pieces: [[...camp3.slice(6), H(1, -4), H(2, -4), H(0, -3), H(3, -3), H(1, -2), H(0, 0)], filler(1)] });
  let plies = 0;
  while (!E.result(st) && plies < 200) {
    st = E.applyMove(st, st.turn === 0 ? chooseMove(st, { level: 2, rng: mulberry32(plies) }) : E.legalMoves(st)[0]);
    plies++;
  }
  assert.deepEqual(E.result(st), { winner: 0, reason: E.REASON_HOME });
  return `${Math.ceil(plies / 2)} Züge`;
});

test('Bot: Stufe 1 bevorzugt Fortschritt, ganze Partien Stufe 2 enden mit echtem Sieg', () => {
  const s = E.initialState();
  for (let i = 0; i < 20; i++) {
    const m = chooseMove(s, { level: 1, rng: mulberry32(i) });
    assert.ok(E.DIST[3][dest(m)] < E.DIST[3][m.from]);
  }
  const out = [];
  for (const n of [2, 3, 4, 6]) {
    const rng = mulberry32(100 + n);
    let st = E.initialState({ players: n });
    while (!E.result(st)) st = E.applyMove(st, chooseMove(st, { level: 2, rng }));
    assert.notEqual(E.result(st).reason, E.REASON_LIMIT);
    out.push(`${n}er: ${Math.ceil(st.ply / n)} Züge`);
  }
  return out.join(', ');
});

console.log(`\n${passed} ✅, ${failed} ❌ (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(failed ? 1 : 0);

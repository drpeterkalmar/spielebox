// Regeltests Reversi: echte Stellungen per setup, je Fall Regel und Quelle im Namen.
// Quellen: World Othello Federation „Official Rules“ (WOF) und de.wikipedia „Othello (Spiel)“ (WP).
// Feldnamen: a1 = oben links, Reihe 1 oben (Othello-Konvention).
// Aufruf: node tests/node/reversi.test.mjs
import assert from 'node:assert/strict';
import * as R from '../../src/games/reversi/engine.js';
import { chooseMove } from '../../src/games/reversi/bot.js';
import { RULES } from '../../src/games/reversi/rules.js';
import { mulberry32 } from '../../src/rng.js';

const t0 = performance.now();
let ok = 0, bad = 0;
function test(name, fn) {
  try {
    const info = fn();
    ok++;
    console.log(`✅ ${name}${info ? ` (${info})` : ''}`);
  } catch (e) {
    bad++;
    console.log(`❌ ${name}\n   ${String((e && e.stack) || e).split('\n').slice(0, 5).join('\n   ')}`);
  }
}

const sq = (name) => {
  const i = R.squareIndex(name);
  if (i < 0) throw new Error(`unbekanntes Feld ${name}`);
  return i;
};
const names = (list) => list.map(R.squareName).sort();
const moveNames = (s) => R.legalMoves(s).map((m) => (m.pass ? 'pass' : R.squareName(m.i))).sort();
function illegal(s, move, why) {
  assert.equal(R.isLegal(s, move), false, `isLegal müsste false sein: ${why}`);
  assert.throws(() => R.applyMove(s, move), Error, `applyMove müsste werfen: ${why}`);
}
// Zufallspartie bis zu einer Zahl leerer Felder (oder Ende)
function randomTo(seed, empties) {
  const rng = mulberry32(seed);
  let s = R.initialState();
  while (!s.over && s.board.filter((v) => v === null).length > empties) {
    const ms = R.legalMoves(s);
    s = R.applyMove(s, ms[Math.floor(rng() * ms.length)]);
  }
  return s;
}
// unabhängige Minimax-Referenz über die öffentliche API (Endstand: leere Felder für den Sieger)
function bruteForce(s, seat) {
  if (s.over) {
    const [b, w] = R.counts(s), d = b - w, e = 64 - b - w, v = d > 0 ? d + e : d < 0 ? d - e : 0;
    return (seat === 0 ? v : -v) + 0;
  }
  const vals = R.legalMoves(s).map((m) => bruteForce(R.applyMove(s, m), seat));
  return s.turn === seat ? Math.max(...vals) : Math.min(...vals);
}

// ---------- Brett und Start ----------

test('Feldnamen: a1 oben links = 0, h1 = 7, a8 = 56, h8 = 63, Rundreise', () => {
  assert.equal(R.squareName(0), 'a1');
  assert.equal(R.squareName(7), 'h1');
  assert.equal(R.squareName(56), 'a8');
  assert.equal(R.squareName(63), 'h8');
  for (let i = 0; i < 64; i++) assert.equal(R.squareIndex(R.squareName(i)), i);
  assert.equal(R.squareName(64), '');
  assert.equal(R.squareIndex('i9'), -1);
});

test('Startaufstellung (WOF): Weiß d4/e5, Schwarz d5/e4, Schwarz beginnt, keine Optionen', () => {
  const s = R.initialState();
  assert.deepEqual(R.normalizeOptions({ egal: 1 }), {});
  assert.equal(s.board[sq('d4')], 1);
  assert.equal(s.board[sq('e5')], 1);
  assert.equal(s.board[sq('d5')], 0);
  assert.equal(s.board[sq('e4')], 0);
  assert.deepEqual(R.counts(s), [2, 2]);
  assert.equal(R.currentPlayer(s), 0);
  assert.deepEqual(R.PLAYERS, ['Schwarz', 'Weiß']);
  assert.equal(R.id, 'reversi');
  assert.equal(R.title, 'Reversi');
  assert.deepEqual({ ply: s.ply, passes: s.passes, last: s.last, over: s.over }, { ply: 0, passes: 0, last: null, over: null });
});

test('Eröffnung: Schwarz hat genau d3, c4, f5, e6 (WOF, symmetrisch)', () => {
  assert.deepEqual(moveNames(R.initialState()), ['c4', 'd3', 'e6', 'f5']);
});

test('Erster Zug f5 dreht e5 um; Weiß ist am Zug, last ist gefüllt', () => {
  const s = R.initialState();
  assert.deepEqual(names(R.flipsFor(s, sq('f5'))), ['e5']);
  const t = R.applyMove(s, { i: sq('f5') });
  assert.deepEqual(R.counts(t), [4, 1]);
  assert.equal(t.board[sq('e5')], 0);
  assert.equal(t.board[sq('f5')], 0);
  assert.equal(R.currentPlayer(t), 1);
  assert.deepEqual(t.last, { seat: 0, i: sq('f5'), flipped: [sq('e5')] });
  assert.equal(t.ply, 1);
  assert.deepEqual(moveNames(t), ['d6', 'f4', 'f6']);
});

// ---------- Einschließen und Umdrehen ----------

test('Mehrere Richtungen auf einmal (WP: „mehrere Reihen … alle umgedreht“), offene Linie zählt nicht', () => {
  const s = R.setup([
    '........',
    '........',
    '....x...',
    '....oo..',
    '..xo....',
    '.....o..',
    '......x.',
    '........',
  ]);
  // e5: senkrecht e4, waagerecht d5, schräg f6; f4 führt nur zum leeren g3 → bleibt weiß
  assert.deepEqual(names(R.flipsFor(s, sq('e5'))), ['d5', 'e4', 'f6']);
  const t = R.applyMove(s, { i: sq('e5') });
  assert.equal(t.board[sq('f4')], 1);
  assert.deepEqual(R.counts(t), [7, 1]);
});

test('Lücke unterbricht die Linie: über ein leeres Feld wird nicht eingeschlossen', () => {
  const s = R.setup([
    'x.oo....',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '.....xo.',
  ]);
  assert.deepEqual(R.flipsFor(s, sq('e1')), []);
  illegal(s, { i: sq('e1') }, 'e1 schließt wegen der Lücke b1 nichts ein');
  assert.deepEqual(moveNames(s), ['h8']);
});

test('Lange Linie: 6 Steine auf einmal, Umdrehen endet beim ersten eigenen Stein', () => {
  const s = R.setup(['........', '........', '........', 'xoooooo.', '........', '........', '........', '........']);
  assert.deepEqual(names(R.flipsFor(s, sq('h4'))), ['b4', 'c4', 'd4', 'e4', 'f4', 'g4']);
  const u = R.setup(['.oxox...', '........', '........', '........', '........', '........', '........', '........']);
  assert.deepEqual(names(R.flipsFor(u, sq('a1'))), ['b1']);
  const t = R.applyMove(u, { i: sq('a1') });
  assert.equal(t.board[sq('d1')], 1, 'd1 liegt hinter dem eigenen Stein c1 und bleibt weiß');
});

test('Kein Zug ohne Umdrehen (WOF: „outflank and flip at least one“), besetzte Felder verboten', () => {
  const s = R.initialState();
  illegal(s, { i: sq('c3') }, 'c3 schließt nichts ein');
  illegal(s, { i: sq('f4') }, 'f4 grenzt an Weiß, schließt aber nicht ein');
  illegal(s, { i: sq('d4') }, 'besetzt');
  illegal(s, { i: sq('a1') }, 'weit weg');
  assert.deepEqual(R.flipsFor(s, sq('d4')), []);
});

// ---------- Passen und Ende ----------

test('Passen nur ohne Zug (WOF/WP): dann ist { pass: true } der einzige Zug, Ende wenn keiner mehr kann', () => {
  const s = R.setup(['ox......', '........', '........', '........', '........', '........', '........', '........']);
  assert.equal(s.over, null);
  assert.deepEqual(R.legalMoves(s), [{ pass: true }]);
  illegal(s, { i: sq('c1') }, 'Schwarz kann c1 nicht nutzen');
  assert.equal(R.describeMove(s, { pass: true }), 'passt');
  const t = R.applyMove(s, { pass: true });
  assert.equal(t.turn, 1);
  assert.equal(t.passes, 1);
  assert.deepEqual(t.last, { seat: 0, i: null, flipped: [] });
  illegal(t, { pass: true }, 'Weiß hat einen Zug, darf nicht passen');
  assert.deepEqual(moveNames(t), ['c1']);
  const u = R.applyMove(t, { i: sq('c1') });
  assert.equal(u.passes, 0);
  // Schwarz hat keinen Stein mehr, Weiß kann nicht setzen → vorbei, obwohl 61 Felder leer sind
  assert.deepEqual(R.result(u), { winner: 1, reason: 'mehr Steine (0:3)', score: [0, 3] });
  assert.equal(R.currentPlayer(u), null);
  assert.deepEqual(R.legalMoves(u), []);
  illegal(u, { pass: true }, 'Partie vorbei');
  assert.equal(R.evaluate(u, 1), 64, 'leere Felder zählen für den Sieger');
  assert.equal(R.evaluate(u, 0), -64);
});

test('Passen verboten, wenn ein Zug möglich ist (WOF: „you may not forfeit your turn“)', () => {
  illegal(R.initialState(), { pass: true }, 'Schwarz hat 4 Züge');
});

test('Volles Brett: Partie endet, mehr Steine gewinnt (WOF)', () => {
  const rows = ['xxxxxxxx', 'xxxxxxxx', 'xxxxxxxx', 'xxxxxxxx', 'xxxxxxxx', 'xxxxxxxx', 'oooooooo', 'ooooooo.'];
  const s = R.setup(rows);
  assert.deepEqual(moveNames(s), ['h8']);
  const t = R.applyMove(s, { i: sq('h8') });
  assert.deepEqual(names(t.last.flipped), ['g7', 'h7'], 'senkrecht h7 und schräg g7');
  assert.deepEqual(R.result(t), { winner: 0, reason: 'mehr Steine (51:13)', score: [51, 13] });
  assert.equal(R.evaluate(t, 0), 38);
});

test('Gleich viele Steine = Unentschieden (WP)', () => {
  const s = R.setup(['xxxxxxxx', 'oooooooo', 'xxxxxxxx', 'oooooooo', 'xxxxxxxx', 'oooooooo', 'xxxxxxxx', 'oooooooo']);
  assert.deepEqual(R.result(s), { winner: null, reason: 'gleich viele Steine (32:32)', score: [32, 32] });
  assert.equal(R.evaluate(s, 0), 0);
  assert.equal(R.evaluate(s, 1), 0);
});

test('Weiß zieht, Schwarz muss passen, Weiß zieht wieder (WOF: „opponent moves again“)', () => {
  const s = R.setup(['ox......', '........', '........', '........', '........', '........', '........', 'oxx.....'], 1);
  assert.deepEqual(moveNames(s), ['c1', 'd8']);
  const t = R.applyMove(s, { i: sq('c1') });
  assert.equal(t.over, null);
  assert.deepEqual(R.legalMoves(t), [{ pass: true }]);
  const u = R.applyMove(t, { pass: true });
  assert.equal(u.turn, 1);
  assert.deepEqual(moveNames(u), ['d8']);
  const v = R.applyMove(u, { i: sq('d8') });
  assert.deepEqual(names(v.last.flipped), ['b8', 'c8']);
  assert.deepEqual(R.result(v), { winner: 1, reason: 'mehr Steine (0:7)', score: [0, 7] });
  assert.equal(v.ply, 3);
});

// ---------- Robustheit, Anzeige ----------

test('isLegal lehnt Müll ab und wirft nie, applyMove wirft', () => {
  const s = R.initialState(), d3 = sq('d3');
  for (const m of [null, undefined, 7, 'd3', [], {}, { i: -1 }, { i: 64 }, { i: 1.5 }, { i: String(d3) }, { i: d3, x: 1 },
    { pass: false }, { pass: 1 }, { pass: true, i: d3 }, { i: NaN }, { type: 'play', i: d3 }]) {
    illegal(s, m, JSON.stringify(m) ?? String(m));
  }
  for (const bad of [null, {}, { board: [] }, { board: new Array(64).fill(2), turn: 0 }, { ...s, turn: 2 }]) {
    assert.equal(R.isLegal(bad, { i: d3 }), false);
    assert.deepEqual(R.legalMoves(bad), []);
    assert.throws(() => R.applyMove(bad, { i: d3 }));
  }
  assert.equal(R.isLegal(s, { i: d3 }), true);
});

test('applyMove verändert die Eingabe nicht, JSON-Rundreise gleich, positionKey trennt Zugrecht', () => {
  const s = R.initialState(), before = JSON.stringify(s);
  const t = R.applyMove(s, { i: sq('d3') });
  assert.equal(JSON.stringify(s), before);
  const t2 = JSON.parse(JSON.stringify(t));
  assert.deepEqual(R.legalMoves(t2), R.legalMoves(t));
  assert.equal(R.positionKey(t2), R.positionKey(t));
  assert.notEqual(R.positionKey(s), R.positionKey({ ...s, turn: 1 }));
  assert.equal(R.positionKey(s).length, 66);
});

test('describeMove: „f5, dreht 1 um“, „passt“, Müll → „?“', () => {
  const s = R.initialState();
  assert.equal(R.describeMove(s, { i: sq('f5') }), 'f5, dreht 1 um');
  assert.equal(R.describeMove(s, { pass: true }), 'passt');
  assert.equal(R.describeMove(s, { foo: 1 }), '?');
  const m = R.setup(['........', '........', '....x...', '....oo..', '..xo....', '.....o..', '......x.', '........']);
  assert.equal(R.describeMove(m, { i: sq('e5') }), 'e5, dreht 3 um');
});

test('rules.js: Titel, Quelle mit URL, kurze Sätze, keine Optionen', () => {
  assert.equal(RULES.title, 'Reversi');
  assert.match(RULES.source, /https:\/\/www\.worldothello\.org/);
  assert.match(RULES.source, /https:\/\/de\.wikipedia\.org/);
  assert.ok(RULES.items.length >= 8);
  assert.deepEqual(RULES.options, {});
  assert.ok(!/Othello/.test(RULES.items.join(' ')), 'kein Markenname in den Regeln');
});

// ---------- evaluate ----------

test('evaluate: Start 0, Summe 0, endlich und ≤ 150 ms über Zufallspartien', () => {
  const s0 = R.initialState();
  assert.ok(Object.is(R.evaluate(s0, 0), 0) && Object.is(R.evaluate(s0, 1), 0));
  let n = 0, maxMs = 0;
  for (let g = 0; g < 40; g++) {
    const rng = mulberry32(100 + g);
    let s = s0;
    while (!s.over) {
      const t = performance.now();
      const a = R.evaluate(s, 0), b = R.evaluate(s, 1);
      maxMs = Math.max(maxMs, performance.now() - t);
      assert.ok(Number.isFinite(a) && Math.abs(a) <= 64, `Bereich ${a}`);
      assert.equal(a + b, 0, 'Symmetrie');
      n++;
      const ms = R.legalMoves(s);
      s = R.applyMove(s, ms[Math.floor(rng() * ms.length)]);
    }
  }
  assert.ok(maxMs <= 150, `evaluate brauchte ${maxMs.toFixed(0)} ms`);
  return `${n} Stellungen, max ${maxMs.toFixed(1)} ms`;
});

test('evaluate: Vorzeichen – Ecken und Mehrheit sind gut für ihren Besitzer', () => {
  const s = R.setup(['x......x', '........', '........', '...ox...', '...xo...', '........', '........', 'x......x']);
  assert.ok(R.evaluate(s, 0) > 10, `Schwarz mit 4 Ecken: ${R.evaluate(s, 0)}`);
  assert.ok(R.evaluate(s, 1) < -10);
  const w = R.setup(['o......o', '........', '........', '...ox...', '...xo...', '........', '........', 'o......o']);
  assert.equal(R.evaluate(w, 1), R.evaluate(s, 0), 'Farbtausch = Spiegel');
});

test('evaluate im Endspiel (≤ 8 leer) = exakte Differenz bei bestem Spiel (Brute-Force-Gegenprobe)', () => {
  let n = 0;
  for (let seed = 1; n < 12 && seed < 200; seed++) {
    const s = randomTo(seed, 7);
    if (s.over) continue;
    assert.equal(R.evaluate(s, 0), bruteForce(s, 0), `Seed ${seed}`);
    assert.equal(R.evaluate(s, 1), bruteForce(s, 1), `Seed ${seed}`);
    n++;
  }
  return `${n} Stellungen`;
});

// ---------- Bot ----------

function match(levelA, levelB, games, timeMs, seed) {
  const r = { win: 0, draw: 0, loss: 0, disc: 0 };
  for (let g = 0; g < games; g++) {
    const ra = mulberry32(seed + g * 7919), rb = mulberry32(seed * 3 + g * 104729), aSide = g % 2;
    let s = R.initialState();
    while (!s.over) {
      const a = s.turn === aSide;
      const m = chooseMove(s, { level: a ? levelA : levelB, rng: a ? ra : rb, timeMs });
      assert.ok(R.isLegal(s, m), `Bot-Zug illegal: ${JSON.stringify(m)}`);
      s = R.applyMove(s, m);
    }
    const w = s.over.winner, sc = s.over.score;
    r.disc += aSide === 0 ? sc[0] - sc[1] : sc[1] - sc[0];
    if (w === null) r.draw++;
    else if (w === aSide) r.win++;
    else r.loss++;
  }
  return r;
}
const fmt = (r) => `${r.win} Siege, ${r.draw} Remis, ${r.loss} Niederlagen, Steine Ø ${(r.disc / (r.win + r.draw + r.loss)).toFixed(1)}`;

test('Bot: alle Stufen liefern legale Züge, beim Passen den Pass', () => {
  const p = R.setup(['ox......', '........', '........', '........', '........', '........', '........', '........']);
  for (const level of [1, 2, 3]) {
    assert.deepEqual(chooseMove(p, { level, rng: mulberry32(1), timeMs: 50 }), { pass: true });
    for (let seed = 1; seed <= 5; seed++) {
      const s = randomTo(seed * 13, 60 - seed * 9);
      if (s.over) continue;
      assert.ok(R.isLegal(s, chooseMove(s, { level, rng: mulberry32(seed), timeMs: 50 })));
    }
  }
  const full = R.setup(['xxxxxxxx', 'oooooooo', 'xxxxxxxx', 'oooooooo', 'xxxxxxxx', 'oooooooo', 'xxxxxxxx', 'oooooooo']);
  assert.equal(chooseMove(full, {}), null, 'Partie vorbei → kein Zug');
});

test('Bot Stufe 3: Zeitlimit (timeMs + 50 ms, Deckel 1,2 s) und exakt bestes Endspiel', () => {
  const s = randomTo(77, 40);
  let t = performance.now();
  assert.ok(R.isLegal(s, chooseMove(s, { level: 3, timeMs: 300, rng: mulberry32(2) })));
  const dt = performance.now() - t;
  assert.ok(dt <= 350, `Stufe 3 brauchte ${dt.toFixed(0)} ms`);
  t = performance.now();
  chooseMove(s, { level: 3, timeMs: 60000, rng: mulberry32(2) });
  const dt2 = performance.now() - t;
  assert.ok(dt2 <= 1250, `Deckel: ${dt2.toFixed(0)} ms`);
  // 9 leere Felder: der Bot-Zug muss so gut sein wie der beste (Bewertung danach exakt, ≤ 8 leer)
  let n = 0, maxMs = 0;
  for (let seed = 1; n < 6 && seed < 100; seed++) {
    const e = randomTo(seed * 31, 9);
    if (e.over || R.legalMoves(e)[0].pass) continue;
    const me = e.turn, vals = R.legalMoves(e).map((m) => R.evaluate(R.applyMove(e, m), me));
    const t1 = performance.now();
    const m = chooseMove(e, { level: 3, timeMs: 1000, rng: mulberry32(seed) });
    maxMs = Math.max(maxMs, performance.now() - t1);
    assert.equal(R.evaluate(R.applyMove(e, m), me), Math.max(...vals), `Seed ${seed}`);
    n++;
  }
  return `Mittelspiel ${dt.toFixed(0)} ms / Deckel ${dt2.toFixed(0)} ms, Endspiel ${n} Stellungen, max ${maxMs.toFixed(0)} ms`;
});

test('Bot Stufe 2 schlägt Stufe 1 (20 Partien, Farben abwechselnd, ≥ 80 %)', () => {
  const r = match(2, 1, 20, 400, 11);
  assert.ok(r.win >= 16, fmt(r));
  return fmt(r);
});

test('Bot Stufe 3 (80 ms) schlägt Stufe 1 fast immer (8 Partien, ≥ 7)', () => {
  const r = match(3, 1, 8, 80, 21);
  assert.ok(r.win >= 7, fmt(r));
  return fmt(r);
});

test('Bot Stufe 3 (80 ms) schlägt Stufe 2 klar (10 Partien, ≥ 7)', () => {
  const r = match(3, 2, 10, 80, 31);
  assert.ok(r.win >= 7, fmt(r));
  return fmt(r);
});

console.log(`\n${ok} bestanden, ${bad} fehlgeschlagen – Laufzeit ${(performance.now() - t0).toFixed(0)} ms`);
process.exit(bad ? 1 : 0);
